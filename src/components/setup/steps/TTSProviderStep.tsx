import { useState, useEffect, useRef } from "react";
import { useSetup } from "../../../contexts/SetupContext";
import TTSServiceProxy from "../../../services/proxies/TTSServiceProxy";
import { AIServiceProxy } from "../../../services/proxies";
import ProviderSelection from "../shared/ProviderSelection";
import KokoroTTSConfig from "../../settings/tts/KokoroTTSConfig";
import GPTSoVITSConfig from "../../settings/tts/GPTSoVITSConfig";
import DesktopSTTConfig from "../../settings/stt/DesktopSTTConfig";
import OpenAISTTConfig from "../../settings/stt/OpenAISTTConfig";
import OpenAICompatibleSTTConfig from "../../settings/stt/OpenAICompatibleSTTConfig";
import ChromeAISTTConfig from "../../settings/stt/ChromeAISTTConfig";
import {
  TTSProviders,
  STTProviders,
  DefaultTTSConfig,
  GPTSoVITSLanguages,
} from "../../../config/aiConfig";
import StatusMessage from "../../common/StatusMessage";
import Logger from "../../../services/LoggerService";
import { Icon } from "../../icons";
import { Button, Card, Input, Select } from "../../ui";
import { isAndroid, isDesktop } from "../../../utils/PlatformUtils";

interface TestResultState {
  success: boolean;
  message: string;
}

type TTSProviderId =
  | "android-local"
  | "desktop-local"
  | "disabled"
  | "kokoro"
  | "openai"
  | "openai-compatible";

interface TTSProviderStepProps {
  isLightBackground?: boolean;
}

interface KokoroConfigState {
  modelId?: string;
  voice?: string;
  speed?: number;
  device?: string;
  keepModelLoaded?: boolean;
}

interface KokoroStatusState {
  checking: boolean;
  initialized: boolean;
  loading: boolean;
  downloading: boolean;
  progress: number;
  details: string;
  message: string;
}

interface TTSPersistedData {
  provider?: string;
  kokoro?: KokoroConfigState;
  openai?: {
    apiKey?: string;
    model?: string;
    voice?: string;
  };
  "openai-compatible"?: {
    endpoint?: string;
    apiKey?: string;
    model?: string;
    voice?: string;
  };
  "android-local"?: {
    endpoint?: string;
  };
  "desktop-local"?: {
    endpoint?: string;
    referenceText?: string;
    referenceLanguage?: string;
    speed?: number;
    topK?: number;
    topP?: number;
    temperature?: number;
    pytorchBackend?: string;
    trained?: boolean;
  };
}

interface STTPersistedData {
  provider?: string;
}

interface SetupDataWithMultimodal {
  multimodal?: {
    audioSupport?: boolean;
  };
}

interface KokoroStatusResult {
  initialized?: boolean;
  config?: {
    device?: string | null;
  };
}

interface TTSServiceTestConfig {
  provider: string;
  enabled: boolean;
  openai?: {
    apiKey: string;
    model: string;
    voice: string;
  };
  "openai-compatible"?: {
    endpoint: string;
    apiKey: string;
    model: string;
    voice: string;
  };
}

interface ChromeAiSTTStatus {
  checking: boolean;
  available?: boolean;
  state: string | null;
  message: string;
  details: string;
  downloading: boolean;
}

interface STTConfigState {
  openai: {
    apiKey: string;
    model: string;
    language?: string;
    temperature?: number;
  };
  "openai-compatible": {
    endpoint: string;
    apiKey: string;
    model: string;
    language?: string;
    temperature?: number;
  };
  chromeAi: {
    language: string;
    outputLanguage?: string;
    temperature?: number;
    topK?: number;
  };
  "android-local"?: {
    endpoint: string;
    model: string;
  };
  "desktop-local"?: {
    endpoint: string;
    model: string;
    language: string;
    threads: number;
  };
}

interface OpenAISTTUpdates {
  apiKey?: string;
  model?: string;
}

interface OpenAICompatibleSTTUpdates {
  endpoint?: string;
  apiKey?: string;
  model?: string;
  language?: string;
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return "Unknown error";
};

const asRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return {};
};

const TTSProviderStep = ({
  isLightBackground = false,
}: TTSProviderStepProps) => {
  const { setupData, updateSetupData } = useSetup();
  const initialLoadRef = useRef(true);
  const isWebMode = !isAndroid && !isDesktop;

  // TTS state
  const defaultTTSProvider = isAndroid
    ? "android-local"
    : isDesktop
      ? "desktop-local"
      : "kokoro";
  const [selectedProvider, setSelectedProvider] =
    useState<TTSProviderId>("disabled");
  const [androidTTSEndpoint, setAndroidTTSEndpoint] = useState(
    "http://127.0.0.1:8765",
  );

  // Desktop TTS state
  const [desktopTTSEndpoint, setDesktopTTSEndpoint] = useState(
    "http://127.0.0.1:11438",
  );
  const [desktopReferenceAudio] = useState<string | null>(null);
  const [desktopReferenceText, setDesktopReferenceText] = useState("");
  const [desktopReferenceLanguage, setDesktopReferenceLanguage] = useState(
    GPTSoVITSLanguages.ENGLISH,
  );
  const [desktopSpeed, setDesktopSpeed] = useState(1.0);
  const [desktopTopK, setDesktopTopK] = useState(15);
  const [desktopTopP, setDesktopTopP] = useState(0.7);
  const [desktopTemperature, setDesktopTemperature] = useState(0.7);
  const [desktopPytorchBackend, setDesktopPytorchBackend] = useState("auto");
  const [desktopTrained, setDesktopTrained] = useState(false);

  // Kokoro config state
  const [kokoroConfig, setKokoroConfig] = useState<KokoroConfigState>(
    DefaultTTSConfig.kokoro || {},
  );
  const [kokoroStatus, setKokoroStatus] = useState<KokoroStatusState>({
    checking: false,
    initialized: false,
    loading: false,
    downloading: false,
    progress: 0,
    details: "",
    message: "",
  });
  const [testingVoice, setTestingVoice] = useState(false);

  // OpenAI config state
  const [openAIKey, setOpenAIKey] = useState("");
  const [openAIModel, setOpenAIModel] = useState("tts-1");
  const [openAIVoice, setOpenAIVoice] = useState("alloy");

  // Custom/Compatible config state
  const [customEndpoint, setCustomEndpoint] = useState("");
  const [customApiKey, setCustomApiKey] = useState("");
  const [customModel, setCustomModel] = useState("tts");
  const [customVoice, setCustomVoice] = useState("default");

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResultState | null>(null);

  // STT state
  const defaultSTTProvider = isAndroid
    ? STTProviders.ANDROID_LOCAL
    : isDesktop
      ? STTProviders.DESKTOP_LOCAL
      : STTProviders.CHROME_AI_MULTIMODAL;
  const [selectedSTTProvider, setSelectedSTTProvider] =
    useState<string>("disabled");
  const [androidSTTEndpoint, setAndroidSTTEndpoint] = useState(
    "http://127.0.0.1:8765",
  );
  const [desktopSTTEndpoint, setDesktopSTTEndpoint] = useState(
    "http://127.0.0.1:11438",
  );
  const [desktopSTTModel, setDesktopSTTModel] = useState("tiny");
  const [desktopSTTLanguage, setDesktopSTTLanguage] = useState("auto");
  const [chromeAiSTTStatus, setChromeAiSTTStatus] =
    useState<ChromeAiSTTStatus | null>(null);
  const [sttConfig, setSTTConfig] = useState<STTConfigState>({
    openai: {
      apiKey: "",
      model: "whisper-1",
    },
    "openai-compatible": {
      endpoint: "",
      apiKey: "",
      model: "whisper",
    },
    chromeAi: {
      language: "en",
    },
  });

  // Check Kokoro status on mount
  useEffect(() => {
    if (selectedProvider === "kokoro" && !isAndroid) {
      handleCheckKokoroStatus();
    }

    // Load existing setup data (only on first mount)
    const ttsData = setupData?.tts as TTSPersistedData | undefined;
    const sttData = setupData?.stt as STTPersistedData | undefined;
    const sttConfigData = setupData?.sttConfig as STTConfigState | undefined;

    if (ttsData) {
      if (ttsData.enabled === false) {
        setSelectedProvider("disabled");
      } else if (ttsData.provider) {
        const normalizedTTSProvider =
          (isAndroid || isDesktop) && ttsData.provider === "kokoro"
            ? defaultTTSProvider
            : ttsData.provider;
        setSelectedProvider(normalizedTTSProvider as TTSProviderId);
      }
      if (ttsData.kokoro) setKokoroConfig(ttsData.kokoro);
      if (ttsData.openai?.apiKey) setOpenAIKey(ttsData.openai.apiKey);
      if (ttsData.openai?.model) setOpenAIModel(ttsData.openai.model);
      if (ttsData.openai?.voice) setOpenAIVoice(ttsData.openai.voice);
      if (ttsData["openai-compatible"]?.endpoint)
        setCustomEndpoint(ttsData["openai-compatible"].endpoint);
      if (ttsData["openai-compatible"]?.apiKey)
        setCustomApiKey(ttsData["openai-compatible"].apiKey);
      if (ttsData["openai-compatible"]?.model)
        setCustomModel(ttsData["openai-compatible"].model);
      if (ttsData["openai-compatible"]?.voice)
        setCustomVoice(ttsData["openai-compatible"].voice);
      if (ttsData["android-local"]?.endpoint)
        setAndroidTTSEndpoint(ttsData["android-local"].endpoint);
      if (ttsData["desktop-local"]?.endpoint)
        setDesktopTTSEndpoint(ttsData["desktop-local"].endpoint);
      if (ttsData["desktop-local"]?.referenceText)
        setDesktopReferenceText(ttsData["desktop-local"].referenceText);
      if (ttsData["desktop-local"]?.referenceLanguage)
        setDesktopReferenceLanguage(ttsData["desktop-local"].referenceLanguage);
      if (ttsData["desktop-local"]?.speed)
        setDesktopSpeed(ttsData["desktop-local"].speed);
      if (ttsData["desktop-local"]?.topK)
        setDesktopTopK(ttsData["desktop-local"].topK);
      if (ttsData["desktop-local"]?.topP)
        setDesktopTopP(ttsData["desktop-local"].topP);
      if (ttsData["desktop-local"]?.temperature)
        setDesktopTemperature(ttsData["desktop-local"].temperature);
      if (ttsData["desktop-local"]?.pytorchBackend)
        setDesktopPytorchBackend(ttsData["desktop-local"].pytorchBackend);
      if (ttsData["desktop-local"]?.trained)
        setDesktopTrained(ttsData["desktop-local"].trained);
    }

    if (sttData?.enabled === false) {
      setSelectedSTTProvider("disabled");
    } else if (sttData?.provider) {
      const normalizedSTTProvider =
        !isWebMode && sttData.provider === STTProviders.CHROME_AI_MULTIMODAL
          ? defaultSTTProvider
          : sttData.provider;
      setSelectedSTTProvider(normalizedSTTProvider);
    }
    if (sttConfigData) {
      setSTTConfig(sttConfigData);
      if (sttConfigData["android-local"]?.endpoint)
        setAndroidSTTEndpoint(sttConfigData["android-local"].endpoint);
      if (sttConfigData["desktop-local"]?.endpoint)
        setDesktopSTTEndpoint(sttConfigData["desktop-local"].endpoint);
      if (sttConfigData["desktop-local"]?.model)
        setDesktopSTTModel(sttConfigData["desktop-local"].model);
      if (sttConfigData["desktop-local"]?.language)
        setDesktopSTTLanguage(sttConfigData["desktop-local"].language);
    }

    // Mark initial load complete
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Save data whenever TTS or STT config changes (but skip initial load)
  useEffect(() => {
    if (initialLoadRef.current) return;

    Logger.log("TTSProviderStep", "Saving TTS/STT config");

    const ttsData = {
      enabled: selectedProvider !== "disabled",
      provider:
        selectedProvider === "disabled" ? defaultTTSProvider : selectedProvider,
      kokoro: kokoroConfig,
      openai: {
        apiKey: openAIKey,
        model: openAIModel,
        voice: openAIVoice,
      },
      "openai-compatible": {
        endpoint: customEndpoint,
        apiKey: customApiKey,
        model: customModel,
        voice: customVoice,
      },
      "android-local": {
        endpoint: androidTTSEndpoint,
        voice: "vits-local",
      },
      "desktop-local": {
        endpoint: desktopTTSEndpoint,
        model: "gpt-sovits",
        pytorchBackend: desktopPytorchBackend,
        referenceAudio: desktopReferenceAudio,
        referenceText: desktopReferenceText,
        referenceLanguage: desktopReferenceLanguage,
        speed: desktopSpeed,
        topK: desktopTopK,
        topP: desktopTopP,
        temperature: desktopTemperature,
        trained: desktopTrained,
      },
    };

    const sttData = {
      enabled: selectedSTTProvider !== "disabled",
      provider:
        selectedSTTProvider === "disabled"
          ? defaultSTTProvider
          : selectedSTTProvider,
    };

    // Add android-local to sttConfig
    const updatedSTTConfig = {
      ...sttConfig,
      "android-local": {
        endpoint: androidSTTEndpoint,
        model: "whisper-local",
      },
      "desktop-local": {
        endpoint: desktopSTTEndpoint,
        model: desktopSTTModel,
        language: desktopSTTLanguage,
        threads: 4,
      },
    };

    updateSetupData({
      tts: ttsData,
      stt: sttData,
      sttConfig: updatedSTTConfig,
    });
  }, [
    selectedProvider,
    kokoroConfig,
    openAIKey,
    openAIModel,
    openAIVoice,
    customEndpoint,
    customApiKey,
    customModel,
    customVoice,
    androidTTSEndpoint,
    selectedSTTProvider,
    sttConfig,
    androidSTTEndpoint,
    desktopSTTEndpoint,
    desktopSTTModel,
    desktopSTTLanguage,
    desktopTTSEndpoint,
    desktopReferenceAudio,
    desktopReferenceText,
    desktopReferenceLanguage,
    desktopSpeed,
    desktopTopK,
    desktopTopP,
    desktopTemperature,
    desktopPytorchBackend,
    desktopTrained,
    defaultSTTProvider,
    defaultTTSProvider,
    updateSetupData,
  ]);

  const providers = [
    // Android Local TTS - only on Android, first and recommended
    ...(isAndroid
      ? [
          {
            id: "android-local",
            name: "Android Local",
            description: "On-device TTS using VITS",
            iconName: "speaker",
            recommended: true,
            pros: [
              "100% Free",
              "Privacy-focused (local)",
              "No internet needed",
              "Natural voice quality",
            ],
            cons: ["Single voice option", "Fixed voice style"],
            requirements: "Ready to use! Pre-installed on device",
          },
        ]
      : []),
    // Desktop Local TTS - only on Desktop, first and recommended
    ...(isDesktop
      ? [
          {
            id: "desktop-local",
            name: "Desktop Local",
            description: "On-device TTS using GPT-SoVITS",
            iconName: "speaker",
            recommended: true,
            pros: [
              "100% Free",
              "Privacy-focused (local)",
              "No internet needed",
              "Voice cloning support",
              "Natural voice quality",
            ],
            cons: ["Requires voice training", "GPU recommended"],
            requirements: "Ready to use! Pre-installed on desktop",
          },
        ]
      : []),
    {
      id: "disabled",
      name: "Disabled",
      description: "Turn off text-to-speech",
      iconName: "x",
      recommended: false,
      pros: ["No resource usage", "Faster performance", "Text-only mode"],
      cons: ["No voice output", "Silent virtual companion"],
      requirements: "None",
    },
    // Kokoro - only on non-Android
    ...(!isAndroid
      ? [
          {
            id: "kokoro",
            name: "Kokoro TTS",
            description: "High-quality local text-to-speech",
            iconName: "speaker",
            recommended: !isAndroid,
            pros: [
              "100% Free",
              "Privacy-focused (runs locally)",
              "Natural-sounding voices",
              "Multiple voice options",
              "No API keys needed",
            ],
            cons: [
              "Initial model download (~86MB)",
              "Requires WebGPU or WASM support",
              "First load may be slow",
            ],
            requirements: "Modern browser with WebGPU or WebAssembly",
          },
        ]
      : []),
    {
      id: "openai",
      name: "OpenAI TTS",
      description: "Cloud-based text-to-speech from OpenAI",
      iconName: "volume",
      recommended: false,
      pros: [
        "High quality",
        "Fast response",
        "Multiple voices",
        "Works on any device",
      ],
      cons: [
        "Requires API key",
        "Costs money per request",
        "Needs internet connection",
        "Audio data sent to OpenAI",
      ],
      requirements: "OpenAI API key (paid service)",
    },
    {
      id: "openai-compatible",
      name: "OpenAI-Compatible",
      description: "Custom OpenAI-compatible TTS endpoint",
      iconName: "link",
      recommended: false,
      pros: [
        "Use your own server",
        "Full control",
        "Privacy options",
        "Custom models",
      ],
      cons: ["Requires setup", "Manual configuration", "Compatibility varies"],
      requirements: "OpenAI-compatible TTS server",
    },
  ];

  // Handler for Kokoro config changes
  const handleKokoroConfigChange = (field: string, value: unknown) => {
    setKokoroConfig((prev) => ({ ...prev, [field]: value }));
    if (field === "device") {
      setTimeout(
        () => handleCheckKokoroStatus(typeof value === "string" ? value : null),
        100,
      );
    }
  };

  // Initialize Kokoro (simplified - user can fully configure in settings later)
  const handleKokoroInit = async () => {
    setKokoroStatus((prev) => ({
      ...prev,
      downloading: true,
      progress: 0,
      details: "Starting download...",
    }));
    try {
      await TTSServiceProxy.configure({
        enabled: true,
        provider: TTSProviders.KOKORO,
        kokoro: kokoroConfig,
      });

      await TTSServiceProxy.initializeKokoro((progressData: unknown) => {
        const progressRecord = asRecord(progressData);
        const percent =
          typeof progressRecord.percent === "number"
            ? progressRecord.percent
            : 0;
        const details =
          typeof progressRecord.file === "string"
            ? progressRecord.file
            : typeof progressRecord.status === "string"
              ? progressRecord.status
              : "Downloading...";
        setKokoroStatus((prev) => ({
          ...prev,
          progress: percent,
          downloading: true,
          details,
        }));
      });

      setKokoroStatus((prev) => ({
        ...prev,
        initialized: true,
        downloading: false,
        progress: 100,
        details: "Complete!",
        message: "Ready",
      }));
    } catch (error: unknown) {
      Logger.error("other", "Kokoro init failed:", error);
      setKokoroStatus((prev) => ({
        ...prev,
        initialized: false,
        downloading: false,
        progress: 0,
        details: "",
        message: getErrorMessage(error),
      }));
    }
  };

  // Check Kokoro status
  const handleCheckKokoroStatus = async (
    desiredDeviceOverride: string | null = null,
  ) => {
    try {
      const status =
        (await TTSServiceProxy.checkKokoroStatus()) as KokoroStatusResult;

      const desiredDevice =
        desiredDeviceOverride || kokoroConfig.device || "auto";
      const actualDevice = status.config?.device || null;
      const isInitializedWithCorrectDevice =
        status.initialized && actualDevice === desiredDevice;

      setKokoroStatus((prev) => ({
        ...prev,
        initialized: isInitializedWithCorrectDevice || false,
      }));
    } catch (error: unknown) {
      Logger.error("other", "Check status failed:", error);
    }
  };

  // Test Kokoro voice
  const handleTestKokoroVoice = async () => {
    setTestingVoice(true);
    try {
      // Configure TTS with current Kokoro config
      await TTSServiceProxy.configure({
        provider: "kokoro",
        enabled: true,
        kokoro: kokoroConfig,
      });

      // Generate and play test speech
      await TTSServiceProxy.testConnection(
        "Hello! This is a test of the Kokoro voice.",
      );
    } catch (error: unknown) {
      Logger.error("other", "Voice test failed:", error);
    } finally {
      setTestingVoice(false);
    }
  };

  // STT Providers
  const hasMultimodal = Boolean(
    (setupData as SetupDataWithMultimodal | undefined)?.multimodal
      ?.audioSupport,
  );

  const sttProviders = [
    ...(isAndroid
      ? [
          {
            id: STTProviders.ANDROID_LOCAL,
            name: "Android Local",
            iconName: "microphone",
            description: "On-device STT using Whisper",
            recommended: true,
            available: true,
            requirements: "Ready to use! Pre-installed on device",
          },
        ]
      : []),
    // Desktop Local STT - only on Desktop
    ...(isDesktop
      ? [
          {
            id: STTProviders.DESKTOP_LOCAL,
            name: "Desktop Local",
            iconName: "microphone",
            description: "On-device STT using Whisper",
            recommended: true,
            available: true,
            requirements: "Ready to use! Pre-installed on desktop",
          },
        ]
      : []),
    {
      id: "disabled",
      name: "Disabled",
      iconName: "x",
      description: "Turn off speech recognition",
      recommended: false,
      available: true,
      requirements: "None - text input only",
    },
    ...(isWebMode
      ? [
          {
            id: STTProviders.CHROME_AI_MULTIMODAL,
            name: "Chrome AI",
            iconName: "microphone",
            description: "On-device speech recognition",
            recommended: !isAndroid,
            available: hasMultimodal,
            requirements: hasMultimodal
              ? "Ready to use!"
              : "Requires multimodal audio support",
          },
        ]
      : []),
    {
      id: STTProviders.OPENAI,
      name: "OpenAI Whisper",
      iconName: "globe",
      description: "Cloud-based speech recognition",
      recommended: false,
      available: true,
      requirements: "OpenAI API key required",
    },
    {
      id: STTProviders.OPENAI_COMPATIBLE,
      name: "OpenAI-Compatible",
      iconName: "settings",
      description: "Custom STT endpoint",
      recommended: false,
      available: true,
      requirements: "Custom endpoint URL",
    },
  ];

  const handleSTTProviderSelect = (providerId: string) => {
    setSelectedSTTProvider(providerId);
  };

  const handleSTTConfigChange = <K extends keyof STTConfigState>(
    providerKey: K,
    newConfig: STTConfigState[K],
  ) => {
    setSTTConfig((prev) => ({
      ...prev,
      [providerKey]: newConfig,
    }));
  };

  // Chrome AI STT Status Check
  const handleCheckChromeAISTTStatus = async () => {
    Logger.log("TTSProviderStep", "Checking Chrome AI STT status...");
    setChromeAiSTTStatus({
      checking: true,
      state: null,
      message: "Checking status...",
      details: "",
      downloading: false,
    });

    try {
      // Use regular Chrome AI availability check (same API, just with audio support)
      const rawResult = await AIServiceProxy.checkChromeAIAvailability();
      const result = asRecord(rawResult);
      Logger.log("TTSProviderStep", "Chrome AI STT status result:", result);

      setChromeAiSTTStatus({
        checking: false,
        available: result.available === true,
        state: typeof result.state === "string" ? result.state : null,
        message:
          (typeof result.message === "string" ? result.message : "") ||
          "Unknown status",
        details: typeof result.details === "string" ? result.details : "",
        downloading: result.state === "downloading",
      });
    } catch (error: unknown) {
      Logger.error(
        "TTSProviderStep",
        "Chrome AI STT status check failed:",
        error,
      );
      setChromeAiSTTStatus({
        checking: false,
        available: false,
        state: null,
        message: getErrorMessage(error),
        details: "",
        downloading: false,
      });
    }
  };

  // Chrome AI STT Download
  const handleStartChromeAISTTDownload = async () => {
    Logger.log("TTSProviderStep", "Starting Chrome AI model download...");
    setChromeAiSTTStatus((prev) => ({
      ...(prev ?? {
        checking: false,
        state: null,
        message: "",
        details: "",
        downloading: false,
      }),
      downloading: true,
    }));

    try {
      await AIServiceProxy.startChromeAIDownload();
      await handleCheckChromeAISTTStatus();
    } catch (error: unknown) {
      Logger.error("TTSProviderStep", "Chrome AI download failed:", error);
      setChromeAiSTTStatus((prev) => ({
        ...(prev ?? {
          checking: false,
          state: null,
          message: "",
          details: "",
          downloading: false,
        }),
        downloading: false,
        message: getErrorMessage(error),
      }));
    }
  };

  const handleProviderSelect = (providerId: string) => {
    setSelectedProvider(providerId as TTSProviderId);
    setTestResult(null);
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      // Build config based on selected provider
      const testConfig: TTSServiceTestConfig = {
        provider: selectedProvider,
        enabled: true,
      };

      if (selectedProvider === "disabled") {
        setTestResult({
          success: true,
          message: "TTS is disabled. No provider test is required.",
        });
        return;
      }

      if (selectedProvider === "openai") {
        if (!openAIKey) {
          throw new Error("API key is required");
        }
        testConfig.openai = {
          apiKey: openAIKey,
          model: openAIModel,
          voice: openAIVoice,
        };
      } else if (selectedProvider === "openai-compatible") {
        if (!customEndpoint) {
          throw new Error("Endpoint is required");
        }
        testConfig["openai-compatible"] = {
          endpoint: customEndpoint,
          apiKey: customApiKey,
          model: customModel,
          voice: customVoice,
        };
      }

      // Configure TTS service
      await TTSServiceProxy.configure(
        testConfig as unknown as Record<string, unknown>,
      );

      // Test with sample text
      await TTSServiceProxy.testConnection("Hello, this is a test.");

      setTestResult({ success: true, message: "TTS connection successful!" });
    } catch (error: unknown) {
      setTestResult({ success: false, message: getErrorMessage(error) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="setup-step space-y-3 sm:space-y-4">
      <div className="mb-2 sm:mb-3">
        <h2 className="text-xl sm:text-2xl font-bold mb-1 bg-gradient-to-r from-white/90 to-white/70 bg-clip-text text-transparent">
          Voice Provider
        </h2>
        <p className="text-xs sm:text-sm text-white/90">
          Select your text-to-speech service
        </p>
      </div>

      {/* Provider Cards */}
      <ProviderSelection
        providers={providers}
        selectedProvider={selectedProvider}
        onProviderSelect={handleProviderSelect}
        isLightBackground={false}
        compact={true}
      />

      {/* Provider-specific Configuration */}
      {selectedProvider === "disabled" && (
        <Card padding="none" className="p-3 sm:p-4">
          <div className="flex items-start gap-3">
            <Icon
              name="info"
              size={20}
              className="text-white/80 flex-shrink-0 mt-0.5"
            />
            <div className="space-y-2 text-sm text-white/90">
              <p className="font-semibold">Text-to-Speech Disabled</p>
              <p className="text-white/70">
                The virtual companion will be silent. You can still use all
                other features, but AI responses won't be spoken aloud. You can
                enable TTS later in Settings.
              </p>
            </div>
          </div>
        </Card>
      )}

      {selectedProvider === "android-local" && (
        <div className="space-y-3">
          {/* Info Banner */}
          <Card variant="elevated">
            <div className="flex items-start gap-2">
              <Icon
                name="speaker"
                size={18}
                className="text-white/80 flex-shrink-0 mt-0.5"
              />
              <p className="text-xs text-white/70">
                <span className="font-semibold">Android Local TTS</span> -
                On-device text-to-speech using VITS VCTK neural network with 109
                different voices!
              </p>
            </div>
          </Card>

          {/* Status */}
          <Card>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-white/70"></div>
              <span className="text-sm font-semibold text-white/90">
                Ready to use!
              </span>
            </div>
            <p className="text-xs text-white/60">
              Model: VITS VCTK • 109 multi-speaker voices
            </p>
          </Card>

          {/* Advanced Config */}
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-white/90 flex items-center justify-between p-2 rounded hover:bg-white/5">
              <span>Advanced Settings</span>
              <Icon
                name="arrow-down"
                size={14}
                className="group-open:rotate-180 transition-transform"
              />
            </summary>
            <Card className="mt-2 space-y-3">
              <div>
                <label className="block text-xs font-medium text-white/90 mb-1">
                  Endpoint URL
                </label>
                <Input
                  type="text"
                  value={androidTTSEndpoint}
                  onChange={(e) => setAndroidTTSEndpoint(e.target.value)}
                  placeholder="http://127.0.0.1:8765"
                  className="w-full text-xs sm:text-sm"
                />
                <p className="text-[10px] text-white/50 mt-1">
                  Local HTTP server for TTS on your Android device
                </p>
              </div>
            </Card>
          </details>
        </div>
      )}

      {selectedProvider === "desktop-local" && (
        <GPTSoVITSConfig
          config={{
            pytorchBackend: desktopPytorchBackend,
            referenceText: desktopReferenceText,
            referenceLanguage: desktopReferenceLanguage,
            speed: desktopSpeed,
            topK: desktopTopK,
            topP: desktopTopP,
            temperature: desktopTemperature,
          }}
          onChange={(field, value) => {
            if (field === "pytorchBackend" && typeof value === "string")
              setDesktopPytorchBackend(value);
            if (field === "referenceText" && typeof value === "string")
              setDesktopReferenceText(value);
            if (field === "referenceLanguage" && typeof value === "string")
              setDesktopReferenceLanguage(value);
            if (field === "speed" && typeof value === "number")
              setDesktopSpeed(value);
            if (field === "topK" && typeof value === "number")
              setDesktopTopK(value);
            if (field === "topP" && typeof value === "number")
              setDesktopTopP(value);
            if (field === "temperature" && typeof value === "number")
              setDesktopTemperature(value);
          }}
          isSetupMode={true}
          showTitle={false}
        />
      )}

      {selectedProvider === "kokoro" && (
        <KokoroTTSConfig
          config={kokoroConfig}
          onChange={handleKokoroConfigChange}
          kokoroStatus={kokoroStatus}
          onInitialize={handleKokoroInit}
          onCheckStatus={handleCheckKokoroStatus}
          onTestVoice={handleTestKokoroVoice}
          testingVoice={testingVoice}
          isLightBackground={false}
          showTitle={false}
          showTestButton={true}
          isSetupMode={true}
        />
      )}

      {selectedProvider === "openai" && (
        <Card padding="none" className="p-2 sm:p-3">
          <h3 className="text-sm font-semibold text-white mb-2">
            OpenAI TTS Config
          </h3>
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">
                API Key <span className="text-red-400">*</span>
              </label>
              <Input
                type="password"
                value={openAIKey}
                onChange={(e) => setOpenAIKey(e.target.value)}
                placeholder="sk-..."
                className="w-full text-xs sm:text-sm"
              />
              <p className="text-[10px] sm:text-xs text-white/70 mt-1">
                Same API key as LLM provider. Get it from{" "}
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/80 hover:text-white/70"
                >
                  platform.openai.com
                </a>
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">
                Model
              </label>
              <Select
                value={openAIModel}
                onChange={(e) => setOpenAIModel(e.target.value)}
                className="w-full text-xs sm:text-sm"
                options={[
                  { value: "tts-1", label: "tts-1 (Standard)" },
                  { value: "tts-1-hd", label: "tts-1-hd (HD)" },
                ]}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">
                Voice
              </label>
              <Select
                value={openAIVoice}
                onChange={(e) => setOpenAIVoice(e.target.value)}
                className="w-full text-xs sm:text-sm"
                options={[
                  { value: "alloy", label: "Alloy" },
                  { value: "echo", label: "Echo" },
                  { value: "fable", label: "Fable" },
                  { value: "onyx", label: "Onyx" },
                  { value: "nova", label: "Nova" },
                  { value: "shimmer", label: "Shimmer" },
                ]}
              />
            </div>
            <div className="pt-1">
              <Button
                onClick={testConnection}
                disabled={!openAIKey || testing}
                className="w-full text-xs sm:text-sm font-semibold flex items-center justify-center gap-2"
              >
                {testing ? (
                  <>
                    <Icon name="refresh" size={14} className="animate-spin" />{" "}
                    Testing...
                  </>
                ) : (
                  <>
                    <Icon name="test" size={14} /> Test
                  </>
                )}
              </Button>
            </div>
            {testResult && (
              <StatusMessage
                message={
                  testResult.success
                    ? `success:${testResult.message}`
                    : `error:${testResult.message}`
                }
                isLightBackground={isLightBackground}
                className="mt-2"
              />
            )}
          </div>
        </Card>
      )}

      {selectedProvider === "openai-compatible" && (
        <Card padding="none" className="p-2 sm:p-3">
          <h3 className="text-sm font-semibold text-white mb-2">
            OpenAI-Compatible Config
          </h3>
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">
                Endpoint URL <span className="text-red-400">*</span>
              </label>
              <Input
                type="text"
                value={customEndpoint}
                onChange={(e) => setCustomEndpoint(e.target.value)}
                placeholder="http://localhost:8000"
                className="w-full text-xs sm:text-sm"
              />
              <p className="text-[10px] sm:text-xs text-white/70 mt-1">
                Base URL (will append /v1/audio/speech)
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">
                API Key (Optional)
              </label>
              <Input
                type="password"
                value={customApiKey}
                onChange={(e) => setCustomApiKey(e.target.value)}
                placeholder="Leave empty if not required"
                className="w-full text-xs sm:text-sm"
              />
              <p className="text-[10px] sm:text-xs text-white/70 mt-1">
                API key for authentication
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">
                Model
              </label>
              <Input
                type="text"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder="tts"
                className="w-full text-xs sm:text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">
                Voice
              </label>
              <Input
                type="text"
                value={customVoice}
                onChange={(e) => setCustomVoice(e.target.value)}
                placeholder="default"
                className="w-full text-xs sm:text-sm"
              />
            </div>
            <div className="pt-1">
              <Button
                onClick={testConnection}
                disabled={!customEndpoint || testing}
                className="w-full text-xs sm:text-sm font-semibold flex items-center justify-center gap-2"
              >
                {testing ? (
                  <>
                    <Icon name="refresh" size={14} className="animate-spin" />{" "}
                    Testing...
                  </>
                ) : (
                  <>
                    <Icon name="test" size={14} /> Test
                  </>
                )}
              </Button>
            </div>
            {testResult && (
              <StatusMessage
                message={
                  testResult.success
                    ? `success:${testResult.message}`
                    : `error:${testResult.message}`
                }
                isLightBackground={isLightBackground}
                className="mt-2"
              />
            )}
          </div>
        </Card>
      )}

      {/* STT Section */}
      <div className="mt-6 pt-6 border-t border-white/10">
        <div className="mb-3">
          <h3 className="text-lg sm:text-xl font-bold mb-1 bg-gradient-to-r from-white/90 to-white/70 bg-clip-text text-transparent">
            Speech-to-Text
          </h3>
          <p className="text-xs sm:text-sm text-white/90">
            Select your speech recognition service
          </p>
        </div>

        {/* STT Provider Cards */}
        <div className="mb-4">
          <ProviderSelection
            providers={sttProviders}
            selectedProvider={selectedSTTProvider}
            onProviderSelect={handleSTTProviderSelect}
            isLightBackground={false}
            compact={true}
            showProsCons={false}
          />
        </div>

        {/* STT Provider-specific Configuration */}
        {selectedSTTProvider === "disabled" && (
          <Card padding="none" className="p-3 sm:p-4">
            <div className="flex items-start gap-3">
              <Icon
                name="info"
                size={20}
                className="text-white/80 flex-shrink-0 mt-0.5"
              />
              <div className="space-y-2 text-sm text-white/90">
                <p className="font-semibold">Speech-to-Text Disabled</p>
                <p className="text-white/70">
                  Voice input will be unavailable. You'll need to type your
                  messages instead. You can enable STT later in Settings if you
                  want to use voice input.
                </p>
              </div>
            </div>
          </Card>
        )}

        {selectedSTTProvider === STTProviders.ANDROID_LOCAL && (
          <div className="space-y-3">
            {/* Info Banner */}
            <Card variant="elevated">
              <div className="flex items-start gap-2">
                <Icon
                  name="microphone"
                  size={18}
                  className="text-white/80 flex-shrink-0 mt-0.5"
                />
                <p className="text-xs text-white/70">
                  <span className="font-semibold">Android Local STT</span> -
                  On-device speech recognition using Whisper. Runs entirely on
                  your device!
                </p>
              </div>
            </Card>

            {/* Status */}
            <Card>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-white/70"></div>
                <span className="text-sm font-semibold text-white/90">
                  Ready to use!
                </span>
              </div>
              <p className="text-xs text-white/60">
                Model: Whisper Tiny • Accurate speech recognition
              </p>
            </Card>

            {/* Advanced Config */}
            <details className="group">
              <summary className="cursor-pointer text-sm font-medium text-white/90 flex items-center justify-between p-2 rounded hover:bg-white/5">
                <span>Advanced Settings</span>
                <Icon
                  name="arrow-down"
                  size={14}
                  className="group-open:rotate-180 transition-transform"
                />
              </summary>
              <div className="mt-2">
                <Card className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-white/90 mb-1">
                      Endpoint URL
                    </label>
                    <Input
                      type="text"
                      value={androidSTTEndpoint}
                      onChange={(e) => setAndroidSTTEndpoint(e.target.value)}
                      placeholder="http://127.0.0.1:8765"
                      className="w-full text-xs sm:text-sm"
                    />
                    <p className="text-[10px] text-white/50 mt-1">
                      Local HTTP server for STT on your Android device
                    </p>
                  </div>
                </Card>
              </div>
            </details>
          </div>
        )}

        {selectedSTTProvider === STTProviders.DESKTOP_LOCAL && (
          <DesktopSTTConfig
            config={{
              endpoint: desktopSTTEndpoint,
              model: desktopSTTModel,
              language: desktopSTTLanguage,
            }}
            onChange={(updates) => {
              if (typeof updates.endpoint === "string")
                setDesktopSTTEndpoint(updates.endpoint);
              if (typeof updates.model === "string")
                setDesktopSTTModel(updates.model);
              if (typeof updates.language === "string")
                setDesktopSTTLanguage(updates.language);
            }}
            isSetupMode={true}
          />
        )}

        {isWebMode &&
          selectedSTTProvider === STTProviders.CHROME_AI_MULTIMODAL && (
            <ChromeAISTTConfig
              config={sttConfig.chromeAi}
              onChange={(updates) =>
                handleSTTConfigChange("chromeAi", {
                  ...sttConfig.chromeAi,
                  ...updates,
                })
              }
              chromeAiStatus={
                chromeAiSTTStatus ?? {
                  checking: false,
                  state: null,
                  message: "",
                  details: "",
                  downloading: false,
                }
              }
              onCheckStatus={handleCheckChromeAISTTStatus}
              onStartDownload={handleStartChromeAISTTDownload}
              isLightBackground={false}
              isSetupMode={true}
            />
          )}

        {selectedSTTProvider === STTProviders.OPENAI && (
          <OpenAISTTConfig
            config={sttConfig.openai}
            onChange={(updates: OpenAISTTUpdates) => {
              handleSTTConfigChange("openai", {
                ...sttConfig.openai,
                ...updates,
              });
            }}
            isLightBackground={false}
          />
        )}

        {selectedSTTProvider === STTProviders.OPENAI_COMPATIBLE && (
          <OpenAICompatibleSTTConfig
            config={sttConfig["openai-compatible"]}
            onChange={(updates: OpenAICompatibleSTTUpdates) => {
              handleSTTConfigChange("openai-compatible", {
                ...sttConfig["openai-compatible"],
                ...updates,
              });
            }}
            isLightBackground={false}
          />
        )}
      </div>
    </div>
  );
};

export default TTSProviderStep;
