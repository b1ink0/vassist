import type {
  BackgroundFillSettings,
  BackgroundImageEffects,
} from "../../config/uiConfig";
import BackgroundEffectsControl from "./BackgroundEffectsControl";
import BackgroundFillControls from "./BackgroundFillControls";
import BuiltInBackgroundGallery from "./BuiltInBackgroundGallery";
import Toggle from "../common/Toggle";
import SettingsRow from "../ui/SettingsRow";

interface BackgroundSelectionControlsProps {
  platform: "android" | "desktop";
  enabled: boolean;
  selectedIds: string[];
  slideshowEnabled: boolean;
  showSlideshowToggle?: boolean;
  fill: BackgroundFillSettings;
  effects: BackgroundImageEffects;
  isLightBackground?: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onSelectedIdsChange: (ids: string[]) => void;
  onMakeDefault?: (id: string) => void;
  onSlideshowChange: (enabled: boolean) => void;
  onFillChange: (fill: BackgroundFillSettings) => void;
  onEffectsChange: (effects: BackgroundImageEffects) => void;
}

export default function BackgroundSelectionControls({
  platform,
  enabled,
  selectedIds,
  slideshowEnabled,
  showSlideshowToggle = true,
  fill,
  effects,
  isLightBackground = false,
  onEnabledChange,
  onSelectedIdsChange,
  onMakeDefault,
  onSlideshowChange,
  onFillChange,
  onEffectsChange,
}: BackgroundSelectionControlsProps) {
  const toggleBackground = (id: string) => {
    if (!slideshowEnabled) {
      onSelectedIdsChange([id]);
      onEnabledChange(true);
      return;
    }
    onSelectedIdsChange(
      selectedIds.includes(id)
        ? selectedIds.filter((selectedId) => selectedId !== id)
        : [...selectedIds, id],
    );
    onEnabledChange(true);
  };

  const toggleSlideshow = (nextEnabled: boolean) => {
    if (!nextEnabled && selectedIds.length > 1) {
      onSelectedIdsChange(selectedIds.slice(0, 1));
    }
    onSlideshowChange(nextEnabled);
  };

  const makeFirst = (id: string) => {
    if (onMakeDefault) {
      onMakeDefault(id);
      return;
    }
    onSelectedIdsChange([
      id,
      ...selectedIds.filter((selectedId) => selectedId !== id),
    ]);
    onEnabledChange(true);
  };

  return (
    <div className="flex flex-col gap-3">
      <SettingsRow
        label={platform === "desktop" ? "Show desktop background" : "Show background"}
        description={
          platform === "desktop"
            ? "Use the selected background in App and Wallpaper modes"
            : "Show the selected background in the app and live wallpaper"
        }
      >
        <Toggle
          checked={enabled}
          isLightBackground={isLightBackground}
          onChange={onEnabledChange}
        />
      </SettingsRow>

      <BackgroundFillControls
        fill={fill}
        isLightBackground={isLightBackground}
        onChange={onFillChange}
      />

      {fill.mode === "images" && (
        <>
          <BuiltInBackgroundGallery
            selectedIds={selectedIds}
            isLightBackground={isLightBackground}
            multipleSelection={slideshowEnabled}
            onToggle={toggleBackground}
            onMakeDefault={makeFirst}
          />
          {showSlideshowToggle && (
            <SettingsRow
              label="Background slideshow"
              description="Enable to select and fade between multiple images"
            >
              <Toggle
                checked={slideshowEnabled}
                isLightBackground={isLightBackground}
                onChange={toggleSlideshow}
                aria-label="Enable background slideshow"
              />
            </SettingsRow>
          )}
          <BackgroundEffectsControl
            effects={effects}
            isLightBackground={isLightBackground}
            onChange={onEffectsChange}
          />
        </>
      )}
    </div>
  );
}
