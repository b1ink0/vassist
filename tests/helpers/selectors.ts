export const SETUP_STEPS = [
  { step: 1, title: "Welcome" },
  { step: 2, title: "Virtual Companion" },
  { step: 3, title: "AI Configuration" },
  { step: 4, title: "Voice" },
  { step: 5, title: "AI+ Features" },
] as const;

export const MAIN_SETTINGS_TABS = [
  "UI",
  "3D",
  "LLM",
  "TTS",
  "STT",
  "AI+",
] as const;

export const LLM_SUB_TABS = ["Provider", "Routing", "Profiles"] as const;

export const THREE_D_SUB_TABS = [
  "Display",
  "Performance",
  "Models",
  "Animations",
  "Emotes",
] as const;

export const AI_FEATURE_LABELS = [
  "Translator",
  "Language Detector",
  "Summarizer",
  "Text Rewriter",
  "Content Writer",
] as const;

export const WEB_LLM_SETUP_PROVIDER_IDS = [
  "chrome-ai",
  "openai",
  "ollama",
] as const;

export const WEB_TTS_SETUP_PROVIDER_IDS = [
  "kokoro",
  "openai",
  "openai-compatible",
] as const;

export const WEB_STT_SETUP_PROVIDER_IDS = [
  "chrome-ai-multimodal",
  "openai",
  "openai-compatible",
] as const;
