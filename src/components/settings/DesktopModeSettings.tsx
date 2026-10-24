import {
  useConfigUIActions,
  useUIConfig,
} from "../../hooks/config/useConfigUI";
import { useDesktopApi } from "../../hooks/useDesktopStore";
import { isDesktop } from "../../utils/PlatformUtils";
import Toggle from "../common/Toggle";
import { Select, SettingsRow } from "../ui";

interface DesktopModeSettingsProps {
  isLightBackground?: boolean;
  compact?: boolean;
}

const DesktopModeSettings = ({
  isLightBackground = false,
  compact = false,
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
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-white/80">Detached</span>
          <Toggle
            checked={placement === "detached"}
            isLightBackground={isLightBackground}
            aria-label="Detached controls"
            onChange={(checked) =>
              updateUIConfig(
                "desktopMode.controlPlacement",
                checked ? "detached" : "attached",
              )
            }
          />
        </div>
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

      <SettingsRow
        label="Controls"
        description="Keep controls in the main window or separate them"
      >
        <Toggle
          checked={placement === "detached"}
          isLightBackground={isLightBackground}
          aria-label="Detached controls"
          onChange={(checked) =>
            updateUIConfig(
              "desktopMode.controlPlacement",
              checked ? "detached" : "attached",
            )
          }
        />
      </SettingsRow>

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
    </div>
  );
};

export default DesktopModeSettings;
