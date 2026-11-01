import {
  useConfigUIActions,
  useUIConfig,
} from "../../hooks/config/useConfigUI";
import { useDesktopApi } from "../../hooks/useDesktopStore";
import { isDesktop } from "../../utils/PlatformUtils";
import Toggle from "../common/Toggle";
import { Icon } from "../icons";
import { Select, SettingsRow } from "../ui";
import { XrSettings } from "./XrSettings";

interface DesktopModeSettingsProps {
  isLightBackground?: boolean;
  compact?: boolean;
  menu?: boolean;
}

const DesktopModeSettings = ({
  isLightBackground = false,
  compact = false,
  menu = false,
}: DesktopModeSettingsProps) => {
  const desktopAPI = useDesktopApi();
  const uiConfig = useUIConfig();
  const { updateUIConfig } = useConfigUIActions();

  if (!isDesktop || !desktopAPI?.window?.setDesktopMode) {
    return null;
  }

  const mode = uiConfig.desktopMode.mode;
  const interaction = uiConfig.desktopMode.liveWallpaper.interaction;
  const placement = uiConfig.desktopMode.controlPlacement;

  if (menu) {
    const menuVariant = isLightBackground ? "ghost-dark" : "ghost";
    return (
      <div className="min-w-40 flex flex-col gap-0.5">
        <Select
          value={mode}
          onChange={(event) =>
            updateUIConfig("desktopMode.mode", event.target.value)
          }
          variant={menuVariant}
          icon={<Icon name="desktop-mode" size={18} />}
          aria-label="Desktop mode"
          data-testid="chat-desktop-mode-select"
          options={[
            { value: "app", label: "App" },
            { value: "floating-app", label: "Floating" },
            { value: "live-wallpaper", label: "Wallpaper" },
          ]}
        />
        {mode !== "app" && (
          <Select
            value={placement}
            onChange={(event) =>
              updateUIConfig("desktopMode.controlPlacement", event.target.value)
            }
            variant={menuVariant}
            icon={<Icon name="chat" size={18} />}
            aria-label="Chat window placement"
            data-testid="chat-desktop-placement-select"
            options={[
              { value: "attached", label: "Attached" },
              { value: "detached", label: "Detached" },
            ]}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3">
        <h3 className="settings-group-heading">
          <Icon name="desktop-mode" size={14} />
          Desktop
        </h3>
        <div className="settings-control-group">
          <SettingsRow label="Mode" className="settings-control-row">
            <Select
              aria-label="Desktop mode"
              className="max-w-[11rem] text-right"
              value={mode}
              onChange={(event) =>
                updateUIConfig("desktopMode.mode", event.target.value)
              }
              variant={isLightBackground ? "ghost-dark" : "ghost"}
              options={[
                { value: "app", label: "App" },
                { value: "floating-app", label: "Floating" },
                { value: "live-wallpaper", label: "Wallpaper" },
              ]}
            />
          </SettingsRow>
          {mode !== "app" && (
            <SettingsRow
              label="Separate chat"
              description={
                compact ? "" : "Show chat and input separately from the avatar."
              }
              className="settings-control-row"
            >
              <Toggle
                checked={placement === "detached"}
                isLightBackground={isLightBackground}
                aria-label="Separate chat window"
                onChange={(checked) =>
                  updateUIConfig(
                    "desktopMode.controlPlacement",
                    checked ? "detached" : "attached",
                  )
                }
              />
            </SettingsRow>
          )}
          {mode === "live-wallpaper" && (
            <SettingsRow
              label="Interactive wallpaper"
              className="settings-control-row"
            >
              <Toggle
                checked={interaction === "interactive"}
                isLightBackground={isLightBackground}
                aria-label="Interactive wallpaper"
                onChange={(checked) =>
                  updateUIConfig(
                    "desktopMode.liveWallpaper.interaction",
                    checked ? "interactive" : "non-interactive",
                  )
                }
              />
            </SettingsRow>
          )}
        </div>
      </section>
      {!compact && <XrSettings isLightBackground={isLightBackground} />}
    </div>
  );
};

export default DesktopModeSettings;
