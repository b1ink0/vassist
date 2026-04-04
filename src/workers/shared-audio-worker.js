/**
 * Shared Audio Worker
 * Handles audio processing, VMD generation, and BVMD conversion in dev mode
 * Runs in SharedWorker context (no AudioContext available)
 * Also supports regular Worker context for Android WebView (SharedWorker not supported)
 * Main thread must decode audio and send PCM data
 */

import { MessageTypes } from '../../extension/shared/MessageTypes.js';
import { VMDGenerationCore } from './shared/VMDGenerationCore.js';
import { BVMDConversionCore } from './shared/BVMDConversionCore.js';
import KokoroTTSCore from './shared/KokoroTTSCore.js';
import Logger from '../services/LoggerService';

class SharedAudioWorker {
    constructor() {
        this.name = 'SharedAudioWorker';
        this.ports = new Set();
        this.scene = null; // Babylon scene for BVMD conversion
        this.isReady = false;
        this.isSharedWorker = typeof self.onconnect !== 'undefined' || self.constructor.name === 'SharedWorkerGlobalScope';
        
        if (this.isSharedWorker) {
            // SharedWorker context: Register connection handler
            // CRITICAL: Must be set before any async operations or connections will be missed
            self.onconnect = (e) => {
                const port = e.ports[0];
                this.ports.add(port);
                
                Logger.log('SharedAudioWorker', 'New connection, total ports:', this.ports.size);
                
                port.onmessage = async (event) => {
                    try {
                        // Wait for initialization to complete before processing
                        if (!this.isReady) {
                            Logger.log('SharedAudioWorker', 'Waiting for initialization...');
                            await this.initPromise;
                        }
                        
                        const response = await this.handleMessage(event.data);
                        port.postMessage(response);
                    } catch (error) {
                        Logger.error('SharedAudioWorker', 'Error:', error);
                        port.postMessage({
                            type: MessageTypes.ERROR,
                            requestId: event.data.requestId,
                            error: error.message
                        });
                    }
                };
                
                port.start();
            };
        } else {
            // Regular Worker context (Android WebView): Use self.onmessage
            Logger.log('SharedAudioWorker', 'Running as regular Worker (Android mode)');
            
            self.onmessage = async (event) => {
                try {
                    // Wait for initialization to complete before processing
                    if (!this.isReady) {
                        Logger.log('SharedAudioWorker', 'Waiting for initialization...');
                        await this.initPromise;
                    }
                    
                    const response = await this.handleMessage(event.data);
                    self.postMessage(response);
                } catch (error) {
                    Logger.error('SharedAudioWorker', 'Error:', error);
                    self.postMessage({
                        type: MessageTypes.ERROR,
                        requestId: event.data.requestId,
                        error: error.message
                    });
                }
            };
        }
        
        // Start async initialization
        this.initPromise = this.init();
    }

    async init() {
        Logger.log('SharedAudioWorker', 'Initializing...');
        
        // Try to create Babylon scene for BVMD conversion
        try {
            this.scene = await BVMDConversionCore.createWorkerScene();
            if (this.scene) {
                Logger.log('SharedAudioWorker', 'BVMD conversion available');
            } else {
                Logger.warn('SharedAudioWorker', 'BVMD conversion not available, will fallback to main thread');
            }
        } catch (error) {
            Logger.error('SharedAudioWorker', 'Failed to initialize BVMD converter:', error);
        }
        
        this.isReady = true;
        Logger.log('SharedAudioWorker', 'Ready');
    }

    async handleMessage(message) {
        const { type, requestId } = message;
        
        Logger.log('SharedAudioWorker', `Received ${type}, request ${requestId}`);
        
        let data;
        
        switch (type) {
            case MessageTypes.KOKORO_INIT:
                data = await this.handleKokoroInit(message);
                break;
            case MessageTypes.KOKORO_GENERATE:
                data = await this.handleKokoroGenerate(message);
                break;
            case MessageTypes.KOKORO_CHECK_STATUS:
                data = await this.handleKokoroCheckStatus(message);
                break;
            case MessageTypes.KOKORO_LIST_VOICES:
                data = await this.handleKokoroListVoices(message);
                break;
            case MessageTypes.KOKORO_PING:
                data = await this.handleKokoroPing(message);
                break;
            case MessageTypes.KOKORO_GET_CACHE_SIZE:
                data = await this.handleKokoroGetCacheSize(message);
                break;
            case MessageTypes.KOKORO_CLEAR_CACHE:
                data = await this.handleKoroClearCache(message);
                break;
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
        
        Logger.log('SharedAudioWorker', `Handler completed, returning response for ${requestId}`);
        
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
            Logger.log('SharedAudioWorker', `Processing audio: ${audioData.length} samples @ ${sampleRate}Hz`);
            
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
                Logger.warn('SharedAudioWorker', 'BVMD conversion not available, returning VMD for main thread conversion');
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
            Logger.error('SharedAudioWorker', 'Processing failed:', error);
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
        
        Logger.log('SharedAudioWorker', 'Generating VMD from PCM...');
        
        try {
            // Convert array back to Float32Array if needed
            const pcmData = audioData instanceof Float32Array ? audioData : new Float32Array(audioData);
            
            // Generate VMD using core
            const vmdData = await VMDGenerationCore.generateVMDFromPCM(pcmData, sampleRate, modelName);
            
            Logger.log('SharedAudioWorker', `VMD generated: ${vmdData.byteLength} bytes`);
            
            return {
                vmdData,
                modelName: modelName || 'Model'
            };
        } catch (error) {
            Logger.error('SharedAudioWorker', 'VMD generation failed:', error);
            throw error;
        }
    }

    /**
     * Handle Kokoro TTS initialization
     * Input: { modelId, device }
     * Output: { initialized: boolean, message: string }
     */
    async handleKokoroInit(message) {
        const { modelId, device } = message.data;
        
        try {
            Logger.log('SharedAudioWorker', 'Initializing Kokoro TTS...', { modelId, device });
            
            // Pass config directly to KokoroTTSCore - it handles device/dtype mapping internally
            const initialized = await KokoroTTSCore.initialize({
                modelId: modelId || 'onnx-community/Kokoro-82M-v1.0-ONNX',
                device: device || 'wasm' // SharedWorker runs in worker context, KokoroTTSCore will force WASM
            }, (progress) => {
                // Send progress update to all connected ports
                const progressMessage = {
                    type: MessageTypes.KOKORO_DOWNLOAD_PROGRESS,
                    requestId: message.requestId,
                    data: {
                        loaded: progress.loaded,
                        total: progress.total,
                        percent: progress.percent,
                        file: progress.file
                    }
                };
                
                // Broadcast progress to all listeners
                if (this.isSharedWorker) {
                    // SharedWorker: broadcast to all ports
                    for (const port of this.ports) {
                        port.postMessage(progressMessage);
                    }
                } else {
                    // Regular Worker: post to main thread
                    self.postMessage(progressMessage);
                }
            });
            
            return {
                initialized,
                message: initialized ? 'Kokoro TTS initialized successfully' : 'Initialization failed'
            };
        } catch (error) {
            Logger.error('SharedAudioWorker', 'Kokoro initialization failed:', error);
            throw new Error(`Kokoro initialization failed: ${error.message}`);
        }
    }

    /**
     * Handle Kokoro speech generation
     * Input: { text, voice, speed }
     * Output: { audioBuffer: Array, duration: number, sampleRate: number }
     */
    async handleKokoroGenerate(message) {
        const { text, voice, speed } = message.data;
        
        try {
            // Validate text parameter
            if (!text || typeof text !== 'string' || text.trim().length === 0) {
                throw new Error(`Invalid text parameter: ${JSON.stringify(text)}`);
            }
            
            Logger.log('SharedAudioWorker', `Generating Kokoro speech for: "${text.substring(0, 50)}..."`);
            
            // Generate audio using KokoroTTSCore
            const audioBuffer = await KokoroTTSCore.generate(text, {
                voice: voice || 'af_heart',
                speed: speed !== undefined ? speed : 1.0
            });
            
            // Return as Array (ArrayBuffer doesn't transfer well via postMessage)
            return {
                audioBuffer: Array.from(new Uint8Array(audioBuffer)),
                duration: audioBuffer.byteLength / (24000 * 2), // Approximate duration (24kHz, 16-bit)
                sampleRate: 24000
            };
        } catch (error) {
            Logger.error('SharedAudioWorker', 'Kokoro generation failed:', error);
            throw new Error(`Kokoro generation failed: ${error.message}`);
        }
    }

    /**
     * Handle Kokoro status check
     * Output: { initialized, initializing, modelId, config }
     */
    async handleKokoroCheckStatus() {
        try {
            const status = KokoroTTSCore.getStatus();
            return status;
        } catch (error) {
            Logger.error('SharedAudioWorker', 'Kokoro status check failed:', error);
            throw new Error(`Kokoro status check failed: ${error.message}`);
        }
    }

    /**
     * Handle Kokoro voice list
     * Output: { voices: string[] }
     */
    async handleKokoroListVoices() {
        try {
            const voices = await KokoroTTSCore.listVoices();
            return { voices };
        } catch (error) {
            Logger.error('SharedAudioWorker', 'Kokoro list voices failed:', error);
            throw new Error(`Failed to list voices: ${error.message}`);
        }
    }

    /**
     * Handle Kokoro ping
     */
    async handleKokoroPing() {
        try {
            const alive = await KokoroTTSCore.ping();
            return { alive };
        } catch {
            // Silent failure for heartbeat
            return { alive: false };
        }
    }

    /**
     * Handle Kokoro cache size check
     * Called when user checks cache size from UI
     * Output: { usage: number, quota: number, databases: string[] }
     */
    async handleKokoroGetCacheSize() {
        try {
            const cacheInfo = await KokoroTTSCore.getCacheSize();
            return cacheInfo;
        } catch (error) {
            Logger.error('SharedAudioWorker', 'Kokoro cache size check failed:', error);
            throw new Error(`Failed to get cache size: ${error.message}`);
        }
    }

    /**
     * Handle Kokoro cache clear
     * Called when user clears cache from UI
     */
    async handleKoroClearCache() {
        try {
            await KokoroTTSCore.clearCache();
            return { cleared: true };
        } catch (error) {
            Logger.error('SharedAudioWorker', 'Kokoro cache clear failed:', error);
            throw new Error(`Failed to clear cache: ${error.message}`);
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
            Logger.error('SharedAudioWorker', 'Audio processing failed:', error);
            throw error;
        }
    }
}

// Initialize worker
new SharedAudioWorker();
