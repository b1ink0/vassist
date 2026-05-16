import { useShallow } from "zustand/react/shallow";
import { useConfigStore } from "../../stores/useConfigStore";

export const useConfigAI = () =>
  useConfigStore(
    useShallow((state) => ({
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
    })),
  );
