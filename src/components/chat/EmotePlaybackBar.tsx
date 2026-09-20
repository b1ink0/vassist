import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { cn } from "../../utils/cn";
import type { PositionPixels } from "../../babylon/types";
import { Button } from "../ui";
import { Icon } from "../icons";

interface EmotePlaybackBarProps {
  isVisible: boolean;
  progress: number;
  currentTime: number;
  duration: number;
  isPaused: boolean;
  showTime: boolean;
  isLightBackground: boolean;
  isAndroidPlatform: boolean;
  isChatOpen: boolean;
  modelAnchor: PositionPixels | null;
  onSeek: (progress: number) => void;
  onTogglePause?: () => void;
  onSeekStart?: () => void;
  onSeekEnd?: () => void;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0:00";
  }

  const wholeSeconds = Math.floor(seconds);
  const mins = Math.floor(wholeSeconds / 60);
  const secs = wholeSeconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
};

const EmotePlaybackBar = ({
  isVisible,
  progress,
  currentTime,
  duration,
  isPaused,
  showTime,
  isLightBackground,
  isAndroidPlatform,
  isChatOpen,
  modelAnchor,
  onSeek,
  onTogglePause,
  onSeekStart,
  onSeekEnd,
}: EmotePlaybackBarProps) => {
  const [viewport, setViewport] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 1280,
    height: typeof window !== "undefined" ? window.innerHeight : 720,
  });
  const trackHitRef = useRef<HTMLDivElement | null>(null);
  const seekRafRef = useRef<number | null>(null);
  const pendingSeekProgressRef = useRef(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [localProgress, setLocalProgress] = useState(0);

  const queueSeekUpdate = useCallback(
    (nextProgress: number): void => {
      pendingSeekProgressRef.current = nextProgress;

      if (seekRafRef.current !== null) {
        return;
      }

      seekRafRef.current = window.requestAnimationFrame(() => {
        seekRafRef.current = null;
        onSeek(pendingSeekProgressRef.current);
      });
    },
    [onSeek],
  );

  const clampedProgress = clamp(progress, 0, 1);

  useEffect(() => {
    if (!isSeeking) {
      setLocalProgress(clampedProgress);
    }
  }, [clampedProgress, isSeeking]);

  useEffect(() => {
    const handleResize = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

  useEffect(() => {
    if (!isSeeking) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const trackRect = trackHitRef.current?.getBoundingClientRect();
      if (!trackRect || trackRect.width <= 0) {
        return;
      }
      const normalized = clamp(
        (event.clientX - trackRect.left) / trackRect.width,
        0,
        1,
      );
      setLocalProgress(normalized);
      queueSeekUpdate(normalized);
    };

    const finishSeeking = () => {
      setIsSeeking(false);
      onSeekEnd?.();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishSeeking);
    window.addEventListener("pointercancel", finishSeeking);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishSeeking);
      window.removeEventListener("pointercancel", finishSeeking);

      if (seekRafRef.current !== null) {
        window.cancelAnimationFrame(seekRafRef.current);
        seekRafRef.current = null;
      }
    };
  }, [isSeeking, onSeekEnd, queueSeekUpdate]);

  const activeProgress = isSeeking ? localProgress : clampedProgress;
  const useDarkGlassVariant = isLightBackground;
  const isAndroidUi = isAndroidPlatform;
  const surfaceClass = cn(
    "glass-button",
    useDarkGlassVariant && "glass-button-dark",
  );
  const textClass = useDarkGlassVariant ? "glass-text" : "glass-text-black";
  const timeRowHeight = isAndroidUi ? "h-7" : "h-5";
  const timePillHeight = isAndroidUi ? "h-7" : "h-5";
  const pauseButtonSize = isAndroidUi ? "!h-9 !w-9" : "!h-7 !w-7";
  const pauseIconSize = isAndroidUi ? 18 : 14;

  const panelWidth = useMemo(() => {
    if (isAndroidPlatform) {
      return clamp(viewport.width * 0.6, 180, viewport.width - 20);
    }

    const targetWidth = modelAnchor ? modelAnchor.width * 0.72 : 240;
    return clamp(targetWidth, 170, 300);
  }, [isAndroidPlatform, modelAnchor, viewport.width]);

  const panelStyle = useMemo(() => {
    const top = isAndroidPlatform
      ? clamp(
          viewport.height - (isChatOpen ? 100 : 110),
          10,
          viewport.height - 76,
        )
      : clamp(
          modelAnchor
            ? modelAnchor.y + modelAnchor.height + 14
            : viewport.height - 94,
          10,
          viewport.height - 76,
        );

    const left = isAndroidPlatform
      ? clamp(
          (viewport.width - panelWidth) / 2,
          10,
          viewport.width - panelWidth - 10,
        )
      : clamp(
          (modelAnchor
            ? modelAnchor.x + modelAnchor.width / 2
            : viewport.width / 2) -
            panelWidth / 2,
          10,
          viewport.width - panelWidth - 10,
        );

    return {
      left: `${left}px`,
      top: `${top}px`,
      width: `${panelWidth}px`,
    };
  }, [
    isAndroidPlatform,
    isChatOpen,
    modelAnchor,
    panelWidth,
    viewport.height,
    viewport.width,
  ]);

  if (!isVisible || duration <= 0) {
    return null;
  }

  const progressPercent = `${activeProgress * 100}%`;

  const handleSeekEnd = () => {
    setIsSeeking(false);
    onSeekEnd?.();
  };

  const handleTrackPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const trackRect = trackHitRef.current?.getBoundingClientRect();
    if (!trackRect || trackRect.width <= 0) {
      return;
    }

    setIsSeeking(true);
    onSeekStart?.();

    const normalized = clamp(
      (event.clientX - trackRect.left) / trackRect.width,
      0,
      1,
    );
    setLocalProgress(normalized);
    queueSeekUpdate(normalized);
  };

  return (
    <div style={panelStyle} className="fixed z-[10020]">
      <div className="relative flex h-8 items-center">
        <div
          className={cn(
            "relative h-2 w-full overflow-visible rounded-full transition-all duration-120",
            surfaceClass,
            isSeeking && "scale-[1.01]",
          )}
        >
          <div
            style={{ width: progressPercent }}
            className={cn(
              "absolute left-0 top-0 h-full rounded-full",
              isSeeking ? "transition-none" : "transition-[width] duration-75",
              useDarkGlassVariant ? "bg-white/55" : "bg-white/74",
            )}
          />

          <div
            style={{ left: progressPercent }}
            className={cn(
              "absolute top-1/2 h-3 w-3 -translate-y-1/2 -translate-x-1/2 rounded-full border border-white bg-white shadow-lg transition-transform duration-120",
              isSeeking && "scale-150",
              useDarkGlassVariant ? "shadow-black/25" : "shadow-black/45",
            )}
          />

          <div
            ref={trackHitRef}
            onPointerDown={handleTrackPointerDown}
            onPointerUp={handleSeekEnd}
            className="absolute left-0 top-1/2 z-10 h-9 w-full -translate-y-1/2 cursor-ew-resize touch-none"
            role="slider"
            aria-label="Seek emote playback"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(activeProgress * 100)}
            tabIndex={0}
          />
        </div>
      </div>

      <div
        className={cn(
          "mt-2 grid grid-cols-3 items-center gap-2 font-medium leading-none",
          timeRowHeight,
          isAndroidUi ? "text-xs" : "text-[11px]",
          textClass,
        )}
      >
        <div className="flex justify-start">
          {showTime ? (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 leading-none",
                surfaceClass,
                timePillHeight,
              )}
            >
              {formatTime(isSeeking ? activeProgress * duration : currentTime)}
            </span>
          ) : null}
        </div>

        <div className="flex justify-center items-center">
          <Button
            onClick={onTogglePause}
            variant={useDarkGlassVariant ? "dark" : "default"}
            size="icon"
            className={cn(
              "shrink-0 rounded-full leading-none transition-all !p-0",
              pauseButtonSize,
              isSeeking && "scale-105",
            )}
            title={isPaused ? "Resume emote playback" : "Pause emote playback"}
            aria-label={
              isPaused ? "Resume emote playback" : "Pause emote playback"
            }
          >
            <Icon
              name={isPaused ? "play" : "pause"}
              size={pauseIconSize}
              className={cn(textClass, isPaused && "translate-x-[0.5px]")}
            />
          </Button>
        </div>

        <div className="flex justify-end">
          {showTime ? (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 leading-none",
                surfaceClass,
                timePillHeight,
              )}
            >
              {formatTime(duration)}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default EmotePlaybackBar;
