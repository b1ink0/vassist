/**
 * @fileoverview Emote Storage Service 
 */

import storageServiceProxy from './proxies/StorageServiceProxy';
import Logger from './LoggerService';

class EmoteStorageService {
  constructor() {
    this.CATEGORY = 'emote';
    this.MAX_NAME_LENGTH = 50;
  }

  /**
   * Validate emote name
   * @param {string} name - Emote name to validate
   * @returns {Object} - { valid: boolean, error: string, name: string }
   */
  validateEmoteName(name) {
    if (!name || typeof name !== 'string') {
      return { valid: false, error: 'Emote name is required' };
    }

    const trimmed = name.trim();
    
    if (trimmed.length === 0) {
      return { valid: false, error: 'Emote name cannot be empty' };
    }

    if (trimmed.length > this.MAX_NAME_LENGTH) {
      return { valid: false, error: `Emote name cannot exceed ${this.MAX_NAME_LENGTH} characters` };
    }

    return { valid: true, name: trimmed };
  }

  /**
   * Generate unique emote ID
   * @returns {string} - UUID
   */
  generateEmoteId() {
    return `emote_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Save an emote to storage (audio + motion together)
   * @param {string} emoteId - Unique emote ID (or null to generate)
   * @param {string} emoteName - User-editable emote name
   * @param {Blob|ArrayBuffer} audioData - Audio file data (MP3, WAV, OGG, etc.)
   * @param {Blob|ArrayBuffer} motionData - BVMD motion data
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<string>} - Emote ID
   */
  async saveEmote(emoteId, emoteName, audioData, motionData, metadata = {}) {
    try {
      const nameValidation = this.validateEmoteName(emoteName);
      if (!nameValidation.valid) {
        throw new Error(nameValidation.error);
      }

      if (!emoteId) {
        emoteId = this.generateEmoteId();
      }

      // Convert audio to Blob if needed
      let audioBlob;
      if (audioData instanceof ArrayBuffer) {
        audioBlob = new Blob([audioData], { type: metadata.audioMimeType || 'audio/mpeg' });
      } else if (audioData instanceof Blob) {
        audioBlob = audioData;
      } else {
        throw new Error('Invalid audio data format. Expected Blob or ArrayBuffer.');
      }

      // Convert motion to Blob if needed
      let motionBlob;
      if (motionData instanceof ArrayBuffer) {
        motionBlob = new Blob([motionData], { type: 'application/octet-stream' });
      } else if (motionData instanceof Blob) {
        motionBlob = motionData;
      } else {
        throw new Error('Invalid motion data format. Expected Blob or ArrayBuffer.');
      }

      const emoteData = {
        name: nameValidation.name,
        audioData: audioBlob,
        motionData: motionBlob,
        metadata: {
          originalAudioFileName: metadata.originalAudioFileName || 'unknown.mp3',
          originalMotionFileName: metadata.originalMotionFileName || 'unknown.vmd',
          uploadedAt: Date.now(),
          audioSize: audioBlob.size,
          motionSize: motionBlob.size,
          audioMimeType: audioBlob.type || 'audio/mpeg',
          ...metadata
        }
      };

      await storageServiceProxy.fileSave(emoteId, emoteData, this.CATEGORY);

      Logger.log('EmoteStorage', `Emote saved: ${emoteId} (${nameValidation.name})`);
      
      return emoteId;
    } catch (error) {
      Logger.error('EmoteStorage', 'Failed to save emote:', error);
      throw error;
    }
  }

  /**
   * Get an emote by ID
   * @param {string} emoteId - Emote ID
   * @returns {Promise<Object|null>} - Emote data or null
   */
  async getEmote(emoteId) {
    try {
      const emoteData = await storageServiceProxy.fileLoad(emoteId);
      return emoteData || null;
    } catch (error) {
      Logger.error('EmoteStorage', `Failed to get emote ${emoteId}:`, error);
      return null;
    }
  }

  /**
   * Get all emotes (including full blob data)
   * Only use when you need the actual emote data
   * @returns {Promise<Array>} - Array of complete emote objects
   */
  async getAllEmotes() {
    try {
      const allEmotes = await storageServiceProxy.filesGetByCategory(this.CATEGORY);
      
      const emotesArray = Object.entries(allEmotes).map(([id, data]) => ({
        id,
        ...data
      }));

      return emotesArray;
    } catch (error) {
      Logger.error('EmoteStorage', 'Failed to get all emotes:', error);
      return [];
    }
  }

  /**
   * Get emotes list (lightweight, no blob data)
   * Returns only IDs and metadata for fast listing
   * @returns {Promise<Array>} - Array of emote info without blob data
   */
  async getEmotesList() {
    try {
      const emotesMetadata = await storageServiceProxy.filesGetMetadataByCategory(this.CATEGORY);
      
      const emotesList = Object.entries(emotesMetadata).map(([id, data]) => ({
        id,
        name: data.value?.name || 'Unknown Emote',
        metadata: data.value?.metadata || {
          originalAudioFileName: 'unknown.mp3',
          originalMotionFileName: 'unknown.vmd',
          uploadedAt: 0,
          audioSize: 0,
          motionSize: 0,
          audioMimeType: 'audio/mpeg'
        },
      }));

      Logger.log('EmoteStorage', `Retrieved ${emotesList.length} emotes (metadata only)`);
      return emotesList;
    } catch (error) {
      Logger.error('EmoteStorage', 'Failed to get emotes list:', error);
      return [];
    }
  }

  /**
   * Update emote name
   * @param {string} emoteId - Emote ID
   * @param {string} newName - New emote name
   * @returns {Promise<boolean>} - Success status
   */
  async updateEmoteName(emoteId, newName) {
    try {
      const nameValidation = this.validateEmoteName(newName);
      if (!nameValidation.valid) {
        throw new Error(nameValidation.error);
      }

      const emote = await this.getEmote(emoteId);
      if (!emote) {
        throw new Error(`Emote ${emoteId} not found`);
      }

      emote.name = nameValidation.name;

      if (!emote.metadata) {
        emote.metadata = {};
      }
      emote.metadata.lastRenamed = Date.now();

      await storageServiceProxy.fileSave(emoteId, emote, this.CATEGORY);

      Logger.log('EmoteStorage', `Emote ${emoteId} renamed to: ${nameValidation.name}`);
      return true;
    } catch (error) {
      Logger.error('EmoteStorage', 'Failed to update emote name:', error);
      throw error;
    }
  }

  /**
   * Delete an emote
   * @param {string} emoteId - Emote ID
   * @returns {Promise<boolean>} - Success status
   */
  async deleteEmote(emoteId) {
    try {
      const emote = await this.getEmote(emoteId);
      if (!emote) {
        throw new Error(`Emote ${emoteId} not found`);
      }

      await storageServiceProxy.fileDelete(emoteId, this.CATEGORY);

      Logger.log('EmoteStorage', `Emote ${emoteId} deleted`);
      return true;
    } catch (error) {
      Logger.error('EmoteStorage', 'Failed to delete emote:', error);
      throw error;
    }
  }
}

// Export singleton instance
const emoteStorageService = new EmoteStorageService();
export default emoteStorageService;
