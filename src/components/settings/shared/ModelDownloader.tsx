import { useState, useEffect, useCallback } from 'react';
import { Icon } from '../../icons';
import Dialog from '../../common/Dialog';
import { Button, Card } from '../../ui';

interface ModelStatus {
  downloaded?: boolean;
}

interface ModelProgress {
  percent: number;
  status: string;
}

interface AndroidApiLike {
  getSTTTTSStatus?: () => string;
  _onSTTTTSProgress?: ((type: string, percent: number, statusText: string) => void) | null;
  _onSTTTTSComplete?: ((type: string, result: { success?: boolean; error?: string }) => void) | null;
  _onSTTTTSError?: ((type: string, errorMsg: string) => void) | null;
}

interface ModelDownloaderProps {
  androidAPI: AndroidApiLike | null;
  isLightBackground?: boolean;
  modelType: string;
  statusKey: string;
  downloadFn: () => string;
  deleteFn: () => string;
  title: string;
  downloadSize: string;
  deleteConfirmMsg: string;
  successMsg: string;
}

/**
 * Generic model downloader for Android TTS/STT models.
 *
 * @param {Object} androidAPI - AndroidAI interface from useAndroid hook
 * @param {boolean} isLightBackground - Light background theme flag
 * @param {string} modelType - 'vits' | 'whisper' (matches progress event type)
 * @param {string} statusKey - Key on result.status to read (e.g. 'vits' | 'whisper')
 * @param {Function} downloadFn - () => androidAPI.<fn>() string call
 * @param {Function} deleteFn - () => androidAPI.<fn>() string call
 * @param {string} title - Panel heading (e.g. 'VITS Model')
 * @param {string} downloadSize - Human-readable size (e.g. '~145 MB')
 * @param {string} deleteConfirmMsg - Second line of the confirm prompt
 * @param {string} successMsg - Toast message shown on successful download
 */
const ModelDownloader = ({
  androidAPI,
  isLightBackground = false,
  modelType,
  statusKey,
  downloadFn,
  deleteFn,
  title,
  downloadSize,
  deleteConfirmMsg,
  successMsg,
}: ModelDownloaderProps) => {
  const [status, setStatus] = useState<ModelStatus | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<ModelProgress | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const loadStatus = useCallback(async () => {
    if (!androidAPI) return;
    try {
      const statusJson = androidAPI.getSTTTTSStatus?.();
      if (!statusJson) {
        return;
      }
      const result = JSON.parse(statusJson) as {
        success?: boolean;
        status?: Record<string, ModelStatus | undefined>;
      };
      if (result?.success) {
        setStatus(result.status?.[statusKey] ?? null);
      }
    } catch (err) {
      console.error(`Failed to load ${modelType} status:`, err);
    }
  }, [androidAPI, modelType, statusKey]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (!androidAPI) return;

    androidAPI._onSTTTTSProgress = (type: string, percent: number, statusText: string) => {
      if (type === modelType) {
        setProgress({ percent, status: statusText });
      }
    };

    androidAPI._onSTTTTSComplete = (type: string) => {
      if (type === modelType) {
        setProgress(null);
        setDownloading(false);
        setSuccess(successMsg);
        setTimeout(() => setSuccess(''), 5000);
        loadStatus();
      }
    };

    androidAPI._onSTTTTSError = (type: string, errorMsg: string) => {
      if (type === modelType) {
        setProgress(null);
        setDownloading(false);
        setError(`Download failed: ${errorMsg}`);
      }
    };
  }, [androidAPI, loadStatus, modelType, successMsg]);

  const handleDownload = async () => {
    if (!androidAPI) return;
    setDownloading(true);
    setError('');
    setProgress({ percent: 0, status: 'Starting download...' });
    try {
      const result = JSON.parse(downloadFn()) as { success?: boolean; error?: string };
      if (!result?.success) {
        setError(result?.error || 'Download failed');
        setDownloading(false);
        setProgress(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDownloading(false);
      setProgress(null);
    }
  };

  const handleDelete = () => {
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!androidAPI) return;
    setShowDeleteDialog(false);

    try {
      const result = JSON.parse(deleteFn()) as { success?: boolean; error?: string };
      if (result?.success) {
        setSuccess('Model deleted successfully');
        setTimeout(() => setSuccess(''), 3000);
        loadStatus();
      } else {
        setError(result?.error || 'Delete failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (!status) return null;

  return (
    <Card className="p-2 md:p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Icon name="download" size={16} className="text-white/70" />
        <h4 className="text-sm font-semibold text-white/90">{title}</h4>
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
          size="sm"
          className="w-full"
        >
          <Icon name="trash" size={12} />
          <span>Delete Model</span>
        </Button>
      ) : (
        <Button
          onClick={handleDownload}
          disabled={downloading}
          variant={isLightBackground ? 'dark' : 'default'}
          size="sm"
          className="w-full"
        >
          {downloading ? (
            <>
              <Icon name="loading-2" size={12} className="animate-spin" />
              <span>Downloading...</span>
            </>
          ) : (
            <>
              <Icon name="download" size={12} />
              <span>Download Model ({downloadSize})</span>
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

      {showDeleteDialog && (
        <Dialog
          type="confirm"
          title={`Delete ${title}?`}
          message={deleteConfirmMsg}
          confirmLabel="Delete"
          confirmStyle="error"
          isLightBackground={isLightBackground}
          onConfirm={confirmDelete}
          onCancel={() => setShowDeleteDialog(false)}
        />
      )}
    </Card>
  );
};

export default ModelDownloader;
