import { useShallow } from "zustand/react/shallow";
import { useConfigStore } from "../../stores/useConfigStore";

export const useAIConfig = () => useConfigStore((state) => state.aiConfig);

export const useAIConfigSaved = () =>
  useConfigStore((state) => state.aiConfigSaved);

export const useAIConfigError = () =>
  useConfigStore((state) => state.aiConfigError);

export const useAITesting = () => useConfigStore((state) => state.aiTesting);

export const useConfigAIActions = () =>
  useConfigStore(
    useShallow((state) => ({
      updateAIConfig: state.updateAIConfig,
      saveAIConfig: state.saveAIConfig,
      testAIConnection: state.testAIConnection,
      clearAIConfigError: state.clearAIConfigError,
      testTranslator: state.testTranslator,
      testLanguageDetector: state.testLanguageDetector,
      testSummarizer: state.testSummarizer,
      testRewriter: state.testRewriter,
      testWriter: state.testWriter,
    })),
  );
