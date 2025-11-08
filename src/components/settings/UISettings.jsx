/**
 * UISettings Component
 * UI configuration tab for SettingsPanel
 * Handles model loading, theme mode, chat position, and background detection settings
 */

import { useConfig } from '../../contexts/ConfigContext';
import { BackgroundThemeModes, PositionPresets, FPSLimitOptions } from '../../config/uiConfig';
import ExtensionBridge from '../../utils/ExtensionBridge';
import Toggle from '../common/Toggle';
import { useSetup } from '../../contexts/SetupContext';
import { useState } from 'react';
import Icon from '../icons/Icon';
import Logger from '../../services/LoggerService';

const UISettings = ({ isLightBackground }) => {
  const {
    uiConfig,
    updateUIConfig,
  } = useConfig();

  const { resetSetup } = useSetup();
  const [isResetting, setIsResetting] = useState(false);

  const isExtensionMode = ExtensionBridge.isExtensionMode();

  return (
    <div className="space-y-6">
      <h3 className="text-base font-semibold text-white mb-4">UI Configuration</h3>
      
      {/* Start Setup Again Button */}
      <div className="space-y-2 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
        <button
          onClick={async () => {
            if (isResetting) return;
            
            if (window.confirm('This will reset the setup wizard and take you back to the beginning. Continue?')) {
              try {
                setIsResetting(true);
                await resetSetup();
                window.location.reload();
              } catch (error) {
                Logger.error('other', 'Failed to reset setup:', error);
                alert('Failed to reset setup. Please try again.');
              } finally {
                setIsResetting(false);
              }
            }
          }}
          disabled={isResetting}
          className="glass-button w-full px-4 py-2 text-sm font-semibold rounded-lg hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
        >
          <Icon name="refresh" size={16} />
          {isResetting ? 'Resetting...' : 'Start Setup Wizard Again'}
        </button>
        <p className="text-xs text-purple-300">
          Re-run the initial setup wizard to reconfigure your assistant
        </p>
      </div>
      
      {/* Auto-load on All Pages Toggle - Extension mode only */}
      {isExtensionMode && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1">
              <label className="text-sm text-white font-medium">Auto-load on Every Page</label>
              <p className="text-xs text-white/50 mt-0.5">
                {uiConfig.autoLoadOnAllPages !== false
                  ? 'Extension loads automatically on all pages' 
                  : 'Click extension icon to manually load on each page'}
              </p>
            </div>
            <Toggle
              checked={uiConfig.autoLoadOnAllPages !== false}
              onChange={(checked) => updateUIConfig('autoLoadOnAllPages', checked)}
            />
          </div>
        </div>
      )}
      
      {/* Colored Icons Toggle */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <label className="text-sm text-white font-medium">Use Colored Icons</label>
            <p className="text-xs text-white/50 mt-0.5">
              {uiConfig.enableColoredIcons 
                ? 'Icons are displayed in color' 
                : 'Icons are displayed in monochrome gray'}
            </p>
          </div>
          <Toggle
            checked={uiConfig.enableColoredIcons || false}
            onChange={(checked) => updateUIConfig('enableColoredIcons', checked)}
          />
        </div>
        
        {/* Toolbar Only Sub-option */}
        {uiConfig.enableColoredIcons && (
          <div className="ml-4 mt-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <label className="text-xs text-white font-medium">Toolbar Only</label>
                <p className="text-xs text-white/50 mt-0.5">
                  {uiConfig.enableColoredIconsToolbarOnly 
                    ? 'Colored icons only in AI toolbar' 
                    : 'Colored icons everywhere'}
                </p>
              </div>
              <Toggle
                checked={uiConfig.enableColoredIconsToolbarOnly || false}
                onChange={(checked) => updateUIConfig('enableColoredIconsToolbarOnly', checked)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Virtual Companion Settings */}
      <div className="space-y-4 border-t border-white/10 pt-4">
        <h4 className="text-sm font-semibold text-white mb-3">Virtual Companion</h4>
        
        {/* Enable 3D Model Loading Toggle */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1">
              <label className="text-sm text-white font-medium">Enable 3D Model Loading</label>
              <p className="text-xs text-white/50 mt-0.5">
                {uiConfig.enableModelLoading 
                  ? 'Virtual assistant with 3D avatar' 
                  : 'Chat-only mode (no 3D model)'}
              </p>
            </div>
            <Toggle
              checked={uiConfig.enableModelLoading}
              onChange={(checked) => updateUIConfig('enableModelLoading', checked)}
            />
          </div>
        </div>

        {/* Character Display Settings - Only show when 3D model is enabled */}
        {uiConfig.enableModelLoading && (
          <>
          {/* Portrait Mode Toggle */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <label className="text-sm text-white font-medium">Portrait Mode</label>
                <p className="text-xs text-white/50 mt-0.5">
                  {uiConfig.enablePortraitMode 
                    ? 'Upper body framing with closer camera view' 
                    : 'Full body view with standard camera'}
                </p>
              </div>
              <Toggle
                checked={uiConfig.enablePortraitMode || false}
                onChange={(checked) => updateUIConfig('enablePortraitMode', checked)}
              />
            </div>
          </div>

          {/* Physics Toggle */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <label className="text-sm text-white font-medium">Physics Simulation</label>
                <p className="text-xs text-white/50 mt-0.5">
                  {uiConfig.enablePhysics !== false
                    ? 'Realistic hair and cloth movement' 
                    : 'Disable physics for better performance'}
                </p>
              </div>
              <Toggle
                checked={uiConfig.enablePhysics !== false}
                onChange={(checked) => updateUIConfig('enablePhysics', checked)}
              />
            </div>
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
            {uiConfig.fpsLimit === FPSLimitOptions.NATIVE || uiConfig.fpsLimit === 'native' ? (
              <div className="mt-2 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex items-start gap-2">
                <Icon name="alert-triangle" size={14} className="text-yellow-200/90 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-yellow-200/90">
                  Native refresh rate may impact performance on high-refresh monitors (144Hz+)
                </p>
              </div>
            ) : (
              <p className="text-xs text-white/50">
                Limits rendering to {uiConfig.fpsLimit || 60} frames per second
              </p>
            )}
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
          </>
        )}
      </div>

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
        
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <label className="text-sm text-white font-medium">Enable Developer Tools</label>
            <p className="text-xs text-white/50 mt-0.5">
              Show draggable debug panel for testing animations and positions
            </p>
          </div>
          <Toggle
            checked={uiConfig.enableDebugPanel || false}
            onChange={(checked) => updateUIConfig('enableDebugPanel', checked)}
          />
        </div>
      </div>

      {/* Chat & UI Settings */}
      <div className="space-y-4 border-t border-white/10 pt-4">
        <h4 className="text-sm font-semibold text-white mb-3">Chat & Interface</h4>
        
        {/* Smooth Streaming Animation Toggle */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1">
              <label className="text-sm text-white font-medium">Smooth Response Animation</label>
              <p className="text-xs text-yellow-400/80 mt-0.5 flex items-start gap-1.5">
                <Icon name="warning" size={14} className="flex-shrink-0 mt-0.5" />
                <span>Performance Impact: Enables smooth height animation for streaming text. May affect performance on lower-end devices.</span>
              </p>
            </div>
            <Toggle
              checked={uiConfig.smoothStreamingAnimation || false}
              onChange={(checked) => updateUIConfig('smoothStreamingAnimation', checked)}
            />
          </div>
        </div>

        {/* Theme Mode */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-white/90">Application Theme</label>
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
            Choose the color theme for the assistant UI (chat, input, buttons)
          </p>
        </div>

        {/* Adaptive Settings - Only show when mode is ADAPTIVE */}
        {(uiConfig.backgroundDetection?.mode || BackgroundThemeModes.ADAPTIVE) === BackgroundThemeModes.ADAPTIVE && (
          <>
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-400/20 mb-3">
              <p className="text-xs text-blue-200/90 flex items-start gap-1.5">
                <Icon name="idea" size={14} className="text-blue-300 flex-shrink-0 mt-0.5" />
                <span><strong>Adaptive Mode:</strong> Automatically detects the page background color and adjusts the assistant's theme for optimal contrast and readability.</span>
              </p>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white/90">Detection Accuracy</label>
              <input
                type="number"
                min="3"
                max="10"
                value={uiConfig.backgroundDetection?.sampleGridSize || 5}
                onChange={(e) => updateUIConfig('backgroundDetection.sampleGridSize', parseInt(e.target.value))}
                className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
              />
              <p className="text-xs text-white/50">
                Sample grid size for background detection (3-10). Higher = more accurate. Default: 5
              </p>
            </div>
          </>
        )}
      </div>

      {/* AI Toolbar Settings */}
      <div className="space-y-2 border-t border-white/10 pt-4">
        <h4 className="text-sm font-semibold text-white mb-3">AI Toolbar</h4>
        
        {/* Enable AI Toolbar */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <label className="text-sm text-white font-medium">Enable AI Toolbar</label>
            <p className="text-xs text-white/50 mt-0.5">
              Show toolbar when selecting text with Summarize, Translate, and Add to Chat actions
            </p>
          </div>
          <Toggle
            checked={uiConfig.enableAIToolbar !== false}
            onChange={(checked) => updateUIConfig('enableAIToolbar', checked)}
          />
        </div>

        {/* Show on Input Focus */}
        {uiConfig.enableAIToolbar !== false && (
          <>
            <div className="flex items-center justify-between gap-3 mt-3">
              <div className="flex-1">
                <label className="text-sm text-white font-medium">Show on Input Focus</label>
                <p className="text-xs text-white/50 mt-0.5">
                  Automatically show toolbar with dictation when clicking on any text input field or editable area
                </p>
              </div>
              <Toggle
                checked={uiConfig.aiToolbar?.showOnInputFocus !== false}
                onChange={(checked) => updateUIConfig('aiToolbar.showOnInputFocus', checked)}
              />
            </div>

            {/* Show on Image Hover */}
            <div className="flex items-center justify-between gap-3 mt-3">
              <div className="flex-1">
                <label className="text-sm text-white font-medium">Show on Image Hover</label>
                <p className="text-xs text-white/50 mt-0.5">
                  Automatically show toolbar with image analysis actions when hovering over any image
                </p>
              </div>
              <Toggle
                checked={uiConfig.aiToolbar?.showOnImageHover !== false}
                onChange={(checked) => updateUIConfig('aiToolbar.showOnImageHover', checked)}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default UISettings;
