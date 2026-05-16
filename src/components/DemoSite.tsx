import { useChatActions } from "../hooks/app/useChat";
import { Icon } from "./icons";
import { cn } from "../utils/cn";
import logoSvg from "../assets/VA.svg";

const platformCards = [
  {
    title: "Browser Extension",
    subtitle: "Manifest V3",
    body: "Runs in any Chrome tab. Injects the chat UI and AI toolbar, handles TTS and lipsync through an offscreen document, and routes all provider calls through the background service worker.",
  },
  {
    title: "Android App",
    subtitle: "On-device local AI",
    body: "Local LLM via llama.cpp and on-device STT/TTS via sherpa-onnx (whisper-tiny.en + vits-vctk). Live wallpaper mode runs the companion avatar on your Android home screen.",
  },
  {
    title: "Desktop App",
    subtitle: "Electron + local server",
    body: "node-llama-cpp for local LLM, Faster Whisper for STT, and GPT-SoVITS for TTS all served through a local HTTP server.",
  },
];

const capabilityRows = [
  {
    label: "Avatar + Chat",
    value:
      "3D PMX companion with VMD motions and audio-driven lipsync. Full chat with streaming, attachments, page context injection, and history branching.",
  },
  {
    label: "AI Toolbar",
    value:
      "Appears on text selection. Runs rewrite, summarize, translate, writer, dictation, and image actions through your configured providers.",
  },
  {
    label: "Voice",
    value:
      "STT input → LLM response → chunked TTS playback. Each chunk queues independently and playback timing drives avatar lipsync.",
  },
  {
    label: "Local Runtime",
    value:
      "Android: llama.cpp + sherpa-onnx (whisper-tiny.en, vits-vctk). Desktop: node-llama-cpp + Faster Whisper + GPT-SoVITS.",
  },
  {
    label: "Config",
    value:
      "Setup wizard writes aiConfig, ttsConfig, sttConfig, and uiConfig. Changes debounce-save and reconfigure service proxies without a restart.",
  },
];

const principles = [
  "Extension, Android, and Desktop share one React codebase and one setup flow.",
  "Android and Desktop default to local providers no cloud dependency required.",
  "The AI toolbar activates on text selection without disrupting page context.",
  "Companion uses PMX models, VMD motions, and audio-driven lipsync.",
];

const companionAssets = [
  {
    title: "PMX Models",
    subtitle: "Custom avatar",
    body: "Upload any PMX model file to replace the default companion. Full bone hierarchy and physics support via the babylon-mmd pipeline. The model you load becomes your persistent avatar across all runtimes.",
  },
  {
    title: "PMX Stages",
    subtitle: "Custom environment",
    body: "Load a PMX stage as the companion background. Any MMD-compatible stage file works. Swap stages independently from the avatar without reloading the scene.",
  },
  {
    title: "VMD Motions",
    subtitle: "Custom animation library",
    body: "Import VMD animation files and assign them to categories. Control which motions are enabled per state idle, talking, reacting. The companion cycles through your motion library during normal use.",
  },
  {
    title: "Emotes",
    subtitle: "Motion + audio + camera",
    body: "Create or import emotes that combine a VMD motion clip, an audio file, and a camera variant into a single triggered event. Assign multiple variants per emote for natural variation.",
  },
];

const companionTechRows = [
  {
    label: "Renderer",
    value:
      "Babylon.js with the babylon-mmd pipeline for PMX model loading, VMD playback, and physics",
  },
  {
    label: "Lipsync",
    value:
      "Audio-driven: TTS playback timing is used to drive VMD morph targets on the avatar in real time",
  },
  {
    label: "Motion format",
    value:
      "VMD (Vocaloid Motion Data) standard MMD animation files. Import and categorise from settings.",
  },
  {
    label: "Emote format",
    value:
      "Each emote stores a VMD motion reference, an audio blob, and a camera VMD variant",
  },
  {
    label: "Android wallpaper",
    value:
      "The companion can be applied as a live wallpaper on Android via the in-app setup flow the avatar runs on your home screen with full motion and lipsync",
  },
];

const sectionClass =
  "max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 border-t border-white/10";

interface DemoSiteProps {
  onLaunchAssistant?: () => void;
}

const DemoSite = ({ onLaunchAssistant }: DemoSiteProps) => {
  const { openChat } = useChatActions();

  const handlePrimaryAction = () => {
    if (onLaunchAssistant) {
      onLaunchAssistant();
      return;
    }
    openChat?.();
  };

  return (
    <div
      className="absolute inset-0 overflow-auto bg-black text-white"
      style={{
        fontFamily: '"Space Grotesk", "IBM Plex Sans", system-ui, sans-serif',
      }}
    >
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.08),transparent_35%),radial-gradient(circle_at_80%_10%,rgba(255,255,255,0.05),transparent_30%),radial-gradient(circle_at_50%_80%,rgba(255,255,255,0.04),transparent_35%)]" />

      {/* ── Header ── */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-black/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={logoSvg}
              alt="VAssist"
              className="w-9 h-9 object-contain"
            />
            <div>
              <p className="text-sm font-semibold tracking-[0.08em] uppercase text-white/90">
                VAssist
              </p>
              <p className="text-[11px] text-white/60">
                Extension · Android · Desktop
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="https://github.com/b1ink0/vassist/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 text-xs sm:text-sm rounded-md border border-white/20 text-white/90 hover:bg-white/10 transition-colors"
            >
              <span className="inline-flex items-center gap-1.5">
                <Icon name="github" size={14} />
                <span>Releases</span>
              </span>
            </a>
            <button
              onClick={handlePrimaryAction}
              className="px-3 py-1.5 text-xs sm:text-sm rounded-md bg-white text-black font-semibold hover:bg-white/85 transition-colors"
            >
              Open Chat
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-24 pb-14 sm:pb-20">
        <div className="max-w-4xl">
          <p className="inline-flex items-center px-3 py-1 text-[11px] tracking-[0.12em] uppercase rounded-full border border-white/20 bg-white/5 text-white/80">
            Open source
          </p>
          <h1 className="mt-6 text-4xl sm:text-6xl lg:text-7xl font-semibold leading-[0.95] tracking-[-0.02em]">
            One AI assistant,
            <br />
            three runtimes.
          </h1>
          <p className="mt-6 text-base sm:text-xl text-white/75 max-w-3xl leading-relaxed">
            Browser extension with in-page AI tools. Android app with local
            on-device models. Electron desktop app with local LLM, Whisper, and
            GPT-SoVITS.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <button
              onClick={handlePrimaryAction}
              className="px-5 py-2.5 rounded-lg bg-white text-black font-semibold hover:bg-white/85 transition-colors"
            >
              Open Chat
            </button>
            <a
              href="#platforms"
              className="px-5 py-2.5 rounded-lg border border-white/25 text-white/90 hover:bg-white/10 transition-colors"
            >
              Explore Platforms
            </a>
          </div>
        </div>
      </section>

      {/* ── Platforms ── */}
      <section id="platforms" className={sectionClass}>
        <div className="flex items-end justify-between gap-4 mb-8">
          <h2 className="text-2xl sm:text-4xl font-semibold tracking-[-0.01em]">
            Platforms
          </h2>
          <span className="text-xs uppercase tracking-[0.14em] text-white/45">
            Three runtimes
          </span>
        </div>
        <div className="grid md:grid-cols-3 gap-4 sm:gap-6">
          {platformCards.map((card) => (
            <article
              key={card.title}
              className="rounded-2xl border border-white/15 bg-white/[0.03] p-5 sm:p-6 hover:bg-white/[0.06] transition-colors"
            >
              <p className="text-xs uppercase tracking-[0.12em] text-white/45">
                {card.subtitle}
              </p>
              <h3 className="mt-2 text-xl font-semibold text-white">
                {card.title}
              </h3>
              <p className="mt-3 text-sm sm:text-base text-white/70 leading-relaxed">
                {card.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* ── What's Shipped ── */}
      <section className={sectionClass}>
        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-8 sm:gap-10 items-start">
          <div>
            <h2 className="text-2xl sm:text-4xl font-semibold tracking-[-0.01em]">
              What's Shipped
            </h2>
            <p className="mt-4 text-white/70 max-w-2xl">
              Features currently working in this codebase, across all three
              runtimes.
            </p>
            <div className="mt-8 border border-white/15 rounded-2xl overflow-hidden">
              {capabilityRows.map((row, idx) => (
                <div
                  key={row.label}
                  className={cn(
                    "grid grid-cols-[140px_1fr] sm:grid-cols-[180px_1fr] gap-4 p-4 sm:p-5",
                    idx < capabilityRows.length - 1 &&
                      "border-b border-white/10",
                  )}
                >
                  <p className="text-white/50 text-xs sm:text-sm uppercase tracking-[0.12em]">
                    {row.label}
                  </p>
                  <p className="text-white/85 text-sm sm:text-base">
                    {row.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <aside className="rounded-2xl border border-white/15 bg-white/[0.03] p-5 sm:p-6">
            <h3 className="text-lg sm:text-xl font-semibold">
              Design Decisions
            </h3>
            <ul className="mt-4 space-y-3">
              {principles.map((point) => (
                <li
                  key={point}
                  className="text-sm sm:text-base text-white/75 leading-relaxed flex gap-3"
                >
                  <span className="mt-2 w-1.5 h-1.5 rounded-full bg-white/70 flex-shrink-0" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </section>

      {/* ── Virtual Companion ── */}
      <section id="companion" className={sectionClass}>
        <div className="flex items-end justify-between gap-4 mb-2">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-white/45 mb-3">
              Babylon.js + babylon-mmd
            </p>
            <h2 className="text-2xl sm:text-4xl font-semibold tracking-[-0.01em]">
              Virtual Companion
            </h2>
          </div>
        </div>

        <p className="mt-4 mb-10 text-white/70 max-w-2xl text-sm sm:text-base leading-relaxed">
          The companion is a fully customizable 3D avatar that reacts to voice,
          chat, and emotes in real time. Every asset model, stage, animations,
          emotes is replaceable from settings. Nothing is locked to a default.
        </p>

        {/* Asset type cards */}
        <div className="grid sm:grid-cols-2 gap-4 sm:gap-5">
          {companionAssets.map((asset) => (
            <article
              key={asset.title}
              className="rounded-2xl border border-white/15 bg-white/[0.03] p-5 sm:p-6 hover:bg-white/[0.06] transition-colors"
            >
              <p className="text-xs uppercase tracking-[0.12em] text-white/45">
                {asset.subtitle}
              </p>
              <h3 className="mt-2 text-lg sm:text-xl font-semibold text-white">
                {asset.title}
              </h3>
              <p className="mt-3 text-sm sm:text-base text-white/70 leading-relaxed">
                {asset.body}
              </p>
            </article>
          ))}
        </div>

        {/* Technical detail table */}
        <div className="mt-8 border border-white/15 rounded-2xl overflow-hidden">
          {companionTechRows.map((row, idx) => (
            <div
              key={row.label}
              className={cn(
                "grid grid-cols-[120px_1fr] sm:grid-cols-[160px_1fr] gap-4 p-4 sm:p-5",
                idx < companionTechRows.length - 1 &&
                  "border-b border-white/10",
              )}
            >
              <p className="text-white/50 text-xs sm:text-sm uppercase tracking-[0.12em]">
                {row.label}
              </p>
              <p className="text-white/85 text-sm sm:text-base">{row.value}</p>
            </div>
          ))}
        </div>

        {/* Android live wallpaper callout */}
        <div className="mt-6 rounded-2xl border border-white/15 bg-white/[0.03] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8">
          <div className="flex-1">
            <p className="text-xs uppercase tracking-[0.12em] text-white/45 mb-2">
              Android only
            </p>
            <h3 className="text-base sm:text-lg font-semibold text-white">
              Live Wallpaper Mode
            </h3>
            <p className="mt-2 text-sm sm:text-base text-white/70 leading-relaxed">
              Apply your configured PMX companion as an Android live wallpaper
              directly from the in-app setup flow. The avatar runs on your home
              screen with full VMD motion playback and audio-driven lipsync —
              using the same local sherpa-onnx stack as the app itself.
            </p>
          </div>
          <div className="flex-shrink-0">
            <span className="inline-flex items-center px-3 py-1.5 rounded-full border border-white/20 bg-white/5 text-xs uppercase tracking-[0.12em] text-white/70 whitespace-nowrap">
              sherpa-onnx · vits-vctk
            </span>
          </div>
        </div>
      </section>

      {/* ── Download or Build ── */}
      <section className={sectionClass}>
        <div className="rounded-3xl border border-white/20 bg-white/[0.04] p-6 sm:p-10">
          <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-8 items-start">
            <div>
              <h2 className="text-2xl sm:text-4xl font-semibold tracking-[-0.01em]">
                Download or Build
              </h2>
              <p className="mt-4 text-white/72 max-w-2xl leading-relaxed">
                Pick a runtime, run setup, and configure providers from
                settings. The codebase builds for all three targets from a
                single repo.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <button
                  onClick={handlePrimaryAction}
                  className="px-5 py-2.5 rounded-lg bg-white text-black font-semibold hover:bg-white/85 transition-colors"
                >
                  Open Chat
                </button>
                <a
                  href="https://github.com/b1ink0/vassist"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-5 py-2.5 rounded-lg border border-white/25 text-white/90 hover:bg-white/10 transition-colors"
                >
                  <span className="inline-flex items-center gap-2">
                    <Icon name="github" size={16} />
                    <span>View Repository</span>
                  </span>
                </a>
              </div>
            </div>
            <div className="rounded-2xl border border-white/15 p-4 sm:p-5">
              <p className="text-xs uppercase tracking-[0.12em] text-white/50">
                Quick Start
              </p>
              <ol className="mt-3 space-y-3 text-sm text-white/80">
                <li className="pb-3 border-b border-white/10">
                  1. Pick a runtime Browser Extension, Desktop App, or Android
                  App.
                </li>
                <li className="pb-3 border-b border-white/10">
                  2. Run the setup wizard to configure your LLM, STT, and TTS
                  providers.
                </li>
                <li>
                  3. Open chat or select text on any page to use the AI toolbar.
                </li>
              </ol>
            </div>
          </div>
        </div>
      </section>

      <footer className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 border-t border-white/10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-sm text-white/60">
          <p>VAssist</p>
          <p>GPL-3.0 License</p>
        </div>
      </footer>
    </div>
  );
};

export default DemoSite;
