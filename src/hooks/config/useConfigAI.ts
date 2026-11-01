import { useCallback } from "react";
import {
  AIProviders,
  type AIRemoteProviderProfile,
} from "../../config/aiConfig";
import { getAppliedAIProfile } from "../../config/aiProfiles";
import { useAndroidApi } from "../useAndroidStore";
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
      setAIConfigError: state.setAIConfigError,
      clearAIConfigError: state.clearAIConfigError,
      testTranslator: state.testTranslator,
      testLanguageDetector: state.testLanguageDetector,
      testSummarizer: state.testSummarizer,
      testRewriter: state.testRewriter,
      testWriter: state.testWriter,
    })),
  );

/** Apply saved backends consistently from Settings, chat, and desktop selection. */
export const useApplyAIProfile = () => {
  const { updateAIConfig } = useConfigAIActions();
  const androidApi = useAndroidApi();
  return useCallback(
    (profile: AIRemoteProviderProfile) => {
      updateAIConfig(
        profile.provider,
        getAppliedAIProfile(useConfigStore.getState().aiConfig, profile),
      );
      if (profile.provider === AIProviders.ANDROID_LOCAL)
        androidApi?.setLLMComputeUnit?.(profile.computeUnit || "auto");
    },
    [updateAIConfig, androidApi],
  );
};
