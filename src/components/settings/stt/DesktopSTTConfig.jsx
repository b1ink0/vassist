import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../icons';
import { useDesktop } from '../../../contexts/DesktopContext';

/**
 * Reusable Desktop STT Configuration Component
 * Used in both setup wizard and settings panel for desktop-local STT provider
 * 
 * @param {Object} config - Current STT configuration (endpoint, model, etc.)
 * @param {Function} onChange - Callback when configuration changes
 * @param {boolean} isLightBackground - Whether component is on light background
 * @param {boolean} showTitle - Whether to show section title
 * @param {boolean} isSetupMode - Whether in setup wizard (affects UI slightly)
 */
const DesktopSTTConfig = ({ 
  config = {}, 
  onChange, 
  isSetupMode = false,
  isLightBackground = false
}) => {
  const { api: desktopAPI } = useDesktop();
  const [setupStatus, setSetupStatus] = useState(null);
  const [isSetupRunning, setIsSetupRunning] = useState(false);
  const [setupError, setSetupError] = useState(null);
  const [setupComplete, setSetupComplete] = useState(false);
  const [logs, setLogs] = useState([]);
  const logsContainerRef = useRef(null);

  const handleChange = (key, value) => {
    onChange({ [key]: value });
  };

  useEffect(() => {
    if (!desktopAPI?.whisperSetup) return;

    desktopAPI.whisperSetup.getStatus().then(setSetupStatus).catch((error) => {
      console.error('[DesktopSTTConfig] Whisper status check failed:', error);
    });
  }, [desktopAPI]);

  useEffect(() => {
    if (!desktopAPI?.whisperSetup) return;

    const unsubscribeLog = desktopAPI.whisperSetup.onLog((log) => {
      setLogs((prev) => [...prev, log.message]);
    });

    const unsubscribeComplete = desktopAPI.whisperSetup.onComplete((result) => {
      setIsSetupRunning(false);

      if (result.success) {
        setSetupComplete(true);
        setSetupError(null);
        desktopAPI.whisperSetup.getStatus().then(setSetupStatus).catch((error) => {
          console.error('[DesktopSTTConfig] Whisper status refresh failed:', error);
        });
      } else {
        setSetupComplete(false);
        setSetupError(result.error || 'Whisper setup failed');
      }
    });

    return () => {
      unsubscribeLog?.();
      unsubscribeComplete?.();
    };
  }, [desktopAPI]);

  useEffect(() => {
    if (!logsContainerRef.current) return;
    logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
  }, [logs]);

  const handleStartSetup = async () => {
    if (!desktopAPI?.whisperSetup) return;

    setIsSetupRunning(true);
    setSetupError(null);
    setSetupComplete(false);
    setLogs([]);

    try {
      await desktopAPI.whisperSetup.start();
    } catch (error) {
      setIsSetupRunning(false);
      setSetupError(error.message || 'Failed to start setup');
    }
  };

  const handleCancelSetup = async () => {
    if (!desktopAPI?.whisperSetup) return;

    try {
      await desktopAPI.whisperSetup.cancel();
      setIsSetupRunning(false);
      setLogs((prev) => [...prev, '\n❌ Setup cancelled by user\n']);
    } catch (error) {
      console.error('[DesktopSTTConfig] Whisper setup cancel failed:', error);
    }
  };

  const isInstalled = Boolean(setupStatus?.isSetup);
  const isPartialInstall = Boolean(
    setupStatus &&
      !setupStatus.isSetup &&
      (setupStatus.pythonExists || setupStatus.dependenciesInstalled || setupStatus.modelExists)
  );
  const canManageSetup = Boolean(desktopAPI?.whisperSetup);

  return (
    <div className="space-y-3">
      {/* Info Banner */}
      <div className="p-3 rounded-lg bg-white/10 border border-white/20">
        <div className="flex items-start gap-2">
          <Icon name="microphone" size={18} className="text-white/90 shrink-0 mt-0.5" />
          <p className="text-xs text-white/90">
            <span className="font-semibold">Desktop Local STT</span> - On-device speech recognition using Whisper via Electron!
          </p>
        </div>
      </div>

      {/* Status */}
      <div className="p-3 rounded-lg bg-white/5 border border-white/10">
        <div className="flex items-center gap-2 mb-2">
          <div className={`w-2 h-2 rounded-full ${isInstalled ? 'bg-green-400' : 'bg-yellow-400'}`}></div>
          <span className="text-sm font-semibold text-white/90">
            {isInstalled ? 'Whisper is ready to use' : 'Whisper setup required'}
          </span>
        </div>
        <p className="text-xs text-white/60">
          Model: faster-whisper tiny.en • Local speech recognition
        </p>
      </div>

      {/* Setup actions */}
      {canManageSetup && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <button
              onClick={handleStartSetup}
              disabled={isSetupRunning}
              className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} flex-1 px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isSetupRunning ? (
                <>
                  <Icon name="loader" size={14} className="animate-spin" />
                  Initializing...
                </>
              ) : (
                <>
                  <Icon name={isInstalled || isPartialInstall ? 'refresh-cw' : 'download'} size={14} />
                  {isInstalled ? 'Re-initialize Whisper' : isPartialInstall ? 'Complete Whisper Setup' : 'Initialize Whisper'}
                </>
              )}
            </button>

            {isSetupRunning && (
              <button
                onClick={handleCancelSetup}
                className="glass-button px-3 py-2 rounded-lg hover:bg-red-500/20 transition-colors"
                title="Cancel Whisper setup"
              >
                <Icon name="x" size={14} />
              </button>
            )}
          </div>

          {(isSetupRunning || setupError || setupComplete || logs.length > 0) && (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-white/80">Setup Log</label>
              <div
                ref={logsContainerRef}
                className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} h-40 overflow-y-auto p-2 font-mono text-[11px] whitespace-pre-wrap`}
              >
                {logs.map((log, index) => (
                  <div key={index} className="text-white/80">{log}</div>
                ))}
              </div>

              {setupComplete && (
                <div className="p-2 bg-green-500/10 border border-green-500/30 rounded-lg">
                  <div className="flex items-center gap-2 text-green-400">
                    <Icon name="check-circle" size={14} />
                    <span className="text-xs font-medium">Whisper setup complete</span>
                  </div>
                </div>
              )}

              {setupError && (
                <div className="p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <div className="flex items-center gap-2 text-red-400">
                    <Icon name="alert-circle" size={14} />
                    <span className="text-xs font-medium">Setup failed</span>
                  </div>
                  <p className="text-xs text-red-300/80 mt-1">{setupError}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Advanced Config */}
      <details className="group" open={isSetupMode}>
        <summary className="cursor-pointer text-sm font-medium text-white/90 flex items-center justify-between p-2 rounded hover:bg-white/5">
          <span>Advanced Settings</span>
          <Icon name="arrow-down" size={14} className="group-open:rotate-180 transition-transform" />
        </summary>
        <div className="mt-2 space-y-3">
          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">
              Endpoint URL
            </label>
            <input
              type="text"
              value={config.endpoint || 'http://127.0.0.1:11438'}
              onChange={(e) => handleChange('endpoint', e.target.value)}
              placeholder="http://127.0.0.1:11438"
              className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full text-xs sm:text-sm`}
            />
            <p className="text-[10px] text-white/50 mt-1">
              Local AI server endpoint
            </p>
          </div>
          
          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">
              Model File
            </label>
            <input
              type="text"
              value={config.model || 'ggml-small.en.bin'}
              onChange={(e) => handleChange('model', e.target.value)}
              placeholder="ggml-small.en.bin"
              className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full text-xs sm:text-sm`}
            />
            <p className="text-[10px] text-white/50 mt-1">
              Whisper model filename (place in models/ directory)
            </p>
          </div>

          {/* Additional Parameters */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">
                Language
              </label>
              <select
                value={config.language || 'en'}
                onChange={(e) => handleChange('language', e.target.value)}
                className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full text-xs`}
              >
                <option value="en" className="bg-gray-900">English</option>
                <option value="es" className="bg-gray-900">Spanish</option>
                <option value="fr" className="bg-gray-900">French</option>
                <option value="de" className="bg-gray-900">German</option>
                <option value="it" className="bg-gray-900">Italian</option>
                <option value="pt" className="bg-gray-900">Portuguese</option>
                <option value="zh" className="bg-gray-900">Chinese</option>
                <option value="ja" className="bg-gray-900">Japanese</option>
                <option value="ko" className="bg-gray-900">Korean</option>
                <option value="auto" className="bg-gray-900">Auto-detect</option>
              </select>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">
                Threads ({config.threads || 4})
              </label>
              <input
                type="number"
                min="1"
                max="16"
                value={config.threads || 4}
                onChange={(e) => handleChange('threads', parseInt(e.target.value))}
                className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full text-xs`}
              />
              <p className="text-[10px] text-white/50 mt-1">
                CPU threads for processing
              </p>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
};

export default DesktopSTTConfig;
