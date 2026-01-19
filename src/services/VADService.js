/**
 * VADService - Voice Activity Detection
 * Wraps @ricky0123/vad-web for production-quality voice detection
 * Currently configured to use Silero VAD v5 model
 */

import { MicVAD } from '@ricky0123/vad-web';
import { isDesktop } from '../utils/PlatformUtils.js';
import MicrophoneService from './MicrophoneService.js';
import Logger from './LoggerService.js';

class VADService {
  constructor() {
    this.vad = null;
    this.isListening = false;
    this.mediaStream = null;
    
    // Callbacks
    this.onSpeechStart = null;
    this.onSpeechEnd = null;
    this.onError = null;
  }

  /**
   * Initialize and start VAD
   * @param {Object} options - Configuration options
   * @param {Function} options.onSpeechStart - Called when speech is detected
   * @param {Function} options.onSpeechEnd - Called when speech ends
   * @param {Function} options.onError - Called on errors
   * @param {MediaStream} options.stream - Optional MediaStream (if not provided, will request mic access)
   */
  async start(options = {}) {
    if (this.isListening) {
      Logger.warn('VAD', 'Already listening');
      return;
    }

    this.onSpeechStart = options.onSpeechStart || null;
    this.onSpeechEnd = options.onSpeechEnd || null;
    this.onError = options.onError || null;

    try {
      // Get media stream if not provided
      if (options.stream) {
        this.mediaStream = options.stream;
      } else {
        // Get audio constraints with selected microphone
        const constraints = MicrophoneService.getAudioConstraints();
        this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      }

      Logger.log('VAD', 'Initializing VAD (Silero v5)...');

      // Determine asset path based on build type
      // The library appends model filenames to baseAssetPath
      // Desktop: Use app:// protocol - files are in dist-desktop/assets/
      // Android: HTML at root, assets in /assets/ directory - use absolute path
      // Web/Extension: Files in ./assets/ relative to HTML
      const baseAssetPath = isDesktop ? 'app://./assets/' : '/assets/';

      // Initialize MicVAD with Silero v5 model
      this.vad = await MicVAD.new({
        // Override getStream to use our pre-configured stream with selected microphone
        getStream: async () => this.mediaStream,
        
        // Explicitly specify v5 model (required!)
        model: 'v5',
        
        // Base path where VAD will find: silero_vad_v5.onnx, vad.worklet.bundle.min.js, etc.
        baseAssetPath: baseAssetPath,
        
        // WASM files path for ONNX Runtime
        onnxWASMBasePath: baseAssetPath,
        
        // ONNX Runtime configuration
        ortConfig: (ort) => {
          // Force web mode - disable Node.js fs even in Electron
          ort.env.wasm.numThreads = 1;
          ort.env.wasm.simd = true;
          
          // Disable Node.js binding - force browser/fetch mode
          ort.env.wasm.proxy = false;
        },
        
        // VAD parameters
        positiveSpeechThreshold: 0.8, // Higher = less sensitive (fewer false positives)
        negativeSpeechThreshold: 0.5, // Lower = more sensitive (catches speech better)
        redemptionFrames: 8, // Frames to wait before declaring speech end
        preSpeechPadFrames: 1, // Frames to include before speech start
        minSpeechFrames: 3, // Minimum frames to consider as speech
        
        // Callbacks
        onSpeechStart: () => {
          Logger.log('VAD', 'Speech started');
          if (this.onSpeechStart) {
            this.onSpeechStart();
          }
        },
        
        onSpeechEnd: (audio) => {
          Logger.log('VAD', 'Speech ended');
          if (this.onSpeechEnd) {
            this.onSpeechEnd(audio);
          }
        },
        
        onVADMisfire: () => {
          Logger.log('VAD', 'VAD misfire (false positive detected)');
        },
      });

      Logger.log('VAD', 'Started successfully');
      this.isListening = true;

      // Start the VAD
      this.vad.start();

    } catch (error) {
      Logger.error('VAD', 'Failed to start:', error);
      if (this.onError) {
        this.onError(error);
      }
      throw error;
    }
  }

  /**
   * Stop the VAD and cleanup resources
   */
  async stop() {
    if (!this.isListening) {
      return;
    }

    Logger.log('VAD', 'Stopping...');

    try {
      if (this.vad) {
        this.vad.pause();
        this.vad.destroy();
        this.vad = null;
      }

      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop());
        this.mediaStream = null;
      }

      this.isListening = false;
      Logger.log('VAD', 'Stopped successfully');
    } catch (error) {
      Logger.error('VAD', 'Error during stop:', error);
      throw error;
    }
  }

  /**
   * Pause the VAD without destroying it
   */
  pause() {
    if (this.vad && this.isListening) {
      Logger.log('VAD', 'Pausing...');
      this.vad.pause();
    }
  }

  /**
   * Resume the VAD after pausing
   */
  resume() {
    if (this.vad && this.isListening) {
      Logger.log('VAD', 'Resuming...');
      this.vad.start();
    }
  }

  /**
   * Get the current listening state
   * @returns {boolean}
   */
  getIsListening() {
    return this.isListening;
  }
}

export default new VADService();
