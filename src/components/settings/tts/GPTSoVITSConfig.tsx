/**
 * GPT-SoVITS TTS Configuration Component
 * Reusable component for voice cloning setup (used in both setup wizard and settings)
 */

import { useState, useEffect, useRef } from 'react';
import { Icon } from '../../icons';
import Toggle from '../../common/Toggle';
import { GPTSoVITSLanguages } from '../../../config/aiConfig';

const GPTSOVITS_LANG_OPTIONS = [
  { value: GPTSoVITSLanguages.ENGLISH, label: 'English' },
  { value: GPTSoVITSLanguages.CHINESE, label: 'Chinese' },
  { value: GPTSoVITSLanguages.JAPANESE, label: 'Japanese' },
  { value: GPTSoVITSLanguages.KOREAN, label: 'Korean' },
  { value: GPTSoVITSLanguages.CANTONESE, label: 'Cantonese' },
];
import voiceStorageService from '../../../services/VoiceStorageService';
import Logger from '../../../services/LoggerService';
import GPTSoVITSSetup from './GPTSoVITSSetup';
import { isDesktop } from '../../../utils/PlatformUtils';
import { cn } from '../../../utils/cn';
import { Button, Input, Select } from '../../ui';

interface VoiceItem {
  id: string;
  name: string;
  audioData: Blob;
  referenceText: string;
  language: string;
  metadata: Record<string, unknown>;
}

interface GPTSoVITSConfigShape {
  referenceVoiceId?: string | null;
  referenceText?: string;
  referenceLanguage?: string;
  speed?: number;
  topK?: number;
  topP?: number;
  temperature?: number;
  pytorchBackend?: string;
}

interface GPTSoVITSConfigProps {
  config: GPTSoVITSConfigShape;
  onChange?: (field: string, value: string | number | null) => void;
  showTitle?: boolean;
  isSetupMode?: boolean;
  onRequestDeleteVoiceDialog?: ((voiceId: string) => void) | undefined;
  refreshTrigger?: unknown;
  isLightBackground?: boolean;
  skipSetup?: boolean;
  errorMessage?: string;
  setErrorMessage?: (message: string) => void;
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

const getAudioDuration = (file: File): Promise<number> => {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.addEventListener('loadedmetadata', () => {
      resolve(audio.duration);
    });
    audio.addEventListener('error', (error) => {
      reject(error);
    });
    audio.src = URL.createObjectURL(file);
  });
};

const GPTSoVITSConfig = ({
  config,
  onChange,
  showTitle = true,
  isSetupMode = false,
  onRequestDeleteVoiceDialog,
  refreshTrigger,
  isLightBackground = false,
  skipSetup = false,
  errorMessage: externalErrorMessage,
  setErrorMessage: externalSetErrorMessage,
}: GPTSoVITSConfigProps) => {
  const [voices, setVoices] = useState<VoiceItem[]>([]);
  const [uploadingVoice, setUploadingVoice] = useState(false);
  const voiceFileInputRef = useRef<HTMLInputElement | null>(null);

  // New voice upload state
  const [newVoiceName, setNewVoiceName] = useState('');
  const [newAudioFile, setNewAudioFile] = useState<File | null>(null);
  const [newReferenceText, setNewReferenceText] = useState('');
  const [newLanguage, setNewLanguage] = useState(GPTSoVITSLanguages.ENGLISH);

  const [editingVoiceId, setEditingVoiceId] = useState<string | null>(null);
  const [editVoiceName, setEditVoiceName] = useState('');
  const [editReferenceText, setEditReferenceText] = useState('');
  const [editLanguage, setEditLanguage] = useState(GPTSoVITSLanguages.ENGLISH);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (typeof externalErrorMessage === 'string') {
      setErrorMessage(externalErrorMessage);
    }
  }, [externalErrorMessage]);

  const setStatusMessage = (message: string) => {
    setErrorMessage(message);
    externalSetErrorMessage?.(message);
  };

  const loadVoices = async () => {
    try {
      const allVoices = await voiceStorageService.getAllVoices() as VoiceItem[];
      setVoices(allVoices);
    } catch (error) {
      Logger.error('GPTSoVITSConfig', 'Failed to load voices:', error);
    }
  };

  useEffect(() => {
    loadVoices();
  }, [refreshTrigger]);

  const handleSaveNewVoice = async () => {
    if (!newVoiceName || !newAudioFile || !newReferenceText) {
      setStatusMessage('error-status:Please fill in all required fields (name, audio, reference text)');
      return;
    }

    try {
      setStatusMessage('hourglass:Validating audio file...');
      const audioDuration = await getAudioDuration(newAudioFile);
      if (audioDuration < 3) {
        setStatusMessage('error-status:Audio must be at least 3 seconds long');
        return;
      }
      if (audioDuration > 10) {
        setStatusMessage('error-status:Audio must be no longer than 10 seconds');
        return;
      }
    } catch (error) {
      Logger.error('GPTSoVITSConfig', 'Failed to validate audio duration:', error);
      setStatusMessage('error-status:Failed to validate audio file. Please try a different file.');
      return;
    }

    setUploadingVoice(true);
    setStatusMessage('hourglass:Uploading voice...');
    try {
      const voiceId = await voiceStorageService.saveVoice(
        null,
        newVoiceName,
        newAudioFile,
        newReferenceText,
        newLanguage
      );

      await loadVoices();
      
      if (onChange) {
        onChange('referenceVoiceId', voiceId);
        onChange('referenceText', newReferenceText);
        onChange('referenceLanguage', newLanguage);
      }

      setNewVoiceName('');
      setNewAudioFile(null);
      setNewReferenceText('');
      setNewLanguage(GPTSoVITSLanguages.ENGLISH);
      
      if (voiceFileInputRef.current) {
        voiceFileInputRef.current.value = '';
      }
      
      setStatusMessage(`✅ Voice "${newVoiceName}" uploaded successfully!`);
      setTimeout(() => setStatusMessage(''), 3000);
    } catch (error: unknown) {
      Logger.error('GPTSoVITSConfig', 'Failed to upload voice:', error);
      setStatusMessage(`error-status:Failed to upload voice: ${getErrorMessage(error)}`);
    } finally {
      setUploadingVoice(false);
    }
  };

  const handleSetDefault = async (voiceId: string) => {
    try {
      const voiceData = await voiceStorageService.getVoice(voiceId);
      if (!voiceData) {
        return;
      }
      
      if (onChange) {
        onChange('referenceVoiceId', voiceId);
        onChange('referenceText', voiceData.referenceText);
        onChange('referenceLanguage', voiceData.language);
      }
    } catch (error) {
      Logger.error('GPTSoVITSConfig', 'Failed to set default voice:', error);
    }
  };

  const handleEditVoice = async (voiceId: string) => {
    try {
      const voiceData = await voiceStorageService.getVoice(voiceId);
      if (!voiceData) {
        return;
      }
      setEditingVoiceId(voiceId);
      setEditVoiceName(voiceData.name);
      setEditReferenceText(voiceData.referenceText);
      setEditLanguage(voiceData.language);
    } catch (error) {
      Logger.error('GPTSoVITSConfig', 'Failed to load voice for editing:', error);
    }
  };

  const handleSaveVoiceName = async (voiceId: string) => {
    try {
      const voiceData = await voiceStorageService.getVoice(voiceId);
      if (!voiceData) {
        return;
      }
      
      await voiceStorageService.saveVoice(
        voiceId,
        editVoiceName,
        voiceData.audioData,
        editReferenceText,
        editLanguage,
        voiceData.metadata
      );

      // Update config if this is the selected voice
      if (config?.referenceVoiceId === voiceId && onChange) {
        onChange('referenceText', editReferenceText);
        onChange('referenceLanguage', editLanguage);
      }

      setEditingVoiceId(null);
      setEditVoiceName('');
      setEditReferenceText('');
      setEditLanguage(GPTSoVITSLanguages.ENGLISH);
      
      await loadVoices();
    } catch (error) {
      Logger.error('GPTSoVITSConfig', 'Failed to update voice:', error);
    }
  };

  const handleCancelEditVoice = () => {
    setEditingVoiceId(null);
    setEditVoiceName('');
    setEditReferenceText('');
    setEditLanguage(GPTSoVITSLanguages.ENGLISH);
  };

  const handleDeleteVoice = async (voiceId: string) => {
    if (onRequestDeleteVoiceDialog) {
      onRequestDeleteVoiceDialog(voiceId);
    }
  };

  return (
    <div className="space-y-6">
      {/* Setup section (desktop only) - skip for remote servers */}
      {isDesktop && !skipSetup && (
        <div>
          <h4 className="text-sm font-semibold text-white mb-3">Installation</h4>
          <GPTSoVITSSetup
            isLightBackground={isLightBackground}
            config={config}
            {...(onChange ? { onConfigChange: onChange } : {})}
          />
        </div>
      )}
      
      {/* Voice configuration section */}
      <div className="space-y-4">
        {showTitle && (
          <h4 className="text-sm font-semibold text-white mb-3">Reference Voices</h4>
        )}

        <div>
          <label className="block text-sm font-medium text-white/90 mb-2">Voice Name</label>
          <Input
            type="text"
            value={newVoiceName}
            onChange={(e) => setNewVoiceName(e.target.value)}
            placeholder="My Voice"
            variant={isLightBackground ? 'dark' : 'default'}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-white/90 mb-2">Reference Text</label>
          <textarea
            value={newReferenceText}
            onChange={(e) => setNewReferenceText(e.target.value)}
            placeholder="Type the exact text spoken in the audio..."
            rows={3}
          className={cn('glass-input w-full text-sm resize-none', isLightBackground && 'glass-input-dark')}
        />
        <p className="text-xs text-white/50 mt-1">Must match the audio exactly</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-white/90 mb-2">Language</label>
        <Select
          value={newLanguage}
          onChange={(e) => setNewLanguage(e.target.value)}
          variant={isLightBackground ? 'dark' : 'default'}
          options={GPTSOVITS_LANG_OPTIONS}
        />
      </div>

      <div className="space-y-3">
        <input
          ref={voiceFileInputRef}
          type="file"
          accept="audio/mpeg,audio/wav,audio/mp4,audio/x-m4a,.mp3,.wav,.m4a"
          onChange={(e) => setNewAudioFile(e.target.files?.[0] ?? null)}
          className="hidden"
        />
        
        <button
          onClick={() => voiceFileInputRef.current?.click()}
          disabled={uploadingVoice}
          className="w-full p-2 md:p-4 border-2 border-dashed border-white/20 hover:border-white/40 rounded-lg text-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Icon name="upload" size={32} className="mx-auto mb-2 text-white/70" />
          <p className="text-sm text-white/90 mb-1">
            {uploadingVoice ? 'Uploading...' : 'Upload Audio File (MP3/WAV/M4A)'}
          </p>
          <p className="text-xs text-white/50">
            {newAudioFile ? newAudioFile.name : 'Click to browse'}
          </p>
        </button>

        {newAudioFile && (
            <Button
            variant={isLightBackground ? 'dark' : 'default'}
            onClick={handleSaveNewVoice}
            disabled={uploadingVoice || !newVoiceName || !newReferenceText}
            className="w-full flex items-center justify-center gap-2"
          >
            {uploadingVoice ? (
              <>
                <Icon name="refresh" size={16} className="animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Icon name="check" size={16} />
                Save Voice
              </>
            )}
          </Button>
        )}

        {/* Error/Status Message */}
        {errorMessage && (
          <div className={cn('p-3 rounded-lg text-sm', errorMessage.includes('✅') ? 'bg-green-500/20 text-green-300 border border-green-500/30' : (errorMessage.startsWith('error-status:') || errorMessage.startsWith('hourglass:')) ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30')}>
            {errorMessage.replace(/^(error-status:|hourglass:)/, '')}
          </div>
        )}
      </div>

      {/* Voice List */}
      <div className="max-h-[400px] overflow-y-auto space-y-2 hover-scrollbar">
        {voices.map((voice) => {
          const isDefault = config?.referenceVoiceId === voice.id;
          const isEditing = editingVoiceId === voice.id;

          return (
            <div
              key={voice.id}
              className="relative rounded-lg bg-white/5 border border-white/10"
            >
              {/* Voice info and name editing */}
              <div className="flex items-center justify-between gap-3 p-3">
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editVoiceName}
                        onChange={(e) => setEditVoiceName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveVoiceName(voice.id);
                          if (e.key === 'Escape') handleCancelEditVoice();
                        }}
                        className="text-sm text-white font-medium bg-transparent border-none outline-none w-full p-0 mb-2"
                        autoFocus
                      />
                      <textarea
                        value={editReferenceText}
                        onChange={(e) => setEditReferenceText(e.target.value)}
                        placeholder="Reference text"
                        rows={2}
                        className={cn('glass-input w-full text-xs resize-none', isLightBackground && 'glass-input-dark')}
                      />
                      <Select
                        value={editLanguage}
                        onChange={(e) => setEditLanguage(e.target.value)}
                        variant={isLightBackground ? 'dark' : 'default'}
                        options={GPTSOVITS_LANG_OPTIONS}
                      />
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-white font-medium truncate">
                        {voice.name}
                      </p>
                      <p className="text-xs text-white/50">
                        {(voice.audioData.size / 1024).toFixed(1)} KB • {voice.language}
                      </p>
                    </>
                  )}
                </div>
                
                {/* Right side controls */}
                <div className="flex items-center gap-1">
                  {isEditing ? (
                    <>
                      <button
                        onClick={() => handleSaveVoiceName(voice.id)}
                        className="p-1 rounded hover:bg-green-500/20 text-green-300 transition-colors"
                        title="Save"
                      >
                        <Icon name="check" size={16} />
                      </button>
                      <button
                        onClick={handleCancelEditVoice}
                        className="p-1 rounded hover:bg-red-500/20 text-red-300 transition-colors"
                        title="Cancel"
                      >
                        <Icon name="x" size={16} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleEditVoice(voice.id)}
                        className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white/80 transition-colors"
                        title="Edit"
                      >
                        <Icon name="edit-2" size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteVoice(voice.id)}
                        className="p-1 rounded hover:bg-red-500/20 text-white/50 hover:text-red-300 transition-colors"
                        title="Delete"
                      >
                        <Icon name="trash-2" size={16} />
                      </button>
                      <Toggle
                        checked={isDefault}
                        onChange={(checked) => {
                          if (checked) {
                            handleSetDefault(voice.id);
                          }
                        }}
                      />
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Advanced TTS Parameters */}
      {!isSetupMode && (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-white/90 flex items-center justify-between p-2 rounded hover:bg-white/5">
            <span>Advanced Settings</span>
            <Icon name="chevron-down" size={14} className="group-open:rotate-180 transition-transform" />
          </summary>
          <div className="mt-2 p-3 rounded-lg backdrop-blur-sm bg-white/5 border border-white/10 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-white/90 mb-1">
                  Speed ({config?.speed || 1.0})
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={config?.speed || 1.0}
                  onChange={(e) => onChange && onChange('speed', parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-white/90 mb-1">
                  Top K ({config?.topK || 15})
                </label>
                <input
                  type="range"
                  min="10"
                  max="20"
                  step="1"
                  value={config?.topK || 15}
                  onChange={(e) => onChange && onChange('topK', parseInt(e.target.value))}
                  className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-white/90 mb-1">
                  Top P ({(config?.topP || 0.7).toFixed(2)})
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="0.9"
                  step="0.05"
                  value={config?.topP || 0.7}
                  onChange={(e) => onChange && onChange('topP', parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-white/90 mb-1">
                  Temperature ({(config?.temperature || 0.7).toFixed(2)})
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="1.0"
                  step="0.05"
                  value={config?.temperature || 0.7}
                  onChange={(e) => onChange && onChange('temperature', parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>
          </div>
        </details>
      )}
      </div>
    </div>
  );
};

export default GPTSoVITSConfig;
