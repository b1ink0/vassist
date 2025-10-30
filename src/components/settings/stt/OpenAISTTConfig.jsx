/**
 * OpenAI STT Configuration Component
 * Shared between Settings and Setup Wizard
 */

const OpenAISTTConfig = ({ config, onChange, isLightBackground }) => {
  return (
    <div className="space-y-4">
      {/* API Key */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-white/90">
          API Key <span className="text-red-400">*</span>
        </label>
        <input
          type="password"
          value={config.apiKey || ''}
          onChange={(e) => onChange('apiKey', e.target.value)}
          placeholder="sk-..."
          className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
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
        <input
          type="text"
          value={config.model || 'whisper-1'}
          onChange={(e) => onChange('model', e.target.value)}
          placeholder="whisper-1"
          className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
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
