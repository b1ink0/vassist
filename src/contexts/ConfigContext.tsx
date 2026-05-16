/**
 * ConfigContext compatibility layer backed by Zustand.
 */

import type { ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { useInitializeConfigStore } from "../hooks/bootstrap/useInitializeConfigStore";
import { useConfigStore, type ConfigStoreState } from "../stores/useConfigStore";

interface ConfigProviderProps {
  children: ReactNode;
}

export function ConfigProvider({ children }: ConfigProviderProps) {
  useInitializeConfigStore();
  return <>{children}</>;
}

export function useConfigStoreSelector<T>(
  selector: (state: ConfigStoreState) => T,
): T {
  return useConfigStore(selector);
}

export const useConfig = (): Pick<
  ConfigStoreState,
  | "hasHydrated"
  | "isConfigLoading"
  | "uiConfig"
  | "uiConfigSaved"
  | "uiConfigError"
  | "updateUIConfig"
  | "saveUIConfig"
  | "aiConfig"
  | "aiConfigSaved"
  | "aiConfigError"
  | "aiTesting"
  | "updateAIConfig"
  | "saveAIConfig"
  | "testAIConnection"
  | "clearAIConfigError"
  | "testTranslator"
  | "testLanguageDetector"
  | "testSummarizer"
  | "testRewriter"
  | "testWriter"
  | "ttsConfig"
  | "ttsConfigSaved"
  | "ttsConfigError"
  | "ttsTesting"
  | "updateTTSConfig"
  | "saveTTSConfig"
  | "testTTSConnection"
  | "setTtsConfigError"
  | "clearTTSConfigError"
  | "sttConfig"
  | "sttConfigSaved"
  | "sttConfigError"
  | "sttTesting"
  | "updateSTTConfig"
  | "saveSTTConfig"
  | "testSTTRecording"
  | "clearSTTConfigError"
  | "chromeAiStatus"
  | "checkChromeAIAvailability"
  | "startChromeAIDownload"
  | "kokoroStatus"
  | "checkKokoroStatus"
  | "initializeKokoro"
> =>
  useConfigStore(
    useShallow((state) => ({
      hasHydrated: state.hasHydrated,
      isConfigLoading: state.isConfigLoading,
      uiConfig: state.uiConfig,
      uiConfigSaved: state.uiConfigSaved,
      uiConfigError: state.uiConfigError,
      updateUIConfig: state.updateUIConfig,
      saveUIConfig: state.saveUIConfig,
      aiConfig: state.aiConfig,
      aiConfigSaved: state.aiConfigSaved,
      aiConfigError: state.aiConfigError,
      aiTesting: state.aiTesting,
      updateAIConfig: state.updateAIConfig,
      saveAIConfig: state.saveAIConfig,
      testAIConnection: state.testAIConnection,
      clearAIConfigError: state.clearAIConfigError,
      testTranslator: state.testTranslator,
      testLanguageDetector: state.testLanguageDetector,
      testSummarizer: state.testSummarizer,
      testRewriter: state.testRewriter,
      testWriter: state.testWriter,
      ttsConfig: state.ttsConfig,
      ttsConfigSaved: state.ttsConfigSaved,
      ttsConfigError: state.ttsConfigError,
      ttsTesting: state.ttsTesting,
      updateTTSConfig: state.updateTTSConfig,
      saveTTSConfig: state.saveTTSConfig,
      testTTSConnection: state.testTTSConnection,
      setTtsConfigError: state.setTtsConfigError,
      clearTTSConfigError: state.clearTTSConfigError,
      sttConfig: state.sttConfig,
      sttConfigSaved: state.sttConfigSaved,
      sttConfigError: state.sttConfigError,
      sttTesting: state.sttTesting,
      updateSTTConfig: state.updateSTTConfig,
      saveSTTConfig: state.saveSTTConfig,
      testSTTRecording: state.testSTTRecording,
      clearSTTConfigError: state.clearSTTConfigError,
      chromeAiStatus: state.chromeAiStatus,
      checkChromeAIAvailability: state.checkChromeAIAvailability,
      startChromeAIDownload: state.startChromeAIDownload,
      kokoroStatus: state.kokoroStatus,
      checkKokoroStatus: state.checkKokoroStatus,
      initializeKokoro: state.initializeKokoro,
    })),
  );
