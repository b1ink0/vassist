/**
 * OpenAI STT Configuration Component
 * Shared between Settings and Setup Wizard
 */

import { Input } from '../../ui';

interface OpenAISTTConfigShape {
  apiKey?: string;
  model?: string;
}

type OpenAISTTOnChange = ((field: string, value: string) => void) | ((updates: OpenAISTTConfigShape) => void);

interface OpenAISTTConfigProps {
  config: OpenAISTTConfigShape;
  onChange: OpenAISTTOnChange;
  isLightBackground?: boolean;
}

const OpenAISTTConfig = ({ config, onChange, isLightBackground = false }: OpenAISTTConfigProps) => {
  const handleFieldChange = (field: keyof OpenAISTTConfigShape, value: string) => {
    if (onChange.length === 2) {
      (onChange as (field: string, value: string) => void)(field, value);
    } else {
      (onChange as (updates: OpenAISTTConfigShape) => void)({
        ...config,
        [field]: value
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* API Key */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-white/90">
          API Key <span className="text-red-400">*</span>
        </label>
        <Input
          type="password"
          value={config.apiKey || ''}
          onChange={(e) => handleFieldChange('apiKey', e.target.value)}
          placeholder="sk-..."
          variant={isLightBackground ? 'dark' : 'default'}
        />
        <p className="text-xs text-white/50">
          Your OpenAI API key from{' '}
          <a 
            href="https://platform.openai.com/api-keys" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 underline"
          >
            platform.openai.com
          </a>
        </p>
      </div>

      {/* Model */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-white/90">Model</label>
        <Input
          type="text"
          value={config.model || 'whisper-1'}
          onChange={(e) => handleFieldChange('model', e.target.value)}
          placeholder="whisper-1"
          variant={isLightBackground ? 'dark' : 'default'}
        />
        <p className="text-xs text-white/50">
          OpenAI Whisper model to use (default: whisper-1)
        </p>
      </div>

      {/* Info */}
      <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
        <p className="text-xs text-blue-300">
          <span className="font-semibold">OpenAI Whisper</span> - Cloud-based speech recognition with high accuracy across multiple languages
        </p>
      </div>
    </div>
  );
};

export default OpenAISTTConfig;
