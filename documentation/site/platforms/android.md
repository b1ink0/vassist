# Android

<script setup>
import AppIcon from "../.vitepress/theme/components/AppIcon.vue"
</script>

Android runs the full app on phones and tablets, plus a live wallpaper mode where the Live Assistant renders on your home screen. Local LLM, TTS, and STT providers run on-device.

## Main app vs. wallpaper

| Android mode   | What it is for                                                                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| Full app       | Normal setup, settings, chat, toolbar, and Live Assistant use inside the Android app.                          |
| Live wallpaper | A wallpaper-focused view that reuses the saved settings from the full app instead of showing the whole app UI. |

Do setup in the full Android app first. The wallpaper reads those saved choices later.

The setup wizard starts with Blue Milky Way selected. In **Settings > UI > Display**, choose bundled wallpapers, import images, or use a solid color or customizable gradient for the app and live wallpaper. Android stores imported images in VAssist. See [Android backgrounds](/settings/ui#android-backgrounds) for slideshow, parallax, image effects, and background color controls.

## Android Local AI

- Android Local LLM runs GGUF models with [llama.cpp](https://github.com/ggml-org/llama.cpp) and `.litertlm` models with LiteRT-LM. The local model manager handles both formats.
- Vision-capable Android Local models accept chat images. VAssist detects native vision support and manages a matching `mmproj` encoder for supported downloads.
- Android Local LLM settings include a compute unit selector for Auto, CPU, GPU, or NPU. Available acceleration depends on the device and model. Unsupported choices fall back to CPU.
- Android Local TTS offers downloadable VCTK, Kitten Nano, and Supertonic voice packs for offline speech.
- Android Local STT offers Whisper, SenseVoice, and Dolphin models, with compute-provider choices for CPU and supported accelerators.

These are the local Android options you see in setup and settings. They are different from the desktop-local runtime even when the labels look similar.

## Augmented reality

AR places the Live Assistant in the camera view on ARCore-compatible Android devices. It needs camera permission.

1. Open the full app with the Live Assistant visible and tap the <AppIcon name="view-in-ar" /> icon in the floating assistant controls. Its tooltip says **View Avatar in AR** and its screen-reader label is **Enter AR mode**.
2. Move the phone slowly and aim at the floor while the app scans for a surface.
3. When the guide says **Floor found**, tap the surface to place the avatar.
4. Tap the <AppIcon name="zoomIn" /> icon to open Zoom Control. Its tooltip says **Zoom Control**. Then tap <AppIcon name="plus" /> to zoom in or <AppIcon name="minus" /> to zoom out. Tap <AppIcon name="refresh" /> to reset the size and rotation. Tap <AppIcon name="rotate-left" /> or <AppIcon name="rotate-right" /> to turn the avatar in 10-degree steps. Tooltips identify the zoom controls. The rotate controls also have screen-reader labels.
5. Tap the <AppIcon name="view-in-ar" /> icon again to leave AR mode. Its tooltip says **Exit AR Mode** and its screen-reader label changes to **Exit AR mode**.

AR mode is part of the full app. Set up the avatar and settings there before switching to live wallpaper mode.

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
