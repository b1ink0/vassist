/**
 * UISettings Component
 * UI configuration tab for SettingsPanel
 * Handles model loading, theme mode, chat position, and background detection settings
 */

import { useConfig } from '../../contexts/ConfigContext';
import { BackgroundThemeModes } from '../../config/uiConfig';

const UISettings = ({ isLightBackground }) => {
  const {
    // UI Config
    uiConfig,
    uiConfigSaved,
    uiConfigError,
    updateUIConfig,
  } = useConfig();

  return (
    <div className="space-y-6">
      <h3 className="text-base font-semibold text-white mb-4">UI Configuration</h3>
      
      {/* Model Loading Toggle */}
      <div className="space-y-2">
        <label className="flex items-center space-x-3 cursor-pointer">
          <input
            type="checkbox"
            checked={uiConfig.enableModelLoading}
            onChange={(e) => updateUIConfig('enableModelLoading', e.target.checked)}
            className="w-4 h-4 rounded border-white/20 bg-white/10 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
          />
          <span className="text-sm text-white">Enable 3D Model Loading</span>
        </label>
        <p className="text-xs text-white/50 ml-7">
          {uiConfig.enableModelLoading 
            ? 'Virtual assistant with 3D avatar' 
            : 'Chat-only mode (no 3D model)'}
        </p>
      </div>

      {/* Enable Developer Tools Toggle */}
      <div className="space-y-2">
        <label className="flex items-center space-x-3 cursor-pointer">
          <input
            type="checkbox"
            checked={uiConfig.enableDebugPanel || false}
            onChange={(e) => updateUIConfig('enableDebugPanel', e.target.checked)}
            className="w-4 h-4 rounded border-white/20 bg-white/10 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
          />
          <span className="text-sm text-white">Enable Developer Tools</span>
        </label>
        <p className="text-xs text-white/50 ml-7">
          Show draggable debug panel for testing animations and positions
        </p>
      </div>

      {/* Theme Mode */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-white/90">Theme Mode</label>
        <select
          value={uiConfig.backgroundDetection?.mode || BackgroundThemeModes.ADAPTIVE}
          onChange={(e) => updateUIConfig('backgroundDetection.mode', e.target.value)}
          className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
        >
          {Object.entries(BackgroundThemeModes).map(([key, value]) => (
            <option key={value} value={value} className="bg-gray-900">
              {key.charAt(0) + key.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        <p className="text-xs text-white/50">
          Adaptive: Detects background brightness automatically
        </p>
      </div>

      {/* Adaptive Settings - Only show when mode is ADAPTIVE */}
      {(uiConfig.backgroundDetection?.mode || BackgroundThemeModes.ADAPTIVE) === BackgroundThemeModes.ADAPTIVE && (
        <>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/90">Sample Grid Size</label>
            <input
              type="number"
              min="3"
              max="10"
              value={uiConfig.backgroundDetection?.sampleGridSize || 5}
              onChange={(e) => updateUIConfig('backgroundDetection.sampleGridSize', parseInt(e.target.value))}
              className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
            />
            <p className="text-xs text-white/50">
              Number of sample points (grid size x grid size). Default: 5 (25 points)
            </p>
          </div>

          <div className="space-y-2">
            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={uiConfig.backgroundDetection?.showDebug || false}
                onChange={(e) => updateUIConfig('backgroundDetection.showDebug', e.target.checked)}
                className="w-4 h-4 rounded border-white/20 bg-white/10 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
              />
              <span className="text-sm text-white">Show Debug Markers</span>
            </label>
            <p className="text-xs text-white/50 ml-7">
              Display sample points and brightness values on screen
            </p>
          </div>
        </>
      )}

      {/* Chat Position */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-white/90">Chat Position</label>
        <select
          value={uiConfig.chatPosition}
          onChange={(e) => updateUIConfig('chatPosition', e.target.value)}
          className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
        >
          <option value="bottom-right" className="bg-gray-900">Bottom Right</option>
          <option value="bottom-left" className="bg-gray-900">Bottom Left</option>
          <option value="top-right" className="bg-gray-900">Top Right</option>
          <option value="top-left" className="bg-gray-900">Top Left</option>
        </select>
      </div>

      {/* AI Toolbar Settings */}
      <div className="space-y-2 border-t border-white/10 pt-4">
        <label className="flex items-center space-x-3 cursor-pointer">
          <input
            type="checkbox"
            checked={uiConfig.enableAIToolbar !== false}
            onChange={(e) => updateUIConfig('enableAIToolbar', e.target.checked)}
            className="w-4 h-4 rounded border-white/20 bg-white/10 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
          />
          <span className="text-sm text-white">Enable AI Toolbar</span>
        </label>
        <p className="text-xs text-white/50 ml-7">
          Show toolbar when selecting text with Summarize, Translate, and Add to Chat actions. Configure default translation language in AI+ tab.
        </p>
      </div>

      {/* Status Messages - auto-save feedback */}
      {uiConfigSaved && (
        <div className="glass-success rounded-2xl p-3 animate-in fade-in">
          <span className="text-sm text-emerald-100">✅ Auto-saved successfully!</span>
        </div>
      )}
      {uiConfigError && (
        <div className="glass-error rounded-2xl p-3 animate-in fade-in">
          <span className="text-sm text-red-100">{uiConfigError}</span>
        </div>
      )}
    </div>
  );
};

export default UISettings;
