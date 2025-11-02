/**
 * Offscreen Manager
 * Manages offscreen document lifecycle
 * Creates on demand, keeps alive during audio work, closes when idle
 */

/* global chrome */

import Logger from '../../src/services/Logger';
export class OffscreenManager {
  constructor() {
    this.isOffscreenOpen = false;
    this.activeJobs = 0;
    this.closeTimer = null;
    this.closeDelay = 600000; // Close after 10 minutes of inactivity (increased for Kokoro model downloads and WebGPU operations)
    this.keepaliveInterval = null;
    this.longRunningJobs = new Set(); // Track long-running operations by requestId
    
    Logger.log('OffscreenManager', 'Initialized with 10-minute idle timeout');
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
      Logger.log('OffscreenManager', 'Creating offscreen document...');

      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: [
          chrome.offscreen.Reason.WORKERS,        // For spawning WebGPU/WASM computation workers (KokoroTTSCore, VMDGenerationCore, etc.)
          chrome.offscreen.Reason.BLOBS,          // For creating WAV file blobs and audio data
          chrome.offscreen.Reason.DOM_PARSER      // For AudioContext.decodeAudioData and processing
        ],
        justification: 'WebGPU/WASM AI model inference, audio processing (decoding/encoding), and 3D animation generation for virtual assistant'
      });

      this.isOffscreenOpen = true;
      this.resetCloseTimer();
      
      Logger.log('OffscreenManager', 'Offscreen document created with reasons: WORKERS, BLOBS, DOM_PARSER');
    } catch (error) {
      // Document might already exist
      if (error.message.includes('Only a single offscreen')) {
        Logger.log('OffscreenManager', 'Offscreen already exists');
        this.isOffscreenOpen = true;
        this.resetCloseTimer();
      } else {
        Logger.error('OffscreenManager', 'Failed to create offscreen:', error);
        throw error;
      }
    }
  }

  /**
   * Close offscreen document
   */
  async closeOffscreen() {
    // Don't close if there are active jobs!
    if (this.activeJobs > 0) {
      Logger.log('OffscreenManager', 'Skipping close - ${this.activeJobs} active jobs');
      this.resetCloseTimer(); // Reset timer for later
      return;
    }
    
    if (!this.isOffscreenOpen) return;

    try {
      Logger.log('OffscreenManager', 'Closing offscreen document...');
      await chrome.offscreen.closeDocument();
      this.isOffscreenOpen = false;
      Logger.log('OffscreenManager', 'Offscreen document closed');
    } catch (error) {
      // If no current document, it's already closed - not an error
      if (error.message.includes('No current offscreen')) {
        Logger.log('OffscreenManager', 'Offscreen already closed');
        this.isOffscreenOpen = false;
      } else {
        Logger.error('OffscreenManager', 'Failed to close offscreen:', error);
      }
    }
  }

  /**
   * Send message to offscreen document
   */
  async sendToOffscreen(message) {
    // Don't use startJob/endJob here - let the caller manage job lifecycle
    // This is because sendToOffscreen returns immediately, but the WORK in offscreen
    // might still be ongoing (e.g., Kokoro downloading model for 2 minutes)
    
    try {
      await this.ensureOffscreen();
      
      // CRITICAL: Mark message as targeted to offscreen
      // This prevents background handlers from processing it
      const offscreenMessage = {
        ...message,
        target: 'offscreen'
      };
      
      const response = await chrome.runtime.sendMessage(offscreenMessage);
      return response;
    } catch (error) {
      Logger.error('OffscreenManager', 'Failed to send message:', error);
      
      // If receiving end doesn't exist, offscreen was closed
      if (error.message.includes('Receiving end does not exist')) {
        this.isOffscreenOpen = false;
        await this.ensureOffscreen();
        
        // Retry the message
        try {
          const offscreenMessage = {
            ...message,
            target: 'offscreen'
          };
          const response = await chrome.runtime.sendMessage(offscreenMessage);
          return response;
        } catch (retryError) {
          Logger.error('OffscreenManager', 'Retry failed:', retryError);
          throw retryError;
        }
      }
      
      throw error;
    }
  }

  /**
   * Start a job (prevents closing)
   */
  startJob() {
    this.activeJobs++;
    Logger.log('OffscreenManager', 'Job started, active jobs: ${this.activeJobs}');
    this.startKeepalive();
    this.resetCloseTimer();
  }

  /**
   * End a job (allows closing when all done)
   */
  endJob() {
    this.activeJobs = Math.max(0, this.activeJobs - 1);
    Logger.log('OffscreenManager', 'Job ended, active jobs: ${this.activeJobs}');
    
    if (this.activeJobs === 0) {
      this.stopKeepalive();
    }
    
    this.resetCloseTimer();
  }

  /**
   * Start long-running job tracking
   * Use this for operations that take >30 seconds (e.g., model downloads)
   * @param {string} requestId - Unique request ID
   */
  startLongRunningJob(requestId) {
    this.longRunningJobs.add(requestId);
    this.startJob();
    Logger.log('OffscreenManager', 'Long-running job started: ${requestId}');
  }

  /**
   * End long-running job tracking
   * @param {string} requestId - Unique request ID
   */
  endLongRunningJob(requestId) {
    if (this.longRunningJobs.has(requestId)) {
      this.longRunningJobs.delete(requestId);
      this.endJob();
      Logger.log('OffscreenManager', 'Long-running job ended: ${requestId}');
    }
  }

  /**
   * Start keepalive interval to prevent Chrome from closing offscreen doc
   * Chrome closes offscreen documents after 30 seconds of no activity
   * We send a ping every 20 seconds to keep it alive during long operations
   */
  startKeepalive() {
    if (this.keepaliveInterval) return; // Already running

    Logger.log('OffscreenManager', 'Starting keepalive pings (every 20s)');
    this.keepaliveInterval = setInterval(() => {
      if (this.activeJobs > 0 || this.longRunningJobs.size > 0) {
        Logger.log('OffscreenManager', `Keepalive ping - ${this.activeJobs} jobs, ${this.longRunningJobs.size} long-running`);
        this.keepAlive();
      } else {
        // No active work, stop keepalive
        this.stopKeepalive();
      }
    }, 20000); // Every 20 seconds (less than Chrome's 30s timeout)
  }

  /**
   * Stop keepalive interval
   */
  stopKeepalive() {
    if (this.keepaliveInterval) {
      Logger.log('OffscreenManager', 'Stopping keepalive pings');
      clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = null;
    }
  }

  /**
   * Reset the close timer
   */
  resetCloseTimer() {
    // ALWAYS clear any existing timer first
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }

    // Only set NEW timer if no active jobs
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
