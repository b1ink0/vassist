/**
 * AndroidBackground Component
 * Shared background layer for Android app and live wallpaper
 */

import { useState, useEffect, useRef } from "react";
import { backgroundStorageService } from "../../services/storage/BackgroundStorageService";
import Logger from "../../services/common/LoggerService";
import { useUIConfig } from "../../hooks/config/useConfigUI";
import {
  getBackgroundFillCSS,
  getBackgroundImageFilter,
} from "../../config/uiConfig";
import {
  BUILT_IN_BACKGROUNDS,
  getBuiltInBackgroundPreviewUrl,
} from "../../config/backgroundCatalog";

type BackgroundImage = { id: string; url: string };
type BackgroundMotionBridge = { start: () => void; stop: () => void };

function AndroidBackground() {
  const { androidBackground } = useUIConfig();
  const [images, setImages] = useState<BackgroundImage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [nextIndex, setNextIndex] = useState<number | null>(null);
  const [isNextVisible, setIsNextVisible] = useState(false);
  const [backgroundRevision, setBackgroundRevision] = useState(0);
  const parallaxLayerRef = useRef<HTMLDivElement>(null);
  const currentImage = images[currentIndex];
  const hasBackground = Boolean(currentImage);
  const nextImage = nextIndex === null ? null : images[nextIndex];
  const imageFilter = getBackgroundImageFilter(androidBackground);

  useEffect(() => {
    const layer = parallaxLayerRef.current;
    const motionBridge = (
      window as Window & {
        VAssistBackgroundMotion?: BackgroundMotionBridge;
      }
    ).VAssistBackgroundMotion;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let targetX = 0;
    let targetY = 0;
    let renderedX = 0;
    let renderedY = 0;
    let previousFrameTime = 0;
    let animationFrame: number | null = null;

    const clearOffset = () => {
      layer?.style.setProperty("--background-sensor-x", "0%");
      layer?.style.setProperty("--background-sensor-y", "0%");
    };
    const animateOffset = (time: number) => {
      animationFrame = null;
      const elapsed = previousFrameTime ? time - previousFrameTime : 16;
      previousFrameTime = time;
      const smoothing = 1 - Math.exp(-elapsed / 75);
      renderedX += (targetX - renderedX) * smoothing;
      renderedY += (targetY - renderedY) * smoothing;
      layer?.style.setProperty("--background-sensor-x", `${renderedX}%`);
      layer?.style.setProperty("--background-sensor-y", `${renderedY}%`);

      if (
        Math.abs(targetX - renderedX) > 0.005 ||
        Math.abs(targetY - renderedY) > 0.005
      ) {
        animationFrame = window.requestAnimationFrame(animateOffset);
      } else {
        renderedX = targetX;
        renderedY = targetY;
        layer?.style.setProperty("--background-sensor-x", `${renderedX}%`);
        layer?.style.setProperty("--background-sensor-y", `${renderedY}%`);
        previousFrameTime = 0;
      }
    };
    const scheduleOffset = () => {
      if (animationFrame === null) {
        animationFrame = window.requestAnimationFrame(animateOffset);
      }
    };
    const handleTilt = (event: Event) => {
      const { x, y } = (event as CustomEvent<{ x: number; y: number }>).detail;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      targetX = Math.max(-1, Math.min(1, x)) * 2.2;
      targetY = Math.max(-1, Math.min(1, y)) * 2.2;
      scheduleOffset();
    };
    const updateMotion = () => {
      if (
        !layer ||
        !hasBackground ||
        !androidBackground.parallaxEnabled ||
        reducedMotion.matches
      ) {
        motionBridge?.stop();
        targetX = 0;
        targetY = 0;
        scheduleOffset();
        return;
      }
      motionBridge?.start();
    };

    window.addEventListener("vassist:background-tilt", handleTilt);
    reducedMotion.addEventListener("change", updateMotion);
    updateMotion();

    return () => {
      window.removeEventListener("vassist:background-tilt", handleTilt);
      reducedMotion.removeEventListener("change", updateMotion);
      motionBridge?.stop();
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
      clearOffset();
    };
  }, [androidBackground.parallaxEnabled, hasBackground]);

  useEffect(() => {
    const handleBackgroundChange = () =>
      setBackgroundRevision((revision) => revision + 1);
    window.addEventListener("backgroundChanged", handleBackgroundChange);
    return () =>
      window.removeEventListener("backgroundChanged", handleBackgroundChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let slideshowTimer: ReturnType<typeof setTimeout> | undefined;
    let fadeTimer: ReturnType<typeof setTimeout> | undefined;
    let frameId = 0;
    let imageUrls: string[] = [];

    const loadBackgrounds = async () => {
      try {
        if (
          !androidBackground.enabled ||
          androidBackground.mode !== "images"
        ) {
          setImages([]);
          return;
        }
        const backgrounds = await backgroundStorageService.getBackgroundsList();
        imageUrls = backgrounds
          .map((background) => background.previewUrl)
          .filter((url): url is string => url !== null);

        if (cancelled) {
          imageUrls.forEach((url) => URL.revokeObjectURL(url));
          return;
        }

        const activeIndex = backgrounds.findIndex(
          (background) => background.isActive && background.previewUrl,
        );
        const activeCustomId = backgrounds[activeIndex]?.id;
        const builtInImages = androidBackground.builtInIds.flatMap((id) => {
          const builtIn = BUILT_IN_BACKGROUNDS.find((item) => item.id === id);
          const url = getBuiltInBackgroundPreviewUrl(id);
          return builtIn && url ? [{ id: `builtin:${id}`, url }] : [];
        });
        const customImages = backgrounds.flatMap((background) =>
          background.previewUrl
            ? [{ id: background.id, url: background.previewUrl }]
            : [],
        );
        const allImages = [...builtInImages, ...customImages];
        const orderedBackgrounds = androidBackground.slideshowEnabled
          ? allImages
          : activeIndex >= 0
            ? customImages.filter(
                (background) => background.id === activeCustomId,
              )
            : builtInImages.slice(0, 1);
        const orderedImages = orderedBackgrounds;
        let startIndex = androidBackground.slideshowEnabled
          ? Math.max(
              0,
              orderedImages.findIndex(
                (background) =>
                  background.id ===
                  (activeCustomId ??
                    `builtin:${androidBackground.builtInIds[0]}`),
              ),
            )
          : 0;

        const canLoadImage = async (index: number) => {
          const image = orderedImages[index];
          if (!image) return false;
          try {
            const preload = new Image();
            preload.src = image.url;
            await preload.decode();
            return true;
          } catch {
            return false;
          }
        };

        let foundImage = false;
        for (let attempt = 0; attempt < orderedImages.length; attempt += 1) {
          if (await canLoadImage(startIndex)) {
            foundImage = true;
            break;
          }
          startIndex = (startIndex + 1) % orderedImages.length;
        }
        if (cancelled) return;
        if (!foundImage) {
          setImages([]);
          return;
        }

        setImages(orderedImages);
        setCurrentIndex(startIndex);
        setNextIndex(null);
        setIsNextVisible(false);

        if (!androidBackground.slideshowEnabled || orderedImages.length < 2)
          return;

        const intervalMs = androidBackground.slideshowIntervalSeconds * 1000;
        const fadeMs = androidBackground.fadeDurationSeconds * 1000;
        let activeImageIndex = startIndex;

        const scheduleNext = () => {
          slideshowTimer = setTimeout(async () => {
            if (cancelled) return;
            let followingIndex = activeImageIndex;
            let foundNextImage = false;
            for (
              let attempt = 0;
              attempt < orderedImages.length - 1;
              attempt += 1
            ) {
              followingIndex = (followingIndex + 1) % orderedImages.length;
              if (await canLoadImage(followingIndex)) {
                foundNextImage = true;
                break;
              }
            }
            if (cancelled) return;
            if (!foundNextImage) {
              scheduleNext();
              return;
            }
            setNextIndex(followingIndex);
            setIsNextVisible(false);
            frameId = window.requestAnimationFrame(() => {
              frameId = window.requestAnimationFrame(() => {
                if (cancelled) return;
                setIsNextVisible(true);
                fadeTimer = setTimeout(() => {
                  if (cancelled) return;
                  const previousImageIndex = activeImageIndex;
                  activeImageIndex = followingIndex;
                  setCurrentIndex(followingIndex);
                  setNextIndex(previousImageIndex);
                  setIsNextVisible(false);
                  scheduleNext();
                }, fadeMs);
              });
            });
          }, intervalMs);
        };

        scheduleNext();
      } catch (error) {
        Logger.error("AndroidBackground", "Failed to load background:", error);
      }
    };

    void loadBackgrounds();

    return () => {
      cancelled = true;
      if (slideshowTimer) clearTimeout(slideshowTimer);
      if (fadeTimer) clearTimeout(fadeTimer);
      window.cancelAnimationFrame(frameId);
      imageUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [
    androidBackground.enabled,
    androidBackground.mode,
    androidBackground.builtInIds,
    androidBackground.fadeDurationSeconds,
    androidBackground.slideshowEnabled,
    androidBackground.slideshowIntervalSeconds,
    backgroundRevision,
  ]);

  if (!androidBackground.enabled) return null;

  if (androidBackground.mode !== "images") {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[-1]"
        style={{ background: getBackgroundFillCSS(androidBackground) }}
      />
    );
  }

  if (!currentImage) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[-1] overflow-hidden"
    >
      <div
        className={
          androidBackground.parallaxEnabled
            ? "vassist-android-background-parallax-stage"
            : "absolute inset-0"
        }
      >
        <div ref={parallaxLayerRef} className="absolute inset-0">
          <img
            src={currentImage.url}
            alt=""
            className={`absolute inset-0 h-full w-full object-cover ${
              androidBackground.parallaxEnabled
                ? "vassist-background-parallax-sensor-image"
                : ""
            }`}
            style={{ opacity: 1, filter: imageFilter }}
          />
          {nextImage && (
            <img
              src={nextImage.url}
              alt=""
              className={`absolute inset-0 h-full w-full object-cover ${
                androidBackground.parallaxEnabled
                  ? "vassist-background-parallax-sensor-image"
                  : ""
              }`}
              style={{
                opacity: isNextVisible ? 1 : 0,
                filter: imageFilter,
                transition: `opacity ${androidBackground.fadeDurationSeconds}s ease-in-out`,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default AndroidBackground;
