import { isDesktop } from "../../utils/PlatformUtils";

type AudioChannel = "microphone" | "speech";
export interface AudioVisualizationFrame {
  channel: AudioChannel;
  levels: number[];
}

type Listener = (frame: AudioVisualizationFrame) => void;

/** Audio envelopes only. Captured media stays with its existing recording/playback owner. */
class AudioVisualizationService {
  private listeners = new Set<Listener>();
  private channel: BroadcastChannel | null = null;
  private captures = new Map<AudioChannel, () => void>();

  private ensureChannel() {
    if (!isDesktop || this.channel || typeof BroadcastChannel === "undefined")
      return;
    this.channel = new BroadcastChannel("vassist-audio-visualization");
    this.channel.onmessage = ({ data }: MessageEvent<unknown>) => {
      if (!data || typeof data !== "object") return;
      const frame = data as AudioVisualizationFrame;
      if (
        (frame.channel !== "microphone" && frame.channel !== "speech") ||
        !Array.isArray(frame.levels) ||
        frame.levels.length !== 32 ||
        !frame.levels.every(
          (value) => Number.isFinite(value) && value >= 0 && value <= 1,
        )
      )
        return;
      for (const listener of this.listeners) listener(frame);
    };
  }

  private releaseChannel() {
    if (this.listeners.size || this.captures.size) return;
    this.channel?.close();
    this.channel = null;
  }

  subscribe(listener: Listener) {
    this.ensureChannel();
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      this.releaseChannel();
    };
  }

  private publish(channel: AudioChannel, levels: number[]) {
    const frame = { channel, levels };
    for (const listener of this.listeners) listener(frame);
    this.channel?.postMessage(frame);
  }

  monitorStream(channel: AudioChannel, stream: MediaStream): () => void {
    if (typeof AudioContext === "undefined") return () => {};
    let context: AudioContext | null = null;
    try {
      context = new AudioContext();
      const audioContext = context;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      void context.resume().catch(() => {});
      return this.monitorAnalyser(channel, analyser, () => {
        source.disconnect();
        analyser.disconnect();
        void audioContext.close().catch(() => {});
      });
    } catch {
      void context?.close().catch(() => {});
      // Visualization must never prevent recording or playback.
      return () => {};
    }
  }

  monitorFrames(channel: AudioChannel, cleanup = () => {}) {
    this.captures.get(channel)?.();
    this.ensureChannel();
    let stopped = false;
    const push = (samples: Float32Array) => {
      if (stopped || !samples.length) return;
      const levels = Array.from({ length: 32 }, (_, index) => {
        let sum = 0;
        const start = Math.floor((index * samples.length) / 32);
        const end = Math.floor(((index + 1) * samples.length) / 32);
        for (let i = start; i < end; i++) sum += (samples[i] ?? 0) ** 2;
        return Math.min(1, Math.sqrt(sum / Math.max(1, end - start)) * 5);
      });
      this.publish(channel, levels);
    };
    const stop = () => {
      if (stopped) return;
      stopped = true;
      cleanup();
      if (this.captures.get(channel) === stop) this.captures.delete(channel);
      this.publish(channel, Array(32).fill(0));
      this.updateDesktopActivity();
      this.releaseChannel();
    };
    this.captures.set(channel, stop);
    this.updateDesktopActivity();
    return { push, stop };
  }

  private updateDesktopActivity() {
    if (isDesktop && typeof window !== "undefined")
      window.electron?.ipc.send(
        "audio:visualizationActive",
        this.captures.size > 0,
      );
  }

  monitorAnalyser(
    channel: AudioChannel,
    analyser: AnalyserNode,
    cleanup = () => {},
  ): () => void {
    const samples = new Float32Array(analyser.fftSize);
    const monitor = this.monitorFrames(channel, () => {
      clearInterval(timer);
      cleanup();
    });
    const timer = setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      monitor.push(samples);
    }, 33);
    return monitor.stop;
  }

  monitorPlayback(audio: HTMLAudioElement, analyser?: AnalyserNode | null) {
    let stop: (() => void) | undefined;
    const start = () => {
      stop?.();
      if (analyser) stop = this.monitorAnalyser("speech", analyser);
      else {
        const capture = (
          audio as HTMLAudioElement & { captureStream?: () => MediaStream }
        ).captureStream;
        if (capture) {
          try {
            const stream = capture.call(audio);
            const stopCapture = this.monitorStream("speech", stream);
            stop = () => {
              stopCapture();
              stream.getTracks().forEach((track) => track.stop());
            };
          } catch {
            /* Playback stays independent. */
          }
        }
      }
    };
    const pause = () => {
      stop?.();
      stop = undefined;
    };
    const end = () => {
      pause();
      audio.removeEventListener("play", start);
      audio.removeEventListener("pause", pause);
      audio.removeEventListener("ended", end);
      audio.removeEventListener("error", end);
    };
    audio.addEventListener("play", start);
    audio.addEventListener("pause", pause);
    audio.addEventListener("ended", end);
    audio.addEventListener("error", end);
  }
}

export default new AudioVisualizationService();
