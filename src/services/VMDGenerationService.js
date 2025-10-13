/**
 * VMD Generation Service
 * Converts audio to VMD lip sync data on the fly
 * Integrated with the Virtual Assistant's TTS system
 */

import { VMDFile } from './VMDHandler.js';
import { AudioProcessor } from './AudioProcessor.js';

export class VMDGenerationService {
    constructor() {
        this.audioProcessor = new AudioProcessor();
        this.config = {
            a_weight_multiplier: 1.2,
            i_weight_multiplier: 0.8,
            o_weight_multiplier: 1.1,
            u_weight_multiplier: 0.9,
            smoothness: 15,
            optimize_vmd: true
        };
        
        // Japanese vowel frequency ranges (in Hz)
        this.vowelRanges = {
            'あ': [800, 1200],   // A sound
            'い': [2300, 2700],  // I sound
            'う': [300, 700],    // U sound
            'お': [500, 900]     // O sound
        };
    }

    updateConfig(config) {
        this.config = { ...this.config, ...config };
    }

    /**
     * Generate VMD from audio blob (main entry point for TTS integration)
     * @param {Blob} audioBlob - Audio data from TTS
     * @param {string} modelName - Model name for VMD
     * @returns {Promise<ArrayBuffer>} VMD data
     */
    async generateVMDFromAudio(audioBlob, modelName = 'Model') {
        try {
            console.log('[VMDGen] Starting VMD generation from audio blob');
            
            // Step 1: Load audio
            const audioBuffer = await this.audioProcessor.loadAudioFromBlob(audioBlob);
            
            // Get audio data
            const audioData = audioBuffer.getChannelData(0); // Use first channel (mono)
            const sampleRate = audioBuffer.sampleRate;
            const duration = this.audioProcessor.getAudioDuration();
            
            console.log(`[VMDGen] Audio loaded: ${duration.toFixed(2)}s, ${sampleRate}Hz`);
            
            // Step 2: Compute spectrogram (now async with yields)
            const frameRate = 30; // VMD uses 30 fps
            const spectrogram = await this.audioProcessor.computeSpectrogram(audioData, sampleRate, frameRate);
            
            console.log(`[VMDGen] Spectrogram computed: ${spectrogram.data.length} frames`);
            
            // Calculate max energy for speech detection
            const maxEnergy = this.audioProcessor.getMaxEnergy(spectrogram.data);
            
            // Step 3: Analyze vowel frequencies
            const vowelWeights = this.audioProcessor.analyzeVowelFrequencies(
                spectrogram,
                this.vowelRanges
            );
            
            // Step 4: Apply smoothing
            const smoothness = this.config.smoothness || 15;
            const smoothedWeights = this.audioProcessor.smoothVowelWeights(vowelWeights, smoothness);
            
            console.log(`[VMDGen] Applied smoothing with window size: ${smoothness}`);
            
            // Step 5: Create VMD file with energy detection
            const vmd = new VMDFile(modelName);
            
            // Add morph frames with gradual energy scaling
            // Yield to main thread every 100 frames to prevent blocking
            for (let frame = 0; frame < smoothedWeights.length; frame++) {
                // Yield to main thread periodically
                if (frame % 100 === 0 && frame > 0) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
                
                // Calculate energy for this frame
                const frameEnergy = this.audioProcessor.getFrameEnergy(spectrogram.data[frame]);
                
                // Gradual energy scale
                const energyScale = Math.min(Math.sqrt(frameEnergy / maxEnergy), 1.0);
                
                // Adjust weights
                const weights = this.audioProcessor.adjustVowelWeights(
                    smoothedWeights[frame],
                    this.config
                );
                
                // Add frames for each vowel with energy scaling
                for (const [vowel, weight] of Object.entries(weights)) {
                    const scaledWeight = Math.min(weight * energyScale, 1.0);
                    vmd.addMorphFrame(vowel, frame, scaledWeight);
                }
            }
            
            // Step 6: Optimize VMD
            if (this.config.optimize_vmd) {
                this.optimizeVMD(vmd);
            }
            
            // Step 7: Save VMD file
            const vmdData = vmd.save();
            
            console.log(`[VMDGen] VMD generated: ${vmdData.byteLength} bytes, ${vmd.morphFrames.length} frames`);
            
            return vmdData;
            
        } catch (error) {
            console.error('[VMDGen] Error generating VMD:', error);
            throw error;
        }
    }

    /**
     * Generate VMD from ArrayBuffer
     * @param {ArrayBuffer} audioBuffer - Audio data
     * @param {string} modelName - Model name for VMD
     * @returns {Promise<ArrayBuffer>} VMD data
     */
    async generateVMDFromArrayBuffer(audioBuffer, modelName = 'Model') {
        // Convert ArrayBuffer to Blob
        const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });
        return this.generateVMDFromAudio(audioBlob, modelName);
    }

    /**
     * Optimize VMD data by removing unnecessary frames
     */
    optimizeVMD(vmd) {
        const isKeyframe = (v1, v2, v3) => {
            return (v1 > v2 && v1 > v3) || (v1 < v2 && v1 < v3) ||
                   (v1 === 0 && (v2 !== 0 || v3 !== 0)) || 
                   (v1 === 1 && (v2 !== 1 || v3 !== 1)) ||
                   (v1 < 0.0099 && ((v2 > 0.0099 && v2 > v1) || (v3 > 0.0099 && v3 > v1)));
        };

        const optimizedFrames = [];
        const vowelFrames = {
            'あ': [],
            'い': [],
            'う': [],
            'お': []
        };

        // Group frames by vowel
        for (const frame of vmd.morphFrames) {
            if (vowelFrames[frame.name]) {
                vowelFrames[frame.name].push(frame);
            } else {
                optimizedFrames.push(frame);
            }
        }

        // Optimize each vowel's frames
        for (const [_vowel, frames] of Object.entries(vowelFrames)) {
            if (frames.length === 0) continue;
            
            // Sort by frame number
            frames.sort((a, b) => a.frame - b.frame);
            
            // Always keep first and last two frames
            optimizedFrames.push(...frames.slice(0, 2));
            if (frames.length > 2) {
                optimizedFrames.push(...frames.slice(-2));
            }
            
            // Check intermediate frames
            for (let i = 2; i < frames.length - 2; i++) {
                if (!frames.every(f => f.weight === 0) && 
                    isKeyframe(frames[i].weight, frames[i-1].weight, frames[i+1].weight)) {
                    optimizedFrames.push(frames[i]);
                }
            }
        }

        // Update VMD with optimized frames
        vmd.morphFrames = optimizedFrames.sort((a, b) => a.frame - b.frame);
        
        console.log(`[VMDGen] Optimized: ${vmd.morphFrames.length} frames kept`);
    }

    /**
     * Create a blob URL from VMD data
     */
    createVMDBlobURL(vmdData) {
        const blob = new Blob([vmdData], { type: 'application/octet-stream' });
        return URL.createObjectURL(blob);
    }

    /**
     * Download VMD file (for debugging)
     */
    downloadVMD(vmdData, filename = 'lipsync.vmd') {
        const blob = new Blob([vmdData], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// Create singleton instance
export const vmdGenerationService = new VMDGenerationService();
