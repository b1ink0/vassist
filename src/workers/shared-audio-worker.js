/**
 * Shared Audio Worker
 * Handles audio processing, VMD generation, and BVMD conversion in dev mode
 * Runs in SharedWorker context (no AudioContext available)
 * Main thread must decode audio and send PCM data
 */

import { MessageTypes } from '../../extension/shared/MessageTypes.js';
import { VMDGenerationCore } from './shared/VMDGenerationCore.js';
import { BVMDConversionCore } from './shared/BVMDConversionCore.js';

class SharedAudioWorker {
    constructor() {
        this.name = 'SharedAudioWorker';
        this.ports = new Set();
        this.scene = null; // Babylon scene for BVMD conversion
        this.isReady = false;
        
        // CRITICAL: Register connection handler IMMEDIATELY (synchronously)
        // Must be set before any async operations or connections will be missed
        self.onconnect = (e) => {
            const port = e.ports[0];
            this.ports.add(port);
            
            console.log('[SharedAudioWorker] New connection, total ports:', this.ports.size);
            
            port.onmessage = async (event) => {
                try {
                    // Wait for initialization to complete before processing
                    if (!this.isReady) {
                        console.log('[SharedAudioWorker] Waiting for initialization...');
                        await this.initPromise;
                    }
                    
                    const response = await this.handleMessage(event.data);
                    port.postMessage(response);
                } catch (error) {
                    console.error('[SharedAudioWorker] Error:', error);
                    port.postMessage({
                        type: MessageTypes.ERROR,
                        requestId: event.data.requestId,
                        error: error.message
                    });
                }
            };
            
            port.start();
        };
        
        // Start async initialization
        this.initPromise = this.init();
    }

    async init() {
        console.log('[SharedAudioWorker] Initializing...');
        
        // Try to create Babylon scene for BVMD conversion
        try {
            this.scene = await BVMDConversionCore.createWorkerScene();
            if (this.scene) {
                console.log('[SharedAudioWorker] BVMD conversion available');
            } else {
                console.warn('[SharedAudioWorker] BVMD conversion not available, will fallback to main thread');
            }
        } catch (error) {
            console.error('[SharedAudioWorker] Failed to initialize BVMD converter:', error);
        }
        
        this.isReady = true;
        console.log('[SharedAudioWorker] Ready');
    }

    async handleMessage(message) {
        const { type, requestId } = message;
        
        console.log(`[SharedAudioWorker] Received ${type}, request ${requestId}`);
        
        let data;
        
        switch (type) {
            case MessageTypes.TTS_PROCESS_AUDIO_WITH_LIPSYNC:
                data = await this.handleProcessAudioWithLipSync(message);
                break;
            case MessageTypes.OFFSCREEN_VMD_GENERATE:
                data = await this.handleVMDGenerate(message);
                break;
            case MessageTypes.OFFSCREEN_AUDIO_PROCESS:
                data = await this.handleAudioProcess(message);
                break;
            default:
                throw new Error(`Unknown message type: ${type}`);
        }
        
        console.log(`[SharedAudioWorker] Handler completed, returning response for ${requestId}`);
        
        return {
            type: MessageTypes.SUCCESS,
            requestId,
            data
        };
    }

    /**
     * Handle audio processing with lip sync generation
     * Input: { audioData: Float32Array, sampleRate: number, originalAudioBuffer: ArrayBuffer }
     * Output: { audioBuffer: Array, bvmdData: Array }
     * 
     * Note: Unlike offscreen, SharedWorker receives already-decoded PCM from main thread
     */
    async handleProcessAudioWithLipSync(message) {
        const { audioData, sampleRate, originalAudioBuffer } = message.data;
        
        try {
            console.log(`[SharedAudioWorker] Processing audio: ${audioData.length} samples @ ${sampleRate}Hz`);
            
            // Convert array back to Float32Array if needed
            const pcmData = audioData instanceof Float32Array ? audioData : new Float32Array(audioData);
            
            // Step 1: Generate VMD from PCM
            const vmdData = await VMDGenerationCore.generateVMDFromPCM(pcmData, sampleRate);
            
            // Step 2: Convert VMD to BVMD
            let bvmdArrayBuffer;
            if (this.scene) {
                // Convert in worker
                bvmdArrayBuffer = await BVMDConversionCore.convertVMDToBVMD(vmdData, this.scene);
            } else {
                // Return VMD and signal main thread to convert
                console.warn('[SharedAudioWorker] BVMD conversion not available, returning VMD for main thread conversion');
                return {
                    audioBuffer: Array.from(new Uint8Array(originalAudioBuffer)),
                    vmdData: Array.from(new Uint8Array(vmdData)),
                    bvmdData: null, // Signal that main thread should convert
                    needsBVMDConversion: true
                };
            }
            
            // Step 3: Return both audio and BVMD as Arrays (survive message passing)
            return {
                audioBuffer: Array.from(new Uint8Array(originalAudioBuffer)),
                bvmdData: Array.from(new Uint8Array(bvmdArrayBuffer))
            };
            
        } catch (error) {
            console.error('[SharedAudioWorker] Processing failed:', error);
            // Return audio without lip sync on error
            return {
                audioBuffer: Array.from(new Uint8Array(originalAudioBuffer)),
                bvmdData: null
            };
        }
    }

    /**
     * Handle VMD generation
     * Input: { audioData: Float32Array, sampleRate: number, modelName: string }
     * Output: { vmdData: ArrayBuffer, modelName: string }
     */
    async handleVMDGenerate(message) {
        const { audioData, sampleRate, modelName } = message.data;
        
        console.log('[SharedAudioWorker] Generating VMD from PCM...');
        
        try {
            // Convert array back to Float32Array if needed
            const pcmData = audioData instanceof Float32Array ? audioData : new Float32Array(audioData);
            
            // Generate VMD using core
            const vmdData = await VMDGenerationCore.generateVMDFromPCM(pcmData, sampleRate, modelName);
            
            console.log(`[SharedAudioWorker] VMD generated: ${vmdData.byteLength} bytes`);
            
            return {
                vmdData,
                modelName: modelName || 'Model'
            };
        } catch (error) {
            console.error('[SharedAudioWorker] VMD generation failed:', error);
            throw error;
        }
    }

    /**
     * Handle audio processing (spectrogram, frequency analysis)
     * Input: { audioData: Float32Array, sampleRate: number }
     * Output: { sampleRate, duration, samples, spectrogramFrames }
     */
    async handleAudioProcess(message) {
        const { audioData, sampleRate } = message.data;
        
        try {
            // Convert array back to Float32Array if needed
            const pcmData = audioData instanceof Float32Array ? audioData : new Float32Array(audioData);
            
            const duration = pcmData.length / sampleRate;
            
            // Compute spectrogram if requested
            const frameRate = 30; // VMD uses 30 fps
            const { AudioProcessingCore } = await import('./shared/AudioProcessingCore.js');
            const spectrogram = await AudioProcessingCore.computeSpectrogram(pcmData, sampleRate, frameRate);
            
            return {
                sampleRate,
                duration,
                samples: pcmData.length,
                spectrogramFrames: spectrogram.data.length
            };
        } catch (error) {
            console.error('[SharedAudioWorker] Audio processing failed:', error);
            throw error;
        }
    }
}

// Initialize worker
new SharedAudioWorker();
