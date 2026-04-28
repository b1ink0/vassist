/**
 * OpenAI-Compatible STT Configuration Component
 * Shared between Settings and Setup Wizard
 */

import { Input, Select } from '../../ui';

interface OpenAICompatibleSTTConfigShape {
  endpoint?: string;
  apiKey?: string;
  model?: string;
  language?: string;
}

type OpenAICompatibleOnChange = ((field: string, value: string) => void) | ((updates: OpenAICompatibleSTTConfigShape) => void);

interface OpenAICompatibleSTTConfigProps {
  config: OpenAICompatibleSTTConfigShape;
  onChange: OpenAICompatibleOnChange;
  isLightBackground?: boolean;
}

const OpenAICompatibleSTTConfig = ({ config, onChange, isLightBackground = false }: OpenAICompatibleSTTConfigProps) => {
  const handleFieldChange = (field: keyof OpenAICompatibleSTTConfigShape, value: string) => {
    if (onChange.length === 2) {
      (onChange as (field: string, value: string) => void)(field, value);
    } else {
      (onChange as (updates: OpenAICompatibleSTTConfigShape) => void)({
        ...config,
        [field]: value
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Endpoint URL */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-white/90">
          Endpoint URL <span className="text-red-400">*</span>
        </label>
        <Input
          type="text"
          value={config.endpoint || ''}
          onChange={(e) => handleFieldChange('endpoint', e.target.value)}
          placeholder="http://localhost:8000"
          variant={isLightBackground ? 'dark' : 'default'}
        />
        <p className="text-xs text-white/50">
          Base URL (will append /v1/audio/transcriptions)
        </p>
      </div>

      {/* API Key (Optional) */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-white/90">API Key (Optional)</label>
        <Input
          type="password"
          value={config.apiKey || ''}
          onChange={(e) => handleFieldChange('apiKey', e.target.value)}
          placeholder="Leave empty if not required"
          variant={isLightBackground ? 'dark' : 'default'}
        />
        <p className="text-xs text-white/50">
          Required only if your endpoint requires authentication
        </p>
      </div>

      {/* Model */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-white/90">Model</label>
        <Input
          type="text"
          value={config.model || ''}
          onChange={(e) => handleFieldChange('model', e.target.value)}
          placeholder="whisper"
          variant={isLightBackground ? 'dark' : 'default'}
        />
        <p className="text-xs text-white/50">
          Model name to use (e.g., whisper, faster-whisper)
        </p>
      </div>

      {/* Language */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-white/90">Language</label>
        <Select
          value={config.language || 'auto'}
          onChange={(e) => handleFieldChange('language', e.target.value)}
          variant={isLightBackground ? 'dark' : 'default'}
          options={[
            { value: 'auto', label: 'Auto-detect' },
            { value: 'en', label: 'English' },
            { value: 'es', label: 'Spanish' },
            { value: 'fr', label: 'French' },
            { value: 'de', label: 'German' },
            { value: 'it', label: 'Italian' },
            { value: 'pt', label: 'Portuguese' },
            { value: 'zh', label: 'Chinese' },
            { value: 'ja', label: 'Japanese' },
            { value: 'ko', label: 'Korean' },
          ]}
        />
        <p className="text-xs text-white/50">
          Default language hint for transcription requests. Use Auto-detect for mixed-language audio.
        </p>
      </div>

      {/* Info */}
      <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
        <p className="text-xs text-purple-300">
          <span className="font-semibold">OpenAI-Compatible STT</span> - Connect to self-hosted or third-party STT services using OpenAI's API format
        </p>
      </div>
    </div>
  );
};

export default OpenAICompatibleSTTConfig;
