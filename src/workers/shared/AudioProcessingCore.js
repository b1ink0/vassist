/**
 * Audio Processing Core
 * Pure algorithmic audio processing functions that work without AudioContext
 * Used by both offscreen worker and SharedWorker
 */

export class AudioProcessingCore {
    /**
     * Compute spectrogram using FFT
     * @param {Float32Array} audioData - Audio samples
     * @param {number} sampleRate - Sample rate
     * @param {number} frameRate - Target frame rate (30 fps for VMD)
     * @returns {Promise<Object>} Spectrogram data
     */
    static async computeSpectrogram(audioData, sampleRate, frameRate = 30) {
        const windowSize = Math.floor(sampleRate / frameRate);
        const numFrames = Math.floor(audioData.length / windowSize);
        const fftSize = AudioProcessingCore.nextPowerOf2(windowSize);
        
        // Prepare output arrays
        const frequencies = [];
        const times = [];
        const spectrogramData = [];
        
        // Calculate frequency bins
        for (let i = 0; i < fftSize / 2; i++) {
            frequencies.push((i * sampleRate) / fftSize);
        }
        
        // Process each frame
        // Yield to main thread every 50 frames to prevent blocking
        for (let frame = 0; frame < numFrames; frame++) {
            // Yield to event loop periodically
            if (frame % 50 === 0 && frame > 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
            
            const startIdx = frame * windowSize;
            const endIdx = Math.min(startIdx + windowSize, audioData.length);
            const frameData = audioData.slice(startIdx, endIdx);
            
            // Apply Hanning window
            const windowedData = AudioProcessingCore.applyHanningWindow(frameData, windowSize);
            
            // Compute FFT
            const magnitudes = AudioProcessingCore.computeFFT(windowedData, fftSize);
            
            spectrogramData.push(magnitudes);
            times.push(frame / frameRate);
        }
        
        return {
            frequencies,
            times,
            data: spectrogramData
        };
    }

    /**
     * Apply Hanning window to reduce spectral leakage
     */
    static applyHanningWindow(data, size) {
        const windowed = new Float32Array(size);
        for (let i = 0; i < data.length; i++) {
            const windowValue = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
            windowed[i] = data[i] * windowValue;
        }
        return windowed;
    }

    /**
     * Compute FFT (simplified implementation)
     */
    static computeFFT(data, fftSize) {
        const paddedData = new Float32Array(fftSize * 2);
        for (let i = 0; i < data.length; i++) {
            paddedData[i * 2] = data[i];
            paddedData[i * 2 + 1] = 0;
        }
        
        const fftResult = AudioProcessingCore.fft(paddedData, fftSize);
        
        const magnitudes = [];
        for (let i = 0; i < fftSize / 2; i++) {
            const real = fftResult[i * 2];
            const imag = fftResult[i * 2 + 1];
            magnitudes.push(Math.sqrt(real * real + imag * imag));
        }
        
        return magnitudes;
    }

    static fft(data, size) {
        // Simplified FFT implementation
        if (size === 1) return data;
        
        const halfSize = size / 2;
        const even = new Float32Array(halfSize * 2);
        const odd = new Float32Array(halfSize * 2);
        
        for (let i = 0; i < halfSize; i++) {
            even[i * 2] = data[i * 4];
            even[i * 2 + 1] = data[i * 4 + 1];
            odd[i * 2] = data[i * 4 + 2];
            odd[i * 2 + 1] = data[i * 4 + 3];
        }
        
        const fftEven = AudioProcessingCore.fft(even, halfSize);
        const fftOdd = AudioProcessingCore.fft(odd, halfSize);
        
        const result = new Float32Array(size * 2);
        for (let i = 0; i < halfSize; i++) {
            const angle = -2 * Math.PI * i / size;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            
            const oddReal = fftOdd[i * 2];
            const oddImag = fftOdd[i * 2 + 1];
            
            const tReal = cos * oddReal - sin * oddImag;
            const tImag = sin * oddReal + cos * oddImag;
            
            result[i * 2] = fftEven[i * 2] + tReal;
            result[i * 2 + 1] = fftEven[i * 2 + 1] + tImag;
            
            result[(i + halfSize) * 2] = fftEven[i * 2] - tReal;
            result[(i + halfSize) * 2 + 1] = fftEven[i * 2 + 1] - tImag;
        }
        
        return result;
    }

    static nextPowerOf2(n) {
        return Math.pow(2, Math.ceil(Math.log2(n)));
    }

    /**
     * Analyze vowel frequencies in spectrogram
     * @param {Object} spectrogram - Spectrogram data
     * @param {Object} vowelRanges - Frequency ranges for each vowel
     * @returns {Array} Vowel weights for each frame
     */
    static analyzeVowelFrequencies(spectrogram, vowelRanges) {
        const { frequencies, data } = spectrogram;
        const vowelWeights = [];
        
        for (let frameIdx = 0; frameIdx < data.length; frameIdx++) {
            const frameMagnitudes = data[frameIdx];
            const weights = {};
            
            // Calculate weight for each vowel
            for (const [vowel, [lowFreq, highFreq]] of Object.entries(vowelRanges)) {
                const lowIdx = AudioProcessingCore.findFrequencyIndex(frequencies, lowFreq);
                const highIdx = AudioProcessingCore.findFrequencyIndex(frequencies, highFreq);
                
                let sum = 0;
                let count = 0;
                for (let i = lowIdx; i <= highIdx && i < frameMagnitudes.length; i++) {
                    sum += frameMagnitudes[i];
                    count++;
                }
                
                weights[vowel] = count > 0 ? sum / count : 0;
            }
            
            // Normalize weights
            const total = Object.values(weights).reduce((a, b) => a + b, 0);
            if (total > 0) {
                for (const vowel in weights) {
                    weights[vowel] /= total;
                }
            }
            
            vowelWeights.push(weights);
        }
        
        return vowelWeights;
    }

    static findFrequencyIndex(frequencies, targetFreq) {
        let closestIdx = 0;
        let minDiff = Math.abs(frequencies[0] - targetFreq);
        
        for (let i = 1; i < frequencies.length; i++) {
            const diff = Math.abs(frequencies[i] - targetFreq);
            if (diff < minDiff) {
                minDiff = diff;
                closestIdx = i;
            }
        }
        
        return closestIdx;
    }

    /**
     * Apply smoothing to vowel weights
     * @param {Array} vowelWeights - Raw vowel weights
     * @param {number} windowSize - Smoothing window size
     * @returns {Array} Smoothed vowel weights
     */
    static smoothVowelWeights(vowelWeights, windowSize = 15) {
        const smoothed = [];
        
        // First pass: Moving average smoothing
        for (let i = 0; i < vowelWeights.length; i++) {
            const start = Math.max(0, i - Math.floor(windowSize / 2));
            const end = Math.min(vowelWeights.length, i + Math.ceil(windowSize / 2));
            
            const weights = {};
            const vowels = Object.keys(vowelWeights[0]);
            
            for (const vowel of vowels) {
                let sum = 0;
                for (let j = start; j < end; j++) {
                    sum += vowelWeights[j][vowel];
                }
                weights[vowel] = sum / (end - start);
            }
            
            smoothed.push(weights);
        }
        
        // Second pass: Exponential smoothing
        const alpha = 0.2;
        const exponentialSmoothed = [smoothed[0]];
        
        for (let i = 1; i < smoothed.length; i++) {
            const weights = {};
            const vowels = Object.keys(smoothed[0]);
            
            for (const vowel of vowels) {
                const newValue = alpha * smoothed[i][vowel] + (1 - alpha) * exponentialSmoothed[i - 1][vowel];
                
                // Prevent sudden drops
                const previousValue = exponentialSmoothed[i - 1][vowel];
                if (newValue < previousValue * 0.5 && previousValue > 0.2) {
                    weights[vowel] = previousValue * 0.7;
                } else {
                    weights[vowel] = newValue;
                }
            }
            
            exponentialSmoothed.push(weights);
        }
        
        return exponentialSmoothed;
    }

    /**
     * Calculate total energy for a single frame
     */
    static getFrameEnergy(frameData) {
        return frameData.reduce((sum, val) => sum + val, 0);
    }

    /**
     * Calculate maximum energy across all frames
     */
    static getMaxEnergy(spectrogramData) {
        let maxEnergy = 0;
        for (const frameData of spectrogramData) {
            const energy = AudioProcessingCore.getFrameEnergy(frameData);
            if (energy > maxEnergy) {
                maxEnergy = energy;
            }
        }
        return maxEnergy;
    }

    /**
     * Adjust vowel weights based on configuration
     */
    static adjustVowelWeights(weights, config) {
        const adjusted = { ...weights };
        
        adjusted['あ'] *= (adjusted['あ'] > 0.3 ? config.a_weight_multiplier : 1);
        adjusted['お'] *= (adjusted['お'] > 0.3 ? config.o_weight_multiplier : 1);
        adjusted['い'] *= config.i_weight_multiplier;
        adjusted['う'] *= config.u_weight_multiplier;
        
        // Normalize
        const total = Object.values(adjusted).reduce((a, b) => a + b, 0);
        if (total > 0) {
            for (const vowel in adjusted) {
                adjusted[vowel] /= total;
            }
        }
        
        return adjusted;
    }
}
