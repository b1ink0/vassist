import Logger from './LoggerService';

type DeviceChangePayload = {
  devices: MediaDeviceInfo[];
  selectedDeviceId: string | null;
};

type DeviceChangeListener = (payload: DeviceChangePayload) => void;

class MicrophoneService {
  private devices: MediaDeviceInfo[];
  private selectedDeviceId: string | null;
  private listeners: Set<DeviceChangeListener>;
  private permissionGranted: boolean;

  constructor() {
    this.devices = [];
    this.selectedDeviceId = null;
    this.listeners = new Set();
    this.permissionGranted = false;
  }

  /**
   * Request microphone permission and enumerate devices
   * @returns {Promise<MediaDeviceInfo[]>}
   */
  async initialize(): Promise<MediaDeviceInfo[]> {
    try {
      // Request mic permission first
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      this.permissionGranted = true;

      // Enumerate devices
      await this.refreshDevices();

      // Listen for device changes
      navigator.mediaDevices.addEventListener('devicechange', () => {
        void this.refreshDevices();
      });

      return this.devices;
    } catch (error) {
      Logger.error('MicrophoneService', 'Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Refresh the list of available audio input devices
   * @returns {Promise<MediaDeviceInfo[]>}
   */
  async refreshDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.devices = devices.filter((device) => device.kind === 'audioinput');
      Logger.log('MicrophoneService', `Found ${this.devices.length} microphones`);

      // If selected device is no longer available, reset to default
      if (this.selectedDeviceId && !this.devices.find((d) => d.deviceId === this.selectedDeviceId)) {
        Logger.warn('MicrophoneService', 'Selected device no longer available, resetting to default');
        this.selectedDeviceId = null;
      }

      // Notify listeners
      this.notifyListeners();

      return this.devices;
    } catch (error) {
      Logger.error('MicrophoneService', 'Failed to enumerate devices:', error);
      return [];
    }
  }

  /**
   * Get list of available audio input devices
   * @returns {MediaDeviceInfo[]}
   */
  getDevices(): MediaDeviceInfo[] {
    return this.devices;
  }

  /**
   * Select a microphone by deviceId
   * @param {string} deviceId - Device ID or null for default
   */
  setSelectedDevice(deviceId: string | null): void {
    const actualDeviceId = deviceId === '' ? null : deviceId;
    Logger.log('MicrophoneService', 'Selected device:', actualDeviceId);
    this.selectedDeviceId = actualDeviceId;
    this.notifyListeners();
  }

  /**
   * Get the currently selected device ID
   * @returns {string|null}
   */
  getSelectedDeviceId(): string | null {
    return this.selectedDeviceId;
  }

  /**
   * Get audio constraints with selected device
   * @returns {Object}
   */
  getAudioConstraints(): MediaStreamConstraints {
    const constraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      }
    };

    if (this.selectedDeviceId) {
      const audioConstraints = constraints.audio;
      if (audioConstraints && typeof audioConstraints === 'object') {
        (audioConstraints as MediaTrackConstraints).deviceId = { exact: this.selectedDeviceId };
      }
    }

    return constraints;
  }

  /**
   * Subscribe to device list changes
   * @param {Function} callback - Called when devices or selection changes
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback: DeviceChangeListener): () => boolean {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Notify all listeners of changes
   */
  notifyListeners(): void {
    this.listeners.forEach((callback) => {
      try {
        callback({
          devices: this.devices,
          selectedDeviceId: this.selectedDeviceId,
        });
      } catch (error) {
        Logger.error('MicrophoneService', 'Listener error:', error);
      }
    });
  }

  /**
   * Check if microphone permission is granted
   * @returns {boolean}
   */
  isPermissionGranted(): boolean {
    return this.permissionGranted;
  }
}

// Singleton instance
const microphoneService = new MicrophoneService();
export default microphoneService;
