/**
 * @fileoverview Draggable camera preview component
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import CameraService from '../services/CameraService';
import Logger from '../services/LoggerService';
import { Icon } from './icons';
import { isAndroid } from '../utils/PlatformUtils';

/**
 * Draggable camera preview component
 * Displays live camera feed in a draggable window
 */
const CameraPreview = () => {
  const [isActive, setIsActive] = useState(false);
  const [stream, setStream] = useState(null);
  const initialX = isAndroid ? window.innerWidth - 160 : window.innerWidth - 240;
  const [position, setPosition] = useState({ x: initialX, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const initialWidth = isAndroid ? 140 : 220;
  const initialHeight = isAndroid ? 105 : 165;
  const [dimensions, setDimensions] = useState({ width: initialWidth, height: initialHeight });
  const dragStartPos = useRef({ x: 0, y: 0 });
  const dragStartElementPos = useRef({ x: 0, y: 0 });
  const videoRef = useRef(null);
  const containerRef = useRef(null);

  // Subscribe to camera state
  useEffect(() => {
    const unsubscribe = CameraService.subscribe(({ isActive: active }) => {
      setIsActive(active);
      if (active) {
        const currentStream = CameraService.getStream();
        setStream(currentStream);
      } else {
        setStream(null);
      }
    });

    return unsubscribe;
  }, []);

  // Update video element when stream changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;

    video.srcObject = stream;
    
    const handleLoadedMetadata = () => {
      const aspectRatio = video.videoWidth / video.videoHeight;
      const previewWidth = isAndroid ? 140 : 220;
      const previewHeight = Math.round(previewWidth / aspectRatio);
      setDimensions({ width: previewWidth, height: previewHeight });
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.play().catch(err => {
      Logger.error('CameraPreview', 'Failed to play video:', err);
    });

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [stream]);

  const isDraggingRef = useRef(false);
  const positionRef = useRef(position);
  
  // Keep refs in sync
  useEffect(() => {
    isDraggingRef.current = isDragging;
    positionRef.current = position;
  }, [isDragging, position]);

  // Drag handlers for desktop
  const handleMouseDown = (e) => {
    if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
      return;
    }
    if (e.target.tagName === 'VIDEO') {
      e.preventDefault();
    }
    setIsDragging(true);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragStartElementPos.current = { ...position };
  };

  const handleMouseMove = useCallback((e) => {
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
  }, []);

  const handleMouseUp = useCallback(() => {
    if (isDraggingRef.current) {
      setIsDragging(false);
    }
  }, []);

  // Touch handlers for mobile
  const handleTouchStart = (e) => {
    if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
      return;
    }
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      setIsDragging(true);
      dragStartPos.current = { x: touch.clientX, y: touch.clientY };
      dragStartElementPos.current = { ...position };
    }
  };

  const handleTouchMove = useCallback((e) => {
    if (!isDraggingRef.current || e.touches.length !== 1) return;

    const touch = e.touches[0];
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
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (isDraggingRef.current) {
      setIsDragging(false);
    }
  }, []);

  const handleCycleCamera = async () => {
    const devices = CameraService.getDevices();
    if (devices.length <= 1) return;
    
    const currentDeviceId = CameraService.getSelectedDeviceId();
    const currentIndex = devices.findIndex(d => d.deviceId === currentDeviceId);
    const nextIndex = (currentIndex + 1) % devices.length;
    const nextDevice = devices[nextIndex];
    
    await CameraService.setSelectedDevice(nextDevice.deviceId);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove);
      window.addEventListener('touchend', handleTouchEnd);

      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('touchmove', handleTouchMove);
        window.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

  if (!isActive || !stream) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${dimensions.width}px`,
        height: `${dimensions.height}px`,
        zIndex: 10000,
        cursor: isDragging ? 'grabbing' : 'grab',
        touchAction: 'none',
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
        style={{ pointerEvents: 'none' }}
      />
      
      {/* Camera cycle button */}
      {CameraService.getDevices().length > 1 && (
        <button
          onClick={handleCycleCamera}
          className="absolute bottom-2 right-2"
        >
          <Icon name="refresh" size={14} className="text-white/80 hover:text-white" />
        </button>
      )}
    </div>
  );
};

export default CameraPreview;
