import { useState, useEffect } from 'react';
import { Icon } from '../../icons';
import Dialog from '../../common/Dialog';
import { Button } from '../../ui';

type ModelType = 'whisper' | 'vits';

interface ModelStatus {
  downloaded?: boolean;
  size?: number;
}

interface StatusResponse {
  success?: boolean;
  status?: {
    whisper?: ModelStatus;
    vits?: ModelStatus;
  };
  error?: string;
}

interface ProgressEntry {
  percent: number;
  status: string;
}

interface AndroidSttTtsApi {
  getSTTTTSStatus?: () => string;
  downloadWhisperModel?: () => string;
  downloadVitsModel?: () => string;
  deleteWhisperModel?: () => string;
  deleteVitsModel?: () => string;
  _onSTTTTSProgress?: ((modelType: ModelType, percent: number, statusText: string) => void) | null;
  _onSTTTTSComplete?: ((modelType: ModelType, result: { success?: boolean; error?: string }) => void) | null;
  _onSTTTTSError?: ((modelType: ModelType, errorMsg: string) => void) | null;
}

interface STTTTSModelManagerProps {
  androidAPI: AndroidSttTtsApi | null;
  isLightBackground?: boolean;
}

const getErrorMessage = (err: unknown): string => {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
};

/**
 * STTTTSModelManager - UI for managing on-device STT/TTS models (Android only)
 * 
 * Provides UI for:
 * - Downloading Whisper STT model (113 MB)
 * - Downloading VITS-VCTK TTS model (145 MB)
 * - Real-time progress tracking with percent and download size
 * - Deleting models
 * - Model status and size info
 * 
 * @param {Object} androidAPI - AndroidAI interface from useAndroid hook
 * @param {boolean} isLightBackground - Light background theme flag
 */
const STTTTSModelManager = ({ androidAPI, isLightBackground = false }: STTTTSModelManagerProps) => {
  const [status, setStatus] = useState<StatusResponse['status'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<Partial<Record<ModelType, ProgressEntry>>>({});
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [pendingDeleteModelType, setPendingDeleteModelType] = useState<ModelType | null>(null);

  // Load model status
  const loadStatus = async () => {
    if (!androidAPI?.getSTTTTSStatus) return;
    
    try {
      const resultJson = androidAPI.getSTTTTSStatus();
      const result = JSON.parse(resultJson) as StatusResponse;
      if (result?.success) {
        setStatus(result.status);
      }
    } catch (err: unknown) {
      console.error('Failed to load STT/TTS status:', err);
    }
  };

  useEffect(() => {
    loadStatus();
  }, [androidAPI]);

  // Setup progress listeners
  useEffect(() => {
    if (!androidAPI) return;

    // Progress callback - Kotlin calls this: window.AndroidAI._onSTTTTSProgress(modelType, percent, status)
    androidAPI._onSTTTTSProgress = (modelType: ModelType, percent: number, statusText: string) => {
      setDownloadProgress(prev => ({
        ...prev,
        [modelType]: { percent, status: statusText }
      }));
    };

    // Complete callback
    androidAPI._onSTTTTSComplete = (modelType: ModelType) => {
      setDownloadProgress(prev => {
        const { [modelType]: removed, ...rest } = prev;
        return rest;
      });
      setLoading(false);
      setSuccessMessage(`${modelType === 'whisper' ? 'Whisper STT' : 'VITS TTS'} model downloaded successfully!`);
      setTimeout(() => setSuccessMessage(''), 5000);
      loadStatus();
    };

    // Error callback
    androidAPI._onSTTTTSError = (modelType: ModelType, errorMsg: string) => {
      setDownloadProgress(prev => {
        const { [modelType]: removed, ...rest } = prev;
        return rest;
      });
      setLoading(false);
      setError(`${modelType === 'whisper' ? 'Whisper STT' : 'VITS TTS'} download failed: ${errorMsg}`);
    };

    return () => {
      if (androidAPI) {
        androidAPI._onSTTTTSProgress = null;
        androidAPI._onSTTTTSComplete = null;
        androidAPI._onSTTTTSError = null;
      }
    };
  }, [androidAPI]);

  const handleDownload = async (modelType: ModelType) => {
    if (!androidAPI) {
      setError('Android API not available');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const resultJson = modelType === 'whisper'
        ? androidAPI.downloadWhisperModel?.()
        : androidAPI.downloadVitsModel?.();
      if (!resultJson) {
        throw new Error('Download API is unavailable');
      }
      
      const result = JSON.parse(resultJson) as { success?: boolean; error?: string };
      
      if (!result?.success) {
        setError(result?.error || 'Download failed');
        setLoading(false);
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      setLoading(false);
    }
  };

  const handleDelete = (modelType: ModelType) => {
    setPendingDeleteModelType(modelType);
  };

  const confirmDelete = async () => {
    if (!androidAPI) return;
    const modelType = pendingDeleteModelType;
    if (!modelType) return;

    setPendingDeleteModelType(null);

    const modelName = modelType === 'whisper' ? 'Whisper STT' : 'VITS-VCTK TTS';

    try {
      const resultJson = modelType === 'whisper'
        ? androidAPI.deleteWhisperModel?.()
        : androidAPI.deleteVitsModel?.();
      if (!resultJson) {
        throw new Error('Delete API is unavailable');
      }
      
      const result = JSON.parse(resultJson) as { success?: boolean; error?: string };
      
      if (result?.success) {
        setSuccessMessage(`${modelName} deleted successfully`);
        setTimeout(() => setSuccessMessage(''), 3000);
        await loadStatus();
      } else {
        setError(result?.error || 'Delete failed');
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  if (!status) {
    return (
      <div className="p-2 md:p-4 rounded-lg bg-white/5 border border-white/10">
        <p className="text-sm text-white/50">Loading model status...</p>
      </div>
    );
  }

  const whisperStatus = status.whisper || {};
  const vitsStatus = status.vits || {};

  return (
    <div className="space-y-3">
      {/* Info Banner */}
      <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
        <p className="text-xs text-blue-300">
          <span className="font-semibold">On-Device AI</span> - Download models once for offline speech recognition and text-to-speech.
        </p>
      </div>

      {/* Whisper STT Model */}
      <div className="p-2 md:p-4 rounded-lg bg-white/5 border border-white/10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Icon name="microphone" size={16} className="text-white/70" />
            <h3 className="text-sm font-semibold text-white/90">Whisper Tiny.en (STT)</h3>
          </div>
          {whisperStatus.downloaded ? (
            <span className="px-2 py-1 rounded text-[10px] font-medium bg-green-500/20 text-green-300 border border-green-500/30">
              Downloaded
            </span>
          ) : (
            <span className="px-2 py-1 rounded text-[10px] font-medium bg-white/10 text-white/50 border border-white/20">
              Not Downloaded
            </span>
          )}
        </div>

        <div className="space-y-2 mb-3">
          <div className="flex justify-between text-xs">
            <span className="text-white/60">Model Size:</span>
            <span className="text-white/90">
              {whisperStatus.downloaded ? formatBytes(whisperStatus.size ?? 0) : '~99 MB'}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-white/60">Language:</span>
            <span className="text-white/90">English</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-white/60">Purpose:</span>
            <span className="text-white/90">Speech-to-Text (Transcription)</span>
          </div>
        </div>

        {/* Progress Bar for Whisper */}
        {downloadProgress.whisper && (
          <div className="space-y-2 mb-3">
            <div className="flex justify-between text-xs">
              <span className="text-white/70">{downloadProgress.whisper.status}</span>
              <span className="text-white/70">{downloadProgress.whisper.percent}%</span>
            </div>
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-blue-400/60 to-blue-500/80 transition-all duration-300"
                style={{ width: `${downloadProgress.whisper.percent}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex gap-2">
          {whisperStatus.downloaded ? (
            <button
              onClick={() => handleDelete('whisper')}
              className="flex-1 px-2 md:px-4 py-2.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Icon name="trash" size={14} />
              <span>Delete</span>
            </button>
          ) : (
            <Button
              onClick={() => handleDownload('whisper')}
              disabled={loading || Boolean(downloadProgress.whisper)}
              variant={isLightBackground ? 'dark' : 'default'}
              className="flex-1"
            >
              {downloadProgress.whisper ? (
                <>
                  <svg 
                    className="animate-spin" 
                    width="16" 
                    height="16" 
                    viewBox="0 0 32 32" 
                    fill="none" 
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <circle 
                      cx="16" 
                      cy="16" 
                      r="14" 
                      stroke="currentColor" 
                      strokeWidth="3" 
                      strokeLinecap="round"
                      strokeDasharray="70 20"
                      className="text-white opacity-90"
                    />
                  </svg>
                  <span>Downloading...</span>
                </>
              ) : (
                <>
                  <Icon name="download" size={14} />
                  <span>Download (~99 MB)</span>
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* VITS TTS Model */}
      <div className="p-2 md:p-4 rounded-lg bg-white/5 border border-white/10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Icon name="speaker" size={16} className="text-white/70" />
            <h3 className="text-sm font-semibold text-white/90">VITS-VCTK (TTS)</h3>
          </div>
          {vitsStatus.downloaded ? (
            <span className="px-2 py-1 rounded text-[10px] font-medium bg-green-500/20 text-green-300 border border-green-500/30">
              Downloaded
            </span>
          ) : (
            <span className="px-2 py-1 rounded text-[10px] font-medium bg-white/10 text-white/50 border border-white/20">
              Not Downloaded
            </span>
          )}
        </div>

        <div className="space-y-2 mb-3">
          <div className="flex justify-between text-xs">
            <span className="text-white/60">Model Size:</span>
            <span className="text-white/90">
              {vitsStatus.downloaded ? formatBytes(vitsStatus.size ?? 0) : '~152 MB'}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-white/60">Language:</span>
            <span className="text-white/90">English</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-white/60">Speakers:</span>
            <span className="text-white/90">109 voices</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-white/60">Purpose:</span>
            <span className="text-white/90">Text-to-Speech (Voice Synthesis)</span>
          </div>
        </div>

        {/* Progress Bar for VITS */}
        {downloadProgress.vits && (
          <div className="space-y-2 mb-3">
            <div className="flex justify-between text-xs">
              <span className="text-white/70">{downloadProgress.vits.status}</span>
              <span className="text-white/70">{downloadProgress.vits.percent}%</span>
            </div>
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-purple-400/60 to-purple-500/80 transition-all duration-300"
                style={{ width: `${downloadProgress.vits.percent}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex gap-2">
          {vitsStatus.downloaded ? (
            <button
              onClick={() => handleDelete('vits')}
              className="flex-1 px-2 md:px-4 py-2.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Icon name="trash" size={14} />
              <span>Delete</span>
            </button>
          ) : (
            <Button
              onClick={() => handleDownload('vits')}
              disabled={loading || Boolean(downloadProgress.vits)}
              variant={isLightBackground ? 'dark' : 'default'}
              className="flex-1"
            >
              {downloadProgress.vits ? (
                <>
                  <svg 
                    className="animate-spin" 
                    width="16" 
                    height="16" 
                    viewBox="0 0 32 32" 
                    fill="none" 
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <circle 
                      cx="16" 
                      cy="16" 
                      r="14" 
                      stroke="currentColor" 
                      strokeWidth="3" 
                      strokeLinecap="round"
                      strokeDasharray="70 20"
                      className="text-white opacity-90"
                    />
                  </svg>
                  <span>Downloading...</span>
                </>
              ) : (
                <>
                  <Icon name="download" size={14} />
                  <span>Download (~145 MB)</span>
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-300 text-xs">
          <div className="flex items-start gap-2">
            <Icon name="check" size={14} className="flex-shrink-0 mt-0.5" />
            <span>{successMessage}</span>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
          <div className="flex items-start gap-2">
            <Icon name="error" size={14} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {pendingDeleteModelType && (
        <Dialog
          type="confirm"
          title={`Delete ${pendingDeleteModelType === 'whisper' ? 'Whisper STT' : 'VITS-VCTK TTS'} model?`}
          message={`This will free up ~${pendingDeleteModelType === 'whisper' ? '99' : '152'} MB of storage.`}
          confirmLabel="Delete"
          confirmStyle="error"
          isLightBackground={isLightBackground}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDeleteModelType(null)}
        />
      )}
    </div>
  );
};

export default STTTTSModelManager;
