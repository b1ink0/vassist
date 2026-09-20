/**
 * Whisper model variants available for on-device Android STT via sherpa-onnx.
 *
 * Mirrors WHISPER_VARIANTS in
 * android/app/src/main/kotlin/com/vassist/app/ai/STTTTSModelManager.kt
 *
 * - ".en" variants are English-only
 * - "tiny" / "base" are multilingual (99 languages incl. Chinese zh and Japanese ja)
 */
export interface AndroidWhisperVariant {
  /** Variant id used by the native bridge (downloadWhisperVariant / deleteWhisperVariant) */
  id: string;
  /** Model name sent as the OpenAI-style "model" form field */
  modelName: string;
  displayName: string;
  downloadSize: string;
  multilingual: boolean;
  /**
   * Which native engine this entry uses. "whisper" variants share the whisper
   * download/delete bridge calls; "sensevoice" and "dolphin" have their own.
   */
  kind?: "whisper" | "sensevoice" | "dolphin";
  /** Badge text shown on the model card */
  badgeLabel?: string;
}

export const ANDROID_WHISPER_VARIANTS: AndroidWhisperVariant[] = [
  {
    id: "tiny.en",
    modelName: "whisper-tiny.en",
    displayName: "Tiny English",
    downloadSize: "~113 MB",
    multilingual: false,
    kind: "whisper",
    badgeLabel: "English Only",
  },
  {
    id: "tiny",
    modelName: "whisper-tiny",
    displayName: "Tiny Multilingual",
    downloadSize: "~110 MB",
    multilingual: true,
    kind: "whisper",
    badgeLabel: "99 Languages (zh/ja)",
  },
  {
    id: "base.en",
    modelName: "whisper-base.en",
    displayName: "Base English",
    downloadSize: "~145 MB",
    multilingual: false,
    kind: "whisper",
    badgeLabel: "English Only",
  },
  {
    id: "base",
    modelName: "whisper-base",
    displayName: "Base Multilingual",
    downloadSize: "~200 MB",
    multilingual: true,
    kind: "whisper",
    badgeLabel: "99 Languages (zh/ja)",
  },
  {
    id: "sensevoice",
    modelName: "sensevoice",
    displayName: "SenseVoice Multilingual",
    downloadSize: "~230 MB",
    // zh/en/ja/ko/yue - best accuracy/speed for Chinese & Japanese
    multilingual: true,
    kind: "sensevoice",
    badgeLabel: "5 Languages (zh/ja/ko/yue/en)",
  },
  {
    id: "dolphin-base",
    modelName: "dolphin-base",
    displayName: "Dolphin Base CTC",
    downloadSize: "~99 MB",
    // 40 Eastern languages + 22 Chinese dialects; smallest multilingual model
    multilingual: true,
    kind: "dolphin",
    badgeLabel: "40+ Languages (Eastern)",
  },
  {
    id: "dolphin-small",
    modelName: "dolphin-small",
    displayName: "Dolphin Small CTC",
    downloadSize: "~239 MB",
    // Same coverage as base, better accuracy (WER 25.2 vs 33.3)
    multilingual: true,
    kind: "dolphin",
    badgeLabel: "40+ Languages (Higher Accuracy)",
  },
];

export const SENSEVOICE_LANGUAGES = ["zh", "en", "ja", "ko", "yue"];

export const getWhisperVariantById = (
  id: string,
): AndroidWhisperVariant | undefined =>
  ANDROID_WHISPER_VARIANTS.find((v) => v.id === id);

/** STT config model value meaning "use whatever is downloaded" */
export const ANDROID_STT_MODEL_AUTO = "whisper-local";
