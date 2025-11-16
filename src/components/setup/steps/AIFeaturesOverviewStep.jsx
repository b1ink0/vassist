/**
 * AIFeaturesOverviewStep - Quick overview of AI+ features
 * Simple enable/disable toggles for all AI features
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSetup } from '../../../contexts/SetupContext';
import { Icon } from '../../icons';
import Toggle from '../../common/Toggle';
import ShortcutsConfig from '../../common/ShortcutsConfig';
import Logger from '../../../services/LoggerService';

const AIFeaturesOverviewStep = ({ isLightBackground = false }) => {
  const { setupData, updateSetupData } = useSetup();
  const initialLoadRef = useRef(true);
  const [features, setFeatures] = useState({
    translator: { enabled: true },
    languageDetector: { enabled: true },
    summarizer: { enabled: true },
    rewriter: { enabled: true },
    writer: { enabled: true },
  });
  const [shortcuts, setShortcuts] = useState({
    enabled: false,
    openChat: '',
    toggleMode: '',
  });

  // Load existing setup data on mount
  useEffect(() => {
    const aiFeatures = setupData?.aiFeatures;
    if (aiFeatures) {
      setFeatures(aiFeatures);
    }
    
    const uiShortcuts = setupData?.ui?.shortcuts;
    if (uiShortcuts) {
      setShortcuts(uiShortcuts);
    }
    
    // Mark initial load complete
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Save data whenever features change (but skip initial load)
  useEffect(() => {
    if (initialLoadRef.current) return;
    
    Logger.log('AIFeaturesOverviewStep', 'Saving AI features config');
    updateSetupData({ aiFeatures: features });
  }, [features, updateSetupData]);
  
  const handleShortcutsChange = useCallback((newShortcuts) => {
    setShortcuts(newShortcuts);
    
    if (!initialLoadRef.current) {
      Logger.log('AIFeaturesOverviewStep', 'Saving shortcuts config');
      updateSetupData('ui.shortcuts', newShortcuts);
    }
  }, [updateSetupData]);

  const handleToggle = (featureKey) => {
    setFeatures(prev => ({
      ...prev,
      [featureKey]: { enabled: !prev[featureKey]?.enabled }
    }));
  };

  const featureList = [
    {
      key: 'translator',
      icon: 'language',
      name: 'Translation',
      description: '27 languages supported - translate text on the fly'
    },
    {
      key: 'languageDetector',
      icon: 'ai',
      name: 'Language Detection',
      description: 'Automatically detect the language of any text'
    },
    {
      key: 'summarizer',
      icon: 'file-text',
      name: 'Summarization',
      description: 'Get quick summaries of long texts or articles'
    },
    {
      key: 'rewriter',
      icon: 'edit',
      name: 'Rewriter',
      description: 'Rephrase and improve text with different tones and styles'
    },
    {
      key: 'writer',
      icon: 'write',
      name: 'Writer',
      description: 'Generate new content based on prompts and context'
    },
  ];

  return (
    <div className="setup-step space-y-4">
      <div className="mb-3">
        <h2 className="text-xl sm:text-2xl font-bold mb-1 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
          AI+ Features
        </h2>
        <p className="text-xs sm:text-sm text-white/90">
          Enable powerful AI tools for your workflow
        </p>
      </div>

      {/* Info Banner */}
      <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
        <div className="flex items-start gap-2">
          <Icon name="info" size={18} className="text-blue-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-300">
            All features are <span className="font-semibold">enabled by default</span>. You can customize these settings later in the Settings panel.
          </p>
        </div>
      </div>

      {/* Feature Toggles */}
      <div className="space-y-2">
        {featureList.map((feature) => (
          <div
            key={feature.key}
            className="rounded-lg p-3 border border-white/10 hover:border-white/20 transition-all"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                  <Icon name={feature.icon} size={16} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-white mb-0.5">{feature.name}</h3>
                  <p className="text-xs text-white/70">{feature.description}</p>
                </div>
              </div>
              <div className="flex-shrink-0">
                <Toggle
                  checked={features[feature.key]?.enabled !== false}
                  onChange={() => handleToggle(feature.key)}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 mt-4">
        <div className="flex items-start gap-2">
          <Icon name="check-circle" size={18} className="text-green-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-green-300">
            <p className="font-semibold mb-1">Ready to Go!</p>
            <p className="text-green-200/90">
              {Object.values(features).filter(f => f?.enabled !== false).length} of {featureList.length} features enabled
            </p>
          </div>
        </div>
      </div>

      {/* Keyboard Shortcuts Section */}
      <div className="mt-8 pt-6 border-t border-white/10">
        <div className="mb-4">
          <h3 className="text-lg font-bold mb-1 text-white">
            Keyboard Shortcuts
          </h3>
          <p className="text-xs text-white/70">
            Optional: Set up quick access shortcuts (can be configured later)
          </p>
        </div>

        <div className="rounded-lg p-4 border border-white/10 bg-white/5">
          <ShortcutsConfig
            shortcuts={shortcuts}
            onShortcutsChange={handleShortcutsChange}
            isLightBackground={isLightBackground}
          />
        </div>
      </div>
    </div>
  );
};

export default AIFeaturesOverviewStep;
