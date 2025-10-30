/**
 * OpenAI-Compatible STT Configuration Component
 * Shared between Settings and Setup Wizard
 */

const OpenAICompatibleSTTConfig = ({ config, onChange, isLightBackground }) => {
  return (
    <div className="space-y-4">
      {/* Endpoint URL */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-white/90">
          Endpoint URL <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={config.endpoint || ''}
          onChange={(e) => onChange('endpoint', e.target.value)}
          placeholder="http://localhost:8000"
          className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
        />
        <p className="text-xs text-white/50">
          Base URL (will append /v1/audio/transcriptions)
        </p>
      </div>

      {/* API Key (Optional) */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-white/90">API Key (Optional)</label>
        <input
          type="password"
          value={config.apiKey || ''}
          onChange={(e) => onChange('apiKey', e.target.value)}
          placeholder="Leave empty if not required"
          className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
        />
        <p className="text-xs text-white/50">
          Required only if your endpoint requires authentication
        </p>
      </div>

      {/* Model */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-white/90">Model</label>
        <input
          type="text"
          value={config.model || ''}
          onChange={(e) => onChange('model', e.target.value)}
          placeholder="whisper"
          className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
        />
        <p className="text-xs text-white/50">
          Model name to use (e.g., whisper, faster-whisper)
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
