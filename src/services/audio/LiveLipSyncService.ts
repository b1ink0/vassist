import Logger from "../LoggerService";
import { isDesktop, isEmbed, isExtension } from "../../utils/PlatformUtils";
import type { HeadAudio } from "@met4citizen/headaudio/dist/headaudio.min.mjs";

const WORKLET_FILENAME = "headworklet.min.mjs";
const MODEL_FILENAME = "model-en-mixed.bin";
const OUTPUT_DELAY_SECONDS = 0.075;

const VISEME_NAMES = [
  "viseme_aa",
  "viseme_E",
  "viseme_I",
  "viseme_O",
  "viseme_U",
  "viseme_PP",
  "viseme_SS",
  "viseme_TH",
  "viseme_DD",
  "viseme_FF",
  "viseme_kk",
  "viseme_nn",
  "viseme_RR",
  "viseme_CH",
] as const;

export interface LiveLipSyncMouthWeights {
  a: number;
  i: number;
  u: number;
  e: number;
  o: number;
}

export interface LiveLipSyncAnimationTarget {
  setLiveLipSyncWeights(weights: LiveLipSyncMouthWeights | null): void;
  setGenericLipSyncAudio(audio: HTMLAudioElement | null): void;
}

type ActiveAudioGraph = {
  audio: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  meter: AnalyserNode;
  delay: DelayNode | null;
};

const clamp01 = (value: number): number =>
  Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

class LiveLipSyncService {
  private accurateLipSyncEnabled = false;
  private legacyLipSyncEnabled = false;
  private context: AudioContext | null = null;
  private analyzer: HeadAudio | null = null;
  private initialization: Promise<boolean> | null = null;
  private graph: ActiveAudioGraph | null = null;
  private target: LiveLipSyncAnimationTarget | null = null;
  private animationFrame: number | null = null;
  private lastFrameTime = 0;
  private meterSamples = new Float32Array(256);
  private speechLevel = 0;
  private readonly visemes = new Map<string, number>();
  private genericAudio: HTMLAudioElement | null = null;

  setAccurateLipSyncEnabled(enabled: boolean): void {
    this.accurateLipSyncEnabled = enabled;
  }

  setLegacyLipSyncEnabled(enabled: boolean): void {
    this.legacyLipSyncEnabled = enabled;
  }

  isAccurateLipSyncEnabled(): boolean {
    return this.accurateLipSyncEnabled;
  }

  isLegacyLipSyncEnabled(): boolean {
    return this.legacyLipSyncEnabled;
  }

  setAnimationTarget(target: LiveLipSyncAnimationTarget): void {
    if (this.target && this.target !== target) {
      this.target.setLiveLipSyncWeights(null);
    }
    this.target = target;
    if (this.graph) {
      this.pushWeights();
    } else if (this.genericAudio) {
      this.target.setGenericLipSyncAudio(this.genericAudio);
    }
  }

  clearAnimationTarget(target: LiveLipSyncAnimationTarget): void {
    if (this.target !== target) return;
    target.setLiveLipSyncWeights(null);
    target.setGenericLipSyncAudio(null);
    this.target = null;
  }

  async prepare(): Promise<boolean> {
    if (!this.accurateLipSyncEnabled || this.legacyLipSyncEnabled) return false;
    if (this.analyzer && this.context) return true;
    if (this.initialization) return this.initialization;

    this.initialization = this.initialize();
    const ready = await this.initialization;
    if (!ready) this.initialization = null;
    return ready;
  }

  private async initialize(): Promise<boolean> {
    if (
      typeof window === "undefined" ||
      typeof AudioContext === "undefined" ||
      typeof AudioWorkletNode === "undefined"
    ) {
      return false;
    }

    let context: AudioContext | null = null;
    try {
      context = new AudioContext();
      if (!context.audioWorklet) return false;

      const assetBase = await this.resolveAssetBasePath();
      await context.audioWorklet.addModule(`${assetBase}${WORKLET_FILENAME}`);
      const { HeadAudio: HeadAudioNode } =
        await import("@met4citizen/headaudio/dist/headaudio.min.mjs");
      const analyzer = new HeadAudioNode(context, {
        parameterData: {
          // The bundled model already contains trained silence prototypes.
          // Manual calibration would incorrectly classify the first TTS audio.
          silMode: 0,
        },
      });
      await analyzer.loadModel(`${assetBase}${MODEL_FILENAME}`);
      analyzer.onvalue = (viseme, value) => {
        this.visemes.set(viseme, clamp01(value));
      };
      analyzer.stop();

      this.context = context;
      this.analyzer = analyzer;
      Logger.log("LiveLipSync", "HeadAudio analyzer initialized");
      return true;
    } catch (error) {
      Logger.warn(
        "LiveLipSync",
        "Live analyzer unavailable; generated lip sync will be used",
        error,
      );
      if (context) void context.close().catch(() => undefined);
      this.context = null;
      this.analyzer = null;
      return false;
    }
  }

  async attach(audio: HTMLAudioElement): Promise<boolean> {
    if (!this.accurateLipSyncEnabled || this.legacyLipSyncEnabled) {
      this.attachGeneric(audio);
      return false;
    }

    if (!(await this.prepare()) || !this.context || !this.analyzer) {
      this.attachGeneric(audio);
      return false;
    }

    let source: MediaElementAudioSourceNode | null = null;
    let meter: AnalyserNode | null = null;
    let delay: DelayNode | null = null;
    try {
      if (this.context.state !== "running") {
        await this.context.resume();
      }
      if (this.context.state !== "running") {
        return false;
      }

      this.detach();
      source = this.context.createMediaElementSource(audio);
      meter = this.context.createAnalyser();
      meter.fftSize = 256;
      meter.smoothingTimeConstant = 0.25;
      delay = this.context.createDelay(1);
      delay.delayTime.value = OUTPUT_DELAY_SECONDS;

      source.connect(this.analyzer);
      source.connect(meter);
      meter.connect(delay);
      delay.connect(this.context.destination);

      this.graph = { audio, source, meter, delay };
      this.visemes.clear();
      this.speechLevel = 0;
      this.analyzer.resetAll();
      this.analyzer.start();
      this.startAnimationLoop();
      Logger.log("LiveLipSync", "Live TTS lip sync attached");
      return true;
    } catch (error) {
      Logger.warn(
        "LiveLipSync",
        "Could not attach live analyzer; audio will play without it",
        error,
      );
      // Once a media element has been wrapped, its normal direct output is
      // disabled. Preserve audible playback if a later graph connection fails.
      if (source && this.context) {
        try {
          source.disconnect();
          meter?.disconnect();
          delay?.disconnect();
          source.connect(this.context.destination);
          const fallbackMeter = meter ?? this.context.createAnalyser();
          this.graph = {
            audio,
            source,
            meter: fallbackMeter,
            delay: null,
          };
        } catch {
          this.graph = null;
        }
      }
      this.genericAudio = audio;
      this.target?.setGenericLipSyncAudio(audio);
      return false;
    }
  }

  private attachGeneric(audio: HTMLAudioElement): void {
    this.detach();
    this.genericAudio = audio;
    this.target?.setGenericLipSyncAudio(audio);
    Logger.log("LiveLipSync", "Generic BVMD mouth loop attached");
  }

  detach(audio?: HTMLAudioElement): void {
    if (audio && this.graph?.audio !== audio && this.genericAudio !== audio) {
      return;
    }

    if (!audio || this.genericAudio === audio) {
      this.genericAudio = null;
      this.target?.setGenericLipSyncAudio(null);
    }

    if (this.graph) {
      try {
        this.graph.source.disconnect();
        this.graph.meter.disconnect();
        this.graph.delay?.disconnect();
      } catch {
        // Nodes may already be disconnected during media teardown.
      }
      this.graph = null;
    }

    if (this.analyzer) {
      this.analyzer.stop();
    }
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    this.lastFrameTime = 0;
    this.speechLevel = 0;
    this.visemes.clear();
    this.target?.setLiveLipSyncWeights(null);
  }

  private startAnimationLoop(): void {
    if (this.animationFrame !== null) return;

    const update = (now: number) => {
      if (!this.graph || !this.analyzer) {
        this.animationFrame = null;
        return;
      }
      const delta = this.lastFrameTime
        ? Math.min(100, Math.max(0, now - this.lastFrameTime))
        : 16.67;
      this.lastFrameTime = now;
      this.analyzer.update(delta);
      this.updateSpeechLevel();
      this.pushWeights();
      this.animationFrame = requestAnimationFrame(update);
    };

    this.animationFrame = requestAnimationFrame(update);
  }

  private pushWeights(): void {
    if (!this.target) return;

    const value = (name: string) => this.visemes.get(name) ?? 0;
    const closure = clamp01(value("viseme_PP") / 0.75);
    const closureScale = 1 - 0.95 * closure;
    const raw = {
      a: clamp01(value("viseme_aa") / 0.65),
      i: clamp01(value("viseme_I") / 0.65),
      u: clamp01(value("viseme_U") / 0.65),
      e: clamp01(value("viseme_E") / 0.65),
      o: clamp01(value("viseme_O") / 0.65),
    };
    const confidence = Math.max(raw.a, raw.i, raw.u, raw.e, raw.o);
    const articulation = clamp01(0.25 + this.speechLevel * 1.15);
    const weights: LiveLipSyncMouthWeights = {
      a: raw.a * articulation * closureScale,
      i: raw.i * articulation * closureScale,
      u: raw.u * articulation * closureScale,
      e: raw.e * articulation * closureScale,
      o: raw.o * articulation * closureScale,
    };

    // PMX vowel morphs are shapes, not a jaw bone. Mix a modest A/open shape
    // from the clean TTS signal so consonants and uncertain classifications
    // still visibly open the mouth instead of showing only the I/teeth shape.
    const openEnvelope =
      this.speechLevel * closureScale * (0.62 - 0.28 * confidence);
    weights.a = Math.max(weights.a, openEnvelope);

    // Multiple PMX morphs are additive. Keep their combined deformation sane.
    const total = weights.a + weights.i + weights.u + weights.e + weights.o;
    if (total > 1.15) {
      const scale = 1.15 / total;
      weights.a *= scale;
      weights.i *= scale;
      weights.u *= scale;
      weights.e *= scale;
      weights.o *= scale;
    }

    this.target.setLiveLipSyncWeights(weights);
  }

  private updateSpeechLevel(): void {
    const meter = this.graph?.meter;
    if (!meter || !this.graph?.delay) return;

    if (this.meterSamples.length !== meter.fftSize) {
      this.meterSamples = new Float32Array(meter.fftSize);
    }
    meter.getFloatTimeDomainData(this.meterSamples);
    let sumSquares = 0;
    for (const sample of this.meterSamples) {
      sumSquares += sample * sample;
    }
    const rms = Math.sqrt(sumSquares / this.meterSamples.length);
    const decibels = 20 * Math.log10(Math.max(rms, 0.00001));
    const target = clamp01((decibels + 50) / 32);
    const smoothing = target > this.speechLevel ? 0.42 : 0.16;
    this.speechLevel += (target - this.speechLevel) * smoothing;
  }

  private async resolveAssetBasePath(): Promise<string> {
    if (isExtension) {
      try {
        const { extensionBridge } = await import("../../utils/ExtensionBridge");
        const path = await extensionBridge.getResourceURL("assets/");
        return path.endsWith("/") ? path : `${path}/`;
      } catch (error) {
        Logger.warn(
          "LiveLipSync",
          "Could not resolve extension assets; using /assets/",
          error,
        );
      }
    }
    if (isDesktop) return "app://./assets/";
    // Package builds place runtime chunks next to a sibling assets directory.
    if (isEmbed) return new URL("../assets/", import.meta.url).toString();
    return "/assets/";
  }
}

export const liveLipSyncService = new LiveLipSyncService();
export default liveLipSyncService;
