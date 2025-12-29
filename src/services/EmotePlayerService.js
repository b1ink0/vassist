/**
 * @fileoverview Emote Player Service
 */

import emoteStorageService from './EmoteStorageService';
import Logger from './LoggerService';

class EmotePlayerService {
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
  setAnimationManager(manager) {
    this.animationManagerRef = manager;
    Logger.log('EmotePlayer', 'Animation manager connected');
  }

  /**
   * Play an emote (audio + animation synchronized)
   * @param {string} emoteId - Emote ID to play
   * @returns {Promise<void>}
   */
  async playEmote(emoteId) {
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

      const audioUrl = URL.createObjectURL(emote.audioData);
      const motionUrl = URL.createObjectURL(emote.motionData);

      const audio = new Audio(audioUrl);
      this.currentAudio = audio;
      this.isPlaying = true;
      this.currentEmoteId = emoteId;

      audio.addEventListener('play', () => {
        Logger.log('EmotePlayer', `Audio playing, triggering animation for emote: ${emote.name}`);
        
        // Trigger animation when audio starts playing
        const emoteAnimConfig = {
          id: emoteId,
          name: emote.name,
          filePath: motionUrl,
          isCustom: true,
          customMotionId: emoteId,
          loop: false,
          loopTransition: false,
          transitionFrames: 30,
          preserveRootBone: true,
          disableBlinking: true,
        };
        this.animationManagerRef.queueSimpleAnimation(emoteAnimConfig, true);
      });

      audio.addEventListener('ended', () => {
        Logger.log('EmotePlayer', 'Emote audio ended');
        
        this.cleanup(audioUrl, motionUrl);
        
        // If auto-play is active, play next emote after delay
        if (this.autoPlayActive) {
          setTimeout(() => {
            this.playNextInQueue();
          }, this.autoPlayDelay);
        }
      });

      audio.addEventListener('error', (error) => {
        Logger.error('EmotePlayer', 'Audio playback error:', error);
        
        this.cleanup(audioUrl, motionUrl);
      });

      await audio.play();

    } catch (error) {
      Logger.error('EmotePlayer', 'Failed to play emote:', error);
      this.isPlaying = false;
      throw error;
    }
  }

  /**
   * Stop currently playing emote
   */
  stopEmote() {
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
   */
  cleanup(audioUrl, motionUrl) {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    if (motionUrl) URL.revokeObjectURL(motionUrl);
    this.currentAudio = null;
    this.isPlaying = false;
    this.currentEmoteId = null;
  }

  /**
   * Check if an emote is currently playing
   * @returns {boolean}
   */
  isEmotePlaying() {
    return this.isPlaying;
  }

  /**
   * Get currently playing emote ID
   * @returns {string|null}
   */
  getCurrentEmoteId() {
    return this.currentEmoteId;
  }

  /**
   * Shuffle array using Fisher-Yates algorithm
   * @param {Array} array - Array to shuffle
   * @returns {Array} - Shuffled copy of the array
   */
  shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Start auto-play mode
   * @param {Array} emoteIds - Array of emote IDs to play
   */
  async startAutoPlay(emoteIds) {
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
  stopAutoPlay() {
    Logger.log('EmotePlayer', 'Stopping auto-play');
    
    this.autoPlayActive = false;
    this.shuffledQueue = [];
    this.playedEmotes.clear();
    this.stopEmote();
  }

  /**
   * Play next emote in the shuffle queue
   */
  async playNextInQueue() {
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
  isAutoPlayActive() {
    return this.autoPlayActive;
  }
}

// Export singleton instance
const emotePlayerService = new EmotePlayerService();
export default emotePlayerService;
