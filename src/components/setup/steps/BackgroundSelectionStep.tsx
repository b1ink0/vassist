import { StageSelectionControls } from "../../settings/StageSettings";
import { DefaultStageSettings } from "../../../config/stageConfig";
import { useSetup } from "../../../contexts/SetupContext";
import {
  DEFAULT_BACKGROUND_FILL_SETTINGS,
  DEFAULT_BACKGROUND_IMAGE_EFFECTS,
  type BackgroundFillSettings,
  type BackgroundImageEffects,
} from "../../../config/uiConfig";
import { DEFAULT_BUILT_IN_BACKGROUND_IDS } from "../../../config/backgroundCatalog";
import { isAndroid } from "../../../utils/PlatformUtils";
import BackgroundSelectionControls from "../../background/BackgroundSelectionControls";

interface BackgroundSelectionStepProps {
  isLightBackground?: boolean;
}

export default function BackgroundSelectionStep({
  isLightBackground = false,
}: BackgroundSelectionStepProps) {
  const { setupData, updateSetupData } = useSetup();
  const background = setupData.ui?.background;
  const selectedIds = Array.isArray(background?.builtInIds)
    ? background.builtInIds
    : DEFAULT_BUILT_IN_BACKGROUND_IDS;
  const enabled = background?.enabled !== false;
  const fill: BackgroundFillSettings = {
    mode: background?.mode ?? DEFAULT_BACKGROUND_FILL_SETTINGS.mode,
    solidColor:
      background?.solidColor ?? DEFAULT_BACKGROUND_FILL_SETTINGS.solidColor,
    gradientStartColor:
      background?.gradientStartColor ??
      DEFAULT_BACKGROUND_FILL_SETTINGS.gradientStartColor,
    gradientEndColor:
      background?.gradientEndColor ??
      DEFAULT_BACKGROUND_FILL_SETTINGS.gradientEndColor,
    gradientAngleDegrees:
      background?.gradientAngleDegrees ??
      DEFAULT_BACKGROUND_FILL_SETTINGS.gradientAngleDegrees,
  };
  const slideshowEnabled = isAndroid
    ? background?.androidSlideshowEnabled === true
    : background?.desktopSlideshowEnabled !== false;
  const effects: BackgroundImageEffects = {
    brightnessPercent:
      background?.brightnessPercent ??
      DEFAULT_BACKGROUND_IMAGE_EFFECTS.brightnessPercent,
    contrastPercent:
      background?.contrastPercent ??
      DEFAULT_BACKGROUND_IMAGE_EFFECTS.contrastPercent,
    saturationPercent:
      background?.saturationPercent ??
      DEFAULT_BACKGROUND_IMAGE_EFFECTS.saturationPercent,
    blurPixels:
      background?.blurPixels ?? DEFAULT_BACKGROUND_IMAGE_EFFECTS.blurPixels,
    grayscalePercent:
      background?.grayscalePercent ??
      DEFAULT_BACKGROUND_IMAGE_EFFECTS.grayscalePercent,
    sepiaPercent:
      background?.sepiaPercent ?? DEFAULT_BACKGROUND_IMAGE_EFFECTS.sepiaPercent,
    hueRotateDegrees:
      background?.hueRotateDegrees ??
      DEFAULT_BACKGROUND_IMAGE_EFFECTS.hueRotateDegrees,
  };

  return (
    <div className="flex flex-col gap-4 text-white">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Choose a background</h2>
        <p className="text-sm text-white/70">
          Choose an image, color, or gradient, or give your avatar a stage. Your
          background is kept for when the stage is off.
        </p>
      </div>

      {setupData.ui.enableModelLoading && (
        <StageSelectionControls
          saveCustomDefault={false}
          settings={setupData.ui.stage ?? DefaultStageSettings}
          onSettingsChange={(settings) =>
            void updateSetupData("ui.stage", settings)
          }
          parallaxEnabled={background?.parallaxEnabled !== false}
          shadowEnabled={setupData.ui.enableAvatarShadow !== false}
          onParallaxChange={(value) =>
            void updateSetupData("ui.background.parallaxEnabled", value)
          }
          onShadowChange={(value) =>
            void updateSetupData("ui.enableAvatarShadow", value)
          }
        />
      )}
      <BackgroundSelectionControls
        platform={isAndroid ? "android" : "desktop"}
        enabled={enabled}
        fill={fill}
        selectedIds={selectedIds}
        slideshowEnabled={slideshowEnabled}
        effects={effects}
        isLightBackground={isLightBackground}
        onEnabledChange={(checked) =>
          void updateSetupData("ui.background.enabled", checked)
        }
        onFillChange={(nextFill) =>
          void updateSetupData("ui.background", {
            ...background,
            ...nextFill,
            enabled: true,
          })
        }
        onSelectedIdsChange={(ids) =>
          void updateSetupData("ui.background.builtInIds", ids)
        }
        onSlideshowChange={(checked) =>
          void updateSetupData(
            isAndroid
              ? "ui.background.androidSlideshowEnabled"
              : "ui.background.desktopSlideshowEnabled",
            checked,
          )
        }
        onEffectsChange={(nextEffects) =>
          void updateSetupData("ui.background", {
            ...background,
            ...nextEffects,
          })
        }
      />

      <p className="text-xs text-white/55">
        You can change these later in Settings. Desktop floating mode keeps its
        clear background.
      </p>
    </div>
  );
}
