/**
 * SettingsPanel Component
 * User-facing settings panel that lives inside ChatContainer
 * Contains UI, LLM, TTS, STT, and AI Features configurations with test buttons
 * Uses ConfigContext for state management
 */

import { useState, useEffect } from 'react';
import ChromeAIValidator from '../services/ChromeAIValidator';
import UISettings from './settings/UISettings';
import LLMSettings from './settings/LLMSettings';
import TTSSettings from './settings/TTSSettings';
import STTSettings from './settings/STTSettings';
import AIFeaturesSettings from './settings/AIFeaturesSettings';

const SettingsPanel = ({ onClose, isLightBackground }) => {
  const [activeTab, setActiveTab] = useState('ui');
  const [hasChromeAI, setHasChromeAI] = useState(false);
  
  // Check Chrome version on mount
  useEffect(() => {
    const validator = ChromeAIValidator;
    const hasMinVersion = validator.hasMinimumChromeVersion();
    setHasChromeAI(hasMinVersion);
    
    if (!hasMinVersion) {
      const version = validator.getChromeVersion();
      console.log(`[SettingsPanel] Chrome ${version} detected - Chrome AI requires Chrome 138+`);
    }
  }, []);

  return (
    <div className={`absolute inset-0 flex flex-col glass-container ${isLightBackground ? 'glass-container-dark' : ''} rounded-2xl overflow-hidden`}>
      {/* Header */}
      <div className="flex justify-between items-center px-6 py-4 border-b border-white/20">
        <h2 className="text-lg font-semibold text-white">Settings</h2>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors"
          aria-label="Close settings"
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/20 px-6">
        <button
          className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'ui' 
              ? 'border-white text-white' 
              : 'border-transparent text-white/60 hover:text-white/90'
          }`}
          onClick={() => setActiveTab('ui')}
        >
          UI
        </button>
        <button
          className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'llm' 
              ? 'border-white text-white' 
              : 'border-transparent text-white/60 hover:text-white/90'
          }`}
          onClick={() => setActiveTab('llm')}
        >
          LLM
        </button>
        <button
          className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'tts' 
              ? 'border-white text-white' 
              : 'border-transparent text-white/60 hover:text-white/90'
          }`}
          onClick={() => setActiveTab('tts')}
        >
          TTS
        </button>
        <button
          className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'stt' 
              ? 'border-white text-white' 
              : 'border-transparent text-white/60 hover:text-white/90'
          }`}
          onClick={() => setActiveTab('stt')}
        >
          STT
        </button>
        <button
          className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'ai-plus' 
              ? 'border-white text-white' 
              : 'border-transparent text-white/60 hover:text-white/90'
          }`}
          onClick={() => setActiveTab('ai-plus')}
        >
          AI+
        </button>
      </div>

      {/* Tab Content - Scrollable with custom scrollbar */}
      <div 
        className="flex-1 overflow-y-auto px-6 py-4"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255, 255, 255, 0.3) rgba(255, 255, 255, 0.1)',
        }}
      >
        {/* UI Tab */}
        {activeTab === 'ui' && <UISettings isLightBackground={isLightBackground} />}

        {/* LLM Tab */}
        {activeTab === 'llm' && <LLMSettings isLightBackground={isLightBackground} hasChromeAI={hasChromeAI} />}

        {/* TTS Tab */}
        {activeTab === 'tts' && <TTSSettings isLightBackground={isLightBackground} />}

        {/* STT Tab */}
        {activeTab === 'stt' && <STTSettings isLightBackground={isLightBackground} hasChromeAI={hasChromeAI} />}

        {/* AI Features Tab */}
        {activeTab === 'ai-plus' && <AIFeaturesSettings isLightBackground={isLightBackground} />}
      </div>
    </div>
  );
};

export default SettingsPanel;
