# Settings Reference

A tab-by-tab reference for everything in Settings. Jump to the tab you need.

<div class="doc-grid">
  <a class="doc-card doc-card-link" href="./ui">
    <h3>UI</h3>
    <p>Theme, toolbar toggles, chat position, keyboard shortcuts, backup/restore, Android backgrounds, developer tools.</p>
    <p class="doc-card-cta">UI settings →</p>
  </a>
  <a class="doc-card doc-card-link" href="./three-d">
    <h3>3D</h3>
    <p>Avatar on/off, portrait mode, scene performance, PMX models and stages, VMD motions, and emotes.</p>
    <p class="doc-card-cta">3D settings →</p>
  </a>
  <a class="doc-card doc-card-link" href="./llm">
    <h3>LLM</h3>
    <p>Main AI provider, saved backends, desktop local runtime, routing, local model downloads.</p>
    <p class="doc-card-cta">LLM settings →</p>
  </a>
  <a class="doc-card doc-card-link" href="./tts">
    <h3>TTS</h3>
    <p>Spoken replies: global toggle, provider, voice library, Kokoro and GPT-SoVITS setup.</p>
    <p class="doc-card-cta">TTS settings →</p>
  </a>
  <a class="doc-card doc-card-link" href="./stt">
    <h3>STT</h3>
    <p>Microphone input: global toggle, provider, Whisper setup, Chrome AI speech.</p>
    <p class="doc-card-cta">STT settings →</p>
  </a>
  <a class="doc-card doc-card-link" href="./ai-features">
    <h3>AI+</h3>
    <p>Feature gates for translate, detect language, summarize, rewrite, and write.</p>
    <p class="doc-card-cta">AI+ settings →</p>
  </a>
</div>

## Things worth knowing about settings

- **Auto-saved**: changes save as you make them, no save button.
- **Provider-gated controls**: controls for a provider only appear after you select that provider. You won't see OpenAI fields unless OpenAI is selected.
- **Platform-specific controls**: some settings only exist on one platform (desktop-only, Android-only, extension-only). They're labeled in the reference pages.
- **Master toggles**: TTS and STT hide most of their controls until the master enable switch is on.
- **Saved backends**: LLM, TTS, and STT all support named backend profiles so you can switch between providers without re-entering credentials.

## Full tab summary

| Tab | What's there                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- |
| UI  | Docs link, setup reset, theme, toolbar settings, chat placement, shortcuts, backup/export/import, Android backgrounds, debug panel |
| 3D  | Avatar, portrait mode, physics, render quality, PMX model/stage library, VMD motion library, emote library                         |
| LLM | Provider selector, saved backends, desktop local runtime and backend install, routing, local GGUF model manager, system prompts    |
| TTS | Global speech toggle, provider, GPT-SoVITS voice library, Kokoro setup, OpenAI TTS, speech test                                    |
| STT | Global transcription toggle, provider, desktop Whisper setup, Chrome AI speech, microphone picker, recording test                  |
| AI+ | Translator, language detector, summarizer, rewriter, content writer: per-feature toggles and test actions                          |
