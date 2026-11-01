import type { ChangeEvent, RefObject } from "react";
import type { UIConfig } from "../../config/uiConfig";
import { BackgroundThemeModes, PositionPresets } from "../../config/uiConfig";
import Icon from "../icons/Icon";
import Toggle from "../common/Toggle";
import ShortcutsConfig from "../common/ShortcutsConfig";
import { Button, Input, Select, SettingsRow } from "../ui";
import BackgroundSettings from "./BackgroundSettings";
import DesktopBackgroundSettings from "./DesktopBackgroundSettings";
import type { BackupSelection } from "../../services/storage/AppDataBackupService";
import SettingsGroup from "./shared/SettingsGroup";

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

export const HelpSettings = ({
  isResetting,
  onResetSetup,
  isExtension,
  uiConfig,
  updateUIConfig,
}: DisplayTabProps) => (
  <div className="flex flex-col gap-4">
    <SettingsRow label="Documentation" description="Setup guides and help">
      <a
        href="https://docs-vassist.vercel.app/"
        target="_blank"
        rel="noopener noreferrer"
        className="vassist-ghost-button inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium"
      >
        Open <Icon name="arrow-top-right" size={14} />
      </a>
    </SettingsRow>

    <SettingsRow
      label="Setup wizard"
      description="Configure your assistant again"
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={onResetSetup}
        disabled={isResetting}
      >
        <Icon name="refresh" size={16} />
        {isResetting ? "Resetting..." : "Start"}
      </Button>
    </SettingsRow>

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
  </div>
);

export const DisplayTab = ({
  uiConfig,
  updateUIConfig,
  isLightBackground,
  isAndroid,
  isDesktop,
  allowPositionSelection,
}: DisplayTabProps) => (
  <div className="flex min-w-0 flex-col gap-4">
    {!uiConfig.enableModelLoading && allowPositionSelection && (
      <div className="flex flex-col gap-2">
        <h4 className="settings-group-heading">Chat Position</h4>
        <label className="block text-sm font-medium vassist-text-primary">
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

    <div className="flex flex-col gap-3">
      <SettingsGroup>
        <SettingsRow
          targetId="ui.appearance"
          label="Application theme"
          layout="stacked"
        >
          <Select
            value={
              uiConfig.backgroundDetection?.mode ||
              BackgroundThemeModes.ADAPTIVE
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
        </SettingsRow>
      </SettingsGroup>

      {(uiConfig.backgroundDetection?.mode || BackgroundThemeModes.ADAPTIVE) ===
        BackgroundThemeModes.ADAPTIVE && (
        <>
          <div className="rounded-lg border border-blue-400/20 bg-blue-500/10 p-3">
            <p className="flex items-start gap-1.5 text-xs text-blue-200/90">
              <Icon name="idea" size={14} className="pt-0.5 flex-shrink-0" />
              <span>
                <strong>Adaptive Mode:</strong> Automatically detects the page
                background and adjusts the assistant theme for contrast.
              </span>
            </p>
          </div>
          <SettingsRow
            label="Detection Accuracy"
            description="Sample grid size (3–10). Higher values are more accurate."
            layout="stacked"
          >
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
          </SettingsRow>
        </>
      )}
    </div>

    {isAndroid && <BackgroundSettings isLightBackground={isLightBackground} />}
    {isDesktop && (
      <DesktopBackgroundSettings isLightBackground={isLightBackground} />
    )}

    <SettingsGroup>
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
        <div className="pl-4 pt-2">
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
    </SettingsGroup>
  </div>
);

export interface ChatTabProps extends SharedProps {}

export const ChatTab = ({ uiConfig, updateUIConfig }: ChatTabProps) => (
  <div className="flex flex-col gap-4">
    <SettingsRow
      label="Fade chat messages"
      description="Show the latest message briefly. Open Chat options to show the full conversation."
    >
      <Toggle
        checked={uiConfig.fadeChatMessages === true}
        onChange={(checked) => updateUIConfig("fadeChatMessages", checked)}
      />
    </SettingsRow>
    <SettingsRow
      label="Animate response text"
      description="Gently reveal new words as the assistant responds."
    >
      <Toggle
        checked={uiConfig.animateStreamingText !== false}
        onChange={(checked) => updateUIConfig("animateStreamingText", checked)}
      />
    </SettingsRow>
    <div className="flex flex-col gap-2">
      <SettingsRow
        label="Smooth Response Animation"
        description={
          <>
            <span>
              Performance impact: smooth height animation may affect lower-end
              devices.
            </span>
          </>
        }
      >
        <Toggle
          checked={uiConfig.smoothStreamingAnimation || false}
          data-testid="toggle-smooth-streaming-animation"
          onChange={(checked) =>
            updateUIConfig("smoothStreamingAnimation", checked)
          }
        />
      </SettingsRow>
    </div>

    <SettingsRow
      label="Expand thinking"
      description="Open reasoning while a reply streams"
    >
      <Toggle
        data-testid="llm-thinking-autoexpand-toggle"
        checked={uiConfig.thinkingPanelAutoExpand === true}
        onChange={(checked) =>
          updateUIConfig("thinkingPanelAutoExpand", checked)
        }
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
  <div className="flex min-w-0 flex-col gap-4">
    <div className="flex flex-col gap-2">
      <h4 className="settings-group-heading">AI Toolbar</h4>
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
            className="pt-3"
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
            className="pt-3"
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
      <div className="flex flex-col gap-3">
        <h4 className="settings-group-heading">Keyboard Shortcuts</h4>
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
  <div className="flex min-w-0 flex-col gap-4">
    <div className="flex flex-col gap-3">
      <h4
        data-settings-target="ui.storage"
        className="settings-group-heading pb-1"
      >
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
        <div className="pl-4 flex flex-col gap-2">
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
        <p className="text-xs vassist-text-secondary">{backupStatus}</p>
      ) : null}
    </div>

    <div className="flex flex-col gap-2">
      <h4 className="settings-group-heading">
        <span data-settings-target="ui.developer">Developer</span>
      </h4>
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
