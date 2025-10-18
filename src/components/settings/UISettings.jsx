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
    saveUIConfig,
    
    // General Config
    generalConfig,
    generalConfigError,
    updateGeneralConfig,
    saveGeneralConfig,
  } = useConfig();

  return (
    <div className="space-y-6">
      <h3 className="text-base font-semibold text-white mb-4">UI Configuration</h3>
      
      {/* Model Loading Toggle */}
      <div className="space-y-2">
        <label className="flex items-center space-x-3 cursor-pointer">
          <input
            type="checkbox"
            checked={generalConfig.enableModelLoading}
            onChange={(e) => updateGeneralConfig('enableModelLoading', e.target.checked)}
            className="w-4 h-4 rounded border-white/20 bg-white/10 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
          />
          <span className="text-sm text-white">Enable 3D Model Loading</span>
        </label>
        <p className="text-xs text-white/50 ml-7">
          {generalConfig.enableModelLoading 
            ? 'Virtual assistant with 3D avatar' 
            : 'Chat-only mode (no 3D model)'}
        </p>
      </div>

      {/* Enable Developer Tools Toggle */}
      <div className="space-y-2">
        <label className="flex items-center space-x-3 cursor-pointer">
          <input
            type="checkbox"
            checked={generalConfig.enableDebugPanel || false}
            onChange={(e) => updateGeneralConfig('enableDebugPanel', e.target.checked)}
            className="w-4 h-4 rounded border-white/20 bg-white/10 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
          />
          <span className="text-sm text-white">Enable Developer Tools</span>
        </label>
        <p className="text-xs text-white/50 ml-7">
          Show draggable debug panel for testing animations and positions
        </p>
      </div>

      {/* Save General Config Button */}
      <div className="flex items-center gap-3 pt-4">
        <button 
          onClick={saveGeneralConfig} 
          className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-4 py-2 text-sm font-medium rounded-lg`}
        >
          Save General Config
        </button>
        {generalConfigError && (
          <span className="text-sm text-red-400">{generalConfigError}</span>
        )}
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

      {/* Save Button */}
      <div className="flex items-center gap-3 pt-4">
        <button 
          onClick={saveUIConfig} 
          className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-4 py-2 text-sm font-medium rounded-lg`}
        >
          Save UI Config
        </button>
        {uiConfigSaved && (
          <span className="text-sm text-green-400">✓ Saved successfully!</span>
        )}
        {uiConfigError && (
          <span className="text-sm text-red-400">{uiConfigError}</span>
        )}
      </div>
    </div>
  );
};

export default UISettings;
