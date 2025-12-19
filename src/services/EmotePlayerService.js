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
  }

  /**
   * Check if an emote is currently playing
   * @returns {boolean}
   */
  isEmotePlaying() {
    return this.isPlaying;
  }
}

// Export singleton instance
const emotePlayerService = new EmotePlayerService();
export default emotePlayerService;
