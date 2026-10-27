# Repository Tree

VAssist repository tree and file metrics.

## Totals

- Directories: 208
- Files: 788
- Text files counted for metrics: 644
- Total text lines: 197407
- Code files counted for metrics: 511
- Total code lines: 172548

## Line Counts by File Type

| File Type    | Extensions              | Files | Lines |
| ------------ | ----------------------- | ----: | ----: |
| Batch Script | .bat                    |     1 |    94 |
| C and C++    | .c, .cc, .cpp, .h, .hpp |     7 |  2003 |
| CSS          | .css, .scss, .less      |     7 |  3220 |
| HTML         | .html                   |     5 |   191 |
| Java         | .java                   |     4 |   215 |
| JavaScript   | .js, .mjs, .cjs         |     1 |    32 |
| Kotlin       | .kt                     |    21 | 11403 |
| Shell Script | (no extension)          |     5 |   654 |
| TSX          | .tsx                    |   142 | 60672 |
| TypeScript   | .ts, .mts, .cts         |   318 | 94064 |
| Gradle       | .gradle                 |     7 |   579 |
| JSON         | .json                   |    19 |   642 |
| Markdown     | .md                     |    37 |  6856 |
| Other Text   | mixed                   |    40 | 11717 |
| Plain Text   | (no extension)          |    12 |  4264 |
| Properties   | .properties             |     2 |    29 |
| SVG          | .svg                    |     4 |   342 |
| XML          | .xml                    |    12 |   430 |

## Top-Level Summary

- .husky/: 1 directories, 1 files
- android/: 64 directories, 93 files
- android-src/: 1 directories, 3 files
- documentation/: 16 directories, 67 files
- electron/: 20 directories, 75 files
- embed/: 1 directories, 1 files
- extension/: 6 directories, 19 files
- licenses/: 1 directories, 1 files
- packages/: 5 directories, 16 files
- public/: 14 directories, 74 files
- src/: 66 directories, 341 files
- tests/: 9 directories, 57 files
- tools/: 4 directories, 13 files
- .gitignore: file
- .prettierignore: file
- .prettierrc.json: file
- bun.lock: file
- capacitor.config.json: file
- CONTRIBUTING.md: file
- electron-builder.mac.json: file
- electron-builder.shared.json: file
- electron-builder.win.json: file
- eslint.config.ts: file
- index.html: file
- LICENSE: file
- package.json: file
- playwright.config.ts: file
- README.md: file
- tsconfig.app.json: file
- tsconfig.base.json: file
- tsconfig.electron.json: file
- tsconfig.extension.json: file
- tsconfig.json: file
- tsconfig.tools.json: file
- vercel.json: file
- vite.config.android.ts: file
- vite.config.desktop.ts: file
- vite.config.extension.ts: file
- vite.config.ts: file
- vite.config.xr.ts: file

## Full Tree

```text
vassist/
├── .husky/
│   └── pre-commit
├── android/
│   ├── app/
│   │   ├── src/
│   │   │   ├── androidTest/
│   │   │   │   └── java/
│   │   │   │       └── com/
│   │   │   │           └── getcapacitor/
│   │   │   │               └── myapp/
│   │   │   │                   └── ExampleInstrumentedTest.java
│   │   │   ├── main/
│   │   │   │   ├── java/
│   │   │   │   │   └── com/
│   │   │   │   │       └── vassist/
│   │   │   │   │           └── app/
│   │   │   │   │               └── ai/
│   │   │   │   │                   └── TtsStepCallback.java
│   │   │   │   ├── kotlin/
│   │   │   │   │   └── com/
│   │   │   │   │       └── vassist/
│   │   │   │   │           └── app/
│   │   │   │   │               ├── ai/
│   │   │   │   │               │   ├── AudioConverter.kt
│   │   │   │   │               │   ├── ComputeBackendManager.kt
│   │   │   │   │               │   ├── LiteRtLmService.kt
│   │   │   │   │               │   ├── LlamaService.kt
│   │   │   │   │               │   ├── LLMModelManager.kt
│   │   │   │   │               │   ├── LocalAIBridge.kt
│   │   │   │   │               │   ├── LocalAIServer.kt
│   │   │   │   │               │   ├── STTTTSModelManager.kt
│   │   │   │   │               │   ├── TtsModelManager.kt
│   │   │   │   │               │   ├── VitsService.kt
│   │   │   │   │               │   └── WhisperService.kt
│   │   │   │   │               ├── ar/
│   │   │   │   │               │   ├── ARCoreSessionManager.kt
│   │   │   │   │               │   ├── CameraBackgroundRenderer.kt
│   │   │   │   │               │   └── NativeARBridge.kt
│   │   │   │   │               ├── service/
│   │   │   │   │               │   └── VAssistWallpaperService.kt
│   │   │   │   │               ├── webview/
│   │   │   │   │               │   ├── BackgroundMotionBridge.kt
│   │   │   │   │               │   └── RendererWebView.kt
│   │   │   │   │               ├── AITestActivity.kt
│   │   │   │   │               ├── FullAppActivity.kt
│   │   │   │   │               └── MainActivity.kt
│   │   │   │   ├── res/
│   │   │   │   │   ├── drawable/
│   │   │   │   │   │   ├── ic_launcher_background.xml
│   │   │   │   │   │   └── splash.png
│   │   │   │   │   ├── drawable-land-hdpi/
│   │   │   │   │   │   └── splash.png
│   │   │   │   │   ├── drawable-land-mdpi/
│   │   │   │   │   │   └── splash.png
│   │   │   │   │   ├── drawable-land-xhdpi/
│   │   │   │   │   │   └── splash.png
│   │   │   │   │   ├── drawable-land-xxhdpi/
│   │   │   │   │   │   └── splash.png
│   │   │   │   │   ├── drawable-land-xxxhdpi/
│   │   │   │   │   │   └── splash.png
│   │   │   │   │   ├── drawable-port-hdpi/
│   │   │   │   │   │   └── splash.png
│   │   │   │   │   ├── drawable-port-mdpi/
│   │   │   │   │   │   └── splash.png
│   │   │   │   │   ├── drawable-port-xhdpi/
│   │   │   │   │   │   └── splash.png
│   │   │   │   │   ├── drawable-port-xxhdpi/
│   │   │   │   │   │   └── splash.png
│   │   │   │   │   ├── drawable-port-xxxhdpi/
│   │   │   │   │   │   └── splash.png
│   │   │   │   │   ├── drawable-v24/
│   │   │   │   │   │   └── ic_launcher_foreground.xml
│   │   │   │   │   ├── mipmap-anydpi-v26/
│   │   │   │   │   │   ├── ic_launcher_round.xml
│   │   │   │   │   │   └── ic_launcher.xml
│   │   │   │   │   ├── mipmap-hdpi/
│   │   │   │   │   │   ├── ic_launcher_foreground.png
│   │   │   │   │   │   ├── ic_launcher_round.webp
│   │   │   │   │   │   └── ic_launcher.webp
│   │   │   │   │   ├── mipmap-mdpi/
│   │   │   │   │   │   ├── ic_launcher_foreground.png
│   │   │   │   │   │   ├── ic_launcher_round.webp
│   │   │   │   │   │   └── ic_launcher.webp
│   │   │   │   │   ├── mipmap-xhdpi/
│   │   │   │   │   │   ├── ic_launcher_foreground.png
│   │   │   │   │   │   ├── ic_launcher_round.webp
│   │   │   │   │   │   └── ic_launcher.webp
│   │   │   │   │   ├── mipmap-xxhdpi/
│   │   │   │   │   │   ├── ic_launcher_foreground.png
│   │   │   │   │   │   ├── ic_launcher_round.webp
│   │   │   │   │   │   └── ic_launcher.webp
│   │   │   │   │   ├── mipmap-xxxhdpi/
│   │   │   │   │   │   ├── ic_launcher_foreground.png
│   │   │   │   │   │   ├── ic_launcher_round.webp
│   │   │   │   │   │   └── ic_launcher.webp
│   │   │   │   │   ├── values/
│   │   │   │   │   │   ├── ic_launcher_background.xml
│   │   │   │   │   │   ├── strings.xml
│   │   │   │   │   │   └── styles.xml
│   │   │   │   │   └── xml/
│   │   │   │   │       ├── file_paths.xml
│   │   │   │   │       ├── network_security_config.xml
│   │   │   │   │       └── wallpaper.xml
│   │   │   │   ├── AndroidManifest.xml
│   │   │   │   └── ic_launcher-playstore.png
│   │   │   └── test/
│   │   │       └── java/
│   │   │           └── com/
│   │   │               └── getcapacitor/
│   │   │                   └── myapp/
│   │   │                       └── ExampleUnitTest.java
│   │   ├── tools/
│   │   │   └── litert-patcher/
│   │   │       ├── asm-tree.jar
│   │   │       ├── asm.jar
│   │   │       └── PatchLiteRt.java
│   │   ├── .gitignore
│   │   ├── build.gradle
│   │   ├── capacitor.build.gradle
│   │   └── proguard-rules.pro
│   ├── docker/
│   │   ├── Dockerfile
│   │   └── Dockerfile.llama
│   ├── gradle/
│   │   └── wrapper/
│   │       ├── gradle-wrapper.jar
│   │       └── gradle-wrapper.properties
│   ├── llama/
│   │   ├── snapdragon/
│   │   │   └── apply-vassist-patches.py
│   │   ├── src/
│   │   │   └── main/
│   │   │       ├── cpp/
│   │   │       │   ├── CMakeLists.txt
│   │   │       │   └── llama-android.cpp
│   │   │       ├── java/
│   │   │       │   └── android/
│   │   │       │       └── llama/
│   │   │       │           └── cpp/
│   │   │       │               └── LlamaAndroid.kt
│   │   │       ├── jniLibs/
│   │   │       │   └── arm64-v8a/
│   │   │       │       └── PREBUILT_SNAPDRAGON.txt
│   │   │       └── AndroidManifest.xml
│   │   ├── .gitignore
│   │   ├── build.gradle
│   │   ├── consumer-rules.pro
│   │   └── proguard-rules.pro
│   ├── .gitignore
│   ├── build-sherpa-android.sh
│   ├── build.gradle
│   ├── capacitor.settings.gradle
│   ├── docker-build-llama.sh
│   ├── docker-build-sherpa.sh
│   ├── gradle.properties
│   ├── gradlew
│   ├── gradlew.bat
│   ├── settings.gradle
│   └── variables.gradle
├── android-src/
│   ├── AndroidContent.tsx
│   ├── index.html
│   └── main.tsx
├── documentation/
│   ├── scripts/
│   │   └── generate-repository-tree.ts
│   ├── site/
│   │   ├── .vitepress/
│   │   │   ├── theme/
│   │   │   │   ├── components/
│   │   │   │   │   ├── AppIcon.vue
│   │   │   │   │   └── VAssistDocsDemo.vue
│   │   │   │   ├── custom.css
│   │   │   │   ├── custom.d.ts
│   │   │   │   └── index.ts
│   │   │   └── config.ts
│   │   ├── architecture/
│   │   │   ├── ai-and-media-stack.md
│   │   │   ├── configuration-reference.md
│   │   │   ├── embed.md
│   │   │   ├── overview.md
│   │   │   ├── packages-and-integration.md
│   │   │   ├── react.md
│   │   │   ├── repository-map.md
│   │   │   ├── repository-tree.md
│   │   │   └── storage-and-data.md
│   │   ├── getting-started/
│   │   │   ├── installation.md
│   │   │   └── setup-wizard.md
│   │   ├── guide/
│   │   │   ├── ai-toolbar.md
│   │   │   ├── avatar-motions-and-emotes.md
│   │   │   ├── camera-and-screen-share.md
│   │   │   ├── chat-and-voice.md
│   │   │   ├── chat-history-and-branches.md
│   │   │   ├── index.md
│   │   │   ├── page-context.md
│   │   │   └── virtual-companion.md
│   │   ├── legal/
│   │   │   ├── stages.md
│   │   │   └── wallpapers.md
│   │   ├── platforms/
│   │   │   ├── android.md
│   │   │   ├── desktop.md
│   │   │   └── extension.md
│   │   ├── public/
│   │   │   ├── assets/
│   │   │   │   ├── backgrounds/
│   │   │   │   │   ├── aurora-homes.webp
│   │   │   │   │   ├── city-night.webp
│   │   │   │   │   ├── fog-cabin.webp
│   │   │   │   │   ├── milky-way.webp
│   │   │   │   │   ├── night-fence.webp
│   │   │   │   │   └── soft-lights.webp
│   │   │   │   ├── stages/
│   │   │   │   │   ├── aster-observatory.webp
│   │   │   │   │   ├── dusk.webp
│   │   │   │   │   ├── ink.webp
│   │   │   │   │   ├── moss-house.webp
│   │   │   │   │   ├── paper.webp
│   │   │   │   │   ├── pebble.webp
│   │   │   │   │   ├── rainlight-library.webp
│   │   │   │   │   ├── slate.webp
│   │   │   │   │   └── stillwater.webp
│   │   │   │   ├── chat.png
│   │   │   │   ├── companion.png
│   │   │   │   ├── dictation.png
│   │   │   │   ├── language_detector.png
│   │   │   │   ├── overview.gif
│   │   │   │   ├── rewrite.png
│   │   │   │   ├── summarize.png
│   │   │   │   ├── toolbars.png
│   │   │   │   ├── translate.png
│   │   │   │   └── writer.png
│   │   │   └── VA.svg
│   │   ├── settings/
│   │   │   ├── ai-features.md
│   │   │   ├── index.md
│   │   │   ├── llm.md
│   │   │   ├── stt.md
│   │   │   ├── three-d.md
│   │   │   ├── tts.md
│   │   │   └── ui.md
│   │   ├── index.md
│   │   └── intro.md
│   └── README.md
├── electron/
│   ├── assets/
│   │   ├── backgrounds/
│   │   │   ├── previews/
│   │   │   │   ├── aurora-homes.jpg
│   │   │   │   ├── city-night.jpg
│   │   │   │   ├── fog-cabin.jpg
│   │   │   │   ├── milky-way.jpg
│   │   │   │   ├── night-fence.jpg
│   │   │   │   └── soft-lights.jpg
│   │   │   ├── aurora-homes.webp
│   │   │   ├── city-night.webp
│   │   │   ├── fog-cabin.webp
│   │   │   ├── milky-way.webp
│   │   │   ├── night-fence.webp
│   │   │   └── soft-lights.webp
│   │   ├── icon.iconset/
│   │   │   ├── icon_128x128.png
│   │   │   ├── icon_128x128@2x.png
│   │   │   ├── icon_16x16.png
│   │   │   ├── icon_16x16@2x.png
│   │   │   ├── icon_256x256.png
│   │   │   ├── icon_256x256@2x.png
│   │   │   ├── icon_32x32.png
│   │   │   ├── icon_32x32@2x.png
│   │   │   ├── icon_512x512.png
│   │   │   └── icon_512x512@2x.png
│   │   ├── icon-128.png
│   │   ├── icon-256.png
│   │   ├── icon-32.png
│   │   ├── icon-512.png
│   │   ├── icon.icns
│   │   ├── trayTemplate.png
│   │   ├── trayTemplate.svg
│   │   └── trayTemplate@2x.png
│   ├── main/
│   │   ├── ipc/
│   │   │   ├── llmHandlers.ts
│   │   │   └── uiHandlers.ts
│   │   ├── runtime/
│   │   │   └── runtimePaths.ts
│   │   ├── services/
│   │   │   ├── llamaServerManager.ts
│   │   │   ├── llmBackendManager.ts
│   │   │   ├── localServerManager.ts
│   │   │   ├── pythonServerManager.ts
│   │   │   └── whisperCppManager.ts
│   │   ├── system/
│   │   │   ├── devTools.ts
│   │   │   └── permissionsProtocol.ts
│   │   ├── windows/
│   │   │   ├── desktopMode.ts
│   │   │   ├── liveWallpaperManager.ts
│   │   │   ├── trayShortcutsManager.ts
│   │   │   └── windowManager.ts
│   │   └── xr/
│   │       ├── browserLauncher.ts
│   │       ├── registerXrHandlers.ts
│   │       └── XrSessionHost.ts
│   ├── native/
│   │   └── desktop-host/
│   │       ├── binding.gyp
│   │       ├── build.mjs
│   │       ├── desktop_host.cc
│   │       └── README.md
│   ├── server/
│   │   ├── gpt-sovits/
│   │   │   ├── utils/
│   │   │   │   ├── __init__.py
│   │   │   │   └── reference_cache.py
│   │   │   ├── api.py
│   │   │   ├── bootstrap.ts
│   │   │   ├── requirements.txt
│   │   │   ├── setup-runner.ts
│   │   │   └── setup.py
│   │   ├── src/
│   │   │   ├── http.cpp
│   │   │   ├── llm.cpp
│   │   │   ├── server.cpp
│   │   │   ├── stt.cpp
│   │   │   └── tts.cpp
│   │   ├── supertonic/
│   │   │   ├── setup-runner.ts
│   │   │   └── setup.py
│   │   ├── whisper-stt/
│   │   │   ├── requirements.txt
│   │   │   ├── server.py
│   │   │   ├── setup-runner.ts
│   │   │   └── setup.py
│   │   └── http-server.ts
│   ├── app.ts
│   ├── index.css
│   ├── index.html
│   ├── main.tsx
│   └── preload.ts
├── embed/
│   └── main.tsx
├── extension/
│   ├── background/
│   │   ├── BackgroundBridge.ts
│   │   ├── index.ts
│   │   ├── OffscreenManager.ts
│   │   └── TabManager.ts
│   ├── content/
│   │   ├── ContentBridge.ts
│   │   ├── index.ts
│   │   ├── main.tsx
│   │   └── styles.css
│   ├── icons/
│   │   ├── icon-128.png
│   │   ├── icon-16.png
│   │   ├── icon-256.png
│   │   ├── icon-32.png
│   │   ├── icon-48.png
│   │   └── icon-512.png
│   ├── offscreen/
│   │   ├── offscreen.html
│   │   └── offscreen.ts
│   ├── shared/
│   │   ├── MessageBridge.ts
│   │   └── MessageTypes.ts
│   └── manifest.json
├── licenses/
│   └── livekit-aura.txt
├── packages/
│   ├── embed/
│   │   ├── src/
│   │   │   ├── chat-toolbar.ts
│   │   │   ├── chat.ts
│   │   │   ├── full.ts
│   │   │   ├── index.ts
│   │   │   └── toolbar.ts
│   │   ├── package.json
│   │   ├── tsconfig.types.json
│   │   └── vite.config.ts
│   └── react/
│       ├── src/
│       │   ├── chat-toolbar.tsx
│       │   ├── chat.tsx
│       │   ├── full.tsx
│       │   ├── index.tsx
│       │   └── toolbar.tsx
│       ├── package.json
│       ├── tsconfig.types.json
│       └── vite.config.ts
├── public/
│   ├── res/
│   │   └── assets/
│   │       ├── backgrounds/
│   │       │   ├── aurora-homes.webp
│   │       │   ├── city-night.webp
│   │       │   ├── fog-cabin.webp
│   │       │   ├── milky-way.webp
│   │       │   ├── night-fence.webp
│   │       │   └── soft-lights.webp
│   │       ├── model/
│   │       │   └── vassist_default.bpmx
│   │       ├── motion/
│   │       │   ├── blink3.bvmd
│   │       │   ├── clap1.bvmd
│   │       │   ├── generic-mouth.bvmd
│   │       │   ├── hi1.bvmd
│   │       │   ├── hi2.bvmd
│   │       │   ├── idle1.bvmd
│   │       │   ├── idle2.bvmd
│   │       │   ├── idle4-short.bvmd
│   │       │   ├── intro1.bvmd
│   │       │   ├── intro2.bvmd
│   │       │   ├── talk1-excited.bvmd
│   │       │   ├── talk2-nervous.bvmd
│   │       │   ├── talk3-calm.bvmd
│   │       │   ├── talk4-angry.bvmd
│   │       │   ├── think1.bvmd
│   │       │   ├── think2.bvmd
│   │       │   ├── ywan1.bvmd
│   │       │   └── ywan2.bvmd
│   │       ├── stage-previews/
│   │       │   ├── aster-observatory.webp
│   │       │   ├── dusk.webp
│   │       │   ├── ink.webp
│   │       │   ├── moss-house.webp
│   │       │   ├── paper.webp
│   │       │   ├── pebble.webp
│   │       │   ├── rainlight-library.webp
│   │       │   ├── slate.webp
│   │       │   └── stillwater.webp
│   │       └── stages/
│   │           ├── aster-observatory/
│   │           │   ├── Textures/
│   │           │   │   └── colormap.png
│   │           │   ├── aster-planet.jpg
│   │           │   ├── chair-armrest-headrest.glb
│   │           │   ├── computer-system.glb
│   │           │   ├── computer-wide.glb
│   │           │   ├── wall-detail.glb
│   │           │   └── wall-switch.glb
│   │           ├── moss-house/
│   │           │   ├── textures/
│   │           │   │   ├── 16d63eca024e0becb87a.png
│   │           │   │   ├── 320fb6ff04fc2b16eba1.png
│   │           │   │   ├── 3a12f29c038bd3416cba.png
│   │           │   │   ├── 3fd2ec47dced90d588db.png
│   │           │   │   ├── 46bf2bf37972bc71cc7c.png
│   │           │   │   ├── 4b7542d5b737738cedd2.png
│   │           │   │   ├── 4e73a5398eff2ec82247.png
│   │           │   │   ├── 6c682c971bfc06c7d9a2.png
│   │           │   │   ├── a34d9166e77e2410ee31.png
│   │           │   │   └── a3c85a4e26fa0709d06e.png
│   │           │   ├── Bush_Common_Flowers.glb
│   │           │   ├── chairModernCushion.glb
│   │           │   ├── CommonTree_1.glb
│   │           │   ├── CommonTree_4.glb
│   │           │   ├── Fern_1.glb
│   │           │   ├── Flower_3_Group.glb
│   │           │   ├── Flower_4_Group.glb
│   │           │   ├── Grass_Common_Short.glb
│   │           │   ├── Grass_Wispy_Tall.glb
│   │           │   ├── Rock_Medium_1.glb
│   │           │   └── TwistedTree_3.glb
│   │           ├── rainlight-library/
│   │           │   ├── bookcaseOpen.glb
│   │           │   └── loungeChairRelax.glb
│   │           └── shared/
│   │               ├── books.glb
│   │               ├── pillow.glb
│   │               ├── pillowLong.glb
│   │               ├── plantSmall1.glb
│   │               ├── plantSmall2.glb
│   │               ├── studio-light.hdr
│   │               ├── wood-arm.jpg
│   │               ├── wood-Diffuse.jpg
│   │               └── wood-nor_gl.jpg
│   └── VA.svg
├── src/
│   ├── assets/
│   │   ├── demo/
│   │   │   ├── berries.jpg
│   │   │   ├── kitten.jpg
│   │   │   ├── people.jpg
│   │   │   └── text.jpg
│   │   ├── VA.png
│   │   └── VA.svg
│   ├── babylon/
│   │   ├── ar/
│   │   │   ├── ARAnchorManager.ts
│   │   │   ├── ARCameraController.ts
│   │   │   ├── ARGestureController.ts
│   │   │   ├── ARLightingController.ts
│   │   │   ├── ARModeLifecycle.ts
│   │   │   ├── ARProvider.ts
│   │   │   ├── ARReticle.ts
│   │   │   ├── ARSessionController.ts
│   │   │   ├── ARTypes.ts
│   │   │   └── NativeAndroidARProvider.ts
│   │   ├── camera/
│   │   │   ├── getAvatarScreenBounds.ts
│   │   │   └── MmdCameraAutoFocus.ts
│   │   ├── managers/
│   │   │   ├── AnimationManager.ts
│   │   │   ├── CanvasInteractionManager.ts
│   │   │   └── PositionManager.ts
│   │   ├── rendering/
│   │   │   └── StickerBorder.ts
│   │   ├── scenes/
│   │   │   └── MmdModelScene.ts
│   │   ├── stages/
│   │   │   ├── builtins/
│   │   │   │   ├── AsterObservatory.ts
│   │   │   │   ├── MossHouse.ts
│   │   │   │   ├── QuietStages.ts
│   │   │   │   └── RainlightLibrary.ts
│   │   │   ├── assetMap.json
│   │   │   ├── StageAssets.ts
│   │   │   ├── stageAvailability.ts
│   │   │   ├── StageGeometry.ts
│   │   │   ├── StageManager.ts
│   │   │   ├── StageParallax.ts
│   │   │   ├── StagePlacement.ts
│   │   │   ├── StageRegistry.ts
│   │   │   ├── StageSeasonalEffects.ts
│   │   │   ├── stageSurfaceState.ts
│   │   │   ├── StageTextures.ts
│   │   │   └── types.ts
│   │   ├── xr/
│   │   │   ├── HtmlPanelHover.ts
│   │   │   ├── HtmlPanelInput.ts
│   │   │   ├── SpatialPanel.ts
│   │   │   ├── XrCapabilities.ts
│   │   │   ├── XrSceneEditor.ts
│   │   │   └── XrSessionController.ts
│   │   └── types.ts
│   ├── components/
│   │   ├── android/
│   │   │   └── AndroidBackground.tsx
│   │   ├── ar/
│   │   │   └── ARPlacementGuide.tsx
│   │   ├── assistant/
│   │   │   ├── BabylonScene.tsx
│   │   │   ├── LiveAssistantShell.tsx
│   │   │   └── VirtualAssistant.tsx
│   │   ├── background/
│   │   │   ├── BackgroundEffectsControl.tsx
│   │   │   ├── BackgroundFillControls.tsx
│   │   │   ├── BackgroundSelectionControls.tsx
│   │   │   └── BuiltInBackgroundGallery.tsx
│   │   ├── chat/
│   │   │   ├── assistant-controls/
│   │   │   │   ├── components/
│   │   │   │   │   ├── AssistantControlPanels.tsx
│   │   │   │   │   ├── AssistantControlStack.tsx
│   │   │   │   │   └── StageControlPanel.tsx
│   │   │   │   ├── hooks/
│   │   │   │   │   ├── useAssistantControlDrag.ts
│   │   │   │   │   ├── useAssistantControlTheme.ts
│   │   │   │   │   └── useDockPanelTransition.ts
│   │   │   │   ├── panelStyles.ts
│   │   │   │   ├── positioning.ts
│   │   │   │   └── types.ts
│   │   │   ├── voice/
│   │   │   │   └── AuraRenderer.ts
│   │   │   ├── AssistantControlDock.tsx
│   │   │   ├── ChatBubble.tsx
│   │   │   ├── ChatContainer.tsx
│   │   │   ├── ChatController.tsx
│   │   │   ├── ChatHistoryActions.tsx
│   │   │   ├── ChatHistoryPanel.tsx
│   │   │   ├── ChatHistorySidebar.tsx
│   │   │   ├── ChatInput.tsx
│   │   │   ├── ChatMessage.tsx
│   │   │   ├── ComposerMenu.tsx
│   │   │   ├── ComposerPrimaryAction.tsx
│   │   │   ├── EmotePlaybackBar.tsx
│   │   │   ├── floatingChatSize.ts
│   │   │   ├── historyLayout.ts
│   │   │   ├── ThinkingPanel.tsx
│   │   │   └── VoiceWaveform.tsx
│   │   ├── common/
│   │   │   ├── AIFeaturesConfig.tsx
│   │   │   ├── Dialog.tsx
│   │   │   ├── FlagCopyButton.tsx
│   │   │   ├── LoadingIndicator.tsx
│   │   │   ├── MarkdownText.tsx
│   │   │   ├── ShortcutsConfig.tsx
│   │   │   ├── StatusMessage.tsx
│   │   │   ├── StreamdownMarkdown.tsx
│   │   │   ├── StreamingContainer.tsx
│   │   │   ├── StreamingText.tsx
│   │   │   ├── Toggle.tsx
│   │   │   └── ZoomControl.tsx
│   │   ├── debug/
│   │   │   ├── ControlPanel.tsx
│   │   │   └── DebugOverlay.tsx
│   │   ├── DemoSite/
│   │   │   └── DocumentInteractionDemo.tsx
│   │   ├── desktop/
│   │   │   ├── AppModeSplitter.tsx
│   │   │   ├── DesktopBackground.tsx
│   │   │   ├── DesktopModeController.tsx
│   │   │   ├── DesktopModeHost.tsx
│   │   │   ├── DesktopModeSurface.tsx
│   │   │   ├── DesktopRendererStateBridge.tsx
│   │   │   ├── DesktopScreenShareDialog.tsx
│   │   │   ├── DesktopWindowControls.tsx
│   │   │   ├── DesktopWindowInteractivityBridge.tsx
│   │   │   ├── DetachedChatResizeHandle.tsx
│   │   │   ├── InputWindowManager.tsx
│   │   │   └── VideoPreview.tsx
│   │   ├── icons/
│   │   │   ├── Icon.tsx
│   │   │   ├── iconColors.ts
│   │   │   ├── iconMap.tsx
│   │   │   └── index.ts
│   │   ├── media/
│   │   │   └── AudioPlayer.tsx
│   │   ├── settings/
│   │   │   ├── llm/
│   │   │   │   ├── ComputeUnitCard.tsx
│   │   │   │   ├── DecisionSettings.tsx
│   │   │   │   ├── DesktopLLMConfig.tsx
│   │   │   │   ├── LlamaServerRuntimeManager.tsx
│   │   │   │   ├── LLMParameterSettings.tsx
│   │   │   │   ├── LocalLLMModelManager.tsx
│   │   │   │   └── STTTTSModelManager.tsx
│   │   │   ├── shared/
│   │   │   │   ├── ModelDownloader.tsx
│   │   │   │   └── RemoteModelPicker.tsx
│   │   │   ├── stt/
│   │   │   │   ├── AndroidLocalSTTConfig.tsx
│   │   │   │   ├── ChromeAISTTConfig.tsx
│   │   │   │   ├── DesktopSTTConfig.tsx
│   │   │   │   ├── OpenAICompatibleSTTConfig.tsx
│   │   │   │   ├── OpenAISTTConfig.tsx
│   │   │   │   └── WhisperModelDownloader.tsx
│   │   │   ├── tts/
│   │   │   │   ├── AndroidLocalTTSConfig.tsx
│   │   │   │   ├── AndroidTtsPackDownloader.tsx
│   │   │   │   ├── GPTSoVITSConfig.tsx
│   │   │   │   ├── GPTSoVITSSetup.tsx
│   │   │   │   ├── KokoroTTSConfig.tsx
│   │   │   │   ├── SupertonicEngineSection.tsx
│   │   │   │   └── VitsModelDownloader.tsx
│   │   │   ├── AIFeaturesSettings.tsx
│   │   │   ├── BackgroundSettings.tsx
│   │   │   ├── DesktopBackgroundSettings.tsx
│   │   │   ├── DesktopModeSettings.tsx
│   │   │   ├── LLMSettings.tsx
│   │   │   ├── SettingsSubTabContent.tsx
│   │   │   ├── StageSettings.tsx
│   │   │   ├── STTSettings.tsx
│   │   │   ├── ThreeDSettings.tsx
│   │   │   ├── TTSSettings.tsx
│   │   │   ├── UISettings.tsx
│   │   │   ├── UISettingsTabs.tsx
│   │   │   └── XrSettings.tsx
│   │   ├── setup/
│   │   │   ├── shared/
│   │   │   │   └── ProviderSelection.tsx
│   │   │   ├── steps/
│   │   │   │   ├── AIFeaturesOverviewStep.tsx
│   │   │   │   ├── BackgroundSelectionStep.tsx
│   │   │   │   ├── CharacterIntroStep.tsx
│   │   │   │   ├── ChromeAISetupStep.tsx
│   │   │   │   ├── LLMProviderStep.tsx
│   │   │   │   ├── STTProviderStep.tsx
│   │   │   │   ├── TTSProviderStep.tsx
│   │   │   │   ├── TutorialStep.tsx
│   │   │   │   └── WelcomeStep.tsx
│   │   │   └── SetupWizard.tsx
│   │   ├── toolbar/
│   │   │   ├── AIToolbar.tsx
│   │   │   ├── ToolbarButton.tsx
│   │   │   ├── ToolbarResultPanel.tsx
│   │   │   └── ToolbarSection.tsx
│   │   ├── ui/
│   │   │   ├── Badge.tsx
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── index.ts
│   │   │   ├── Input.tsx
│   │   │   ├── Select.tsx
│   │   │   ├── SettingsRow.tsx
│   │   │   ├── TabBar.tsx
│   │   │   └── Tooltip.tsx
│   │   ├── xr/
│   │   │   ├── SpatialHtmlPanel.tsx
│   │   │   ├── SpatialHtmlPanelContext.ts
│   │   │   ├── XrControlPanel.tsx
│   │   │   ├── XrKeyboard.tsx
│   │   │   ├── XrRuntimeProvider.tsx
│   │   │   ├── XrSceneEditControls.tsx
│   │   │   └── XrSurface.tsx
│   │   ├── AppContent.tsx
│   │   ├── DemoSite.tsx
│   │   ├── ModelLoadingOverlay.tsx
│   │   ├── QuickAccessPanel.tsx
│   │   └── SettingsPanel.tsx
│   ├── config/
│   │   ├── aiConfig.ts
│   │   ├── androidTtsModels.ts
│   │   ├── androidWhisperModels.ts
│   │   ├── animationConfig.ts
│   │   ├── backgroundCatalog.ts
│   │   ├── llmParameters.ts
│   │   ├── promptConfig.ts
│   │   ├── sceneConfig.ts
│   │   ├── serviceEndpoints.ts
│   │   ├── stageConfig.ts
│   │   └── uiConfig.ts
│   ├── contexts/
│   │   ├── AnimationContext.tsx
│   │   ├── AppRuntimeContext.tsx
│   │   ├── SetupContext.tsx
│   │   └── XrRuntimeContext.ts
│   ├── embed/
│   │   ├── branding.ts
│   │   ├── config.ts
│   │   ├── EmbedHostContext.tsx
│   │   ├── hostCommands.ts
│   │   ├── portalContainers.ts
│   │   ├── reactHostCustomizations.tsx
│   │   ├── runtimeStore.ts
│   │   ├── settingsPolicy.ts
│   │   └── theme.ts
│   ├── hooks/
│   │   ├── app/
│   │   │   ├── useAssistant.ts
│   │   │   ├── useChat.ts
│   │   │   ├── useDrag.ts
│   │   │   ├── usePlayback.ts
│   │   │   ├── useScene.ts
│   │   │   ├── useStageSurface.ts
│   │   │   └── useTooling.ts
│   │   ├── bootstrap/
│   │   │   ├── useInitializeAppStore.ts
│   │   │   └── useInitializeConfigStore.ts
│   │   ├── config/
│   │   │   ├── useConfigAI.ts
│   │   │   ├── useConfigStatus.ts
│   │   │   ├── useConfigSTT.ts
│   │   │   ├── useConfigTTS.ts
│   │   │   └── useConfigUI.ts
│   │   ├── useAndroidStore.ts
│   │   ├── useDesktopStore.ts
│   │   ├── useDesktopWindowResize.ts
│   │   ├── useVisibilityUnmount.ts
│   │   └── useWideDesktopHistory.ts
│   ├── services/
│   │   ├── ai/
│   │   │   ├── AIService.ts
│   │   │   ├── ChromeAIValidator.ts
│   │   │   ├── DecisionClient.ts
│   │   │   ├── LanguageDetectorService.ts
│   │   │   ├── LocalLlmClientFactory.ts
│   │   │   ├── OllamaClient.ts
│   │   │   ├── RewriterService.ts
│   │   │   ├── SummarizerService.ts
│   │   │   ├── TranslatorService.ts
│   │   │   └── WriterService.ts
│   │   ├── audio/
│   │   │   ├── AudioVisualizationService.ts
│   │   │   ├── LiveLipSyncService.ts
│   │   │   ├── MicrophoneService.ts
│   │   │   ├── STTService.ts
│   │   │   ├── SttTtsEventService.ts
│   │   │   ├── TTSService.ts
│   │   │   ├── VADService.ts
│   │   │   ├── VoiceConversationService.ts
│   │   │   ├── VoiceRecordingService.ts
│   │   │   └── VoiceStorageService.ts
│   │   ├── chat/
│   │   │   ├── ChatHistoryService.ts
│   │   │   ├── ChatResponseService.ts
│   │   │   ├── ChatService.ts
│   │   │   ├── ChatSessionRuntime.ts
│   │   │   ├── ChatSpeechService.ts
│   │   │   └── DocumentInteractionService.ts
│   │   ├── common/
│   │   │   ├── Logger.ts
│   │   │   ├── LoggerService.ts
│   │   │   └── UtilService.ts
│   │   ├── media/
│   │   │   ├── CameraService.ts
│   │   │   ├── DragDropService.ts
│   │   │   ├── FrameCaptureService.ts
│   │   │   ├── MediaExtractionService.ts
│   │   │   └── ScreenShareService.ts
│   │   ├── mmd/
│   │   │   ├── EmotePlayerService.ts
│   │   │   ├── PMXConverterService.ts
│   │   │   ├── VMDConverterService.ts
│   │   │   └── VMDHandler.ts
│   │   ├── proxies/
│   │   │   ├── AIServiceProxy.ts
│   │   │   ├── index.ts
│   │   │   ├── LanguageDetectorServiceProxy.ts
│   │   │   ├── RewriterServiceProxy.ts
│   │   │   ├── ServiceProxy.ts
│   │   │   ├── StorageServiceProxy.ts
│   │   │   ├── STTServiceProxy.ts
│   │   │   ├── SummarizerServiceProxy.ts
│   │   │   ├── TranslatorServiceProxy.ts
│   │   │   ├── TTSServiceProxy.ts
│   │   │   └── WriterServiceProxy.ts
│   │   ├── storage/
│   │   │   ├── AppDataBackupService.ts
│   │   │   ├── BackgroundStorageService.ts
│   │   │   ├── EmoteStorageService.ts
│   │   │   ├── LLMModelStorageService.ts
│   │   │   ├── ModelStorageService.ts
│   │   │   ├── MotionStorageService.ts
│   │   │   ├── StageImportService.ts
│   │   │   └── StageStorageService.ts
│   │   └── xr/
│   │       ├── DesktopSessionBridge.ts
│   │       ├── DesktopXrRepository.ts
│   │       ├── wireCodec.ts
│   │       ├── XrClientRuntime.ts
│   │       └── XrConnection.ts
│   ├── storage/
│   │   ├── adapters/
│   │   │   ├── DexieStorageAdapter.ts
│   │   │   ├── MemoryStorageAdapter.ts
│   │   │   ├── RemoteStorageAdapter.ts
│   │   │   └── types.ts
│   │   ├── DatabaseSchema.ts
│   │   ├── index.ts
│   │   ├── StorageAdapter.ts
│   │   ├── StorageAdapterRegistry.ts
│   │   └── StorageManager.ts
│   ├── stores/
│   │   ├── createAnimationStore.ts
│   │   ├── createAppStore.ts
│   │   ├── createSetupStore.ts
│   │   ├── storeUtils.ts
│   │   ├── useAndroidStore.ts
│   │   ├── useAppStore.ts
│   │   ├── useConfigStore.ts
│   │   └── useDesktopStore.ts
│   ├── styles/
│   │   ├── markdown.css
│   │   ├── streaming-animations.css
│   │   └── ui-effects.css
│   ├── testing/
│   │   ├── runtime.ts
│   │   └── testBridge.ts
│   ├── types/
│   │   ├── android.d.ts
│   │   ├── android.ts
│   │   ├── assistant.ts
│   │   ├── electron.d.ts
│   │   ├── env.d.ts
│   │   ├── gpt-sovits-bootstrap.d.ts
│   │   ├── headaudio.d.ts
│   │   └── xr.ts
│   ├── utils/
│   │   ├── resource-loader/
│   │   │   └── types.ts
│   │   ├── BackgroundDetector.ts
│   │   ├── cn.ts
│   │   ├── debounce.ts
│   │   ├── ExtensionBridge.ts
│   │   ├── PlatformUtils.ts
│   │   ├── resolvePortalContainer.ts
│   │   ├── ResourceLoader.ts
│   │   ├── thinking.ts
│   │   ├── VAssistDomIds.ts
│   │   └── ZipExtractor.ts
│   ├── workers/
│   │   ├── shared/
│   │   │   ├── AudioProcessingCore.ts
│   │   │   ├── BVMDConversionCore.ts
│   │   │   ├── KokoroTTSCore.ts
│   │   │   ├── VMDFile.ts
│   │   │   └── VMDGenerationCore.ts
│   │   ├── AudioWorkerClient.ts
│   │   └── shared-audio-worker.ts
│   ├── App.tsx
│   ├── env.d.ts
│   ├── index.css
│   └── main.tsx
├── tests/
│   ├── e2e/
│   │   ├── electron/
│   │   │   ├── chat.history.spec.ts
│   │   │   ├── chat.interactions.spec.ts
│   │   │   ├── chat.voice-mode.spec.ts
│   │   │   ├── harness.smoke.spec.ts
│   │   │   ├── settings.3d.spec.ts
│   │   │   ├── settings.ai-features.spec.ts
│   │   │   ├── settings.coverage.spec.ts
│   │   │   ├── settings.llm.spec.ts
│   │   │   ├── settings.stt.spec.ts
│   │   │   ├── settings.tts.spec.ts
│   │   │   ├── settings.ui.spec.ts
│   │   │   ├── setup.wizard.spec.ts
│   │   │   ├── toolbar.interactions.spec.ts
│   │   │   └── window.controls.spec.ts
│   │   ├── extension/
│   │   │   ├── chat.history.spec.ts
│   │   │   ├── chat.interactions.spec.ts
│   │   │   ├── chat.voice-mode.spec.ts
│   │   │   ├── harness.smoke.spec.ts
│   │   │   ├── page-context.spec.ts
│   │   │   ├── runtime.resilience.spec.ts
│   │   │   ├── settings.3d.spec.ts
│   │   │   ├── settings.ai-features.spec.ts
│   │   │   ├── settings.coverage.spec.ts
│   │   │   ├── settings.llm.spec.ts
│   │   │   ├── settings.stt.spec.ts
│   │   │   ├── settings.tts.spec.ts
│   │   │   ├── settings.ui.spec.ts
│   │   │   ├── setup.wizard.spec.ts
│   │   │   └── toolbar.interactions.spec.ts
│   │   ├── shared/
│   │   │   ├── chat.suites.ts
│   │   │   ├── settings.suites.ts
│   │   │   ├── setup.suites.ts
│   │   │   └── toolbar.suites.ts
│   │   └── web/
│   │       ├── chat.history.spec.ts
│   │       ├── chat.interactions.spec.ts
│   │       ├── chat.voice-mode.spec.ts
│   │       ├── settings.3d.spec.ts
│   │       ├── settings.ai-features.spec.ts
│   │       ├── settings.coverage.spec.ts
│   │       ├── settings.llm.spec.ts
│   │       ├── settings.stt.spec.ts
│   │       ├── settings.tts.spec.ts
│   │       ├── settings.ui.spec.ts
│   │       ├── setup.wizard.spec.ts
│   │       └── toolbar.interactions.spec.ts
│   ├── fixtures/
│   │   ├── electron.ts
│   │   ├── extension.ts
│   │   ├── shared.ts
│   │   └── web.ts
│   ├── helpers/
│   │   ├── extensionTestApi.ts
│   │   ├── interactions.ts
│   │   ├── selectors.ts
│   │   ├── setup.ts
│   │   └── testApi.ts
│   ├── hosts/
│   │   └── extension-host.html
│   ├── extensionTestHost.ts
│   └── llm-parameters-check.ts
├── tools/
│   ├── stage-previews/
│   │   └── browser.ts
│   ├── vite/
│   │   └── shared-config.ts
│   ├── vite-plugins/
│   │   ├── android-models-plugin.ts
│   │   ├── background-assets-scope-plugin.ts
│   │   ├── extension-plugins.ts
│   │   ├── extension-test-host-plugin.ts
│   │   ├── package-runtime-assets-plugin.ts
│   │   ├── stage-assets-scope-plugin.ts
│   │   └── vad-assets-plugin.ts
│   ├── create-node-llama-runtime-core.ts
│   ├── render-stage-previews.ts
│   ├── sync-doc-preview-assets.ts
│   └── write-package-type-entries.ts
├── .gitignore
├── .prettierignore
├── .prettierrc.json
├── bun.lock
├── capacitor.config.json
├── CONTRIBUTING.md
├── electron-builder.mac.json
├── electron-builder.shared.json
├── electron-builder.win.json
├── eslint.config.ts
├── index.html
├── LICENSE
├── package.json
├── playwright.config.ts
├── README.md
├── tsconfig.app.json
├── tsconfig.base.json
├── tsconfig.electron.json
├── tsconfig.extension.json
├── tsconfig.json
├── tsconfig.tools.json
├── vercel.json
├── vite.config.android.ts
├── vite.config.desktop.ts
├── vite.config.extension.ts
├── vite.config.ts
└── vite.config.xr.ts
```
