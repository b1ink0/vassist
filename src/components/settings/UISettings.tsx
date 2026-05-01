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
import { useSetup } from '../../contexts/SetupContext';
import { useRef, useState, type ChangeEvent } from 'react';
import Icon from '../icons/Icon';
import Logger from '../../services/LoggerService';
import { isAndroid, isDesktop } from '../../utils/PlatformUtils';
import BackgroundSettings from './BackgroundSettings';
import appDataBackupService, { type BackupSelection } from '../../services/AppDataBackupService';
import { Button, Select, Input, Card, SettingsRow } from '../ui';

interface UISettingsProps {
  isLightBackground?: boolean;
  onRequestResetSetupDialog?: (onConfirm: () => Promise<void> | void) => void;
  onRequestSettingsErrorDialog?: (message: string) => void;
}

const DEFAULT_BACKUP_SELECTION: BackupSelection = {
  config: true,
  settings: true,
  data: true,
  chats: true,
  models: true,
  motions: true,
  emotes: true,
  stages: true,
  voices: true,
  backgrounds: true,
  otherFiles: true,
};

const UISettings = ({
  isLightBackground = false,
  onRequestResetSetupDialog,
  onRequestSettingsErrorDialog,
}: UISettingsProps) => {
  const {
    uiConfig,
    updateUIConfig,
  } = useConfig();

  const { resetSetup } = useSetup();
  const [isResetting, setIsResetting] = useState(false);
  const [useSelectiveBackup, setUseSelectiveBackup] = useState(false);
  const [backupSelection, setBackupSelection] = useState<BackupSelection>(DEFAULT_BACKUP_SELECTION);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupStatus, setBackupStatus] = useState('');
  const backupImportInputRef = useRef<HTMLInputElement | null>(null);
  const allowPositionSelection = !isAndroid && !isDesktop;

  const isExtensionMode = ExtensionBridge.isExtensionMode();

  const handleResetSetup = async () => {
    if (isResetting) return;

    try {
      setIsResetting(true);
      await resetSetup();
      window.location.reload();
    } catch (error) {
      Logger.error('other', 'Failed to reset setup:', error);
      onRequestSettingsErrorDialog?.('Failed to reset setup. Please try again.');
    } finally {
      setIsResetting(false);
    }
  };

  const getEffectiveBackupSelection = (): BackupSelection => {
    if (!useSelectiveBackup) {
      return DEFAULT_BACKUP_SELECTION;
    }
    return backupSelection;
  };

  const updateBackupSelection = (key: keyof BackupSelection, checked: boolean): void => {
    setBackupSelection((prev) => ({ ...prev, [key]: checked }));
  };

  const handleExportBackup = async (): Promise<void> => {
    if (backupBusy) {
      return;
    }

    try {
      setBackupBusy(true);
      setBackupStatus('Preparing backup...');
      const zipBlob = await appDataBackupService.exportToZip(getEffectiveBackupSelection());

      const url = URL.createObjectURL(zipBlob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `vassist-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      setBackupStatus('Backup exported successfully.');
    } catch (error) {
      Logger.error('UISettings', 'Backup export failed:', error);
      setBackupStatus('Backup export failed. Check logs for details.');
    } finally {
      setBackupBusy(false);
    }
  };

  const handleImportButtonClick = (): void => {
    if (backupBusy) {
      return;
    }
    backupImportInputRef.current?.click();
  };

  const handleImportBackup = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file || backupBusy) {
      return;
    }

    try {
      setBackupBusy(true);
      setBackupStatus('Importing backup...');
      await appDataBackupService.importFromZip(file, getEffectiveBackupSelection());
      setBackupStatus('Backup imported successfully. Reloading...');
      setTimeout(() => {
        window.location.reload();
      }, 600);
    } catch (error) {
      Logger.error('UISettings', 'Backup import failed:', error);
      setBackupStatus('Backup import failed. Ensure this is a valid vassist backup ZIP.');
      setBackupBusy(false);
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
          onClick={() => {
            if (onRequestResetSetupDialog) {
              onRequestResetSetupDialog(handleResetSetup);
            } else {
              void handleResetSetup();
            }
          }}
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

        <SettingsRow
          label="Show Emote Duration Bar"
          description={uiConfig.emotePlayback?.showDurationBar !== false
            ? 'Displays a playback scrub bar while an emote is active'
            : 'Hides the emote playback scrub bar'}
        >
          <Toggle
            checked={uiConfig.emotePlayback?.showDurationBar !== false}
            onChange={(checked) => updateUIConfig('emotePlayback.showDurationBar', checked)}
          />
        </SettingsRow>

        {uiConfig.emotePlayback?.showDurationBar !== false && (
          <div className="ml-4 mt-2">
            <SettingsRow
              label="Show Emote Time Labels"
              description={uiConfig.emotePlayback?.showTime !== false
                ? 'Shows current and total emote duration'
                : 'Shows only the progress bar without time labels'}
            >
              <Toggle
                checked={uiConfig.emotePlayback?.showTime !== false}
                onChange={(checked) => updateUIConfig('emotePlayback.showTime', checked)}
              />
            </SettingsRow>
          </div>
        )}

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
      <div className="space-y-3 border-t border-white/10 pt-4">
        <h4 className="text-sm font-semibold text-white mb-1">Backup & Restore</h4>

        <SettingsRow
          label="Selective Export/Import"
          description={useSelectiveBackup
            ? 'Choose specific data domains to export/import'
            : 'Export and import everything'}
        >
          <Toggle
            checked={useSelectiveBackup}
            onChange={(checked) => setUseSelectiveBackup(checked)}
          />
        </SettingsRow>

        {useSelectiveBackup && (
          <div className="ml-4 grid grid-cols-1 md:grid-cols-2 gap-2">
            <SettingsRow label="Config" description="UI/AI/TTS/STT config keys">
              <Toggle checked={backupSelection.config} onChange={(checked) => updateBackupSelection('config', checked)} />
            </SettingsRow>
            <SettingsRow label="Settings" description="App settings namespace">
              <Toggle checked={backupSelection.settings} onChange={(checked) => updateBackupSelection('settings', checked)} />
            </SettingsRow>
            <SettingsRow label="Data / Presets" description="Generic app data records">
              <Toggle checked={backupSelection.data} onChange={(checked) => updateBackupSelection('data', checked)} />
            </SettingsRow>
            <SettingsRow label="Chat History" description="Chats + media references">
              <Toggle checked={backupSelection.chats} onChange={(checked) => updateBackupSelection('chats', checked)} />
            </SettingsRow>
            <SettingsRow label="Models" description="Avatar model files">
              <Toggle checked={backupSelection.models} onChange={(checked) => updateBackupSelection('models', checked)} />
            </SettingsRow>
            <SettingsRow label="Motions" description="Animation motion files">
              <Toggle checked={backupSelection.motions} onChange={(checked) => updateBackupSelection('motions', checked)} />
            </SettingsRow>
            <SettingsRow label="Emotes" description="Audio + motion emote bundles">
              <Toggle checked={backupSelection.emotes} onChange={(checked) => updateBackupSelection('emotes', checked)} />
            </SettingsRow>
            <SettingsRow label="Stages" description="Stage model files">
              <Toggle checked={backupSelection.stages} onChange={(checked) => updateBackupSelection('stages', checked)} />
            </SettingsRow>
            <SettingsRow label="Voices" description="Saved reference voices">
              <Toggle checked={backupSelection.voices} onChange={(checked) => updateBackupSelection('voices', checked)} />
            </SettingsRow>
            <SettingsRow label="Backgrounds" description="Custom background assets">
              <Toggle checked={backupSelection.backgrounds} onChange={(checked) => updateBackupSelection('backgrounds', checked)} />
            </SettingsRow>
            <SettingsRow label="Other Files" description="Any remaining file records">
              <Toggle checked={backupSelection.otherFiles} onChange={(checked) => updateBackupSelection('otherFiles', checked)} />
            </SettingsRow>
          </div>
        )}

        <div className="flex justify-between gap-2 pt-2">
          <Button
            variant={isLightBackground ? 'dark' : 'default'}
            onClick={handleExportBackup}
            disabled={backupBusy}
            className="font-medium"
          >
            <Icon name="upload" size={16} />
            Export
          </Button>
          <Button
            variant={isLightBackground ? 'dark' : 'default'}
            onClick={handleImportButtonClick}
            disabled={backupBusy}
            className="font-medium"
          >
            <Icon name="download" size={16} />
            Import
          </Button>
          <input
            ref={backupImportInputRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={handleImportBackup}
          />
        </div>

        {backupStatus ? (
          <p className="text-xs text-white/70">{backupStatus}</p>
        ) : null}
      </div>

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

    </div>
  );
};

export default UISettings;
