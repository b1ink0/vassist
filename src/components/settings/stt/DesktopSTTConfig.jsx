import { Icon } from '../../icons';

/**
 * Reusable Desktop STT Configuration Component
 * Used in both setup wizard and settings panel for desktop-local STT provider
 * 
 * @param {Object} config - Current STT configuration (endpoint, model, etc.)
 * @param {Function} onChange - Callback when configuration changes
 * @param {boolean} isLightBackground - Whether component is on light background
 * @param {boolean} showTitle - Whether to show section title
 * @param {boolean} isSetupMode - Whether in setup wizard (affects UI slightly)
 */
const DesktopSTTConfig = ({ 
  config = {}, 
  onChange, 
  isSetupMode = false
}) => {
  const handleChange = (key, value) => {
    onChange({ [key]: value });
  };

  return (
    <div className="space-y-3">
      {/* Info Banner */}
      <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
        <div className="flex items-start gap-2">
          <Icon name="microphone" size={18} className="text-green-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-green-300">
            <span className="font-semibold">Desktop Local STT</span> - On-device speech recognition using Whisper via Electron!
          </p>
        </div>
      </div>

      {/* Status */}
      <div className="p-3 rounded-lg bg-white/5 border border-white/10">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-green-400"></div>
          <span className="text-sm font-semibold text-white/90">Ready to use!</span>
        </div>
        <p className="text-xs text-white/60">
          Model: whisper.cpp • Accurate speech recognition
        </p>
      </div>

      {/* Advanced Config */}
      <details className="group" open={isSetupMode}>
        <summary className="cursor-pointer text-sm font-medium text-white/90 flex items-center justify-between p-2 rounded hover:bg-white/5">
          <span>Advanced Settings</span>
          <Icon name="arrow-down" size={14} className="group-open:rotate-180 transition-transform" />
        </summary>
        <div className="mt-2 p-3 rounded-lg bg-white/5 border border-white/10 space-y-3">
          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">
              Endpoint URL
            </label>
            <input
              type="text"
              value={config.endpoint || 'http://127.0.0.1:11438'}
              onChange={(e) => handleChange('endpoint', e.target.value)}
              placeholder="http://127.0.0.1:11438"
              className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm bg-white/10 border border-white/20 rounded text-white placeholder-white/50 focus:outline-none focus:border-purple-400"
            />
            <p className="text-[10px] text-white/50 mt-1">
              Unified local AI server endpoint (same as LLM/TTS)
            </p>
          </div>
          
          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">
              Model File
            </label>
            <input
              type="text"
              value={config.model || 'ggml-small.en.bin'}
              onChange={(e) => handleChange('model', e.target.value)}
              placeholder="ggml-small.en.bin"
              className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm bg-white/10 border border-white/20 rounded text-white placeholder-white/50 focus:outline-none focus:border-purple-400"
            />
            <p className="text-[10px] text-white/50 mt-1">
              Whisper model filename (place in models/ directory)
            </p>
          </div>

          {/* Additional Parameters */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">
                Language
              </label>
              <select
                value={config.language || 'en'}
                onChange={(e) => handleChange('language', e.target.value)}
                className="w-full px-2 py-1.5 text-xs bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:border-purple-400"
              >
                <option value="en" className="bg-gray-900">English</option>
                <option value="es" className="bg-gray-900">Spanish</option>
                <option value="fr" className="bg-gray-900">French</option>
                <option value="de" className="bg-gray-900">German</option>
                <option value="it" className="bg-gray-900">Italian</option>
                <option value="pt" className="bg-gray-900">Portuguese</option>
                <option value="zh" className="bg-gray-900">Chinese</option>
                <option value="ja" className="bg-gray-900">Japanese</option>
                <option value="ko" className="bg-gray-900">Korean</option>
                <option value="auto" className="bg-gray-900">Auto-detect</option>
              </select>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">
                Threads ({config.threads || 4})
              </label>
              <input
                type="number"
                min="1"
                max="16"
                value={config.threads || 4}
                onChange={(e) => handleChange('threads', parseInt(e.target.value))}
                className="w-full px-2 py-1.5 text-xs bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:border-purple-400"
              />
              <p className="text-[10px] text-white/50 mt-1">
                CPU threads for processing
              </p>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
};

export default DesktopSTTConfig;
