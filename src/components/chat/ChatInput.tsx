/**
 * @fileoverview Chat input component with voice recording, multimodal attachments, and drag-and-drop support.
 */

import {
  useState,
  useEffect,
  useRef,
  forwardRef,
  useCallback,
  type RefObject,
  type FormEvent,
  type ChangeEvent,
  type KeyboardEvent,
  type ClipboardEvent,
} from "react";
import { STTServiceProxy } from "../../services/proxies";
import { TTSServiceProxy } from "../../services/proxies";
import VoiceConversationService, {
  ConversationStates,
} from "../../services/VoiceConversationService";
import BackgroundDetector from "../../utils/BackgroundDetector";
import DragDropService from "../../services/DragDropService";
import { useDesktopWindowResize } from "../../hooks/useDesktopWindowResize";
import { useApp } from "../../contexts/AppContext";
import { useConfig } from "../../contexts/ConfigContext";
import { Icon } from "../icons";
import { Button, Select } from "../ui";
import Logger from "../../services/LoggerService";
import {
  isAndroid,
  isDesktop,
  isExtension,
  isInputWindow,
} from "../../utils/PlatformUtils";
import { useDesktop } from "../../contexts/DesktopContext";
import MicrophoneService from "../../services/MicrophoneService";
import CameraService from "../../services/CameraService";
import ScreenShareService from "../../services/ScreenShareService";
import { cn } from "../../utils/cn";

interface AttachmentItem {
  dataUrl: string;
  name: string;
  size: number;
  type: "image" | "audio";
}

interface DropData {
  text?: string;
  images?: AttachmentItem[];
  audios?: AttachmentItem[];
  errors?: string[];
  autoSend?: boolean;
}

interface ChatInputProps {
  onSend?: (message: string, images: string[], audios: string[]) => void;
  onClose?: () => void;
  onVoiceTranscription?: (text: string, images: string[] | null) => void;
  onVoiceMode?: (enabled: boolean) => void;
}

interface MicStateLike {
  devices: MediaDeviceInfo[];
  selectedDeviceId: string | null;
}

interface CameraStateLike extends MicStateLike {
  isActive: boolean;
}

interface ScreenShareStateLike {
  isActive: boolean;
}

interface DragDropServiceLike {
  attach: (
    element: HTMLElement,
    callbacks: {
      onSetDragOver?: (isDragging: boolean) => void;
      onShowError?: (error: string) => void;
      checkVoiceMode?: () => boolean;
      getCurrentCounts?: () => { images: number; audios: number };
      onProcessData?: (data: DropData) => void;
    },
  ) => void;
  detach: () => void;
}

const dragDropCtor = DragDropService as unknown as new (options: {
  maxImages: number;
  maxAudios: number;
}) => DragDropServiceLike;
const useDesktopWindowResizeTyped = useDesktopWindowResize as unknown as (
  containerRef?: RefObject<HTMLElement> | null,
  options?: {
    minWidth?: number;
    minHeight?: number;
    maxWidth?: number;
    maxHeight?: number;
    padding?: number;
  },
) => void;

/**
 * Chat input component with text, voice, and attachment capabilities.
 *
 * @component
 * @param {Object} props - Component props
 * @param {Function} props.onSend - Callback when message is sent
 * @param {Function} props.onClose - Callback when input is closed
 * @param {Function} props.onVoiceTranscription - Callback for voice transcription
 * @param {Function} props.onVoiceMode - Callback when voice mode changes
 * @param {Object} ref - Forwarded ref
 * @returns {JSX.Element} Chat input component
 */
const ChatInput = forwardRef<HTMLDivElement, ChatInputProps>(
  ({ onSend, onClose, onVoiceTranscription, onVoiceMode }, ref) => {
    const {
      isChatInputVisible: isVisible,
      pendingDropData,
      setPendingDropData,
      isSettingsPanelOpen,
      isHistoryPanelOpen,
    } = useApp();

    const { uiConfig } = useConfig();
    const { api } = useDesktop();

    // Local state for input window (synced from main window)
    const [localPendingDropData, setLocalPendingDropData] =
      useState<DropData | null>(null);
    const [localIsVisible, _setLocalIsVisible] = useState(true); // Input window is always visible when open

    const [message, setMessage] = useState("");
    const [isRecording, setIsRecording] = useState(false);
    const [isProcessingRecording, setIsProcessingRecording] = useState(false);
    const [recordingError, setRecordingError] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const submitButtonRef = useRef<HTMLButtonElement | null>(null);
    const [isLightBackground, setIsLightBackground] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [isClosing, setIsClosing] = useState(false);
    const [shouldRender, setShouldRender] = useState(
      isInputWindow ? true : isVisible,
    );
    const [keyboardOffset, setKeyboardOffset] = useState(0);

    useEffect(() => {
      if (ref) {
        if (typeof ref === "function") {
          ref(containerRef.current);
        } else {
          ref.current = containerRef.current;
        }
      }
    }, [ref]);

    useEffect(() => {
      if (!isAndroid) return;

      const handleKeyboardHeight = (event: Event) => {
        if (
          !(event instanceof CustomEvent) ||
          !event.detail ||
          typeof event.detail !== "object"
        ) {
          return;
        }
        const { height } = event.detail as { height?: number };
        if (typeof height !== "number") {
          return;
        }
        Logger.log("ChatInput", `Native keyboard height: ${height}px`);
        setKeyboardOffset(height);
      };

      window.addEventListener("keyboardHeightChange", handleKeyboardHeight);

      return () => {
        window.removeEventListener(
          "keyboardHeightChange",
          handleKeyboardHeight,
        );
      };
    }, []);

    const [isVoiceMode, setIsVoiceMode] = useState(false);
    const [voiceState, setVoiceState] = useState(ConversationStates.IDLE);

    const [attachedImages, setAttachedImages] = useState<AttachmentItem[]>([]);
    const [attachedAudios, setAttachedAudios] = useState<AttachmentItem[]>([]);
    const imageInputRef = useRef<HTMLInputElement | null>(null);
    const audioInputRef = useRef<HTMLInputElement | null>(null);

    const [isDragOver, setIsDragOver] = useState(false);
    const dragDropServiceRef = useRef<DragDropServiceLike | null>(null);

    // Microphone selection state
    const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedMicId, setSelectedMicId] = useState<string | null>(null);

    // Camera selection state
    const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedCameraId, setSelectedCameraId] = useState<string | null>(
      null,
    );
    const [isCameraActive, setIsCameraActive] = useState(false);
    const micDeviceOptions = [
      { value: "", label: "Default Microphone" },
      ...micDevices.map((device) => ({
        value: device.deviceId,
        label:
          device.label || `Microphone ${device.deviceId.substring(0, 8)}...`,
      })),
    ];
    const cameraDeviceOptions = [
      { value: "", label: "Default Camera" },
      ...cameraDevices.map((device, index) => ({
        value: device.deviceId || "",
        label:
          device.label ||
          (device.deviceId
            ? `Camera ${device.deviceId.substring(0, 8)}...`
            : `Camera ${index + 1}`),
      })),
    ];

    // Screen share state (Desktop only)
    const [isScreenShareActive, setIsScreenShareActive] = useState(false);
    const isDesktopInputWindow = isDesktop && isInputWindow;

    // IPC wrapper functions for input window
    const wrappedOnSend = useCallback(
      (messageText: string, images: string[], audios: string[]) => {
        if (isDesktopInputWindow) {
          api?.ipc?.send("chatInput:send", {
            message: messageText,
            images,
            audios,
          });
        } else {
          onSend?.(messageText, images, audios);
        }
      },
      [onSend, api, isDesktopInputWindow],
    );

    const wrappedOnVoiceTranscription = useCallback(
      (text: string, images: string[] | null) => {
        if (isDesktopInputWindow) {
          api?.ipc?.send("chatInput:voiceTranscription", { text, images });
        } else {
          onVoiceTranscription?.(text, images);
        }
      },
      [onVoiceTranscription, api, isDesktopInputWindow],
    );

    const wrappedSetPendingDropData = useCallback(
      (data: DropData | null) => {
        if (isDesktopInputWindow) {
          api?.ipc?.send("chatInput:setPendingDropData", data);
        } else {
          setPendingDropData(data as never);
        }
      },
      [setPendingDropData, api, isDesktopInputWindow],
    );

    const wrappedOnClose = useCallback(() => {
      if (isDesktop && isInputWindow) {
        api?.ipc?.send("chatInput:close");
      } else {
        onClose?.();
      }
    }, [onClose, api]);

    const effectiveIsVisible = isInputWindow ? localIsVisible : isVisible;
    const effectivePendingDropData = isInputWindow
      ? localPendingDropData
      : pendingDropData;

    useEffect(() => {
      if (isInputWindow) return;
      if (effectiveIsVisible) {
        setShouldRender(true);
        setIsClosing(false);
      } else if (shouldRender) {
        setIsClosing(true);
        const timeout = setTimeout(() => {
          setShouldRender(false);
          setIsClosing(false);
        }, 200);
        return () => clearTimeout(timeout);
      }
    }, [effectiveIsVisible, shouldRender]);

    useEffect(() => {
      if (!isDesktopInputWindow || !api?.ipc) return;

      api.ipc.send("mic:requestState");

      const unsubscribePendingDrop = api.ipc.on(
        "state:pendingDropData",
        (data: DropData | null) => {
          setLocalPendingDropData(data);
        },
      );

      const unsubscribeMicDevices = api.ipc.on(
        "state:micDevices",
        (data: MicStateLike) => {
          setMicDevices(data.devices);
          setSelectedMicId(data.selectedDeviceId);
        },
      );

      const unsubscribeSelectedMic = api.ipc.on(
        "state:selectedMicId",
        (deviceId: string | null) => {
          MicrophoneService.setSelectedDevice(deviceId);
        },
      );

      const unsubscribeVoiceState = isVoiceMode
        ? api.ipc.on("state:voiceState", (state: string) => {
            Logger.log(
              "ChatInput",
              "Voice state received from main window:",
              state,
            );
            setVoiceState(state);
          })
        : undefined;

      const unsubscribeTranscription = isVoiceMode
        ? api.ipc.on("voice:transcriptionReceived", (text: string) => {
            Logger.log(
              "ChatInput",
              "Transcription received from main window:",
              text,
            );

            const images =
              attachedImages.length > 0
                ? attachedImages.map((img) => img.dataUrl)
                : [];

            Logger.log(
              "ChatInput",
              "Sending back to main window with images:",
              images.length,
            );

            api.ipc?.send("chatInput:voiceTranscription", { text, images });

            setAttachedImages([]);
          })
        : undefined;

      const unsubscribeSttTranscription = api.ipc.on(
        "stt:transcriptionReceived",
        (text: string) => {
          if (typeof text !== "string" || text.trim().length === 0) {
            return;
          }

          setMessage((prev) => {
            const trimmedPrev = (prev || "").trim();
            if (!trimmedPrev) {
              return text;
            }
            const separator = /\s$/.test(prev) ? "" : " ";
            return `${prev}${separator}${text}`;
          });

          setRecordingError("");
          setIsProcessingRecording(false);
          if (textareaRef.current) {
            textareaRef.current.focus();
          }
        },
      );

      const unsubscribeSttRecording = api.ipc.on(
        "state:sttRecording",
        (
          payload: {
            isRecording?: boolean;
            isProcessing?: boolean;
            error?: string;
          } = {},
        ) => {
          setIsRecording(Boolean(payload.isRecording));
          setIsProcessingRecording(Boolean(payload.isProcessing));
          if (payload.error) {
            setRecordingError(payload.error);
          } else {
            setRecordingError("");
          }
        },
      );

      return () => {
        unsubscribePendingDrop?.();
        unsubscribeMicDevices?.();
        unsubscribeSelectedMic?.();
        unsubscribeVoiceState?.();
        unsubscribeTranscription?.();
        unsubscribeSttTranscription?.();
        unsubscribeSttRecording?.();
      };
    }, [api, attachedImages, isVoiceMode, isDesktopInputWindow]);

    /**
     * Auto-resizes textarea based on content.
     */
    const adjustTextareaHeight = () => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.style.height = "auto";
        const newHeight = Math.min(textarea.scrollHeight, 200);
        textarea.style.height = `${newHeight}px`;
      }
    };

    useEffect(() => {
      if (!effectiveIsVisible) return;

      let detectionTimeout: ReturnType<typeof setTimeout> | null = null;
      let scrollTimeout: ReturnType<typeof setTimeout> | null = null;
      let intervalId: ReturnType<typeof setInterval> | null = null;

      const detectBackgroundBrightness = () => {
        const mode = uiConfig?.backgroundDetection?.mode || "adaptive";

        if (mode !== "adaptive") {
          // Set based on forced mode
          if (mode === "light") {
            setIsLightBackground(true);
          } else if (mode === "dark") {
            setIsLightBackground(false);
          }
          return;
        }

        const container = containerRef.current;
        const canvas = document.getElementById("vassist-babylon-canvas");
        const elementsToDisable: HTMLElement[] = [container, canvas].filter(
          (element): element is HTMLElement => element instanceof HTMLElement,
        );

        const result = BackgroundDetector.withDisabledPointerEvents(
          elementsToDisable,
          () => {
            return BackgroundDetector.detectBrightness({
              sampleArea: {
                type: "horizontal",
                centerX: window.innerWidth / 2,
                centerY: window.innerHeight - 60,
                width: 600,
                padding: 20,
              },
              elementsToIgnore: elementsToDisable,
              logPrefix: "[ChatInput]",
            });
          },
        );

        setIsLightBackground((prevState) => {
          if (prevState !== result.isLight) {
            Logger.log("ChatInput", "Background brightness changed:", {
              median: result.brightness.toFixed(1),
              isLight: result.isLight,
              samples: result.sampleCount,
            });
            return result.isLight;
          }
          return prevState;
        });
      };

      // Initial detection with delay
      detectionTimeout = setTimeout(detectBackgroundBrightness, 300);

      // Debounced scroll handler - longer delay to avoid performance issues
      const handleScroll = () => {
        if (scrollTimeout) {
          clearTimeout(scrollTimeout);
        }
        scrollTimeout = setTimeout(detectBackgroundBrightness, 500);
      };

      window.addEventListener("scroll", handleScroll, true);
      intervalId = setInterval(detectBackgroundBrightness, 4000);

      return () => {
        if (detectionTimeout) {
          clearTimeout(detectionTimeout);
        }
        if (scrollTimeout) {
          clearTimeout(scrollTimeout);
        }
        window.removeEventListener("scroll", handleScroll, true);
        if (intervalId) {
          clearInterval(intervalId);
        }
      };
    }, [effectiveIsVisible, uiConfig?.backgroundDetection?.mode]);

    useDesktopWindowResizeTyped(
      isInputWindow
        ? (containerRef as unknown as RefObject<HTMLElement>)
        : null,
      {
        minWidth: 400,
        minHeight: 100,
        maxWidth: 800,
        maxHeight: 400,
        padding: 10,
      },
    );

    useEffect(() => {
      if (effectiveIsVisible && textareaRef.current && !isVoiceMode) {
        textareaRef.current.focus();
        adjustTextareaHeight();
        Logger.log("ChatInput", "Focused textarea");
      } else if (!effectiveIsVisible) {
        setAttachedImages([]);
        setAttachedAudios([]);
        setMessage("");
      }
    }, [effectiveIsVisible, isVoiceMode]);

    useEffect(() => {
      adjustTextareaHeight();
    }, [message]);

    useEffect(() => {
      STTServiceProxy.setTranscriptionCallback((text: string) => {
        Logger.log("ChatInput", "Transcription received:", text);
        setMessage(text);
        setRecordingError("");
        setIsProcessingRecording(false);

        if (textareaRef.current) {
          textareaRef.current.focus();
        }
      });

      STTServiceProxy.setErrorCallback((error: unknown) => {
        Logger.error("ChatInput", "STT error:", error);
        const errorMessage =
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "Recording failed";
        setRecordingError(errorMessage);
        setIsRecording(false);
        setIsProcessingRecording(false);
      });

      STTServiceProxy.setRecordingStartCallback(() => {
        Logger.log("ChatInput", "Recording started");
        setIsRecording(true);
        setIsProcessingRecording(false);
        setRecordingError("");
      });

      STTServiceProxy.setRecordingStopCallback(() => {
        Logger.log("ChatInput", "Recording stopped - transcription complete");
        setIsRecording(false);
        setIsProcessingRecording(false);
      });

      return () => {
        STTServiceProxy.setTranscriptionCallback(() => {});
        STTServiceProxy.setErrorCallback(() => {});
        STTServiceProxy.setRecordingStartCallback(() => {});
        STTServiceProxy.setRecordingStopCallback(() => {});
      };
    }, []);

    useEffect(() => {
      if (!isVoiceMode) {
        return;
      }

      const handleStateChange = (state: string) => {
        Logger.log("ChatInput", "Voice state changed:", state);
        setVoiceState(state);

        // This only works in main window where VoiceConversationService actually runs
        // Input window receives state via IPC (state:voiceState)
      };

      const handleTranscription = (text: string) => {
        Logger.log(
          "ChatInput",
          "Voice transcription:",
          text,
          "with images:",
          attachedImages.length,
        );
        Logger.log("ChatInput", "Attached images details:", attachedImages);

        const images =
          attachedImages.length > 0
            ? attachedImages.map((img) => img.dataUrl)
            : null;

        Logger.log(
          "ChatInput",
          "Images array to send:",
          images ? `${images.length} images` : "null",
        );

        wrappedOnVoiceTranscription(text, images);

        setAttachedImages([]);
      };

      const handleError = (error: unknown) => {
        Logger.error("ChatInput", "Voice error:", error);
        const errorMessage =
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "Voice conversation error";
        setRecordingError(errorMessage);
      };

      // Input window: Gets state via IPC (line 146-173), doesn't register callbacks
      // Web/Extension: Registers callbacks directly
      if (!isInputWindow) {
        VoiceConversationService.setStateChangeCallback(handleStateChange);
        VoiceConversationService.setTranscriptionCallback(handleTranscription);
        VoiceConversationService.setErrorCallback(handleError);
      }

      return () => {
        if (!isInputWindow) {
          VoiceConversationService.setStateChangeCallback(() => {});
          VoiceConversationService.setTranscriptionCallback(() => {});
          VoiceConversationService.setErrorCallback(() => {});
        }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [api, onVoiceTranscription, attachedImages, isVoiceMode]);

    // Initialize microphone service and subscribe to device changes
    useEffect(() => {
      if (isDesktop && isInputWindow) {
        return;
      }

      const unsubscribe = MicrophoneService.subscribe(
        ({ devices, selectedDeviceId }: MicStateLike) => {
          setMicDevices(devices);
          setSelectedMicId(selectedDeviceId);
        },
      );

      // Desktop main window needs full initialization to populate labeled device list.
      // Other modes should avoid permission prompts at startup.
      const initDevices = async () => {
        try {
          if (isDesktop) {
            return;
          } else {
            Logger.log(
              "ChatInput",
              "Non-desktop: Refreshing microphone devices without permission prompt",
            );
            await MicrophoneService.refreshDevices();
          }
        } catch {
          Logger.log("ChatInput", "Mic devices not available yet");
        }
      };
      initDevices();

      return () => {
        unsubscribe();
      };
    }, [api]);

    // Initialize camera service
    useEffect(() => {
      Logger.log(
        "ChatInput",
        "Camera initialization useEffect triggered, isInputWindow:",
        isInputWindow,
      );

      if (isDesktopInputWindow) {
        Logger.log(
          "ChatInput",
          "Input window: Setting up IPC listeners for camera state",
        );
        let didReceiveIpcCameraState = false;

        // Listen for camera state from main window
        if (api?.ipc) {
          const unsubscribeCameraDevices = api.ipc.on(
            "state:cameraDevices",
            (data: CameraStateLike) => {
              didReceiveIpcCameraState = true;
              Logger.log(
                "ChatInput",
                "Input window: Received camera state via IPC:",
                data,
              );
              setCameraDevices(data.devices);
              setSelectedCameraId(data.selectedDeviceId);
              setIsCameraActive(data.isActive);
            },
          );

          // Fallback: populate local camera list if IPC state is not available.
          const fallbackTimer = setTimeout(async () => {
            if (didReceiveIpcCameraState) return;
            try {
              Logger.log(
                "ChatInput",
                "Input window: No camera IPC state received, using local CameraService fallback",
              );
              if (isDesktop) {
                await CameraService.initialize();
              } else {
                await CameraService.refreshDevices();
              }
              const localDevices = CameraService.getDevices() || [];
              setCameraDevices(localDevices);
              setSelectedCameraId(CameraService.getSelectedDeviceId());
              setIsCameraActive(CameraService.isRunning());
            } catch (error: unknown) {
              Logger.error(
                "ChatInput",
                "Input window: Local camera fallback failed:",
                error,
              );
            }
          }, 1500);

          return () => {
            clearTimeout(fallbackTimer);
            unsubscribeCameraDevices?.();
          };
        }
        return;
      }

      if (isExtension) {
        Logger.log(
          "ChatInput",
          "Extension: Skipping camera service initialization",
        );
        return;
      }

      Logger.log(
        "ChatInput",
        "Main window: Setting up CameraService subscription",
      );
      const unsubscribe = CameraService.subscribe(
        ({ devices, selectedDeviceId, isActive }: CameraStateLike) => {
          Logger.log("ChatInput", "CameraService state changed:", {
            devices: devices.length,
            selectedDeviceId,
            isActive,
          });
          setCameraDevices(devices);
          setSelectedCameraId(selectedDeviceId);
          setIsCameraActive(isActive);
        },
      );

      // Desktop main window needs full initialization to populate labeled device list.
      // Other modes should avoid permission prompts at startup.
      const initDevices = async () => {
        try {
          if (isDesktop) {
            return;
          } else {
            Logger.log(
              "ChatInput",
              "Web/Android: Refreshing camera devices without permission prompt...",
            );
            await CameraService.refreshDevices();
          }
        } catch (error: unknown) {
          Logger.error(
            "ChatInput",
            "Main window: Camera device refresh failed:",
            error,
          );
        }
      };
      initDevices();

      return unsubscribe;
    }, [api, isDesktopInputWindow]);

    // Initialize screen share service
    useEffect(() => {
      Logger.log(
        "ChatInput",
        "Screen share initialization useEffect triggered, isInputWindow:",
        isInputWindow,
      );

      // Input window: Listen for state from main window via IPC
      if (isDesktopInputWindow) {
        Logger.log(
          "ChatInput",
          "Input window: Setting up IPC listener for screen share state",
        );
        if (api?.ipc) {
          const unsubscribeScreenShare = api.ipc.on(
            "state:screenShare",
            (data: ScreenShareStateLike) => {
              Logger.log(
                "ChatInput",
                "Input window: Received screen share state via IPC:",
                data,
              );
              setIsScreenShareActive(data.isActive);
            },
          );

          return () => {
            unsubscribeScreenShare?.();
          };
        }
        return;
      }

      // Android not supported
      if (isAndroid) {
        Logger.log(
          "ChatInput",
          "Android: Screen share not supported, skipping initialization",
        );
        return;
      }

      Logger.log(
        "ChatInput",
        "Web/Desktop/Extension: Setting up ScreenShareService subscription",
      );
      const unsubscribe = ScreenShareService.subscribe(
        ({ isActive }: ScreenShareStateLike) => {
          Logger.log("ChatInput", "ScreenShareService state changed:", {
            isActive,
          });
          setIsScreenShareActive(isActive);
        },
      );

      const initScreenShare = async () => {
        try {
          Logger.log(
            "ChatInput",
            "Web/Desktop/Extension: Initializing ScreenShareService...",
          );
          await ScreenShareService.initialize();
          Logger.log(
            "ChatInput",
            "Web/Desktop/Extension: ScreenShareService initialized successfully",
          );
        } catch (error: unknown) {
          Logger.error(
            "ChatInput",
            "Web/Desktop/Extension: Screen share initialization failed:",
            error,
          );
        }
      };
      initScreenShare();

      return unsubscribe;
    }, [api, isDesktopInputWindow]);

    // Listen for camera control IPC messages
    useEffect(() => {
      if (!isDesktop || isInputWindow || !api?.ipc) {
        return;
      }

      Logger.log("ChatInput", "Main window: Setting up camera IPC listeners");

      const unsubscribeSelectDevice = api.ipc.on(
        "camera:selectDevice",
        async (deviceId: string | null) => {
          Logger.log(
            "ChatInput",
            "Main window: Received IPC camera:selectDevice:",
            deviceId,
          );
          await CameraService.setSelectedDevice(deviceId);
        },
      );

      const unsubscribeToggle = api.ipc.on("camera:toggle", async () => {
        if (isCameraActive) {
          Logger.log("ChatInput", "Main window: Stopping camera via IPC");
          await CameraService.stop();
        } else {
          Logger.log("ChatInput", "Main window: Starting camera via IPC");
          await CameraService.start();
        }
      });

      return () => {
        Logger.log(
          "ChatInput",
          "Main window: Cleaning up camera IPC listeners",
        );
        unsubscribeSelectDevice?.();
        unsubscribeToggle?.();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [api, isInputWindow, isCameraActive]);

    useEffect(() => {
      const handleStartVoiceMode = async () => {
        if (!isVoiceMode && effectiveIsVisible) {
          Logger.log("ChatInput", "External voice mode start requested");
          try {
            if (!STTServiceProxy.isConfigured()) {
              setRecordingError(
                "STT not configured. Please configure in Control Panel.",
              );
              setTimeout(() => setRecordingError(""), 3000);
              return;
            }

            Logger.log(
              "ChatInput",
              "Starting voice conversation mode (external trigger)",
            );
            TTSServiceProxy.stopPlayback();

            setAttachedImages([]);
            setAttachedAudios([]);
            setRecordingError("");

            // Desktop input window: Send to main window via IPC (main window starts service)
            // Web/Extension: Start service directly
            if (isDesktopInputWindow && api?.ipc) {
              api.ipc.send("chatInput:voiceMode", true);
            } else {
              await VoiceConversationService.start();
              onVoiceMode?.(true);
            }

            setIsVoiceMode(true);
          } catch (error: unknown) {
            Logger.error("ChatInput", "Voice mode start error:", error);
            const errorMessage =
              error instanceof Error
                ? error.message
                : "Failed to start voice mode";
            setRecordingError(errorMessage);
            setTimeout(() => setRecordingError(""), 3000);
            setIsVoiceMode(false);
          }
        }
      };

      window.addEventListener("startVoiceMode", handleStartVoiceMode);
      return () => {
        window.removeEventListener("startVoiceMode", handleStartVoiceMode);
      };
    }, [
      isVoiceMode,
      effectiveIsVisible,
      onVoiceMode,
      api,
      isDesktopInputWindow,
    ]);

    /**
     * Processes drag-and-drop data (text, images, audios).
     *
     * @param {Object} dropData - Drop data containing text, images, audios, and errors
     */
    const processDropData = useCallback((dropData: DropData | null) => {
      if (!dropData) return;

      const { text, images, audios, errors } = dropData;

      Logger.log("ChatInput", "Processing drop data:", {
        textLength: text?.length || 0,
        imageCount: images?.length || 0,
        audioCount: audios?.length || 0,
        errorCount: errors?.length || 0,
      });

      if (errors && errors.length > 0) {
        setRecordingError(errors[0] || "Attachment processing failed");
        setTimeout(() => setRecordingError(""), 3000);
      }

      if (text && text.trim()) {
        setMessage((prev) => (prev ? prev + "\n" + text : text));
      }

      if (images && images.length > 0) {
        setAttachedImages((prev) => {
          const newImages = [...prev, ...images];
          const maxImages = 3;
          if (newImages.length > maxImages) {
            setRecordingError(`Maximum ${maxImages} images allowed`);
            setTimeout(() => setRecordingError(""), 3000);
            return newImages.slice(0, maxImages);
          }
          return newImages;
        });
      }

      if (audios && audios.length > 0) {
        setAttachedAudios((prev) => {
          const newAudios = [...prev, ...audios];
          const maxAudios = 1;
          if (newAudios.length > maxAudios) {
            setRecordingError(`Maximum ${maxAudios} audio files allowed`);
            setTimeout(() => setRecordingError(""), 3000);
            return newAudios.slice(0, maxAudios);
          }
          return newAudios;
        });
      }

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          adjustTextareaHeight();
        }
      }, 0);
    }, []);

    /**
     * Handles message submission.
     *
     * @param {Event} e - Submit event
     */
    const handleSubmit = useCallback(
      (e?: Event | FormEvent<HTMLFormElement>) => {
        if (e) e.preventDefault();

        const trimmedMessage = message.trim();

        if (
          !trimmedMessage &&
          attachedImages.length === 0 &&
          attachedAudios.length === 0
        ) {
          return;
        }

        Logger.log(
          "ChatInput",
          "Sending message:",
          trimmedMessage,
          `with ${attachedImages.length} image(s) and ${attachedAudios.length} audio(s)`,
        );

        let defaultPrompt = "Please analyze these attachments.";
        if (!trimmedMessage) {
          if (attachedAudios.length > 0 && attachedImages.length === 0) {
            defaultPrompt = "What is being said in this audio?";
          } else if (attachedImages.length > 0 && attachedAudios.length === 0) {
            defaultPrompt = "What is in this image?";
          } else if (attachedImages.length > 0 && attachedAudios.length > 0) {
            defaultPrompt =
              "What is in the image and what is being said in the audio?";
          }
        }

        wrappedOnSend(
          trimmedMessage || defaultPrompt,
          attachedImages.map((img) => img.dataUrl),
          attachedAudios.map((audio) => audio.dataUrl),
        );

        setMessage("");
        setAttachedImages([]);
        setAttachedAudios([]);
      },
      [message, attachedImages, attachedAudios, wrappedOnSend],
    );

    useEffect(() => {
      const handleChatDragDrop = (e: Event) => {
        if (!(e instanceof CustomEvent)) {
          return;
        }
        if (!effectiveIsVisible || isVoiceMode) return;
        processDropData((e.detail as DropData) || null);

        // Handle auto-send if requested
        if (e.detail?.autoSend) {
          // Dispatch a separate event to trigger auto-send after state updates
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent("chatAutoSend"));
          }, 100);
        }
      };

      window.addEventListener("chatDragDrop", handleChatDragDrop);

      return () => {
        window.removeEventListener("chatDragDrop", handleChatDragDrop);
      };
    }, [effectiveIsVisible, isVoiceMode, processDropData]);

    useEffect(() => {
      if (!effectivePendingDropData || !effectiveIsVisible || isVoiceMode)
        return;

      Logger.log("ChatInput", "Processing pending drop data");
      processDropData(effectivePendingDropData);

      wrappedSetPendingDropData(null);
    }, [
      effectivePendingDropData,
      effectiveIsVisible,
      isVoiceMode,
      processDropData,
      wrappedSetPendingDropData,
    ]);

    useEffect(() => {
      const handleFocusInput = () => {
        if (textareaRef.current && effectiveIsVisible && !isVoiceMode) {
          textareaRef.current.focus();
        }
      };

      window.addEventListener("focusChatInput", handleFocusInput);

      return () => {
        window.removeEventListener("focusChatInput", handleFocusInput);
      };
    }, [effectiveIsVisible, isVoiceMode]);

    // Auto-send listener for demo actions
    useEffect(() => {
      const handleAutoSend = () => {
        if (effectiveIsVisible && !isVoiceMode && message.trim()) {
          Logger.log("ChatInput", "Auto-sending message from demo action");
          setTimeout(() => {
            // Click the submit button to trigger the form submission
            submitButtonRef.current?.click();
          }, 100);
        }
      };

      window.addEventListener("chatAutoSend", handleAutoSend);

      return () => {
        window.removeEventListener("chatAutoSend", handleAutoSend);
      };
    }, [effectiveIsVisible, isVoiceMode, message]);

    /**
     * Handles image file selection.
     *
     * @param {Event} e - Change event
     */
    const handleImageSelect = (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      const MAX_IMAGES = 5;
      const MAX_FILE_SIZE = 10 * 1024 * 1024;

      if (attachedImages.length + files.length > MAX_IMAGES) {
        setRecordingError(`Maximum ${MAX_IMAGES} images allowed`);
        setTimeout(() => setRecordingError(""), 3000);
        if (imageInputRef.current) imageInputRef.current.value = "";
        return;
      }

      files.forEach((file: File) => {
        if (!file.type.startsWith("image/")) {
          setRecordingError("Please select only image files");
          setTimeout(() => setRecordingError(""), 3000);
          return;
        }

        if (file.size > MAX_FILE_SIZE) {
          setRecordingError(`Image "${file.name}" is too large (max 10MB)`);
          setTimeout(() => setRecordingError(""), 3000);
          return;
        }

        const reader = new FileReader();
        reader.onload = (event: ProgressEvent<FileReader>) => {
          const result = event.target?.result;
          if (typeof result !== "string") {
            return;
          }
          setAttachedImages((prev) => {
            if (prev.length >= MAX_IMAGES) return prev;
            return [
              ...prev,
              {
                dataUrl: result,
                name: file.name,
                size: file.size,
                type: "image",
              },
            ];
          });
        };
        reader.onerror = () => {
          setRecordingError(`Failed to read image "${file.name}"`);
          setTimeout(() => setRecordingError(""), 3000);
        };
        reader.readAsDataURL(file);
      });

      if (imageInputRef.current) imageInputRef.current.value = "";
    };

    /**
     * Handles audio file selection.
     *
     * @param {Event} e - Change event
     */
    const handleAudioSelect = (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      const MAX_AUDIOS = 3;
      const MAX_FILE_SIZE = 25 * 1024 * 1024;

      if (attachedAudios.length + files.length > MAX_AUDIOS) {
        setRecordingError(`Maximum ${MAX_AUDIOS} audio files allowed`);
        setTimeout(() => setRecordingError(""), 3000);
        if (audioInputRef.current) audioInputRef.current.value = "";
        return;
      }

      files.forEach((file: File) => {
        if (!file.type.startsWith("audio/")) {
          setRecordingError("Please select only audio files");
          setTimeout(() => setRecordingError(""), 3000);
          return;
        }

        if (file.size > MAX_FILE_SIZE) {
          setRecordingError(`Audio "${file.name}" is too large (max 25MB)`);
          setTimeout(() => setRecordingError(""), 3000);
          return;
        }

        const reader = new FileReader();
        reader.onload = (event: ProgressEvent<FileReader>) => {
          const result = event.target?.result;
          if (typeof result !== "string") {
            return;
          }
          setAttachedAudios((prev) => {
            if (prev.length >= MAX_AUDIOS) return prev;
            return [
              ...prev,
              {
                dataUrl: result,
                name: file.name,
                size: file.size,
                type: "audio",
              },
            ];
          });
        };
        reader.onerror = () => {
          setRecordingError(`Failed to read audio "${file.name}"`);
          setTimeout(() => setRecordingError(""), 3000);
        };
        reader.readAsDataURL(file);
      });

      if (audioInputRef.current) audioInputRef.current.value = "";
    };

    /**
     * Removes image from attachments.
     *
     * @param {number} index - Index of image to remove
     */
    const handleRemoveImage = (index: number) => {
      setAttachedImages((prev) => prev.filter((_, i) => i !== index));
    };

    /**
     * Removes audio from attachments.
     *
     * @param {number} index - Index of audio to remove
     */
    const handleRemoveAudio = (index: number) => {
      setAttachedAudios((prev) => prev.filter((_, i) => i !== index));
    };

    /**
     * Handles keyboard shortcuts.
     *
     * @param {KeyboardEvent} e - Keyboard event
     */
    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Escape") {
        Logger.log("ChatInput", "Escape pressed - closing");
        wrappedOnClose();
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    };

    const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const items = Array.from(e.clipboardData.items);
      const imageItems = items.filter((item) => item.type.startsWith("image/"));

      if (imageItems.length === 0) return;

      e.preventDefault();

      const MAX_IMAGES = 5;
      const MAX_FILE_SIZE = 10 * 1024 * 1024;

      if (attachedImages.length + imageItems.length > MAX_IMAGES) {
        setRecordingError(`Maximum ${MAX_IMAGES} images allowed`);
        setTimeout(() => setRecordingError(""), 3000);
        return;
      }

      imageItems.forEach((item: DataTransferItem) => {
        const file = item.getAsFile();
        if (!file) return;

        if (file.size > MAX_FILE_SIZE) {
          setRecordingError(`Pasted image is too large (max 10MB)`);
          setTimeout(() => setRecordingError(""), 3000);
          return;
        }

        const reader = new FileReader();
        reader.onload = (event: ProgressEvent<FileReader>) => {
          const result = event.target?.result;
          if (typeof result !== "string") {
            return;
          }
          setAttachedImages((prev) => {
            if (prev.length >= MAX_IMAGES) return prev;
            return [
              ...prev,
              {
                dataUrl: result,
                name: `pasted-${Date.now()}.png`,
                size: file.size,
                type: "image",
              },
            ];
          });
        };
        reader.onerror = () => {
          setRecordingError("Failed to read pasted image");
          setTimeout(() => setRecordingError(""), 3000);
        };
        reader.readAsDataURL(file);
      });
    };

    /**
     * Initialize drag-drop service
     */
    useEffect(() => {
      Logger.log("ChatInput", "Drag-drop setup effect running", {
        isVisible: effectiveIsVisible,
        hasContainer: !!containerRef.current,
      });

      if (!effectiveIsVisible) {
        Logger.log("ChatInput", "Skipping drag-drop setup - not visible");
        return;
      }

      const setupTimeout = setTimeout(() => {
        if (!containerRef.current) {
          Logger.log("ChatInput", "Container still not available after delay");
          return;
        }

        Logger.log("ChatInput", "Setting up drag-drop service");

        dragDropServiceRef.current = new dragDropCtor({
          maxImages: 3,
          maxAudios: 1,
        });

        dragDropServiceRef.current.attach(containerRef.current, {
          onSetDragOver: (isDragging: boolean) => setIsDragOver(isDragging),
          onShowError: (error: string) => {
            setRecordingError(error);
            setTimeout(() => setRecordingError(""), 3000);
          },
          checkVoiceMode: () => isVoiceMode,
          getCurrentCounts: () => ({
            images: attachedImages.length,
            audios: attachedAudios.length,
          }),
          onProcessData: (data: DropData) => {
            const { text, images, audios } = data;

            if (text && text.trim()) {
              setMessage((prev) => (prev ? prev + "\n" + text : text));
            }

            if (images && images.length > 0) {
              setAttachedImages((prev) => [...prev, ...images]);
            }

            if (audios && audios.length > 0) {
              setAttachedAudios((prev) => [...prev, ...audios]);
            }

            setTimeout(() => {
              if (textareaRef.current) {
                textareaRef.current.focus();
                adjustTextareaHeight();
              }
            }, 0);
          },
        });
      }, 100);

      return () => {
        clearTimeout(setupTimeout);
        Logger.log("ChatInput", "Cleaning up drag-drop service");
        if (dragDropServiceRef.current) {
          dragDropServiceRef.current.detach();
          dragDropServiceRef.current = null;
        }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [effectiveIsVisible]);

    /**
     * Toggles voice conversation mode.
     */
    const handleVoiceModeToggle = async () => {
      if (!STTServiceProxy.isConfigured()) {
        setRecordingError(
          "STT not configured. Please configure in Control Panel.",
        );
        setTimeout(() => setRecordingError(""), 3000);
        return;
      }

      if (isRecording || isProcessingRecording) {
        setRecordingError("Please stop recording first");
        setTimeout(() => setRecordingError(""), 3000);
        return;
      }

      try {
        if (isVoiceMode) {
          Logger.log("ChatInput", "Stopping voice conversation mode");

          // Desktop input window: Send to main window via IPC (main window stops service)
          // Web/Extension: Stop service directly
          if (isDesktopInputWindow && api?.ipc) {
            api.ipc.send("chatInput:voiceMode", false);
          } else {
            VoiceConversationService.stop();
            if (CameraService.isRunning()) {
              Logger.log("ChatInput", "Stopping camera after voice call ended");
              await CameraService.stop();
            }

            if (onVoiceMode) {
              onVoiceMode(false);
            }
          }

          setIsVoiceMode(false);
          setVoiceState(ConversationStates.IDLE);
          setAttachedImages([]);
          setAttachedAudios([]);
        } else {
          Logger.log("ChatInput", "Starting voice conversation mode");
          TTSServiceProxy.stopPlayback();

          setAttachedImages([]);
          setAttachedAudios([]);
          setRecordingError("");

          // Desktop input window: Send to main window via IPC (main window starts service)
          // Web/Extension: Start service directly
          if (isDesktopInputWindow && api?.ipc) {
            api.ipc.send("chatInput:voiceMode", true);
          } else {
            await VoiceConversationService.start();
            if (onVoiceMode) {
              onVoiceMode(true);
            }
          }

          setIsVoiceMode(true);
        }
      } catch (error: unknown) {
        Logger.error("ChatInput", "Voice mode toggle error:", error);
        const errorMessage =
          error instanceof Error ? error.message : "Failed to start voice mode";
        setRecordingError(errorMessage);
        setTimeout(() => setRecordingError(""), 3000);
        setIsVoiceMode(false);
      }
    };
    /**
     * Handles user interrupt during voice conversation.
     */
    const handleInterrupt = () => {
      Logger.log("ChatInput", "User interrupted");

      // In desktop input window, forward interrupt to main window via IPC
      if (isDesktopInputWindow && api?.ipc) {
        Logger.log("ChatInput", "Forwarding interrupt to main window via IPC");
        api.ipc.send("voice:interrupt");
      }

      // Also call locally (in case we're in main window or web mode)
      VoiceConversationService.interrupt();
    };

    /**
     * Handles microphone device selection
     */
    const handleMicSelect = (deviceId: string | null) => {
      Logger.log("ChatInput", "Microphone selected:", deviceId);
      MicrophoneService.setSelectedDevice(deviceId || null);

      // Sync selected mic across windows on desktop
      if (isDesktopInputWindow && api?.ipc) {
        api.ipc.send("state:selectedMicId", deviceId || null);
      }
    };

    /**
     * Handles camera device selection
     */
    const handleCameraSelect = async (deviceId: string | null) => {
      Logger.log("ChatInput", "Camera selected:", deviceId);

      if (isDesktopInputWindow && api?.ipc) {
        api.ipc.send("camera:selectDevice", deviceId || null);
      } else {
        await CameraService.setSelectedDevice(deviceId || null);
      }
    };

    /**
     * Handles camera button click (toggle on/off)
     */
    const handleCameraClick = async () => {
      try {
        Logger.log(
          "ChatInput",
          "Camera button clicked, isInputWindow:",
          isInputWindow,
          "isCameraActive:",
          isCameraActive,
        );

        if (isDesktopInputWindow && api?.ipc) {
          Logger.log(
            "ChatInput",
            "Input window: Sending camera:toggle IPC to main window",
          );
          api.ipc.send("camera:toggle");
        } else {
          if (isCameraActive) {
            Logger.log("ChatInput", "Stopping camera");
            await CameraService.stop();
          } else {
            Logger.log("ChatInput", "Starting camera");
            await CameraService.start();
          }
        }
      } catch (error: unknown) {
        Logger.error("ChatInput", "Camera toggle error:", error);
      }
    };

    /**
     * Handles screen share button click (toggle on/off)
     */
    const handleScreenShareClick = async () => {
      try {
        Logger.log(
          "ChatInput",
          "Screen share button clicked, isScreenShareActive:",
          isScreenShareActive,
        );

        // Input window: Send IPC to main window using api from hook
        if (isDesktopInputWindow && api?.ipc) {
          Logger.log(
            "ChatInput",
            "Input window: Sending screenShare:toggle IPC",
          );
          api.ipc.send("screenShare:toggle");
          return;
        }

        // Direct control for main window / web / dev / extension
        if (isScreenShareActive) {
          await ScreenShareService.stop();
        } else {
          await ScreenShareService.start();
        }
      } catch (error: unknown) {
        Logger.error("ChatInput", "Screen share toggle error:", error);
      }
    };

    /**
     * Handles microphone button click for voice recording.
     */
    const handleMicClick = async () => {
      if (isDesktopInputWindow && api?.ipc) {
        setRecordingError("");
        setIsProcessingRecording(true);
        api.ipc.send("chatInput:micToggle");
        return;
      }

      if (!STTServiceProxy.isConfigured()) {
        setRecordingError(
          "STT not configured. Please configure in Control Panel.",
        );
        setTimeout(() => setRecordingError(""), 3000);
        return;
      }

      if (isVoiceMode) {
        setRecordingError("Voice call is active. Stop voice call first.");
        setTimeout(() => setRecordingError(""), 3000);
        return;
      }

      if (isProcessingRecording) {
        Logger.log("ChatInput", "Still processing, ignoring click");
        return;
      }

      try {
        if (isRecording) {
          Logger.log("ChatInput", "Stopping recording");
          setIsProcessingRecording(true);
          STTServiceProxy.stopRecording();
        } else {
          Logger.log("ChatInput", "Starting recording");
          setIsProcessingRecording(true);
          TTSServiceProxy.stopPlayback();

          setRecordingError("");
          await STTServiceProxy.startRecording();
        }
      } catch (error: unknown) {
        Logger.error("ChatInput", "Microphone error:", error);
        const errorMessage =
          error instanceof Error ? error.message : "Microphone access denied";
        setRecordingError(errorMessage);
        setTimeout(() => setRecordingError(""), 3000);
        setIsRecording(false);
        setIsProcessingRecording(false);
      }
    };

    if (!shouldRender) return null;

    const getVoiceStateDisplay = () => {
      // Show interrupt button if in SPEAKING state OR if TTS audio is currently playing
      const isAudioPlaying = TTSServiceProxy.isCurrentlyPlaying();
      const showInterrupt =
        voiceState === ConversationStates.SPEAKING || isAudioPlaying;

      switch (voiceState) {
        case ConversationStates.LISTENING:
          return {
            icon: "microphone",
            label: "Listening...",
            class: "listening",
            showInterrupt: false,
          };
        case ConversationStates.THINKING:
          return {
            icon: "thinking",
            label: "Thinking...",
            class: "thinking",
            showInterrupt: false,
          };
        case ConversationStates.GENERATING_VOICE:
          return {
            icon: "thinking",
            label: "Generating voice...",
            class: "generating-voice",
            showInterrupt: false,
          };
        case ConversationStates.SPEAKING:
          return {
            icon: "speaker",
            label: "Speaking...",
            class: "speaking",
            showInterrupt,
          };
        case ConversationStates.INTERRUPTED:
          return {
            icon: "pause",
            label: "Interrupted",
            class: "interrupted",
            showInterrupt: false,
          };
        default:
          return {
            icon: "stop",
            label: "Ready",
            class: "idle",
            showInterrupt: false,
          };
      }
    };

    const voiceStateDisplay = isVoiceMode
      ? getVoiceStateDisplay()
      : { icon: "stop", label: "Ready", class: "idle", showInterrupt: false };
    const hasAttachments =
      attachedImages.length > 0 || attachedAudios.length > 0;
    const shouldFollowKeyboard =
      isAndroid &&
      keyboardOffset > 0 &&
      !isSettingsPanelOpen &&
      !isHistoryPanelOpen;

    return (
      <div
        className="fixed bottom-0 left-0 right-0 z-[10001] flex justify-center pointer-events-none"
        style={
          shouldFollowKeyboard
            ? {
                transform: `translateY(-${keyboardOffset}px)`,
                transition: "transform 0.1s ease-out",
              }
            : undefined
        }
      >
        <div
          ref={containerRef}
          className={cn(
            "relative md:p-4 p-2 w-full max-w-3xl pointer-events-auto",
            isInputWindow && "flex flex-col justify-end",
          )}
          style={{
            touchAction: "none",
            ...(isInputWindow ? { minHeight: "400px" } : {}),
          }}
        >
          {!isVoiceMode && isDragOver && (
            <div
              className="absolute z-10 pointer-events-none flex items-center justify-center rounded-xl"
              style={{
                top: "16px",
                left: "16px",
                right: "16px",
                bottom: "16px",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                backgroundColor: "rgba(0, 0, 0, 0.2)",
              }}
            >
              <div
                className={cn(
                  "glass-container",
                  isLightBackground && "glass-container-dark",
                  "px-6 py-2 md:py-4 rounded-xl border-2 border-dashed border-blue-400/50",
                )}
              >
                <p
                  className={cn(
                    isLightBackground ? "glass-text" : "glass-text-black",
                    "text-lg font-medium flex items-center gap-2",
                  )}
                >
                  <Icon name="attachment" size={20} /> Drop
                </p>
              </div>
            </div>
          )}
          {hasAttachments && (
            <div
              className={cn(
                "w-full max-w-3xl mb-2",
                !isInputWindow && "mx-auto",
              )}
            >
              <div
                className={cn(
                  "glass-input",
                  isLightBackground && "glass-input-dark",
                  "p-2 rounded-lg",
                  isClosing ? "animate-fade-out" : "animate-slide-up-fade-in",
                )}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  {attachedImages.map((img, index) => (
                    <div key={`img-${index}`} className="relative group">
                      <img
                        src={img.dataUrl}
                        alt={img.name}
                        className="w-16 h-16 object-cover rounded-lg border-2 border-white/30"
                      />
                      <Button
                        type="button"
                        onClick={() => handleRemoveImage(index)}
                        variant={isLightBackground ? "dark" : "default"}
                        size="icon"
                        className="absolute -top-2 -right-2 rounded-full w-6 h-6 text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/20"
                        title="Remove image"
                      >
                        <Icon
                          name="close"
                          size={10}
                          className={
                            isLightBackground
                              ? "glass-text"
                              : "glass-text-black"
                          }
                        />
                      </Button>
                      <div
                        className={cn(
                          isLightBackground ? "glass-text" : "glass-text-black",
                          "text-xs mt-1 text-center truncate w-16",
                        )}
                        title={img.name}
                      >
                        {(img.name.split(".")[0] || "").substring(0, 8)}
                      </div>
                    </div>
                  ))}

                  {attachedAudios.map((audio, index) => (
                    <div key={`audio-${index}`} className="relative group">
                      <div className="w-16 h-16 flex items-center justify-center bg-purple-500/20 rounded-lg border-2 border-purple-400/30">
                        <Icon name="music" size={24} />
                      </div>
                      <Button
                        type="button"
                        onClick={() => handleRemoveAudio(index)}
                        variant={isLightBackground ? "dark" : "default"}
                        size="icon"
                        className="absolute -top-2 -right-2 rounded-full w-6 h-6 text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/20"
                        title="Remove audio"
                      >
                        <Icon
                          name="close"
                          size={10}
                          className={
                            isLightBackground
                              ? "glass-text"
                              : "glass-text-black"
                          }
                        />
                      </Button>
                      <div
                        className={cn(
                          isLightBackground ? "glass-text" : "glass-text-black",
                          "text-xs mt-1 text-center truncate w-16",
                        )}
                        title={audio.name}
                      >
                        {(audio.name.split(".")[0] || "").substring(0, 8)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {recordingError && (
            <div
              className={cn(
                "glass-error max-w-3xl mx-auto mb-2 px-2 md:px-4 py-2 rounded-lg flex items-center justify-between gap-2",
                isClosing ? "animate-fade-out" : "animate-slide-up-fade-in",
              )}
            >
              <span
                className={cn(
                  isLightBackground ? "glass-text" : "glass-text-black",
                  "text-sm",
                )}
              >
                {recordingError}
              </span>
              <button
                onClick={() => setRecordingError("")}
                className={cn(
                  isLightBackground ? "glass-text" : "glass-text-black",
                  "hover:opacity-80 transition-opacity flex-shrink-0",
                )}
                title="Close"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className={cn(
              "max-w-3xl flex gap-2 items-end",
              !isInputWindow && "mx-auto",
            )}
          >
            {/* Hidden file inputs - always rendered so refs work in both modes */}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageSelect}
              className="hidden"
            />
            <input
              ref={audioInputRef}
              type="file"
              accept="audio/*"
              multiple
              onChange={handleAudioSelect}
              className="hidden"
            />

            {isVoiceMode ? (
              <>
                <div
                  className={cn(
                    "glass-container",
                    isLightBackground && "glass-container-dark",
                    "flex-1 px-5 py-2 md:py-3 rounded-xl flex items-center justify-between",
                    isClosing ? "animate-fade-out" : "animate-slide-up-fade-in",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      name={voiceStateDisplay.icon}
                      size={24}
                      className={
                        voiceStateDisplay.class === "listening"
                          ? "animate-pulse"
                          : ""
                      }
                    />
                    <span
                      className={cn(
                        isLightBackground ? "glass-text" : "glass-text-black",
                      )}
                    >
                      {voiceStateDisplay.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {voiceStateDisplay.showInterrupt && (
                      <Button
                        type="button"
                        onClick={handleInterrupt}
                        variant={isLightBackground ? "dark" : "default"}
                        size="sm"
                        className="hover:bg-red-500/20 flex items-center gap-1.5"
                      >
                        <Icon
                          name="hand-stop"
                          size={16}
                          className={
                            isLightBackground
                              ? "glass-text"
                              : "glass-text-black"
                          }
                        />
                      </Button>
                    )}
                    <Button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      variant={isLightBackground ? "dark" : "default"}
                      size="sm"
                      className={cn(
                        "flex items-center gap-1",
                        attachedImages.length > 0 &&
                          "bg-blue-500/20 text-blue-400",
                      )}
                      title={
                        attachedImages.length > 0
                          ? `${attachedImages.length} image(s)`
                          : "Attach image"
                      }
                    >
                      <Icon
                        name="image"
                        size={16}
                        className={
                          isLightBackground ? "glass-text" : "glass-text-black"
                        }
                      />
                      {attachedImages.length > 0 && (
                        <span
                          className={
                            isLightBackground
                              ? "glass-text"
                              : "glass-text-black"
                          }
                        >
                          {attachedImages.length}
                        </span>
                      )}
                    </Button>

                    {/* Camera controls are disabled in extension mode */}
                    {!isExtension && (
                      <div className="relative flex items-center gap-1">
                        <Button
                          type="button"
                          onClick={handleCameraClick}
                          variant={isLightBackground ? "dark" : "default"}
                          size="sm"
                          className={cn(
                            "flex items-center gap-1",
                            isCameraActive && "bg-green-500/20 text-green-400",
                          )}
                          title={
                            isCameraActive ? "Stop Camera" : "Start Camera"
                          }
                        >
                          <Icon
                            name="camera"
                            size={16}
                            className={
                              isCameraActive
                                ? "animate-pulse"
                                : isLightBackground
                                  ? "glass-text"
                                  : "glass-text-black"
                            }
                          />
                        </Button>

                        <Select
                          value={selectedCameraId || ""}
                          onChange={(event) => {
                            void handleCameraSelect(event.target.value || null);
                          }}
                          variant={isLightBackground ? "dark" : "default"}
                          options={cameraDeviceOptions}
                          side="top"
                          align="end"
                          listClassName="min-w-[250px]"
                          trigger={
                            <Button
                              type="button"
                              variant={isLightBackground ? "dark" : "default"}
                              size="sm"
                              className="px-1"
                              title="Select Camera"
                            >
                              <Icon
                                name="chevron-down"
                                size={14}
                                className={
                                  isLightBackground
                                    ? "glass-text"
                                    : "glass-text-black"
                                }
                              />
                            </Button>
                          }
                        />
                      </div>
                    )}

                    {/* Screen Share button (Chrome-based platforms) */}
                    {!isAndroid && (
                      <Button
                        type="button"
                        onClick={handleScreenShareClick}
                        variant={isLightBackground ? "dark" : "default"}
                        size="sm"
                        className={cn(
                          "flex items-center gap-1",
                          isScreenShareActive && "bg-blue-500/20 text-blue-400",
                        )}
                        title={
                          isScreenShareActive
                            ? "Stop Screen Share"
                            : "Start Screen Share"
                        }
                      >
                        <Icon
                          name="maximize"
                          size={16}
                          className={
                            isScreenShareActive
                              ? "animate-pulse"
                              : isLightBackground
                                ? "glass-text"
                                : "glass-text-black"
                          }
                        />
                      </Button>
                    )}

                    <Button
                      type="button"
                      onClick={handleVoiceModeToggle}
                      variant="error"
                      size="sm"
                      title="Stop Voice Mode"
                    >
                      <Icon
                        name="phone"
                        size={16}
                        className={
                          isLightBackground ? "glass-text" : "glass-text-black"
                        }
                      />
                    </Button>

                    <Button
                      type="button"
                      onClick={wrappedOnClose}
                      variant={isLightBackground ? "dark" : "default"}
                      size="sm"
                      title="Close (Esc)"
                    >
                      <Icon
                        name="close"
                        size={16}
                        className={
                          isLightBackground ? "glass-text" : "glass-text-black"
                        }
                      />
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div
                  className={cn(
                    "glass-container",
                    isLightBackground && "glass-container-dark",
                    "flex-1 rounded-xl p-3 flex flex-col gap-2",
                    isClosing ? "animate-fade-out" : "animate-slide-up-fade-in",
                  )}
                >
                  <textarea
                    ref={textareaRef}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    placeholder={
                      isProcessingRecording
                        ? "Processing audio..."
                        : isRecording
                          ? "Recording..."
                          : hasAttachments
                            ? `${attachedImages.length + attachedAudios.length} file(s) attached`
                            : "Type a message..."
                    }
                    className="w-full bg-transparent text-white border-none outline-none placeholder-white/40 resize-none custom-scrollbar min-h-[24px] max-h-[200px]"
                    rows={1}
                  />

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => imageInputRef.current?.click()}
                        disabled={isRecording || isProcessingRecording}
                        className={cn(
                          "p-1.5 rounded-lg transition-all hover:bg-white/10 text-sm flex items-center gap-1",
                          attachedImages.length > 0
                            ? "text-blue-400"
                            : isLightBackground
                              ? "glass-text"
                              : "glass-text-black",
                          (isRecording || isProcessingRecording) &&
                            "opacity-50 cursor-not-allowed",
                        )}
                        title={
                          attachedImages.length > 0
                            ? `${attachedImages.length} image(s)`
                            : "Attach Image"
                        }
                      >
                        <Icon name="image" size={18} />
                        {attachedImages.length > 0 && (
                          <span>{attachedImages.length}</span>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => audioInputRef.current?.click()}
                        disabled={isRecording || isProcessingRecording}
                        className={cn(
                          "p-1.5 rounded-lg transition-all hover:bg-white/10 text-sm flex items-center gap-1",
                          attachedAudios.length > 0
                            ? "text-purple-400"
                            : isLightBackground
                              ? "glass-text"
                              : "glass-text-black",
                          (isRecording || isProcessingRecording) &&
                            "opacity-50 cursor-not-allowed",
                        )}
                        title={
                          attachedAudios.length > 0
                            ? `${attachedAudios.length} audio(s)`
                            : "Attach Audio"
                        }
                      >
                        <Icon name="music" size={18} />
                        {attachedAudios.length > 0 && (
                          <span>{attachedAudios.length}</span>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={handleMicClick}
                        disabled={isProcessingRecording}
                        className={cn(
                          "p-1.5 rounded-lg transition-all hover:bg-white/10 text-sm",
                          isProcessingRecording
                            ? "text-yellow-400"
                            : isRecording
                              ? "text-red-400 animate-pulse"
                              : isLightBackground
                                ? "glass-text"
                                : "glass-text-black",
                        )}
                        title={
                          isProcessingRecording
                            ? "Processing..."
                            : isRecording
                              ? "Stop Recording"
                              : "Voice Input"
                        }
                      >
                        <Icon
                          name={
                            isProcessingRecording
                              ? "hourglass"
                              : isRecording
                                ? "record"
                                : "microphone"
                          }
                          size={18}
                        />
                      </button>

                      <button
                        type="button"
                        onClick={handleVoiceModeToggle}
                        disabled={isRecording || isProcessingRecording}
                        className={cn(
                          "p-1.5 rounded-lg transition-all hover:bg-white/10 text-sm",
                          isRecording || isProcessingRecording
                            ? "opacity-50 cursor-not-allowed"
                            : isLightBackground
                              ? "glass-text"
                              : "glass-text-black",
                        )}
                        title="Voice Mode"
                      >
                        <Icon name="phone" size={18} />
                      </button>

                      {/* Microphone selection */}
                      <Select
                        value={selectedMicId || ""}
                        onChange={(event) =>
                          handleMicSelect(event.target.value || null)
                        }
                        variant={isLightBackground ? "dark" : "default"}
                        options={micDeviceOptions}
                        disabled={isRecording || isProcessingRecording}
                        side="top"
                        align="end"
                        listClassName="min-w-[250px]"
                        trigger={
                          <button
                            type="button"
                            className={cn(
                              "p-1.5 rounded-lg transition-all hover:bg-white/10 text-sm",
                              isRecording || isProcessingRecording
                                ? "opacity-50 cursor-not-allowed"
                                : isLightBackground
                                  ? "glass-text"
                                  : "glass-text-black",
                            )}
                            title="Select Microphone"
                          >
                            <Icon name="chevron-down" size={18} />
                          </button>
                        }
                      />

                      <button
                        type="button"
                        onClick={wrappedOnClose}
                        className={cn(
                          "p-1.5 rounded-lg transition-all hover:bg-white/10",
                          isLightBackground ? "glass-text" : "glass-text-black",
                        )}
                        title="Close"
                      >
                        <Icon name="close" size={18} />
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        ref={submitButtonRef}
                        type="submit"
                        disabled={!message.trim() && !hasAttachments}
                        className={cn(
                          "p-1.5 rounded-lg transition-all",
                          message.trim() || hasAttachments
                            ? cn(
                                "hover:bg-white/10",
                                isLightBackground
                                  ? "glass-text"
                                  : "glass-text-black",
                              )
                            : "opacity-30 cursor-not-allowed",
                        )}
                        title="Send message"
                      >
                        <Icon name="send" size={20} />
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </form>
        </div>
      </div>
    );
  },
);

ChatInput.displayName = "ChatInput";

export default ChatInput;
