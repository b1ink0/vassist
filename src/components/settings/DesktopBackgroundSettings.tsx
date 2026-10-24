import { useEffect, useRef, useState } from "react";
import {
  useConfigUIActions,
  useUIConfig,
} from "../../hooks/config/useConfigUI";
import { useDesktopApi } from "../../hooks/useDesktopStore";
import Icon from "../icons/Icon";
import Toggle from "../common/Toggle";
import { Button, Input, SettingsRow } from "../ui";
import BackgroundSelectionControls from "../background/BackgroundSelectionControls";

type BackgroundImage = { path: string; name: string };
type ImageViewMode = "grid" | "list";

function CustomImageThumbnail({
  path,
  observerRoot,
}: {
  path: string;
  observerRoot: HTMLDivElement | null;
}) {
  const desktopAPI = useDesktopApi();
  const elementRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [preview, setPreview] = useState<string>();

  useEffect(() => {
    const element = elementRef.current;
    if (!element || shouldLoad) return;
    if (typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShouldLoad(Boolean(entry?.isIntersecting));
      },
      { root: observerRoot, rootMargin: "80px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [shouldLoad, observerRoot]);

  useEffect(() => {
    const api = desktopAPI?.desktopBackground;
    if (
      !shouldLoad ||
      typeof api?.readImagePreview !== "function"
    ) {
      setPreview(undefined);
      return;
    }
    let active = true;
    void api
      .readImagePreview(path)
      .then((result) => {
        if (active && result.success) setPreview(result.dataUrl);
      })
      .catch(() => {
        if (active) setPreview(undefined);
      });
    return () => {
      active = false;
    };
  }, [desktopAPI, path, shouldLoad]);

  return (
    <div
      ref={elementRef}
      className="flex h-full w-full items-center justify-center text-white/40"
    >
      {preview ? (
        <img
          src={preview}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        <Icon name="image" size={16} />
      )}
    </div>
  );
}

interface DesktopBackgroundSettingsProps {
  isLightBackground: boolean;
}

export default function DesktopBackgroundSettings({
  isLightBackground,
}: DesktopBackgroundSettingsProps) {
  const uiConfig = useUIConfig();
  const { updateUIConfig } = useConfigUIActions();
  const desktopAPI = useDesktopApi();
  const imageListRef = useRef<HTMLDivElement>(null);
  const background = uiConfig.desktopBackground;
  const [images, setImages] = useState<BackgroundImage[]>([]);
  const [imageViewMode, setImageViewMode] = useState<ImageViewMode>("grid");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const variant = isLightBackground ? "dark" : "default";
  const builtInIds = background.builtInIds;
  const totalImageCount =
    builtInIds.length +
    (background.folderPath ? images.length : background.imagePaths.length);

  useEffect(() => {
    let cancelled = false;
    const loadImages = async () => {
      if (background.folderPath) {
        const result = await desktopAPI?.desktopBackground?.listFolderImages(
          background.folderPath,
        );
        if (cancelled) return;
        if (result?.success) {
          setImages(result.images ?? []);
          setError("");
        } else {
          setImages([]);
          setError(result?.error || "The selected folder is unavailable.");
        }
        return;
      }
      setImages(
        background.imagePaths.map((path) => ({
          path,
          name: path.split(/[\\/]/).pop() ?? path,
        })),
      );
      setError("");
    };
    void loadImages();
    return () => {
      cancelled = true;
    };
  }, [background.folderPath, background.imagePaths, desktopAPI]);

  const handleChooseImages = async () => {
    const api = desktopAPI?.desktopBackground;
    if (!api || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api.chooseImages(background.slideshowEnabled);
      if (result.canceled) return;
      if (!result.success || !result.paths?.length) {
        setError(result.error || "No supported image files were selected.");
        return;
      }
      updateUIConfig("desktopBackground.folderPath", null);
      updateUIConfig("desktopBackground.imagePaths", result.paths);
      updateUIConfig("desktopBackground.enabled", true);
      setImages(
        result.paths.map((path) => ({
          path,
          name: path.split(/[\\/]/).pop() ?? path,
        })),
      );
      setMessage(
        `${result.paths.length} image${result.paths.length === 1 ? "" : "s"} selected`,
      );
    } catch (selectionError) {
      setError(
        selectionError instanceof Error
          ? selectionError.message
          : String(selectionError),
      );
    } finally {
      setBusy(false);
    }
  };

  const handleChooseFolder = async () => {
    const api = desktopAPI?.desktopBackground;
    if (!api || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api.chooseFolder();
      if (result.canceled) return;
      if (!result.success || !result.folderPath) {
        setError(result.error || "The folder could not be selected.");
        return;
      }
      const folderImages = result.images ?? [];
      updateUIConfig("desktopBackground.folderPath", result.folderPath);
      updateUIConfig("desktopBackground.enabled", true);
      updateUIConfig(
        "desktopBackground.imagePaths",
        folderImages.map((image) => image.path),
      );
      setImages(folderImages);
      setMessage(
        folderImages.length
          ? `${folderImages.length} images found in the folder`
          : "No supported images were found in this folder.",
      );
    } catch (selectionError) {
      setError(
        selectionError instanceof Error
          ? selectionError.message
          : String(selectionError),
      );
    } finally {
      setBusy(false);
    }
  };

  const handleRefreshFolder = async () => {
    const api = desktopAPI?.desktopBackground;
    if (!api || !background.folderPath || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api.listFolderImages(background.folderPath);
      if (!result.success) {
        setImages([]);
        setError(result.error || "The selected folder is unavailable.");
        return;
      }
      const folderImages = result.images ?? [];
      updateUIConfig(
        "desktopBackground.imagePaths",
        folderImages.map((image) => image.path),
      );
      setImages(folderImages);
      setMessage(`${folderImages.length} images found in the folder`);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : String(refreshError),
      );
    } finally {
      setBusy(false);
    }
  };

  const handleClear = () => {
    updateUIConfig("desktopBackground.builtInIds", []);
    updateUIConfig("desktopBackground.folderPath", null);
    updateUIConfig("desktopBackground.imagePaths", []);
    setImages([]);
    setMessage("");
    setError("");
  };

  return (
    <div className="flex flex-col gap-3 border-t border-white/10 pt-4">
      <h4 className="text-sm font-semibold text-white">Desktop Background</h4>
      <p className="text-xs text-white/55">
        App and Wallpaper modes show these images. Floating mode stays clear.
        Images remain in their original folder. Missing or unsupported files are
        skipped.
      </p>

      <BackgroundSelectionControls
        platform="desktop"
        enabled={background.enabled}
        fill={background}
        selectedIds={builtInIds}
        slideshowEnabled={background.slideshowEnabled}
        showSlideshowToggle={totalImageCount > 0}
        effects={background}
        isLightBackground={isLightBackground}
        onEnabledChange={(enabled) =>
          updateUIConfig("desktopBackground.enabled", enabled)
        }
        onFillChange={(fill) =>
          updateUIConfig("desktopBackground", {
            ...background,
            ...fill,
            enabled: true,
          })
        }
        onSelectedIdsChange={(ids) => {
          updateUIConfig("desktopBackground.builtInIds", ids);
        }}
        onMakeDefault={(id) => {
          updateUIConfig("desktopBackground.builtInIds", [
            id,
            ...builtInIds.filter((selectedId) => selectedId !== id),
          ]);
          updateUIConfig("desktopBackground.enabled", true);
        }}
        onSlideshowChange={(enabled) => {
          if (
            !enabled &&
            !background.folderPath &&
            background.imagePaths.length > 1
          ) {
            updateUIConfig(
              "desktopBackground.imagePaths",
              background.imagePaths.slice(0, 1),
            );
          }
          updateUIConfig("desktopBackground.slideshowEnabled", enabled);
        }}
        onEffectsChange={(effects) =>
          updateUIConfig("desktopBackground", { ...background, ...effects })
        }
      />

      {background.mode === "images" && (
        <>
      <SettingsRow
        label="Background parallax"
        description="Gently pan the image. The desktop app and interactive wallpaper also follow the mouse."
      >
        <Toggle
          checked={background.parallaxEnabled}
          isLightBackground={isLightBackground}
          onChange={(checked) =>
            updateUIConfig("desktopBackground.parallaxEnabled", checked)
          }
        />
      </SettingsRow>

      <div className="flex flex-wrap gap-2">
        <Button
          variant={variant}
          size="sm"
          onClick={() => void handleChooseImages()}
          disabled={busy || !desktopAPI?.desktopBackground}
        >
          <Icon name="image" size={15} />
          Choose Images
        </Button>
        <Button
          variant={variant}
          size="sm"
          onClick={() => void handleChooseFolder()}
          disabled={busy || !desktopAPI?.desktopBackground}
        >
          <Icon name="folder" size={15} />
          Choose Folder
        </Button>
      </div>

      {background.folderPath && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 p-2">
          <span
            className="min-w-0 truncate text-xs text-white/70"
            title={background.folderPath}
          >
            {background.folderPath}
          </span>
          <Button
            variant={variant}
            size="sm"
            onClick={() => void handleRefreshFolder()}
            disabled={busy}
          >
            Refresh
          </Button>
        </div>
      )}

      {images.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-medium text-white/80">
              Selected custom images ({images.length})
            </div>
            <div className="flex items-center gap-1 rounded-md border border-white/10 bg-black/15 p-0.5">
              {(["grid", "list"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={imageViewMode === mode}
                  onClick={() => setImageViewMode(mode)}
                  className={`rounded px-2 py-0.5 text-[10px] capitalize ${
                    imageViewMode === mode
                      ? "bg-white/15 text-white"
                      : "text-white/55 hover:text-white/85"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
          <div
            ref={imageListRef}
            className={`flex max-h-40 overflow-y-auto rounded-md border border-white/10 bg-black/15 p-1 ${
              imageViewMode === "grid"
                ? "flex-wrap content-start gap-1.5"
                : "flex-col gap-0.5"
            }`}
          >
            {images.map((image) => {
              const displayName = image.name?.trim() || image.path;
              return imageViewMode === "grid" ? (
                <div
                  key={image.path}
                  className="relative aspect-video min-w-[100px] flex-1 basis-[calc(33.333%_-_0.5rem)] overflow-hidden rounded border border-white/10 bg-white/5"
                  title={image.path}
                >
                  <CustomImageThumbnail
                    path={image.path}
                    observerRoot={imageListRef.current}
                  />
                  <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-1.5 pb-1 pt-4 text-[10px] text-white">
                    {displayName}
                  </span>
                </div>
              ) : (
                <div
                  key={image.path}
                  className="flex min-h-5 w-full min-w-0 items-center gap-1.5 rounded px-1 text-[11px] leading-4 text-white/90 hover:bg-white/10"
                  title={image.path}
                >
                  <Icon
                    name="image"
                    size={11}
                    className="shrink-0 text-white/70"
                  />
                  <span className="min-w-0 flex-1 truncate">{displayName}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(images.length > 0 ||
        background.folderPath ||
        builtInIds.length > 0) && (
        <Button
          variant="ghost"
          className="w-full"
          onClick={handleClear}
          disabled={busy}
        >
          Clear selected backgrounds
        </Button>
      )}

      {totalImageCount > 1 && (
        <div className="flex flex-wrap gap-3">
          <label className="flex min-w-[120px] flex-1 flex-col gap-1 text-xs text-white/80">
            <span>Time per image (seconds)</span>
            <Input
              type="number"
              min={5}
              max={3600}
              step={5}
              value={background.slideshowIntervalSeconds}
              onChange={(event) =>
                updateUIConfig(
                  "desktopBackground.slideshowIntervalSeconds",
                  Math.min(3600, Math.max(5, Number(event.target.value) || 30)),
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
              value={background.fadeDurationSeconds}
              onChange={(event) =>
                updateUIConfig(
                  "desktopBackground.fadeDurationSeconds",
                  Math.min(15, Math.max(0, Number(event.target.value) || 0)),
                )
              }
              variant={isLightBackground ? "dark" : "default"}
              disableDebounce
            />
          </label>
        </div>
      )}

      {message && <p className="text-xs text-white/60">{message}</p>}
      {error && <p className="text-xs text-red-300">{error}</p>}
        </>
      )}
    </div>
  );
}
