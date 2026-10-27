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
  const variant = isLightBackground ? "dark" : "default";

  if (menu) {
    const menuVariant = isLightBackground ? "ghost-dark" : "ghost";
    return (
      <div className="min-w-40 space-y-0.5">
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

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-xs font-medium text-white/80">Mode</span>
          <Select
            className="min-w-[140px]"
            value={mode}
            onChange={(event) =>
              updateUIConfig("desktopMode.mode", event.target.value)
            }
            variant={variant}
            options={[
              { value: "app", label: "App" },
              { value: "floating-app", label: "Floating" },
              { value: "live-wallpaper", label: "Wallpaper" },
            ]}
          />
        </div>
        {mode !== "app" && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-white/80">
              Separate chat
            </span>
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
          </div>
        )}
        {mode === "live-wallpaper" && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-white/80">
              Interactive
            </span>
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
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-white">Mode</h3>
        <p className="mt-1 text-xs text-white/60">
          Choose how the desktop app is shown.
        </p>
      </div>

      <SettingsRow label="Mode">
        <Select
          className="min-w-[150px]"
          value={mode}
          onChange={(event) =>
            updateUIConfig("desktopMode.mode", event.target.value)
          }
          variant={variant}
          options={[
            { value: "app", label: "App" },
            { value: "floating-app", label: "Floating" },
            { value: "live-wallpaper", label: "Wallpaper" },
          ]}
        />
      </SettingsRow>

      {mode !== "app" && (
        <SettingsRow
          label="Separate chat window"
          description="Show chat and input separately from the avatar."
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
        <SettingsRow label={compact ? "Interactive" : "Interact"}>
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
      <XrSettings isLightBackground={isLightBackground} />
    </div>
  );
};

export default DesktopModeSettings;
