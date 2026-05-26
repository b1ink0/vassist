# Repository Tree

VAssist repository tree and file metrics.

## Totals

- Directories: 132
- Files: 431
- Text files counted for metrics: 347
- Total text lines: 122542
- Code files counted for metrics: 264
- Total code lines: 112394

## Line Counts by File Type

| File Type | Extensions | Files | Lines |
| --- | --- | ---: | ---: |
| Batch Script | .bat | 1 | 94 |
| C and C++ | .c, .cc, .cpp, .h, .hpp | 6 | 1285 |
| CSS | .css, .scss, .less | 5 | 1275 |
| HTML | .html | 4 | 73 |
| Java | .java | 2 | 44 |
| Kotlin | .kt | 13 | 6485 |
| Shell Script | (no extension) | 2 | 255 |
| TSX | .tsx | 86 | 43823 |
| TypeScript | .ts, .mts, .cts | 145 | 59060 |
| Gradle | .gradle | 7 | 242 |
| JSON | .json | 13 | 400 |
| Markdown | .md | 29 | 3083 |
| Other Text | mixed | 7 | 2236 |
| Plain Text | (no extension) | 10 | 3531 |
| Properties | .properties | 2 | 29 |
| SVG | .svg | 3 | 232 |
| XML | .xml | 12 | 395 |

## Top-Level Summary

- .husky/: 1 directories, 1 files
- android/: 52 directories, 74 files
- android-src/: 1 directories, 3 files
- documentation/: 10 directories, 38 files
- electron/: 13 directories, 48 files
- extension/: 6 directories, 19 files
- public/: 5 directories, 19 files
- src/: 42 directories, 201 files
- tools/: 2 directories, 4 files
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
│   │   ├── architecture/
│   │   │   ├── ai-and-media-stack.md
│   │   │   ├── overview.md
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
│   │   │   └── virtual-companion.md
│   │   ├── platforms/
│   │   │   ├── android.md
│   │   │   ├── desktop.md
│   │   │   └── extension.md
│   │   ├── public/
│   │   │   └── assets/
│   │   │       ├── chat.png
│   │   │       ├── companion.png
│   │   │       ├── dictation.png
│   │   │       ├── language_detector.png
│   │   │       ├── overview.gif
│   │   │       ├── rewrite.png
│   │   │       ├── summarize.png
│   │   │       ├── toolbars.png
│   │   │       ├── translate.png
│   │   │       └── writer.png
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
│   │   └── SettingsPanel.tsx
│   ├── config/
│   │   ├── aiConfig.ts
│   │   ├── animationConfig.ts
│   │   ├── promptConfig.ts
│   │   ├── sceneConfig.ts
│   │   └── uiConfig.ts
│   ├── contexts/
│   │   ├── AnimationContext.tsx
│   │   └── SetupContext.tsx
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
│   │   ├── DatabaseSchema.ts
│   │   ├── index.ts
│   │   ├── StorageAdapter.ts
│   │   └── StorageManager.ts
│   ├── stores/
│   │   ├── createAnimationStore.ts
│   │   ├── createSetupStore.ts
│   │   ├── storeUtils.ts
│   │   ├── useAndroidStore.ts
│   │   ├── useAppStore.ts
│   │   ├── useConfigStore.ts
│   │   └── useDesktopStore.ts
│   ├── styles/
│   │   ├── streaming-animations.css
│   │   └── ui-effects.css
│   ├── types/
│   │   ├── android.d.ts
│   │   ├── android.ts
│   │   ├── assistant.ts
│   │   ├── electron.d.ts
│   │   ├── env.d.ts
│   │   └── gpt-sovits-bootstrap.d.ts
│   ├── utils/
│   │   ├── BackgroundDetector.ts
│   │   ├── cn.ts
│   │   ├── debounce.ts
│   │   ├── ExtensionBridge.ts
│   │   ├── PlatformUtils.ts
│   │   ├── ResourceLoader.ts
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
├── tools/
│   ├── vite-plugins/
│   │   ├── android-models-plugin.ts
│   │   ├── extension-plugins.ts
│   │   └── vad-assets-plugin.ts
│   └── create-node-llama-runtime-core.ts
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
└── vite.config.ts
```
