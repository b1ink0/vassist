/**
 * AIFeaturesSettings Component
 * AI Features configuration tab for SettingsPanel
 * Handles Translator, Language Detector, and Summarizer settings
 * Works with all LLM providers (Chrome AI, OpenAI, Ollama)
 */

import { useConfig } from '../../contexts/ConfigContext';
import { TranslationLanguages } from '../../config/aiConfig';
import ChromeAIValidator from '../../services/ChromeAIValidator';
import React, { useState } from 'react';
import StreamingContainer from '../common/StreamingContainer';
import StreamingText from '../common/StreamingText';

// Reusable component to show test results below each feature
const TestResult = ({ status, message }) => {
  if (!status || status === 'idle') return null;

  const bgClass = status === 'success' ? 'bg-emerald-900/10' : status === 'loading' ? 'bg-amber-900/10' : 'bg-red-900/10';
  const textClass = status === 'success' ? 'text-emerald-100' : status === 'loading' ? 'text-amber-100' : 'text-red-100';

  return (
    <StreamingContainer speed="fast" active={!!message}>
      <div className={`mt-2 rounded-lg p-2 text-sm ${bgClass}`}>
        <span className={textClass} style={{whiteSpace: 'pre-wrap'}}>
          {status === 'loading' ? (
            <StreamingText text={message} speed={5} showCursor={true} />
          ) : (
            message
          )}
        </span>
      </div>
    </StreamingContainer>
  );
};

const AIFeaturesSettings = ({ isLightBackground }) => {
  // Local per-feature test states so results show under each section
  const [translatorTest, setTranslatorTest] = useState({ status: 'idle', message: '' });
  const [languageDetectorTest, setLanguageDetectorTest] = useState({ status: 'idle', message: '' });
  const [languageDetectorInput, setLanguageDetectorInput] = useState('Bonjour, comment allez-vous?');
  const [summarizerTest, setSummarizerTest] = useState({ status: 'idle', message: '' });

  const {
    // AI Config
    aiConfig,
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
      setTranslatorTest({ status: 'loading', message: 'Translating...' });
      const res = await testTranslator(...args);
      const msg = typeof res === 'string' ? res : JSON.stringify(res);
      setTranslatorTest({ status: 'success', message: `Translation: "${msg}"` });
    } catch (err) {
      setTranslatorTest({ status: 'error', message: `${(err && err.message) ? err.message : String(err)}` });
    }
  };

  const runLanguageDetectorTest = async (...args) => {
    try {
      setLanguageDetectorTest({ status: 'loading', message: 'Detecting language...' });
      const res = await testLanguageDetector(...args);
      
      if (Array.isArray(res) && res.length > 0) {
        const topResult = res[0];
        const msg = `Detected: ${topResult.detectedLanguage} (${(topResult.confidence * 100).toFixed(1)}% confidence)`;
        setLanguageDetectorTest({ status: 'success', message: msg });
      } else {
        const msg = typeof res === 'string' ? res : JSON.stringify(res);
        setLanguageDetectorTest({ status: 'success', message: msg });
      }
    } catch (err) {
      setLanguageDetectorTest({ status: 'error', message: `${(err && err.message) ? err.message : String(err)}` });
    }
  };

  const runSummarizerTest = async (...args) => {
    try {
      setSummarizerTest({ status: 'loading', message: 'Summarizing...' });
      const res = await testSummarizer(...args);
      const msg = typeof res === 'string' ? res : JSON.stringify(res);
      setSummarizerTest({ status: 'success', message: `Summary: "${msg.substring(0, 150)}${msg.length > 150 ? '...' : ''}"`  });
    } catch (err) {
      setSummarizerTest({ status: 'error', message: `${(err && err.message) ? err.message : String(err)}` });
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
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
          <div className="ml-7 space-y-3">
            <p className="text-xs text-white/50">
              Translate text between languages (English ↔ Spanish ↔ Japanese for Chrome AI)
            </p>
            
            {/* Default Translation Language */}
            <div className="space-y-1.5">
              <label htmlFor="translator-default-lang" className="block text-xs font-medium text-white/70">
                Default Translation Language
              </label>
              <select
                id="translator-default-lang"
                value={aiConfig.aiFeatures?.translator?.defaultTargetLanguage || 'en'}
                onChange={(e) => updateAIConfig('aiFeatures.translator.defaultTargetLanguage', e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs"
              >
                {TranslationLanguages.map(lang => (
                  <option key={lang.code} value={lang.code} className="bg-gray-900 text-white">{lang.name}</option>
                ))}
              </select>
              <p className="text-xs text-white/40">
                Text will be translated to this language when using the AI Toolbar
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => runTranslatorTest('Hello, how are you?', 'en', aiConfig.aiFeatures?.translator?.defaultTargetLanguage || 'en')}
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
            
            {/* Input field for language detector test */}
            <div className="space-y-1.5">
              <label htmlFor="language-detector-input" className="block text-xs font-medium text-white/70">
                Test Text
              </label>
              <input
                id="language-detector-input"
                type="text"
                value={languageDetectorInput}
                onChange={(e) => setLanguageDetectorInput(e.target.value)}
                placeholder="Enter text to detect language..."
                className="w-full px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => runLanguageDetectorTest(languageDetectorInput)}
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
              Generate different types of summaries from long text. Use the toolbar buttons to choose summary type.
            </p>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => runSummarizerTest(
                  'Artificial intelligence (AI) is intelligence demonstrated by machines, in contrast to the natural intelligence displayed by humans. Leading AI textbooks define the field as the study of intelligent agents: any device that perceives its environment and takes actions that maximize its chance of successfully achieving its goals.',
                  {
                    type: 'tldr',
                    format: 'plain-text',
                    length: 'medium',
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
    </div>
  );
};

export default AIFeaturesSettings;
