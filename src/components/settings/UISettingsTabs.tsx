import type { ChangeEvent, RefObject } from "react";
import type { UIConfig } from "../../config/uiConfig";
import { BackgroundThemeModes, PositionPresets } from "../../config/uiConfig";
import Icon from "../icons/Icon";
import Toggle from "../common/Toggle";
import ShortcutsConfig from "../common/ShortcutsConfig";
import { Button, Card, Input, Select, SettingsRow } from "../ui";
import StageSettings from "./StageSettings";
import { canConfigureStages } from "../../babylon/stages/stageAvailability";
import BackgroundSettings from "./BackgroundSettings";
import DesktopBackgroundSettings from "./DesktopBackgroundSettings";
import type { BackupSelection } from "../../services/storage/AppDataBackupService";

export type UpdateUIConfig = (path: string, value: unknown) => void;

interface SharedProps {
  uiConfig: UIConfig;
  updateUIConfig: UpdateUIConfig;
  isLightBackground: boolean;
  isAndroid: boolean;
  isDesktop: boolean;
  isExtension: boolean;
  allowPositionSelection: boolean;
}

export interface DisplayTabProps extends SharedProps {
  isResetting: boolean;
  onResetSetup: () => void;
}

export const DisplayTab = ({
  uiConfig,
  updateUIConfig,
  isLightBackground,
  isAndroid,
  isDesktop,
  isExtension,
  allowPositionSelection,
  isResetting,
  onResetSetup,
}: DisplayTabProps) => (
  <div className="space-y-6">
    <div className="rounded-lg border border-white/20 bg-white/10 p-3">
      <div className="flex items-start gap-3">
        <Icon name="book" size={20} className="mt-0.5 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <h4 className="mb-1 text-sm font-semibold text-white">
            Documentation
          </h4>
          <p className="mb-2 text-xs text-white/70">
            Need help? Check out the full documentation for setup guides,
            troubleshooting, and feature explanations.
          </p>
          <a
            href="https://b1ink0.github.io/vassist/intro"
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

    <Card variant="elevated">
      <Button
        variant="default"
        className="w-full font-semibold"
        onClick={onResetSetup}
        disabled={isResetting}
      >
        <Icon name="refresh" size={16} />
        {isResetting ? "Resetting..." : "Start Setup Wizard Again"}
      </Button>
      <p className="text-xs">
        Re-run the initial setup wizard to reconfigure your assistant
      </p>
    </Card>

    {isExtension && (
      <SettingsRow
        label="Auto-load on Every Page"
        description={
          uiConfig.autoLoadOnAllPages !== false
            ? "Extension loads automatically on all pages"
            : "Click extension icon to manually load on each page"
        }
      >
        <Toggle
          checked={uiConfig.autoLoadOnAllPages !== false}
          onChange={(checked) => updateUIConfig("autoLoadOnAllPages", checked)}
        />
      </SettingsRow>
    )}

    <div className="space-y-2">
      <SettingsRow
        label="Use Colored Icons"
        description={
          uiConfig.enableColoredIcons
            ? "Icons are displayed in color"
            : "Icons are displayed in monochrome gray"
        }
      >
        <Toggle
          checked={uiConfig.enableColoredIcons || false}
          data-testid="toggle-use-colored-icons"
          onChange={(checked) => updateUIConfig("enableColoredIcons", checked)}
        />
      </SettingsRow>

      {uiConfig.enableColoredIcons && (
        <div className="ml-4 mt-2">
          <SettingsRow
            label="Toolbar Only"
            description={
              uiConfig.enableColoredIconsToolbarOnly
                ? "Colored icons only in AI toolbar"
                : "Colored icons everywhere"
            }
          >
            <Toggle
              checked={uiConfig.enableColoredIconsToolbarOnly || false}
              onChange={(checked) =>
                updateUIConfig("enableColoredIconsToolbarOnly", checked)
              }
            />
          </SettingsRow>
        </div>
      )}
    </div>

    {!uiConfig.enableModelLoading && allowPositionSelection && (
      <div className="space-y-2 border-t border-white/10 pt-4">
        <h4 className="mb-3 text-sm font-semibold text-white">Chat Position</h4>
        <label className="block text-sm font-medium text-white/90">
          Chat Window Position
        </label>
        <Select
          value={uiConfig.position?.preset || "bottom-right"}
          onChange={(event) =>
            updateUIConfig("position.preset", event.target.value)
          }
          variant={isLightBackground ? "dark" : "default"}
          options={[
            {
              value: "last-location",
              label: "Last Location (Remember Position)",
            },
            ...Object.entries(PositionPresets)
              .filter(([key]) => key !== "last-location")
              .map(([key, preset]) => ({ value: key, label: preset.name })),
          ]}
        />
      </div>
    )}

    <div className="space-y-4 border-t border-white/10 pt-4">
      <h4 className="mb-3 text-sm font-semibold text-white">Appearance</h4>
      <label className="block text-sm font-medium text-white/90">
        Application Theme
      </label>
      <Select
        value={
          uiConfig.backgroundDetection?.mode || BackgroundThemeModes.ADAPTIVE
        }
        onChange={(event) =>
          updateUIConfig("backgroundDetection.mode", event.target.value)
        }
        variant={isLightBackground ? "dark" : "default"}
        options={[
          { value: BackgroundThemeModes.ADAPTIVE, label: "Adaptive" },
          { value: "light", label: "Dark" },
          { value: "dark", label: "Light" },
        ]}
      />
      <p className="text-xs text-white/50">
        Choose the color theme for the assistant UI.
      </p>

      {(uiConfig.backgroundDetection?.mode || BackgroundThemeModes.ADAPTIVE) ===
        BackgroundThemeModes.ADAPTIVE && (
        <>
          <div className="rounded-lg border border-blue-400/20 bg-blue-500/10 p-3">
            <p className="flex items-start gap-1.5 text-xs text-blue-200/90">
              <Icon name="idea" size={14} className="mt-0.5 flex-shrink-0" />
              <span>
                <strong>Adaptive Mode:</strong> Automatically detects the page
                background and adjusts the assistant theme for contrast.
              </span>
            </p>
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/90">
              Detection Accuracy
            </label>
            <Input
              type="number"
              min="3"
              max="10"
              value={uiConfig.backgroundDetection?.sampleGridSize || 5}
              onChange={(event) =>
                updateUIConfig(
                  "backgroundDetection.sampleGridSize",
                  parseInt(event.target.value),
                )
              }
              variant={isLightBackground ? "dark" : "default"}
            />
            <p className="text-xs text-white/50">
              Sample grid size (3–10). Higher values are more accurate.
            </p>
          </div>
        </>
      )}
    </div>

    {canConfigureStages(uiConfig.desktopMode.mode) && <StageSettings />}
    {isAndroid && <BackgroundSettings isLightBackground={isLightBackground} />}
    {isDesktop && (
      <DesktopBackgroundSettings isLightBackground={isLightBackground} />
    )}
  </div>
);

export interface ChatTabProps extends SharedProps {}

export const ChatTab = ({
  uiConfig,
  updateUIConfig,
  isLightBackground,
}: ChatTabProps) => (
  <div className="space-y-4">
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1">
          <label className="text-sm font-medium text-white">
            Smooth Response Animation
          </label>
          <p className="mt-0.5 flex items-start gap-1.5 text-xs text-yellow-400/80">
            <Icon name="warning" size={14} className="mt-0.5 flex-shrink-0" />
            <span>
              Performance impact: smooth height animation may affect lower-end
              devices.
            </span>
          </p>
        </div>
        <Toggle
          checked={uiConfig.smoothStreamingAnimation || false}
          data-testid="toggle-smooth-streaming-animation"
          onChange={(checked) =>
            updateUIConfig("smoothStreamingAnimation", checked)
          }
        />
      </div>
    </div>

    <SettingsRow
      label="Show Emote Duration Bar"
      description={
        uiConfig.emotePlayback?.showDurationBar !== false
          ? "Displays a playback scrub bar while an emote is active"
          : "Hides the emote playback scrub bar"
      }
    >
      <Toggle
        checked={uiConfig.emotePlayback?.showDurationBar !== false}
        onChange={(checked) =>
          updateUIConfig("emotePlayback.showDurationBar", checked)
        }
      />
    </SettingsRow>

    {uiConfig.emotePlayback?.showDurationBar !== false && (
      <div className="ml-4 mt-2">
        <SettingsRow
          label="Show Emote Time Labels"
          description={
            uiConfig.emotePlayback?.showTime !== false
              ? "Shows playback time in the hover popover"
              : "Hides playback time from the hover popover"
          }
        >
          <Toggle
            checked={uiConfig.emotePlayback?.showTime !== false}
            onChange={(checked) =>
              updateUIConfig("emotePlayback.showTime", checked)
            }
          />
        </SettingsRow>
      </div>
    )}

    <SettingsRow
      label="Emote Button Progress"
      description="Choose where emote playback progress is displayed"
    >
      <Select
        value={uiConfig.emotePlayback?.buttonProgress || "none"}
        onChange={(event) =>
          updateUIConfig("emotePlayback.buttonProgress", event.target.value)
        }
        options={[
          { value: "none", label: "Bottom bar only" },
          { value: "ring", label: "Emotes button ring only" },
          { value: "both", label: "Bottom bar and button ring" },
        ]}
        variant={isLightBackground ? "dark" : "default"}
      />
    </SettingsRow>
  </div>
);

export const ToolsTab = ({
  uiConfig,
  updateUIConfig,
  isAndroid,
  isLightBackground,
}: SharedProps) => (
  <div className="space-y-6">
    <div className="space-y-2">
      <h4 className="mb-3 text-sm font-semibold text-white">AI Toolbar</h4>
      <SettingsRow
        targetId="ui.aiToolbar.enabled"
        label="Enable AI Toolbar"
        description="Show text and image actions such as Summarize and Translate"
      >
        <Toggle
          checked={uiConfig.enableAIToolbar !== false}
          onChange={(checked) => updateUIConfig("enableAIToolbar", checked)}
        />
      </SettingsRow>

      {uiConfig.enableAIToolbar !== false && (
        <>
          <SettingsRow
            targetId="ui.aiToolbar.showOnInputFocus"
            className="mt-3"
            label="Show on Input Focus"
            description="Show toolbar actions when focusing an editable field"
          >
            <Toggle
              checked={uiConfig.aiToolbar?.showOnInputFocus !== false}
              onChange={(checked) =>
                updateUIConfig("aiToolbar.showOnInputFocus", checked)
              }
            />
          </SettingsRow>
          <SettingsRow
            targetId="ui.aiToolbar.showOnImageHover"
            className="mt-3"
            label="Show on Image Hover"
            description="Show image analysis actions when hovering over images"
          >
            <Toggle
              checked={uiConfig.aiToolbar?.showOnImageHover !== false}
              onChange={(checked) =>
                updateUIConfig("aiToolbar.showOnImageHover", checked)
              }
            />
          </SettingsRow>
        </>
      )}
    </div>

    {!isAndroid && (
      <div className="space-y-4 border-t border-white/10 pt-4">
        <h4 className="mb-3 text-sm font-semibold text-white">
          Keyboard Shortcuts
        </h4>
        <ShortcutsConfig
          shortcuts={
            uiConfig.shortcuts || {
              enabled: false,
              openChat: "",
              toggleMode: "",
              toggleVisibility: "",
            }
          }
          onShortcutsChange={(shortcuts) =>
            updateUIConfig("shortcuts", shortcuts)
          }
          isLightBackground={isLightBackground}
        />
      </div>
    )}
  </div>
);

export interface MoreTabProps extends SharedProps {
  useSelectiveBackup: boolean;
  setUseSelectiveBackup: (checked: boolean) => void;
  backupSelection: BackupSelection;
  updateBackupSelection: (key: keyof BackupSelection, checked: boolean) => void;
  backupBusy: boolean;
  backupStatus: string;
  backupImportInputRef: RefObject<HTMLInputElement | null>;
  onExportBackup: () => void;
  onImportButtonClick: () => void;
  onImportBackup: (event: ChangeEvent<HTMLInputElement>) => void;
}

export const MoreTab = ({
  uiConfig,
  updateUIConfig,
  isDesktop,
  isLightBackground,
  useSelectiveBackup,
  setUseSelectiveBackup,
  backupSelection,
  updateBackupSelection,
  backupBusy,
  backupStatus,
  backupImportInputRef,
  onExportBackup,
  onImportButtonClick,
  onImportBackup,
}: MoreTabProps) => (
  <div className="space-y-6">
    <div className="space-y-3">
      <h4 className="mb-1 text-sm font-semibold text-white">
        Backup & Restore
      </h4>
      <SettingsRow
        label="Selective Export/Import"
        description={
          useSelectiveBackup
            ? "Choose specific data domains to export/import"
            : "Export and import everything"
        }
      >
        <Toggle checked={useSelectiveBackup} onChange={setUseSelectiveBackup} />
      </SettingsRow>

      {useSelectiveBackup && (
        <div className="ml-4 grid grid-cols-1 gap-2 md:grid-cols-2">
          {(
            [
              ["config", "Config", "UI/AI/TTS/STT config keys"],
              ["settings", "Settings", "App settings namespace"],
              ["data", "Data / Presets", "Generic app data records"],
              ["chats", "Chat History", "Chats + media references"],
              ["models", "Models", "Avatar model files"],
              ["motions", "Motions", "Animation motion files"],
              ["emotes", "Emotes", "Audio + motion emote bundles"],
              ["stages", "Stages", "Stage model files"],
              ["voices", "Voices", "Saved reference voices"],
              ["backgrounds", "Backgrounds", "Custom background assets"],
              ["otherFiles", "Other Files", "Any remaining file records"],
            ] as Array<[keyof BackupSelection, string, string]>
          ).map(([key, label, description]) => (
            <SettingsRow key={key} label={label} description={description}>
              <Toggle
                checked={backupSelection[key]}
                onChange={(checked) => updateBackupSelection(key, checked)}
              />
            </SettingsRow>
          ))}
        </div>
      )}

      <div className="flex justify-between gap-2 pt-2">
        <Button
          variant={isLightBackground ? "dark" : "default"}
          onClick={onExportBackup}
          disabled={backupBusy}
          className="font-medium"
        >
          <Icon name="upload" size={16} />
          Export
        </Button>
        <Button
          variant={isLightBackground ? "dark" : "default"}
          onClick={onImportButtonClick}
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
          onChange={onImportBackup}
        />
      </div>
      {backupStatus ? (
        <p className="text-xs text-white/70">{backupStatus}</p>
      ) : null}
    </div>

    <div className="space-y-2 border-t border-white/10 pt-4">
      <h4 className="mb-3 text-sm font-semibold text-white">Developer</h4>
      {isDesktop && (
        <SettingsRow
          label="Enable Native Electron DevTools"
          description={
            uiConfig.nativeDevTools
              ? "Open native Electron DevTools for all desktop windows"
              : "Keep native Electron DevTools closed"
          }
        >
          <Toggle
            checked={uiConfig.nativeDevTools || false}
            onChange={(checked) => updateUIConfig("nativeDevTools", checked)}
          />
        </SettingsRow>
      )}
      <SettingsRow
        label="Enable Developer Tools"
        description="Show draggable debug panel for testing animations and positions"
      >
        <Toggle
          checked={uiConfig.enableDebugPanel || false}
          onChange={(checked) => updateUIConfig("enableDebugPanel", checked)}
        />
      </SettingsRow>
    </div>
  </div>
);
