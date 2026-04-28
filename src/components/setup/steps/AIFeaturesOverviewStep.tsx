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
import { Card } from '../../ui';
import { cn } from '../../../utils/cn';
import { isAndroid } from '../../../utils/PlatformUtils';

type FeatureKey = 'translator' | 'languageDetector' | 'summarizer' | 'rewriter' | 'writer';

interface FeatureState {
  translator: { enabled: boolean };
  languageDetector: { enabled: boolean };
  summarizer: { enabled: boolean };
  rewriter: { enabled: boolean };
  writer: { enabled: boolean };
}

interface ShortcutState {
  enabled: boolean;
  openChat: string;
  toggleMode: string;
  toggleVisibility: string;
}

interface FeatureItem {
  key: FeatureKey;
  icon: string;
  name: string;
  description: string;
}

const AIFeaturesOverviewStep = ({ isLightBackground = false }) => {
  const { setupData, updateSetupData } = useSetup();
  const initialLoadRef = useRef(true);
  const [features, setFeatures] = useState<FeatureState>({
    translator: { enabled: true },
    languageDetector: { enabled: true },
    summarizer: { enabled: true },
    rewriter: { enabled: true },
    writer: { enabled: true },
  });
  const [shortcuts, setShortcuts] = useState<ShortcutState>({
    enabled: false,
    openChat: '',
    toggleMode: '',
    toggleVisibility: '',
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
  
  const handleShortcutsChange = useCallback((newShortcuts: ShortcutState) => {
    setShortcuts(newShortcuts);
    
    if (!initialLoadRef.current) {
      Logger.log('AIFeaturesOverviewStep', 'Saving shortcuts config');
      updateSetupData('ui.shortcuts', newShortcuts);
    }
  }, [updateSetupData]);

  const handleToggle = (featureKey: FeatureKey) => {
    setFeatures(prev => ({
      ...prev,
      [featureKey]: { enabled: !prev[featureKey]?.enabled }
    }));
  };

  const featureList: FeatureItem[] = [
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
        <h2 className="text-xl sm:text-2xl font-bold mb-1 bg-gradient-to-r from-white/90 to-white/70 bg-clip-text text-transparent">
          AI+ Features
        </h2>
        <p className="text-xs sm:text-sm text-white/90">
          Enable powerful AI tools for your workflow
        </p>
      </div>

      {/* Info Banner */}
      <Card variant="elevated">
        <div className="flex items-start gap-2">
          <Icon name="info" size={18} className="text-white/80 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-white/70">
            All features are <span className="font-semibold">enabled by default</span>. You can customize these settings later in the Settings panel.
          </p>
        </div>
      </Card>

      {/* Feature Toggles */}
      <div className="space-y-2">
        {featureList.map((feature: FeatureItem) => (
          <Card
            key={feature.key}
            className="hover:border-white/20 transition-all"
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
          </Card>
        ))}
      </div>

      {/* Summary */}
      <Card variant="elevated" className="mt-4">
        <div className="flex items-start gap-2">
          <Icon name="check-circle" size={18} className="text-white/80 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-white/80">
            <p className="font-semibold mb-1">Ready to Go!</p>
            <p className="text-white/70">
              {Object.values(features).filter((f) => f?.enabled !== false).length} of {featureList.length} features enabled
            </p>
          </div>
        </div>
      </Card>

      {/* Keyboard Shortcuts Section */}
      {!isAndroid ? (
        <div className="mt-8 pt-6 border-t border-white/10">
          <div className="mb-4">
            <h3 className="text-lg font-bold mb-1 text-white">
              Keyboard Shortcuts
            </h3>
            <p className="text-xs text-white/70">
              Optional: Set up quick access shortcuts (can be configured later)
            </p>
          </div>

          <Card padding="none" className="p-2 md:p-4">
            <ShortcutsConfig
              shortcuts={shortcuts}
              onShortcutsChange={handleShortcutsChange}
              isLightBackground={isLightBackground}
            />
          </Card> 
        </div>
        ) : null 
      }

      {/* Documentation Link - Final Step */}
      <Card variant="elevated" padding="none" className="mt-8 p-2 md:p-4">
        <div className="flex items-start gap-3">
          <Icon name="book" size={20} className="text-white/80 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-white mb-2">Learn More</h4>
            <p className="text-xs text-white/70 mb-3">
              Check out our comprehensive documentation to explore all features, tips, and advanced configurations.
            </p>
            <a 
              href="https://b1ink0.github.io/vassist/docs/intro"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-2 md:px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/30 transition-all text-xs font-medium text-white"
            >
              <Icon name="arrow-top-right" size={14} />
              <span>Open Documentation</span>
            </a>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default AIFeaturesOverviewStep;
