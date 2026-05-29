# Android

Android runs the full app on phones and tablets, plus a live wallpaper mode where the Live Assistant renders on your home screen. Local LLM, TTS, and STT providers run on-device.

## Main app vs. wallpaper

| Android mode   | What it is for                                                                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| Full app       | Normal setup, settings, chat, toolbar, and Live Assistant use inside the Android app.                          |
| Live wallpaper | A wallpaper-focused view that reuses the saved settings from the full app instead of showing the whole app UI. |

Do setup in the full Android app first. The wallpaper reads those saved choices later.

## Android Local AI

- Android Local LLM uses native [llama.cpp](https://github.com/ggerganov/llama.cpp) inside the Android project.
- Android Local models are GGUF files managed in the app, and image-capable local models can also need a matching mmproj file.
- Android Local TTS uses sherpa-onnx VITS with a built-in VCTK voice pack.
- Android Local STT uses sherpa-onnx Whisper on device.

These are the local Android options you see in setup and settings. They are different from the desktop-local runtime even when the labels look similar.

## What to know before using wallpaper mode

- Wallpaper mode is more limited than the full app.
- It is meant to render the Live Assistant, not replace the full setup and settings flow.
- File picking is not available there.
- Audio capture is not available there.
- Touch input and visibility still reach the wallpaper renderer so the Live Assistant can stay interactive on the home screen.

## Related pages

<div class="doc-link-list">
	<a href="/getting-started/installation">Installation guide →</a>
	<a href="/guide/virtual-companion">Live Assistant →</a>
	<a href="/architecture/ai-and-media-stack">AI and media stack →</a>
</div>
