# Repository Tree

VAssist repository tree and file metrics.

## Totals

- Directories: 155
- Files: 545
- Text files counted for metrics: 461
- Total text lines: 142151
- Code files counted for metrics: 365
- Total code lines: 127433

## Line Counts by File Type

| File Type    | Extensions              | Files | Lines |
| ------------ | ----------------------- | ----: | ----: |
| Batch Script | .bat                    |     1 |    94 |
| C and C++    | .c, .cc, .cpp, .h, .hpp |     6 |  1285 |
| CSS          | .css, .scss, .less      |     7 |  2029 |
| HTML         | .html                   |     5 |   191 |
| Java         | .java                   |     2 |    44 |
| Kotlin       | .kt                     |    13 |  6485 |
| Shell Script | (no extension)          |     2 |   260 |
| TSX          | .tsx                    |    98 | 47804 |
| TypeScript   | .ts, .mts, .cts         |   231 | 69241 |
| Gradle       | .gradle                 |     7 |   242 |
| JSON         | .json                   |    17 |   568 |
| Markdown     | .md                     |    34 |  5937 |
| Other Text   | mixed                   |    10 |  3193 |
| Plain Text   | (no extension)          |    10 |  4012 |
| Properties   | .properties             |     2 |    29 |
| SVG          | .svg                    |     4 |   342 |
| XML          | .xml                    |    12 |   395 |

## Top-Level Summary

- .husky/: 1 directories, 1 files
- android/: 52 directories, 74 files
- android-src/: 1 directories, 3 files
- documentation/: 13 directories, 49 files
- electron/: 14 directories, 50 files
- embed/: 1 directories, 1 files
- extension/: 6 directories, 19 files
- packages/: 5 directories, 12 files
- public/: 5 directories, 19 files
- src/: 46 directories, 225 files
- tests/: 9 directories, 56 files
- tools/: 2 directories, 7 files
- .gitignore: file
- .prettierignore: file
- .prettierrc.json: file
- bun.lock: file
- capacitor.config.json: file
- CONTRIBUTING.md: file
- electron-builder.mac.json: file
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
- tsconfig.package.embed.types.json: file
- tsconfig.package.react.types.json: file
- tsconfig.tools.json: file
- vercel.json: file
- vite.config.android.ts: file
- vite.config.desktop.ts: file
- vite.config.extension.ts: file
- vite.config.package.embed.ts: file
- vite.config.package.react.ts: file
- vite.config.ts: file

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
│   │   │   │   ├── kotlin/
│   │   │   │   │   └── com/
│   │   │   │   │       └── vassist/
│   │   │   │   │           └── app/
│   │   │   │   │               ├── ai/
│   │   │   │   │               │   ├── LlamaService.kt
│   │   │   │   │               │   ├── LLMModelManager.kt
│   │   │   │   │               │   ├── LocalAIBridge.kt
│   │   │   │   │               │   ├── LocalAIServer.kt
│   │   │   │   │               │   ├── STTTTSModelManager.kt
│   │   │   │   │               │   ├── VitsService.kt
│   │   │   │   │               │   └── WhisperService.kt
│   │   │   │   │               ├── service/
│   │   │   │   │               │   └── VAssistWallpaperService.kt
│   │   │   │   │               ├── webview/
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
│   │   ├── .gitignore
│   │   ├── build.gradle
│   │   ├── capacitor.build.gradle
│   │   └── proguard-rules.pro
│   ├── gradle/
│   │   └── wrapper/
│   │       ├── gradle-wrapper.jar
│   │       └── gradle-wrapper.properties
│   ├── llama/
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
│   │   │       └── AndroidManifest.xml
│   │   ├── .gitignore
│   │   ├── build.gradle
│   │   ├── consumer-rules.pro
│   │   └── proguard-rules.pro
│   ├── .gitignore
│   ├── build.gradle
│   ├── capacitor.settings.gradle
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
│   │   ├── platforms/
│   │   │   ├── android.md
│   │   │   ├── desktop.md
│   │   │   └── extension.md
│   │   ├── public/
│   │   │   ├── assets/
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
│   │   │   ├── llmBackendManager.ts
│   │   │   ├── localServerManager.ts
│   │   │   └── pythonServerManager.ts
│   │   ├── system/
│   │   │   ├── devTools.ts
│   │   │   └── permissionsProtocol.ts
│   │   └── windows/
│   │       ├── trayShortcutsManager.ts
│   │       └── windowManager.ts
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
├── packages/
│   ├── embed/
│   │   ├── src/
│   │   │   ├── chat-toolbar.ts
│   │   │   ├── chat.ts
│   │   │   ├── full.ts
│   │   │   ├── index.ts
│   │   │   └── toolbar.ts
│   │   └── package.json
│   └── react/
│       ├── src/
│       │   ├── chat-toolbar.tsx
│       │   ├── chat.tsx
│       │   ├── full.tsx
│       │   ├── index.tsx
│       │   └── toolbar.tsx
│       └── package.json
├── public/
│   ├── res/
│   │   └── assets/
│   │       ├── model/
│   │       │   └── vassist_default.bpmx
│   │       └── motion/
│   │           ├── blink3.bvmd
│   │           ├── clap1.bvmd
│   │           ├── hi1.bvmd
│   │           ├── hi2.bvmd
│   │           ├── idle1.bvmd
│   │           ├── idle2.bvmd
│   │           ├── idle4-short.bvmd
│   │           ├── intro1.bvmd
│   │           ├── intro2.bvmd
│   │           ├── talk1-excited.bvmd
│   │           ├── talk2-nervous.bvmd
│   │           ├── talk3-calm.bvmd
│   │           ├── talk4-angry.bvmd
│   │           ├── think1.bvmd
│   │           ├── think2.bvmd
│   │           ├── ywan1.bvmd
│   │           └── ywan2.bvmd
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
│   │   ├── camera/
│   │   │   └── MmdCameraAutoFocus.ts
│   │   ├── managers/
│   │   │   ├── AnimationManager.ts
│   │   │   ├── CanvasInteractionManager.ts
│   │   │   └── PositionManager.ts
│   │   ├── scenes/
│   │   │   └── MmdModelScene.ts
│   │   └── types.ts
│   ├── components/
│   │   ├── android/
│   │   │   └── AndroidBackground.tsx
│   │   ├── assistant/
│   │   │   ├── BabylonScene.tsx
│   │   │   ├── LiveAssistantShell.tsx
│   │   │   └── VirtualAssistant.tsx
│   │   ├── chat/
│   │   │   ├── ChatBubble.tsx
│   │   │   ├── ChatButton.tsx
│   │   │   ├── ChatContainer.tsx
│   │   │   ├── ChatController.tsx
│   │   │   ├── ChatHistoryPanel.tsx
│   │   │   ├── ChatInput.tsx
│   │   │   ├── ChatMessage.tsx
│   │   │   └── EmotePlaybackBar.tsx
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
│   │   │   ├── DesktopScreenShareDialog.tsx
│   │   │   ├── DesktopWindowControls.tsx
│   │   │   ├── DesktopWindowInteractivityBridge.tsx
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
│   │   │   │   ├── DesktopLLMConfig.tsx
│   │   │   │   ├── LocalLLMModelManager.tsx
│   │   │   │   └── STTTTSModelManager.tsx
│   │   │   ├── shared/
│   │   │   │   ├── ModelDownloader.tsx
│   │   │   │   └── RemoteModelPicker.tsx
│   │   │   ├── stt/
│   │   │   │   ├── ChromeAISTTConfig.tsx
│   │   │   │   ├── DesktopSTTConfig.tsx
│   │   │   │   ├── OpenAICompatibleSTTConfig.tsx
│   │   │   │   ├── OpenAISTTConfig.tsx
│   │   │   │   └── WhisperModelDownloader.tsx
│   │   │   ├── tts/
│   │   │   │   ├── GPTSoVITSConfig.tsx
│   │   │   │   ├── GPTSoVITSSetup.tsx
│   │   │   │   ├── KokoroTTSConfig.tsx
│   │   │   │   └── VitsModelDownloader.tsx
│   │   │   ├── AIFeaturesSettings.tsx
│   │   │   ├── BackgroundSettings.tsx
│   │   │   ├── LLMSettings.tsx
│   │   │   ├── STTSettings.tsx
│   │   │   ├── ThreeDSettings.tsx
│   │   │   ├── TTSSettings.tsx
│   │   │   └── UISettings.tsx
│   │   ├── setup/
│   │   │   ├── shared/
│   │   │   │   └── ProviderSelection.tsx
│   │   │   ├── steps/
│   │   │   │   ├── AIFeaturesOverviewStep.tsx
│   │   │   │   ├── CharacterIntroStep.tsx
│   │   │   │   ├── ChromeAISetupStep.tsx
│   │   │   │   ├── LLMProviderStep.tsx
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
│   │   │   └── TabBar.tsx
│   │   ├── AppContent.tsx
│   │   ├── DemoSite.tsx
│   │   ├── ModelLoadingOverlay.tsx
│   │   ├── QuickAccessPanel.tsx
│   │   └── SettingsPanel.tsx
│   ├── config/
│   │   ├── aiConfig.ts
│   │   ├── animationConfig.ts
│   │   ├── promptConfig.ts
│   │   ├── sceneConfig.ts
│   │   └── uiConfig.ts
│   ├── contexts/
│   │   ├── AnimationContext.tsx
│   │   ├── AppRuntimeContext.tsx
│   │   └── SetupContext.tsx
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
│   │   └── useVisibilityUnmount.ts
│   ├── services/
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
│   │   ├── AIService.ts
│   │   ├── AppDataBackupService.ts
│   │   ├── BackgroundStorageService.ts
│   │   ├── CameraService.ts
│   │   ├── ChatHistoryService.ts
│   │   ├── ChatService.ts
│   │   ├── ChromeAIValidator.ts
│   │   ├── DocumentInteractionService.ts
│   │   ├── DragDropService.ts
│   │   ├── EmotePlayerService.ts
│   │   ├── EmoteStorageService.ts
│   │   ├── FrameCaptureService.ts
│   │   ├── LanguageDetectorService.ts
│   │   ├── LLMModelStorageService.ts
│   │   ├── Logger.ts
│   │   ├── LoggerService.ts
│   │   ├── MediaExtractionService.ts
│   │   ├── MicrophoneService.ts
│   │   ├── ModelStorageService.ts
│   │   ├── MotionStorageService.ts
│   │   ├── PMXConverterService.ts
│   │   ├── RewriterService.ts
│   │   ├── ScreenShareService.ts
│   │   ├── StageStorageService.ts
│   │   ├── STTService.ts
│   │   ├── SummarizerService.ts
│   │   ├── TranslatorService.ts
│   │   ├── TTSService.ts
│   │   ├── UtilService.ts
│   │   ├── VADService.ts
│   │   ├── VMDConverterService.ts
│   │   ├── VMDHandler.ts
│   │   ├── VoiceConversationService.ts
│   │   ├── VoiceRecordingService.ts
│   │   ├── VoiceStorageService.ts
│   │   └── WriterService.ts
│   ├── storage/
│   │   ├── adapters/
│   │   │   ├── DexieStorageAdapter.ts
│   │   │   ├── MemoryStorageAdapter.ts
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
│   │   └── gpt-sovits-bootstrap.d.ts
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
│   └── extensionTestHost.ts
├── tools/
│   ├── vite-plugins/
│   │   ├── android-models-plugin.ts
│   │   ├── extension-plugins.ts
│   │   ├── extension-test-host-plugin.ts
│   │   ├── package-runtime-assets-plugin.ts
│   │   └── vad-assets-plugin.ts
│   ├── create-node-llama-runtime-core.ts
│   └── write-package-type-entries.ts
├── .gitignore
├── .prettierignore
├── .prettierrc.json
├── bun.lock
├── capacitor.config.json
├── CONTRIBUTING.md
├── electron-builder.mac.json
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
├── tsconfig.package.embed.types.json
├── tsconfig.package.react.types.json
├── tsconfig.tools.json
├── vercel.json
├── vite.config.android.ts
├── vite.config.desktop.ts
├── vite.config.extension.ts
├── vite.config.package.embed.ts
├── vite.config.package.react.ts
└── vite.config.ts
```
