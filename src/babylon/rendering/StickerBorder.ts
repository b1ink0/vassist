import { Color3 } from "@babylonjs/core/Maths/math.color";
import { SelectionOutlineLayer } from "@babylonjs/core/Layers/selectionOutlineLayer";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import {
  DefaultStickerBorderSettings,
  StickerBorderControlLimits,
  type StickerBorderSettings,
} from "../../config/uiConfig";

export interface StickerBorderController {
  setSettings: (settings: StickerBorderSettings) => void;
  dispose: () => void;
}

const clampThickness = (value: number): number => {
  if (!Number.isFinite(value)) {
    return DefaultStickerBorderSettings.thickness;
  }

  return Math.min(
    StickerBorderControlLimits.thickness.max,
    Math.max(StickerBorderControlLimits.thickness.min, value),
  );
};

const clampSamples = (value: number): number => {
  if (!Number.isFinite(value)) {
    return DefaultStickerBorderSettings.samples;
  }

  return Math.min(
    StickerBorderControlLimits.samples.max,
    Math.max(StickerBorderControlLimits.samples.min, Math.round(value)),
  );
};

const clampRange = (
  value: number,
  limits: { min: number; max: number },
  fallback: number,
): number => {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(limits.max, Math.max(limits.min, value));
};

const parseColor = (value: string): Color3 => {
  try {
    return Color3.FromHexString(value);
  } catch {
    return Color3.FromHexString(DefaultStickerBorderSettings.color);
  }
};

/**
 * Creates a silhouette-only outline for the complete avatar mesh group.
 *
 * This intentionally uses SelectionOutlineLayer instead of the MMD material
 * outline flag. The selection layer renders the selected meshes into a mask
 * and outlines the group's visible screen-space boundary, so separate model
 * parts do not each receive their own geometry outline.
 */
export const createStickerBorderController = (
  scene: Scene,
  modelMeshes: Mesh[],
  initialSettings: StickerBorderSettings,
): StickerBorderController => {
  let layer: SelectionOutlineLayer | null = null;
  let settings = initialSettings;
  let selectionActive = false;

  const createLayer = (): SelectionOutlineLayer => {
    const nextLayer = new SelectionOutlineLayer("stickerBorder", scene, {
      mainTextureSamples: clampSamples(settings.samples),
    });

    nextLayer.outlineColor = parseColor(settings.color);
    nextLayer.outlineThickness = clampThickness(settings.thickness);

    // Keep the border on the visible silhouette instead of drawing through
    // model surfaces that are hidden from the active camera.
    nextLayer.occlusionStrength = clampRange(
      settings.occlusionStrength,
      StickerBorderControlLimits.occlusionStrength,
      DefaultStickerBorderSettings.occlusionStrength,
    );
    nextLayer.occlusionThreshold = clampRange(
      settings.occlusionThreshold,
      StickerBorderControlLimits.occlusionThreshold,
      DefaultStickerBorderSettings.occlusionThreshold,
    );

    return nextLayer;
  };

  const updateLayerSettings = (): void => {
    if (!layer) {
      return;
    }

    layer.outlineColor = parseColor(settings.color);
    layer.outlineThickness = clampThickness(settings.thickness);
    layer.occlusionStrength = clampRange(
      settings.occlusionStrength,
      StickerBorderControlLimits.occlusionStrength,
      DefaultStickerBorderSettings.occlusionStrength,
    );
    layer.occlusionThreshold = clampRange(
      settings.occlusionThreshold,
      StickerBorderControlLimits.occlusionThreshold,
      DefaultStickerBorderSettings.occlusionThreshold,
    );
  };

  const setSettings = (nextSettings: StickerBorderSettings): void => {
    const samplesChanged = settings.samples !== nextSettings.samples;
    settings = nextSettings;

    if (!settings.enabled) {
      layer?.clearSelection();
      selectionActive = false;
      return;
    }

    if (samplesChanged && layer) {
      layer.dispose();
      layer = null;
      selectionActive = false;
    }

    if (!layer) {
      layer = createLayer();
    }

    updateLayerSettings();

    if (!selectionActive) {
      layer.addSelection(modelMeshes);
      selectionActive = true;
    }
  };

  if (settings.enabled) {
    setSettings(settings);
  }

  return {
    setSettings,
    dispose: () => {
      layer?.dispose();
      layer = null;
      selectionActive = false;
    },
  };
};
