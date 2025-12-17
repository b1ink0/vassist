/**
 * GPT-SoVITS TTS Configuration Component
 * Reusable component for voice cloning setup (used in both setup wizard and settings)
 */

import { useState, useEffect } from 'react';
import { Icon } from '../../icons';
import { GPTSoVITSLanguages } from '../../../config/aiConfig';
import voiceStorageService from '../../../services/VoiceStorageService';
import Logger from '../../../services/LoggerService';

const GPTSoVITSConfig = ({
  config,
  onChange,
  showTitle = true,
  isSetupMode = false,
}) => {
  const [voices, setVoices] = useState([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState(null);
  const [uploadingVoice, setUploadingVoice] = useState(false);
  
  // New voice upload state
  const [newVoiceName, setNewVoiceName] = useState('');
  const [newAudioFile, setNewAudioFile] = useState(null);
  const [newReferenceText, setNewReferenceText] = useState('');
  const [newLanguage, setNewLanguage] = useState(GPTSoVITSLanguages.ENGLISH);

  useEffect(() => {
    loadVoices();
  }, []);

  const loadVoices = async () => {
    try {
      const allVoices = await voiceStorageService.getAllVoices();
      setVoices(allVoices);
    } catch (error) {
      Logger.error('GPTSoVITSConfig', 'Failed to load voices:', error);
    }
  };

  const handleUploadVoice = async () => {
    if (!newVoiceName || !newAudioFile || !newReferenceText) {
      alert('Please fill in all required fields');
      return;
    }

    setUploadingVoice(true);
    try {
      const voiceId = await voiceStorageService.saveVoice(
        null,
        newVoiceName,
        newAudioFile,
        newReferenceText,
        newLanguage
      );

      // Update config with new voice
      if (onChange) {
        onChange('referenceVoiceId', voiceId);
        onChange('referenceLanguage', newLanguage);
      }

      // Reset form
      setNewVoiceName('');
      setNewAudioFile(null);
      setNewReferenceText('');
      setNewLanguage(GPTSoVITSLanguages.ENGLISH);

      // Reload voices
      await loadVoices();
      setSelectedVoiceId(voiceId);

      Logger.log('GPTSoVITSConfig', 'Voice uploaded successfully:', voiceId);
    } catch (error) {
      Logger.error('GPTSoVITSConfig', 'Failed to upload voice:', error);
      alert(`Failed to upload voice: ${error.message}`);
    } finally {
      setUploadingVoice(false);
    }
  };

  const handleSelectVoice = async (voiceId) => {
    setSelectedVoiceId(voiceId);
    
    try {
      const voiceData = await voiceStorageService.getVoice(voiceId);
      
      if (onChange) {
        onChange('referenceVoiceId', voiceId);
        onChange('referenceText', voiceData.referenceText);
        onChange('referenceLanguage', voiceData.language);
      }
    } catch (error) {
      Logger.error('GPTSoVITSConfig', 'Failed to load voice:', error);
    }
  };

  const handleDeleteVoice = async (voiceId) => {
    if (!confirm('Are you sure you want to delete this voice?')) return;

    try {
      await voiceStorageService.deleteVoice(voiceId);
      await loadVoices();
      
      if (selectedVoiceId === voiceId) {
        setSelectedVoiceId(null);
        if (onChange) {
          onChange('referenceVoiceId', null);
        }
      }
    } catch (error) {
      Logger.error('GPTSoVITSConfig', 'Failed to delete voice:', error);
      alert(`Failed to delete voice: ${error.message}`);
    }
  };

  return (
    <div className="space-y-4">
      {showTitle && (
        <h4 className="text-sm font-semibold text-white/90">GPT-SoVITS Voice Cloning</h4>
      )}

      {/* Existing Voices */}
      {voices.length > 0 && (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-white/90">Saved Voices</label>
          <div className="space-y-2">
            {voices.map((voice) => (
              <div
                key={voice.id}
                className={`flex items-center justify-between p-2 rounded border ${
                  selectedVoiceId === voice.id
                    ? 'bg-purple-500/20 border-purple-500/50'
                    : 'bg-white/5 border-white/10'
                } cursor-pointer hover:bg-white/10 transition-colors`}
                onClick={() => handleSelectVoice(voice.id)}
              >
                <div className="flex-1">
                  <p className="text-sm font-medium text-white/90">{voice.data.name}</p>
                  <p className="text-xs text-white/60">
                    {voice.data.language} • {(voice.data.audioData.size / 1024).toFixed(1)}KB
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteVoice(voice.id);
                  }}
                  className="p-1.5 rounded hover:bg-red-500/20 text-red-400"
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload New Voice */}
      <div className="p-3 rounded-lg bg-white/5 border border-white/10 space-y-3">
        <h5 className="text-xs font-semibold text-white/90">Add New Voice</h5>
        
        <div>
          <label className="block text-xs font-medium text-white/90 mb-1">
            Voice Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={newVoiceName}
            onChange={(e) => setNewVoiceName(e.target.value)}
            placeholder="My Voice"
            className="w-full px-2 py-1.5 text-xs bg-white/10 border border-white/20 rounded text-white placeholder-white/50 focus:outline-none focus:border-purple-400"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-white/90 mb-1">
            Audio File <span className="text-red-400">*</span>
          </label>
          <input
            type="file"
            accept=".mp3,.wav,.m4a"
            onChange={(e) => setNewAudioFile(e.target.files[0])}
            className="w-full px-2 py-1.5 text-xs bg-white/10 border border-white/20 rounded text-white file:mr-2 file:px-2 file:py-1 file:rounded file:border-0 file:bg-purple-500 file:text-white file:text-xs"
          />
          <p className="text-[10px] text-white/50 mt-1">
            5-30 seconds of clear speech (MP3, WAV, M4A)
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-white/90 mb-1">
            Reference Text <span className="text-red-400">*</span>
          </label>
          <textarea
            value={newReferenceText}
            onChange={(e) => setNewReferenceText(e.target.value)}
            placeholder="Type the exact text spoken in the audio..."
            rows={3}
            className="w-full px-2 py-1.5 text-xs bg-white/10 border border-white/20 rounded text-white placeholder-white/50 focus:outline-none focus:border-purple-400 resize-none"
          />
          <p className="text-[10px] text-white/50 mt-1">
            Must match the audio exactly for best results
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-white/90 mb-1">Language</label>
          <select
            value={newLanguage}
            onChange={(e) => setNewLanguage(e.target.value)}
            className="w-full px-2 py-1.5 text-xs bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:border-purple-400"
          >
            <option value={GPTSoVITSLanguages.ENGLISH} className="bg-gray-900">English</option>
            <option value={GPTSoVITSLanguages.CHINESE} className="bg-gray-900">Chinese</option>
            <option value={GPTSoVITSLanguages.JAPANESE} className="bg-gray-900">Japanese</option>
            <option value={GPTSoVITSLanguages.KOREAN} className="bg-gray-900">Korean</option>
            <option value={GPTSoVITSLanguages.CANTONESE} className="bg-gray-900">Cantonese</option>
          </select>
        </div>

        <button
          onClick={handleUploadVoice}
          disabled={uploadingVoice || !newVoiceName || !newAudioFile || !newReferenceText}
          className="w-full px-3 py-2 rounded bg-purple-500 hover:bg-purple-600 text-white text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {uploadingVoice ? (
            <>
              <Icon name="refresh" size={14} className="animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Icon name="upload" size={14} />
              Save Voice
            </>
          )}
        </button>
      </div>

      {/* Advanced TTS Parameters */}
      {!isSetupMode && (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-white/90 flex items-center justify-between p-2 rounded hover:bg-white/5">
            <span>Advanced Settings</span>
            <Icon name="arrow-down" size={14} className="group-open:rotate-180 transition-transform" />
          </summary>
          <div className="mt-2 p-3 rounded-lg bg-white/5 border border-white/10 space-y-3">
            <div className="grid grid-cols-2 gap-2">
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
                  className="w-full"
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
                  className="w-full"
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
                  className="w-full"
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
                  className="w-full"
                />
              </div>
            </div>
          </div>
        </details>
      )}
    </div>
  );
};

export default GPTSoVITSConfig;
