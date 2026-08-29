# Install VAssist

Desktop, Android, and extension releases are published on [GitHub Releases](https://github.com/b1ink0/vassist/releases). If you are embedding VAssist into your own site or app, use the npm package docs instead of the platform installers.

::: tip Not sure yet?
The [live demo](https://vassist-demo.vercel.app) runs in your browser and shows the full interface with no install required.
:::

## Choose your platform

<div class="doc-grid">
	<div class="doc-card">
		<h3>Desktop app</h3>
		<p>Windows, macOS, and Linux. Full local AI, screen share, and tray support.</p>
		<p><a href="https://github.com/b1ink0/vassist/releases">GitHub Releases →</a></p>
	</div>
	<div class="doc-card">
		<h3>Android app</h3>
		<p>Phones and tablets. Includes live wallpaper mode and on-device AI.</p>
		<p><a href="https://github.com/b1ink0/vassist/releases">GitHub Releases →</a></p>
	</div>
	<div class="doc-card">
		<h3>Browser extension</h3>
		<p>Chrome and Chromium-based browsers. Works directly on any page.</p>
		<p><a href="https://github.com/b1ink0/vassist/releases">GitHub Releases →</a></p>
	</div>
</div>

## Use VAssist as a package

If you want to embed VAssist into your own web app instead of installing the desktop app, Android app, or extension, use the browser packages published on npm:

```bash
npm install @vassist/embed
# or
npm install @vassist/react react react-dom
```

Recommended reading order if you are embedding VAssist:

1. [Package integration](/architecture/packages-and-integration): choose `@vassist/embed` vs `@vassist/react`, pick an entry point, and decide whether requests stay in the browser or move to a host bridge.
2. [@vassist/embed reference](/architecture/embed): imperative mount/update/remove helpers, custom element usage, runtime controls, snapshots, storage, and resource loading.
3. [@vassist/react reference](/architecture/react): React components, reactive config props, `customizations`, and host control from React.
4. [Configuration reference](/architecture/configuration-reference): every supported config field, settings target ID, bridge type, branding option, and hook.

If browser code must not hold vendor credentials, use `providers.mode: "host-managed"` together with `transport.mode: "host-bridge"` so your backend or native host owns AI/TTS/STT requests.

## Requirements

| Version   | What you need                            |
| --------- | ---------------------------------------- |
| Desktop   | Windows, macOS, or Linux                 |
| Android   | Any Android phone or tablet              |
| Extension | Chrome or another Chromium-based browser |

## Install on desktop

1. Go to the latest release on GitHub.
2. Download the file matching your OS (Windows, macOS, or Linux).
3. Open it and follow the install steps your system shows.
4. Launch VAssist. The setup wizard runs on first launch.

## Install on Android

1. Open the latest release on your phone (or transfer the APK to it).
2. Download the `.apk` file.
3. Open it. Android will ask you to confirm installing from an unknown source. Allow it.
4. Launch VAssist from your app drawer.

::: info Live wallpaper setup
Do the main app setup before enabling the Android live wallpaper. The wallpaper reads settings from the app, so it needs them to be saved first.
:::

## Install the browser extension

The extension isn't on the Chrome Web Store yet, so you install it manually:

1. Download the latest extension zip from GitHub Releases.
2. Unzip it somewhere permanent (don't delete it after installing).
3. Open `chrome://extensions` in Chrome.
4. Enable **Developer mode** (top-right toggle).
5. Click **Load unpacked** and select the unzipped folder.
6. Pin the extension icon for quick access.

::: info Chrome AI features
Some extension features use Chrome's built-in AI (Gemini Nano). Those require a recent Chrome build and specific flags. The setup wizard will walk you through it if they're needed.
:::

## After installing

VAssist opens the setup wizard on first launch. That's where you choose your AI provider, voice options, and Live Assistant mode. See the [setup guide →](/getting-started/setup-wizard).

## Building from source

See the project [README](https://github.com/b1ink0/vassist#installation) and [CONTRIBUTING guide](https://github.com/b1ink0/vassist/blob/main/CONTRIBUTING.md).
