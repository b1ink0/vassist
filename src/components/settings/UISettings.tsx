/**
 * UISettings Component
 * UI configuration tab for SettingsPanel
 * Handles model loading, theme mode, chat position, and background detection settings
 */

import { useConfig } from '../../contexts/ConfigContext';
import { BackgroundThemeModes, PositionPresets } from '../../config/uiConfig';
import ExtensionBridge from '../../utils/ExtensionBridge';
import Toggle from '../common/Toggle';
import ShortcutsConfig from '../common/ShortcutsConfig';
import Dialog from '../common/Dialog';
import { useSetup } from '../../contexts/SetupContext';
import { useState } from 'react';
import Icon from '../icons/Icon';
import Logger from '../../services/LoggerService';
import { isAndroid, isDesktop } from '../../utils/PlatformUtils';
import BackgroundSettings from './BackgroundSettings';
import { Button, Select, Input, Card, SettingsRow } from '../ui';

interface UISettingsProps {
  isLightBackground?: boolean;
}

const UISettings = ({ isLightBackground = false }: UISettingsProps) => {
  const {
    uiConfig,
    updateUIConfig,
  } = useConfig();

  const { resetSetup } = useSetup();
  const [isResetting, setIsResetting] = useState(false);
  const [showResetConfirmDialog, setShowResetConfirmDialog] = useState(false);
  const [showResetErrorDialog, setShowResetErrorDialog] = useState(false);
  const [resetErrorDialogMessage, setResetErrorDialogMessage] = useState('');
  const allowPositionSelection = !isAndroid && !isDesktop;

  const isExtensionMode = ExtensionBridge.isExtensionMode();

  const handleResetSetup = async () => {
    if (isResetting) return;

    try {
      setIsResetting(true);
      setShowResetConfirmDialog(false);
      await resetSetup();
      window.location.reload();
    } catch (error) {
      Logger.error('other', 'Failed to reset setup:', error);
      setResetErrorDialogMessage('Failed to reset setup. Please try again.');
      setShowResetErrorDialog(true);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      <h3 className="text-base font-semibold text-white mb-4">UI Configuration</h3>
      
      {/* Documentation Link */}
      <div className="p-3 rounded-lg bg-white/10 border border-white/20">
        <div className="flex items-start gap-3">
          <Icon name="book" size={20} className="flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-white mb-1">Documentation</h4>
            <p className="text-xs text-white/70 mb-2">
              Need help? Check out the full documentation for setup guides, troubleshooting, and feature explanations.
            </p>
            <a
              href="https://b1ink0.github.io/vassist/docs/intro"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium transition-colors"
            >
              View Documentation
              <Icon name="arrow-top-right" size={14} />
            </a>
          </div>
        </div>
      </div>
      
      {/* Start Setup Again Button */}
      <Card variant="elevated">
        <Button
          variant="default"
          className="w-full font-semibold"
          onClick={() => setShowResetConfirmDialog(true)}
          disabled={isResetting}
        >
          <Icon name="refresh" size={16} />
          {isResetting ? 'Resetting...' : 'Start Setup Wizard Again'}
        </Button>
        <p className="text-xs">
          Re-run the initial setup wizard to reconfigure your assistant
        </p>
      </Card>
      
      {/* Auto-load on All Pages Toggle - Extension mode only */}
      {isExtensionMode && (
        <SettingsRow
          label="Auto-load on Every Page"
          description={uiConfig.autoLoadOnAllPages !== false
            ? 'Extension loads automatically on all pages'
            : 'Click extension icon to manually load on each page'}
        >
          <Toggle
            checked={uiConfig.autoLoadOnAllPages !== false}
            onChange={(checked) => updateUIConfig('autoLoadOnAllPages', checked)}
          />
        </SettingsRow>
      )}
      
      {/* Colored Icons Toggle */}
      <div className="space-y-2">
        <SettingsRow
          label="Use Colored Icons"
          description={uiConfig.enableColoredIcons ? 'Icons are displayed in color' : 'Icons are displayed in monochrome gray'}
        >
          <Toggle
            checked={uiConfig.enableColoredIcons || false}
            onChange={(checked) => updateUIConfig('enableColoredIcons', checked)}
          />
        </SettingsRow>

        {uiConfig.enableColoredIcons && (
          <div className="ml-4 mt-2">
            <SettingsRow
              label="Toolbar Only"
              description={uiConfig.enableColoredIconsToolbarOnly ? 'Colored icons only in AI toolbar' : 'Colored icons everywhere'}
            >
              <Toggle
                checked={uiConfig.enableColoredIconsToolbarOnly || false}
                onChange={(checked) => updateUIConfig('enableColoredIconsToolbarOnly', checked)}
              />
            </SettingsRow>
          </div>
        )}
      </div>

      {/* Chat Position - visible when avatar is disabled */}
      {!uiConfig.enableModelLoading && allowPositionSelection && (
        <div className="space-y-2 border-t border-white/10 pt-4">
          <h4 className="text-sm font-semibold text-white mb-3">Chat Position</h4>
          <label className="block text-sm font-medium text-white/90">Chat Window Position</label>
          <Select
            value={uiConfig.position?.preset || 'bottom-right'}
            onChange={(e) => updateUIConfig('position.preset', e.target.value)}
            variant={isLightBackground ? 'dark' : 'default'}
            options={[
              { value: 'last-location', label: 'Last Location (Remember Position)' },
              ...Object.entries(PositionPresets)
                .filter(([key]) => key !== 'last-location')
                .map(([key, preset]) => ({ value: key, label: preset.name })),
            ]}
          />
        </div>
      )}

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
          <Select
            value={uiConfig.backgroundDetection?.mode || BackgroundThemeModes.ADAPTIVE}
            onChange={(e) => updateUIConfig('backgroundDetection.mode', e.target.value)}
            variant={isLightBackground ? 'dark' : 'default'}
            options={Object.entries(BackgroundThemeModes).map(([key, value]) => ({ value, label: key.charAt(0) + key.slice(1).toLowerCase() }))}
          />
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
              <Input
                type="number"
                min="3"
                max="10"
                value={uiConfig.backgroundDetection?.sampleGridSize || 5}
                onChange={(e) => updateUIConfig('backgroundDetection.sampleGridSize', parseInt(e.target.value))}
                variant={isLightBackground ? 'dark' : 'default'}
              />
              <p className="text-xs text-white/50">
                Sample grid size for background detection (3-10). Higher = more accurate. Default: 5
              </p>
            </div>
          </>
        )}
      </div>

      {/* Custom Background Images - Android Only */}
      {isAndroid && (
        <BackgroundSettings isLightBackground={isLightBackground} />
      )}

      {/* AI Toolbar Settings */}
      <div className="space-y-2 border-t border-white/10 pt-4">
        <h4 className="text-sm font-semibold text-white mb-3">AI Toolbar</h4>
        
        <SettingsRow
          label="Enable AI Toolbar"
          description="Show toolbar when selecting text with Summarize, Translate, and Add to Chat actions"
        >
          <Toggle
            checked={uiConfig.enableAIToolbar !== false}
            onChange={(checked) => updateUIConfig('enableAIToolbar', checked)}
          />
        </SettingsRow>

        {uiConfig.enableAIToolbar !== false && (
          <>
            <SettingsRow
              className="mt-3"
              label="Show on Input Focus"
              description="Automatically show toolbar with dictation when clicking on any text input field or editable area"
            >
              <Toggle
                checked={uiConfig.aiToolbar?.showOnInputFocus !== false}
                onChange={(checked) => updateUIConfig('aiToolbar.showOnInputFocus', checked)}
              />
            </SettingsRow>

            <SettingsRow
              className="mt-3"
              label="Show on Image Hover"
              description="Automatically show toolbar with image analysis actions when hovering over any image"
            >
              <Toggle
                checked={uiConfig.aiToolbar?.showOnImageHover !== false}
                onChange={(checked) => updateUIConfig('aiToolbar.showOnImageHover', checked)}
              />
            </SettingsRow>
          </>
        )}
      </div>

      {/* Keyboard Shortcuts */}
      {!isAndroid ? (
        <div className="space-y-4 border-t border-white/10 pt-4">
          <h4 className="text-sm font-semibold text-white mb-3">Keyboard Shortcuts</h4>
          
          <ShortcutsConfig
            shortcuts={uiConfig.shortcuts || { enabled: false, openChat: '', toggleMode: '', toggleVisibility: '' }}
            onShortcutsChange={(shortcuts: { enabled: boolean; openChat: string; toggleMode: string; toggleVisibility: string }) => updateUIConfig('shortcuts', shortcuts)}
            isLightBackground={isLightBackground}
          />
        </div>
        ) : null
      }

      {/* Developer Options */}
      <div className="space-y-2 border-t border-white/10 pt-4">
        <h4 className="text-sm font-semibold text-white mb-3">Developer Options</h4>
        
        <SettingsRow label="Enable Developer Tools" description="Show draggable debug panel for testing animations and positions">
          <Toggle
            checked={uiConfig.enableDebugPanel || false}
            onChange={(checked) => updateUIConfig('enableDebugPanel', checked)}
          />
        </SettingsRow>
      </div>

      {showResetConfirmDialog && (
        <Dialog
          type="confirm"
          title="Reset Setup Wizard?"
          message="This will reset the setup wizard and take you back to the beginning."
          confirmLabel="Reset"
          confirmStyle="error"
          isLightBackground={isLightBackground}
          onConfirm={handleResetSetup}
          onCancel={() => setShowResetConfirmDialog(false)}
        />
      )}

      {showResetErrorDialog && (
        <Dialog
          type="confirm"
          title="Reset Failed"
          message={resetErrorDialogMessage}
          confirmLabel="OK"
          isLightBackground={isLightBackground}
          onConfirm={() => setShowResetErrorDialog(false)}
          onCancel={() => setShowResetErrorDialog(false)}
        />
      )}
    </div>
  );
};

export default UISettings;
