/**
 * ScreenShareService - Universal screen sharing and frame capture
 * 
 * Works on all platforms: Desktop (Electron), Web, Dev, Extension
 * Uses getDisplayMedia() for Chromium-based platforms
 * Note: IPC communication handled by components using useDesktop() hook
 */

import Logger from './LoggerService';
import FrameCaptureService from './FrameCaptureService';
import { isAndroid } from '../utils/PlatformUtils';

class ScreenShareService {
  constructor() {
    this.name = 'ScreenShareService';
    this.type = 'screen';
    this.stream = null;
    this.isActive = false;
    this.listeners = new Set();
    this.permissionGranted = false;
    this.isInitializing = false;
    this.isInitialized = false;
    
    // Reusable elements for frame capture
    this.captureVideo = null;
    this.captureCanvas = null;
  }

  /**
   * Initialize screen share service
   * @returns {Promise<boolean>}
   */
  async initialize() {
    if (this.isInitialized) {
      Logger.log('ScreenShareService', 'Already initialized');
      return true;
    }
    
    if (this.isInitializing) {
      Logger.warn('ScreenShareService', 'Initialization already in progress');
      return false;
    }

    try {
      this.isInitializing = true;
      Logger.log('ScreenShareService', 'Initializing screen share service...');
      
      // Android not supported yet
      if (isAndroid) {
        throw new Error('Screen share not supported on Android yet');
      }
      
      // Check if getDisplayMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        throw new Error('getDisplayMedia not supported');
      }
      
      this.isInitialized = true;
      Logger.log('ScreenShareService', 'Initialized successfully');
      return true;
    } catch (error) {
      Logger.error('ScreenShareService', 'Failed to initialize:', error.message);
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Start screen share using getDisplayMedia()
   * @returns {Promise<MediaStream>}
   */
  async start() {
    try {
      if (this.isActive) {
        Logger.warn('ScreenShareService', 'Screen share already active');
        return this.stream;
      }

      // Stop any existing stream first
      if (this.stream) {
        Logger.warn('ScreenShareService', 'Stopping existing stream before starting new one');
        this.stream.getTracks().forEach(track => track.stop());
        this.stream = null;
      }

      Logger.log('ScreenShareService', 'Starting screen share...');

      // Request screen share - shows system picker
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always' // Include cursor in capture
        },
        audio: false // No system audio for now
      });
      
      // Log actual resolution
      const videoTrack = this.stream.getVideoTracks()[0];
      if (videoTrack) {
        const settings = videoTrack.getSettings();
        Logger.log('ScreenShareService', 'Screen share started at:', `${settings.width}x${settings.height}`);
        
        // Listen for user stopping share via browser UI
        videoTrack.onended = () => {
          Logger.log('ScreenShareService', 'User stopped screen share via browser');
          this.stop();
        };
      }
      
      this.isActive = true;
      this.permissionGranted = true;

      // Register with FrameCaptureService
      FrameCaptureService.registerProvider(this);

      Logger.log('ScreenShareService', 'Screen share started successfully');
      this.notifyListeners();

      return this.stream;
    } catch (error) {
      Logger.error('ScreenShareService', 'Failed to start screen share:', error.message);
      this.isActive = false;
      this.notifyListeners();
      
      // User cancelled the picker
      if (error.name === 'NotAllowedError') {
        throw new Error('Screen share permission denied');
      }
      
      throw error;
    }
  }

  /**
   * Stop screen share
   */
  async stop() {
    try {
      if (!this.isActive) {
        Logger.warn('ScreenShareService', 'Screen share not active');
        return;
      }

      // Stop all tracks
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
        this.stream = null;
      }
      
      // Cleanup capture elements
      if (this.captureVideo) {
        this.captureVideo.pause();
        this.captureVideo.srcObject = null;
        this.captureVideo = null;
      }
      if (this.captureCanvas) {
        this.captureCanvas.width = 0;
        this.captureCanvas.height = 0;
        this.captureCanvas = null;
      }

      this.isActive = false;

      // Unregister from FrameCaptureService
      FrameCaptureService.unregisterProvider();

      Logger.log('ScreenShareService', 'Screen share stopped');
      this.notifyListeners();
    } catch (error) {
      Logger.error('ScreenShareService', 'Error stopping screen share:', error);
    }
  }

  /**
   * Toggle screen share (convenience method)
   */
  async toggle() {
    if (this.isActive) {
      await this.stop();
    } else {
      await this.start();
    }
  }

  /**
   * Check if screen share is active
   * @returns {boolean}
   */
  isRunning() {
    return this.isActive;
  }

  /**
   * Capture current frame as data URL (for FrameCaptureService)
   * Uses full resolution from MediaStream
   * @returns {Promise<string|null>}
   */
  async captureFrame() {
    if (!this.isActive || !this.stream) {
      Logger.warn('ScreenShareService', 'Screen share not active, cannot capture frame');
      return null;
    }
    
    try {
      // Get video track settings to determine native resolution
      const videoTrack = this.stream.getVideoTracks()[0];
      if (!videoTrack) {
        Logger.error('ScreenShareService', 'No video track available');
        return null;
      }

      const settings = videoTrack.getSettings();
      const width = settings.width || 1920;
      const height = settings.height || 1080;

      // Create reusable video element if needed
      if (!this.captureVideo) {
        this.captureVideo = document.createElement('video');
        this.captureVideo.muted = true;
        this.captureVideo.playsInline = true;
      }
      
      // Update video source if changed
      if (this.captureVideo.srcObject !== this.stream) {
        this.captureVideo.srcObject = this.stream;
        
        // Wait for video to be ready
        await new Promise((resolve, reject) => {
          this.captureVideo.onloadedmetadata = resolve;
          this.captureVideo.onerror = reject;
          this.captureVideo.play();
        });
      }

      // Create or resize canvas if needed
      const targetWidth = this.captureVideo.videoWidth || width;
      const targetHeight = this.captureVideo.videoHeight || height;
      
      if (!this.captureCanvas || 
          this.captureCanvas.width !== targetWidth || 
          this.captureCanvas.height !== targetHeight) {
        
        if (!this.captureCanvas) {
          this.captureCanvas = document.createElement('canvas');
        }
        
        this.captureCanvas.width = targetWidth;
        this.captureCanvas.height = targetHeight;
      }

      const ctx = this.captureCanvas.getContext('2d');
      ctx.drawImage(this.captureVideo, 0, 0, this.captureCanvas.width, this.captureCanvas.height);

      // Convert to data URL with high quality
      const dataUrl = this.captureCanvas.toDataURL('image/jpeg', 0.85);
      
      Logger.log('ScreenShareService', 'Frame captured at full resolution:', `${this.captureCanvas.width}x${this.captureCanvas.height}`);
      
      return dataUrl;
    } catch (error) {
      Logger.error('ScreenShareService', 'Failed to capture frame:', error);
      return null;
    }
  }

  /**
   * Get current video stream (for preview)
   * @returns {MediaStream|null}
   */
  getStream() {
    return this.stream;
  }

  /**
   * Subscribe to state changes
   * @param {Function} callback - Callback with {isActive}
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    this.listeners.add(callback);
    
    // Immediately call with current state
    callback({
      isActive: this.isActive
    });

    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Notify all listeners of state change
   */
  notifyListeners() {
    const state = {
      isActive: this.isActive
    };

    this.listeners.forEach(listener => {
      try {
        listener(state);
      } catch (error) {
        Logger.error('ScreenShareService', 'Listener error:', error);
      }
    });
  }
}

export default new ScreenShareService();
