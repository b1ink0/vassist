/**
 * VoiceRecordingService - Shared VAD + STT Recording Logic
 *
 * Provides Voice Activity Detection (VAD) with automatic recording management.
 * Used by both VoiceConversationService and AIToolbar dictation.
 *
 * Features:
 * - Voice Activity Detection for accurate speech detection
 * - Automatic recording start on speech
 * - Automatic recording stop on silence
 * - Volume level monitoring
 * - Continuous recording with auto-segmentation
 * - Transcription callbacks for real-time processing
 */

import audioVisualizationService from "./AudioVisualizationService";
import VADService from "./VADService";
import { STTServiceProxy } from "../proxies";
import Logger from "../common/LoggerService";
import MicrophoneService from "./MicrophoneService";

type VoiceRecordingCallbacks = {
  onTranscription?: ((text: string) => void) | null;
  onError?: ((error: unknown) => void) | null;
  onRecordingStart?: (() => void) | null;
  onRecordingStop?: (() => void) | null;
  onVolumeChange?: ((volume: number) => void) | null;
  onSpeechRealStart?: (() => void) | null;
};

class VoiceRecordingService {
  private unsubscribeMicrophone: (() => void) | null = null;
  private microphoneChange = Promise.resolve();
  private session = 0;
  private starting: Promise<void> | null = null;
  private stopVisualization: (() => void) | null = null;
  private audioStream: MediaStream | null;
  private mediaRecorder: MediaRecorder | null;
  private audioChunks: Blob[];
  private isRecording: boolean;
  private isActive: boolean;
  private onTranscription: ((text: string) => void) | null;
  private onError: ((error: unknown) => void) | null;
  private onRecordingStart: (() => void) | null;
  private onRecordingStop: (() => void) | null;
  private onVolumeChange: ((volume: number) => void) | null;
  private onSpeechRealStart: (() => void) | null;

  constructor() {
    // Audio stream
    this.audioStream = null;

    // Recording state
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
    this.isActive = false;

    // Callbacks
    this.onTranscription = null; // (text) => void - Called when transcription is ready
    this.onError = null; // (error) => void
    this.onRecordingStart = null; // () => void - Called when recording starts (VAD detected speech)
    this.onRecordingStop = null; // () => void - Called when recording stops (VAD detected silence)
    this.onVolumeChange = null; // (volume: number) => void - Real-time volume feedback
    this.onSpeechRealStart = null;

    Logger.log("VoiceRecording", "Service initialized with VAD");
  }

  /**
   * Start VAD monitoring and recording system
   * @param {Object} callbacks - { onTranscription, onError, onRecordingStart, onRecordingStop, onVolumeChange }
   */
  start(callbacks: VoiceRecordingCallbacks = {}): Promise<void> {
    if (this.starting) return this.starting;
    const starting = this.startCapture(callbacks).finally(() => {
      if (this.starting === starting) this.starting = null;
    });
    this.starting = starting;
    return starting;
  }

  private async startCapture(
    callbacks: VoiceRecordingCallbacks,
  ): Promise<void> {
    if (this.isActive) {
      Logger.warn("VoiceRecording", "Already active");
      return;
    }

    const session = ++this.session;
    try {
      Logger.log("VoiceRecording", "Starting VAD...");

      // Set callbacks
      this.onTranscription = callbacks.onTranscription || null;
      this.onError = callbacks.onError || null;
      this.onRecordingStart = callbacks.onRecordingStart || null;
      this.onRecordingStop = callbacks.onRecordingStop || null;
      this.onVolumeChange = callbacks.onVolumeChange || null;
      this.onSpeechRealStart = callbacks.onSpeechRealStart || null;

      // Get audio constraints with selected microphone
      const constraints = MicrophoneService.getAudioConstraints();
      Logger.log("VoiceRecording", "Using audio constraints:", constraints);

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (session !== this.session) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.audioStream = stream;
      const visualization =
        audioVisualizationService.monitorFrames("microphone");
      this.stopVisualization = visualization.stop;

      this.isActive = true;

      // Start VAD with callbacks
      await VADService.start({
        stream: this.audioStream,
        onAudioFrame: visualization.push,
        onSpeechStart: () => {
          Logger.log("VoiceRecording", "Speech detected - starting recording");
          this.startRecording();
          if (this.onVolumeChange) {
            this.onVolumeChange(100); // Indicate speech activity
          }
        },
        onSpeechRealStart: () => {
          Logger.log(
            "VoiceRecording",
            "Real human speech confirmed (VAD threshold met)",
          );
          // Trigger interrupt check for confirmed human voice
          if (this.onSpeechRealStart) {
            this.onSpeechRealStart();
          }
        },
        onSpeechEnd: () => {
          Logger.log("VoiceRecording", "Silence detected - stopping recording");
          this.stopRecording();
          if (this.onVolumeChange) {
            this.onVolumeChange(0); // Indicate no speech activity
          }
        },
        onError: (error: unknown) => {
          Logger.error("VoiceRecording", "VAD error:", error);
          if (this.onError) {
            this.onError(error);
          }
        },
      });

      if (session !== this.session) return;
      let selectedDevice = MicrophoneService.getSelectedDeviceId();
      this.unsubscribeMicrophone = MicrophoneService.subscribe(
        ({ selectedDeviceId }) => {
          if (selectedDeviceId === selectedDevice) return;
          selectedDevice = selectedDeviceId;
          this.microphoneChange = this.microphoneChange
            .then(async () => {
              if (!this.isActive || session !== this.session) return;
              const stream = await navigator.mediaDevices.getUserMedia(
                MicrophoneService.getAudioConstraints(),
              );
              if (!this.isActive || session !== this.session) {
                stream.getTracks().forEach((track) => track.stop());
                return;
              }
              // A device switch discards only the unfinished speech segment.
              if (this.mediaRecorder) {
                this.mediaRecorder.onstop = null;
                this.mediaRecorder.ondataavailable = null;
                if (this.mediaRecorder.state !== "inactive")
                  this.mediaRecorder.stop();
              }
              this.isRecording = false;
              this.audioChunks = [];
              try {
                this.audioStream = stream;
                await VADService.replaceStream(stream);
                if (!this.isActive || session !== this.session) {
                  stream.getTracks().forEach((track) => track.stop());
                  return;
                }
                this.audioStream = stream;
              } catch (error) {
                stream.getTracks().forEach((track) => track.stop());
                throw error;
              }
            })
            .catch((error) => this.onError?.(error));
        },
      );
      Logger.log("VoiceRecording", "Started successfully");
    } catch (error) {
      Logger.error("VoiceRecording", "Failed to start:", error);
      await VADService.stop().catch(() => {});
      this.stopVisualization?.();
      this.stopVisualization = null;
      this.audioStream?.getTracks().forEach((track) => track.stop());
      this.audioStream = null;
      this.isActive = false;
      if (this.onError) {
        this.onError(error);
      }
      throw error;
    }
  }

  /**
   * Stop VAD monitoring and recording system
   */
  async stop(): Promise<void> {
    this.isActive = false;
    ++this.session;
    this.unsubscribeMicrophone?.();
    this.unsubscribeMicrophone = null;
    if (this.mediaRecorder) {
      this.mediaRecorder.onstop = null;
      this.mediaRecorder.ondataavailable = null;
      if (this.mediaRecorder.state !== "inactive") this.mediaRecorder.stop();
    }
    this.mediaRecorder = null;
    this.isRecording = false;
    this.audioChunks = [];
    this.stopVisualization?.();
    this.stopVisualization = null;
    Logger.log("VoiceRecording", "Stopping...");

    // Capture startup and device switching must settle before VAD is disposed.
    await this.starting?.catch(() => {});
    await this.microphoneChange;
    await VADService.stop();

    // Cleanup audio stream (already stopped by VAD, but null out reference)
    this.audioStream = null;
    this.isActive = false;

    // Clear callbacks
    this.onTranscription = null;
    this.onError = null;
    this.onRecordingStart = null;
    this.onRecordingStop = null;
    this.onVolumeChange = null;

    Logger.log("VoiceRecording", "Stopped");
  }

  /**
   * Start recording user speech
   */
  startRecording(): void {
    if (!this.isActive || this.isRecording) return;
    if (!this.audioStream) return;

    try {
      const mimeType = this.getSupportedMimeType();
      this.mediaRecorder = new MediaRecorder(this.audioStream, { mimeType });
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        await this.processRecording();
      };

      this.mediaRecorder.start();
      this.isRecording = true;

      // Notify recording started
      if (this.onRecordingStart) {
        this.onRecordingStart();
      }

      Logger.log("VoiceRecording", "Recording started");
    } catch (error) {
      Logger.error("VoiceRecording", "Failed to start recording:", error);
      if (this.onError) {
        this.onError(error);
      }
    }
  }

  /**
   * Stop recording user speech
   */
  stopRecording(): void {
    if (!this.isRecording || !this.mediaRecorder) return;

    Logger.log("VoiceRecording", "Stopping recording...");
    this.mediaRecorder.stop();
    this.isRecording = false;

    // Notify recording stopped
    if (this.onRecordingStop) {
      this.onRecordingStop();
    }
  }

  /**
   * Process recorded audio
   */
  async processRecording(): Promise<void> {
    const session = this.session;
    try {
      // Create audio blob
      const mimeType = this.getSupportedMimeType();
      const audioBlob = new Blob(this.audioChunks, { type: mimeType });
      this.audioChunks = [];

      Logger.log(
        "VoiceRecording",
        `Processing audio (${audioBlob.size} bytes)...`,
      );

      // Check if blob has content
      if (audioBlob.size === 0) {
        Logger.warn(
          "VoiceRecording",
          "Empty audio blob, skipping transcription",
        );
        return;
      }

      // Check if STT is configured
      if (!(await STTServiceProxy.isConfigured())) {
        Logger.error("VoiceRecording", "STT not configured!");
        if (this.onError) {
          this.onError(
            new Error("STT not configured. Please configure in Control Panel."),
          );
        }
        return;
      }

      Logger.log(
        "VoiceRecording",
        "Calling STTServiceProxy.transcribeAudio...",
      );
      // Transcribe audio
      const transcription = await STTServiceProxy.transcribeAudio(audioBlob);
      Logger.log(
        "VoiceRecording",
        `Transcription received: "${transcription}"`,
      );

      if (!this.isActive || session !== this.session) return;
      // Notify transcription
      if (this.onTranscription) {
        this.onTranscription(transcription);
      }
    } catch (error) {
      if (!this.isActive || session !== this.session) return;
      Logger.error("VoiceRecording", "Processing failed:", error);
      if (this.onError) {
        this.onError(error);
      }
    }
  }

  /**
   * Get supported MIME type for MediaRecorder
   */
  getSupportedMimeType(): string {
    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
      "audio/wav",
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return "audio/webm"; // Fallback
  }

  /**
   * Check if service is active
   */
  isServiceActive(): boolean {
    return this.isActive;
  }

  /**
   * Check if currently recording
   */
  isCurrentlyRecording(): boolean {
    return this.isRecording;
  }
}

// Export singleton instance
export default new VoiceRecordingService();
