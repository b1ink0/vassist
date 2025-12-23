/**
 * Voice Storage Service
 * Manages GPT-SoVITS reference audio files in IndexedDB
 */

import storageServiceProxy from './proxies/StorageServiceProxy';
import Logger from './LoggerService';

class VoiceStorageService {
  constructor() {
    this.CATEGORY = 'voice';
    this.MAX_NAME_LENGTH = 50;
    this.MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB max
  }

  /**
   * Validate voice name
   * @param {string} name - Voice name to validate
   * @returns {Object} - { valid: boolean, error: string }
   */
  validateVoiceName(name) {
    if (!name || typeof name !== 'string') {
      return { valid: false, error: 'Voice name is required' };
    }

    const trimmed = name.trim();
    
    if (trimmed.length === 0) {
      return { valid: false, error: 'Voice name cannot be empty' };
    }

    if (trimmed.length > this.MAX_NAME_LENGTH) {
      return { valid: false, error: `Voice name cannot exceed ${this.MAX_NAME_LENGTH} characters` };
    }

    return { valid: true, name: trimmed };
  }

  /**
   * Generate unique voice ID
   * @returns {string} - UUID
   */
  generateVoiceId() {
    return `voice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Convert AudioBuffer to WAV Blob
   * @param {AudioBuffer} audioBuffer - Audio buffer to convert
   * @returns {Promise<Blob>} - WAV blob
   */
  async audioBufferToWav(audioBuffer) {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numberOfChannels * bytesPerSample;
    
    const data = [];
    for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
      data.push(audioBuffer.getChannelData(i));
    }
    
    const interleaved = new Float32Array(audioBuffer.length * numberOfChannels);
    for (let src = 0, dst = 0; src < audioBuffer.length; src++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        interleaved[dst++] = data[channel][src];
      }
    }
    
    const dataLength = interleaved.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);
    
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    // RIFF header
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(8, 'WAVE');
    
    // fmt chunk
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // chunk size
    view.setUint16(20, format, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    
    // data chunk
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);
    
    // Write PCM samples
    let offset = 44;
    for (let i = 0; i < interleaved.length; i++) {
      const sample = Math.max(-1, Math.min(1, interleaved[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
    
    return new Blob([buffer], { type: 'audio/wav' });
  }

  /**
   * Save a voice reference to storage
   * @param {string} voiceId - Unique voice ID (or null to generate)
   * @param {string} voiceName - User-editable voice name
   * @param {Blob|File} audioFile - Audio file (mp3, wav, etc.)
   * @param {string} referenceText - Text spoken in the audio
   * @param {string} language - Language code (en, zh, ja, ko, yue)
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<string>} - Voice ID
   */
  async saveVoice(voiceId, voiceName, audioFile, referenceText, language, metadata = {}) {
    try {
      const nameValidation = this.validateVoiceName(voiceName);
      if (!nameValidation.valid) {
        throw new Error(nameValidation.error);
      }

      if (!voiceId) {
        voiceId = this.generateVoiceId();
      }

      if (!audioFile || !(audioFile instanceof Blob || audioFile instanceof File)) {
        throw new Error('Invalid audio file format. Expected Blob or File.');
      }

      if (audioFile.size > this.MAX_FILE_SIZE) {
        throw new Error(`Audio file too large. Maximum size is ${this.MAX_FILE_SIZE / 1024 / 1024}MB`);
      }

      // Convert to WAV if not already WAV (for Rust GPT-SoVITS compatibility)
      let processedAudioFile = audioFile;
      if (!audioFile.type.includes('wav')) {
        try {
          Logger.log('VoiceStorage', `Converting ${audioFile.type} to WAV format...`);
          const audioContext = new (window.AudioContext || window.webkitAudioContext)();
          const arrayBuffer = await audioFile.arrayBuffer();
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          
          // Convert to WAV
          const wavBlob = await this.audioBufferToWav(audioBuffer);
          processedAudioFile = new File([wavBlob], audioFile.name.replace(/\.[^.]+$/, '.wav'), { type: 'audio/wav' });
          Logger.log('VoiceStorage', `Converted to WAV: ${processedAudioFile.size} bytes`);
        } catch (error) {
          Logger.warn('VoiceStorage', 'Failed to convert to WAV, storing original:', error);
          // If conversion fails, store original
        }
      }

      if (!referenceText || referenceText.trim().length === 0) {
        throw new Error('Reference text is required');
      }

      const voiceData = {
        name: nameValidation.name,
        audioData: processedAudioFile,
        referenceText: referenceText.trim(),
        language: language || 'en',
        metadata: {
          fileName: processedAudioFile.name || 'audio.wav',
          fileType: processedAudioFile.type,
          fileSize: processedAudioFile.size,
          duration: metadata.duration || null,
          uploadedAt: Date.now(),
          trained: false,
          checkpointPath: null,
          ...metadata
        }
      };

      await storageServiceProxy.fileSave(voiceId, voiceData, this.CATEGORY);

      Logger.log('VoiceStorage', `Voice saved: ${voiceId} (${nameValidation.name})`);
      
      return voiceId;
    } catch (error) {
      Logger.error('VoiceStorage', 'Failed to save voice:', error);
      throw error;
    }
  }

  /**
   * Get a voice by ID
   * @param {string} voiceId - Voice ID
   * @returns {Promise<Object|null>} - Voice data or null
   */
  async getVoice(voiceId) {
    try {
      const voiceData = await storageServiceProxy.fileLoad(voiceId);
      return voiceData || null;
    } catch (error) {
      Logger.error('VoiceStorage', `Failed to get voice ${voiceId}:`, error);
      return null;
    }
  }

  /**
   * Get all voices (including full blob data)
   * @returns {Promise<Array>} - Array of voice objects with IDs
   */
  async getAllVoices() {
    try {
      const allVoices = await storageServiceProxy.filesGetByCategory(this.CATEGORY);
      
      const voicesArray = Object.entries(allVoices).map(([id, data]) => ({
        id,
        ...data
      }));

      Logger.log('VoiceStorage', `Retrieved ${voicesArray.length} voices`);
      return voicesArray;
    } catch (error) {
      Logger.error('VoiceStorage', 'Failed to get all voices:', error);
      return [];
    }
  }

  /**
   * Delete a voice
   * @param {string} voiceId - Voice ID
   * @returns {Promise<boolean>} - Success status
   */
  async deleteVoice(voiceId) {
    try {
      await storageServiceProxy.fileRemove(voiceId);
      Logger.log('VoiceStorage', `Voice deleted: ${voiceId}`);
      return true;
    } catch (error) {
      Logger.error('VoiceStorage', 'Failed to delete voice:', error);
      throw error;
    }
  }

  /**
   * Update voice metadata (e.g., after training)
   * @param {string} voiceId - Voice ID
   * @param {Object} updates - Metadata updates
   * @returns {Promise<void>}
   */
  async updateVoiceMetadata(voiceId, updates) {
    try {
      const voiceData = await this.getVoice(voiceId);
      
      voiceData.metadata = {
        ...voiceData.metadata,
        ...updates,
        updatedAt: Date.now()
      };

      await storageServiceProxy.fileSave(voiceId, voiceData, this.CATEGORY);
      Logger.log('VoiceStorage', `Voice metadata updated: ${voiceId}`);
    } catch (error) {
      Logger.error('VoiceStorage', 'Failed to update voice metadata:', error);
      throw error;
    }
  }

  /**
   * Get total storage size for voices
   * @returns {Promise<number>} - Total size in bytes
   */
  async getTotalSize() {
    try {
      const voices = await this.getAllVoices();
      let totalSize = 0;
      
      for (const voice of voices) {
        if (voice.audioData?.size) {
          totalSize += voice.audioData.size;
        }
      }
      
      return totalSize;
    } catch (error) {
      Logger.error('VoiceStorage', 'Failed to get total size:', error);
      return 0;
    }
  }
}

// Create singleton instance
const voiceStorageService = new VoiceStorageService();

export default voiceStorageService;
