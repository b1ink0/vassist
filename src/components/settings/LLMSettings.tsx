/**
 * LLMSettings Component
 * LLM configuration tab for SettingsPanel
 * Handles provider selection and configuration for OpenAI, Ollama, and Chrome AI
 */

import { useEffect, useMemo, useState } from 'react';
import * as React from 'react';
import { useConfig } from '../../contexts/ConfigContext';
import { AIProviders } from '../../config/aiConfig';
import { PromptConfig } from '../../config/promptConfig';
import { isAndroid, isDesktop } from '../../utils/PlatformUtils';
import { useAndroid } from '../../contexts/AndroidContext';
import { useDesktop } from '../../contexts/DesktopContext';
import DesktopLLMConfig from './llm/DesktopLLMConfig';
import LocalLLMModelManager from './llm/LocalLLMModelManager';
import { getLLMModelStorage } from '../../services/LLMModelStorageService';
import Toggle from '../common/Toggle';
import StatusMessage from '../common/StatusMessage';
import { Icon } from '../icons';
import { cn } from '../../utils/cn';
import { Button, Input, Select, Card, SettingsRow } from '../ui';

const ModelConfigRemote = ({ providerKey, routing, onChange, isLightBackground }) => {
  const examples = providerKey === 'openai' ? {
    vision: 'gpt-4-vision-preview',
    router: 'gpt-3.5-turbo'
  } : {
    vision: 'llava:7b',
    router: 'llama3.2:1b'
  };

  return (
    <div className="space-y-3">
      {/* Main Routing Toggle */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
        <div>
          <label className="text-sm font-medium text-white/90">Enable Model Routing</label>
          <p className="text-xs text-white/50 mt-0.5">Use separate models for vision/routing tasks</p>
        </div>
        <Toggle
          checked={routing?.enabled === true}
          onChange={(checked) => onChange('routing', { ...routing, enabled: checked })}
        />
      </div>

      {routing?.enabled && (
        <>
          {/* Vision Model */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-white/80">Vision Model</label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/60">Use main LLM</span>
                <Toggle
                  checked={routing?.visionModel?.useSameAsMain !== false}
                  onChange={(checked) => onChange('routing', { 
                    ...routing, 
                    visionModel: { ...routing?.visionModel, useSameAsMain: checked }
                  })}
                />
              </div>
            </div>
            {routing?.visionModel?.useSameAsMain === false && (
                <Input
                  type="text"
                  value={routing?.visionModel?.modelName || ''}
                  onChange={(e) => onChange('routing', { 
                    ...routing, 
                    visionModel: { ...routing?.visionModel, modelName: e.target.value }
                  })}
                  placeholder={`e.g., ${examples.vision}`}
                  variant={isLightBackground ? 'dark' : 'default'}
                  size="xs"
                />
            )}
          </div>

          {/* Router Model */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-white/80">Router Model</label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/60">Use main LLM</span>
                <Toggle
                  checked={routing?.routerModel?.useSameAsMain !== false}
                  onChange={(checked) => onChange('routing', { 
                    ...routing, 
                    routerModel: { ...routing?.routerModel, useSameAsMain: checked }
                  })}
                />
              </div>
            </div>
            {routing?.routerModel?.useSameAsMain === false && (
                <Input
                  type="text"
                  value={routing?.routerModel?.modelName || ''}
                  onChange={(e) => onChange('routing', { 
                    ...routing, 
                    routerModel: { ...routing?.routerModel, modelName: e.target.value }
                  })}
                  placeholder={`e.g., ${examples.router}`}
                  variant={isLightBackground ? 'dark' : 'default'}
                  size="xs"
                />
            )}
          </div>
        </>
      )}
    </div>
  );
};

const ModelConfigLocal = ({ routing, onChange, storageService, refreshTrigger, customModelsPath }) => {
  const [models, setModels] = React.useState([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const loadModels = async () => {
      if (!storageService) return;
      setLoading(true);
      try {
        const result = await storageService.listModels(customModelsPath);
        if (result?.success) {
          setModels(result.models || []);
        }
      } catch (err) {
        console.error('Failed to load models:', err);
      }
      setLoading(false);
    };
    loadModels();
  }, [storageService, refreshTrigger, customModelsPath]);

  const formatBytes = (bytes) => {
    if (!bytes) return 'Unknown';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(1)} GB`;
    }
    return `${mb.toFixed(0)} MB`;
  };

  return (
    <div className="space-y-3">
      {/* Main Routing Toggle */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
        <div>
          <label className="text-sm font-medium text-white/90">Enable Model Routing</label>
          <p className="text-xs text-white/50 mt-0.5">Use separate models for vision/routing tasks</p>
        </div>
        <Toggle
          checked={routing?.enabled === true}
          onChange={(checked) => onChange('routing', { ...routing, enabled: checked })}
        />
      </div>

      {routing?.enabled && (
        <>
          {/* Vision Model */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-white/80">Vision Model</label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/60">Use main LLM</span>
                <Toggle
                  checked={routing?.visionModel?.useSameAsMain !== false}
                  onChange={(checked) => onChange('routing', { 
                    ...routing, 
                    visionModel: { ...routing?.visionModel, useSameAsMain: checked }
                  })}
                />
              </div>
            </div>
            {routing?.visionModel?.useSameAsMain === false && (
              <>
                {loading ? (
                  <div className="text-xs text-white/50 py-2">Loading models...</div>
                ) : models.length === 0 ? (
                  <div className="text-xs text-white/40 py-2">No models found</div>
                ) : (
                  <div className="space-y-2">
                    {models.map((model) => (
                      <div
                        key={model.name}
                        className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Icon name="document" size={14} className="text-white/70 flex-shrink-0" />
                            <span className="text-sm font-medium text-white/90 truncate">
                              {model.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-white/50">
                            <span>{formatBytes(model.size)}</span>
                            {model.modified && (
                              <span>{new Date(model.modified).toLocaleDateString()}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {model.hasImageSupport && (
                            <div
                              className="p-2 text-white/70"
                              title="Supports vision/image input"
                            >
                              <Icon name="image" size={16} />
                            </div>
                          )}
                          <Toggle
                            checked={routing?.visionModel?.selectedModel === model.name}
                            onChange={(checked) => {
                              if (checked) {
                                onChange('routing', { 
                                  ...routing, 
                                  visionModel: { ...routing?.visionModel, selectedModel: model.name }
                                });
                              }
                            }}
                            title="Select as vision model"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Router Model */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-white/80">Router Model</label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/60">Use main LLM</span>
                <Toggle
                  checked={routing?.routerModel?.useSameAsMain !== false}
                  onChange={(checked) => onChange('routing', { 
                    ...routing, 
                    routerModel: { ...routing?.routerModel, useSameAsMain: checked }
                  })}
                />
              </div>
            </div>
            {routing?.routerModel?.useSameAsMain === false && (
              <>
                {loading ? (
                  <div className="text-xs text-white/50 py-2">Loading models...</div>
                ) : models.length === 0 ? (
                  <div className="text-xs text-white/40 py-2">No models found</div>
                ) : (
                  <div className="space-y-2">
                    {models.map((model) => (
                      <div
                        key={model.name}
                        className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Icon name="document" size={14} className="text-white/70 flex-shrink-0" />
                            <span className="text-sm font-medium text-white/90 truncate">
                              {model.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-white/50">
                            <span>{formatBytes(model.size)}</span>
                            {model.modified && (
                              <span>{new Date(model.modified).toLocaleDateString()}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {model.hasImageSupport && (
                            <div
                              className="p-2 text-white/70"
                              title="Supports vision/image input"
                            >
                              <Icon name="image" size={16} />
                            </div>
                          )}
                          <Toggle
                            checked={routing?.routerModel?.selectedModel === model.name}
                            onChange={(checked) => {
                              if (checked) {
                                onChange('routing', { 
                                  ...routing, 
                                  routerModel: { ...routing?.routerModel, selectedModel: model.name }
                                });
                              }
                            }}
                            title="Select as router model"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const ImageSupportToggle = ({ providerKey, updateAIConfig, aiConfig, additionalNote = '' }) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
      <label htmlFor={`${providerKey}-image-support`} className="text-sm font-medium text-white/90 cursor-pointer flex-1">
        Enable Image Support (Multi-modal)
        <p className="text-xs text-white/50 mt-0.5">
          Allows sending images with text prompts. Enabled by default.{additionalNote && ` ${additionalNote}`}
        </p>
      </label>
      <Toggle
        id={`${providerKey}-image-support`}
        checked={aiConfig[providerKey]?.enableImageSupport !== false}
        onChange={(checked) => updateAIConfig(`${providerKey}.enableImageSupport`, checked)}
      />
    </div>
  </div>
);

const AudioSupportToggle = ({ providerKey, updateAIConfig, aiConfig, additionalNote = '' }) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
      <label htmlFor={`${providerKey}-audio-support`} className="text-sm font-medium text-white/90 cursor-pointer flex-1">
        Enable Audio Support (Multi-modal)
        <p className="text-xs text-white/50 mt-0.5">
          Allows sending audio files with text prompts. Enabled by default.{additionalNote && ` ${additionalNote}`}
        </p>
      </label>
      <Toggle
        id={`${providerKey}-audio-support`}
        checked={aiConfig[providerKey]?.enableAudioSupport !== false}
        onChange={(checked) => updateAIConfig(`${providerKey}.enableAudioSupport`, checked)}
      />
    </div>
  </div>
);

const SystemPromptSection = ({ providerKey, isLightBackground, updateAIConfig, aiConfig }) => {
  const providerConfig = aiConfig[providerKey] || {};
  const currentType = providerConfig.systemPromptType || 'default';
  const currentPrompt = providerConfig.systemPrompt || '';
  
  return (
    <>
      {/* System Prompt Personality */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-white/90">System Prompt Personality</label>
        <Select
          value={currentType}
          onChange={(e) => {
            const newType = e.target.value;
            updateAIConfig(`${providerKey}.systemPromptType`, newType);
            if (newType !== 'custom') {
              updateAIConfig(`${providerKey}.systemPrompt`, '');
            }
          }}
          variant={isLightBackground ? 'dark' : 'default'}
          options={Object.entries(PromptConfig.systemPrompts).map(([key, value]) => ({ value: key, label: value.name }))}
        />
        <p className="text-xs text-white/50">
          Choose a personality for the AI assistant
        </p>
      </div>

      {/* Custom System Prompt Editor */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-white/90">
          System Prompt
          {currentType !== 'custom' && (
            <span className="ml-2 text-xs text-white/50">(Read-only - Select "Custom" to edit)</span>
          )}
        </label>
        <textarea
          value={
            currentType === 'custom' 
              ? currentPrompt 
              : (PromptConfig.systemPrompts[currentType]?.prompt || '')
          }
          onChange={(e) => {
            const newValue = e.target.value;
            if (currentType !== 'custom') {
              updateAIConfig(`${providerKey}.systemPromptType`, 'custom');
            }
            updateAIConfig(`${providerKey}.systemPrompt`, newValue);
          }}
          placeholder="Enter custom system prompt..."
          rows="4"
          className={cn('glass-input w-full resize-y', isLightBackground && 'glass-input-dark')}
        />
        <p className="text-xs text-white/50">
          Instructions that define the AI's behavior and personality. Editing a preset will switch to "Custom" mode.
        </p>
      </div>
    </>
  );
};

const LLMSettings = ({ isLightBackground, hasChromeAI, onRequestDeleteLLMModel, refreshTrigger }) => {
  const {
    aiConfig,
    aiTesting,
    updateAIConfig,
    testAIConnection,
    
    chromeAiStatus,
    checkChromeAIAvailability,
    startChromeAIDownload,
  } = useConfig();

  const { api: androidAPI } = useAndroid();
  const { api: desktopAPI } = useDesktop();
  const [_desktopServerStatus, setDesktopServerStatus] = useState(null);
  const desktopServerPort = Number(aiConfig['desktop-local']?.serverPort || 11438);
  const isDesktopServerPortValid = Number.isInteger(desktopServerPort) && desktopServerPort >= 1 && desktopServerPort <= 65535;

  useEffect(() => {
    if (!isDesktop || !desktopAPI?.server?.getStatus) {
      return;
    }

    let active = true;

    const refreshStatus = async () => {
      try {
        const status = await desktopAPI.server.getStatus();
        if (active) {
          setDesktopServerStatus(status);
        }
      } catch {
        if (active) {
          setDesktopServerStatus(null);
        }
      }
    };

    refreshStatus();
    const interval = setInterval(refreshStatus, 5000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [desktopAPI]);

  // Filter providers based on platform
  const availableProviders = useMemo(() => {
    if (isAndroid) {
      return AIProviders;
    }
    const { ANDROID_LOCAL, CHROME_AI, ...otherProviders } = AIProviders;
    return otherProviders;
  }, []);

  return (
    <div className="space-y-6">
      <h3 className="text-base font-semibold text-white mb-4">LLM Configuration</h3>

      {isDesktop && (
          <Card variant="default">
            <div className="text-sm font-medium text-white/90">Shared Local API Server (LLM/TTS/STT)</div>

            <SettingsRow
              className="mt-2"
              description="When enabled, binds to LAN so other devices can use your hosted server."
            >
              <Toggle
                id="desktop-local-share-network"
                checked={aiConfig['desktop-local']?.shareOnNetwork === true}
                onChange={(checked) => updateAIConfig('desktop-local.shareOnNetwork', checked)}
              />
            </SettingsRow>

            <div className="space-y-2 mt-2">
              <label className="block text-sm font-medium text-white/90">Shared Server Port</label>
              <Input
                type="number"
                min="1"
                max="65535"
                step="1"
                value={desktopServerPort}
                onChange={(e) => {
                  const nextPort = Number.parseInt(e.target.value, 10);
                  if (Number.isInteger(nextPort)) {
                    updateAIConfig('desktop-local.serverPort', nextPort);
                  }
                }}
                variant={isLightBackground ? 'dark' : 'default'}
              />
              {!isDesktopServerPortValid && (
                <p className="text-xs text-red-300">Port must be between 1 and 65535.</p>
              )}
            </div>
          </Card>
      )}
      
      {/* Provider Selection */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-white/90">Provider</label>
        <Select
          value={aiConfig.provider}
          onChange={(e) => updateAIConfig('provider', e.target.value)}
          variant={isLightBackground ? 'dark' : 'default'}
          options={Object.entries(availableProviders).map(([key, value]) => ({ value, label: key }))}
        />
      </div>

      {aiConfig.provider === 'chrome-ai' && !hasChromeAI && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-xs text-red-300">
            Chrome AI requires Chrome 138 or later. Please update your browser.
          </p>
        </div>
      )}

      {/* OpenAI Configuration */}
      {aiConfig.provider === AIProviders.OPENAI && (
        <>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/90">API Key</label>
            <Input
              type="password"
              value={aiConfig.openai.apiKey}
              onChange={(e) => updateAIConfig('openai.apiKey', e.target.value)}
              placeholder="sk-..."
              variant={isLightBackground ? 'dark' : 'default'}
              className="w-full"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/90">Model</label>
            <Input
              type="text"
              value={aiConfig.openai.model}
              onChange={(e) => updateAIConfig('openai.model', e.target.value)}
              placeholder="gpt-4o"
              variant={isLightBackground ? 'dark' : 'default'}
              className="w-full"
            />
          </div>

          <ImageSupportToggle providerKey="openai" aiConfig={aiConfig} updateAIConfig={updateAIConfig} />
          <AudioSupportToggle providerKey="openai" aiConfig={aiConfig} updateAIConfig={updateAIConfig} />
          <SystemPromptSection providerKey="openai" isLightBackground={isLightBackground} aiConfig={aiConfig} updateAIConfig={updateAIConfig} />
          
          {/* Model Routing */}
          <div className="p-3 rounded-lg bg-white/5 border border-white/10">
            <h4 className="text-sm font-medium text-white/90 mb-3">Model Routing</h4>
            <ModelConfigRemote
              providerKey="openai"
              routing={aiConfig.openai?.routing}
              onChange={(field, value) => updateAIConfig(`openai.${field}`, value)}
              isLightBackground={isLightBackground}
            />
          </div>
        </>
      )}

      {/* Ollama Configuration */}
      {aiConfig.provider === AIProviders.OLLAMA && (
        <>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/90">Endpoint URL</label>
            <Input
              type="text"
              value={aiConfig.ollama?.endpoint ?? ''}
              onChange={(e) => updateAIConfig('ollama.endpoint', e.target.value)}
              placeholder="http://localhost:11434"
              variant={isLightBackground ? 'dark' : 'default'}
              className="w-full"
            />
            <p className="text-xs text-white/50">
              URL of your local Ollama server
            </p>
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/90">Model</label>
            <Input
              type="text"
              value={aiConfig.ollama?.model ?? ''}
              onChange={(e) => updateAIConfig('ollama.model', e.target.value)}
              placeholder="llama2"
              variant={isLightBackground ? 'dark' : 'default'}
              className="w-full"
            />
            <p className="text-xs text-white/50">
              Model name (e.g., llama2, mistral, codellama)
            </p>
          </div>

          <ImageSupportToggle providerKey="ollama" aiConfig={aiConfig} updateAIConfig={updateAIConfig} additionalNote="Requires multi-modal capable model." />
          <AudioSupportToggle providerKey="ollama" aiConfig={aiConfig} updateAIConfig={updateAIConfig} additionalNote="Requires multi-modal capable model." />
          <SystemPromptSection providerKey="ollama" isLightBackground={isLightBackground} aiConfig={aiConfig} updateAIConfig={updateAIConfig} />
          
          {/* Model Routing */}
          <div className="p-3 rounded-lg bg-white/5 border border-white/10">
            <h4 className="text-sm font-medium text-white/90 mb-3">Model Routing</h4>
            <ModelConfigRemote
              providerKey="ollama"
              routing={aiConfig.ollama?.routing}
              onChange={(field, value) => updateAIConfig(`ollama.${field}`, value)}
              isLightBackground={isLightBackground}
            />
          </div>
        </>
      )}

      {/* Android Local LLM Configuration */}
      {aiConfig.provider === AIProviders.ANDROID_LOCAL && isAndroid && (
        <>
          {/* Info Banner */}
          <div className="p-3 rounded-lg bg-white/10 border border-white/20">
            <p className="text-xs text-green-300">
              <span className="font-semibold">Android Local LLM</span> - On-device AI using llama.cpp. Download and manage GGUF models below.
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/90">Endpoint URL</label>
            <Input
              type="text"
              value={aiConfig['android-local']?.endpoint ?? 'http://127.0.0.1:8765'}
              onChange={(e) => updateAIConfig('android-local.endpoint', e.target.value)}
              placeholder="http://127.0.0.1:8765"
              variant={isLightBackground ? 'dark' : 'default'}
              className="w-full"
            />
            <p className="text-xs text-white/50">
              Local HTTP server on Android device
            </p>
          </div>

          {/* Model Management UI */}
          <LocalLLMModelManager
            storageService={getLLMModelStorage(androidAPI)}
            selectedModel={aiConfig['android-local']?.model || null}
            onModelSelect={(modelName) => updateAIConfig('android-local.model', modelName)}
            customModelsPath={null}
            onCustomPathChange={null}
            isLightBackground={isLightBackground}
            onRequestDeleteModel={onRequestDeleteLLMModel}
            refreshTrigger={refreshTrigger}
            supportsCustomFolder={false}
          />

          {/* Temperature Slider */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/90">
              Temperature: {aiConfig['android-local']?.temperature || 0.7}
            </label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={aiConfig['android-local']?.temperature || 0.7}
              onChange={(e) => updateAIConfig('android-local.temperature', parseFloat(e.target.value))}
              className="w-full"
            />
            <p className="text-xs text-white/50">
              Controls randomness (0 = deterministic, 2 = very creative)
            </p>
          </div>

          {/* Max Tokens */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/90">
              Max Tokens: {aiConfig['android-local']?.maxTokens || 2048}
            </label>
            <input
              type="range"
              min="64"
              max="2048"
              step="64"
              value={aiConfig['android-local']?.maxTokens || 2048}
              onChange={(e) => updateAIConfig('android-local.maxTokens', parseInt(e.target.value))}
              className="w-full"
            />
            <p className="text-xs text-white/50">
              Maximum response length (higher = slower)
            </p>
          </div>

          <SystemPromptSection providerKey="android-local" isLightBackground={isLightBackground} aiConfig={aiConfig} updateAIConfig={updateAIConfig} />
          
          {/* Model Routing */}
          <div className="p-3 rounded-lg bg-white/5 border border-white/10">
            <h4 className="text-sm font-medium text-white/90 mb-3">Model Routing</h4>
            <ModelConfigLocal
              routing={aiConfig['android-local']?.routing}
              onChange={(field, value) => updateAIConfig(`android-local.${field}`, value)}
              storageService={getLLMModelStorage(androidAPI)}
              refreshTrigger={refreshTrigger}
              customModelsPath={null}
            />
          </div>
        </>
      )}

      {/* Desktop Local LLM Configuration */}
      {aiConfig.provider === AIProviders.DESKTOP_LOCAL && isDesktop && (
        <>
          <DesktopLLMConfig
            config={aiConfig['desktop-local'] || {}}
            onChange={(updates) => {
              Object.entries(updates).forEach(([key, value]) => {
                updateAIConfig(`desktop-local.${key}`, value);
              });
            }}
            isSetupMode={false}
            isLightBackground={isLightBackground}
            onRequestDeleteModel={onRequestDeleteLLMModel}
            refreshTrigger={refreshTrigger}
          />          <SystemPromptSection providerKey="desktop-local" isLightBackground={isLightBackground} aiConfig={aiConfig} updateAIConfig={updateAIConfig} />
          
          {/* Model Routing */}
          <div className="p-3 rounded-lg bg-white/5 border border-white/10">
            <h4 className="text-sm font-medium text-white/90 mb-3">Model Routing</h4>
            <ModelConfigLocal
              routing={aiConfig['desktop-local']?.routing}
              onChange={(field, value) => updateAIConfig(`desktop-local.${field}`, value)}
              storageService={getLLMModelStorage(desktopAPI)}
              refreshTrigger={refreshTrigger}
              customModelsPath={aiConfig['desktop-local']?.customModelsPath}
            />
          </div>
        </>
      )}

      {/* Chrome AI Configuration */}
      {aiConfig.provider === AIProviders.CHROME_AI && (
        <>
          {/* Info Banner */}
          <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <p className="text-xs text-blue-300">
              <span className="font-semibold">Chrome Built-in AI (Gemini Nano)</span> - On-device AI running locally
            </p>
          </div>

          {/* Availability Status */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/90">Status</label>
            <div className="p-3 rounded-lg bg-white/5 border border-white/10">
              {chromeAiStatus.checking ? (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
                  <span className="text-xs text-white/70">Checking availability...</span>
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
                  {(chromeAiStatus.state === 'downloadable' || chromeAiStatus.state === 'after-download') && !chromeAiStatus.downloading && (
                    <Button
                      onClick={startChromeAIDownload}
                      variant={isLightBackground ? 'dark' : 'default'}
                      size="sm"
                      className="mt-3 w-full"
                    >
                      Start Model Download
                    </Button>
                  )}
                  
                  {/* Refresh Status Button */}
                  <button
                    onClick={checkChromeAIAvailability}
                    className="mt-2 text-xs text-blue-400 hover:text-blue-300"
                  >
                    ↻ Refresh Status
                  </button>
                </>
              ) : (
                <Button
                  onClick={checkChromeAIAvailability}
                  variant={isLightBackground ? 'dark' : 'default'}
                  size="sm"
                  className="w-full"
                >
                  Check Status
                </Button>
              )}
            </div>
          </div>

          {/* Temperature Slider */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/90">
              Temperature: {aiConfig.chromeAi?.temperature || 1.0}
            </label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={aiConfig.chromeAi?.temperature || 1.0}
              onChange={(e) => updateAIConfig('chromeAi.temperature', parseFloat(e.target.value))}
              className="w-full"
            />
            <p className="text-xs text-white/50">
              Controls randomness (0 = deterministic, 2 = very creative)
            </p>
          </div>

          {/* Top-K Slider */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/90">
              Top-K: {aiConfig.chromeAi?.topK || 3}
            </label>
            <input
              type="range"
              min="1"
              max="10"
              step="1"
              value={aiConfig.chromeAi?.topK || 3}
              onChange={(e) => updateAIConfig('chromeAi.topK', parseInt(e.target.value))}
              className="w-full"
            />
            <p className="text-xs text-white/50">
              Limits token choices for more focused responses
            </p>
          </div>

          {/* Output Language */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/90">Output Language</label>
            <Select
              value={aiConfig.chromeAi?.outputLanguage || 'en'}
              onChange={(e) => updateAIConfig('chromeAi.outputLanguage', e.target.value)}
              variant={isLightBackground ? 'dark' : 'default'}
              options={[
                { value: 'en', label: 'English (en)' },
                { value: 'es', label: 'Spanish (es)' },
                { value: 'ja', label: 'Japanese (ja)' },
              ]}
            />
            <p className="text-xs text-white/50">
              Specifies the output language for optimal quality and safety
            </p>
          </div>

          {/* Image Support */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
              <label htmlFor="chrome-ai-image-support" className="text-sm font-medium text-white/90 cursor-pointer flex-1">
                Enable Image Support (Multi-modal)
                <p className="text-xs text-white/50 mt-0.5">
                  Allows sending images with text prompts. Enabled by default. Changing this setting will automatically clear the current chat session when you click "Save Settings".
                </p>
              </label>
              <Toggle
                id="chrome-ai-image-support"
                checked={aiConfig.chromeAi?.enableImageSupport !== false}
                onChange={(checked) => updateAIConfig('chromeAi.enableImageSupport', checked)}
              />
            </div>
          </div>

          {/* Audio Support */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
              <label htmlFor="chrome-ai-audio-support" className="text-sm font-medium text-white/90 cursor-pointer flex-1">
                Enable Audio Support (Multi-modal)
                <p className="text-xs text-white/50 mt-0.5">
                  Allows sending audio files with text prompts. Enabled by default. Changing this setting will automatically clear the current chat session when you click "Save Settings".
                </p>
              </label>
              <Toggle
                id="chrome-ai-audio-support"
                checked={aiConfig.chromeAi?.enableAudioSupport !== false}
                onChange={(checked) => updateAIConfig('chromeAi.enableAudioSupport', checked)}
              />
            </div>
          </div>

          {/* System Prompt */}
          <SystemPromptSection providerKey="chromeAi" isLightBackground={isLightBackground} aiConfig={aiConfig} updateAIConfig={updateAIConfig} />

          {/* Required Flags */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/90">Required Chrome Flags</label>
            <div className="p-3 rounded-lg bg-white/5 border border-white/10 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-white/70">optimization-guide-on-device-model</span>
                <button
                  onClick={() => navigator.clipboard.writeText('chrome://flags/#optimization-guide-on-device-model')}
                  className="text-blue-400 hover:text-blue-300 text-xs"
                >
                  Copy
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/70">prompt-api-for-gemini-nano</span>
                <button
                  onClick={() => navigator.clipboard.writeText('chrome://flags/#prompt-api-for-gemini-nano')}
                  className="text-blue-400 hover:text-blue-300 text-xs"
                >
                  Copy
                </button>
              </div>
              <p className="text-white/50 mt-2">
                Enable these flags and restart Chrome, then visit <code className="text-blue-300">chrome://components</code> to download Gemini Nano
              </p>
            </div>
          </div>
        </>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-4">
        <Button
          onClick={testAIConnection}
          disabled={aiTesting}
          variant={isLightBackground ? 'dark' : 'default'}
        >
          Test Connection
        </Button>
      </div>
    </div>
  );
};

export default LLMSettings;
