import {
  DefaultAIConfig,
  DefaultSTTConfig,
  DefaultTTSConfig,
  type AIConfig,
  type STTConfig,
  type TTSConfig,
} from "../config/aiConfig";
import { DefaultUIConfig, type UIConfig } from "../config/uiConfig";
import ChatService, {
  type ChatNode,
  type ExportedChatTree,
  type FlatChatMessage,
} from "../services/ChatService";
import chatHistoryService from "../services/ChatHistoryService";
import StorageServiceProxy from "../services/proxies/StorageServiceProxy";
import {
  AIServiceProxy,
  LanguageDetectorServiceProxy,
  RewriterServiceProxy,
  SummarizerServiceProxy,
  TranslatorServiceProxy,
  WriterServiceProxy,
} from "../services/proxies";
import {
  DEFAULT_SETUP_STATE,
  TOTAL_SETUP_STEPS,
  type SetupStateSnapshot,
} from "../stores/createSetupStore";
import { useConfigStore } from "../stores/useConfigStore";
import { isVAssistTestMode, vassistTestFlags } from "./runtime";

type PlainObject = Record<string, unknown>;

type FakeAiMessage = {
  role?: string;
  content?: unknown;
  [key: string]: unknown;
};

type FakeAiSendResult = {
  success: boolean;
  response: string | null;
  cancelled: boolean;
  error: Error | null;
};

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T[K] extends PlainObject
      ? DeepPartial<T[K]>
      : T[K];
};

export interface SeedCompletedAppStateOptions {
  uiConfig?: DeepPartial<UIConfig>;
  aiConfig?: DeepPartial<AIConfig>;
  ttsConfig?: DeepPartial<TTSConfig>;
  sttConfig?: DeepPartial<STTConfig>;
  setupState?: DeepPartial<SetupStateSnapshot>;
  clearFirst?: boolean;
}

export interface SeedSetupWizardStateOptions {
  uiConfig?: DeepPartial<UIConfig>;
  aiConfig?: DeepPartial<AIConfig>;
  ttsConfig?: DeepPartial<TTSConfig>;
  sttConfig?: DeepPartial<STTConfig>;
  setupState?: DeepPartial<SetupStateSnapshot>;
  clearFirst?: boolean;
}

export interface SeedChatHistoryEntry {
  chatId?: string;
  title?: string;
  messages: Array<{
    id?: string;
    role: string;
    content: string;
  }>;
  metadata?: Record<string, unknown>;
}

export interface VAssistTestApi {
  getFlags: () => typeof vassistTestFlags;
  clearPersistedState: () => Promise<void>;
  seedCompletedAppState: (options?: SeedCompletedAppStateOptions) => Promise<{
    uiConfig: UIConfig;
    aiConfig: AIConfig;
    ttsConfig: TTSConfig;
    sttConfig: STTConfig;
    setupState: SetupStateSnapshot;
  }>;
  seedSetupWizardState: (options?: SeedSetupWizardStateOptions) => Promise<{
    uiConfig: UIConfig;
    aiConfig: AIConfig;
    ttsConfig: TTSConfig;
    sttConfig: STTConfig;
    setupState: SetupStateSnapshot;
  }>;
  clearAndSeedReadyState: (options?: SeedCompletedAppStateOptions) => Promise<{
    uiConfig: UIConfig;
    aiConfig: AIConfig;
    ttsConfig: TTSConfig;
    sttConfig: STTConfig;
    setupState: SetupStateSnapshot;
  }>;
  clearAndSeedSetupWizardState: (
    options?: SeedSetupWizardStateOptions,
  ) => Promise<{
    uiConfig: UIConfig;
    aiConfig: AIConfig;
    ttsConfig: TTSConfig;
    sttConfig: STTConfig;
    setupState: SetupStateSnapshot;
  }>;
  seedChatHistory: (
    entries: SeedChatHistoryEntry[],
  ) => Promise<{ chatIds: string[] }>;
  getCurrentChatMessages: () => Array<{
    id: string;
    role: FlatChatMessage["role"];
    content: string;
    branchInfo: FlatChatMessage["branchInfo"];
  }>;
  getPersistedChats: () => Promise<
    Array<{
      chatId: string;
      title: string;
      messageCount: number;
      createdAt: string;
      updatedAt: string;
    }>
  >;
  getPersistedChatMessages: (chatId: string) => Promise<
    Array<{
      id: string;
      role: FlatChatMessage["role"];
      content: string;
      branchInfo: FlatChatMessage["branchInfo"];
    }>
  >;
  hydrateConfigStore: () => Promise<void>;
  flushConfigSaves: (
    kinds?: Array<"ui" | "ai" | "tts" | "stt">,
  ) => Promise<void>;
}

interface PendingReadyStateBootstrap {
  kind: "ready-state";
  options?: SeedCompletedAppStateOptions;
}

interface PendingSetupWizardStateBootstrap {
  kind: "setup-wizard-state";
  options?: SeedSetupWizardStateOptions;
}

const BOOTSTRAP_PAYLOAD_SESSION_KEY = "__vassist:test-bootstrap-payload";
const FAKE_LANGUAGE_MODEL_SESSION_KEY = "__vassist:test-fake-language-model";

const TEST_RUNTIME_MARKERS = {
  fakeMediaInstalled: "__vassistFakeMediaInstalled",
  fakeAiInstalled: "__vassistFakeAiInstalled",
  fakeLanguageModelInstalled: "__vassistFakeLanguageModelInstalled",
} as const;

type TestWindow = Window & {
  [TEST_RUNTIME_MARKERS.fakeMediaInstalled]?: boolean;
  [TEST_RUNTIME_MARKERS.fakeAiInstalled]?: boolean;
  [TEST_RUNTIME_MARKERS.fakeLanguageModelInstalled]?: boolean;
  __VASSIST_TEST_API__?: VAssistTestApi;
};

const createFakeMediaDevice = (
  kind: MediaDeviceKind,
  deviceId: string,
  label: string,
  groupId: string,
): MediaDeviceInfo =>
  ({
    deviceId,
    kind,
    label,
    groupId,
    toJSON() {
      return {
        deviceId,
        kind,
        label,
        groupId,
      };
    },
  }) as MediaDeviceInfo;

const installFakeMediaDevices = (): void => {
  if (
    !isVAssistTestMode ||
    typeof window === "undefined" ||
    typeof navigator === "undefined" ||
    !navigator.mediaDevices
  ) {
    return;
  }

  const testWindow = window as TestWindow;
  if (testWindow[TEST_RUNTIME_MARKERS.fakeMediaInstalled]) {
    return;
  }

  const fakeDevices: MediaDeviceInfo[] = [
    createFakeMediaDevice(
      "audioinput",
      "mic-default",
      "Default Microphone",
      "group-mic",
    ),
    createFakeMediaDevice(
      "audioinput",
      "mic-external",
      "External Microphone",
      "group-mic",
    ),
    createFakeMediaDevice(
      "videoinput",
      "camera-front",
      "Front Camera",
      "group-camera",
    ),
    createFakeMediaDevice(
      "videoinput",
      "camera-rear",
      "Rear Camera",
      "group-camera",
    ),
  ];

  const createFakeVideoStream = (fillStyle: string): MediaStream => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;

    const context = canvas.getContext("2d");
    if (context) {
      context.fillStyle = fillStyle;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "rgba(255, 255, 255, 0.85)";
      context.font = "24px sans-serif";
      context.fillText("VAssist Test Media", 24, 48);
    }

    const stream = canvas.captureStream(5);
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      const originalGetSettings = videoTrack.getSettings.bind(videoTrack);
      videoTrack.getSettings = () => ({
        ...originalGetSettings(),
        width: canvas.width,
        height: canvas.height,
      });
    }

    return stream;
  };

  Object.defineProperty(navigator.mediaDevices, "enumerateDevices", {
    configurable: true,
    value: async () => fakeDevices,
  });

  Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
    configurable: true,
    value: async (constraints?: MediaStreamConstraints) => {
      if (constraints && constraints.video) {
        return createFakeVideoStream("#1d4ed8");
      }

      return new MediaStream();
    },
  });

  Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
    configurable: true,
    value: async () => createFakeVideoStream("#0f766e"),
  });

  testWindow[TEST_RUNTIME_MARKERS.fakeMediaInstalled] = true;
};

const streamFakeText = async function* (
  text: string,
): AsyncGenerator<string, void, void> {
  const splitIndex = Math.max(1, Math.floor(text.length / 2));
  const firstChunk = text.slice(0, splitIndex);
  const secondChunk = text.slice(splitIndex);

  yield firstChunk;

  if (secondChunk) {
    await Promise.resolve();
    yield secondChunk;
  }
};

const normalizeFakeLanguageModelText = (value: string): string =>
  value.replace(/\s+/g, " ").trim();

const extractFakeLanguageModelInputText = (input: unknown): string => {
  if (typeof input === "string") {
    return normalizeFakeLanguageModelText(input);
  }

  if (!Array.isArray(input)) {
    return "";
  }

  return normalizeFakeLanguageModelText(
    input
      .map((message) => {
        const content =
          message && typeof message === "object" && "content" in message
            ? (message as { content?: unknown }).content
            : message;

        if (typeof content === "string") {
          return content;
        }

        if (!Array.isArray(content)) {
          return "";
        }

        return content
          .map((item) => {
            if (!item || typeof item !== "object") {
              return "";
            }

            const part = item as { type?: string; value?: unknown };
            if (part.type === "text") {
              return typeof part.value === "string" ? part.value : "";
            }

            if (part.type === "image") {
              return "[image]";
            }

            if (part.type === "audio") {
              return "[audio]";
            }

            return "";
          })
          .join(" ");
      })
      .join(" "),
  );
};

const buildFakeLanguageModelTitle = (promptText: string): string => {
  const userMessageMatch = promptText.match(/User message:\s*"([\s\S]*?)"/i);
  const sourceText = userMessageMatch?.[1] ?? promptText;
  const normalized = normalizeFakeLanguageModelText(sourceText).replace(
    /^"|"$/g,
    "",
  );

  if (!normalized) {
    return "New Chat";
  }

  return normalized
    .split(" ")
    .filter(Boolean)
    .slice(0, 6)
    .join(" ")
    .slice(0, 50);
};

const buildFakeLanguageModelResponse = (input: unknown): string => {
  const promptText = extractFakeLanguageModelInputText(input);

  if (!promptText) {
    return "Fake assistant response: (empty prompt)";
  }

  if (/say\s+"?ok"?\s+if\s+you\s+can\s+hear\s+me/i.test(promptText)) {
    return "OK";
  }

  if (/generate a very short title/i.test(promptText)) {
    return buildFakeLanguageModelTitle(promptText);
  }

  if (/transcribe this audio/i.test(promptText)) {
    return "Fake transcription of the provided audio.";
  }

  return `Fake assistant response: ${promptText}`;
};

const shouldInstallFakeLanguageModel = (): boolean => {
  if (
    !vassistTestFlags.fakeAi ||
    typeof window === "undefined" ||
    !window.sessionStorage
  ) {
    return false;
  }

  return window.sessionStorage.getItem(FAKE_LANGUAGE_MODEL_SESSION_KEY) === "1";
};

const installFakeLanguageModel = (): void => {
  if (!shouldInstallFakeLanguageModel() || typeof self === "undefined") {
    return;
  }

  const testWindow = window as TestWindow;
  if (testWindow[TEST_RUNTIME_MARKERS.fakeLanguageModelInstalled]) {
    return;
  }

  const createFakeSession = () => {
    let destroyed = false;

    return {
      prompt: async (input: unknown) => {
        if (destroyed) {
          throw new DOMException("Session destroyed", "AbortError");
        }

        return buildFakeLanguageModelResponse(input);
      },
      promptStreaming: async function* (input: unknown) {
        if (destroyed) {
          throw new DOMException("Session destroyed", "AbortError");
        }

        yield* streamFakeText(buildFakeLanguageModelResponse(input));
      },
      destroy: () => {
        destroyed = true;
      },
    };
  };

  Object.defineProperty(self, "LanguageModel", {
    configurable: true,
    writable: true,
    value: {
      availability: async () => "readily",
      params: async () => ({
        defaultTopK: 3,
        maxTopK: 8,
        defaultTemperature: 1,
        maxTemperature: 2,
      }),
      create: async (
        config: {
          monitor?: (target: {
            ondownloadprogress?: (event: { loaded: number }) => void;
          }) => void;
        } = {},
      ) => {
        if (typeof config.monitor === "function") {
          const monitorTarget: {
            ondownloadprogress?: (event: { loaded: number }) => void;
          } = {};
          config.monitor(monitorTarget);
          monitorTarget.ondownloadprogress?.({ loaded: 1 });
        }

        return createFakeSession();
      },
    },
  });

  testWindow[TEST_RUNTIME_MARKERS.fakeLanguageModelInstalled] = true;
};

const installFakeAiServices = (): void => {
  if (!vassistTestFlags.fakeAi || typeof window === "undefined") {
    return;
  }

  const testWindow = window as TestWindow;
  if (testWindow[TEST_RUNTIME_MARKERS.fakeAiInstalled]) {
    return;
  }

  const ready = async () => "readily";
  const configured = async () => true;
  const noop = async () => {};

  const fakeSummaryText = (
    text: string,
    options: Record<string, unknown> = {},
  ): string => {
    const summaryType = String(options.type || "tldr");
    return `Fake ${summaryType} summary: ${text.slice(0, 80)}`;
  };

  const fakeTranslationText = (text: string, targetLanguage: string): string =>
    `[${targetLanguage.toUpperCase()}] ${text}`;

  const fakeRewriteText = (
    text: string,
    options: Record<string, unknown> = {},
  ): string => {
    const context = String(options.context || options.tone || "clarity");
    return `Fake rewrite (${context}): ${text}`;
  };

  const fakeWrittenText = (prompt: string): string =>
    `Fake write result: ${prompt}`;

  const originalAIServiceProxy = {
    ensureConfigured: AIServiceProxy.ensureConfigured.bind(AIServiceProxy),
    configure: AIServiceProxy.configure.bind(AIServiceProxy),
    isConfigured: AIServiceProxy.isConfigured.bind(AIServiceProxy),
    getCurrentProvider: AIServiceProxy.getCurrentProvider.bind(AIServiceProxy),
    sendMessage: AIServiceProxy.sendMessage.bind(AIServiceProxy),
    sendMessageSync: AIServiceProxy.sendMessageSync.bind(AIServiceProxy),
    abortRequest: AIServiceProxy.abortRequest.bind(AIServiceProxy),
    isGenerating: AIServiceProxy.isGenerating.bind(AIServiceProxy),
    testConnection: AIServiceProxy.testConnection.bind(AIServiceProxy),
    listRemoteModels: AIServiceProxy.listRemoteModels.bind(AIServiceProxy),
  };

  const getDefaultFakeAiModel = (): string => {
    const providerConfig =
      DefaultAIConfig[DefaultAIConfig.provider as keyof typeof DefaultAIConfig];

    if (
      providerConfig &&
      typeof providerConfig === "object" &&
      "model" in providerConfig &&
      typeof providerConfig.model === "string" &&
      providerConfig.model.trim().length > 0
    ) {
      return providerConfig.model;
    }

    return "test-model";
  };

  let currentFakeProvider = DefaultAIConfig.provider;
  let currentFakeModel = getDefaultFakeAiModel();
  let activeFakeRequestId = 0;
  let abortedFakeRequestId: number | null = null;
  let fakeAiGenerating = false;

  const shouldUseFakeAIServiceProxy = (): boolean =>
    shouldInstallFakeLanguageModel();

  const syncFakeAiConfig = (config: unknown): void => {
    if (!config || typeof config !== "object") {
      return;
    }

    const nextConfig = config as { provider?: unknown; model?: unknown };

    if (
      typeof nextConfig.provider === "string" &&
      nextConfig.provider.trim().length > 0
    ) {
      currentFakeProvider = nextConfig.provider;
    }

    if (
      typeof nextConfig.model === "string" &&
      nextConfig.model.trim().length > 0
    ) {
      currentFakeModel = nextConfig.model;
    }
  };

  const getLastFakeAiInput = (messages: FakeAiMessage[]): unknown => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];

      if (message?.role === "user") {
        return message.content;
      }
    }

    return messages;
  };

  const buildFakeAiResponse = (messages: FakeAiMessage[]): string =>
    buildFakeLanguageModelResponse(getLastFakeAiInput(messages));

  const sendFakeAiResponse = async (
    messages: FakeAiMessage[],
    onStream: ((chunk: string) => void | Promise<void>) | null = null,
  ): Promise<FakeAiSendResult> => {
    const requestId = ++activeFakeRequestId;
    const response = buildFakeAiResponse(messages);

    fakeAiGenerating = true;

    try {
      if (onStream) {
        for await (const chunk of streamFakeText(response)) {
          if (abortedFakeRequestId === requestId) {
            return {
              success: false,
              response: null,
              cancelled: true,
              error: null,
            };
          }

          await onStream(chunk);
        }
      }

      if (abortedFakeRequestId === requestId) {
        return {
          success: false,
          response: null,
          cancelled: true,
          error: null,
        };
      }

      return {
        success: true,
        response,
        cancelled: false,
        error: null,
      };
    } finally {
      if (abortedFakeRequestId === requestId) {
        abortedFakeRequestId = null;
      }

      fakeAiGenerating = false;
    }
  };

  AIServiceProxy.ensureConfigured = async () => {
    if (!shouldUseFakeAIServiceProxy()) {
      await originalAIServiceProxy.ensureConfigured();
    }
  };
  AIServiceProxy.configure = async (config) => {
    syncFakeAiConfig(config);

    if (!shouldUseFakeAIServiceProxy()) {
      return await originalAIServiceProxy.configure(config);
    }

    return true;
  };
  AIServiceProxy.isConfigured = async () => {
    if (!shouldUseFakeAIServiceProxy()) {
      return await originalAIServiceProxy.isConfigured();
    }

    return true;
  };
  AIServiceProxy.getCurrentProvider = () => {
    if (!shouldUseFakeAIServiceProxy()) {
      return originalAIServiceProxy.getCurrentProvider();
    }

    return currentFakeProvider;
  };
  AIServiceProxy.sendMessage = async (
    messages,
    onStream = null,
    options = {},
  ) => {
    if (!shouldUseFakeAIServiceProxy()) {
      return await originalAIServiceProxy.sendMessage(
        messages,
        onStream,
        options,
      );
    }

    syncFakeAiConfig(options);
    return await sendFakeAiResponse(messages as FakeAiMessage[], onStream);
  };
  AIServiceProxy.sendMessageSync = async (messages) => {
    if (!shouldUseFakeAIServiceProxy()) {
      return await originalAIServiceProxy.sendMessageSync(messages);
    }

    const result = await sendFakeAiResponse(messages as FakeAiMessage[]);
    return result.response ?? "";
  };
  AIServiceProxy.abortRequest = async () => {
    if (!shouldUseFakeAIServiceProxy()) {
      return await originalAIServiceProxy.abortRequest();
    }

    abortedFakeRequestId = activeFakeRequestId;
    return true;
  };
  AIServiceProxy.isGenerating = () => {
    if (!shouldUseFakeAIServiceProxy()) {
      return originalAIServiceProxy.isGenerating();
    }

    return fakeAiGenerating;
  };
  AIServiceProxy.testConnection = async () => {
    if (!shouldUseFakeAIServiceProxy()) {
      return await originalAIServiceProxy.testConnection();
    }

    return true;
  };
  AIServiceProxy.listRemoteModels = async (config) => {
    syncFakeAiConfig(config);

    if (!shouldUseFakeAIServiceProxy()) {
      return await originalAIServiceProxy.listRemoteModels(config);
    }

    return { models: [currentFakeModel] };
  };

  SummarizerServiceProxy.ensureConfigured = async () => {};
  SummarizerServiceProxy.configure = async () => true;
  SummarizerServiceProxy.isConfigured = configured;
  SummarizerServiceProxy.checkAvailability = ready;
  SummarizerServiceProxy.summarize = async (text, options = {}) =>
    fakeSummaryText(text, options as Record<string, unknown>);
  SummarizerServiceProxy.summarizeStreaming = async function* (
    text,
    options = {},
  ) {
    yield* streamFakeText(
      fakeSummaryText(text, options as Record<string, unknown>),
    );
  };
  SummarizerServiceProxy.abort = noop;

  LanguageDetectorServiceProxy.ensureConfigured = async () => {};
  LanguageDetectorServiceProxy.configure = async () => true;
  LanguageDetectorServiceProxy.isConfigured = configured;
  LanguageDetectorServiceProxy.checkAvailability = ready;
  LanguageDetectorServiceProxy.detect = async () => [
    { detectedLanguage: "en", confidence: 0.99 },
  ];
  LanguageDetectorServiceProxy.destroy = noop;

  TranslatorServiceProxy.ensureConfigured = async () => {};
  TranslatorServiceProxy.configure = async () => true;
  TranslatorServiceProxy.isConfigured = configured;
  TranslatorServiceProxy.checkAvailability = ready;
  TranslatorServiceProxy.translate = async (
    text,
    _sourceLanguage,
    targetLanguage,
  ) => fakeTranslationText(text, targetLanguage);
  TranslatorServiceProxy.translateStreaming = async function* (
    text,
    _sourceLanguage,
    targetLanguage,
  ) {
    yield* streamFakeText(fakeTranslationText(text, targetLanguage));
  };
  TranslatorServiceProxy.abort = noop;

  RewriterServiceProxy.ensureConfigured = async () => {};
  RewriterServiceProxy.configure = async () => true;
  RewriterServiceProxy.isConfigured = configured;
  RewriterServiceProxy.checkAvailability = ready;
  RewriterServiceProxy.rewrite = async (text, options = {}) =>
    fakeRewriteText(text, options as Record<string, unknown>);
  RewriterServiceProxy.rewriteStreaming = async function* (text, options = {}) {
    yield* streamFakeText(
      fakeRewriteText(text, options as Record<string, unknown>),
    );
  };
  RewriterServiceProxy.abort = noop;

  WriterServiceProxy.ensureConfigured = async () => {};
  WriterServiceProxy.configure = async () => true;
  WriterServiceProxy.isConfigured = configured;
  WriterServiceProxy.checkAvailability = ready;
  WriterServiceProxy.write = async (prompt) => fakeWrittenText(prompt);
  WriterServiceProxy.writeStreaming = async function* (prompt) {
    yield* streamFakeText(fakeWrittenText(prompt));
  };
  WriterServiceProxy.abort = noop;

  testWindow[TEST_RUNTIME_MARKERS.fakeAiInstalled] = true;
};

const isMergeableObject = (value: unknown): value is PlainObject =>
  Boolean(value) &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  !(value instanceof Date) &&
  !(value instanceof Blob);

const deepMerge = <T>(base: T, overrides?: DeepPartial<T>): T => {
  if (overrides === undefined) {
    return structuredClone(base);
  }

  if (Array.isArray(base)) {
    return structuredClone(overrides as T);
  }

  if (!isMergeableObject(base) || !isMergeableObject(overrides)) {
    return structuredClone(overrides as T);
  }

  const result: PlainObject = structuredClone(base as PlainObject);

  for (const [key, overrideValue] of Object.entries(overrides)) {
    if (overrideValue === undefined) {
      continue;
    }

    const currentValue = result[key];
    result[key] =
      isMergeableObject(currentValue) && isMergeableObject(overrideValue)
        ? deepMerge(currentValue, overrideValue)
        : structuredClone(overrideValue);
  }

  return result as T;
};

const buildCompletedSetupState = (
  overrides?: DeepPartial<SetupStateSnapshot>,
): SetupStateSnapshot => {
  const baseState: SetupStateSnapshot = {
    ...structuredClone(DEFAULT_SETUP_STATE),
    setupCompleted: true,
    currentStep: TOTAL_SETUP_STEPS,
    completedSteps: Array.from(
      { length: TOTAL_SETUP_STEPS },
      (_, index) => index + 1,
    ),
  };

  return deepMerge(baseState, overrides);
};

const buildSetupWizardState = (
  overrides?: DeepPartial<SetupStateSnapshot>,
): SetupStateSnapshot => {
  const baseState: SetupStateSnapshot = {
    ...structuredClone(DEFAULT_SETUP_STATE),
    setupCompleted: false,
    currentStep: 1,
    completedSteps: [],
  };

  return deepMerge(baseState, overrides);
};

const buildDefaultUiConfig = (overrides?: DeepPartial<UIConfig>): UIConfig => {
  const baseConfig = structuredClone(DefaultUIConfig);

  if (vassistTestFlags.disableHeavyModelLoading) {
    baseConfig.enableModelLoading = false;
  }

  return deepMerge(baseConfig, overrides);
};

const buildDefaultAiConfig = (overrides?: DeepPartial<AIConfig>): AIConfig =>
  deepMerge(structuredClone(DefaultAIConfig), overrides);

const buildDefaultTtsConfig = (
  overrides?: DeepPartial<TTSConfig>,
): TTSConfig => {
  const baseConfig = structuredClone(DefaultTTSConfig);

  if (vassistTestFlags.disableTts) {
    baseConfig.enabled = false;
  }

  return deepMerge(baseConfig, overrides);
};

const buildDefaultSttConfig = (
  overrides?: DeepPartial<STTConfig>,
): STTConfig => {
  const baseConfig = structuredClone(DefaultSTTConfig);

  if (vassistTestFlags.disableStt) {
    baseConfig.enabled = false;
  }

  return deepMerge(baseConfig, overrides);
};

const clearPersistedState = async (): Promise<void> => {
  await Promise.all([
    StorageServiceProxy.configClear(),
    StorageServiceProxy.settingsClear(),
    StorageServiceProxy.cacheClear(),
    StorageServiceProxy.chatClear(),
    StorageServiceProxy.filesClear(),
    StorageServiceProxy.dataClear(),
  ]);
};

const hydrateConfigStore = async (): Promise<void> => {
  useConfigStore.setState({ hasHydrated: false, isConfigLoading: false });
  await useConfigStore.getState().hydrateConfigStore();
};

const flushConfigSaves = async (
  kinds: Array<"ui" | "ai" | "tts" | "stt"> = ["ui", "ai", "tts", "stt"],
): Promise<void> => {
  const configStore = useConfigStore.getState();

  for (const kind of kinds) {
    switch (kind) {
      case "ui":
        await configStore.saveUIConfig();
        break;
      case "ai":
        await configStore.saveAIConfig();
        break;
      case "tts":
        await configStore.saveTTSConfig();
        break;
      case "stt":
        await configStore.saveSTTConfig();
        break;
    }
  }
};

const seedChatHistory = async (
  entries: SeedChatHistoryEntry[],
): Promise<{ chatIds: string[] }> => {
  const chatIds: string[] = [];

  for (const [index, entry] of entries.entries()) {
    const chatToSave: {
      chatId?: string;
      title: string;
      messages: SeedChatHistoryEntry["messages"];
      metadata: Record<string, unknown>;
    } = {
      title: entry.title || `Seeded Chat ${index + 1}`,
      messages: entry.messages,
      metadata: entry.metadata || {},
    };

    if (entry.chatId) {
      chatToSave.chatId = entry.chatId;
    }

    const chatId = await chatHistoryService.saveChat(chatToSave);
    chatIds.push(chatId);
  }

  return { chatIds };
};

const toTestChatMessages = (
  messages: FlatChatMessage[],
): Array<{
  id: string;
  role: FlatChatMessage["role"];
  content: string;
  branchInfo: FlatChatMessage["branchInfo"];
}> =>
  messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    branchInfo: message.branchInfo ? { ...message.branchInfo } : null,
  }));

const buildPersistedNodeMap = (
  node: ChatNode,
  nodeMap = new Map<string, ChatNode>(),
): Map<string, ChatNode> => {
  nodeMap.set(node.id, node);

  for (const branch of node.branches) {
    buildPersistedNodeMap(branch, nodeMap);
  }

  return nodeMap;
};

const getPersistedBranchInfo = (
  node: ChatNode,
  nodeMap: Map<string, ChatNode>,
): FlatChatMessage["branchInfo"] => {
  if (!node.parentId) {
    return null;
  }

  const parent = nodeMap.get(node.parentId);
  if (!parent || parent.branches.length <= 1) {
    return null;
  }

  const currentIndex = parent.branches.findIndex(
    (branch) => branch.id === node.id,
  );

  return {
    currentIndex: currentIndex + 1,
    totalBranches: parent.branches.length,
    parentId: parent.id,
    canGoBack: currentIndex > 0,
    canGoForward: currentIndex < parent.branches.length - 1,
  };
};

const getPersistedChatMessagesFromTree = (
  treeData: ExportedChatTree,
): Array<{
  id: string;
  role: FlatChatMessage["role"];
  content: string;
  branchInfo: FlatChatMessage["branchInfo"];
}> => {
  const nodeMap = buildPersistedNodeMap(treeData.tree);
  const messages: Array<{
    id: string;
    role: FlatChatMessage["role"];
    content: string;
    branchInfo: FlatChatMessage["branchInfo"];
  }> = [];

  for (const nodeId of treeData.activePath.slice(1)) {
    const node = nodeMap.get(nodeId);
    if (!node || node.role === "system") {
      continue;
    }

    messages.push({
      id: node.id,
      role: node.role,
      content: node.content ?? "",
      branchInfo: getPersistedBranchInfo(node, nodeMap),
    });
  }

  return messages;
};

const getCurrentChatMessages = () =>
  toTestChatMessages(ChatService.getMessages());

const getPersistedChats = async (): Promise<
  Array<{
    chatId: string;
    title: string;
    messageCount: number;
    createdAt: string;
    updatedAt: string;
  }>
> => {
  const chats = (await chatHistoryService.getAllChats(100, 0)) as Array<{
    chatId: string;
    title: string;
    messageCount: number;
    createdAt: string;
    updatedAt: string;
  }>;

  return chats.map((chat) => ({
    chatId: chat.chatId,
    title: chat.title,
    messageCount: chat.messageCount,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
  }));
};

const getPersistedChatMessages = async (
  chatId: string,
): Promise<
  Array<{
    id: string;
    role: FlatChatMessage["role"];
    content: string;
    branchInfo: FlatChatMessage["branchInfo"];
  }>
> => {
  const chats = (await chatHistoryService.getAllChats(
    100,
    0,
  )) as unknown as Array<{
    chatId: string;
    chatService?: {
      tree?: ChatNode;
      activePath?: string[];
      version?: number;
    } | null;
    messages?: Array<{
      id?: string;
      role: FlatChatMessage["role"];
      content: string;
    }>;
  }>;
  const persistedChat = chats.find((chat) => chat.chatId === chatId);

  if (!persistedChat) {
    return [];
  }

  if (
    persistedChat.chatService?.tree &&
    Array.isArray(persistedChat.chatService.activePath)
  ) {
    return getPersistedChatMessagesFromTree(
      persistedChat.chatService as ExportedChatTree,
    );
  }

  return (persistedChat.messages ?? []).map((message, index) => ({
    id: message.id ?? `${chatId}_${index}`,
    role: message.role,
    content: message.content,
    branchInfo: null,
  }));
};

const seedCompletedAppState = async (
  options: SeedCompletedAppStateOptions = {},
) => {
  if (options.clearFirst !== false) {
    await clearPersistedState();
  }

  const uiConfig = buildDefaultUiConfig(options.uiConfig);
  const aiConfig = buildDefaultAiConfig(options.aiConfig);
  const ttsConfig = buildDefaultTtsConfig(options.ttsConfig);
  const sttConfig = buildDefaultSttConfig(options.sttConfig);
  const setupState = buildCompletedSetupState(options.setupState);

  await Promise.all([
    StorageServiceProxy.configSave("uiConfig", uiConfig),
    StorageServiceProxy.configSave("aiConfig", aiConfig),
    StorageServiceProxy.configSave("ttsConfig", ttsConfig),
    StorageServiceProxy.configSave("sttConfig", sttConfig),
    StorageServiceProxy.configSave("setupState", setupState),
  ]);

  return {
    uiConfig,
    aiConfig,
    ttsConfig,
    sttConfig,
    setupState,
  };
};

const seedSetupWizardState = async (
  options: SeedSetupWizardStateOptions = {},
) => {
  if (options.clearFirst !== false) {
    await clearPersistedState();
  }

  const uiConfig = buildDefaultUiConfig(options.uiConfig);
  const aiConfig = buildDefaultAiConfig(options.aiConfig);
  const ttsConfig = buildDefaultTtsConfig(options.ttsConfig);
  const sttConfig = buildDefaultSttConfig(options.sttConfig);
  const setupState = buildSetupWizardState(options.setupState);

  await Promise.all([
    StorageServiceProxy.configSave("uiConfig", uiConfig),
    StorageServiceProxy.configSave("aiConfig", aiConfig),
    StorageServiceProxy.configSave("ttsConfig", ttsConfig),
    StorageServiceProxy.configSave("sttConfig", sttConfig),
    StorageServiceProxy.configSave("setupState", setupState),
  ]);

  return {
    uiConfig,
    aiConfig,
    ttsConfig,
    sttConfig,
    setupState,
  };
};

export const installVAssistTestApi = (): void => {
  if (!isVAssistTestMode || typeof window === "undefined") {
    return;
  }

  if (window.__VASSIST_TEST_API__) {
    return;
  }

  const api: VAssistTestApi = {
    getFlags: () => vassistTestFlags,
    clearPersistedState,
    seedCompletedAppState,
    seedSetupWizardState,
    clearAndSeedReadyState: async (options = {}) => {
      await clearPersistedState();
      return await seedCompletedAppState({
        ...options,
        clearFirst: false,
      });
    },
    clearAndSeedSetupWizardState: async (options = {}) => {
      await clearPersistedState();
      return await seedSetupWizardState({
        ...options,
        clearFirst: false,
      });
    },
    seedChatHistory,
    getCurrentChatMessages,
    getPersistedChats,
    getPersistedChatMessages,
    hydrateConfigStore,
    flushConfigSaves,
  };

  window.__VASSIST_TEST_API__ = api;
};

const readPendingBootstrap = ():
  | PendingReadyStateBootstrap
  | PendingSetupWizardStateBootstrap
  | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const payload = window.sessionStorage.getItem(BOOTSTRAP_PAYLOAD_SESSION_KEY);
  if (!payload) {
    return null;
  }

  window.sessionStorage.removeItem(BOOTSTRAP_PAYLOAD_SESSION_KEY);

  try {
    const parsed = JSON.parse(payload) as
      | PendingReadyStateBootstrap
      | PendingSetupWizardStateBootstrap;
    return parsed.kind === "ready-state" || parsed.kind === "setup-wizard-state"
      ? parsed
      : null;
  } catch {
    return null;
  }
};

export const prepareVAssistTestRuntime = async (): Promise<void> => {
  if (!isVAssistTestMode || typeof window === "undefined") {
    return;
  }

  installFakeMediaDevices();
  installFakeLanguageModel();
  installFakeAiServices();
  installVAssistTestApi();

  const pendingBootstrap = readPendingBootstrap();
  if (!pendingBootstrap) {
    return;
  }

  await clearPersistedState();

  if (pendingBootstrap.kind === "setup-wizard-state") {
    await seedSetupWizardState({
      ...pendingBootstrap.options,
      clearFirst: false,
    });
    return;
  }

  await seedCompletedAppState({
    ...pendingBootstrap.options,
    clearFirst: false,
  });
};
