/**
 * GPT-SoVITS Setup Component
 * Handles automated installation of GPT-SoVITS TTS system
 * Downloads Python, dependencies, and models with live progress logs
 */

import { useState, useEffect, useRef } from 'react';
import { Icon } from '../../icons';
import { useDesktop } from '../../../contexts/DesktopContext';

const GPTSoVITSSetup = ({ isLightBackground = false }) => {
  const { api: desktopAPI } = useDesktop();
  
  // Setup state
  const [setupStatus, setSetupStatus] = useState(null);
  const [isSetupRunning, setIsSetupRunning] = useState(false);
  const [logs, setLogs] = useState([]);
  const [setupComplete, setSetupComplete] = useState(false);
  const [setupError, setSetupError] = useState(null);
  
  // Auto-scroll ref
  const logsEndRef = useRef(null);
  const logsContainerRef = useRef(null);
  
  // Check setup status on mount
  useEffect(() => {
    if (desktopAPI?.gptSovitsSetup) {
      desktopAPI.gptSovitsSetup.getStatus().then((status) => {
        console.log('[GPTSoVITSSetup] Initial status:', status);
        setSetupStatus(status);
      }).catch((err) => {
        console.error('[GPTSoVITSSetup] Status check failed:', err);
      });
    }
  }, [desktopAPI]);
  
  // Listen for logs and completion
  useEffect(() => {
    if (!desktopAPI?.gptSovitsSetup) return;
    
    const unsubscribeLog = desktopAPI.gptSovitsSetup.onLog((log) => {
      setLogs(prev => [...prev, log.message]);
    });
    
    const unsubscribeComplete = desktopAPI.gptSovitsSetup.onComplete((result) => {
      setIsSetupRunning(false);
      if (result.success) {
        setSetupComplete(true);
        setSetupError(null);
        // Refresh status
        desktopAPI.gptSovitsSetup.getStatus().then(setSetupStatus);
      } else {
        setSetupError(result.error || 'Setup failed');
        setSetupComplete(false);
      }
    });
    
    return () => {
      unsubscribeLog?.();
      unsubscribeComplete?.();
    };
  }, [desktopAPI]);
  
  // Auto-scroll logs to bottom
  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs]);
  
  const handleStartSetup = async () => {
    setIsSetupRunning(true);
    setLogs([]);
    setSetupComplete(false);
    setSetupError(null);
    
    try {
      await desktopAPI.gptSovitsSetup.start();
    } catch (error) {
      setSetupError(error.message);
      setIsSetupRunning(false);
    }
  };
  
  const handleCancelSetup = async () => {
    try {
      await desktopAPI.gptSovitsSetup.cancel();
      setIsSetupRunning(false);
      setLogs(prev => [...prev, '\n❌ Setup cancelled by user\n']);
    } catch (error) {
      console.error('[GPTSoVITSSetup] Cancel failed:', error);
    }
  };
  
  const handleReinstall = async () => {
    if (window.confirm('This will delete existing files and reinstall GPT-SoVITS. Continue?')) {
      handleStartSetup();
    }
  };
  
  const handleVerifyInstall = async () => {
    // Run setup again to verify/repair - existing files will be skipped
    setIsSetupRunning(true);
    setLogs([]);
    setSetupComplete(false);
    setSetupError(null);
    
    try {
      await desktopAPI.gptSovitsSetup.start();
    } catch (error) {
      setSetupError(error.message);
      setIsSetupRunning(false);
    }
  };
  
  // Don't render if not in desktop mode
  if (!desktopAPI?.gptSovitsSetup) {
    return null;
  }
  
  const isInstalled = setupStatus?.isSetup;
  const isPartialInstall = setupStatus && !setupStatus.isSetup && (
    setupStatus.pythonExists || setupStatus.modelsExist || setupStatus.gptsovitsExists
  );
  
  return (
    <div className="space-y-4">
      {/* Status indicator */}
      <div className={`p-4 rounded-lg ${
        isInstalled
          ? 'bg-green-500/10 border border-green-500/30' 
          : 'bg-yellow-500/10 border border-yellow-500/30'
      }`}>
        <div className="flex items-center gap-2">
          <Icon 
            name={isInstalled ? 'check-circle' : 'alert-circle'} 
            size={20}
            className={isInstalled ? 'text-green-400' : 'text-yellow-400'}
          />
          <span className="text-sm font-medium">
            {isInstalled
              ? 'GPT-SoVITS is installed and ready' 
              : isPartialInstall
                ? 'Partial installation detected - please reinstall'
                : 'GPT-SoVITS needs to be installed'}
          </span>
        </div>
      </div>
      
      {/* Install/Cancel buttons */}
      {!isInstalled && (
        <div className="flex gap-2">
          <button
            onClick={isPartialInstall ? handleReinstall : handleStartSetup}
            disabled={isSetupRunning}
            className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} 
              flex-1 px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2
              disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isSetupRunning ? (
              <>
                <Icon name="loader" size={16} className="animate-spin" />
                Installing...
              </>
            ) : (
              <>
                <Icon name="download" size={16} />
                {isPartialInstall ? 'Re-install GPT-SoVITS' : 'Install GPT-SoVITS'}
              </>
            )}
          </button>
          
          {isSetupRunning && (
            <button
              onClick={handleCancelSetup}
              className="glass-button px-4 py-3 rounded-lg hover:bg-red-500/20 transition-colors"
              title="Cancel Installation"
            >
              <Icon name="x" size={16} />
            </button>
          )}
        </div>
      )}
      
      {/* Verify/Re-install buttons for installed setups */}
      {isInstalled && (
        <div className="flex gap-2">
          <button
            onClick={handleVerifyInstall}
            disabled={isSetupRunning}
            className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} 
              flex-1 px-4 py-2 rounded-lg text-sm flex items-center justify-center gap-2
              hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isSetupRunning ? (
              <>
                <Icon name="loader" size={14} className="animate-spin" />
                Verifying...
              </>
            ) : (
              <>
                <Icon name="check-circle" size={14} />
                Verify Installation
              </>
            )}
          </button>
          
          <button
            onClick={handleReinstall}
            disabled={isSetupRunning}
            className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} 
              flex-1 px-4 py-2 rounded-lg text-sm flex items-center justify-center gap-2
              hover:bg-red-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <Icon name="refresh-cw" size={14} />
            Re-install
          </button>
        </div>
      )}
      
      {/* Log viewer */}
      {(isSetupRunning || setupComplete || setupError || logs.length > 0) && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-white/90">
            Installation Log
          </label>
          <div 
            ref={logsContainerRef}
            className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} 
              h-[300px] overflow-y-auto p-3 font-mono text-xs whitespace-pre-wrap
              hover-scrollbar`}
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(255, 255, 255, 0.3) rgba(255, 255, 255, 0.1)'
            }}
          >
            {logs.map((log, i) => (
              <div key={i} className="text-white/80">{log}</div>
            ))}
            <div ref={logsEndRef} />
          </div>
          
          {setupComplete && (
            <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
              <div className="flex items-center gap-2 text-green-400">
                <Icon name="check-circle" size={16} />
                <span className="text-sm font-medium">Installation complete!</span>
              </div>
              <p className="text-xs text-green-300/70 mt-1">
                GPT-SoVITS is now ready to use
              </p>
            </div>
          )}
          
          {setupError && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <div className="flex items-center gap-2 text-red-400">
                <Icon name="alert-circle" size={16} />
                <span className="text-sm font-medium">Installation failed</span>
              </div>
              <p className="text-xs text-red-300/70 mt-1">{setupError}</p>
              <button
                onClick={handleStartSetup}
                className="mt-2 text-xs text-red-300 hover:text-red-200 underline"
              >
                Retry Installation
              </button>
            </div>
          )}
        </div>
      )}
      
      {/* Info panel */}
      {!isInstalled && !isSetupRunning && (
        <div className="p-4 bg-white/5 border border-white/10 rounded-lg">
          <p className="text-xs text-white/70 mb-2 font-medium">
            What will be installed:
          </p>
          <ul className="text-xs text-white/50 space-y-1">
            <li className="flex items-start gap-2">
              <span className="text-white/30">•</span>
              <span>Python 3.10 runtime (~9-100MB depending on platform)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-white/30">•</span>
              <span>PyTorch with GPU support (~2-3GB)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-white/30">•</span>
              <span>GPT-SoVITS AI models (~2GB)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-white/30">•</span>
              <span>Required dependencies and tools</span>
            </li>
          </ul>
          <div className="mt-3 pt-3 border-t border-white/10">
            <div className="flex items-center gap-2 text-xs">
              <Icon name="hard-drive" size={12} className="text-white/40" />
              <span className="text-white/60">Disk space needed: ~5GB</span>
            </div>
            <div className="flex items-center gap-2 text-xs mt-1">
              <Icon name="clock" size={12} className="text-white/40" />
              <span className="text-white/60">Estimated time: 10-30 minutes</span>
            </div>
          </div>
          <p className="text-xs text-white/40 mt-3 italic">
            Note: No system Python required! Everything is downloaded automatically.
          </p>
        </div>
      )}
    </div>
  );
};

export default GPTSoVITSSetup;
