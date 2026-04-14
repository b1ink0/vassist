/**
 * OpenAI-Compatible STT Configuration Component
 * Shared between Settings and Setup Wizard
 */

const OpenAICompatibleSTTConfig = ({ config, onChange, isLightBackground }) => {
  const handleFieldChange = (field, value) => {
    if (onChange.length === 2) {
      onChange(field, value);
    } else {
      onChange({
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
        <input
          type="text"
          value={config.endpoint || ''}
          onChange={(e) => handleFieldChange('endpoint', e.target.value)}
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
          onChange={(e) => handleFieldChange('apiKey', e.target.value)}
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
          onChange={(e) => handleFieldChange('model', e.target.value)}
          placeholder="whisper"
          className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
        />
        <p className="text-xs text-white/50">
          Model name to use (e.g., whisper, faster-whisper)
        </p>
      </div>

      {/* Language */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-white/90">Language</label>
        <select
          value={config.language || 'auto'}
          onChange={(e) => handleFieldChange('language', e.target.value)}
          className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
        >
          <option value="auto" className="bg-gray-900">Auto-detect</option>
          <option value="en" className="bg-gray-900">English</option>
          <option value="es" className="bg-gray-900">Spanish</option>
          <option value="fr" className="bg-gray-900">French</option>
          <option value="de" className="bg-gray-900">German</option>
          <option value="it" className="bg-gray-900">Italian</option>
          <option value="pt" className="bg-gray-900">Portuguese</option>
          <option value="zh" className="bg-gray-900">Chinese</option>
          <option value="ja" className="bg-gray-900">Japanese</option>
          <option value="ko" className="bg-gray-900">Korean</option>
        </select>
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
