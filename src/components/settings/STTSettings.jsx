/**
 * STTSettings Component
 * STT configuration tab for SettingsPanel
 * Handles Speech-to-Text provider selection and configuration
 */

import { useMemo, useState, useEffect } from 'react';
import { useConfig } from '../../contexts/ConfigContext';
import { useAndroid } from '../../contexts/AndroidContext';
import { STTProviders } from '../../config/aiConfig';
import { isAndroid, isDesktop } from '../../utils/PlatformUtils';
import OpenAISTTConfig from './stt/OpenAISTTConfig';
import OpenAICompatibleSTTConfig from './stt/OpenAICompatibleSTTConfig';
import ChromeAISTTConfig from './stt/ChromeAISTTConfig';
import DesktopSTTConfig from './stt/DesktopSTTConfig';
import WhisperModelDownloader from './stt/WhisperModelDownloader';
import Toggle from '../common/Toggle';

const STTSettings = ({ isLightBackground, hasChromeAI }) => {
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  
  const { api: androidAPI } = useAndroid();
  
  const {
    sttConfig,
    sttTesting,
    updateSTTConfig,
    testSTTRecording,
    
    chromeAiStatus,
    checkChromeAIAvailability,
    startChromeAIDownload,
  } = useConfig();
  // Load available microphones (desktop mode only)
  useEffect(() => {
    if (!isDesktop || sttConfig.provider !== STTProviders.DESKTOP_LOCAL) return;
    
    const loadDevices = async () => {
      try {
        const deviceList = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = deviceList.filter(device => device.kind === 'audioinput');
        setDevices(audioInputs);
        
        if (!selectedDeviceId && audioInputs.length > 0) {
          setSelectedDeviceId(audioInputs[0].deviceId);
        }
      } catch (error) {
        console.error('Failed to enumerate devices:', error);
      }
    };
    
    loadDevices();
  }, [sttConfig.provider, isDesktop]);
  // Filter providers based on platform
  const availableProviders = useMemo(() => {
    if (isAndroid) {
      return STTProviders;
    }
    const { ANDROID_LOCAL, ...otherProviders } = STTProviders;
    return otherProviders;
  }, []);

  return (
    <div className="space-y-6">
      <h3 className="text-base font-semibold text-white mb-4">STT Configuration</h3>
      
      {/* Enable STT Toggle */}
      <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
        <label htmlFor="enable-stt" className="text-sm font-medium text-white/90 cursor-pointer flex-1">
          Enable Speech-to-Text
        </label>
        <Toggle
          id="enable-stt"
          checked={sttConfig.enabled}
          onChange={(checked) => updateSTTConfig('enabled', checked)}
        />
      </div>

      {/* Provider Selection */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-white/90">Provider</label>
        <select
          value={sttConfig.provider}
          onChange={(e) => updateSTTConfig('provider', e.target.value)}
          className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
          disabled={!sttConfig.enabled}
        >
          {Object.entries(availableProviders).map(([key, value]) => (
            <option key={value} value={value} className="bg-gray-900">{key}</option>
          ))}
        </select>
        {isAndroid && (
          <p className="text-xs text-white/50">
            Using native Android STT via local Whisper model
          </p>
        )}
      </div>

      {sttConfig.provider === 'chrome-ai-multimodal' && !hasChromeAI && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-xs text-red-300">
            Chrome AI requires Chrome 138 or later. Please update your browser.
          </p>
        </div>
      )}

      {/* Configuration sections - only show when enabled */}
      {sttConfig.enabled && (
        <>
          {/* Android Local STT Configuration */}
          {sttConfig.provider === STTProviders.ANDROID_LOCAL && (
            <>
              {/* Whisper Model Downloader */}
              <WhisperModelDownloader 
                androidAPI={androidAPI}
                isLightBackground={isLightBackground}
              />
              
              <h4 className="text-sm font-semibold text-white/90">Android Local STT</h4>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white/90">Language</label>
                <select
                  value={sttConfig['android-local']?.language || 'en'}
                  onChange={(e) => updateSTTConfig('android-local.language', e.target.value)}
                  className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
                >
                  <option value="en" className="bg-gray-900">English</option>
                  <option value="es" className="bg-gray-900">Spanish</option>
                  <option value="ja" className="bg-gray-900">Japanese</option>
                  <option value="zh" className="bg-gray-900">Chinese</option>
                  <option value="de" className="bg-gray-900">German</option>
                  <option value="fr" className="bg-gray-900">French</option>
                </select>
              </div>
              <p className="text-xs text-white/50">
                Powered by Whisper running locally on your device
              </p>
            </>
          )}

          {/* Desktop Local STT Configuration */}
          {sttConfig.provider === STTProviders.DESKTOP_LOCAL && isDesktop && (
            <>
              <h4 className="text-sm font-semibold text-white/90">Desktop Local STT (Whisper)</h4>
              <DesktopSTTConfig
                config={sttConfig['desktop-local'] || {}}
                onChange={(updates) => {
                  Object.entries(updates).forEach(([key, value]) => {
                    updateSTTConfig(`desktop-local.${key}`, value);
                  });
                }}
                isSetupMode={false}
                isLightBackground={isLightBackground}
              />
            </>
          )}

          {/* OpenAI Whisper Configuration */}
          {sttConfig.provider === STTProviders.OPENAI && (
            <OpenAISTTConfig
              config={sttConfig.openai || {}}
              onChange={(field, value) => updateSTTConfig(`openai.${field}`, value)}
              isLightBackground={isLightBackground}
            />
          )}

          {/* OpenAI-Compatible STT Configuration */}
          {sttConfig.provider === STTProviders.OPENAI_COMPATIBLE && (
            <OpenAICompatibleSTTConfig
              config={sttConfig['openai-compatible'] || {}}
              onChange={(field, value) => updateSTTConfig(`openai-compatible.${field}`, value)}
              isLightBackground={isLightBackground}
            />
          )}

          {/* Chrome AI Multimodal STT Configuration */}
          {sttConfig.provider === STTProviders.CHROME_AI_MULTIMODAL && (
            <ChromeAISTTConfig
              config={sttConfig['chrome-ai-multimodal'] || {}}
              onChange={(field, value) => updateSTTConfig(`chrome-ai-multimodal.${field}`, value)}
              chromeAiStatus={chromeAiStatus}
              onCheckStatus={checkChromeAIAvailability}
              onStartDownload={startChromeAIDownload}
              isLightBackground={isLightBackground}
              isSetupMode={false}
            />
          )}
        </>
      )}

      {/* Actions */}
      <div className="space-y-3 pt-4">
        {/* Microphone Selector (Desktop mode only) */}
        {isDesktop && sttConfig.provider === STTProviders.DESKTOP_LOCAL && devices.length > 0 && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/90">Microphone</label>
            <select
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full text-sm`}
            >
              {devices.map(device => (
                <option key={device.deviceId} value={device.deviceId} className="bg-gray-900">
                  {device.label || `Microphone ${device.deviceId.substring(0, 8)}`}
                </option>
              ))}
            </select>
          </div>
        )}
        
        <button 
          onClick={() => testSTTRecording(selectedDeviceId)}
          disabled={!sttConfig.enabled || sttTesting}
          className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-2 md:px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          Test Recording (3s)
        </button>
      </div>
    </div>
  );
};

export default STTSettings;
