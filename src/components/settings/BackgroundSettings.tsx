/**
 * BackgroundSettings Component
 * Custom background image management for Android
 */

import { useState, useRef, useEffect } from "react";
import { cn } from "../../utils/cn";
import Icon from "../icons/Icon";
import Logger from "../../services/common/LoggerService";
import { backgroundStorageService } from "../../services/storage/BackgroundStorageService";
import Button from "../ui/Button";
import Toggle from "../common/Toggle";
import Input from "../ui/Input";
import SettingsRow from "../ui/SettingsRow";
import BackgroundSelectionControls from "../background/BackgroundSelectionControls";
import {
  useConfigUIActions,
  useUIConfig,
} from "../../hooks/config/useConfigUI";

interface BackgroundItem {
  id: string;
  name: string;
  isActive: boolean;
  mimeType: string | undefined;
  metadata: Record<string, unknown>;
  previewUrl: string | null;
}

interface UploadState {
  uploading: boolean;
  error: string | null;
}

interface BackgroundSettingsProps {
  isLightBackground?: boolean;
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

const BackgroundSettings = ({
  isLightBackground = false,
}: BackgroundSettingsProps) => {
  const uiConfig = useUIConfig();
  const { updateUIConfig } = useConfigUIActions();
  const slideshow = uiConfig.androidBackground;
  const builtInIds = slideshow.builtInIds;
  const [backgrounds, setBackgrounds] = useState<BackgroundItem[]>([]);
  const [uploadState, setUploadState] = useState<UploadState>({
    uploading: false,
    error: null,
  });
  const [activeBackgroundId, setActiveBackgroundId] = useState<string | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlsRef = useRef<string[]>([]);
  const loadRequestRef = useRef(0);

  useEffect(() => {
    loadBackgrounds();
    return () => {
      loadRequestRef.current += 1;
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const loadBackgrounds = async () => {
    const request = ++loadRequestRef.current;
    try {
      const list = await backgroundStorageService.getBackgroundsList();
      const urls = list.flatMap((background) =>
        background.previewUrl ? [background.previewUrl] : [],
      );
      if (request !== loadRequestRef.current) {
        urls.forEach((url) => URL.revokeObjectURL(url));
        return;
      }
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrlsRef.current = urls;
      setBackgrounds(list);
      const active = list.find((bg) => bg.isActive);
      setActiveBackgroundId(active?.id || null);
    } catch (error) {
      Logger.error("BackgroundSettings", "Failed to load backgrounds:", error);
    }
  };

  const handleUpload = async (file: File) => {
    if (!file) return;

    setUploadState({ uploading: true, error: null });

    try {
      await backgroundStorageService.saveBackground(file);
      updateUIConfig("androidBackground.enabled", true);
      await loadBackgrounds();
      window.dispatchEvent(new CustomEvent("backgroundChanged"));
      setUploadState({ uploading: false, error: null });
    } catch (error: unknown) {
      setUploadState({ uploading: false, error: getErrorMessage(error) });
    }
  };

  const handleSetActive = async (id: string) => {
    try {
      await backgroundStorageService.setActiveBackground(id);
      updateUIConfig("androidBackground.enabled", true);
      setActiveBackgroundId(id);
      await loadBackgrounds();
      window.dispatchEvent(new CustomEvent("backgroundChanged"));
    } catch (error) {
      Logger.error(
        "BackgroundSettings",
        "Failed to set active background:",
        error,
      );
    }
  };

  const handleSetBuiltInActive = async (id: string) => {
    try {
      await backgroundStorageService.clearActiveBackground();
      const nextIds = [id, ...builtInIds.filter((item) => item !== id)];
      updateUIConfig("androidBackground.builtInIds", nextIds);
      updateUIConfig("androidBackground.enabled", true);
      setActiveBackgroundId(null);
      await loadBackgrounds();
      window.dispatchEvent(new CustomEvent("backgroundChanged"));
    } catch (error) {
      Logger.error(
        "BackgroundSettings",
        "Failed to select built-in background:",
        error,
      );
    }
  };

  const handleClear = async () => {
    try {
      await backgroundStorageService.clearActiveBackground();
      setActiveBackgroundId(null);
      updateUIConfig("androidBackground.enabled", false);
      updateUIConfig("androidBackground.slideshowEnabled", false);
      await loadBackgrounds();
      window.dispatchEvent(new CustomEvent("backgroundChanged"));
    } catch (error) {
      Logger.error("BackgroundSettings", "Failed to clear background:", error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await backgroundStorageService.deleteBackground(id);
      if (activeBackgroundId === id) {
        setActiveBackgroundId(null);
      }
      await loadBackgrounds();
      window.dispatchEvent(new CustomEvent("backgroundChanged"));
    } catch (error) {
      Logger.error("BackgroundSettings", "Failed to delete background:", error);
    }
  };

  return (
    <div className="flex flex-col gap-4 border-t border-white/10 pt-4">
      <h4 className="text-sm font-semibold text-white">Background</h4>

      <p className="text-xs text-white/50">
        Built-in wallpapers are included with the app. Uploaded images stay on
        this device.
      </p>

      <BackgroundSelectionControls
        platform="android"
        enabled={slideshow.enabled}
        fill={slideshow}
        selectedIds={builtInIds}
        slideshowEnabled={slideshow.slideshowEnabled}
        showSlideshowToggle={backgrounds.length + builtInIds.length > 0}
        effects={slideshow}
        isLightBackground={isLightBackground}
        onEnabledChange={(enabled) =>
          updateUIConfig("androidBackground.enabled", enabled)
        }
        onFillChange={(fill) =>
          updateUIConfig("androidBackground", {
            ...slideshow,
            ...fill,
            enabled: true,
          })
        }
        onSelectedIdsChange={(ids) => {
          updateUIConfig("androidBackground.builtInIds", ids);
        }}
        onMakeDefault={handleSetBuiltInActive}
        onSlideshowChange={(enabled) =>
          updateUIConfig("androidBackground.slideshowEnabled", enabled)
        }
        onEffectsChange={(effects) =>
          updateUIConfig("androidBackground", { ...slideshow, ...effects })
        }
      />

      {slideshow.mode === "images" && (
        <>
      <h5 className="text-xs font-semibold text-white/85">Your images</h5>

      {/* Upload Button */}
      <div className="flex flex-col gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
            e.target.value = "";
          }}
          className="hidden"
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadState.uploading}
          className="flex w-full flex-col p-3 border-2 border-dashed border-white/20 hover:border-white/40 rounded-lg text-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Icon
            name="upload"
            size={24}
            className="mx-auto mb-1 text-white/70"
          />
          <p className="text-sm text-white/90">
            {uploadState.uploading ? "Uploading..." : "Upload Background Image"}
          </p>
          <p className="text-xs text-white/50">
            JPEG, PNG, WebP, GIF (max 10MB)
          </p>
        </button>

        {uploadState.error && (
          <div className="p-2 rounded-lg bg-red-500/10 border border-red-400/20">
            <p className="text-xs text-red-200">{uploadState.error}</p>
          </div>
        )}
      </div>

      {(backgrounds.length > 0 || builtInIds.length > 0) && (
        <SettingsRow
          label="Background parallax"
          description="Gently pan the background image."
        >
          <Toggle
            checked={slideshow.parallaxEnabled}
            isLightBackground={isLightBackground}
            onChange={(checked) =>
              updateUIConfig("androidBackground.parallaxEnabled", checked)
            }
          />
        </SettingsRow>
      )}

      {/* Clear Background Button */}
      {(slideshow.enabled ||
        activeBackgroundId ||
        slideshow.slideshowEnabled) && (
        <Button
          variant={isLightBackground ? "dark" : "default"}
          onClick={handleClear}
          className="w-full flex items-center justify-center gap-2"
        >
          <Icon name="x" size={14} />
          Clear Background
        </Button>
      )}

      {slideshow.slideshowEnabled &&
        backgrounds.length + builtInIds.length > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/5 p-3">
          <p className="text-xs font-medium text-white/80">Slideshow timing</p>
          <div className="flex flex-wrap gap-3">
              <label className="flex min-w-[120px] flex-1 flex-col gap-1 text-xs text-white/80">
                <span>Time per image (seconds)</span>
                <Input
                  type="number"
                  min={5}
                  max={3600}
                  step={5}
                  value={slideshow.slideshowIntervalSeconds}
                  onChange={(event) =>
                    updateUIConfig(
                      "androidBackground.slideshowIntervalSeconds",
                      Math.min(
                        3600,
                        Math.max(5, Number(event.target.value) || 30),
                      ),
                    )
                  }
                  variant={isLightBackground ? "dark" : "default"}
                  disableDebounce
                />
              </label>
              <label className="flex min-w-[120px] flex-1 flex-col gap-1 text-xs text-white/80">
                <span>Fade duration (seconds)</span>
                <Input
                  type="number"
                  min={0}
                  max={15}
                  step={0.5}
                  value={slideshow.fadeDurationSeconds}
                  onChange={(event) =>
                    updateUIConfig(
                      "androidBackground.fadeDurationSeconds",
                      Math.min(
                        15,
                        Math.max(0, Number(event.target.value) || 0),
                      ),
                    )
                  }
                  variant={isLightBackground ? "dark" : "default"}
                  disableDebounce
                />
              </label>
          </div>
        </div>
      )}

      {/* Background List */}
      {backgrounds.length > 0 && (
        <div className="flex max-h-[200px] flex-wrap gap-2 overflow-y-auto">
          {backgrounds.map((bg) => (
            <div
              key={bg.id}
              className={cn(
                "relative group w-[calc(33.333%_-_0.375rem)] overflow-hidden rounded-lg border-2 cursor-pointer transition-all",
                bg.isActive
                  ? "border-white/50 ring-2 ring-white/20"
                  : "border-transparent hover:border-white/30",
              )}
              onClick={() => handleSetActive(bg.id)}
            >
              <div className="aspect-video bg-white/5">
                {bg.previewUrl && (
                  <img
                    src={bg.previewUrl}
                    alt={bg.name}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>

              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1">
                <p className="text-[10px] text-white truncate">{bg.name}</p>
              </div>

              {bg.isActive && (
                <div className="absolute top-1 right-1 w-4 h-4 bg-white/30 backdrop-blur-sm rounded-full flex items-center justify-center">
                  <Icon name="check" size={10} className="text-white" />
                </div>
              )}

              <Button
                variant="unstyled"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(bg.id);
                }}
                className="absolute top-1 left-1 w-5 h-5 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                title="Delete"
              >
                <Icon name="trash-2" size={10} className="text-white" />
              </Button>
            </div>
          ))}
        </div>
      )}
        </>
      )}
    </div>
  );
};

export default BackgroundSettings;
