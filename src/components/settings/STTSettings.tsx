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
import { Button, Select, Card, SettingsRow } from '../ui';

interface STTSettingsProps {
  isLightBackground?: boolean;
  hasChromeAI?: boolean;
}

type STTProviderKey =
  | 'android-local'
  | 'desktop-local'
  | 'chrome-ai-multimodal'
  | 'openai'
  | 'openai-compatible';

interface ProviderRecord {
  [key: string]: string;
}

const STTSettings = ({ isLightBackground = false, hasChromeAI = false }: STTSettingsProps) => {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
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
        const audioInputs = deviceList.filter((device) => device.kind === 'audioinput');
        setDevices(audioInputs);
        
        if (!selectedDeviceId && audioInputs.length > 0) {
          setSelectedDeviceId(audioInputs[0]?.deviceId ?? '');
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
      return STTProviders as ProviderRecord;
    }
    if (isDesktop) {
      const { ANDROID_LOCAL, CHROME_AI_MULTIMODAL, ...desktopProviders } = STTProviders;
      return desktopProviders as ProviderRecord;
    }
    const { ANDROID_LOCAL, ...otherProviders } = STTProviders;
    return otherProviders as ProviderRecord;
  }, []);

  return (
    <div className="space-y-6">
      <h3 className="text-base font-semibold text-white mb-4">STT Configuration</h3>
      
      {/* Enable STT Toggle */}
      <Card variant="default">
        <SettingsRow label="Enable Speech-to-Text">
          <Toggle
            id="enable-stt"
            checked={sttConfig.enabled}
            onChange={(checked) => updateSTTConfig('enabled', checked)}
          />
        </SettingsRow>
      </Card>

      {/* Provider Selection */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-white/90">Provider</label>
        <Select
          value={sttConfig.provider}
          onChange={(e) => updateSTTConfig('provider', e.target.value)}
          variant={isLightBackground ? 'dark' : 'default'}
          disabled={!sttConfig.enabled}
          options={Object.entries(availableProviders).map(([key, value]) => ({ value, label: key }))}
        />
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
                <Select
                  value={sttConfig['android-local']?.language || 'en'}
                  onChange={(e) => updateSTTConfig('android-local.language', e.target.value)}
                  variant={isLightBackground ? 'dark' : 'default'}
                  options={[
                    { value: 'en', label: 'English' },
                    { value: 'es', label: 'Spanish' },
                    { value: 'ja', label: 'Japanese' },
                    { value: 'zh', label: 'Chinese' },
                    { value: 'de', label: 'German' },
                    { value: 'fr', label: 'French' },
                  ]}
                />
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
                onChange={(updates: Record<string, unknown>) => {
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
              onChange={(field: string, value: string) => updateSTTConfig(`openai.${field}`, value)}
              isLightBackground={isLightBackground}
            />
          )}

          {/* OpenAI-Compatible STT Configuration */}
          {sttConfig.provider === STTProviders.OPENAI_COMPATIBLE && (
            <OpenAICompatibleSTTConfig
              config={sttConfig['openai-compatible'] || {}}
              onChange={(field: string, value: string) => updateSTTConfig(`openai-compatible.${field}`, value)}
              isLightBackground={isLightBackground}
            />
          )}

          {/* Chrome AI Multimodal STT Configuration */}
          {sttConfig.provider === STTProviders.CHROME_AI_MULTIMODAL && (
            <ChromeAISTTConfig
              config={sttConfig['chrome-ai-multimodal'] || {}}
              onChange={(updates) => {
                Object.entries(updates).forEach(([field, value]) => {
                  updateSTTConfig(`chrome-ai-multimodal.${field}`, value);
                });
              }}
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
            <Select
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              variant={isLightBackground ? 'dark' : 'default'}
              options={devices.map((d) => ({ value: d.deviceId, label: d.label || `Microphone ${d.deviceId.substring(0, 8)}` }))}
            />
          </div>
        )}
        
        <Button
          variant={isLightBackground ? 'dark' : 'default'}
          onClick={() => testSTTRecording(selectedDeviceId)}
          disabled={!sttConfig.enabled || sttTesting}
        >
          Test Recording (3s)
        </Button>
      </div>
    </div>
  );
};

export default STTSettings;
