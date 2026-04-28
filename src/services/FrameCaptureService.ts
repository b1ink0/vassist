/**
 * FrameCaptureService - Provider pattern for frame capture
 * 
 * Core service that capture sources (camera, screen share) plug into.
 * Used by routing system for on-demand vision analysis.
 */

import Logger from './LoggerService';

type CaptureProvider = {
  name?: string;
  type?: string;
  captureFrame: () => Promise<string | null>;
};

type CaptureResult = {
  success: boolean;
  frame: string | null;
  error: string | null;
};

const asError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));

class FrameCaptureService {
  private provider: CaptureProvider | null;
  private isCapturing: boolean;

  constructor() {
    this.provider = null;
    this.isCapturing = false;
  }

  /**
   * Register a capture provider (camera, screen share, etc.)
   * @param {Object} provider - Provider with captureFrame() method
   */
  registerProvider(provider: CaptureProvider | null): boolean {
    if (!provider || typeof provider.captureFrame !== 'function') {
      Logger.error('FrameCaptureService', 'Invalid provider - must have captureFrame() method');
      return false;
    }

    this.provider = provider;
    Logger.log('FrameCaptureService', 'Provider registered:', provider.name || 'Unknown');
    return true;
  }

  /**
   * Unregister current provider
   */
  unregisterProvider(): void {
    if (this.provider) {
      Logger.log('FrameCaptureService', 'Provider unregistered:', this.provider.name || 'Unknown');
    }
    this.provider = null;
  }

  /**
   * Check if capture is enabled (provider registered)
   * @returns {boolean}
   */
  isEnabled(): boolean {
    return this.provider !== null;
  }

  /**
   * Get latest frame from active provider
   * @returns {Promise<{success: boolean, frame: string|null, error: string|null}>}
   */
  async getLatestFrame(): Promise<CaptureResult> {
    if (!this.provider) {
      return {
        success: false,
        frame: null,
        error: 'No capture provider registered'
      };
    }

    if (this.isCapturing) {
      Logger.warn('FrameCaptureService', 'Capture already in progress, skipping');
      return {
        success: false,
        frame: null,
        error: 'Capture already in progress'
      };
    }

    this.isCapturing = true;

    try {
      Logger.log('FrameCaptureService', 'Requesting frame from provider...');
      
      const timeoutPromise = new Promise<string | null>((_, reject) =>
        setTimeout(() => reject(new Error('Capture timeout (5s)')), 5000)
      );
      
      const capturePromise = this.provider.captureFrame();
      
      const frame = await Promise.race<string | null>([capturePromise, timeoutPromise]);

      if (!frame) {
        Logger.warn('FrameCaptureService', 'Provider returned null/empty frame');
        return {
          success: false,
          frame: null,
          error: 'Provider returned empty frame'
        };
      }

      if (typeof frame !== 'string' || !frame.startsWith('data:image/')) {
        Logger.error('FrameCaptureService', 'Invalid frame format - expected data URL');
        return {
          success: false,
          frame: null,
          error: 'Invalid frame format'
        };
      }

      Logger.log('FrameCaptureService', 'Frame captured successfully');
      return {
        success: true,
        frame: frame,
        error: null
      };

    } catch (error) {
      const normalized = asError(error);
      Logger.error('FrameCaptureService', 'Frame capture failed:', error);
      return {
        success: false,
        frame: null,
        error: normalized.message || 'Unknown capture error'
      };
    } finally {
      this.isCapturing = false;
    }
  }

  /**
   * Get provider info for debugging
   * @returns {Object}
   */
  getProviderInfo(): { registered: false } | { registered: true; name: string; type: string } {
    if (!this.provider) {
      return { registered: false };
    }

    return {
      registered: true,
      name: this.provider.name || 'Unknown',
      type: this.provider.type || 'Unknown'
    };
  }
}

export default new FrameCaptureService();
