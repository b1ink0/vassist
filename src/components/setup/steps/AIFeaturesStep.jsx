import { useState } from 'react';
import { useSetup } from '../../../contexts/SetupContext';
import { useConfig } from '../../../contexts/ConfigContext';
import { Icon } from '../../icons';
import AIFeaturesConfig from '../../common/AIFeaturesConfig';
import ChromeAIValidator from '../../../services/ChromeAIValidator';

const AIFeaturesStep = () => {
  const { setupData, updateSetupData, markStepComplete, nextStep } = useSetup();
  const {
    testTranslator,
    testLanguageDetector,
    testSummarizer,
    testRewriter,
  } = useConfig();
  
  // Check if user is using Chrome AI
  const isChromeAI = setupData?.llmProvider === 'chrome-ai';
  const chromeAIAvailable = setupData?.chromeAI?.ready || false;
  
  // Check Chrome version - flags only needed for versions < 138
  const chromeVersion = ChromeAIValidator.getChromeVersion();
  const needsFlags = chromeVersion > 0 && chromeVersion < 138;
  
  // Feature states
  const [features, setFeatures] = useState({
    translator: { enabled: setupData?.aiFeatures?.translator?.enabled ?? true },
    languageDetector: { enabled: setupData?.aiFeatures?.languageDetector?.enabled ?? true },
    summarizer: { enabled: setupData?.aiFeatures?.summarizer?.enabled ?? true },
    rewriter: { enabled: setupData?.aiFeatures?.rewriter?.enabled ?? true }
  });

  // Target language state
  const [targetLanguage, setTargetLanguage] = useState(
    setupData?.aiFeatures?.translator?.defaultTargetLanguage || 'en'
  );

  const handleFeatureChange = (featureName, enabled) => {
    setFeatures(prev => ({
      ...prev,
      [featureName]: { enabled }
    }));
  };

  const handleTargetLanguageChange = (languageCode) => {
    setTargetLanguage(languageCode);
  };

  const handleContinue = () => {
    // Save features with target language
    const updatedFeatures = {
      ...features,
      translator: {
        ...features.translator,
        defaultTargetLanguage: targetLanguage
      }
    };
    updateSetupData({ aiFeatures: updatedFeatures });
    markStepComplete();
    nextStep();
  };

  const enabledCount = Object.values(features).filter(f => f.enabled).length;
  const totalCount = Object.keys(features).length;

  return (
    <div className="setup-step ai-features-step">
      <div className="step-header mb-8">
        <h2 className="text-3xl font-bold mb-2 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
          AI+ Features
        </h2>
        <p className="text-white/90">
          Enable intelligent text processing features powered by AI.
        </p>
      </div>

      {/* Chrome AI Info Banner */}
      {isChromeAI && chromeAIAvailable && (
        <div className="glass-container rounded-xl p-4 mb-6 border-2 border-green-500/30">
          <div className="flex items-start gap-3">
            <Icon name="check" size={20} className="text-green-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-green-400 mb-1">Chrome Built-in AI Active! 🎉</h3>
              <p className="text-xs text-white/80">
                All AI+ features will use Chrome's built-in APIs - they're completely free, work offline, 
                and protect your privacy by running locally on your device.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Non-Chrome AI Info Banner */}
      {!isChromeAI && (
        <div className="glass-container rounded-xl p-4 mb-6 border-2 border-blue-500/30">
          <div className="flex items-start gap-3">
            <Icon name="info" size={20} className="text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-blue-400 mb-1">Using Your LLM Provider</h3>
              <p className="text-xs text-white/80">
                AI+ features will use your selected LLM provider ({setupData?.llmProvider || 'N/A'}). 
                This may incur API costs depending on your provider.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Shared AI Features Config Component with Testing */}
      <div className="glass-container rounded-xl p-6 mb-6">
        <AIFeaturesConfig
          features={features}
          onFeatureChange={handleFeatureChange}
          onTargetLanguageChange={handleTargetLanguageChange}
          defaultTargetLanguage={targetLanguage}
          testTranslator={testTranslator}
          testLanguageDetector={testLanguageDetector}
          testSummarizer={testSummarizer}
          testRewriter={testRewriter}
          isChromeAI={isChromeAI && chromeAIAvailable}
          needsFlags={needsFlags}
          showTesting={true}
          isLightBackground={false}
        />
      </div>

      {/* How It Works Section */}
      <div className="glass-container rounded-xl p-6 mb-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Icon name="info" size={18} />
          <span>How AI+ Features Work</span>
        </h3>

        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-purple-400">1</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-white/90">Selection-Based</p>
              <p className="text-xs text-white/70">
                Select any text on a webpage to access AI features through the toolbar
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-purple-400">2</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-white/90">Quick Access</p>
              <p className="text-xs text-white/70">
                Features appear in the AI Toolbar when you select text (can be enabled/disabled)
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-purple-400">3</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-white/90">Instant Results</p>
              <p className="text-xs text-white/70">
                Get translations, summaries, and more in seconds - results appear in a popup panel
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Privacy Note for Chrome AI */}
      {isChromeAI && chromeAIAvailable && (
        <div className="glass-container rounded-xl p-4 mb-6 border-2 border-green-500/30">
          <div className="flex items-start gap-3">
            <Icon name="shield" size={18} className="text-green-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-green-400 mb-1">Privacy First</h3>
              <p className="text-xs text-white/80">
                With Chrome AI, all processing happens locally on your device. No data is sent to external servers, 
                ensuring your privacy and allowing offline functionality.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="glass-container rounded-xl p-4 mb-6 border-2 border-purple-500/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Icon name="check" size={18} className="text-purple-400" />
            <span className="text-sm font-semibold text-white">
              {enabledCount} of {totalCount} features enabled
            </span>
          </div>
          <button
            onClick={() => {
              const allEnabled = Object.values(features).every(f => f.enabled);
              const newState = !allEnabled;
              setFeatures({
                translator: { enabled: newState },
                languageDetector: { enabled: newState },
                summarizer: { enabled: newState },
                rewriter: { enabled: newState }
              });
            }}
            className="text-xs text-purple-400 hover:text-purple-300 font-medium"
          >
            {Object.values(features).every(f => f.enabled) ? 'Disable All' : 'Enable All'}
          </button>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-end pt-4">
        <button
          onClick={handleContinue}
          className="glass-button px-8 py-3 text-base font-medium rounded-lg"
        >
          Continue
        </button>
      </div>
    </div>
  );
};

export default AIFeaturesStep;
