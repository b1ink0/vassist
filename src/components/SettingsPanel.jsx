/**
 * @fileoverview Settings panel component with tabbed interface for UI, LLM, TTS, STT, and AI features configuration.
 */

import { useState, useEffect } from 'react'
import { Icon } from './icons';;
import ChromeAIValidator from '../services/ChromeAIValidator';
import UISettings from './settings/UISettings';
import ThreeDSettings from './settings/ThreeDSettings';
import LLMSettings from './settings/LLMSettings';
import TTSSettings from './settings/TTSSettings';
import STTSettings from './settings/STTSettings';
import AIFeaturesSettings from './settings/AIFeaturesSettings';
import { useConfig } from '../contexts/ConfigContext';
import Logger from '../services/LoggerService';

/**
 * Settings panel with configuration options for UI, LLM, TTS, STT, and AI features.
 * 
 * @component
 * @param {Object} props - Component props
 * @param {Function} props.onClose - Callback when panel is closed
 * @param {boolean} props.isLightBackground - Whether chat has light background
 * @param {string} props.animationClass - CSS animation class
 * @param {Function} props.onRequestDeleteModelDialog - Callback to show delete model dialog
 * @param {Function} props.onRequestDeleteMotionDialog - Callback to show delete motion dialog
 * @param {number} props.refreshTrigger - Trigger to refresh lists after delete
 * @returns {JSX.Element} Settings panel component
 */
const SettingsPanel = ({ 
  onClose, 
  isLightBackground, 
  animationClass = '',
  onRequestDeleteModelDialog,
  onRequestDeleteMotionDialog,
  refreshTrigger
}) => {
  const [activeTab, setActiveTab] = useState('ui');
  const [hasChromeAI, setHasChromeAI] = useState(false);
  const [tabIndicatorStyle, setTabIndicatorStyle] = useState({ left: 0, width: 0 });
  const tabsRef = useState({
    ui: null,
    '3d': null,
    llm: null,
    tts: null,
    stt: null,
    'ai-plus': null,
  })[0];
  
  const {
    uiConfigSaved,
    aiConfigSaved,
    aiConfigError,
    aiTesting,
    clearAIConfigError,
    ttsConfigSaved,
    ttsConfigError,
    ttsTesting,
    clearTTSConfigError,
    sttConfigSaved,
    sttConfigError,
    sttTesting,
    clearSTTConfigError,
  } = useConfig();
  
  useEffect(() => {
    const validator = ChromeAIValidator;
    const hasMinVersion = validator.hasMinimumChromeVersion();
    setHasChromeAI(hasMinVersion);
    
    if (!hasMinVersion) {
      const version = validator.getChromeVersion();
      Logger.log('SettingsPanel', `Chrome ${version} detected - Chrome AI requires Chrome 138+`);
    }
  }, []);

  useEffect(() => {
    const activeTabElement = tabsRef[activeTab];
    if (activeTabElement) {
      const { offsetLeft, offsetWidth } = activeTabElement;
      setTabIndicatorStyle({ left: offsetLeft, width: offsetWidth });
    }
  }, [activeTab, tabsRef]);

  const getActiveStatus = () => {
    if (activeTab === 'ui') {
      if (uiConfigSaved) return { type: 'success', message: 'Auto-saved successfully', dismissible: false };
    } else if (activeTab === 'llm') {
      if (aiTesting) return { type: 'testing', message: 'Testing connection...', dismissible: false };
      if (aiConfigSaved) return { type: 'success', message: 'Auto-saved successfully', dismissible: false };
      if (aiConfigError) {
        const parsed = parseStatusMessage(aiConfigError);
        return { type: parsed.type, message: parsed.text, dismissible: true };
      }
    } else if (activeTab === 'tts') {
      if (ttsTesting) return { type: 'testing', message: 'Testing TTS...', dismissible: false };
      if (ttsConfigSaved) return { type: 'success', message: 'Auto-saved successfully', dismissible: false };
      if (ttsConfigError) {
        const parsed = parseStatusMessage(ttsConfigError);
        return { type: parsed.type, message: parsed.text, dismissible: true };
      }
    } else if (activeTab === 'stt') {
      if (sttTesting) return { type: 'testing', message: 'Testing STT...', dismissible: false };
      if (sttConfigSaved) return { type: 'success', message: 'Auto-saved successfully', dismissible: false };
      if (sttConfigError) {
        const parsed = parseStatusMessage(sttConfigError);
        return { type: parsed.type, message: parsed.text, dismissible: true };
      }
    }
    return null;
  };

  /**
   * Parses status message with prefix (success:, error:, warning:, etc.).
   * 
   * @param {string} msg - Status message to parse
   * @returns {Object} Parsed status with type and text
   */
  const parseStatusMessage = (msg) => {
    const prefixMatch = msg.match(/^(success|warning|error|hourglass|error-status):\s*(.+)$/i);
    if (!prefixMatch) {
      return { type: 'info', text: msg };
    }
    const [, prefix, text] = prefixMatch;
    const lowerPrefix = prefix.toLowerCase();
    
    if (lowerPrefix === 'success') return { type: 'success', text };
    if (lowerPrefix === 'warning') return { type: 'warning', text };
    if (lowerPrefix === 'error' || lowerPrefix === 'error-status') return { type: 'error', text };
    if (lowerPrefix === 'hourglass') return { type: 'testing', text };
    
    return { type: 'info', text };
  };

  const activeStatus = getActiveStatus();

  /**
   * Handles dismissal of status messages for LLM, TTS, or STT tabs.
   */
  const handleDismissStatus = () => {
    if (activeTab === 'llm' && aiConfigError) {
      clearAIConfigError();
    } else if (activeTab === 'tts' && ttsConfigError) {
      clearTTSConfigError();
    } else if (activeTab === 'stt' && sttConfigError) {
      clearSTTConfigError();
    }
  };

  return (
    <div className={`absolute inset-0 flex flex-col glass-container ${isLightBackground ? 'glass-container-dark' : ''} rounded-2xl overflow-hidden ${animationClass}`}>
      <div className="flex justify-between items-center px-6 py-4 border-b border-white/20">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-white shrink-0">Settings</h2>
          
          {activeStatus && (
            <div 
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg animate-in fade-in max-w-md min-w-0 ${
                activeStatus.type === 'success' ? 'bg-emerald-500/10' :
                activeStatus.type === 'testing' ? 'bg-blue-500/10' :
                activeStatus.type === 'warning' ? 'bg-amber-500/10' :
                'bg-red-500/10'
              }`}
              title={activeStatus.message}
            >
              <span className="text-xs text-white truncate break-all overflow-hidden min-w-0 flex-1">
                {activeStatus.message}
              </span>
              {activeStatus.dismissible && (
                <button
                  onClick={handleDismissStatus}
                  className="shrink-0 w-4 h-4 flex items-center justify-center rounded hover:bg-white/20 text-white/60 hover:text-white transition-colors text-xs"
                  aria-label="Dismiss"
                ><Icon name="close" size={16} /></button>
              )}
            </div>
          )}
        </div>
        
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors shrink-0"
          aria-label="Close settings"
        ><Icon name="close" size={16} /></button>
      </div>

      <div className="flex border-b border-white/20 px-6 relative">
        <div 
          className="absolute bottom-0 h-0.5 bg-white transition-all duration-300 ease-out"
          style={{
            left: `${tabIndicatorStyle.left}px`,
            width: `${tabIndicatorStyle.width}px`,
          }}
        />
        
        <button
          ref={(el) => (tabsRef.ui = el)}
          className={`px-4 py-3 text-sm font-medium transition-all duration-300 ease-out ${
            activeTab === 'ui' 
              ? 'text-white' 
              : 'text-white/60 hover:text-white/90'
          }`}
          onClick={() => setActiveTab('ui')}
        >
          UI
        </button>
        <button
          ref={(el) => (tabsRef['3d'] = el)}
          className={`px-4 py-3 text-sm font-medium transition-all duration-300 ease-out ${
            activeTab === '3d' 
              ? 'text-white' 
              : 'text-white/60 hover:text-white/90'
          }`}
          onClick={() => setActiveTab('3d')}
        >
          3D
        </button>
        <button
          ref={(el) => (tabsRef.llm = el)}
          className={`px-4 py-3 text-sm font-medium transition-all duration-300 ease-out ${
            activeTab === 'llm' 
              ? 'text-white' 
              : 'text-white/60 hover:text-white/90'
          }`}
          onClick={() => setActiveTab('llm')}
        >
          LLM
        </button>
        <button
          ref={(el) => (tabsRef.tts = el)}
          className={`px-4 py-3 text-sm font-medium transition-all duration-300 ease-out ${
            activeTab === 'tts' 
              ? 'text-white' 
              : 'text-white/60 hover:text-white/90'
          }`}
          onClick={() => setActiveTab('tts')}
        >
          TTS
        </button>
        <button
          ref={(el) => (tabsRef.stt = el)}
          className={`px-4 py-3 text-sm font-medium transition-all duration-300 ease-out ${
            activeTab === 'stt' 
              ? 'text-white' 
              : 'text-white/60 hover:text-white/90'
          }`}
          onClick={() => setActiveTab('stt')}
        >
          STT
        </button>
        <button
          ref={(el) => (tabsRef['ai-plus'] = el)}
          className={`px-4 py-3 text-sm font-medium transition-all duration-300 ease-out ${
            activeTab === 'ai-plus' 
              ? 'text-white' 
              : 'text-white/60 hover:text-white/90'
          }`}
          onClick={() => setActiveTab('ai-plus')}
        >
          AI+
        </button>
      </div>

      <div className="flex-1 overflow-hidden relative">
        <div 
          className="absolute inset-0 flex transition-transform duration-300 ease-out"
          style={{
            transform: `translateX(-${['ui', '3d', 'llm', 'tts', 'stt', 'ai-plus'].indexOf(activeTab) * 100}%)`
          }}
        >
          <div className="flex-shrink-0 w-full overflow-y-auto px-6 py-4" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255, 255, 255, 0.3) rgba(255, 255, 255, 0.1)' }}>
            <UISettings isLightBackground={isLightBackground} />
          </div>

          <div className="flex-shrink-0 w-full overflow-y-auto px-6 py-4" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255, 255, 255, 0.3) rgba(255, 255, 255, 0.1)' }}>
            <ThreeDSettings 
              isLightBackground={isLightBackground} 
              onRequestDeleteModelDialog={onRequestDeleteModelDialog}
              onRequestDeleteMotionDialog={onRequestDeleteMotionDialog}
              refreshTrigger={refreshTrigger}
            />
          </div>

          <div className="flex-shrink-0 w-full overflow-y-auto px-6 py-4" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255, 255, 255, 0.3) rgba(255, 255, 255, 0.1)' }}>
            <LLMSettings isLightBackground={isLightBackground} hasChromeAI={hasChromeAI} />
          </div>

          <div className="flex-shrink-0 w-full overflow-y-auto px-6 py-4" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255, 255, 255, 0.3) rgba(255, 255, 255, 0.1)' }}>
            <TTSSettings isLightBackground={isLightBackground} />
          </div>

          <div className="flex-shrink-0 w-full overflow-y-auto px-6 py-4" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255, 255, 255, 0.3) rgba(255, 255, 255, 0.1)' }}>
            <STTSettings isLightBackground={isLightBackground} hasChromeAI={hasChromeAI} />
          </div>

          <div className="flex-shrink-0 w-full overflow-y-auto px-6 py-4" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255, 255, 255, 0.3) rgba(255, 255, 255, 0.1)' }}>
            <AIFeaturesSettings isLightBackground={isLightBackground} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
