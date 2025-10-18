/**
 * Offscreen Document Worker
 * Handles heavy audio processing and VMD generation
 * Runs in separate context with AudioContext access
 */

/* global chrome */

import { MessageTypes } from '../shared/MessageTypes.js';
import { VMDGenerationCore } from '../../src/workers/shared/VMDGenerationCore.js';
import { BVMDConversionCore } from '../../src/workers/shared/BVMDConversionCore.js';
import { Scene } from '@babylonjs/core/scene';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';

class OffscreenWorker {
  constructor() {
    this.name = 'OffscreenWorker';
    this.audioContext = null;
    this.messageHandlers = new Map();
    
    // Babylon scene for BVMD conversion (using shared core)
    this.scene = null;
    
    this.init();
  }

  async init() {
    console.log('[OffscreenWorker] Initializing...');
    
    // Initialize AudioContext (offscreen has access to AudioContext for best performance)
    this.audioContext = new AudioContext();
    console.log('[OffscreenWorker] AudioContext initialized');
    
    // Initialize minimal Babylon scene for BVMD conversion
    try {
      console.log('[OffscreenWorker] Creating NullEngine for BVMD conversion...');
      const engine = new NullEngine();
      this.scene = new Scene(engine);
      console.log('[OffscreenWorker] BVMD converter initialized');
    } catch (error) {
      console.error('[OffscreenWorker] Failed to initialize BVMD converter:', error);
    }
    
    // Set up message handlers
    this.registerHandlers();
    
    // Listen for messages
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // CRITICAL: ONLY handle messages explicitly targeted to offscreen
      // Reject ALL messages without target or with different target
      if (!message.target || message.target !== 'offscreen') {
        // Not for us, ignore silently (no response)
        return false;
      }
      
      this.handleMessage(message, sender)
        .then(sendResponse)
        .catch(error => {
          console.error('[OffscreenWorker] Error:', error);
          sendResponse({
            type: MessageTypes.ERROR,
            requestId: message.requestId,
            error: error.message
          });
        });
      return true;
    });
    
    console.log('[OffscreenWorker] Ready with AudioContext:', this.audioContext.state);
  }

  /**
   * Register message handlers
   */
  registerHandlers() {
    this.messageHandlers.set(MessageTypes.OFFSCREEN_AUDIO_PROCESS, 
      this.handleAudioProcess.bind(this));
    this.messageHandlers.set(MessageTypes.OFFSCREEN_VMD_GENERATE, 
      this.handleVMDGenerate.bind(this));
    this.messageHandlers.set(MessageTypes.TTS_PROCESS_AUDIO_WITH_LIPSYNC,
      this.handleProcessAudioWithLipSync.bind(this));
  }

  /**
   * Handle incoming message
   */
  async handleMessage(message, sender) {
    const { type, requestId } = message;
    
    console.log(`[OffscreenWorker] Received ${type}, request ${requestId}`);
    
    // Only handle messages intended for offscreen
    // Ignore messages for background/content scripts
    const handler = this.messageHandlers.get(type);
    if (!handler) {
      // Not an error - just not for us
      console.log(`[OffscreenWorker] Ignoring message type: ${type} (not for offscreen)`);
      return; // Return undefined (no response needed)
    }
    
    const data = await handler(message, sender);
    
    console.log(`[OffscreenWorker] Handler completed, returning response for ${requestId}`);
    
    return {
      type: MessageTypes.SUCCESS,
      requestId,
      data
    };
  }

  /**
   * Handle audio processing with lip sync generation
   * This is the main handler for TTS audio processing in extension mode
   * Input: { audioBuffer: Array }
   * Output: { audioBuffer: Array, bvmdData: Array }
   * 
   * Uses shared cores for processing while keeping AudioContext decoding in offscreen for best performance
   */
  async handleProcessAudioWithLipSync(message) {
    const { audioBuffer } = message.data;
    
    try {
      // Convert Array to ArrayBuffer
      // Background sends us an Array (survives structured clone)
      let actualArrayBuffer;
      if (Array.isArray(audioBuffer)) {
        const uint8Array = new Uint8Array(audioBuffer);
        actualArrayBuffer = uint8Array.buffer;
      } else if (audioBuffer instanceof ArrayBuffer) {
        actualArrayBuffer = audioBuffer;
      } else {
        throw new Error('Invalid audioBuffer type: ' + typeof audioBuffer);
      }
      
      // CRITICAL: Clone ArrayBuffer before decoding
      // decodeAudioData may detach the ArrayBuffer in some browsers
      // We need to keep the original for returning, so we clone it first
      const audioBufferClone = actualArrayBuffer.slice(0);
      
      // Step 1: Decode audio using AudioContext (offscreen has access to AudioContext)
      const decodedAudio = await this.audioContext.decodeAudioData(audioBufferClone);
      const audioData = decodedAudio.getChannelData(0); // Use first channel (mono)
      const sampleRate = decodedAudio.sampleRate;
      
      console.log(`[OffscreenWorker] Audio decoded: ${decodedAudio.duration.toFixed(2)}s @ ${sampleRate}Hz`);
      
      // Step 2: Generate VMD from PCM using shared core
      const vmdData = await VMDGenerationCore.generateVMDFromPCM(audioData, sampleRate);
      
      // Step 3: Convert VMD to BVMD using shared core
      const bvmdArrayBuffer = await BVMDConversionCore.convertVMDToBVMD(vmdData, this.scene);
      
      // Step 4: Return both audio and BVMD as Arrays (survive message passing)
      return {
        audioBuffer: Array.from(new Uint8Array(actualArrayBuffer)),
        bvmdData: Array.from(new Uint8Array(bvmdArrayBuffer))
      };
      
    } catch (error) {
      console.error('[OffscreenWorker] Processing failed:', error);
      console.error('[OffscreenWorker] Error details:', error.name, error.message);
      // Return audio without lip sync on error
      let errorArray = audioBuffer;
      if (!Array.isArray(audioBuffer)) {
        errorArray = Array.from(new Uint8Array(audioBuffer));
      }
      return {
        audioBuffer: errorArray,
        bvmdData: null
      };
    }
  }

  /**
   * Handle audio processing (spectrogram, frequency analysis)
   */
  async handleAudioProcess(message) {
    const { audioBlob } = message.data;
    
    try {
      // Decode audio using AudioContext
      const arrayBuffer = await audioBlob.arrayBuffer();
      const decodedAudio = await this.audioContext.decodeAudioData(arrayBuffer);
      
      // Extract audio data
      const audioData = decodedAudio.getChannelData(0);
      const sampleRate = decodedAudio.sampleRate;
      const duration = decodedAudio.duration;
      
      // Compute spectrogram using shared core
      const frameRate = 30; // VMD uses 30 fps
      const { AudioProcessingCore } = await import('../../src/workers/shared/AudioProcessingCore.js');
      const spectrogram = await AudioProcessingCore.computeSpectrogram(audioData, sampleRate, frameRate);
      
      return {
        sampleRate,
        duration,
        samples: audioData.length,
        spectrogramFrames: spectrogram.data.length
      };
    } catch (error) {
      console.error('[OffscreenWorker] Audio processing failed:', error);
      throw error;
    }
  }

  /**
   * Handle VMD generation
   */
  async handleVMDGenerate(message) {
    const { audioBuffer, modelName } = message.data;
    
    console.log('[OffscreenWorker] Generating VMD from audio...');
    
    try {
      // Decode audio using AudioContext
      const decodedAudio = await this.audioContext.decodeAudioData(audioBuffer);
      const audioData = decodedAudio.getChannelData(0);
      const sampleRate = decodedAudio.sampleRate;
      
      // Generate VMD using shared core
      const vmdData = await VMDGenerationCore.generateVMDFromPCM(audioData, sampleRate, modelName);
      
      console.log(`[OffscreenWorker] VMD generated: ${vmdData.byteLength} bytes`);
      
      return {
        vmdData,
        modelName: modelName || 'Model'
      };
    } catch (error) {
      console.error('[OffscreenWorker] VMD generation failed:', error);
      throw error;
    }
  }
}

// Initialize worker
new OffscreenWorker();
