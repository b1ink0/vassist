/**
 * @fileoverview Draggable video preview component
 * Works with both camera and screen share
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";
import Logger from "../../services/LoggerService";
import { Icon } from "../icons";
import { isAndroid } from "../../utils/PlatformUtils";

interface VideoDevice {
  deviceId: string;
}

interface VideoServiceLike {
  subscribe: (
    callback: (state: { isActive: boolean }) => void,
  ) => (() => void) | void;
  getStream: () => MediaStream | null;
  getDevices?: () => VideoDevice[];
  getSelectedDeviceId?: () => string | null;
  setSelectedDevice?: (deviceId: string) => Promise<void>;
}

interface VideoPreviewProps {
  service: VideoServiceLike;
  type?: "camera" | "screen";
}

/**
 * Draggable video preview component
 * Displays live camera or screen share feed in a draggable window
 *
 * @param {Object} props
 * @param {Object} props.service - Video service (CameraService or ScreenShareService)
 * @param {string} props.type - Type of preview ('camera' or 'screen')
 */
const VideoPreview = ({ service, type = "camera" }: VideoPreviewProps) => {
  const [isActive, setIsActive] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);

  // Different sizes for camera vs screen share
  const getInitialDimensions = () => {
    if (type === "screen") {
      // Screen share is wider
      return {
        width: isAndroid ? 180 : 280,
        height: isAndroid ? 100 : 160,
      };
    } else {
      // Camera
      return {
        width: isAndroid ? 140 : 220,
        height: isAndroid ? 105 : 165,
      };
    }
  };

  const initialDims = getInitialDimensions();
  const initialX =
    type === "screen"
      ? isAndroid
        ? window.innerWidth - 200
        : window.innerWidth - 300
      : isAndroid
        ? window.innerWidth - 160
        : window.innerWidth - 240;

  const [position, setPosition] = useState({ x: initialX, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [dimensions, setDimensions] = useState(initialDims);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const dragStartElementPos = useRef({ x: 0, y: 0 });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Subscribe to service state
  useEffect(() => {
    if (!service) return;

    const unsubscribe = service.subscribe(({ isActive: active }) => {
      setIsActive(active);
      if (active) {
        const currentStream = service.getStream();
        setStream(currentStream);
      } else {
        setStream(null);
      }
    });

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [service]);

  // Update video element when stream changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;

    video.srcObject = stream;

    const handleLoadedMetadata = () => {
      const aspectRatio = video.videoWidth / video.videoHeight;

      // Calculate preview width based on type and platform
      let previewWidth;
      if (type === "screen") {
        previewWidth = isAndroid ? 180 : 280;
      } else {
        previewWidth = isAndroid ? 140 : 220;
      }

      const previewHeight = Math.round(previewWidth / aspectRatio);
      setDimensions({ width: previewWidth, height: previewHeight });
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.play().catch((err: unknown) => {
      Logger.error("VideoPreview", `Failed to play ${type} video:`, err);
    });

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, [stream, type]);

  const isDraggingRef = useRef(false);
  const positionRef = useRef(position);

  // Keep refs in sync
  useEffect(() => {
    isDraggingRef.current = isDragging;
    positionRef.current = position;
  }, [isDragging, position]);

  // Drag handlers for desktop
  const handleMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    const target = e.target instanceof HTMLElement ? e.target : null;
    if (!target) {
      return;
    }

    if (target.tagName === "BUTTON" || target.closest("button")) {
      return;
    }
    if (target.tagName === "VIDEO") {
      e.preventDefault();
    }
    setIsDragging(true);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragStartElementPos.current = { ...position };
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDraggingRef.current) return;

      const deltaX = e.clientX - dragStartPos.current.x;
      const deltaY = e.clientY - dragStartPos.current.y;

      let newX = dragStartElementPos.current.x + deltaX;
      let newY = dragStartElementPos.current.y + deltaY;

      // Keep within viewport bounds
      const maxX = window.innerWidth - dimensions.width;
      const maxY = window.innerHeight - dimensions.height;
      newX = Math.max(0, Math.min(newX, maxX));
      newY = Math.max(0, Math.min(newY, maxY));

      setPosition({ x: newX, y: newY });
    },
    [dimensions.width, dimensions.height],
  );

  const handleMouseUp = useCallback(() => {
    if (isDraggingRef.current) {
      setIsDragging(false);
    }
  }, []);

  // Touch handlers for mobile
  const handleTouchStart = (e: ReactTouchEvent<HTMLDivElement>) => {
    const target = e.target instanceof HTMLElement ? e.target : null;
    if (!target) {
      return;
    }

    if (target.tagName === "BUTTON" || target.closest("button")) {
      return;
    }
    if (e.touches.length === 1) {
      const touch = e.touches.item(0);
      if (!touch) {
        return;
      }
      setIsDragging(true);
      dragStartPos.current = { x: touch.clientX, y: touch.clientY };
      dragStartElementPos.current = { ...position };
    }
  };

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isDraggingRef.current || e.touches.length !== 1) return;

      const touch = e.touches.item(0);
      if (!touch) return;
      const deltaX = touch.clientX - dragStartPos.current.x;
      const deltaY = touch.clientY - dragStartPos.current.y;

      let newX = dragStartElementPos.current.x + deltaX;
      let newY = dragStartElementPos.current.y + deltaY;

      // Keep within viewport bounds
      const maxX = window.innerWidth - dimensions.width;
      const maxY = window.innerHeight - dimensions.height;
      newX = Math.max(0, Math.min(newX, maxX));
      newY = Math.max(0, Math.min(newY, maxY));

      setPosition({ x: newX, y: newY });
    },
    [dimensions.width, dimensions.height],
  );

  const handleTouchEnd = useCallback(() => {
    if (isDraggingRef.current) {
      setIsDragging(false);
    }
  }, []);

  // Camera cycle button handler (only for camera type)
  const handleCycleCamera = async () => {
    if (type !== "camera" || !service.getDevices) return;

    const devices = service.getDevices();
    if (devices.length <= 1) return;

    const currentDeviceId = service.getSelectedDeviceId?.() ?? null;
    const currentIndex = devices.findIndex(
      (d) => d.deviceId === currentDeviceId,
    );
    const nextIndex = (currentIndex + 1) % devices.length;
    const nextDevice = devices[nextIndex];

    if (nextDevice?.deviceId && service.setSelectedDevice) {
      await service.setSelectedDevice(nextDevice.deviceId);
    }
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      window.addEventListener("touchmove", handleTouchMove);
      window.addEventListener("touchend", handleTouchEnd);

      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
        window.removeEventListener("touchmove", handleTouchMove);
        window.removeEventListener("touchend", handleTouchEnd);
      };
    }
  }, [
    isDragging,
    handleMouseMove,
    handleMouseUp,
    handleTouchMove,
    handleTouchEnd,
  ]);

  if (!isActive || !stream) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      style={{
        position: "fixed",
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${dimensions.width}px`,
        height: `${dimensions.height}px`,
        zIndex: 10000,
        cursor: isDragging ? "grabbing" : "grab",
        touchAction: "none",
      }}
      className="rounded-xl overflow-hidden shadow-2xl backdrop-blur-md bg-black/30"
    >
      {/* Video preview */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
        style={{ pointerEvents: "none" }}
      />

      {/* Camera cycle button (only for camera) */}
      {type === "camera" &&
        service.getDevices &&
        service.getDevices().length > 1 && (
          <button
            onClick={handleCycleCamera}
            className="absolute bottom-2 right-2"
          >
            <Icon
              name="refresh"
              size={14}
              className="text-white/80 hover:text-white"
            />
          </button>
        )}
    </div>
  );
};

export default VideoPreview;
