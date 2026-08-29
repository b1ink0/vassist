/**
 * CameraService - Manages camera access and frame capture
 *
 * Provides camera device enumeration, stream management, and frame capture.
 * Registers with FrameCaptureService as a provider.
 */

import Logger from "./LoggerService";
import FrameCaptureService from "./FrameCaptureService";

type CameraState = {
  devices: MediaDeviceInfo[];
  selectedDeviceId: string | null;
  isActive: boolean;
};

class CameraService {
  name: string;
  type: string;
  private devices: MediaDeviceInfo[];
  private selectedDeviceId: string | null;
  private stream: MediaStream | null;
  private isActive: boolean;
  private listeners: Set<(state: CameraState) => void>;
  private permissionGranted: boolean;
  private isInitializing: boolean;
  private isInitialized: boolean;
  private captureVideo: HTMLVideoElement | null;
  private captureCanvas: HTMLCanvasElement | null;

  constructor() {
    this.name = "CameraService";
    this.type = "camera";
    this.devices = [];
    this.selectedDeviceId = null;
    this.stream = null;
    this.isActive = false;
    this.listeners = new Set();
    this.permissionGranted = false;
    this.isInitializing = false;
    this.isInitialized = false;

    // Reusable elements for frame capture
    this.captureVideo = null;
    this.captureCanvas = null;
  }

  /**
   * Request camera permission and enumerate devices
   * @returns {Promise<MediaDeviceInfo[]>}
   */
  async initialize(): Promise<MediaDeviceInfo[]> {
    if (this.isInitialized) {
      Logger.log("CameraService", "Already initialized, skipping");
      return this.devices;
    }

    if (this.isInitializing) {
      Logger.warn(
        "CameraService",
        "Initialization already in progress, skipping",
      );
      return this.devices;
    }

    try {
      this.isInitializing = true;
      Logger.log("CameraService", "Initializing camera service...");

      // Request camera permission
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());

      this.permissionGranted = true;
      this.isInitialized = true;

      await this.refreshDevices();

      navigator.mediaDevices.addEventListener("devicechange", () => {
        Logger.log("CameraService", "Device change detected");
        this.refreshDevices();
      });

      Logger.log(
        "CameraService",
        "Initialized successfully with",
        this.devices.length,
        "cameras",
      );
      return this.devices;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      Logger.error(
        "CameraService",
        `Failed to initialize: ${err.name}: ${err.message}`,
      );
      throw err;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Refresh list of available video input devices
   * @returns {Promise<MediaDeviceInfo[]>}
   */
  async refreshDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.devices = devices.filter(
        (device: MediaDeviceInfo) => device.kind === "videoinput",
      );
      Logger.log("CameraService", `Found ${this.devices.length} cameras`);

      if (
        this.selectedDeviceId &&
        !this.devices.find(
          (d: MediaDeviceInfo) => d.deviceId === this.selectedDeviceId,
        )
      ) {
        Logger.warn(
          "CameraService",
          "Selected camera no longer available, resetting to default",
        );
        this.selectedDeviceId = null;
      }

      this.notifyListeners();

      return this.devices;
    } catch (error) {
      Logger.error("CameraService", "Failed to enumerate devices:", error);
      return [];
    }
  }

  /**
   * Get list of available cameras
   * @returns {MediaDeviceInfo[]}
   */
  getDevices(): MediaDeviceInfo[] {
    return this.devices;
  }

  /**
   * Select camera by deviceId
   * @param {string|null} deviceId - Device ID or null for default
   */
  async setSelectedDevice(deviceId: string | null): Promise<void> {
    const actualDeviceId = deviceId === "" ? null : deviceId;
    Logger.log("CameraService", "Selected camera:", actualDeviceId);

    const previousDeviceId = this.selectedDeviceId;
    this.selectedDeviceId = actualDeviceId;

    // If camera is active, restart with new device
    if (this.isActive && previousDeviceId !== actualDeviceId) {
      Logger.log("CameraService", "Camera active, switching to new device...");
      await this.stop();
      await this.start();
    } else {
      this.notifyListeners();
    }
  }

  /**
   * Get currently selected device ID
   * @returns {string|null}
   */
  getSelectedDeviceId(): string | null {
    return this.selectedDeviceId;
  }

  /**
   * Start camera stream
   * @returns {Promise<MediaStream>}
   */
  async start(): Promise<MediaStream | null> {
    try {
      if (this.isActive) {
        Logger.warn("CameraService", "Camera already active");
        return this.stream;
      }

      if (this.stream) {
        Logger.warn(
          "CameraService",
          "Stopping existing stream before starting new one",
        );
        this.stream
          .getTracks()
          .forEach((track: MediaStreamTrack) => track.stop());
        this.stream = null;
      }

      await this.refreshDevices();

      if (this.selectedDeviceId) {
        const deviceExists = this.devices.find(
          (d: MediaDeviceInfo) => d.deviceId === this.selectedDeviceId,
        );
        if (!deviceExists) {
          Logger.warn(
            "CameraService",
            "Selected device not found, falling back to default",
          );
          this.selectedDeviceId = null;
        }
      }

      const constraints = {
        video: this.selectedDeviceId
          ? { deviceId: { exact: this.selectedDeviceId } }
          : true,
        audio: false,
      };

      if (this.selectedDeviceId) {
        Logger.log(
          "CameraService",
          "Using selected device:",
          this.selectedDeviceId,
        );
      } else {
        Logger.log("CameraService", "Using default camera");
      }

      // Get media stream
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);

      // Log actual resolution
      const videoTrack = this.stream.getVideoTracks()[0];
      if (videoTrack) {
        const settings = videoTrack.getSettings();
        Logger.log(
          "CameraService",
          "Camera started at:",
          `${settings.width}x${settings.height}`,
        );
      }

      this.isActive = true;

      // Register with FrameCaptureService
      FrameCaptureService.registerProvider(this);

      Logger.log("CameraService", "Camera started successfully");
      this.notifyListeners();

      return this.stream;
    } catch (error) {
      Logger.error("CameraService", "Failed to start camera:", error);
      this.isActive = false;
      this.notifyListeners();
      throw error;
    }
  }

  /**
   * Stop camera stream
   */
  async stop(): Promise<void> {
    try {
      if (!this.isActive) {
        Logger.warn("CameraService", "Camera not active");
        return;
      }

      if (this.stream) {
        this.stream
          .getTracks()
          .forEach((track: MediaStreamTrack) => track.stop());
        this.stream = null;
      }

      if (this.captureVideo) {
        this.captureVideo.pause();
        this.captureVideo.srcObject = null;
        this.captureVideo = null;
      }
      if (this.captureCanvas) {
        this.captureCanvas.width = 0;
        this.captureCanvas.height = 0;
        this.captureCanvas = null;
      }

      this.isActive = false;

      FrameCaptureService.unregisterProvider();

      Logger.log("CameraService", "Camera stopped");
      this.notifyListeners();
    } catch (error) {
      Logger.error("CameraService", "Error stopping camera:", error);
    }
  }

  /**
   * Check if camera is active
   * @returns {boolean}
   */
  isRunning(): boolean {
    return this.isActive;
  }

  /**
   * Capture current frame as data URL (for FrameCaptureService)
   * Uses full resolution from MediaStream, not preview video
   * @returns {Promise<string|null>}
   */
  async captureFrame(): Promise<string | null> {
    if (!this.isActive || !this.stream) {
      Logger.warn("CameraService", "Camera not active, cannot capture frame");
      return null;
    }

    try {
      // Get video track settings to determine native resolution
      const videoTrack = this.stream.getVideoTracks()[0];
      if (!videoTrack) {
        Logger.error("CameraService", "No video track available");
        return null;
      }

      const settings = videoTrack.getSettings();
      const width = settings.width || 1280;
      const height = settings.height || 720;

      // Create reusable video element if needed
      if (!this.captureVideo) {
        this.captureVideo = document.createElement("video");
        this.captureVideo.muted = true;
        this.captureVideo.playsInline = true;
      }

      // Update video source if changed
      if (this.captureVideo.srcObject !== this.stream) {
        this.captureVideo.srcObject = this.stream;
        const captureVideo = this.captureVideo;
        if (!captureVideo) {
          return null;
        }

        // Wait for video to be ready
        await new Promise<void>((resolve, reject) => {
          captureVideo.onloadedmetadata = () => resolve();
          captureVideo.onerror = () =>
            reject(new Error("Failed to load camera metadata"));
          captureVideo.play().catch(reject);
        });
      }

      // Create or resize canvas if needed
      const targetWidth = this.captureVideo.videoWidth || width;
      const targetHeight = this.captureVideo.videoHeight || height;

      if (
        !this.captureCanvas ||
        this.captureCanvas.width !== targetWidth ||
        this.captureCanvas.height !== targetHeight
      ) {
        if (!this.captureCanvas) {
          this.captureCanvas = document.createElement("canvas");
        }

        this.captureCanvas.width = targetWidth;
        this.captureCanvas.height = targetHeight;
      }

      const ctx = this.captureCanvas.getContext("2d");
      if (!ctx) {
        Logger.error("CameraService", "Failed to get 2D canvas context");
        return null;
      }
      ctx.drawImage(
        this.captureVideo,
        0,
        0,
        this.captureCanvas.width,
        this.captureCanvas.height,
      );

      const dataUrl = this.captureCanvas.toDataURL("image/jpeg", 0.85);

      Logger.log(
        "CameraService",
        "Frame captured at full resolution:",
        `${this.captureCanvas.width}x${this.captureCanvas.height}`,
      );

      return dataUrl;
    } catch (error) {
      Logger.error("CameraService", "Failed to capture frame:", error);
      return null;
    }
  }

  /**
   * Get current video stream (for preview)
   * @returns {MediaStream|null}
   */
  getStream(): MediaStream | null {
    return this.stream;
  }

  /**
   * Subscribe to state changes
   * @param {Function} callback - Callback with {devices, selectedDeviceId, isActive}
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback: (state: CameraState) => void): () => void {
    this.listeners.add(callback);

    callback({
      devices: this.devices,
      selectedDeviceId: this.selectedDeviceId,
      isActive: this.isActive,
    });

    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Notify all listeners of state change
   */
  notifyListeners(): void {
    const state = {
      devices: this.devices,
      selectedDeviceId: this.selectedDeviceId,
      isActive: this.isActive,
    };

    this.listeners.forEach((listener: (state: CameraState) => void) => {
      try {
        listener(state);
      } catch (error) {
        Logger.error("CameraService", "Listener error:", error);
      }
    });
  }
}

export default new CameraService();
