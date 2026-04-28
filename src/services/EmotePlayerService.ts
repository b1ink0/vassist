/**
 * @fileoverview Emote Player Service
 */

import emoteStorageService from './EmoteStorageService';
import Logger from './LoggerService';

interface AnimationManagerLike {
  queueSimpleAnimation: (config: Record<string, unknown>, force?: boolean) => void;
}

interface BinaryLikeObject {
  data?: number[];
  type?: string;
  mimeType?: string;
}

class EmotePlayerService {
  private currentAudio: HTMLAudioElement | null;
  private animationManagerRef: AnimationManagerLike | null;
  private isPlaying: boolean;
  private currentEmoteId: string | null;
  private autoPlayActive: boolean;
  private shuffledQueue: string[];
  private playedEmotes: Set<string>;
  private autoPlayDelay: number;

  constructor() {
    this.currentAudio = null;
    this.animationManagerRef = null;
    this.isPlaying = false;
    this.currentEmoteId = null;
    this.autoPlayActive = false;
    this.shuffledQueue = [];
    this.playedEmotes = new Set();
    this.autoPlayDelay = 1000; // 1 second delay between emotes
  }

  /**
   * Set animation manager reference
   * @param {AnimationManager} manager - Animation manager instance
   */
  setAnimationManager(manager: AnimationManagerLike): void {
    this.animationManagerRef = manager;
    Logger.log('EmotePlayer', 'Animation manager connected');
  }

  /**
   * Play an emote (audio + animation synchronized)
   * @param {string} emoteId - Emote ID to play
   * @returns {Promise<void>}
   */
  async playEmote(emoteId: string): Promise<void> {
    try {
      if (this.isPlaying) {
        Logger.warn('EmotePlayer', 'Already playing an emote, stopping current');
        this.stopEmote();
      }

      if (!this.animationManagerRef) {
        throw new Error('Animation manager not set. Call setAnimationManager() first.');
      }

      Logger.log('EmotePlayer', `Playing emote: ${emoteId}`);

      const emote = await emoteStorageService.getEmote(emoteId);
      if (!emote) {
        throw new Error(`Emote ${emoteId} not found`);
      }

      const audioBlob = this.toBlob(emote.audioData, emote.metadata?.audioMimeType || 'audio/mpeg');
      const motionBlob = this.toBlob(emote.motionData, 'application/octet-stream');
      const audioUrl = URL.createObjectURL(audioBlob);
      const motionUrl = URL.createObjectURL(motionBlob);
      
      // Create camera animation URL if camera data exists (optional)
      let cameraUrl: string | null = null;
      if (emote.cameraData) {
        const cameraBlob = this.toBlob(emote.cameraData, 'application/octet-stream');
        cameraUrl = URL.createObjectURL(cameraBlob);
        Logger.log('EmotePlayer', `Camera animation loaded for emote: ${emote.name}`);
      }

      const audio = new Audio(audioUrl);
      this.currentAudio = audio;
      this.isPlaying = true;
      this.currentEmoteId = emoteId;
      const animationManager = this.animationManagerRef;

      audio.addEventListener('play', () => {
        Logger.log('EmotePlayer', `Audio playing, triggering animation for emote: ${emote.name}`);
        
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

      audio.addEventListener('ended', () => {
        Logger.log('EmotePlayer', 'Emote audio ended');
        
        this.cleanup(audioUrl, motionUrl, cameraUrl);
        
        // If auto-play is active, play next emote after delay
        if (this.autoPlayActive) {
          setTimeout(() => {
            this.playNextInQueue();
          }, this.autoPlayDelay);
        }
      });

      audio.addEventListener('error', (error) => {
        Logger.error('EmotePlayer', 'Audio playback error:', error);
        
        this.cleanup(audioUrl, motionUrl, cameraUrl);
      });

      await audio.play();

    } catch (error) {
      Logger.error('EmotePlayer', 'Failed to play emote:', error);
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
  toBlob(value: Blob | ArrayBuffer | Uint8Array | number[] | BinaryLikeObject, fallbackType = 'application/octet-stream'): Blob {
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

    if (value && typeof value === 'object' && Array.isArray((value as BinaryLikeObject).data)) {
      const payload = value as BinaryLikeObject;
      const nestedType = payload.type || payload.mimeType || fallbackType;
        const copied = new Uint8Array(payload.data as number[]);
      return new Blob([copied.buffer], { type: nestedType });
    }

    throw new Error('Invalid emote media payload: expected Blob, ArrayBuffer, Uint8Array, or byte array');
  }

  /**
   * Stop currently playing emote
   */
  stopEmote(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
    
    this.isPlaying = false;
    Logger.log('EmotePlayer', 'Emote stopped');
  }

  /**
   * Cleanup blob URLs and reset state
   * @param {string} audioUrl - Audio blob URL to revoke
   * @param {string} motionUrl - Motion blob URL to revoke
   * @param {string} cameraUrl - Optional camera blob URL to revoke
   */
  cleanup(audioUrl: string, motionUrl: string, cameraUrl: string | null = null): void {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    if (motionUrl) URL.revokeObjectURL(motionUrl);
    if (cameraUrl) URL.revokeObjectURL(cameraUrl);
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
      Logger.warn('EmotePlayer', 'No emotes to auto-play');
      return;
    }

    Logger.log('EmotePlayer', `Starting auto-play with ${emoteIds.length} emotes`);
    
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
    Logger.log('EmotePlayer', 'Stopping auto-play');
    
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
      Logger.log('EmotePlayer', 'All emotes played, reshuffling...');
      
      // Get all emote IDs from played set and reshuffle
      const allEmoteIds = Array.from(this.playedEmotes);
      this.shuffledQueue = this.shuffleArray(allEmoteIds);
      this.playedEmotes.clear();
    }

    if (this.shuffledQueue.length === 0) {
      Logger.warn('EmotePlayer', 'No emotes in queue');
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
      Logger.error('EmotePlayer', 'Error playing emote in auto-play, skipping:', error);
      
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
