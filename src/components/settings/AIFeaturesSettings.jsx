/**
 * AIFeaturesSettings Component
 * AI Features configuration tab for SettingsPanel
 * Handles Translator, Language Detector, and Summarizer settings
 * Works with all LLM providers (Chrome AI, OpenAI, Ollama)
 */

import { useConfig } from '../../contexts/ConfigContext';
import ChromeAIValidator from '../../services/ChromeAIValidator';
import React, { useState } from 'react';

// Reusable component to show test results below each feature
const TestResult = ({ status, message }) => {
  if (!status || status === 'idle') return null;

  const bgClass = status === 'success' ? 'bg-emerald-900/10' : status === 'loading' ? 'bg-amber-900/10' : 'bg-red-900/10';
  const textClass = status === 'success' ? 'text-emerald-100' : status === 'loading' ? 'text-amber-100' : 'text-red-100';

  return (
    <div className={`mt-2 rounded-lg p-2 text-sm ${bgClass}`}>
      <span className={textClass} style={{whiteSpace: 'pre-wrap'}}>{message}</span>
    </div>
  );
};

const AIFeaturesSettings = ({ isLightBackground }) => {
  // Local per-feature test states so results show under each section
  const [translatorTest, setTranslatorTest] = useState({ status: 'idle', message: '' });
  const [languageDetectorTest, setLanguageDetectorTest] = useState({ status: 'idle', message: '' });
  const [summarizerTest, setSummarizerTest] = useState({ status: 'idle', message: '' });

  const {
    // AI Config
    aiConfig,
    aiConfigSaved,
    aiConfigError,
    updateAIConfig,
    
    // AI Features Tests
    testTranslator,
    testLanguageDetector,
    testSummarizer,
  } = useConfig();

  // Check Chrome version - flags only needed for versions < 138
  const chromeVersion = ChromeAIValidator.getChromeVersion();
  const needsFlags = chromeVersion > 0 && chromeVersion < 138;

  // Wrapper helpers to run tests and show per-section status
  const runTranslatorTest = async (...args) => {
    try {
      setTranslatorTest({ status: 'loading', message: '⏳ Translating...' });
      const res = await testTranslator(...args);
      const msg = typeof res === 'string' ? res : JSON.stringify(res);
      setTranslatorTest({ status: 'success', message: `✅ Translation: "${msg}"` });
    } catch (err) {
      setTranslatorTest({ status: 'error', message: `❌ ${(err && err.message) ? err.message : String(err)}` });
    }
  };

  const runLanguageDetectorTest = async (...args) => {
    try {
      setLanguageDetectorTest({ status: 'loading', message: '⏳ Detecting language...' });
      const res = await testLanguageDetector(...args);
      
      if (Array.isArray(res) && res.length > 0) {
        const topResult = res[0];
        const msg = `✅ Detected: ${topResult.detectedLanguage} (${(topResult.confidence * 100).toFixed(1)}% confidence)`;
        setLanguageDetectorTest({ status: 'success', message: msg });
      } else {
        const msg = typeof res === 'string' ? res : JSON.stringify(res);
        setLanguageDetectorTest({ status: 'success', message: `✅ ${msg}` });
      }
    } catch (err) {
      setLanguageDetectorTest({ status: 'error', message: `❌ ${(err && err.message) ? err.message : String(err)}` });
    }
  };

  const runSummarizerTest = async (...args) => {
    try {
      setSummarizerTest({ status: 'loading', message: '⏳ Summarizing...' });
      const res = await testSummarizer(...args);
      const msg = typeof res === 'string' ? res : JSON.stringify(res);
      setSummarizerTest({ status: 'success', message: `✅ Summary: "${msg.substring(0, 150)}${msg.length > 150 ? '...' : ''}"`  });
    } catch (err) {
      setSummarizerTest({ status: 'error', message: `❌ ${(err && err.message) ? err.message : String(err)}` });
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-base font-semibold text-white">AI Features</h3>
        <p className="text-xs text-white/50">
          Advanced AI capabilities that work with all LLM providers (Chrome AI, OpenAI, Ollama)
        </p>
      </div>

      {/* Chrome AI Specific Requirements - Only show for Chrome < 138 */}
      {aiConfig.provider === 'chrome-ai' && needsFlags && (
        <div className="space-y-3 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <div className="flex items-center gap-2">
            <span className="text-lg">ℹ️</span>
            <h4 className="text-sm font-semibold text-blue-300">Chrome AI Additional Flags Required</h4>
          </div>
          <p className="text-xs text-blue-200">
            To use AI Features with Chrome AI, you need to enable these additional flags:
          </p>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between p-2 rounded bg-blue-500/10">
              <code className="text-blue-200">translation-api</code>
              <button
                onClick={() => navigator.clipboard.writeText('chrome://flags/#translation-api')}
                className="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 rounded bg-blue-500/20 hover:bg-blue-500/30"
              >
                Copy Flag URL
              </button>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-blue-500/10">
              <code className="text-blue-200">language-detection-api</code>
              <button
                onClick={() => navigator.clipboard.writeText('chrome://flags/#language-detection-api')}
                className="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 rounded bg-blue-500/20 hover:bg-blue-500/30"
              >
                Copy Flag URL
              </button>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-blue-500/10">
              <code className="text-blue-200">summarization-api-for-gemini-nano</code>
              <button
                onClick={() => navigator.clipboard.writeText('chrome://flags/#summarization-api-for-gemini-nano')}
                className="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 rounded bg-blue-500/20 hover:bg-blue-500/30"
              >
                Copy Flag URL
              </button>
            </div>
          </div>
          <div className="pt-2 border-t border-blue-500/20">
            <p className="text-xs text-blue-200">
              <span className="font-semibold">Instructions:</span>
            </p>
            <ol className="list-decimal list-inside text-xs text-blue-200 space-y-1 mt-1">
              <li>Click "Copy Flag URL" buttons above to copy each flag URL</li>
              <li>Paste each URL in your Chrome address bar and press Enter</li>
              <li>Set each flag to <span className="font-semibold">"Enabled"</span></li>
              <li>Click "Relaunch" button at the bottom of the flags page</li>
              <li>After restart, the AI Features will be available</li>
            </ol>
          </div>
        </div>
      )}

      {/* Translator */}
      <div className="space-y-3">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
          <input
            type="checkbox"
            id="translator-enabled"
            checked={aiConfig.aiFeatures?.translator?.enabled !== false}
            onChange={(e) => updateAIConfig('aiFeatures.translator.enabled', e.target.checked)}
            className="w-4 h-4 rounded border-white/20 bg-white/10 checked:bg-blue-500"
          />
          <label htmlFor="translator-enabled" className="text-sm font-medium text-white/90 cursor-pointer flex-1">
            Translator
          </label>
        </div>
        {aiConfig.aiFeatures?.translator?.enabled !== false && (
          <div className="ml-7 space-y-2">
            <p className="text-xs text-white/50">
              Translate text between languages (English ↔ Spanish ↔ Japanese for Chrome AI)
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => runTranslatorTest('Hello, how are you?', 'en', 'es')}
                className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-3 py-1.5 text-xs font-medium rounded-lg w-full`}
              >
                {translatorTest.status === 'loading' ? 'Testing...' : 'Test'}
              </button>
              <button
                onClick={() => setTranslatorTest({ status: 'idle', message: '' })}
                className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-3 py-1.5 text-xs font-medium rounded-lg w-full`}
              >
                Clear
              </button>
            </div>

            <TestResult status={translatorTest.status} message={translatorTest.message} />
          </div>
        )}
      </div>

      {/* Language Detector */}
      <div className="space-y-3">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
          <input
            type="checkbox"
            id="language-detector-enabled"
            checked={aiConfig.aiFeatures?.languageDetector?.enabled !== false}
            onChange={(e) => updateAIConfig('aiFeatures.languageDetector.enabled', e.target.checked)}
            className="w-4 h-4 rounded border-white/20 bg-white/10 checked:bg-blue-500"
          />
          <label htmlFor="language-detector-enabled" className="text-sm font-medium text-white/90 cursor-pointer flex-1">
            Language Detector
          </label>
        </div>
        {aiConfig.aiFeatures?.languageDetector?.enabled !== false && (
          <div className="ml-7 space-y-2">
            <p className="text-xs text-white/50">
              Automatically detect the language of text with confidence scores
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => runLanguageDetectorTest('Bonjour, comment allez-vous?')}
                className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-3 py-1.5 text-xs font-medium rounded-lg w-full`}
              >
                {languageDetectorTest.status === 'loading' ? 'Detecting...' : 'Test'}
              </button>
              <button
                onClick={() => setLanguageDetectorTest({ status: 'idle', message: '' })}
                className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-3 py-1.5 text-xs font-medium rounded-lg w-full`}
              >
                Clear
              </button>
            </div>

            <TestResult status={languageDetectorTest.status} message={languageDetectorTest.message} />
          </div>
        )}
      </div>

      {/* Summarizer */}
      <div className="space-y-3">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
          <input
            type="checkbox"
            id="summarizer-enabled"
            checked={aiConfig.aiFeatures?.summarizer?.enabled !== false}
            onChange={(e) => updateAIConfig('aiFeatures.summarizer.enabled', e.target.checked)}
            className="w-4 h-4 rounded border-white/20 bg-white/10 checked:bg-blue-500"
          />
          <label htmlFor="summarizer-enabled" className="text-sm font-medium text-white/90 cursor-pointer flex-1">
            Summarizer
          </label>
        </div>
        {aiConfig.aiFeatures?.summarizer?.enabled !== false && (
          <div className="ml-7 space-y-3">
            <p className="text-xs text-white/50">
              Generate different types of summaries from long text
            </p>
            
            {/* Summary Type */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-white/80">Type</label>
              <select
                value={aiConfig.aiFeatures?.summarizer?.defaultType || 'tldr'}
                onChange={(e) => updateAIConfig('aiFeatures.summarizer.defaultType', e.target.value)}
                className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full text-xs`}
              >
                <option value="tldr" className="bg-gray-900">TL;DR (Overview)</option>
                <option value="key-points" className="bg-gray-900">Key Points (Bullets)</option>
                <option value="teaser" className="bg-gray-900">Teaser (Hook)</option>
                <option value="headline" className="bg-gray-900">Headline</option>
              </select>
            </div>

            {/* Summary Format */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-white/80">Format</label>
              <select
                value={aiConfig.aiFeatures?.summarizer?.defaultFormat || 'plain-text'}
                onChange={(e) => updateAIConfig('aiFeatures.summarizer.defaultFormat', e.target.value)}
                className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full text-xs`}
              >
                <option value="plain-text" className="bg-gray-900">Plain Text</option>
                <option value="markdown" className="bg-gray-900">Markdown</option>
              </select>
            </div>

            {/* Summary Length */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-white/80">Length</label>
              <select
                value={aiConfig.aiFeatures?.summarizer?.defaultLength || 'medium'}
                onChange={(e) => updateAIConfig('aiFeatures.summarizer.defaultLength', e.target.value)}
                className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full text-xs`}
              >
                <option value="short" className="bg-gray-900">Short</option>
                <option value="medium" className="bg-gray-900">Medium</option>
                <option value="long" className="bg-gray-900">Long</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => runSummarizerTest(
                  'Artificial intelligence (AI) is intelligence demonstrated by machines, in contrast to the natural intelligence displayed by humans. Leading AI textbooks define the field as the study of intelligent agents: any device that perceives its environment and takes actions that maximize its chance of successfully achieving its goals.',
                  {
                    type: aiConfig.aiFeatures?.summarizer?.defaultType || 'tldr',
                    format: aiConfig.aiFeatures?.summarizer?.defaultFormat || 'plain-text',
                    length: aiConfig.aiFeatures?.summarizer?.defaultLength || 'medium',
                  }
                )}
                className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-3 py-1.5 text-xs font-medium rounded-lg w-full`}
              >
                {summarizerTest.status === 'loading' ? 'Testing...' : 'Test'}
              </button>
              <button
                onClick={() => setSummarizerTest({ status: 'idle', message: '' })}
                className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-3 py-1.5 text-xs font-medium rounded-lg w-full`}
              >
                Clear
              </button>
            </div>

            <TestResult status={summarizerTest.status} message={summarizerTest.message} />
          </div>
        )}
      </div>
      
      {/* Status Messages */}
      <div className="space-y-2 min-h-[40px]">
        {aiConfigSaved && (
          <div className="glass-success rounded-2xl p-3 animate-in fade-in">
            <span className="text-sm text-emerald-100">✅ Auto-saved successfully!</span>
          </div>
        )}
        {aiConfigError && (
          <div className={`${
            aiConfigError.includes('✅') ? 'glass-success' :
            aiConfigError.includes('⏳') ? 'glass-warning' :
            'glass-error'
          } rounded-2xl p-3 animate-in fade-in`}>
            <span className={`text-sm ${
              aiConfigError.includes('✅') ? 'text-emerald-100' :
              aiConfigError.includes('⏳') ? 'text-amber-100' :
              'text-red-100'
            }`}>{aiConfigError}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default AIFeaturesSettings;
