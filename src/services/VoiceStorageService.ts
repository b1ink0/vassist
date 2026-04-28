/**
 * Voice Storage Service
 * Manages GPT-SoVITS reference audio files in IndexedDB
 */

import storageServiceProxy from './proxies/StorageServiceProxy';
import Logger from './LoggerService';

type UnknownRecord = Record<string, unknown>;

interface VoiceMetadata extends UnknownRecord {
  fileName: string;
  fileType: string;
  fileSize: number;
  duration: number | null;
  uploadedAt: number;
  trained: boolean;
  checkpointPath: string | null;
  updatedAt?: number;
}

interface StoredVoice extends UnknownRecord {
  name: string;
  audioData: Blob;
  referenceText: string;
  language: string;
  metadata: VoiceMetadata;
}

type StoredVoiceWithId = StoredVoice & { id: string };

interface NameValidationResult {
  valid: boolean;
  error?: string;
  name?: string;
}

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null;

const normalizeVoice = (value: unknown): StoredVoice | null => {
  if (!isRecord(value) || !(value.audioData instanceof Blob)) {
    return null;
  }

  const metadata = isRecord(value.metadata) ? value.metadata : {};
  const normalizedMetadata: VoiceMetadata = {
    ...metadata,
    fileName: typeof metadata.fileName === 'string' ? metadata.fileName : 'audio.wav',
    fileType: typeof metadata.fileType === 'string' ? metadata.fileType : value.audioData.type,
    fileSize: typeof metadata.fileSize === 'number' ? metadata.fileSize : value.audioData.size,
    duration: typeof metadata.duration === 'number' ? metadata.duration : null,
    uploadedAt: typeof metadata.uploadedAt === 'number' ? metadata.uploadedAt : Date.now(),
    trained: metadata.trained === true,
    checkpointPath: typeof metadata.checkpointPath === 'string' ? metadata.checkpointPath : null,
  };
  if (typeof metadata.updatedAt === 'number') {
    normalizedMetadata.updatedAt = metadata.updatedAt;
  }

  return {
    ...value,
    name: typeof value.name === 'string' ? value.name : 'Unknown Voice',
    audioData: value.audioData,
    referenceText: typeof value.referenceText === 'string' ? value.referenceText : '',
    language: typeof value.language === 'string' ? value.language : 'en',
    metadata: normalizedMetadata,
  };
};

class VoiceStorageService {
  private readonly CATEGORY: string;
  private readonly MAX_NAME_LENGTH: number;
  private readonly MAX_FILE_SIZE: number;

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
  validateVoiceName(name: string): NameValidationResult {
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
  generateVoiceId(): string {
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
  async saveVoice(
    voiceId: string | null | undefined,
    voiceName: string,
    audioFile: Blob | File,
    referenceText: string,
    language: string,
    metadata: UnknownRecord = {},
  ): Promise<string> {
    try {
      const nameValidation = this.validateVoiceName(voiceName);
      if (!nameValidation.valid) {
        throw new Error(nameValidation.error);
      }
      const validatedName = nameValidation.name ?? voiceName.trim();

      if (!voiceId) {
        voiceId = this.generateVoiceId();
      }

      if (!(audioFile instanceof Blob)) {
        throw new Error('Invalid audio file format. Expected Blob or File.');
      }

      if (audioFile.size > this.MAX_FILE_SIZE) {
        throw new Error(`Audio file too large. Maximum size is ${this.MAX_FILE_SIZE / 1024 / 1024}MB`);
      }

      if (!referenceText || referenceText.trim().length === 0) {
        throw new Error('Reference text is required');
      }

      const voiceData = {
        name: validatedName,
        audioData: audioFile,
        referenceText: referenceText.trim(),
        language: language || 'en',
        metadata: {
          fileName: 'name' in audioFile && typeof (audioFile as { name?: unknown }).name === 'string'
            ? ((audioFile as { name: string }).name)
            : 'audio.wav',
          fileType: audioFile.type,
          fileSize: audioFile.size,
          duration: typeof metadata.duration === 'number' ? metadata.duration : null,
          uploadedAt: Date.now(),
          trained: false,
          checkpointPath: null,
          ...metadata
        }
      };

      await storageServiceProxy.fileSave(voiceId, voiceData, this.CATEGORY);

      Logger.log('VoiceStorage', `Voice saved: ${voiceId} (${validatedName})`);
      
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
  async getVoice(voiceId: string): Promise<StoredVoice | null> {
    try {
      const voiceData = await storageServiceProxy.fileLoad(voiceId);
      return normalizeVoice(voiceData);
    } catch (error) {
      Logger.error('VoiceStorage', `Failed to get voice ${voiceId}:`, error);
      return null;
    }
  }

  /**
   * Get all voices (including full blob data)
   * @returns {Promise<Array>} - Array of voice objects with IDs
   */
  async getAllVoices(): Promise<StoredVoiceWithId[]> {
    try {
      const allVoices = await storageServiceProxy.filesGetByCategory(this.CATEGORY);
      const allVoiceRecords = isRecord(allVoices) ? allVoices : {};
      
      const voicesArray = Object.entries(allVoiceRecords)
        .map(([id, data]) => {
          const voice = normalizeVoice(data);
          if (!voice) {
            return null;
          }
          return { id, ...voice };
        })
        .filter((voice): voice is StoredVoiceWithId => voice !== null);

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
  async deleteVoice(voiceId: string): Promise<boolean> {
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
  async updateVoiceMetadata(voiceId: string, updates: UnknownRecord): Promise<void> {
    try {
      const voiceData = await this.getVoice(voiceId);
      if (!voiceData) {
        throw new Error(`Voice ${voiceId} not found`);
      }
      
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
  async getTotalSize(): Promise<number> {
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
