import { useState, useEffect, useCallback } from 'react';
import { Icon } from '../../icons';
import { Button } from '../../ui';

/**
 * WhisperModelDownloader - Download manager for Whisper STT model (Android only)
 * @param {Object} androidAPI - AndroidAI interface from useAndroid hook
 * @param {boolean} isLightBackground - Light background theme flag
 */
const WhisperModelDownloader = ({ androidAPI, isLightBackground = false }) => {
  const [status, setStatus] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadStatus = useCallback(async () => {
    if (!androidAPI) return;
    try {
      const result = JSON.parse(androidAPI.getSTTTTSStatus());
      if (result?.success) {
        setStatus(result.status?.whisper);
      }
    } catch (err) {
      console.error('Failed to load Whisper status:', err);
    }
  }, [androidAPI]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (!androidAPI) return;

    androidAPI._onSTTTTSProgress = (modelType, percent, statusText) => {
      if (modelType === 'whisper') {
        setProgress({ percent, status: statusText });
      }
    };

    androidAPI._onSTTTTSComplete = (modelType, result) => {
      if (modelType === 'whisper') {
        setProgress(null);
        setDownloading(false);
        setSuccess('Whisper STT model downloaded successfully!');
        setTimeout(() => setSuccess(''), 5000);
        loadStatus();
      }
    };

    androidAPI._onSTTTTSError = (modelType, errorMsg) => {
      if (modelType === 'whisper') {
        setProgress(null);
        setDownloading(false);
        setError(`Download failed: ${errorMsg}`);
      }
    };
  }, [androidAPI, loadStatus]);

  const handleDownload = async () => {
    if (!androidAPI) return;
    setDownloading(true);
    setError('');
    setProgress({ percent: 0, status: 'Starting download...' }); // Initialize progress
    try {
      const result = JSON.parse(androidAPI.downloadWhisperModel());
      if (!result?.success) {
        setError(result?.error || 'Download failed');
        setDownloading(false);
        setProgress(null);
      }
    } catch (err) {
      setError(err.message);
      setDownloading(false);
      setProgress(null);
    }
  };

  const handleDelete = async () => {
    if (!androidAPI) return;
    if (!confirm('Delete Whisper STT model?\n\nThis will free up ~99 MB of storage.')) return;
    
    try {
      const result = JSON.parse(androidAPI.deleteWhisperModel());
      if (result?.success) {
        setSuccess('Model deleted successfully');
        setTimeout(() => setSuccess(''), 3000);
        loadStatus();
      } else {
        setError(result?.error || 'Delete failed');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  if (!status) return null;

  return (
    <div className="p-2 md:p-4 rounded-lg bg-white/5 border border-white/10 space-y-3">
      <div className="flex items-center gap-2">
        <Icon name="download" size={16} className="text-white/70" />
        <h4 className="text-sm font-semibold text-white/90">Whisper Model</h4>
      </div>

      {progress && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-white/70">{progress.status}</span>
            <span className="text-white/70">{progress.percent}%</span>
          </div>
          <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-white/40 to-white/60 transition-all duration-300"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>
      )}

      {status.downloaded ? (
        <Button
          onClick={handleDelete}
          variant={isLightBackground ? 'dark' : 'default'}
          className="w-full text-xs flex items-center justify-center gap-1.5"
        >
          <Icon name="trash" size={12} />
          <span>Delete Model</span>
        </Button>
      ) : (
        <Button
          onClick={handleDownload}
          disabled={downloading}
          variant={isLightBackground ? 'dark' : 'default'}
          className="w-full text-xs flex items-center justify-center gap-1.5"
        >
          {downloading ? (
            <>
              <svg 
                className="animate-spin" 
                width="12" 
                height="12" 
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
              <Icon name="download" size="12" />
              <span>Download Model (~99 MB)</span>
            </>
          )}
        </Button>
      )}

      {success && (
        <div className="p-2 rounded bg-green-500/10 border border-green-500/20 text-green-300 text-xs flex items-center gap-1.5">
          <Icon name="check" size={12} />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="p-2 rounded bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center gap-1.5">
          <Icon name="error" size={12} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

export default WhisperModelDownloader;
