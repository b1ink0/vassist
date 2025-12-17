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

      if (!referenceText || referenceText.trim().length === 0) {
        throw new Error('Reference text is required');
      }

      const voiceData = {
        name: nameValidation.name,
        audioData: audioFile,
        referenceText: referenceText.trim(),
        language: language || 'en',
        metadata: {
          fileName: audioFile.name || 'audio.wav',
          fileType: audioFile.type,
          fileSize: audioFile.size,
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
   * @returns {Promise<Object>} - Voice data with audio blob
   */
  async getVoice(voiceId) {
    try {
      const voiceData = await storageServiceProxy.fileGet(voiceId, this.CATEGORY);
      
      if (!voiceData) {
        throw new Error(`Voice not found: ${voiceId}`);
      }

      return voiceData;
    } catch (error) {
      Logger.error('VoiceStorage', 'Failed to get voice:', error);
      throw error;
    }
  }

  /**
   * Get all voices
   * @returns {Promise<Array>} - Array of {id, data} objects
   */
  async getAllVoices() {
    try {
      const voices = await storageServiceProxy.fileGetAll(this.CATEGORY);
      return voices;
    } catch (error) {
      Logger.error('VoiceStorage', 'Failed to get voices:', error);
      throw error;
    }
  }

  /**
   * Delete a voice
   * @param {string} voiceId - Voice ID
   * @returns {Promise<void>}
   */
  async deleteVoice(voiceId) {
    try {
      await storageServiceProxy.fileDelete(voiceId, this.CATEGORY);
      Logger.log('VoiceStorage', `Voice deleted: ${voiceId}`);
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
        if (voice.data?.audioData?.size) {
          totalSize += voice.data.audioData.size;
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
