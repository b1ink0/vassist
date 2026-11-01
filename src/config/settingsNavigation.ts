import type {
  VAssistOpenSettingsOptions,
  VAssistSettingsTabId,
  VAssistSettingsTargetId,
} from "../embed/config";
import { LLM_PARAMETER_KEYS, type LLMParameters } from "./llmParameters";
import { AIProviderSections } from "./aiConfig";

/** Navigation only field values, persistence and platform behavior stay with their owners. */
export const settingsPages = [
  {
    id: "appearance",
    label: "Appearance",
    group: "Assistant",
    tab: "ui",
    view: "display",
    icon: "settings",
    keywords: "theme dark light adaptive colors background slideshow parallax",
  },
  {
    id: "chat",
    label: "Chat",
    group: "Assistant",
    tab: "ui",
    view: "chat",
    icon: "message-circle",
    keywords: "messages fade animation thinking streaming",
  },
  {
    id: "character",
    label: "Character",
    group: "Character & scene",
    tab: "3d",
    view: "display",
    icon: "user",
    keywords: "avatar portrait clipping shadow position",
  },
  {
    id: "performance",
    label: "Rendering & physics",
    group: "Character & scene",
    tab: "3d",
    view: "performance",
    icon: "settings",
    keywords:
      "quality fps frame rate bloom exposure saturation msaa fxaa physics bullet havok",
  },
  {
    id: "avatars",
    label: "Avatars",
    group: "Character & scene",
    tab: "3d",
    view: "models",
    icon: "user",
    keywords: "models import pmx textures meshes rename delete",
  },
  {
    id: "scenes",
    label: "Scenes",
    group: "Character & scene",
    tab: "3d",
    view: "stages",
    icon: "image",
    keywords: "stages environment brightness time season weather",
  },
  {
    id: "animations",
    label: "Animations",
    group: "Character & scene",
    tab: "3d",
    view: "animations",
    icon: "play",
    keywords: "motion vmd import idle thinking walking talking",
  },
  {
    id: "emotes",
    label: "Emotes",
    group: "Character & scene",
    tab: "3d",
    view: "emotes",
    icon: "music",
    keywords: "audio motion camera categories import zip playback progress",
  },
  {
    id: "connection",
    label: "AI connection",
    group: "Intelligence",
    tab: "llm",
    view: "provider",
    icon: "layers",
    keywords:
      "provider openai ollama chrome local backend endpoint api key model saved connections test",
  },
  {
    id: "generation",
    label: "Response & context",
    group: "Intelligence",
    tab: "llm",
    view: "generation",
    icon: "settings",
    keywords:
      "temperature tokens context size thinking effort sampling top p top k seed stop repeat penalty threads gpu cache rope batch flash",
  },
  {
    id: "models",
    label: "Model library",
    group: "Intelligence",
    tab: "llm",
    view: "models",
    icon: "download",
    keywords:
      "download installed import gguf hugging face ollama folder storage delete",
  },
  {
    id: "runtime",
    label: "Engines & services",
    group: "Intelligence",
    tab: "llm",
    view: "runtime",
    icon: "desktop-mode",
    keywords:
      "install backend runtime packs acceleration cuda cpu vulkan metal network server port lan",
  },
  {
    id: "prompts",
    label: "Prompts",
    group: "Intelligence",
    tab: "llm",
    view: "profiles",
    icon: "prompt",
    keywords: "personality system prompt profile",
  },
  {
    id: "routing",
    label: "Model routing",
    group: "Intelligence",
    tab: "llm",
    view: "routing",
    icon: "settings",
    keywords: "vision router multi model image",
  },
  {
    id: "decision",
    label: "Decision model",
    group: "Intelligence",
    tab: "llm",
    view: "decision",
    icon: "settings",
    keywords: "system one decision timeout",
  },
  {
    id: "voice-output",
    label: "Voice output",
    group: "Intelligence",
    tab: "tts",
    view: "provider",
    icon: "music",
    keywords:
      "speech tts voice lip sync vits kokoro gpt sovits supertonic download test",
  },
  {
    id: "voice-input",
    label: "Voice input",
    group: "Intelligence",
    tab: "stt",
    view: "provider",
    icon: "microphone",
    keywords:
      "speech recognition microphone stt whisper sensevoice dolphin language model download test",
  },
  {
    id: "tools",
    label: "Tools & shortcuts",
    group: "Application",
    tab: "ui",
    view: "tools",
    icon: "settings",
    keywords: "toolbar keyboard shortcut focus selection hover",
  },
  {
    id: "ai-tools",
    label: "AI tools",
    group: "Application",
    tab: "ai-plus",
    view: "tools",
    icon: "settings",
    keywords: "translate translator language detect summarize rewrite writer",
  },
  {
    id: "desktop",
    label: "Desktop & XR",
    group: "Application",
    tab: "ui",
    view: "mode",
    icon: "desktop-mode",
    keywords:
      "app floating wallpaper separate chat xr vr browser https pairing certificate",
  },
  {
    id: "data",
    label: "Data & help",
    group: "Application",
    tab: "ui",
    view: "data",
    icon: "settings",
    keywords:
      "backup export import zip storage reset setup documentation developer debug devtools extension auto load",
  },
] as const;

export type SettingsPageId = (typeof settingsPages)[number]["id"];
export type SettingsPage = (typeof settingsPages)[number];

export function getSettingsPage(
  request: VAssistOpenSettingsOptions,
): SettingsPageId {
  const target = request.target ?? request.subTab ?? request.tab ?? "ui";
  if (target.startsWith("llm.")) {
    if (
      AIProviderSections.some((section) =>
        target.startsWith("llm." + section + "."),
      ) &&
      (LLM_PARAMETER_KEYS.some((key) => target.endsWith("." + key)) ||
        target.endsWith(".thinkingEffort") ||
        target.endsWith(".thinkingEnabled"))
    )
      return "generation";
    return (
      settingsPages.find(
        (page) => page.tab === "llm" && target.startsWith(`llm.${page.view}`),
      )?.id ?? "connection"
    );
  }
  if (target === "ui.mode") return "desktop";
  if (target.startsWith("ui.aiToolbar")) return "tools";
  if (target.startsWith("ui.storage") || target.startsWith("ui.developer"))
    return "data";
  return (
    settingsPages.find(
      (page) => page.tab === (request.tab ?? target.split(".")[0]),
    )?.id ?? "appearance"
  );
}

export const settingsSearchFields: {
  page: SettingsPageId;
  label: string;
  target?: VAssistSettingsTargetId;
  parameter?: keyof LLMParameters;
}[] = [
  { page: "appearance", label: "Application theme", target: "ui.appearance" },
  { page: "appearance", label: "Background brightness and parallax" },
  { page: "chat", label: "Auto-expand thinking" },
  { page: "chat", label: "Message fading and text animation" },
  { page: "character", label: "Avatar shadow and portrait clipping" },
  { page: "performance", label: "Frame rate and render quality" },
  { page: "performance", label: "Physics engine" },
  { page: "generation", label: "Context size", parameter: "contextSize" },
  { page: "generation", label: "Temperature", parameter: "temperature" },
  { page: "generation", label: "Output tokens", parameter: "maxTokens" },
  { page: "generation", label: "Advanced sampling and runtime parameters" },
  {
    page: "connection",
    label: "Provider and saved backend",
    target: "llm.provider.select",
  },
  { page: "prompts", label: "System prompt profile" },
  { page: "models", label: "Installed models and model folder" },
  { page: "runtime", label: "Inference engine and backend installation" },
  { page: "runtime", label: "Shared server and internal ports" },
  {
    page: "voice-output",
    label: "Accurate and legacy lip sync",
    target: "tts.accurateLipSync",
  },
  { page: "voice-input", label: "Microphone and recognition language" },
  { page: "tools", label: "AI toolbar", target: "ui.aiToolbar" },
  { page: "data", label: "Backup and restore", target: "ui.storage" },
  { page: "data", label: "Developer tools", target: "ui.developer" },
];

export const defaultSettingsPage = (tab: VAssistSettingsTabId) =>
  settingsPages.find((page) => page.tab === tab)?.id ?? "appearance";
