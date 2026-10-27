/**
 * SttTtsEventService - Fan-out dispatcher for LocalAIBridge STT/TTS download
 * events.
 *
 * LocalAIBridge (Kotlin) emits download progress/complete/error by invoking
 * the single callback slots on window.AndroidAI (_onSTTTTSProgress,
 * _onSTTTTSComplete, _onSTTTTSError) via evaluateJavascript. Those slots are
 * global - only ONE handler can occupy each at a time.
 *
 * SettingsPanel keeps every settings tab mounted at once (slide animation),
 * so several components legitimately need the same events (STT model cards
 * AND TTS voice-pack cards). Direct assignment meant whichever component's
 * effect ran last silently swallowed everyone else's events - TTS/vits
 * downloads showed no progress while STT kept working.
 *
 * Components subscribe here instead of touching window.AndroidAI directly;
 * the service installs dispatchers once that forward every event to ALL
 * subscribers. This mirrors how VoiceRecordingService fans out recording
 * callbacks to multiple consumers.
 */

type ProgressHandler = (
  type: string,
  percent: number,
  statusText: string,
) => void;
type CompleteHandler = (
  type: string,
  result: { success?: boolean; error?: string },
) => void;
type ErrorHandler = (type: string, errorMsg: string) => void;

interface SttTtsEventHandlers {
  onProgress?: ProgressHandler;
  onComplete?: CompleteHandler;
  onError?: ErrorHandler;
}

interface BridgeCallbackSlots {
  _onSTTTTSProgress?: ProgressHandler | null;
  _onSTTTTSComplete?: CompleteHandler | null;
  _onSTTTTSError?: ErrorHandler | null;
}

class SttTtsEventService {
  private listeners: Set<SttTtsEventHandlers>;
  private dispatchersInstalled: boolean;

  constructor() {
    this.listeners = new Set<SttTtsEventHandlers>();
    this.dispatchersInstalled = false;
  }

  /**
   * Subscribe to STT/TTS bridge events. Returns an unsubscribe function.
   * Safe to call before window.AndroidAI exists - dispatchers install as
   * soon as a subscription happens while the bridge is present, and are
   * (re)installed if the bridge object appears later.
   */
  subscribe(handlers: SttTtsEventHandlers): () => void {
    this.listeners.add(handlers);
    this.installDispatchers();

    return () => {
      this.listeners.delete(handlers);
    };
  }

  private getBridge(): BridgeCallbackSlots | null {
    if (typeof window === "undefined") {
      return null;
    }
    return (
      ((window as unknown as { AndroidAI?: BridgeCallbackSlots }).AndroidAI as
        | BridgeCallbackSlots
        | undefined) ?? null
    );
  }

  /** Install (or re-install) the fan-out dispatchers on the bridge object. */
  private installDispatchers(): void {
    const bridge = this.getBridge();
    if (!bridge) {
      return;
    }
    // Re-install on every subscribe: self-heals if anything else nulled or
    // overwrote the slots, and keeps install order independent.
    bridge._onSTTTTSProgress = (type, percent, status) => {
      this.listeners.forEach((listener) =>
        listener.onProgress?.(type, percent, status),
      );
    };
    bridge._onSTTTTSComplete = (type, result) => {
      this.listeners.forEach((listener) => listener.onComplete?.(type, result));
    };
    bridge._onSTTTTSError = (type, error) => {
      this.listeners.forEach((listener) => listener.onError?.(type, error));
    };
    this.dispatchersInstalled = true;
  }
}

export default new SttTtsEventService();
export type { SttTtsEventHandlers };
