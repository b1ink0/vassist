/**
 * TTS language packs available for on-device Android synthesis via sherpa-onnx.
 *
 * Mirrors TTS_PACKS in
 * android/app/src/main/kotlin/com/vassist/app/ai/TtsModelManager.kt
 *
 * - "vits-vctk" is the legacy default pack (lexicon phonemization, no espeak-ng)
 * - "tts-en-kitten" - KittenTTS Nano v0.1 fp16 (~41 MB installed, Apache-2.0)
 * - "tts-ja-supertonic" - SupertonicTTS 3 int8 (~139 MB installed, MIT);
 *   the only sherpa-compatible offline Japanese-capable model as of 2026-08,
 *   also speaks English + 29 other languages
 */
export interface AndroidTtsPack {
  /** Pack id used by the native bridge (downloadTtsPack / deleteTtsPack) */
  id: string;
  displayName: string;
  /** Primary language code */
  language: "en" | "ja";
  /** Which native engine this entry uses ("vits-legacy" flows through the old bridge calls) */
  kind: "vits-legacy" | "kitten" | "supertonic";
  badgeLabel?: string;
  downloadSize: string;
  approxInstalledSize: string;
  supportsSpeakerId: boolean;
  /** Known speaker count; undefined means queried at runtime (Supertonic) */
  numSpeakers?: number;
}

export const ANDROID_TTS_PACKS: AndroidTtsPack[] = [
  {
    id: "vits-vctk",
    displayName: "VCTK English",
    language: "en",
    kind: "vits-legacy",
    badgeLabel: "109 Voices",
    downloadSize: "~145 MB",
    approxInstalledSize: "~152 MB",
    supportsSpeakerId: true,
    numSpeakers: 109,
  },
  {
    id: "tts-en-kitten",
    displayName: "Kitten Nano English",
    language: "en",
    kind: "kitten",
    badgeLabel: "8 Voices",
    downloadSize: "~26 MB",
    approxInstalledSize: "~41 MB",
    supportsSpeakerId: true,
    numSpeakers: 8,
  },
  {
    id: "tts-ja-supertonic",
    displayName: "Supertonic 3 Japanese",
    language: "ja",
    kind: "supertonic",
    badgeLabel: "10 Voices · 31 Languages",
    downloadSize: "~123 MB",
    approxInstalledSize: "~139 MB",
    supportsSpeakerId: true,
    numSpeakers: 10,
  },
];

/** Progress-event type strings used by these packs (must match Kotlin pack ids) */
export const ANDROID_TTS_EVENT_TYPES = ANDROID_TTS_PACKS.map((p) => p.id);

export const getTtsPackById = (id: string): AndroidTtsPack | undefined =>
  ANDROID_TTS_PACKS.find((p) => p.id === id);

/** Config value meaning "use whatever the native side resolves" (legacy default) */
export const ANDROID_TTS_MODEL_AUTO = "vits-local";
