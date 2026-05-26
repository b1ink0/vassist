# Android

Android brings VAssist to phones and tablets, including live wallpaper mode and Android-local AI options that run on the device instead of through the desktop runtime.

## What Android is best at

- carrying the full app on a phone or tablet
- using the companion as a live wallpaper view
- running Android Local LLM, TTS, and STT providers on the device
- sharing one set of avatar and AI settings between the main app and the wallpaper renderer

## The main app and the wallpaper are different modes

| Android mode | What it is for |
| --- | --- |
| Full app | Normal setup, settings, chat, toolbar, and companion use inside the Android app. |
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
- It is meant to render the companion, not replace the full setup and settings flow.
- File picking is not available there.
- Audio capture is not available there.
- Touch input and visibility still reach the wallpaper renderer so the companion can stay interactive on the home screen.

## Android fits best when

- VAssist needs to live on a phone or tablet.
- The live wallpaper companion is part of the experience.
- Desktop-only features such as local GGUF library management, GPT-SoVITS voice setup, or desktop capture are not the priority.

## Related pages

<div class="doc-link-list">
	<a href="/getting-started/installation">Open installation guide</a>
	<a href="/guide/virtual-companion">Open virtual companion guide</a>
	<a href="/architecture/ai-and-media-stack">Open AI and media stack reference</a>
</div>