/**
 * AIFeaturesSettings Component
 * AI Features configuration tab for SettingsPanel
 * Handles Translator, Language Detector, Summarizer, Rewriter, and Writer settings
 * Works with all LLM providers (Chrome AI, OpenAI, Ollama)
 */

import { useConfig } from '../../contexts/ConfigContext';
import ChromeAIValidator from '../../services/ChromeAIValidator';
import React from 'react';
import AIFeaturesConfig from '../common/AIFeaturesConfig';

const AIFeaturesSettings = ({ isLightBackground }) => {
  const {
    aiConfig,
    updateAIConfig,
    
    testTranslator,
    testLanguageDetector,
    testSummarizer,
    testRewriter,
    testWriter,
  } = useConfig();

  const chromeVersion = ChromeAIValidator.getChromeVersion();
  const needsFlags = chromeVersion > 0 && chromeVersion < 138;

  const handleFeatureChange = (featureName, enabled) => {
    updateAIConfig(`aiFeatures.${featureName}.enabled`, enabled);
  };

  const handleTargetLanguageChange = (languageCode) => {
    updateAIConfig('aiFeatures.translator.defaultTargetLanguage', languageCode);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-white">AI Features</h3>
        <p className="text-xs text-white/50">
          Advanced AI capabilities that work with all LLM providers (Chrome AI, OpenAI, Ollama)
        </p>
      </div>

      {/* Shared AI Features Config Component */}
      <AIFeaturesConfig
        features={aiConfig.aiFeatures || {}}
        onFeatureChange={handleFeatureChange}
        onTargetLanguageChange={handleTargetLanguageChange}
        defaultTargetLanguage={aiConfig.aiFeatures?.translator?.defaultTargetLanguage || 'en'}
        testTranslator={testTranslator}
        testLanguageDetector={testLanguageDetector}
        testSummarizer={testSummarizer}
        testRewriter={testRewriter}
        testWriter={testWriter}
        isChromeAI={aiConfig.provider === 'chrome-ai'}
        needsFlags={needsFlags}
        showTesting={true}
        isLightBackground={isLightBackground}
      />
    </div>
  );
};

export default AIFeaturesSettings;
