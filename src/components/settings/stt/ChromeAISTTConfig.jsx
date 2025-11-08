/**
 * Chrome AI Multimodal STT Configuration Component
 * Shared between Settings and Setup Wizard
 */

import { useEffect, useRef } from 'react';
import { Icon } from '../../icons';
import { ChromeAILanguages } from '../../../config/aiConfig';
import StatusMessage from '../../common/StatusMessage';
import Logger from '../../../services/LoggerService';

const ChromeAISTTConfig = ({ 
  config, 
  onChange, 
  chromeAiStatus, 
  onCheckStatus, 
  onStartDownload,
  isLightBackground,
  isSetupMode = false
}) => {
  const hasCheckedRef = useRef(false);

  useEffect(() => {
    if (onCheckStatus && !hasCheckedRef.current) {
      Logger.log('ChromeAISTTConfig', 'Auto-checking status on mount');
      hasCheckedRef.current = true;
      onCheckStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const languageOptions = [
    { code: ChromeAILanguages.ENGLISH, name: 'English' },
    { code: ChromeAILanguages.SPANISH, name: 'Spanish' },
    { code: ChromeAILanguages.JAPANESE, name: 'Japanese' },
  ];

  return (
    <div className="space-y-4">
      {/* Info Banner */}
      <div className="mt-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
        <div className="flex items-start gap-2">
          <Icon name="ai" size={18} className="text-blue-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-300">
            <span className="font-semibold">Chrome Built-in AI Multimodal</span> - On-device audio transcription using Gemini Nano. No API key needed, works offline!
          </p>
        </div>
      </div>

      {/* Availability Status */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-white/90">Status</label>
        <div className="p-3 rounded-lg bg-white/5 border border-white/10">
          {!chromeAiStatus || chromeAiStatus.checking ? (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
              <span className="text-xs text-white/70">
                {!chromeAiStatus ? 'Checking availability...' : 'Rechecking...'}
              </span>
            </div>
          ) : chromeAiStatus.state ? (
            <>
              <StatusMessage 
                message={chromeAiStatus.message}
                isLightBackground={isLightBackground}
                className="mb-2"
              />
              <p className="text-xs text-white/60">{chromeAiStatus.details}</p>
              
              {/* Download Progress */}
              {chromeAiStatus.downloading && (
                <div className="mt-3 space-y-2">
                  <div className="p-2 rounded bg-yellow-500/10 border border-yellow-500/20">
                    <p className="text-xs text-yellow-300">
                      Download in progress. For real-time progress, visit{' '}
                      <a 
                        href="chrome://on-device-internals/" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="underline hover:text-yellow-200"
                      >
                        chrome://on-device-internals/
                      </a>
                    </p>
                  </div>
                </div>
              )}
              
              {/* Download Button */}
              {(chromeAiStatus.state === 'downloadable' || chromeAiStatus.state === 'after-download') && !chromeAiStatus.downloading && onStartDownload && (
                <button
                  onClick={onStartDownload}
                  className={`mt-3 glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-4 py-2 text-xs font-medium rounded-lg w-full`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <Icon name="download" size={14} />
                    <span>Start Model Download</span>
                  </div>
                </button>
              )}
              
              {/* Refresh Status Button - always show when status exists */}
              {onCheckStatus && (
                <button
                  onClick={onCheckStatus}
                  disabled={chromeAiStatus.checking}
                  className="mt-2 text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 disabled:opacity-50"
                >
                  <Icon name="refresh" size={12} className={chromeAiStatus.checking ? 'animate-spin' : ''} />
                  <span>{chromeAiStatus.checking ? 'Checking...' : 'Refresh Status'}</span>
                </button>
              )}
            </>
          ) : null}
        </div>
      </div>

      {/* Output Language */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-white/90">Output Language</label>
        <select
          value={config.outputLanguage || config.language || ChromeAILanguages.ENGLISH}
          onChange={(e) => onChange({ ...config, outputLanguage: e.target.value, language: e.target.value })}
          className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
        >
          {languageOptions.map((lang) => (
            <option key={lang.code} value={lang.code} className="bg-gray-900">
              {lang.name} ({lang.code})
            </option>
          ))}
        </select>
        <p className="text-xs text-white/50">
          Language for transcription output. Chrome AI currently supports: English, Spanish, and Japanese.
        </p>
      </div>

      {/* Required Flags */}
      <details className="group" open={isSetupMode}>
        <summary className="cursor-pointer text-sm font-medium text-white/90 flex items-center justify-between p-2 rounded hover:bg-white/5">
          <span>Required Chrome Flags</span>
          <Icon name="arrow-down" size={14} className="group-open:rotate-180 transition-transform" />
        </summary>
        <div className="mt-2 p-3 rounded-lg bg-white/5 border border-white/10 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <code className="text-white/70">optimization-guide-on-device-model</code>
            <button
              onClick={() => navigator.clipboard.writeText('chrome://flags/#optimization-guide-on-device-model')}
              className="text-blue-400 hover:text-blue-300 text-xs"
            >
              Copy
            </button>
          </div>
          <div className="flex items-center justify-between">
            <code className="text-white/70">prompt-api-for-gemini-nano-multimodal-input</code>
            <button
              onClick={() => navigator.clipboard.writeText('chrome://flags/#prompt-api-for-gemini-nano-multimodal-input')}
              className="text-blue-400 hover:text-blue-300 text-xs"
            >
              Copy
            </button>
          </div>
          <p className="text-white/50 mt-2">
            Enable these flags and restart Chrome, then visit <code className="text-blue-300">chrome://components</code> to download Gemini Nano
          </p>
        </div>
      </details>
    </div>
  );
};

export default ChromeAISTTConfig;
