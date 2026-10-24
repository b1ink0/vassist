import { useEffect, useRef, useState } from "react";
import { useUIConfig } from "../../hooks/config/useConfigUI";
import { useDesktopApi } from "../../hooks/useDesktopStore";
import { useStageSurface } from "../../hooks/app/useStageSurface";
import { getStageSurfaceActive } from "../../babylon/stages/stageSurfaceState";
import { BUILT_IN_BACKGROUNDS } from "../../config/backgroundCatalog";
import {
  getBackgroundFillCSS,
  getBackgroundImageFilter,
} from "../../config/uiConfig";
import {
  isAppModeWindow,
  isInteractiveLiveWallpaperWindow,
  isDesktopWallpaperRendererWindow,
} from "../../utils/PlatformUtils";

type BackgroundImage = { path: string; name: string };

export default function DesktopBackground() {
  const uiConfig = useUIConfig();
  const desktopAPI = useDesktopApi();
  const stageActive = useStageSurface();
  const background = uiConfig.desktopBackground;
  const isBackgroundMode = isAppModeWindow || isDesktopWallpaperRendererWindow;
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [nextImage, setNextImage] = useState<string | null>(null);
  const [isNextVisible, setIsNextVisible] = useState(false);
  const backgroundRef = useRef<HTMLDivElement>(null);
  const canFollowPointer = isAppModeWindow || isInteractiveLiveWallpaperWindow;

  useEffect(() => {
    const element = backgroundRef.current;
    if (!background.parallaxEnabled || !canFollowPointer) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) return;
    if (!stageActive && (background.mode !== "images" || !element)) return;

    let frameId = 0;
    let pointerX = 0;
    let pointerY = 0;
    const updatePosition = () => {
      frameId = 0;
      if (getStageSurfaceActive()) {
        window.dispatchEvent(
          new CustomEvent("vassist:stage-parallax", {
            detail: { x: pointerX, y: pointerY },
          }),
        );
        return;
      }
      if (!element) return;
      element.style.setProperty("--background-pointer-x", `${pointerX}%`);
      element.style.setProperty("--background-pointer-y", `${pointerY}%`);
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      pointerX = ((event.clientX / window.innerWidth) * 2 - 1) * -1.1;
      pointerY = ((event.clientY / window.innerHeight) * 2 - 1) * -1.1;
      if (!frameId) frameId = window.requestAnimationFrame(updatePosition);
    };
    const resetPosition = () => {
      pointerX = 0;
      pointerY = 0;
      if (!frameId) frameId = window.requestAnimationFrame(updatePosition);
    };
    const handleMotionPreferenceChange = () => {
      if (reducedMotion.matches) resetPosition();
    };

    window.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    window.addEventListener("pointerleave", resetPosition);
    window.addEventListener("blur", resetPosition);
    reducedMotion.addEventListener("change", handleMotionPreferenceChange);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerleave", resetPosition);
      window.removeEventListener("blur", resetPosition);
      reducedMotion.removeEventListener("change", handleMotionPreferenceChange);
      if (frameId) window.cancelAnimationFrame(frameId);
      element?.style.removeProperty("--background-pointer-x");
      element?.style.removeProperty("--background-pointer-y");
      if (stageActive) {
        window.dispatchEvent(
          new CustomEvent("vassist:stage-parallax", { detail: { x: 0, y: 0 } }),
        );
      }
    };
  }, [
    background.enabled,
    background.mode,
    background.parallaxEnabled,
    canFollowPointer,
    stageActive,
  ]);

  useEffect(() => {
    const api = desktopAPI?.desktopBackground;
    let cancelled = false;
    let slideshowTimer: ReturnType<typeof setTimeout> | undefined;
    let fadeTimer: ReturnType<typeof setTimeout> | undefined;
    let frameId = 0;

    setCurrentImage(null);
    setNextImage(null);
    setIsNextVisible(false);

    if (
      !background.enabled ||
      background.mode !== "images" ||
      !isBackgroundMode ||
      !api
    )
      return;

    const loadImages = async (): Promise<BackgroundImage[]> => {
      try {
        const builtInImages = background.builtInIds.flatMap((id) => {
          const builtIn = BUILT_IN_BACKGROUNDS.find((item) => item.id === id);
          return builtIn
            ? [{ path: `builtin:${id}`, name: builtIn.title }]
            : [];
        });
        let customImages: BackgroundImage[] = [];
        if (background.folderPath) {
          const result = await api.listFolderImages(background.folderPath);
          if (!result.success) return builtInImages;
          customImages = result.images ?? [];
        } else {
          customImages = background.imagePaths
            .filter((imagePath) => typeof imagePath === "string")
            .map((imagePath) => ({
              path: imagePath,
              name: imagePath.split(/[\\/]/).pop() ?? imagePath,
            }));
        }
        return [...builtInImages, ...customImages];
      } catch {
        return [];
      }
    };

    const runSlideshow = async () => {
      const images = await loadImages();
      if (cancelled || images.length === 0) return;

      const loadAt = async (index: number) => {
        const image = images[index];
        if (!image) return null;
        try {
          const result = await api.readImage(image.path);
          if (!result.success || !result.dataUrl) return null;
          const preload = new Image();
          preload.src = result.dataUrl;
          await preload.decode();
          return result.dataUrl;
        } catch {
          return null;
        }
      };

      let activeIndex = -1;
      let activeImageUrl: string | null = null;
      for (let index = 0; index < images.length; index += 1) {
        const dataUrl = await loadAt(index);
        if (cancelled) return;
        if (!dataUrl) continue;
        activeIndex = index;
        activeImageUrl = dataUrl;
        setCurrentImage(dataUrl);
        break;
      }

      if (activeIndex < 0 || images.length < 2 || !background.slideshowEnabled)
        return;

      const intervalSeconds = Number.isFinite(
        background.slideshowIntervalSeconds,
      )
        ? Math.min(3600, Math.max(5, background.slideshowIntervalSeconds))
        : 30;
      const fadeSeconds = Number.isFinite(background.fadeDurationSeconds)
        ? Math.min(15, Math.max(0, background.fadeDurationSeconds))
        : 2;
      const intervalMs = intervalSeconds * 1000;
      const fadeMs = fadeSeconds * 1000;

      const scheduleNext = () => {
        slideshowTimer = setTimeout(async () => {
          if (getStageSurfaceActive()) {
            scheduleNext();
            return;
          }
          let nextIndex = activeIndex;
          let dataUrl: string | null = null;
          for (let attempt = 0; attempt < images.length - 1; attempt += 1) {
            nextIndex = (nextIndex + 1) % images.length;
            dataUrl = await loadAt(nextIndex);
            if (cancelled) return;
            if (dataUrl) break;
          }

          if (getStageSurfaceActive()) {
            scheduleNext();
            return;
          }
          if (!dataUrl) {
            scheduleNext();
            return;
          }
          const incomingImageUrl = dataUrl;

          setNextImage(incomingImageUrl);
          setIsNextVisible(false);
          frameId = window.requestAnimationFrame(() => {
            frameId = window.requestAnimationFrame(() => {
              if (cancelled) return;
              setIsNextVisible(true);
              fadeTimer = setTimeout(() => {
                if (cancelled) return;
                const previousImageUrl = activeImageUrl;
                activeIndex = nextIndex;
                activeImageUrl = incomingImageUrl;
                setCurrentImage(incomingImageUrl);
                setNextImage(previousImageUrl);
                setIsNextVisible(false);
                scheduleNext();
              }, fadeMs);
            });
          });
        }, intervalMs);
      };

      scheduleNext();
    };

    void runSlideshow();

    return () => {
      cancelled = true;
      if (slideshowTimer) clearTimeout(slideshowTimer);
      if (fadeTimer) clearTimeout(fadeTimer);
      window.cancelAnimationFrame(frameId);
    };
  }, [
    background.enabled,
    background.mode,
    background.builtInIds,
    background.fadeDurationSeconds,
    background.folderPath,
    background.imagePaths,
    background.slideshowEnabled,
    background.slideshowIntervalSeconds,
    desktopAPI,
    isBackgroundMode,
  ]);

  if (!background.enabled || !isBackgroundMode) return null;

  if (background.mode !== "images") {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
        style={{ background: getBackgroundFillCSS(background) }}
      />
    );
  }

  const fadeDuration = `${Math.min(15, Math.max(0, background.fadeDurationSeconds))}s`;
  const imageFilter = getBackgroundImageFilter(background);

  return (
    <div
      ref={backgroundRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      <div
        className={
          background.parallaxEnabled && !stageActive
            ? "vassist-background-parallax-drift"
            : "absolute inset-0"
        }
      >
        <div
          className={
            background.parallaxEnabled && !stageActive
              ? "vassist-background-parallax-pointer"
              : "absolute inset-0"
          }
        >
          {currentImage && (
            <img
              src={currentImage}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              style={{
                opacity: 1,
                filter: imageFilter,
                transition: `opacity ${fadeDuration} ease-in-out`,
              }}
            />
          )}
          {nextImage && (
            <img
              src={nextImage}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              style={{
                opacity: isNextVisible ? 1 : 0,
                filter: imageFilter,
                transition: `opacity ${fadeDuration} ease-in-out`,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
