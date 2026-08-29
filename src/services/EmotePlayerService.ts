/**
 * @fileoverview Emote Player Service
 */

import emoteStorageService from "./EmoteStorageService";
import Logger from "./LoggerService";

interface AnimationManagerLike {
  queueSimpleAnimation: (
    config: Record<string, unknown>,
    force?: boolean,
  ) => void;
  seekToProgress?: (progress: number) => void;
  pause?: () => void;
  resume?: () => void;
  getCurrentAnimationDurationFrames?: () => number;
  getCurrentAnimationProgress?: () => number;
}

interface BinaryLikeObject {
  data?: number[];
  type?: string;
  mimeType?: string;
}

class EmotePlayerService {
  private currentAudio: HTMLAudioElement | null;
  private currentAudioUrl: string | null;
  private currentMotionUrl: string | null;
  private currentCameraUrl: string | null;
  private animationManagerRef: AnimationManagerLike | null;
  private isPlaying: boolean;
  private currentEmoteId: string | null;
  private autoPlayActive: boolean;
  private shuffledQueue: string[];
  private playedEmotes: Set<string>;
  private autoPlayDelay: number;
  private delayedFinalizeTimeout: ReturnType<typeof setTimeout> | null;

  constructor() {
    this.currentAudio = null;
    this.currentAudioUrl = null;
    this.currentMotionUrl = null;
    this.currentCameraUrl = null;
    this.animationManagerRef = null;
    this.isPlaying = false;
    this.currentEmoteId = null;
    this.autoPlayActive = false;
    this.shuffledQueue = [];
    this.playedEmotes = new Set();
    this.autoPlayDelay = 1000; // 1 second delay between emotes
    this.delayedFinalizeTimeout = null;
  }

  private clearDelayedFinalizeTimeout(): void {
    if (this.delayedFinalizeTimeout) {
      clearTimeout(this.delayedFinalizeTimeout);
      this.delayedFinalizeTimeout = null;
    }
  }

  private getAudioDuration(): number {
    if (!this.currentAudio || !Number.isFinite(this.currentAudio.duration)) {
      return 0;
    }
    return Math.max(0, this.currentAudio.duration);
  }

  private getAudioCurrentTime(): number {
    if (!this.currentAudio || !Number.isFinite(this.currentAudio.currentTime)) {
      return 0;
    }
    return Math.max(0, this.currentAudio.currentTime);
  }

  private getAnimationDurationSeconds(): number {
    const durationFrames =
      this.animationManagerRef?.getCurrentAnimationDurationFrames?.() ?? 0;
    if (!Number.isFinite(durationFrames) || durationFrames <= 0) {
      return 0;
    }
    return Math.max(0, durationFrames / 30);
  }

  private getAnimationCurrentTimeSeconds(): number {
    const animDuration = this.getAnimationDurationSeconds();
    if (animDuration <= 0) {
      return 0;
    }

    const progress =
      this.animationManagerRef?.getCurrentAnimationProgress?.() ?? 0;
    if (!Number.isFinite(progress)) {
      return 0;
    }

    return Math.max(
      0,
      Math.min(animDuration, animDuration * Math.max(0, Math.min(1, progress))),
    );
  }

  private finalizePlayback(
    audioUrl: string,
    motionUrl: string,
    cameraUrl: string | null,
  ): void {
    this.clearDelayedFinalizeTimeout();
    this.cleanup(audioUrl, motionUrl, cameraUrl);

    if (this.autoPlayActive) {
      setTimeout(() => {
        this.playNextInQueue();
      }, this.autoPlayDelay);
    }
  }

  /**
   * Set animation manager reference
   * @param {AnimationManager} manager - Animation manager instance
   */
  setAnimationManager(manager: AnimationManagerLike): void {
    this.animationManagerRef = manager;
    Logger.log("EmotePlayer", "Animation manager connected");
  }

  /**
   * Play an emote (audio + animation synchronized)
   * @param {string} emoteId - Emote ID to play
   * @returns {Promise<void>}
   */
  async playEmote(emoteId: string): Promise<void> {
    try {
      if (this.isPlaying) {
        Logger.warn(
          "EmotePlayer",
          "Already playing an emote, stopping current",
        );
        this.stopEmote();
      }

      if (!this.animationManagerRef) {
        throw new Error(
          "Animation manager not set. Call setAnimationManager() first.",
        );
      }

      Logger.log("EmotePlayer", `Playing emote: ${emoteId}`);

      const emote = await emoteStorageService.getEmote(emoteId);
      if (!emote) {
        throw new Error(`Emote ${emoteId} not found`);
      }

      const audioBlob = this.toBlob(
        emote.audioData,
        emote.metadata?.audioMimeType || "audio/mpeg",
      );
      const motionBlob = this.toBlob(
        emote.motionData,
        "application/octet-stream",
      );
      const audioUrl = URL.createObjectURL(audioBlob);
      const motionUrl = URL.createObjectURL(motionBlob);
      this.currentAudioUrl = audioUrl;
      this.currentMotionUrl = motionUrl;

      // Create camera animation URL if camera data exists (optional)
      let cameraUrl: string | null = null;
      if (emote.cameraData) {
        const cameraBlob = this.toBlob(
          emote.cameraData,
          "application/octet-stream",
        );
        cameraUrl = URL.createObjectURL(cameraBlob);
        this.currentCameraUrl = cameraUrl;
        Logger.log(
          "EmotePlayer",
          `Camera animation loaded for emote: ${emote.name}`,
        );
      }

      const audio = new Audio(audioUrl);
      this.currentAudio = audio;
      this.isPlaying = true;
      this.currentEmoteId = emoteId;
      const animationManager = this.animationManagerRef;
      let animationQueued = false;

      audio.addEventListener("play", () => {
        if (animationQueued) {
          return;
        }
        animationQueued = true;

        Logger.log(
          "EmotePlayer",
          `Audio playing, triggering animation for emote: ${emote.name}`,
        );

        // Trigger animation when audio starts playing
        const emoteAnimConfig = {
          id: emoteId,
          name: emote.name,
          filePath: motionUrl,
          cameraFilePath: cameraUrl, // Optional camera animation
          isCustom: true,
          customMotionId: emoteId,
          loop: false,
          loopTransition: false,
          transitionFrames: 30,
          preserveRootBone: true,
          disableBlinking: true,
        };
        animationManager?.queueSimpleAnimation(emoteAnimConfig, true);
      });

      audio.addEventListener("ended", () => {
        Logger.log("EmotePlayer", "Emote audio ended");

        const audioDuration = this.getAudioDuration();
        const animationDuration = this.getAnimationDurationSeconds();
        const remainingSeconds = Math.max(0, animationDuration - audioDuration);

        if (remainingSeconds > 0.05) {
          this.clearDelayedFinalizeTimeout();
          this.delayedFinalizeTimeout = setTimeout(() => {
            this.finalizePlayback(audioUrl, motionUrl, cameraUrl);
          }, remainingSeconds * 1000);
          return;
        }

        this.finalizePlayback(audioUrl, motionUrl, cameraUrl);
      });

      audio.addEventListener("error", (error) => {
        Logger.error("EmotePlayer", "Audio playback error:", error);

        this.cleanup(audioUrl, motionUrl, cameraUrl);
      });

      await audio.play();
    } catch (error) {
      Logger.error("EmotePlayer", "Failed to play emote:", error);
      this.isPlaying = false;
      throw error;
    }
  }

  /**
   * Normalize storage payloads into Blob instances.
   * Extension mode may deserialize binary fields as arrays/typed arrays.
   * @param {Blob|ArrayBuffer|Uint8Array|Array|Object} value
   * @param {string} fallbackType
   * @returns {Blob}
   */
  toBlob(
    value: Blob | ArrayBuffer | Uint8Array | number[] | BinaryLikeObject,
    fallbackType = "application/octet-stream",
  ): Blob {
    if (value instanceof Blob) {
      return value;
    }

    if (value instanceof ArrayBuffer) {
      return new Blob([value], { type: fallbackType });
    }

    if (value instanceof Uint8Array) {
      const copied = new Uint8Array(value.byteLength);
      copied.set(value);
      return new Blob([copied.buffer], { type: fallbackType });
    }

    if (Array.isArray(value)) {
      return new Blob([new Uint8Array(value)], { type: fallbackType });
    }

    if (
      value &&
      typeof value === "object" &&
      Array.isArray((value as BinaryLikeObject).data)
    ) {
      const payload = value as BinaryLikeObject;
      const nestedType = payload.type || payload.mimeType || fallbackType;
      const copied = new Uint8Array(payload.data as number[]);
      return new Blob([copied.buffer], { type: nestedType });
    }

    throw new Error(
      "Invalid emote media payload: expected Blob, ArrayBuffer, Uint8Array, or byte array",
    );
  }

  /**
   * Stop currently playing emote
   */
  stopEmote(): void {
    this.clearDelayedFinalizeTimeout();
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }

    this.currentEmoteId = null;
    this.cleanup();
    this.isPlaying = false;
    Logger.log("EmotePlayer", "Emote stopped");
  }

  /**
   * Cleanup blob URLs and reset state
   * @param {string} audioUrl - Audio blob URL to revoke
   * @param {string} motionUrl - Motion blob URL to revoke
   * @param {string} cameraUrl - Optional camera blob URL to revoke
   */
  cleanup(
    audioUrl: string | null = null,
    motionUrl: string | null = null,
    cameraUrl: string | null = null,
  ): void {
    this.clearDelayedFinalizeTimeout();
    const finalAudioUrl = audioUrl ?? this.currentAudioUrl;
    const finalMotionUrl = motionUrl ?? this.currentMotionUrl;
    const finalCameraUrl = cameraUrl ?? this.currentCameraUrl;

    if (finalAudioUrl) URL.revokeObjectURL(finalAudioUrl);
    if (finalMotionUrl) URL.revokeObjectURL(finalMotionUrl);
    if (finalCameraUrl) URL.revokeObjectURL(finalCameraUrl);

    this.currentAudioUrl = null;
    this.currentMotionUrl = null;
    this.currentCameraUrl = null;
    this.currentAudio = null;
    this.isPlaying = false;
    this.currentEmoteId = null;
  }

  /**
   * Check if an emote is currently playing
   * @returns {boolean}
   */
  isEmotePlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Get currently playing emote ID
   * @returns {string|null}
   */
  getCurrentEmoteId(): string | null {
    return this.currentEmoteId;
  }

  /**
   * Get current playback duration in seconds
   */
  getPlaybackDuration(): number {
    const audioDuration = this.getAudioDuration();
    const animationDuration = this.getAnimationDurationSeconds();
    return Math.max(audioDuration, animationDuration);
  }

  /**
   * Get current playback time in seconds
   */
  getPlaybackCurrentTime(): number {
    const duration = this.getPlaybackDuration();
    if (duration <= 0) {
      return 0;
    }

    const audioTime = this.getAudioCurrentTime();
    const animationTime = this.getAnimationCurrentTimeSeconds();
    const timelineTime = Math.max(audioTime, animationTime);
    return Math.max(0, Math.min(duration, timelineTime));
  }

  /**
   * Get normalized playback progress (0 - 1)
   */
  getPlaybackProgress(): number {
    const duration = this.getPlaybackDuration();
    if (duration <= 0) {
      return 0;
    }
    return Math.min(1, Math.max(0, this.getPlaybackCurrentTime() / duration));
  }

  /**
   * Seek emote playback timeline to normalized progress (0 - 1)
   */
  seekToProgress(progress: number): void {
    const duration = this.getPlaybackDuration();
    if (duration <= 0) {
      return;
    }

    const clampedProgress = Math.max(0, Math.min(1, progress));
    const targetTime = duration * clampedProgress;

    if (this.currentAudio) {
      const audioDuration = this.getAudioDuration();
      const targetAudioTime = Math.min(targetTime, audioDuration || targetTime);
      this.currentAudio.currentTime = targetAudioTime;
    }

    const animationDuration = this.getAnimationDurationSeconds();
    const animationProgress =
      animationDuration > 0
        ? Math.max(0, Math.min(1, targetTime / animationDuration))
        : clampedProgress;

    this.animationManagerRef?.seekToProgress?.(animationProgress);
  }

  /**
   * Pause emote playback for scrubbing
   */
  pausePlayback(): void {
    if (!this.currentAudio) {
      return;
    }
    this.currentAudio.pause();
    this.animationManagerRef?.pause?.();
  }

  /**
   * Resume emote playback after scrubbing
   */
  resumePlayback(): void {
    if (!this.currentAudio) {
      return;
    }
    this.animationManagerRef?.resume?.();
    this.currentAudio.play().catch((error) => {
      Logger.warn("EmotePlayer", "Resume playback blocked:", error);
    });
  }

  /**
   * Check whether current emote playback is paused
   */
  isPlaybackPaused(): boolean {
    if (!this.currentAudio || !this.isPlaying) {
      return false;
    }
    return this.currentAudio.paused;
  }

  /**
   * Toggle paused/resumed playback state
   */
  togglePlayback(): void {
    if (this.isPlaybackPaused()) {
      this.resumePlayback();
    } else {
      this.pausePlayback();
    }
  }

  /**
   * Shuffle array using Fisher-Yates algorithm
   * @param {Array} array - Array to shuffle
   * @returns {Array} - Shuffled copy of the array
   */
  shuffleArray(array: string[]): string[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const current = shuffled[i];
      const target = shuffled[j];
      if (current === undefined || target === undefined) {
        continue;
      }
      shuffled[i] = target;
      shuffled[j] = current;
    }
    return shuffled;
  }

  /**
   * Start auto-play mode
   * @param {Array} emoteIds - Array of emote IDs to play
   */
  async startAutoPlay(emoteIds: string[]): Promise<void> {
    if (!emoteIds || emoteIds.length === 0) {
      Logger.warn("EmotePlayer", "No emotes to auto-play");
      return;
    }

    Logger.log(
      "EmotePlayer",
      `Starting auto-play with ${emoteIds.length} emotes`,
    );

    this.autoPlayActive = true;
    this.shuffledQueue = this.shuffleArray(emoteIds);
    this.playedEmotes.clear();

    // Start playing the first emote
    await this.playNextInQueue();
  }

  /**
   * Stop auto-play mode
   */
  stopAutoPlay(): void {
    Logger.log("EmotePlayer", "Stopping auto-play");

    this.autoPlayActive = false;
    this.shuffledQueue = [];
    this.playedEmotes.clear();
    this.stopEmote();
  }

  /**
   * Play next emote in the shuffle queue
   */
  async playNextInQueue(): Promise<void> {
    if (!this.autoPlayActive) {
      return;
    }

    if (this.shuffledQueue.length === 0) {
      Logger.log("EmotePlayer", "All emotes played, reshuffling...");

      // Get all emote IDs from played set and reshuffle
      const allEmoteIds = Array.from(this.playedEmotes);
      this.shuffledQueue = this.shuffleArray(allEmoteIds);
      this.playedEmotes.clear();
    }

    if (this.shuffledQueue.length === 0) {
      Logger.warn("EmotePlayer", "No emotes in queue");
      this.stopAutoPlay();
      return;
    }

    const nextEmoteId = this.shuffledQueue.shift();
    if (!nextEmoteId) {
      return;
    }
    this.playedEmotes.add(nextEmoteId);

    try {
      await this.playEmote(nextEmoteId);
    } catch (error) {
      Logger.error(
        "EmotePlayer",
        "Error playing emote in auto-play, skipping:",
        error,
      );

      // If error, continue to next emote after delay
      if (this.autoPlayActive) {
        setTimeout(() => {
          this.playNextInQueue();
        }, this.autoPlayDelay);
      }
    }
  }

  /**
   * Check if auto-play is currently active
   * @returns {boolean}
   */
  isAutoPlayActive(): boolean {
    return this.autoPlayActive;
  }
}

// Export singleton instance
const emotePlayerService = new EmotePlayerService();
export default emotePlayerService;
