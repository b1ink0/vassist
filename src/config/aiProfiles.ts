import {
  AIProviders,
  DefaultAIConfig,
  type AIConfig,
  type AIRemoteProviderProfile,
} from "./aiConfig";
import { restoreLLMProfileParameters } from "./llmParameters";

/** Merge a saved backend into its provider section without changing unrelated settings. */
export function getAppliedAIProfile(
  config: AIConfig,
  profile: AIRemoteProviderProfile,
) {
  const defaults = DefaultAIConfig[profile.provider];
  return {
    ...config[profile.provider],
    ...restoreLLMProfileParameters(profile, defaults),
    selectedBackendProfileId: profile.id,
    endpoint: profile.endpoint || defaults.endpoint,
    model: profile.model,
    temperature: profile.temperature ?? defaults.temperature,
    maxTokens: profile.maxTokens ?? defaults.maxTokens,
    ...(profile.provider === AIProviders.OPENAI ||
    profile.provider === AIProviders.OLLAMA
      ? {
          apiKey: profile.apiKey || "",
          enableImageSupport: profile.enableImageSupport !== false,
          enableAudioSupport: profile.enableAudioSupport !== false,
        }
      : {}),
    ...(profile.provider === AIProviders.DESKTOP_LOCAL
      ? {
          customModelsPath:
            profile.customModelsPath ??
            DefaultAIConfig[AIProviders.DESKTOP_LOCAL].customModelsPath,
          shareOnNetwork:
            profile.shareOnNetwork ??
            DefaultAIConfig[AIProviders.DESKTOP_LOCAL].shareOnNetwork,
          serverPort:
            profile.serverPort ??
            DefaultAIConfig[AIProviders.DESKTOP_LOCAL].serverPort,
        }
      : {}),
  };
}
