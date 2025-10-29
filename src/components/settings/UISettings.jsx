/**
 * UISettings Component
 * UI configuration tab for SettingsPanel
 * Handles model loading, theme mode, chat position, and background detection settings
 */

import { useConfig } from '../../contexts/ConfigContext';
import { BackgroundThemeModes, PositionPresets, FPSLimitOptions } from '../../config/uiConfig';
import ExtensionBridge from '../../utils/ExtensionBridge';
import Toggle from '../common/Toggle';

const UISettings = ({ isLightBackground }) => {
  const {
    // UI Config
    uiConfig,
    updateUIConfig,
  } = useConfig();

  // Check if running as extension
  const isExtensionMode = ExtensionBridge.isExtensionMode();

  return (
    <div className="space-y-6">
      <h3 className="text-base font-semibold text-white mb-4">UI Configuration</h3>
      
      {/* Auto-load on All Pages Toggle - Extension mode only */}
      {isExtensionMode && (
        <div className="space-y-2">
          <label className="flex items-center space-x-3 cursor-pointer">
            <Toggle
              checked={uiConfig.autoLoadOnAllPages !== false}
              onChange={(checked) => updateUIConfig('autoLoadOnAllPages', checked)}
            />
            <span className="text-sm text-white">Auto-load on Every Page</span>
          </label>
          <p className="text-xs text-white/50 ml-11">
            {uiConfig.autoLoadOnAllPages !== false
              ? 'Extension loads automatically on all pages' 
              : 'Click extension icon to manually load on each page'}
          </p>
        </div>
      )}
      
      {/* Model Loading Toggle */}
      <div className="space-y-2">
        <label className="flex items-center space-x-3 cursor-pointer">
          <Toggle
            checked={uiConfig.enableModelLoading}
            onChange={(checked) => updateUIConfig('enableModelLoading', checked)}
          />
          <span className="text-sm text-white">Enable 3D Model Loading</span>
        </label>
        <p className="text-xs text-white/50 ml-11">
          {uiConfig.enableModelLoading 
            ? 'Virtual assistant with 3D avatar' 
            : 'Chat-only mode (no 3D model)'}
        </p>
      </div>

      {/* Colored Icons Toggle */}
      <div className="space-y-2">
        <label className="flex items-center space-x-3 cursor-pointer">
          <Toggle
            checked={uiConfig.enableColoredIcons || false}
            onChange={(checked) => updateUIConfig('enableColoredIcons', checked)}
          />
          <span className="text-sm text-white">Use Colored Icons</span>
        </label>
        <p className="text-xs text-white/50 ml-11">
          {uiConfig.enableColoredIcons 
            ? 'Icons are displayed in color' 
            : 'Icons are displayed in monochrome gray'}
        </p>
        
        {/* Toolbar Only Sub-option */}
        {uiConfig.enableColoredIcons && (
          <div className="ml-11 mt-2">
            <label className="flex items-center space-x-3 cursor-pointer">
              <Toggle
                checked={uiConfig.enableColoredIconsToolbarOnly || false}
                onChange={(checked) => updateUIConfig('enableColoredIconsToolbarOnly', checked)}
              />
              <span className="text-xs text-white">Toolbar Only</span>
            </label>
            <p className="text-xs text-white/50 ml-11">
              {uiConfig.enableColoredIconsToolbarOnly 
                ? 'Colored icons only in AI toolbar' 
                : 'Colored icons everywhere'}
            </p>
          </div>
        )}
      </div>

      {/* Character Display Settings - Only show when 3D model is enabled */}
      {uiConfig.enableModelLoading && (
        <div className="space-y-4 border-t border-white/10 pt-4">
          <h4 className="text-sm font-semibold text-white mb-3">Character Display</h4>
          
          {/* Portrait Mode Toggle */}
          <div className="space-y-2">
            <label className="flex items-center space-x-3 cursor-pointer">
              <Toggle
                checked={uiConfig.enablePortraitMode || false}
                onChange={(checked) => updateUIConfig('enablePortraitMode', checked)}
              />
              <span className="text-sm text-white">Portrait Mode</span>
            </label>
            <p className="text-xs text-white/50 ml-11">
              {uiConfig.enablePortraitMode 
                ? 'Upper body framing with closer camera view' 
                : 'Full body view with standard camera'}
            </p>
          </div>

          {/* Physics Toggle */}
          <div className="space-y-2">
            <label className="flex items-center space-x-3 cursor-pointer">
              <Toggle
                checked={uiConfig.enablePhysics !== false}
                onChange={(checked) => updateUIConfig('enablePhysics', checked)}
              />
              <span className="text-sm text-white">Physics Simulation</span>
            </label>
            <p className="text-xs text-white/50 ml-11">
              {uiConfig.enablePhysics !== false
                ? 'Realistic hair and cloth movement' 
                : 'Disable physics for better performance'}
            </p>
          </div>

          {/* FPS Limit */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/90">Frame Rate Limit</label>
            <select
              value={uiConfig.fpsLimit || FPSLimitOptions.FPS_60}
              onChange={(e) => {
                const value = e.target.value === 'native' ? 'native' : parseInt(e.target.value);
                updateUIConfig('fpsLimit', value);
              }}
              className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
            >
              <option value={FPSLimitOptions.FPS_30} className="bg-gray-900">30 FPS (Battery Saver)</option>
              <option value={FPSLimitOptions.FPS_60} className="bg-gray-900">60 FPS (Recommended)</option>
              <option value={FPSLimitOptions.FPS_90} className="bg-gray-900">90 FPS (High Refresh)</option>
              <option value={FPSLimitOptions.NATIVE} className="bg-gray-900">Native (Monitor Rate)</option>
            </select>
            <p className="text-xs text-white/50">
              {uiConfig.fpsLimit === FPSLimitOptions.NATIVE || uiConfig.fpsLimit === 'native'
                ? 'warning:Native refresh rate may impact performance on high-refresh monitors (144Hz+)'
                : `Limits rendering to ${uiConfig.fpsLimit || 60} frames per second`}
            </p>
          </div>

          {/* Position Preset */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/90">Character Position</label>
            <select
              value={uiConfig.position?.preset || 'bottom-right'}
              onChange={(e) => updateUIConfig('position.preset', e.target.value)}
              className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
            >
              <option value="last-location" className="bg-gray-900">Last Location (Remember Position)</option>
              {Object.entries(PositionPresets).map(([key, preset]) => (
                <option key={key} value={key} className="bg-gray-900">
                  {preset.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-white/50">
              {uiConfig.position?.preset === 'last-location'
                ? 'Will load at the last dragged position. Drag to save new position.'
                : 'Changes will apply on next page load or reload'}
            </p>
          </div>
        </div>
      )}

      {/* Chat Position for chat-only mode */}
      {!uiConfig.enableModelLoading && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-white/90">Chat Position</label>
          <select
            value={uiConfig.position?.preset || 'bottom-right'}
            onChange={(e) => updateUIConfig('position.preset', e.target.value)}
            className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
          >
            <option value="last-location" className="bg-gray-900">Last Location (Remember Position)</option>
            {Object.entries(PositionPresets).map(([key, preset]) => (
              <option key={key} value={key} className="bg-gray-900">
                {preset.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-white/50">
            {uiConfig.position?.preset === 'last-location'
              ? 'Will load at the last dragged position. Drag to save new position.'
              : 'Changes will apply on next page load or reload'}
          </p>
        </div>
      )}

      {/* Enable Developer Tools Toggle */}
      <div className="space-y-2 border-t border-white/10 pt-4">
        <h4 className="text-sm font-semibold text-white mb-3">Developer Options</h4>
        
        <label className="flex items-center space-x-3 cursor-pointer">
          <Toggle
            checked={uiConfig.enableDebugPanel || false}
            onChange={(checked) => updateUIConfig('enableDebugPanel', checked)}
          />
          <span className="text-sm text-white">Enable Developer Tools</span>
        </label>
        <p className="text-xs text-white/50 ml-11">
          Show draggable debug panel for testing animations and positions
        </p>
      </div>

      {/* Chat & UI Settings */}
      <div className="space-y-4 border-t border-white/10 pt-4">
        <h4 className="text-sm font-semibold text-white mb-3">Chat & Interface</h4>
        
        {/* Smooth Streaming Animation Toggle */}
        <div className="space-y-2">
          <label className="flex items-center space-x-3 cursor-pointer">
            <Toggle
              checked={uiConfig.smoothStreamingAnimation || false}
              onChange={(checked) => updateUIConfig('smoothStreamingAnimation', checked)}
            />
            <span className="text-sm text-white">Smooth Response Animation</span>
          </label>
          <p className="text-xs text-yellow-400/80 ml-11">
            ⚠️ Performance Impact: Enables smooth height animation for streaming text. May affect performance on lower-end devices.
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
          </>
        )}
      </div>

      {/* AI Toolbar Settings */}
      <div className="space-y-2 border-t border-white/10 pt-4">
        <h4 className="text-sm font-semibold text-white mb-3">AI Toolbar</h4>
        
        {/* Enable AI Toolbar */}
        <label className="flex items-center space-x-3 cursor-pointer">
          <Toggle
            checked={uiConfig.enableAIToolbar !== false}
            onChange={(checked) => updateUIConfig('enableAIToolbar', checked)}
          />
          <span className="text-sm text-white">Enable AI Toolbar</span>
        </label>
        <p className="text-xs text-white/50 ml-11">
          Show toolbar when selecting text with Summarize, Translate, and Add to Chat actions
        </p>

        {/* Show on Input Focus */}
        {uiConfig.enableAIToolbar !== false && (
          <>
            <label className="flex items-center space-x-3 cursor-pointer mt-3">
              <Toggle
                checked={uiConfig.aiToolbar?.showOnInputFocus !== false}
                onChange={(checked) => updateUIConfig('aiToolbar.showOnInputFocus', checked)}
              />
              <span className="text-sm text-white">Show on Input Focus</span>
            </label>
            <p className="text-xs text-white/50 ml-11">
              Automatically show toolbar with dictation when clicking on any text input field or editable area
            </p>

            {/* Show on Image Hover */}
            <label className="flex items-center space-x-3 cursor-pointer mt-3">
              <Toggle
                checked={uiConfig.aiToolbar?.showOnImageHover !== false}
                onChange={(checked) => updateUIConfig('aiToolbar.showOnImageHover', checked)}
              />
              <span className="text-sm text-white">Show on Image Hover</span>
            </label>
            <p className="text-xs text-white/50 ml-11">
              Automatically show toolbar with image analysis actions when hovering over any image
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default UISettings;
