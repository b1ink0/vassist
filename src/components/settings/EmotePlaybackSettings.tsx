import {
  useUIConfig,
  useConfigUIActions,
} from "../../hooks/config/useConfigUI";
import { SettingsRow, Select } from "../ui";
import SettingsGroup from "./shared/SettingsGroup";
import Toggle from "../common/Toggle";
export default function EmotePlaybackSettings({
  isLightBackground,
}: {
  isLightBackground: boolean;
}) {
  const uiConfig = useUIConfig();
  const { updateUIConfig } = useConfigUIActions();
  return (
    <section className="flex flex-col gap-3">
      <h4 className="settings-group-heading">Playback</h4>
      <SettingsGroup>
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
          <>
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
          </>
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
      </SettingsGroup>
    </section>
  );
}
