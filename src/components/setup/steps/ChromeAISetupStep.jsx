import { useState, useEffect, useCallback } from 'react';
import { useSetup } from '../../../contexts/SetupContext';
import AIServiceProxy from '../../../services/proxies/AIServiceProxy';

const ChromeAISetupStep = () => {
  const { markStepComplete, updateSetupData, nextStep } = useSetup();
  const [chromeAIStatus, setChromeAIStatus] = useState({
    checking: true,
    chromeVersion: null,
    isChromeAIAvailable: false,
    needsFlags: false,
    needsDownload: false,
    isReady: false,
    statusMessage: 'Checking Chrome AI availability...',
    flags: [],
    downloadProgress: null
  });
  const [showInstructions, setShowInstructions] = useState(false);

  const checkChromeAI = useCallback(async () => {
    setChromeAIStatus(prev => ({ ...prev, checking: true }));

    try {
      // Get Chrome version
      const chromeVersion = getChromeVersion();
      
      // Check if Chrome AI is available
      if (chromeVersion < 138) {
        setChromeAIStatus({
          checking: false,
          chromeVersion,
          isChromeAIAvailable: false,
          needsFlags: false,
          needsDownload: false,
          isReady: false,
          statusMessage: `Chrome ${chromeVersion} detected. Chrome 138+ required for Chrome AI.`,
          flags: [],
          downloadProgress: null
        });
        return;
      }

      // Use AIServiceProxy to check availability
      const availabilityResult = await AIServiceProxy.checkChromeAIAvailability();

      let status = {
        checking: false,
        chromeVersion,
        isChromeAIAvailable: availabilityResult.available,
        needsFlags: availabilityResult.requiresFlags,
        needsDownload: false,
        isReady: availabilityResult.available,
        statusMessage: availabilityResult.message,
        flags: availabilityResult.flags || [],
        downloadProgress: availabilityResult.progress || null
      };

      if (availabilityResult.available) {
        status.isReady = true;
        status.statusMessage = '✓ Chrome AI is ready to use!';
      } else if (availabilityResult.state === 'after-download' || availabilityResult.state === 'downloadable') {
        status.needsDownload = true;
        status.statusMessage = 'Chrome AI model needs to be downloaded';
      } else if (availabilityResult.requiresFlags && availabilityResult.flags && availabilityResult.flags.length > 0) {
        status.needsFlags = true;
        status.statusMessage = 'Chrome AI requires browser flags to be enabled';
      } else {
        status.statusMessage = 'Chrome AI is not available';
      }

      setChromeAIStatus(status);

      // Save to setup data
      updateSetupData({
        chromeAI: {
          available: status.isChromeAIAvailable,
          ready: status.isReady,
          chromeVersion: status.chromeVersion,
          needsSetup: status.needsFlags || status.needsDownload
        }
      });

    } catch (error) {
      console.error('Chrome AI check failed:', error);
      setChromeAIStatus({
        checking: false,
        chromeVersion: getChromeVersion(),
        isChromeAIAvailable: false,
        needsFlags: false,
        needsDownload: false,
        isReady: false,
        statusMessage: 'Failed to check Chrome AI availability',
        flags: [],
        downloadProgress: null
      });
    }
  }, [updateSetupData]);

  useEffect(() => {
    checkChromeAI();
  }, [checkChromeAI]);

  const getChromeVersion = () => {
    const ua = navigator.userAgent;
    const match = ua.match(/Chrome\/(\d+)/);
    return match ? parseInt(match[1]) : 0;
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  const handleSkipChromeAI = () => {
    updateSetupData({
      chromeAI: {
        available: false,
        ready: false,
        skipped: true
      }
    });
    markStepComplete();
    nextStep();
  };

  const handleContinue = () => {
    markStepComplete();
    nextStep();
  };

  const startDownload = async () => {
    try {
      // Open chrome://components in new tab
      window.open('chrome://components', '_blank');
      
      // Also open on-device internals to monitor
      setTimeout(() => {
        window.open('chrome://on-device-internals', '_blank');
      }, 1000);

      setShowInstructions(true);
    } catch (error) {
      console.error('Failed to open Chrome pages:', error);
    }
  };

  if (chromeAIStatus.checking) {
    return (
      <div className="setup-step chrome-ai-step">
        <div className="text-center">
          <div className="animate-spin w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-white text-lg">{chromeAIStatus.statusMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="setup-step chrome-ai-step">
      <div className="step-header mb-8">
        <h2 className="text-3xl font-bold mb-2 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
          Chrome AI Setup
        </h2>
        <p className="text-white/90">
          Chrome AI provides free, local AI capabilities without requiring API keys or external services.
        </p>
      </div>

      {/* Status Display */}
      <div className="glass-container rounded-xl p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className={`text-4xl ${chromeAIStatus.isReady ? 'text-green-400' : chromeAIStatus.isChromeAIAvailable ? 'text-yellow-400' : 'text-red-400'}`}>
            {chromeAIStatus.isReady ? '✓' : chromeAIStatus.isChromeAIAvailable ? '⚠️' : '✗'}
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-white mb-2">Status</h3>
            <p className="text-white/90">{chromeAIStatus.statusMessage}</p>
            {chromeAIStatus.chromeVersion && (
              <p className="text-sm text-white/80 mt-1">
                Chrome version: {chromeAIStatus.chromeVersion}
              </p>
            )}
          </div>
          <button
            onClick={checkChromeAI}
            className="glass-button rounded-xl px-4 py-2 text-sm"
          >
            🔄 Recheck
          </button>
        </div>
      </div>

      {/* Chrome AI Not Available */}
      {!chromeAIStatus.isChromeAIAvailable && (
        <div className="glass-container rounded-xl p-6 mb-6 border-2 border-yellow-500/30">
          <div className="flex items-start gap-3">
            <span className="text-2xl">ℹ️</span>
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">Chrome AI Not Available</h3>
              <p className="text-white/90 mb-4">
                {chromeAIStatus.chromeVersion < 138
                  ? `Your Chrome version (${chromeAIStatus.chromeVersion}) doesn't support Chrome AI. Chrome 138+ is required.`
                  : 'Chrome AI is not available on your system.'}
              </p>
              <p className="text-white/90 mb-4">
                Don't worry! You can still use this assistant with:
              </p>
              <ul className="list-disc list-inside text-white/80 space-y-2 ml-4">
                <li><strong className="text-white">OpenAI</strong> - Cloud-based AI (requires API key)</li>
                <li><strong className="text-white">Ollama</strong> - Local AI server (free, requires installation)</li>
              </ul>
              <p className="text-sm text-white/70 mt-4">
                You'll be able to choose your preferred provider in the next step.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Needs Browser Flags */}
      {chromeAIStatus.needsFlags && chromeAIStatus.flags.length > 0 && (
        <div className="glass-container rounded-xl p-6 mb-6">
          <h3 className="text-xl font-semibold text-white mb-4">Enable Required Flags</h3>
          <p className="text-white/90 mb-4">
            Chrome AI requires the following browser flags to be enabled:
          </p>
          
          <div className="space-y-4">
            {chromeAIStatus.flags.map((flag, index) => (
              <div key={index} className="bg-white/5 p-4 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <code className="text-purple-300">{flag.name}</code>
                  <button
                    onClick={() => copyToClipboard(flag.url)}
                    className="text-sm text-blue-400 hover:text-blue-300"
                  >
                    📋 Copy Link
                  </button>
                </div>
                <p className="text-sm text-white/80 mb-2">{flag.description}</p>
                <p className="text-sm">
                  <span className="text-white/70">Set to:</span>{' '}
                  <code className="text-green-400">{flag.value}</code>
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <h4 className="text-white font-semibold mb-2">How to enable flags:</h4>
            <ol className="list-decimal list-inside text-white/90 space-y-2 text-sm">
              <li>Copy each flag link above</li>
              <li>Paste in a new browser tab</li>
              <li>Set the flag to "Enabled"</li>
              <li><strong className="text-yellow-300">Restart your browser</strong> after enabling all flags</li>
              <li>Come back and click "Recheck" button</li>
            </ol>
          </div>
        </div>
      )}

      {/* Needs Download */}
      {chromeAIStatus.needsDownload && (
        <div className="glass-container rounded-xl p-6 mb-6">
          <h3 className="text-xl font-semibold text-white mb-4">Download Chrome AI Model</h3>
          <p className="text-white/90 mb-4">
            The Chrome AI model needs to be downloaded before you can use it. This is a one-time download.
          </p>

          {!showInstructions ? (
            <button
              onClick={startDownload}
              className="glass-button rounded-xl px-6 py-3 text-lg font-semibold w-full"
            >
              📥 Start Download
            </button>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                <h4 className="text-white font-semibold mb-2">Download Instructions:</h4>
                <ol className="list-decimal list-inside text-white/90 space-y-2 text-sm">
                  <li>Two tabs should have opened:
                    <ul className="list-disc list-inside ml-6 mt-1 text-white/80">
                      <li><code>chrome://components</code> - To start download</li>
                      <li><code>chrome://on-device-internals</code> - To monitor progress</li>
                    </ul>
                  </li>
                  <li>In the Components page, find "Optimization Guide On Device Model"</li>
                  <li>Click the "Check for update" button</li>
                  <li>Monitor download progress in the On-Device Internals page</li>
                  <li>Once complete, come back here and click "Recheck"</li>
                </ol>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => window.open('chrome://components', '_blank')}
                  className="glass-button rounded-xl flex-1 py-2 text-sm"
                >
                  Open Components
                </button>
                <button
                  onClick={() => window.open('chrome://on-device-internals', '_blank')}
                  className="glass-button rounded-xl flex-1 py-2 text-sm"
                >
                  Open Internals
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Chrome AI Ready */}
      {chromeAIStatus.isReady && (
        <div className="glass-container rounded-xl p-6 mb-6 border-2 border-green-500/30">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🎉</span>
            <div>
              <h3 className="text-lg font-semibold text-green-400 mb-2">Chrome AI is Ready!</h3>
              <p className="text-white/90 mb-2">
                You can use Chrome AI for free, privacy-focused local AI processing.
              </p>
              <ul className="list-disc list-inside text-white/80 space-y-1 ml-4 text-sm">
                <li>No API keys required</li>
                <li>All processing happens locally on your device</li>
                <li>Your data never leaves your computer</li>
                <li>Completely free to use</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-between items-center gap-4">
        {!chromeAIStatus.isReady && (
          <button
            onClick={handleSkipChromeAI}
            className="glass-button rounded-xl px-6 py-3 opacity-70 hover:opacity-100"
          >
            Skip Chrome AI (Use Alternative)
          </button>
        )}
        
        {chromeAIStatus.isReady && (
          <button
            onClick={handleContinue}
            className="glass-button rounded-xl px-8 py-3 text-lg font-semibold ml-auto"
          >
            Continue →
          </button>
        )}
      </div>

    </div>
  );
};

export default ChromeAISetupStep;
