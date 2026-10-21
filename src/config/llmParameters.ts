export interface LLMSamplingParameters {
  samplingEnabled?: boolean | undefined;
  temperature?: number | undefined;
  maxTokens?: number | undefined;
  topP?: number | undefined;
  topK?: number | undefined;
  minP?: number | undefined;
  typicalP?: number | undefined;
  repeatPenalty?: number | undefined;
  repeatLastN?: number | undefined;
  presencePenalty?: number | undefined;
  frequencyPenalty?: number | undefined;
  seed?: number | undefined;
  stop?: string[] | undefined;
  tokenLimitParameter?: "max_tokens" | "max_completion_tokens" | undefined;
}

export interface LLMRuntimeParameters {
  contextSize?: number | undefined;
  gpuLayers?: number | undefined;
  threads?: number | undefined;
  batchSize?: number | undefined;
  ubatchSize?: number | undefined;
  flashAttention?: "auto" | "on" | "off" | undefined;
  cacheTypeK?: "f16" | "q8_0" | "q4_0" | undefined;
  cacheTypeV?: "f16" | "q8_0" | "q4_0" | undefined;
  ropeScaling?: "model" | "none" | "linear" | "yarn" | undefined;
  ropeScale?: number | undefined;
}

export type LLMParameters = LLMSamplingParameters & LLMRuntimeParameters;

export const LLM_RUNTIME_REQUEST_KEYS = [
  "llmContextSize",
  "llmGpuLayers",
  "llmThreads",
  "llmBatchSize",
  "llmUbatchSize",
  "llmFlashAttention",
  "llmCacheTypeK",
  "llmCacheTypeV",
  "llmRopeScaling",
  "llmRopeScale",
  "llmSamplingEnabled",
] as const;

export const DefaultLLMSamplingParameters: LLMSamplingParameters = {
  samplingEnabled: true,
  topP: undefined,
  topK: undefined,
  minP: undefined,
  typicalP: undefined,
  repeatPenalty: undefined,
  repeatLastN: undefined,
  presencePenalty: undefined,
  frequencyPenalty: undefined,
  seed: undefined,
  stop: [],
  tokenLimitParameter: undefined,
};

export const DefaultLLMRuntimeParameters: LLMRuntimeParameters = {
  batchSize: undefined,
  ubatchSize: undefined,
  flashAttention: "auto",
  cacheTypeK: "f16",
  cacheTypeV: "f16",
  ropeScaling: "model",
  ropeScale: undefined,
};

export const LLM_PARAMETER_KEYS = [
  "samplingEnabled",
  "temperature",
  "maxTokens",
  "topP",
  "topK",
  "minP",
  "typicalP",
  "repeatPenalty",
  "repeatLastN",
  "presencePenalty",
  "frequencyPenalty",
  "seed",
  "stop",
  "tokenLimitParameter",
  "contextSize",
  "gpuLayers",
  "threads",
  "batchSize",
  "ubatchSize",
  "flashAttention",
  "cacheTypeK",
  "cacheTypeV",
  "ropeScaling",
  "ropeScale",
] as const;

const PROFILE_PARAMETER_KEYS = [
  ...LLM_PARAMETER_KEYS,
  "llmEngine",
  "llmBackend",
  "backend",
  "computeUnit",
  "thinkingEnabled",
  "thinkingEffort",
  "apiFormat",
] as const;

export function getLLMProfileParameters(input: object) {
  const config = input as Record<string, unknown>;
  return Object.fromEntries(
    PROFILE_PARAMETER_KEYS.map((key) => [key, config[key]]),
  );
}

export function restoreLLMProfileParameters(
  savedProfile: object,
  defaultConfig: object,
) {
  const profile = savedProfile as Record<string, unknown>;
  const defaults = defaultConfig as Record<string, unknown>;
  return Object.fromEntries(
    PROFILE_PARAMETER_KEYS.map((key) => [key, profile[key] ?? defaults[key]]),
  );
}

export function buildLLMRequestParameters(
  provider: string | null,
  config: LLMParameters & { apiFormat?: string },
) {
  const body: Record<string, unknown> = {};
  const tokenKey =
    config.tokenLimitParameter ??
    (provider === "openai" ? "max_completion_tokens" : "max_tokens");
  body[tokenKey] = config.maxTokens;
  if (config.samplingEnabled !== false) {
    const fields = {
      temperature: config.temperature,
      top_p: config.topP,
      presence_penalty: config.presencePenalty,
      frequency_penalty: config.frequencyPenalty,
      seed: config.seed,
    };
    Object.assign(body, fields);
    if (
      provider === "desktop-local" ||
      provider === "android-local" ||
      (provider === "ollama" && config.apiFormat === "ollama")
    ) {
      Object.assign(body, {
        top_k: config.topK,
        min_p: config.minP,
        typical_p: config.typicalP,
        repeat_penalty: config.repeatPenalty,
        repeat_last_n: config.repeatLastN,
      });
    }
  }
  const stops = config.stop?.filter((item) => item.length > 0);
  if (stops?.length) body.stop = stops;
  if (provider === "desktop-local" || provider === "android-local") {
    Object.assign(body, {
      llmContextSize: config.contextSize,
      llmSamplingEnabled: config.samplingEnabled,
      llmGpuLayers: config.gpuLayers ?? -1,
      llmThreads: config.threads ?? 0,
      llmBatchSize: config.batchSize ?? 0,
      llmUbatchSize: config.ubatchSize ?? 0,
      llmFlashAttention: config.flashAttention,
      llmCacheTypeK: config.cacheTypeK,
      llmCacheTypeV: config.cacheTypeV,
      llmRopeScaling: config.ropeScaling,
      llmRopeScale: config.ropeScale,
    });
  }
  return Object.fromEntries(
    Object.entries(body).filter(([, value]) => value !== undefined),
  );
}

export function validateLLMParameters(config: LLMParameters) {
  const errors: string[] = [];
  for (const [field, min] of [
    ["maxTokens", 1],
    ["contextSize", 0],
    ["gpuLayers", -1],
    ["threads", 0],
    ["batchSize", 0],
    ["ubatchSize", 0],
    ["topK", 0],
    ["repeatLastN", -1],
    ["seed", -1],
  ] as const) {
    const value = config[field];
    if (value !== undefined && (!Number.isSafeInteger(value) || value < min))
      errors.push(`${field} must be an integer of at least ${min}`);
  }
  for (const field of ["temperature", "repeatPenalty", "ropeScale"] as const) {
    const value = config[field];
    if (value !== undefined && (!Number.isFinite(value) || value < 0))
      errors.push(`${field} must be a non-negative number`);
  }
  for (const field of ["topP", "minP", "typicalP"] as const) {
    const value = config[field];
    if (
      value !== undefined &&
      (!Number.isFinite(value) || value < 0 || value > 1)
    )
      errors.push(`${field} must be between 0 and 1`);
  }
  return errors;
}
