import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Popover } from "@base-ui/react/popover";
import { useSpatialHtmlPanelHost } from "../xr/SpatialHtmlPanelContext";

interface EmotePlaybackBarProps {
  isVisible: boolean;
  progress: number;
  currentTime: number;
  duration: number;
  showTime: boolean;
  onSeek: (progress: number) => void;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0:00";
  }

  const wholeSeconds = Math.floor(seconds);
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, "0")}`;
};

/** A single Reels-style seek line shared by every platform and desktop mode. */
const EmotePlaybackBar = ({
  isVisible,
  progress,
  currentTime,
  duration,
  showTime,
  onSeek,
}: EmotePlaybackBarProps) => {
  const spatialHost = useSpatialHtmlPanelHost();
  const trackHitRef = useRef<HTMLButtonElement | null>(null);
  const seekRafRef = useRef<number | null>(null);
  const pendingSeekProgressRef = useRef(0);
  const seekActiveRef = useRef(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [localProgress, setLocalProgress] = useState(0);
  const clampedProgress = clamp(progress, 0, 1);
  const activeProgress = isSeeking ? localProgress : clampedProgress;

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

  const getProgressFromPointer = useCallback((clientX: number): number => {
    const trackRect = trackHitRef.current?.getBoundingClientRect();
    if (!trackRect || trackRect.width <= 0) {
      return 0;
    }

    return clamp((clientX - trackRect.left) / trackRect.width, 0, 1);
  }, []);

  const finishSeeking = useCallback(() => {
    if (!seekActiveRef.current) {
      return;
    }

    seekActiveRef.current = false;
    setIsSeeking(false);
  }, []);

  useEffect(() => {
    if (!isSeeking) {
      setLocalProgress(clampedProgress);
    }
  }, [clampedProgress, isSeeking]);

  useEffect(() => {
    if (!isSeeking) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const nextProgress = getProgressFromPointer(event.clientX);
      setLocalProgress(nextProgress);
      queueSeekUpdate(nextProgress);
    };

    const target: EventTarget = spatialHost ?? window;
    const move = (event: Event) => handlePointerMove(event as PointerEvent);
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", finishSeeking);
    target.addEventListener("pointercancel", finishSeeking);

    return () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", finishSeeking);
      target.removeEventListener("pointercancel", finishSeeking);

      if (seekRafRef.current !== null) {
        window.cancelAnimationFrame(seekRafRef.current);
        seekRafRef.current = null;
      }
    };
  }, [
    finishSeeking,
    getProgressFromPointer,
    isSeeking,
    queueSeekUpdate,
    spatialHost,
  ]);

  if (!isVisible || duration <= 0) {
    return null;
  }

  const elapsedProgress = clamp(currentTime / duration, 0, 1);
  const effectiveProgress = Math.max(activeProgress, elapsedProgress);

  const handleTrackPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    seekActiveRef.current = true;
    setIsSeeking(true);
    if (!spatialHost) event.currentTarget.setPointerCapture?.(event.pointerId);

    const nextProgress = getProgressFromPointer(event.clientX);
    setLocalProgress(nextProgress);
    queueSeekUpdate(nextProgress);
  };

  return (
    <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-[10020] h-1.5">
      <div className="relative h-1.5 w-full overflow-visible rounded-sm">
        <div className="pointer-events-none absolute inset-0 z-10 bg-black/45 backdrop-blur-sm" />

        <div
          className="pointer-events-none absolute inset-y-0 left-0 z-20 rounded-sm bg-white/90"
          style={{ width: `${effectiveProgress * 100}%` }}
        />

        {showTime && (
          <Popover.Root>
            <Popover.Trigger
              type="button"
              openOnHover
              delay={0}
              closeDelay={80}
              ref={trackHitRef}
              onPointerDown={handleTrackPointerDown}
              aria-label="Seek emote playback"
              className="absolute -inset-y-3 left-0 z-30 m-0 block h-auto w-full cursor-ew-resize touch-none appearance-none border-0 bg-transparent p-0"
            />

            <Popover.Portal
              {...(spatialHost ? { container: spatialHost } : {})}
            >
              <Popover.Positioner
                side="top"
                sideOffset={8}
                className="z-[10030]"
              >
                <Popover.Popup className="glass-container pointer-events-none rounded-lg px-2 py-1 text-[11px] font-medium tabular-nums">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          </Popover.Root>
        )}

        {!showTime && (
          <button
            type="button"
            ref={trackHitRef}
            onPointerDown={handleTrackPointerDown}
            aria-label="Seek emote playback"
            className="absolute -inset-y-3 left-0 z-30 m-0 block h-auto w-full cursor-ew-resize touch-none appearance-none border-0 bg-transparent p-0"
          />
        )}
      </div>
    </div>
  );
};

export default EmotePlaybackBar;
