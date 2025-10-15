/**
 * Offscreen Manager
 * Manages offscreen document lifecycle
 * Creates on demand, keeps alive during audio work, closes when idle
 */

/* global chrome */

export class OffscreenManager {
  constructor() {
    this.isOffscreenOpen = false;
    this.activeJobs = 0;
    this.closeTimer = null;
    this.closeDelay = 30000; // Close after 30s of inactivity
    
    console.log('[OffscreenManager] Initialized');
  }

  /**
   * Ensure offscreen document exists
   */
  async ensureOffscreen() {
    if (this.isOffscreenOpen) {
      this.resetCloseTimer();
      return;
    }

    try {
      console.log('[OffscreenManager] Creating offscreen document...');

      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'Audio processing and playback for virtual assistant'
      });

      this.isOffscreenOpen = true;
      this.resetCloseTimer();
      
      console.log('[OffscreenManager] Offscreen document created');
    } catch (error) {
      // Document might already exist
      if (error.message.includes('Only a single offscreen')) {
        this.isOffscreenOpen = true;
        this.resetCloseTimer();
      } else {
        console.error('[OffscreenManager] Failed to create offscreen:', error);
        throw error;
      }
    }
  }

  /**
   * Close offscreen document
   */
  async closeOffscreen() {
    if (!this.isOffscreenOpen) return;

    try {
      console.log('[OffscreenManager] Closing offscreen document...');
      await chrome.offscreen.closeDocument();
      this.isOffscreenOpen = false;
      console.log('[OffscreenManager] Offscreen document closed');
    } catch (error) {
      console.error('[OffscreenManager] Failed to close offscreen:', error);
    }
  }

  /**
   * Send message to offscreen document
   */
  async sendToOffscreen(message) {
    await this.ensureOffscreen();
    
    try {
      const response = await chrome.runtime.sendMessage(message);
      return response;
    } catch (error) {
      console.error('[OffscreenManager] Failed to send message:', error);
      throw error;
    }
  }

  /**
   * Start a job (prevents closing)
   */
  startJob() {
    this.activeJobs++;
    this.resetCloseTimer();
  }

  /**
   * End a job (allows closing when all done)
   */
  endJob() {
    this.activeJobs = Math.max(0, this.activeJobs - 1);
    this.resetCloseTimer();
  }

  /**
   * Reset the close timer
   */
  resetCloseTimer() {
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
    }

    // Only set timer if no active jobs
    if (this.activeJobs === 0) {
      this.closeTimer = setTimeout(() => {
        this.closeOffscreen();
      }, this.closeDelay);
    }
  }

  /**
   * Keep offscreen alive (call during active sessions)
   */
  keepAlive() {
    this.resetCloseTimer();
  }
}

// Create singleton
export const offscreenManager = new OffscreenManager();
