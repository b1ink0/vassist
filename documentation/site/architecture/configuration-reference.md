# Configuration Reference

All fields in `VAssistEmbedConfig`. Every field is optional. Unspecified fields fall back to defaults during `normalizeVAssistEmbedConfig()`.

The same config object is shared by `@vassist/embed` and `@vassist/react`.

Use this page once you already know the integration surface you need:

- package choice and deployment model: [Packages and Integration](/architecture/packages-and-integration)
- imperative browser API: [@vassist/embed](/architecture/embed)
- React wrapper and `customizations`: [@vassist/react](/architecture/react)

```ts
import type { VAssistEmbedConfig } from "@vassist/embed";
```

## `mount`

Controls where and how the embed instance is mounted into the DOM.

| Field              | Type                            | Default                                         | Description                                                                           |
| ------------------ | ------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| `target`           | `HTMLElement \| string \| null` | Inject helpers use `document.body` when omitted | Mount target for inject and auto-inject flows                                         |
| `hostId`           | `string`                        | `"vassist-embed-root"`                          | Stable identifier for this instance                                                   |
| `shadowRoot`       | `"open" \| "closed" \| false`   | `"open"`                                        | Shadow root mode. Set `false` to mount directly into the host element                 |
| `autoInject`       | `boolean`                       | `true`                                          | Whether `window.VAssistEmbedConfig` should auto-mount when the module loads           |
| `runtimeIsolation` | `"shadow-root" \| "iframe"`     | `"shadow-root"`                                 | Whether the runtime renders directly or inside an isolated iframe                     |
| `portalContainers` | `VAssistPortalContainersConfig` | `{}`                                            | Host-supplied portal targets for popovers, canvas portals, and future overlay routing |

### `mount.runtimeIsolation`

- `"shadow-root"`: default. Renders inside the host element's shadow root unless `shadowRoot` is `false`.
- `"iframe"`: mounts the runtime in an isolated child iframe while preserving the same public host API.

### `mount.portalContainers`

Portal targets accept a CSS selector string, an `HTMLElement`, a `ShadowRoot`, or `null`.

| Key        | Current use                                                                     |
| ---------- | ------------------------------------------------------------------------------- |
| `overlays` | Reserved. No built-in surface is routed here today, so most hosts can ignore it |
| `popovers` | Used by select menus and the remote model picker                                |
| `canvas`   | Used by the Live Assistant canvas portal                                        |

Selector strings are resolved at runtime. If a selector does not resolve, the affected UI surface falls back to its default container.

```ts
mount: {
  target: document.querySelector("#assistant-slot"),
  hostId: "my-assistant",
  runtimeIsolation: "shadow-root",
  portalContainers: {
    popovers: "#assistant-popovers",
    canvas: document.body,
  },
}
```

## `shell`

Controls which shell variant renders and how the initial setup flow works.

| Field                    | Type                                                        | Default  | Description                                                                      |
| ------------------------ | ----------------------------------------------------------- | -------- | -------------------------------------------------------------------------------- |
| `mode`                   | `"full" \| "chat-only" \| "chat-toolbar" \| "toolbar-only"` | `"full"` | Shell preset. Determines the default feature set                                 |
| `deferSetupUntilStarted` | `boolean`                                                   | `false`  | When `true`, setup UI stays deferred until the user actively opens the assistant |
| `forcePortraitMode`      | `boolean`                                                   | `false`  | Force portrait layout regardless of viewport size                                |

If `setup.mode` is omitted, `shell.deferSetupUntilStarted: true` also implies `setup.mode: "deferred"`.

### Shell mode feature defaults

| Feature           | `full` | `chat-only` | `chat-toolbar` | `toolbar-only` |
| ----------------- | :----: | :---------: | :------------: | :------------: |
| `chat`            |   ✓    |      ✓      |       ✓        |       -        |
| `history`         |   ✓    |      ✓      |       ✓        |       -        |
| `settings`        |   ✓    |      ✓      |       ✓        |       -        |
| `voiceInput`      |   ✓    |      ✓      |       ✓        |       -        |
| `voiceCall`       |   ✓    |      ✓      |       ✓        |       -        |
| `voiceOutput`     |   ✓    |      ✓      |       ✓        |       -        |
| `aiToolbar`       |   ✓    |      -      |       ✓        |       ✓        |
| `liveAssistant3d` |   ✓    |      -      |       -        |       -        |
| `camera`          |   ✓    |      ✓      |       ✓        |       -        |
| `screenShare`     |   ✓    |      ✓      |       ✓        |       -        |

## `features`

Override individual feature flags on top of the shell preset defaults.

| Feature           | Description                            |
| ----------------- | -------------------------------------- |
| `chat`            | Chat input and message thread          |
| `history`         | Saved conversations panel              |
| `settings`        | In-app settings panel                  |
| `voiceInput`      | Microphone input for voice-to-text     |
| `voiceCall`       | Real-time voice conversation mode      |
| `voiceOutput`     | TTS playback of assistant responses    |
| `aiToolbar`       | Page-level AI toolbar for text actions |
| `liveAssistant3d` | 3D Live Assistant avatar               |
| `camera`          | Camera capture for visual input        |
| `screenShare`     | Screen share for visual context        |

Normalization also applies a few safety rules:

- If `voiceCall` is disabled, `camera` and `screenShare` are forced off.
- If `chat` is disabled, `history` and `settings` are forced off.
- If `liveAssistant3d` is disabled, the `3d` settings tab is hidden automatically.

```ts
features: {
  liveAssistant3d: false,
  screenShare: false,
  camera: false,
}
```

## `settings`

Controls which settings tabs, subtabs, sections, and fields are visible or editable in the in-app settings UI.

| Field          | Type                     | Default                        | Description                                                                                        |
| -------------- | ------------------------ | ------------------------------ | -------------------------------------------------------------------------------------------------- |
| `hiddenTabs`   | `VAssistSettingsTabId[]` | `[]`                           | Hide full settings tabs                                                                            |
| `readOnlyTabs` | `VAssistSettingsTabId[]` | `[]`                           | Show tabs but prevent editing                                                                      |
| `hiddenFields` | `string[]`               | `[]`                           | Legacy string list. Matching known target IDs are folded into `policy.hidden` during normalization |
| `policy`       | `VAssistSettingsPolicy`  | `{ hidden: [], readOnly: [] }` | Preferred typed settings policy API                                                                |

### Supported tab IDs

```ts
"ui";
"3d";
"llm";
"tts";
"stt";
"ai-plus";
```

### Supported subtab IDs

```ts
"llm.provider";
"llm.routing";
"llm.profiles";
```

### Supported section IDs

```ts
"ui.appearance";
"ui.aiToolbar";
"ui.storage";
"ui.developer";
"llm.provider";
"llm.routing";
"llm.profiles";
"tts.provider";
"tts.remoteProfiles";
"stt.provider";
"stt.remoteProfiles";
"ai-plus.translator";
"ai-plus.languageDetector";
"ai-plus.summarizer";
"ai-plus.rewriter";
"ai-plus.writer";
```

### Supported field IDs

```ts
"ui.aiToolbar.enabled";
"ui.aiToolbar.showOnInputFocus";
"ui.aiToolbar.showOnImageHover";
"llm.provider.select";
"llm.openai.apiKey";
"llm.openai.model";
"llm.ollama.endpoint";
"llm.ollama.apiKey";
"llm.ollama.model";
"llm.routing.visionModel";
"llm.routing.routerModel";
"tts.enabled";
"tts.provider.select";
"tts.openai.apiKey";
"tts.openai.model";
"tts.openaiCompatible.endpoint";
"tts.openaiCompatible.apiKey";
"tts.openaiCompatible.model";
"tts.gptsovitsRemote.endpoint";
"tts.gptsovitsRemote.model";
"stt.enabled";
"stt.provider.select";
"stt.openai.apiKey";
"stt.openai.model";
"stt.openaiCompatible.endpoint";
"stt.openaiCompatible.apiKey";
"stt.openaiCompatible.model";
```

### Current runtime behavior

- `hiddenTabs` and `readOnlyTabs` always apply.
- `policy.hidden` and `policy.readOnly` are the preferred typed APIs. Unknown IDs are ignored during normalization.
- `hiddenFields` still works as a legacy alias when the strings match the supported target IDs above.
- `openSettings({ target })` uses the same target vocabulary to resolve the owning tab.
- The current UI supports direct LLM subtab navigation and enforces hide/read-only behavior on the tagged settings rows backed by the field IDs above.
- Section IDs are part of the public target vocabulary, but only sections explicitly wired by the current UI surface as the active nested target today.

```ts
settings: {
  hiddenTabs: ["3d"],
  policy: {
    readOnly: [
      "llm",
      "tts",
      "stt",
      "llm.provider.select",
      "tts.provider.select",
      "stt.provider.select",
    ],
    hidden: ["ui.aiToolbar.showOnImageHover"],
  },
}
```

## `aiToolbar`

Host policy for the built-in AI toolbar UI.

This is different from `features.aiToolbar`:

- `features.aiToolbar: false` disables the toolbar feature entirely.
- `aiToolbar` keeps the feature enabled, but changes where it appears and which built-in items are visible.

| Field              | Type                     | Default                | Description                                                          |
| ------------------ | ------------------------ | ---------------------- | -------------------------------------------------------------------- |
| `showOnInputFocus` | `boolean`                | `true`                 | Whether the toolbar can appear when an editable field receives focus |
| `showOnImageHover` | `boolean`                | `true`                 | Whether the toolbar can appear when the user hovers an image         |
| `visibleItems`     | `VAssistToolbarItemId[]` | `undefined`            | Optional whitelist of built-in toolbar items to show                 |
| `hiddenItems`      | `VAssistToolbarItemId[]` | `[]`                   | Built-in toolbar items to hide                                       |
| `itemOrder`        | `VAssistToolbarItemId[]` | default built-in order | Reorders built-in toolbar items and subgroup options                 |

The runtime applies the policy in this order:

1. Start from the default built-in item list.
2. Apply `visibleItems` if present.
3. Remove anything in `hiddenItems`.
4. Sort remaining items by `itemOrder`, then append unspecified items in their default order.

`visibleItems`, `hiddenItems`, and `itemOrder` affect only the built-in toolbar UI. They do not remove the corresponding imperative API from `triggerToolbarAction()`.

The package surfaces re-export two helper constants:

- `VASSIST_TOOLBAR_ACTIONS` for the `triggerToolbarAction()` action IDs
- `VASSIST_TOOLBAR_ITEMS` for the full built-in UI item list used by `aiToolbar`

`VASSIST_TOOLBAR_ITEMS` includes these UI-only item IDs in addition to the action IDs:

```ts
"insert";
"undo";
"redo";
```

AI+ feature toggles still apply on top of this policy. If the user or host disables Translator, Summarizer, Rewriter, or Writer in AI+ settings/config, the corresponding built-in toolbar items are removed from the visible UI.

```ts
aiToolbar: {
  showOnInputFocus: false,
  hiddenItems: ["add-to-chat", "image-identify-objects"],
  itemOrder: [
    "summarize-key-points",
    "translate",
    "write",
    "dictation",
  ],
}
```

## `setup`

Controls the first-run setup wizard.

| Field          | Type                                           | Default  | Description                                |
| -------------- | ---------------------------------------------- | -------- | ------------------------------------------ |
| `mode`         | `"full" \| "deferred" \| "hidden" \| "custom"` | `"full"` | Setup wizard behavior                      |
| `allowedSteps` | `string[]`                                     | `[]`     | Allowed step IDs when `mode` is `"custom"` |

| Mode         | Behavior                                                   |
| ------------ | ---------------------------------------------------------- |
| `"full"`     | Full setup wizard on first run                             |
| `"deferred"` | Setup wizard stays hidden until the user explicitly starts |
| `"hidden"`   | No setup wizard                                            |
| `"custom"`   | Show only the steps listed in `allowedSteps`               |

`allowedSteps` is only a good fit when you control the exact runtime build you ship. The current package surface does not export a stable public enum of setup-step IDs, so `setup.mode: "custom"` is version-coupled to the app build behind the embed.

For third-party integrations, prefer `"full"`, `"deferred"`, or `"hidden"` unless you also own the runtime version and its setup flow.

## `providers`

Controls how AI, TTS, and STT provider configuration enters the runtime.

| Field                   | Type                                                       | Default                        | Description                                  |
| ----------------------- | ---------------------------------------------------------- | ------------------------------ | -------------------------------------------- |
| `mode`                  | `"user-configurable" \| "preconfigured" \| "host-managed"` | `"user-configurable"`          | Who owns provider setup and editing          |
| `ai`                    | `DeepPartial<AIConfig> \| null`                            | `null`                         | AI config overrides                          |
| `tts`                   | `DeepPartial<TTSConfig> \| null`                           | `null`                         | TTS config overrides                         |
| `stt`                   | `DeepPartial<STTConfig> \| null`                           | `null`                         | STT config overrides                         |
| `lockProviderSelection` | `boolean`                                                  | `mode !== "user-configurable"` | Prevent provider selection changes in the UI |

| Mode                  | Behavior                                                                             |
| --------------------- | ------------------------------------------------------------------------------------ |
| `"user-configurable"` | End users own provider setup and editing                                             |
| `"preconfigured"`     | Host supplies defaults; users can still edit unless policy locks them                |
| `"host-managed"`      | Host owns provider setup and can treat the settings UI as informational or read-only |

Important distinction:

- `providers.mode` controls the UX and ownership model.
- `transport.mode` controls who executes requests.

Anything you place inside `providers.*` is browser-visible config. If vendor credentials must stay off the client, use `transport.mode: "host-bridge"` and keep the real keys in your backend or native host.

```ts
providers: {
  mode: "preconfigured",
  ai: {
    provider: "ollama",
    ollama: {
      endpoint: "http://localhost:11434",
      model: "llama3",
    },
  },
}
```

## `assets`

Controls how 3D models, stages, motion packs, and other runtime assets resolve.

| Field            | Type                                  | Default                                            | Description                                |
| ---------------- | ------------------------------------- | -------------------------------------------------- | ------------------------------------------ |
| `preset`         | `"default" \| "none" \| "host"`       | `"default"` when 3D is enabled, otherwise `"none"` | Asset preset selection                     |
| `assetBaseUrl`   | `string`                              | `undefined`                                        | Base URL prepended to relative asset paths |
| `modelUrl`       | `string \| null`                      | `undefined`                                        | Override the main 3D model                 |
| `stageUrl`       | `string \| null`                      | `undefined`                                        | Override the stage scene                   |
| `motionPack`     | `string \| null`                      | `undefined`                                        | Override the motion pack                   |
| `resourceLoader` | `string \| ResourceLoaderAdapterLike` | `undefined`                                        | Registered loader name or loader instance  |

| Preset      | Behavior                                       |
| ----------- | ---------------------------------------------- |
| `"default"` | Use the bundled asset set                      |
| `"none"`    | Do not load 3D assets                          |
| `"host"`    | Only use the URLs the host explicitly supplies |

`assetBaseUrl` only affects relative asset paths. Absolute URLs and `blob:` URLs pass through unchanged.

If you choose `preset: "host"`, also provide one or more of these so the runtime can resolve what it needs:

- `modelUrl`
- `stageUrl`
- `motionPack`
- `assetBaseUrl`
- `resourceLoader`

### `assets.resourceLoader`

Use `assets.resourceLoader` when a simple base URL is not enough and the host needs custom path-resolution rules.

The value can be either a registered loader name or a loader instance:

```ts
type ResourceLoaderSelection = string | ResourceLoaderAdapterLike;

interface ResourceLoaderAdapterLike {
  setMode?: (isExtension: boolean) => void;
  getURL: (path: string) => string;
  getURLAsync: (path: string) => Promise<string>;
  getModelURL: (filename: string) => string;
  getAnimationURL: (filename: string) => string;
  getTextureURL: (filename: string) => string;
  getPrivateTestURL: (type: string, filename: string) => string;
  isExtensionMode: () => boolean;
  loadJSON: <T = Record<string, unknown>>(path: string) => Promise<T>;
  loadText: (path: string) => Promise<string>;
  loadBinary: (path: string) => Promise<ArrayBuffer>;
  preloadResources: (paths: string[]) => Promise<ArrayBuffer[]>;
}
```

Register loaders at app startup through the package re-exports, then reference them by name in config:

```ts
registerResourceLoader("cdn", loader);

assets: {
  resourceLoader: "cdn",
}
```

## `storage`

Controls how chat history, settings, and other persistent state are stored.

| Field       | Type                                              | Default     | Description                                                         |
| ----------- | ------------------------------------------------- | ----------- | ------------------------------------------------------------------- |
| `mode`      | `"default" \| "namespaced" \| "memory" \| "host"` | `"default"` | Storage mode                                                        |
| `namespace` | `string`                                          | `undefined` | Namespace prefix when `mode` is `"namespaced"`                      |
| `adapter`   | `string \| StorageAdapterLike`                    | `undefined` | Registered adapter name or adapter instance when `mode` is `"host"` |

| Mode           | Behavior                                    |
| -------------- | ------------------------------------------- |
| `"default"`    | Default IndexedDB-backed storage            |
| `"namespaced"` | Default storage with a namespace prefix     |
| `"memory"`     | In-memory only                              |
| `"host"`       | Delegate storage to a host-supplied adapter |

### `storage.adapter`

Use `storage.mode: "host"` when the host already owns persistence or when multiple embeds need to share a custom storage layer.

`adapter` accepts either a registered adapter name or a `StorageAdapterLike` instance.

Supported storage tables:

```ts
"config";
"settings";
"cache";
"chat";
"files";
"sessions";
"data";
```

Adapter contract:

```ts
interface StorageAdapterLike {
  get<T = unknown>(
    table: StorageTableName,
    key: string,
  ): Promise<T | StorageRecord | undefined>;
  getRecord(
    table: StorageTableName,
    key: string,
  ): Promise<StorageRecord | undefined>;
  set<T>(
    table: StorageTableName,
    key: string,
    value: T,
    metadata?: StorageMetadata,
  ): Promise<boolean>;
  remove(table: StorageTableName, key: string): Promise<boolean>;
  exists(table: StorageTableName, key: string): Promise<boolean>;
  getMultiple<T = unknown>(
    table: StorageTableName,
    keys: string[],
  ): Promise<Record<string, T | undefined>>;
  setMultiple<T>(
    table: StorageTableName,
    items: Record<string, T>,
  ): Promise<boolean>;
  clear(table: StorageTableName): Promise<boolean>;
  query(
    table: StorageTableName,
    filter: StorageRecord,
  ): Promise<StorageRecord[]>;
  getAll(table: StorageTableName): Promise<StorageRecord[]>;
  count(table: StorageTableName): Promise<number>;
  cleanupExpiredCache(): Promise<number>;
  getStats(): Promise<StorageStats>;
  isDatabaseReady?(): Promise<boolean>;
}
```

Register adapters at app startup through the package re-exports, then reference them by name in config:

```ts
registerStorageAdapter("session", adapter);

storage: {
  mode: "host",
  adapter: "session",
}
```

## `theme`

Controls the visual appearance of the assistant UI.

| Field            | Type                              | Default                                                                                                    | Description                                     |
| ---------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `mode`           | `"adaptive" \| "light" \| "dark"` | `"adaptive"`                                                                                               | Color scheme                                    |
| `surfaceStyle`   | `"glass" \| "flat"`               | `"glass"`                                                                                                  | Surface presentation                            |
| `fontFamily`     | `string`                          | `"system-ui, Avenir, Helvetica, Arial, sans-serif"`                                                        | Base UI font stack                              |
| `monoFontFamily` | `string`                          | `"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace"` | Monospace font stack used by code-like surfaces |
| `tokens`         | `VAssistThemeTokens`              | `{}`                                                                                                       | Color token overrides for the active mode       |
| `inverseTokens`  | `VAssistThemeTokens`              | `{}`                                                                                                       | Color token overrides for the inverse mode      |
| `effects`        | `VAssistThemeEffects`             | see below                                                                                                  | Visual effects configuration                    |

Custom font loading is host-owned. If you set `theme.fontFamily` or `theme.monoFontFamily`, load the corresponding font yourself with your own CSS, asset pipeline, or a provider such as Google Fonts.

### `VAssistThemeTokens`

Supported token keys:

```ts
surfaceBase;
surfaceElevated;
surfaceInteractive;
surfaceOverlay;
surfaceHighlight;
textPrimary;
textSecondary;
textMuted;
borderColor;
borderStrongColor;
accentColor;
accentTextColor;
shadowColor;
inputPlaceholderColor;
focusRingColor;
statusError;
statusSuccess;
statusWarning;
```

### `effects`

| Field                  | Type      | Default | Description                              |
| ---------------------- | --------- | ------- | ---------------------------------------- |
| `enableBackdropBlur`   | `boolean` | `true`  | Enable blur on glass surfaces            |
| `enableSurfaceShadows` | `boolean` | `true`  | Enable box shadows                       |
| `enableAmbientOverlay` | `boolean` | `true`  | Enable the ambient background overlay    |
| `backdropBlurPx`       | `number`  | `16`    | Blur radius in pixels, clamped to `>= 0` |

## `transport`

Controls how AI, TTS, and STT requests are executed.

| Field    | Type                                                            | Default                                | Description                               |
| -------- | --------------------------------------------------------------- | -------------------------------------- | ----------------------------------------- |
| `mode`   | `"builtin" \| "openai-compatible" \| "custom" \| "host-bridge"` | `"builtin"` unless a bridge is present | Transport strategy                        |
| `bridge` | `VAssistProviderBridge`                                         | `undefined`                            | Host-owned provider bridge implementation |

| Mode                  | Runtime behavior                                                              |
| --------------------- | ----------------------------------------------------------------------------- |
| `"builtin"`           | Use the runtime's normal browser-side provider flow                           |
| `"host-bridge"`       | Delegate provider operations to `transport.bridge`                            |
| `"openai-compatible"` | Preserved in normalized config, but does not add transport behavior by itself |
| `"custom"`            | Preserved in normalized config, but does not add transport behavior by itself |

If you provide `transport.bridge` and omit `transport.mode`, normalization resolves the mode to `"host-bridge"` automatically.

### `transport.bridge.ai`

| Method                                                 | Required | Notes                                                                |
| ------------------------------------------------------ | -------- | -------------------------------------------------------------------- |
| `sendMessage({ messages, options, signal, onStream })` | Yes      | Used for both streaming and non-streaming message generation         |
| `configure(config)`                                    | No       | Called when host-managed config changes                              |
| `isConfigured()`                                       | No       | If omitted, the runtime assumes AI is configured                     |
| `getCurrentProvider()`                                 | No       | Return a plain string or `null` synchronously in the current runtime |
| `listModels(config)`                                   | No       | Powers remote model listing in the settings UI                       |
| `testConnection()`                                     | No       | Powers provider connection tests                                     |
| `abortRequest()`                                       | No       | Used when the user stops generation                                  |

### `transport.bridge.tts`

| Method                                      | Required | Notes                                                                                                               |
| ------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| `generateSpeech({ text, generateLipSync })` | Yes      | Return audio as `Blob`, `ArrayBuffer`, `Uint8Array`, or `number[]`; optional `mimeType` and `bvmdUrl` are supported |
| `configure(config)`                         | No       | Called when host-managed config changes                                                                             |
| `isConfigured()`                            | No       | If omitted, the runtime assumes TTS is configured                                                                   |
| `getCurrentProvider()`                      | No       | Return a plain string or `null` synchronously in the current runtime                                                |
| `testConnection({ text })`                  | No       | Powers provider connection tests                                                                                    |

The host bridge only generates audio. Playback, queueing, and lip-sync scheduling remain in the browser runtime.

### `transport.bridge.stt`

| Method                                  | Required | Notes                                                                                                                           |
| --------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `transcribeAudio({ audio, mimeType })`  | Yes      | Receives captured audio bytes and MIME type                                                                                     |
| `configure(config)`                     | No       | Called when host-managed config changes                                                                                         |
| `isConfigured()`                        | No       | If omitted, the runtime assumes STT is configured                                                                               |
| `testRecording({ duration, deviceId })` | No       | Part of the exported bridge type, but the current built-in STT test flow still records locally and then calls `transcribeAudio` |

The current runtime still records microphone audio in the browser, then passes the bytes to `stt.transcribeAudio`.

```ts
function toBytes(input: VAssistBinaryLike): Uint8Array {
  if (input instanceof Uint8Array) {
    return input;
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  if (Array.isArray(input)) {
    return Uint8Array.from(input);
  }
  throw new Error("Expected ArrayBuffer, Uint8Array, or number[] in this host");
}

transport: {
  mode: "host-bridge",
  bridge: {
    ai: {
      getCurrentProvider: () => "host-backend",
      async sendMessage({ messages }) {
        const response = await fetch("/api/vassist/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages }),
        });
        const data = await response.json();
        return {
          success: response.ok,
          response: typeof data.text === "string" ? data.text : null,
        };
      },
    },
    tts: {
      getCurrentProvider: () => "host-backend",
      async generateSpeech({ text }) {
        const response = await fetch("/api/vassist/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });

        if (!response.ok) {
          return null;
        }

        return {
          audio: await response.arrayBuffer(),
          mimeType: response.headers.get("Content-Type") ?? "audio/mpeg",
        };
      },
    },
    stt: {
      async transcribeAudio({ audio, mimeType }) {
        const response = await fetch("/api/vassist/stt", {
          method: "POST",
          headers: {
            "Content-Type": mimeType ?? "application/octet-stream",
          },
          body: toBytes(audio),
        });

        const data = await response.json();
        return typeof data.text === "string" ? data.text : "";
      },
    },
  },
}
```

## `branding`

Controls host-level labeling and icon overrides.

| Field            | Type                                      | Default     | Description                                                 |
| ---------------- | ----------------------------------------- | ----------- | ----------------------------------------------------------- |
| `appName`        | `string`                                  | `undefined` | Brand name stored in resolved config and snapshots          |
| `labelOverrides` | `Partial<Record<VAssistLabelId, string>>` | `undefined` | Override built-in labels by stable label ID                 |
| `iconOverrides`  | `Record<string, string>`                  | `undefined` | Override built-in icons with URL strings keyed by icon name |

`appName` is part of the public embed config, but visible built-in copy is currently customized primarily through `labelOverrides`.

For React hosts that need component-level icon control, prefer `customizations.iconRenderers` over URL-based `iconOverrides`.

### Supported label IDs

```ts
"chat.emptyState.title";
"chat.emptyState.description";
"chat.action.settings";
"chat.action.history";
"chat.action.stop";
"chat.action.new";
"chat.action.close";
"chat.action.hideCharacter";
"chat.action.showCharacter";
"chat.action.tempEnable";
"chat.action.tempDisable";
"chat.input.placeholder";
"chat.input.send";
"chat.input.close";
"chat.input.closeVoiceMode";
"history.title";
"history.searchPlaceholder";
"history.emptyState";
"settings.title";
"settings.managedByHost";
"toolbar.dictionary";
"toolbar.rewrite";
"toolbar.write";
"toolbar.dictate";
"toolbar.summarize";
"toolbar.translate";
"toolbar.imageDescribe";
"toolbar.addToChat";
"toolbar.insert";
```

## `hooks`

Event callbacks for lifecycle and message activity.

| Hook                | Signature                                       | Fires when                                      |
| ------------------- | ----------------------------------------------- | ----------------------------------------------- |
| `onReady`           | `() => void`                                    | The embed is initialized and ready              |
| `onOpen`            | `() => void`                                    | The assistant opens                             |
| `onClose`           | `() => void`                                    | The assistant closes                            |
| `onRequireSetup`    | `() => void`                                    | The user needs provider setup before continuing |
| `onMessage`         | `(payload: VAssistMessageEventPayload) => void` | Any message is added                            |
| `onMessageSent`     | `(payload: VAssistMessageEventPayload) => void` | A user message is sent                          |
| `onMessageReceived` | `(payload: VAssistMessageEventPayload) => void` | An assistant message is received                |

### `VAssistMessageEventPayload`

| Field       | Type       | Description              |
| ----------- | ---------- | ------------------------ |
| `messageId` | `string`   | Message ID               |
| `role`      | `string`   | Message role             |
| `content`   | `string`   | Message text             |
| `images`    | `string[]` | Attached image data URLs |
| `audios`    | `string[]` | Attached audio data URLs |

## `VAssistRuntimeSnapshot`

Returned by `VAssistEmbedElementHandle.getRuntimeSnapshot()` and `window.VAssistEmbed.getRuntimeSnapshot()`.

| Field             | Type                              | Description                                                               |
| ----------------- | --------------------------------- | ------------------------------------------------------------------------- |
| `hostId`          | `string`                          | Stable host ID for the mounted instance                                   |
| `shellMode`       | `VAssistShellMode`                | Resolved shell mode                                                       |
| `draft`           | `string`                          | Current draft input text                                                  |
| `currentChatId`   | `string \| null`                  | Active conversation ID                                                    |
| `isTempChat`      | `boolean`                         | Whether the current conversation is temporary                             |
| `isProcessing`    | `boolean`                         | Whether the assistant is currently generating                             |
| `isSpeaking`      | `boolean`                         | Whether TTS playback is active                                            |
| `isVoiceMode`     | `boolean`                         | Whether voice mode is active                                              |
| `pendingDropData` | `boolean`                         | Whether host-supplied drop data is queued for the input                   |
| `panels`          | object                            | Open-state snapshot for chat input, chat container, settings, and history |
| `messages`        | `VAssistRuntimeSnapshotMessage[]` | Current in-memory message list                                            |
| `embedConfig`     | `ResolvedVAssistEmbedConfig`      | Fully normalized config for this host                                     |
| `uiConfig`        | `UIConfig`                        | Current UI config-store state                                             |
| `aiConfig`        | `AIConfig`                        | Current AI config-store state                                             |
| `ttsConfig`       | `TTSConfig`                       | Current TTS config-store state                                            |
| `sttConfig`       | `STTConfig`                       | Current STT config-store state                                            |

### `snapshot.panels`

| Field               | Type      | Description                             |
| ------------------- | --------- | --------------------------------------- |
| `chatInputOpen`     | `boolean` | Whether the chat input is open          |
| `chatContainerOpen` | `boolean` | Whether the main chat container is open |
| `settingsOpen`      | `boolean` | Whether settings are open               |
| `historyOpen`       | `boolean` | Whether history is open                 |

### `VAssistRuntimeSnapshotMessage`

| Field     | Type       | Description              |
| --------- | ---------- | ------------------------ |
| `id`      | `string`   | Runtime message ID       |
| `role`    | `string`   | Message role             |
| `content` | `string`   | Message text             |
| `images`  | `string[]` | Attached image data URLs |
| `audios`  | `string[]` | Attached audio data URLs |

## Full Config Example

```ts
function toBytes(input: VAssistBinaryLike): Uint8Array {
  if (input instanceof Uint8Array) {
    return input;
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  if (Array.isArray(input)) {
    return Uint8Array.from(input);
  }
  throw new Error("Expected ArrayBuffer, Uint8Array, or number[] in this host");
}

const bridge: VAssistProviderBridge = {
  ai: {
    getCurrentProvider: () => "host-backend",
    async sendMessage({ messages }: { messages: unknown[] }) {
      const response = await fetch("/api/vassist/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });
      const data = await response.json();
      return {
        success: response.ok,
        response: typeof data.text === "string" ? data.text : null,
      };
    },
  },
  tts: {
    getCurrentProvider: () => "host-backend",
    async generateSpeech({ text }) {
      const response = await fetch("/api/vassist/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        return null;
      }

      return {
        audio: await response.arrayBuffer(),
        mimeType: response.headers.get("Content-Type") ?? "audio/mpeg",
      };
    },
  },
  stt: {
    async transcribeAudio({ audio, mimeType }) {
      const response = await fetch("/api/vassist/stt", {
        method: "POST",
        headers: {
          "Content-Type": mimeType ?? "application/octet-stream",
        },
        body: toBytes(audio),
      });

      const data = await response.json();
      return typeof data.text === "string" ? data.text : "";
    },
  },
};

const config: VAssistEmbedConfig = {
  mount: {
    target: document.querySelector("#assistant-slot"),
    hostId: "my-assistant",
    runtimeIsolation: "shadow-root",
    portalContainers: {
      popovers: "#assistant-popovers",
      canvas: document.body,
    },
  },
  shell: {
    mode: "full",
    deferSetupUntilStarted: true,
  },
  features: {
    liveAssistant3d: false,
    screenShare: false,
  },
  settings: {
    policy: {
      readOnly: ["llm", "tts", "stt"],
      hidden: ["ui.aiToolbar.showOnImageHover"],
    },
  },
  aiToolbar: {
    hiddenItems: ["add-to-chat"],
    itemOrder: ["summarize-key-points", "translate", "write"],
  },
  providers: {
    mode: "host-managed",
    lockProviderSelection: true,
  },
  assets: {
    assetBaseUrl: "https://cdn.example.com/vassist/",
  },
  storage: {
    mode: "namespaced",
    namespace: "my-app",
  },
  theme: {
    mode: "dark",
    surfaceStyle: "glass",
    tokens: {
      accentColor: "#1f6feb",
      accentTextColor: "#ffffff",
    },
  },
  transport: {
    mode: "host-bridge",
    bridge,
  },
  branding: {
    labelOverrides: {
      "settings.managedByHost": "Configured by Example Cloud",
    },
  },
  hooks: {
    onReady() {
      console.log("ready");
    },
    onMessage(payload) {
      console.log(payload.role, payload.content);
    },
  },
};
```

## Related

- [`@vassist/embed` →](/architecture/embed)
- [`@vassist/react` →](/architecture/react)
