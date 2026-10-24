const isTruthyEnvValue = (value: string | undefined): boolean =>
  value === "1" || value === "true" || value === "TRUE";

export const vassistTestFlags = {
  enabled: isTruthyEnvValue(import.meta.env.VITE_VASSIST_TEST_MODE),
  disableCamera: isTruthyEnvValue(import.meta.env.VITE_VASSIST_DISABLE_CAMERA),
  disableMic: isTruthyEnvValue(import.meta.env.VITE_VASSIST_DISABLE_MIC),
  disableTts: isTruthyEnvValue(import.meta.env.VITE_VASSIST_DISABLE_TTS),
  disableStt: isTruthyEnvValue(import.meta.env.VITE_VASSIST_DISABLE_STT),
  disableHeavyModelLoading: isTruthyEnvValue(
    import.meta.env.VITE_VASSIST_DISABLE_HEAVY_MODEL_LOADING,
  ),
  fakeAi: isTruthyEnvValue(import.meta.env.VITE_VASSIST_FAKE_AI),
  fakeExtensionHost: isTruthyEnvValue(
    import.meta.env.VITE_VASSIST_FAKE_EXTENSION_HOST,
  ),
};

export const isVAssistTestMode = vassistTestFlags.enabled;
