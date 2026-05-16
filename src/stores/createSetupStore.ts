import type * as React from "react";
import { createStore } from "zustand/vanilla";
import StorageServiceProxy from "../services/proxies/StorageServiceProxy";
import Logger from "../services/LoggerService";
import { isAndroid, isDesktop } from "../utils/PlatformUtils";
import { getErrorMessage } from "./storeUtils";
import { useConfigStore } from "./useConfigStore";

const DEFAULT_LLM_PROVIDER = isAndroid
  ? "android-local"
  : isDesktop
    ? "desktop-local"
    : "chrome-ai";
const DEFAULT_TTS_PROVIDER = isAndroid
  ? "android-local"
  : isDesktop
    ? "desktop-local"
    : "kokoro";
const DEFAULT_STT_PROVIDER = isAndroid
  ? "android-local"
  : isDesktop
    ? "desktop-local"
    : "chrome-ai-multimodal";

export const TOTAL_SETUP_STEPS = 5;

export const DEFAULT_SETUP_STATE = {
  setupCompleted: false,
  currentStep: 1,
  completedSteps: [] as number[],
  setupData: {
    llm: {
      provider: DEFAULT_LLM_PROVIDER,
      chromeAi: {
        enableImageSupport: true,
        enableAudioSupport: true,
      },
      openai: {
        apiKey: "",
        model: "gpt-4o-mini",
      },
      ollama: {
        endpoint: "http://localhost:11434",
        model: "llama3.2",
      },
    },
    tts: {
      enabled: false,
      provider: DEFAULT_TTS_PROVIDER,
      kokoro: {
        voice: "af_heart",
        speed: 1.0,
        device: "auto",
      },
      openai: {
        apiKey: "",
        voice: "nova",
      },
      "openai-compatible": {
        endpoint: "http://localhost:8000",
        apiKey: "",
        model: "tts",
        voice: "default",
        speed: 1.0,
      },
    },
    sttConfig: {
      chromeAi: {
        temperature: 0.1,
        topK: 3,
        outputLanguage: "en",
      },
      openai: {
        apiKey: "",
        model: "whisper-1",
        language: "en",
        temperature: 0,
      },
      "openai-compatible": {
        endpoint: "http://localhost:8000",
        apiKey: "",
        model: "whisper",
        language: "en",
        temperature: 0,
      },
    },
    stt: {
      enabled: false,
      provider: DEFAULT_STT_PROVIDER,
    },
    aiFeatures: {
      translator: { enabled: true },
      languageDetector: { enabled: true },
      summarizer: { enabled: true },
      rewriter: { enabled: true },
      writer: { enabled: true },
    },
    ui: {
      enableModelLoading: true,
      enablePortraitMode: false,
      position: "bottom-right",
      enableAIToolbar: true,
      shortcuts: {
        enabled: false,
        openChat: "",
        toggleMode: "",
        toggleVisibility: "",
      },
    },
  },
};

export type SetupData = typeof DEFAULT_SETUP_STATE.setupData;
export type SetupStateSnapshot = typeof DEFAULT_SETUP_STATE;

export interface SetupStoreState {
  isLoading: boolean;
  setupCompleted: boolean;
  currentStep: number;
  completedSteps: number[];
  setupData: SetupData;
  totalSteps: number;
  goToStep: (step: number) => void;
  nextStep: () => void;
  previousStep: () => void;
  markStepComplete: () => void;
  updateSetupData: (
    pathOrData: string | Record<string, unknown>,
    value?: unknown,
  ) => Promise<void>;
  completeSetup: () => Promise<void>;
  resetSetup: () => Promise<void>;
}

const cloneDefaultSetupState = (): SetupStateSnapshot => ({
  ...DEFAULT_SETUP_STATE,
  completedSteps: [...DEFAULT_SETUP_STATE.completedSteps],
  setupData: structuredClone(DEFAULT_SETUP_STATE.setupData),
});

const isCorruptedSetupState = (value: unknown) => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const hasSetupFields =
    "setupCompleted" in candidate && "currentStep" in candidate;
  const hasUIConfigFields =
    "theme" in candidate ||
    "position" in candidate ||
    "enableModelLoading" in candidate;

  return hasUIConfigFields && !hasSetupFields;
};

const updateSetupDataAtPath = (
  previous: SetupData,
  pathOrData: string | Record<string, unknown>,
  value?: unknown,
): SetupData => {
  const updated = {
    ...previous,
  } as Record<string, unknown>;

  if (
    typeof pathOrData === "object" &&
    pathOrData !== null &&
    value === undefined
  ) {
    return {
      ...previous,
      ...pathOrData,
    } as SetupData;
  }

  const parts = String(pathOrData).split(".");
  let current = updated;

  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i] || "";
    const nextValue = current[key];
    current[key] =
      typeof nextValue === "object" && nextValue !== null
        ? { ...(nextValue as Record<string, unknown>) }
        : {};
    current = current[key] as Record<string, unknown>;
  }

  const lastPart = parts[parts.length - 1];
  if (lastPart) {
    current[lastPart] = value;
  }

  return updated as SetupData;
};

export const createSetupStore = () => {
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;
  let hasLoaded = false;

  const store = createStore<SetupStoreState>((set, get) => {
    const scheduleSave = () => {
      if (!hasLoaded) {
        return;
      }

      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }

      saveTimeout = setTimeout(async () => {
        try {
          const snapshot = {
            setupCompleted: get().setupCompleted,
            currentStep: get().currentStep,
            completedSteps: get().completedSteps,
            setupData: get().setupData,
          };
          Logger.log("SetupStore", "Saving setup state to storage:", snapshot);
          await StorageServiceProxy.configSave("setupState", snapshot);
          Logger.log("SetupStore", "Setup state saved successfully");
        } catch (error) {
          Logger.error("SetupStore", "Failed to save setup state:", error);
        }
      }, 500);
    };

    const persistAndReload = async () => {
      const setupData = get().setupData;
      Logger.log("SetupStore", "Applying setup data through ConfigStore");
      await useConfigStore.getState().applySetupData(setupData);

      const completedSteps = Array.from(
        { length: TOTAL_SETUP_STEPS },
        (_, index) => index + 1,
      );

      set({
        setupCompleted: true,
        currentStep: TOTAL_SETUP_STEPS,
        completedSteps,
      });
      scheduleSave();

      Logger.log(
        "SetupStore",
        "Setup completed successfully - waiting for auto-save before reload...",
      );

      await new Promise((resolve) => setTimeout(resolve, 1000));
      window.location.reload();
    };

    void (async () => {
      try {
        let retries = 0;
        const maxRetries = 3;
        let savedState: SetupStateSnapshot | null = null;

        while (retries < maxRetries) {
          try {
            const loadedState = (await StorageServiceProxy.configLoad(
              "setupState",
            )) as SetupStateSnapshot | null;

            savedState = loadedState || cloneDefaultSetupState();

            if (isCorruptedSetupState(savedState)) {
              Logger.error(
                "SetupStore",
                "CORRUPTED DATA DETECTED: setupState contains uiConfig fields!",
                savedState,
              );
              savedState = {
                ...cloneDefaultSetupState(),
                setupCompleted: true,
              };
            }

            Logger.log(
              "SetupStore",
              "Loaded setup state from storage:",
              savedState,
            );
            break;
          } catch (error) {
            retries += 1;
            if (retries < maxRetries) {
              Logger.warn(
                "SetupStore",
                `Failed to load setup state (attempt ${retries}/${maxRetries}), retrying...`,
                getErrorMessage(error),
              );
              await new Promise((resolve) =>
                setTimeout(resolve, 100 * Math.pow(2, retries - 1)),
              );
            } else {
              Logger.error(
                "SetupStore",
                "Failed to load setup state after all retries:",
                error,
              );
              savedState = {
                ...cloneDefaultSetupState(),
                setupCompleted: true,
              };
            }
          }
        }

        const snapshot = savedState || {
          ...cloneDefaultSetupState(),
          setupCompleted: true,
        };

        set({
          isLoading: false,
          setupCompleted: snapshot.setupCompleted,
          currentStep: snapshot.currentStep,
          completedSteps: snapshot.completedSteps,
          setupData: snapshot.setupData,
        });
      } catch (error) {
        Logger.error(
          "SetupStore",
          "Unexpected error in loadSetupState:",
          error,
        );
        const snapshot = {
          ...cloneDefaultSetupState(),
          setupCompleted: true,
        };
        set({
          isLoading: false,
          setupCompleted: snapshot.setupCompleted,
          currentStep: snapshot.currentStep,
          completedSteps: snapshot.completedSteps,
          setupData: snapshot.setupData,
        });
      } finally {
        hasLoaded = true;
      }
    })();

    return {
      isLoading: true,
      setupCompleted: true,
      currentStep: 1,
      completedSteps: [],
      setupData: cloneDefaultSetupState().setupData,
      totalSteps: TOTAL_SETUP_STEPS,
      goToStep: (step) => {
        if (step < 1 || step > TOTAL_SETUP_STEPS) {
          return;
        }
        set({ currentStep: step });
        scheduleSave();
      },
      nextStep: () => {
        const currentStep = get().currentStep;
        Logger.log(
          "SetupStore",
          "nextStep called - current:",
          currentStep,
          "going to:",
          currentStep + 1,
        );
        if (currentStep < TOTAL_SETUP_STEPS) {
          set({ currentStep: currentStep + 1 });
          scheduleSave();
        }
      },
      previousStep: () => {
        const currentStep = get().currentStep;
        Logger.log(
          "SetupStore",
          "previousStep called - current:",
          currentStep,
          "going to:",
          currentStep - 1,
        );
        if (currentStep > 1) {
          set({ currentStep: currentStep - 1 });
          scheduleSave();
        }
      },
      markStepComplete: () => {
        const state = get();
        if (state.completedSteps.includes(state.currentStep)) {
          return;
        }
        set({
          completedSteps: [...state.completedSteps, state.currentStep].sort(
            (left, right) => left - right,
          ),
        });
        scheduleSave();
      },
      updateSetupData: async (pathOrData, value) => {
        const nextSetupData = updateSetupDataAtPath(
          get().setupData,
          pathOrData,
          value,
        );
        set({ setupData: nextSetupData });
        scheduleSave();
      },
      completeSetup: async () => {
        try {
          Logger.log(
            "SetupStore",
            "Completing setup with data:",
            get().setupData,
          );
          await persistAndReload();
        } catch (error) {
          Logger.error("SetupStore", "Failed to complete setup:", error);
          throw error;
        }
      },
      resetSetup: async () => {
        try {
          Logger.log("SetupStore", "Resetting setup...");
          const snapshot = cloneDefaultSetupState();
          set({
            setupCompleted: snapshot.setupCompleted,
            currentStep: snapshot.currentStep,
            completedSteps: snapshot.completedSteps,
            setupData: snapshot.setupData,
          });
          await StorageServiceProxy.configSave("setupState", snapshot);
          Logger.log("SetupStore", "Setup reset complete");
        } catch (error) {
          Logger.error("SetupStore", "Failed to reset setup:", error);
          throw error;
        }
      },
    };
  });

  return store;
};

export type SetupStore = ReturnType<typeof createSetupStore>;
