import { useState, useEffect, useCallback } from 'react';
import { useSetup } from '../../../contexts/SetupContext';
import AIServiceProxy from '../../../services/proxies/AIServiceProxy';

const SystemRequirementsStep = () => {
  const { markStepComplete, updateSetupData, nextStep } = useSetup();
  const [systemInfo, setSystemInfo] = useState({
    browser: { name: 'Unknown', version: 'Unknown', meets: false },
    ram: { available: 'Checking...', meets: null },
    network: { status: 'Checking...', meets: null }
  });
  const [chromeAIStatus, setChromeAIStatus] = useState({
    checking: true,
    available: false,
    ready: false,
    message: 'Checking...',
    needsFlags: false,
    needsDownload: false,
    flags: []
  });

  const checkSystemRequirements = useCallback(async () => {
    const browserInfo = getBrowserInfo();
    const ramInfo = await checkRAM();
    const networkInfo = checkNetwork();

    const info = {
      browser: browserInfo,
      ram: ramInfo,
      network: networkInfo
    };

    setSystemInfo(info);
    
    // Check Chrome AI if Chrome 138+
    if (browserInfo.meets) {
      try {
        const aiResult = await AIServiceProxy.checkChromeAIAvailability();
        setChromeAIStatus({
          checking: false,
          available: aiResult.available,
          ready: aiResult.available && !aiResult.requiresFlags,
          message: aiResult.message,
          needsFlags: aiResult.requiresFlags,
          needsDownload: aiResult.state === 'downloadable' || aiResult.state === 'after-download',
          flags: aiResult.flags || []
        });
        
        updateSetupData({
          systemInfo: info,
          systemCheckPassed: true,
          chromeAI: {
            available: aiResult.available,
            ready: aiResult.available && !aiResult.requiresFlags,
            needsSetup: aiResult.requiresFlags || aiResult.state === 'downloadable'
          }
        });
      } catch (error) {
        console.error('Chrome AI check failed:', error);
        setChromeAIStatus({
          checking: false,
          available: false,
          ready: false,
          message: 'Chrome AI check failed',
          needsFlags: false,
          needsDownload: false,
          flags: []
        });
        
        updateSetupData({
          systemInfo: info,
          systemCheckPassed: browserInfo.meets,
          chromeAI: { available: false, ready: false, skipped: false }
        });
      }
    } else {
      setChromeAIStatus({
        checking: false,
        available: false,
        ready: false,
        message: 'Chrome 138+ required',
        needsFlags: false,
        needsDownload: false,
        flags: []
      });
      
      updateSetupData({
        systemInfo: info,
        systemCheckPassed: browserInfo.meets,
        chromeAI: { available: false, ready: false, skipped: false }
      });
    }
  }, [updateSetupData]);

  useEffect(() => {
    checkSystemRequirements();
  }, [checkSystemRequirements]);

  const getBrowserInfo = () => {
    let browserName = 'Unknown';
    let version = 'Unknown';
    let meets = false;

    // Check if running as Chrome extension first
    const chromeAPI = globalThis.chrome || window.chrome;
    if (chromeAPI && chromeAPI.runtime && chromeAPI.runtime.id) {
      // We're in a Chrome extension - detect browser from chrome object
      const ua = navigator.userAgent;
      const isEdge = ua.includes('Edg/');
      browserName = isEdge ? 'Edge' : 'Chrome';
      
      // Try to get Chrome version from userAgent
      const chromeMatch = ua.match(/Chrome\/(\d+)/);
      if (chromeMatch) {
        version = parseInt(chromeMatch[1]);
        meets = version >= 138;
      } else {
        // Fallback: assume Chrome if extension API exists
        version = 'Extension Mode';
        meets = true; // Assume compatible if running as extension
      }
    } else {
      // Regular browser detection
      const ua = navigator.userAgent;
      
      // Check for Chrome/Edge
      if (ua.includes('Chrome/')) {
        const match = ua.match(/Chrome\/(\d+)/);
        if (match) {
          version = parseInt(match[1]);
          browserName = ua.includes('Edg/') ? 'Edge' : 'Chrome';
          meets = version >= 138;
        }
      } else if (ua.includes('Firefox/')) {
        const match = ua.match(/Firefox\/(\d+)/);
        if (match) {
          version = parseInt(match[1]);
          browserName = 'Firefox';
          meets = false; // Firefox doesn't support Chrome AI
        }
      } else if (ua.includes('Safari/') && !ua.includes('Chrome')) {
        browserName = 'Safari';
        meets = false;
      }
    }

    return {
      name: browserName,
      version: version.toString(),
      meets,
      recommendation: 'Chrome 138+ recommended for Chrome AI features'
    };
  };

  const checkRAM = async () => {
    if (navigator.deviceMemory) {
      const ramGB = navigator.deviceMemory;
      return {
        available: `${ramGB} GB`,
        meets: ramGB >= 4
      };
    }
    
    return {
      available: 'Unknown',
      meets: null
    };
  };

  const checkNetwork = () => {
    const online = navigator.onLine;
    return {
      status: online ? 'Connected' : 'Offline',
      meets: online
    };
  };

  const getStatusIcon = (meets) => {
    if (meets === null) return '❓';
    return meets ? '✓' : '⚠️';
  };

  const getStatusColor = (meets) => {
    if (meets === null) return 'text-white/80';
    return meets ? 'text-green-400' : 'text-yellow-400';
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  const handleContinue = () => {
    markStepComplete();
    nextStep();
  };

  const recheckChromeAI = async () => {
    setChromeAIStatus(prev => ({ ...prev, checking: true }));
    await checkSystemRequirements();
  };

  return (
    <div className="setup-step space-y-3 sm:space-y-4">
      <div className="mb-3 sm:mb-4">
        <h2 className="text-xl sm:text-2xl font-bold mb-1 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
          System & Chrome AI
        </h2>
        <p className="text-xs sm:text-sm text-white/90">
          Checking your system and Chrome AI availability
        </p>
      </div>

      {/* System Requirements */}
      <div className="space-y-2">
        {/* Browser */}
        <div className="rounded-lg p-2 sm:p-3 border border-white/10">
          <div className="flex items-center gap-2">
            <span className={`text-lg sm:text-xl ${getStatusColor(systemInfo.browser.meets)}`}>
              {getStatusIcon(systemInfo.browser.meets)}
            </span>
            <div className="flex-1 min-w-0">
              <h3 className="text-xs sm:text-sm font-semibold text-white">Browser</h3>
              <p className="text-xs text-white/80 truncate">
                {systemInfo.browser.name} {systemInfo.browser.version}
              </p>
            </div>
          </div>
          {!systemInfo.browser.meets && systemInfo.browser.version !== 'Unknown' && (
            <p className="text-xs text-yellow-300 mt-1 ml-7 sm:ml-8">
              Chrome 138+ required for Chrome AI
            </p>
          )}
        </div>

        {/* RAM */}
        <div className="rounded-lg p-2 sm:p-3 border border-white/10">
          <div className="flex items-center gap-2">
            <span className={`text-lg sm:text-xl ${getStatusColor(systemInfo.ram.meets)}`}>
              {getStatusIcon(systemInfo.ram.meets)}
            </span>
            <div className="flex-1">
              <h3 className="text-xs sm:text-sm font-semibold text-white">RAM</h3>
              <p className="text-xs text-white/80">{systemInfo.ram.available}</p>
            </div>
          </div>
        </div>

        {/* Network */}
        <div className="rounded-lg p-2 sm:p-3 border border-white/10">
          <div className="flex items-center gap-2">
            <span className={`text-lg sm:text-xl ${getStatusColor(systemInfo.network.meets)}`}>
              {getStatusIcon(systemInfo.network.meets)}
            </span>
            <div className="flex-1">
              <h3 className="text-xs sm:text-sm font-semibold text-white">Network</h3>
              <p className="text-xs text-white/80">{systemInfo.network.status}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Chrome AI Status */}
      <div className="rounded-lg p-2 sm:p-3 border border-white/10">
        <div className="flex items-start gap-2">
          <span className={`text-lg sm:text-xl ${chromeAIStatus.checking ? 'text-white/50' : chromeAIStatus.ready ? 'text-green-400' : chromeAIStatus.available ? 'text-yellow-400' : 'text-red-400'}`}>
            {chromeAIStatus.checking ? '⏳' : chromeAIStatus.ready ? '✓' : chromeAIStatus.available ? '⚠️' : '✗'}
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="text-xs sm:text-sm font-semibold text-white">Chrome AI</h3>
            <p className="text-xs text-white/80">{chromeAIStatus.message}</p>
          </div>
          {!chromeAIStatus.checking && (
            <button
              onClick={recheckChromeAI}
              className="glass-button rounded px-2 py-1 text-xs"
            >
              🔄
            </button>
          )}
        </div>

        {/* Chrome AI Flags */}
        {chromeAIStatus.needsFlags && chromeAIStatus.flags.length > 0 && (
          <div className="mt-2 space-y-1">
            <p className="text-xs text-white/90">Enable these flags:</p>
            {chromeAIStatus.flags.map((flag, index) => (
              <div key={index} className="bg-white/5 p-2 rounded text-xs">
                <div className="flex items-center justify-between gap-2">
                  <code className="text-purple-300 text-[10px] sm:text-xs truncate">{flag.name}</code>
                  <button
                    onClick={() => copyToClipboard(flag.url)}
                    className="text-blue-400 hover:text-blue-300 shrink-0"
                  >
                    📋
                  </button>
                </div>
                <p className="text-[10px] text-white/70 mt-0.5 hidden sm:block">{flag.description}</p>
              </div>
            ))}
            <div className="mt-2 p-2 bg-blue-500/10 border border-blue-500/30 rounded text-[10px] sm:text-xs text-blue-200">
              <p className="font-semibold mb-1">How to enable:</p>
              <ol className="list-decimal list-inside space-y-0.5 ml-2">
                <li>Copy flag link</li>
                <li>Paste in new tab</li>
                <li>Set to "Enabled"</li>
                <li className="text-yellow-300">Restart browser</li>
                <li>Click recheck 🔄</li>
              </ol>
            </div>
          </div>
        )}

        {/* Chrome AI Download */}
        {chromeAIStatus.needsDownload && (
          <div className="mt-2 space-y-2">
            <p className="text-xs text-white/90">Model download required</p>
            <div className="flex gap-1 sm:gap-2">
              <button
                onClick={() => window.open('chrome://components', '_blank')}
                className="glass-button rounded flex-1 py-1.5 text-[10px] sm:text-xs"
              >
                Components
              </button>
              <button
                onClick={() => window.open('chrome://on-device-internals', '_blank')}
                className="glass-button rounded flex-1 py-1.5 text-[10px] sm:text-xs"
              >
                Monitor
              </button>
            </div>
            <div className="p-2 bg-green-500/10 border border-green-500/30 rounded text-[10px] sm:text-xs text-green-200">
              <ol className="list-decimal list-inside space-y-0.5">
                <li>Open Components tab</li>
                <li>Find "Optimization Guide"</li>
                <li>Click "Check for update"</li>
                <li>Monitor in second tab</li>
                <li>Recheck when done 🔄</li>
              </ol>
            </div>
          </div>
        )}

        {/* Chrome AI Not Available */}
        {!chromeAIStatus.checking && !chromeAIStatus.available && systemInfo.browser.meets && (
          <p className="text-xs text-white/70 mt-2">
            Don't worry! You can use OpenAI or Ollama instead.
          </p>
        )}

        {/* Chrome AI Ready */}
        {chromeAIStatus.ready && (
          <div className="mt-2 p-2 bg-green-500/10 border border-green-500/30 rounded">
            <p className="text-xs text-green-300">✓ Free local AI ready!</p>
          </div>
        )}
      </div>

      {/* Continue Button */}
      <div className="flex justify-end pt-2">
        <button
          onClick={handleContinue}
          className="glass-button rounded-lg px-6 py-2 sm:px-8 sm:py-3 text-sm sm:text-base font-semibold"
        >
          Continue →
        </button>
      </div>
    </div>
  );
};

export default SystemRequirementsStep;
