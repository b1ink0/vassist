/**
 * VMD Generation Core
 * Worker-safe VMD generation logic (no AudioContext required)
 * Used by both offscreen worker and SharedWorker
 */

import { VMDFile } from '../../services/VMDHandler.js';
import { AudioProcessingCore } from './AudioProcessingCore.js';

export class VMDGenerationCore {
    static defaultConfig = {
        a_weight_multiplier: 2.7,
        i_weight_multiplier: 1,
        o_weight_multiplier: 2.7,
        u_weight_multiplier: 2.5,
        smoothness: 30,
        optimize_vmd: true
    };

    // Japanese vowel frequency ranges (in Hz)
    static vowelRanges = {
        'あ': [800, 1200],   // A sound
        'い': [2300, 2700],  // I sound
        'う': [300, 700],    // U sound
        'お': [500, 900]     // O sound
    };

    /**
     * Generate VMD from decoded audio data (PCM)
     * @param {Float32Array} audioData - Decoded PCM audio samples
     * @param {number} sampleRate - Sample rate of audio
     * @param {string} modelName - Model name for VMD
     * @param {Object} config - Generation configuration
     * @returns {Promise<ArrayBuffer>} VMD data
     */
    static async generateVMDFromPCM(audioData, sampleRate, modelName = 'Model', config = {}) {
        try {
            const mergedConfig = { ...VMDGenerationCore.defaultConfig, ...config };
            
            console.log(`[VMDGenCore] Generating VMD from PCM: ${audioData.length} samples @ ${sampleRate}Hz`);
            
            // Step 1: Compute spectrogram (async with yields)
            const frameRate = 30; // VMD uses 30 fps
            const spectrogram = await AudioProcessingCore.computeSpectrogram(audioData, sampleRate, frameRate);
            
            console.log(`[VMDGenCore] Spectrogram computed: ${spectrogram.data.length} frames`);
            
            // Calculate max energy for speech detection
            const maxEnergy = AudioProcessingCore.getMaxEnergy(spectrogram.data);
            
            // Step 2: Analyze vowel frequencies
            const vowelWeights = AudioProcessingCore.analyzeVowelFrequencies(
                spectrogram,
                VMDGenerationCore.vowelRanges
            );
            
            // Step 3: Apply smoothing
            const smoothness = mergedConfig.smoothness || 15;
            const smoothedWeights = AudioProcessingCore.smoothVowelWeights(vowelWeights, smoothness);
            
            console.log(`[VMDGenCore] Applied smoothing with window size: ${smoothness}`);
            
            // Step 4: Create VMD file with energy detection
            const vmd = new VMDFile(modelName);
            
            // Add morph frames with gradual energy scaling
            // Yield to event loop every 100 frames to prevent blocking
            for (let frame = 0; frame < smoothedWeights.length; frame++) {
                // Yield to event loop periodically
                if (frame % 100 === 0 && frame > 0) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
                
                // Calculate energy for this frame
                const frameEnergy = AudioProcessingCore.getFrameEnergy(spectrogram.data[frame]);
                
                // Gradual energy scale
                const energyScale = Math.min(Math.sqrt(frameEnergy / maxEnergy), 1.0);
                
                // Adjust weights
                const weights = AudioProcessingCore.adjustVowelWeights(
                    smoothedWeights[frame],
                    mergedConfig
                );
                
                // Add frames for each vowel with energy scaling
                for (const [vowel, weight] of Object.entries(weights)) {
                    const scaledWeight = Math.min(weight * energyScale, 1.0);
                    vmd.addMorphFrame(vowel, frame, scaledWeight);
                }
            }
            
            // Step 5: Optimize VMD
            if (mergedConfig.optimize_vmd) {
                VMDGenerationCore.optimizeVMD(vmd);
            }
            
            // Step 6: Save VMD file
            const vmdData = vmd.save();
            
            console.log(`[VMDGenCore] VMD generated: ${vmdData.byteLength} bytes, ${vmd.morphFrames.length} frames`);
            
            return vmdData;
            
        } catch (error) {
            console.error('[VMDGenCore] Error generating VMD:', error);
            throw error;
        }
    }

    /**
     * Optimize VMD data by removing unnecessary frames
     */
    static optimizeVMD(vmd) {
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
        
        console.log(`[VMDGenCore] Optimized: ${vmd.morphFrames.length} frames kept`);
    }
}
