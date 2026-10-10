# @vassist/embed

Imperative browser-side API for VAssist. Works in any JavaScript environment: vanilla JS, Vue, Svelte, Angular, or any other non-React host.

## Entry Points

| Import                        | Exports                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| `@vassist/embed`              | Base runtime API, all public embed types, storage helpers, and resource loader registry |
| `@vassist/embed/full`         | Full-shell inject helpers plus everything from the base entry                           |
| `@vassist/embed/chat`         | Chat-shell inject helpers plus everything from the base entry                           |
| `@vassist/embed/chat-toolbar` | Chat + toolbar inject helpers plus everything from the base entry                       |
| `@vassist/embed/toolbar`      | Toolbar-shell inject helpers plus everything from the base entry                        |

Preset entries re-export the base entry, so you never need to import both.

## Mount And Config Helpers

| Function                                    | Returns                      | Purpose                                                                         |
| ------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------- |
| `injectVAssistEmbed(options?)`              | `HTMLElement`                | Mount or reuse an instance. `target` defaults to `document.body` when omitted   |
| `updateVAssistEmbedConfig(config, hostId?)` | `HTMLElement \| null`        | Update config for an existing host. Returns `null` when the host does not exist |
| `removeVAssistEmbed(hostId?)`               | `void`                       | Unmount and remove an existing host                                             |
| `createVAssistShadowRootMount(config?)`     | `VAssistEmbedElementHandle`  | Create the host element without appending it to the DOM                         |
| `defineVAssistEmbedElement()`               | `string`                     | Register the `vassist-embed` custom element                                     |
| `mergeVAssistEmbedConfig(base, override)`   | `VAssistEmbedConfig`         | Deep-merge config objects                                                       |
| `normalizeVAssistEmbedConfig(config)`       | `ResolvedVAssistEmbedConfig` | Fill defaults and normalize shell, settings, transport, and branding            |

The preset entries add shell-specific helpers such as `injectFullVAssistEmbed` and `injectChatVAssistEmbed`.

```ts
import {
  injectChatToolbarVAssistEmbed,
  updateVAssistEmbedConfig,
  removeVAssistEmbed,
} from "@vassist/embed/chat-toolbar";

injectChatToolbarVAssistEmbed({
  hostId: "assistant",
  config: {
    storage: { mode: "namespaced", namespace: "docs-demo" },
    shell: { deferSetupUntilStarted: true },
  },
});

updateVAssistEmbedConfig({ theme: { mode: "dark" } }, "assistant");

removeVAssistEmbed("assistant");
```

## Controlling A Mounted Instance

For instance-specific control, query the mounted element and cast it to `VAssistEmbedElementHandle`.

```ts
import {
  injectFullVAssistEmbed,
  type VAssistEmbedElementHandle,
} from "@vassist/embed/full";

injectFullVAssistEmbed({
  hostId: "assistant",
  config: {
    providers: { mode: "host-managed", lockProviderSelection: true },
    settings: {
      policy: {
        readOnly: ["llm", "tts", "stt"],
      },
    },
  },
});

const assistant = document.getElementById(
  "assistant",
) as VAssistEmbedElementHandle | null;

assistant?.openSettings({ target: "llm.provider.select" });
assistant?.setDraftInput("Summarize the current page in 5 bullets.", {
  focus: true,
});
assistant?.sendMessage({ content: "Summarize the current page in 5 bullets." });

const snapshot = assistant?.getRuntimeSnapshot();
console.log(snapshot?.messages);
```

### `VAssistEmbedElementHandle`

| Method                                   | Purpose                                                                           |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| `setConfig(config)`                      | Merge a config update into this instance                                          |
| `getConfig()`                            | Read the fully resolved config for this host                                      |
| `openChat()`                             | Open the chat container and input                                                 |
| `openSettings(options?)`                 | Open settings. Use `tab`, `subTab`, or `target` to steer where the panel lands    |
| `openHistory()`                          | Open saved conversation history                                                   |
| `setDraftInput(value, options?)`         | Replace or append to the current draft. `focus` defaults to `true`                |
| `sendMessage(input)`                     | Seed the draft, enqueue attachments, and submit the message                       |
| `triggerToolbarAction(action, options?)` | Trigger a built-in toolbar workflow programmatically                              |
| `getRuntimeSnapshot()`                   | Read current messages, panel state, resolved config, and provider/UI config state |
| `closeChat()`                            | Close the chat container                                                          |
| `toggleVisibility()`                     | Toggle open/closed state                                                          |
| `resetSession()`                         | Clear the current conversation                                                    |

Important behavior details:

- `openSettings({ target })` resolves the owning tab from the target ID prefix. The current UI also supports direct LLM subtab routing through `subTab`.
- `sendMessage({ images, audios })` expects data URLs for attachments.
- `triggerToolbarAction()` reuses the same action handlers as the built-in toolbar. Actions that depend on selection, hovered images, or a focused input still need that context to exist in the page.
- The same handle API works when `mount.runtimeIsolation` is `"iframe"`. Commands are forwarded into the isolated child runtime automatically.

## `window.VAssistEmbed`

Importing any `@vassist/embed*` entry defines `window.VAssistEmbed` in browser environments.

| Method                 | Signature                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `inject`               | `(options?: VAssistEmbedInjectOptions) => HTMLElement`                                   |
| `remove`               | `(hostId?: string) => void`                                                              |
| `updateConfig`         | `(config: VAssistEmbedConfig, hostId?: string) => HTMLElement \| null`                   |
| `openChat`             | `() => void`                                                                             |
| `openSettings`         | `(options?: VAssistOpenSettingsOptions) => void`                                         |
| `openHistory`          | `() => void`                                                                             |
| `setDraftInput`        | `(value: string, options?: VAssistSetDraftOptions) => void`                              |
| `sendMessage`          | `(input: VAssistSendMessageInput) => void`                                               |
| `triggerToolbarAction` | `(action: VAssistToolbarActionId, options?: VAssistTriggerToolbarActionOptions) => void` |
| `getRuntimeSnapshot`   | `() => VAssistRuntimeSnapshot \| null`                                                   |
| `closeChat`            | `() => void`                                                                             |
| `toggleVisibility`     | `() => void`                                                                             |
| `resetSession`         | `() => void`                                                                             |

Use the global API for the default or auto-injected host. The instance-level helpers without a `hostId` argument do not let you choose between multiple mounted hosts. On pages with more than one embed instance, keep explicit element handles and call methods on those handles instead.

## `vassist-embed` Custom Element

The custom element is registered automatically on import.

```html
<vassist-embed defer-setup-until-started></vassist-embed>
```

The `defer-setup-until-started` attribute is treated as truthy unless it is one of `0`, `false`, `no`, or `off`.

```ts
import type { VAssistEmbedElementHandle } from "@vassist/embed";

const el = document.querySelector("vassist-embed") as VAssistEmbedElementHandle;

el.setConfig({
  shell: { mode: "chat-only" },
  theme: { mode: "dark" },
});

el.openChat();
```

### Auto-inject via `window.VAssistEmbedConfig`

If `window.VAssistEmbedConfig` exists before the module loads and `mount.autoInject !== false`, importing `@vassist/embed` will auto-mount the instance.

```html
<script>
  window.VAssistEmbedConfig = {
    mount: { hostId: "auto-assistant" },
    shell: { mode: "chat-only" },
  };
</script>
<script type="module">
  import "@vassist/embed/chat";
</script>
```

## Secure Host Bridge Transport

Use `transport.mode: "host-bridge"` when your backend or native host must own provider credentials and network calls.

```ts
import {
  injectFullVAssistEmbed,
  type VAssistBinaryLike,
  type VAssistProviderBridge,
} from "@vassist/embed/full";

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
  throw new Error(
    "This host expects ArrayBuffer, Uint8Array, or number[] audio data",
  );
}

const bridge: VAssistProviderBridge = {
  ai: {
    getCurrentProvider: () => "host-backend",
    async isConfigured() {
      return true;
    },
    async sendMessage({ messages, signal, onStream }) {
      const response = await fetch("/api/vassist/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
        signal: signal ?? undefined,
      });

      const data = await response.json();
      if (typeof data.text === "string" && onStream) {
        onStream(data.text);
      }

      return {
        success: response.ok,
        response: typeof data.text === "string" ? data.text : null,
        error: response.ok ? null : data,
      };
    },
    async listModels({ provider, endpoint }) {
      const response = await fetch("/api/vassist/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, endpoint }),
      });
      const data = await response.json();
      return {
        models: Array.isArray(data.models) ? data.models : [],
        error: typeof data.error === "string" ? data.error : undefined,
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

injectFullVAssistEmbed({
  hostId: "secure-assistant",
  config: {
    providers: {
      mode: "host-managed",
      lockProviderSelection: true,
    },
    transport: {
      mode: "host-bridge",
      bridge,
    },
    settings: {
      policy: {
        readOnly: ["llm", "tts", "stt"],
      },
    },
  },
});
```

Current runtime behavior for host-bridge mode:

- AI bridge methods drive provider configuration checks, message generation, stop-generation behavior, connection tests, and remote model listing.
- TTS bridge methods generate audio in the host, but playback, chunk queueing, and lip-sync scheduling still happen in the browser runtime.
- STT still captures microphone audio in the browser runtime, then forwards bytes and MIME type to `stt.transcribeAudio`.
- If you omit `transport.mode` but provide `transport.bridge`, config normalization resolves the mode to `"host-bridge"` automatically.
- `providers.mode: "host-managed"` controls the settings UX. It does not replace the bridge.
- `ai.getCurrentProvider` and `tts.getCurrentProvider` should return a plain string or `null` synchronously in the current runtime, even though the public type also allows promises.

## Toolbar Action IDs

`triggerToolbarAction()` accepts the built-in toolbar action IDs below.

```ts
assistant?.triggerToolbarAction("summarize-key-points");
assistant?.triggerToolbarAction("translate", {
  targetLanguage: "Spanish",
  autoDetectSourceLanguage: true,
});
```

Supported action IDs:

- Dictionary: `dictionary-define`, `dictionary-synonyms`, `dictionary-antonyms`, `dictionary-pronunciation`, `dictionary-examples`
- Rewrite: `rewrite-grammar`, `rewrite-spelling`, `rewrite-moreFormal`, `rewrite-moreCasual`, `rewrite-professional`, `rewrite-shorter`, `rewrite-longer`, `rewrite-simplify`, `rewrite-concise`, `rewrite-clarity`, `rewrite-custom`
- Write and dictation: `write`, `dictation`
- Summaries: `summarize-tldr`, `summarize-headline`, `summarize-key-points`, `summarize-teaser`
- Translation: `translate`, `detect-language`
- Images: `image-describe`, `image-extract-text`, `image-identify-objects`
- Chat handoff: `add-to-chat`

Both browser packages also re-export `VASSIST_TOOLBAR_ACTIONS` if you want the canonical action ID list in host code.

## AI Toolbar Policy

Use `config.aiToolbar` when you want to change the built-in toolbar UI without forking the toolbar component.

```ts
injectFullVAssistEmbed({
  hostId: "assistant",
  config: {
    aiToolbar: {
      showOnInputFocus: false,
      hiddenItems: ["add-to-chat"],
      itemOrder: ["summarize-key-points", "translate", "write", "dictation"],
    },
  },
});
```

What this policy can do:

- turn off input-focus or image-hover toolbar triggers without disabling text-selection triggers
- hide built-in items such as `add-to-chat`, `image-identify-objects`, or `insert`
- whitelist only a subset of built-in items through `visibleItems`
- reorder both top-level toolbar buttons and subgroup options through `itemOrder`

What it does not do:

- it does not remove the corresponding imperative action from `triggerToolbarAction()`
- it does not affect React-only extra buttons returned by `customizations.renderToolbarActions`

Use `VASSIST_TOOLBAR_ITEMS` when you need the canonical built-in UI item list for `visibleItems`, `hiddenItems`, or `itemOrder`. That list includes the action IDs above plus `insert`, `undo`, and `redo`.

## Runtime Snapshots

`getRuntimeSnapshot()` returns a `VAssistRuntimeSnapshot` with the state that hosts usually need for orchestration and debugging.

| Field                                            | Description                                                      |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| `hostId`                                         | Current host ID                                                  |
| `shellMode`                                      | Resolved shell mode                                              |
| `draft`                                          | Current chat draft                                               |
| `currentChatId`                                  | Active conversation ID                                           |
| `isTempChat`                                     | Whether the current thread is a temporary chat                   |
| `isProcessing`                                   | Whether the assistant is currently generating                    |
| `isSpeaking`                                     | Whether TTS playback is active                                   |
| `isVoiceMode`                                    | Whether voice mode is active                                     |
| `pendingDropData`                                | Whether host-supplied attachment data is queued                  |
| `panels`                                         | Open state for chat input, chat container, settings, and history |
| `messages`                                       | Current message list with text and any data-URL attachments      |
| `embedConfig`                                    | Fully resolved embed config for this host                        |
| `uiConfig`, `aiConfig`, `ttsConfig`, `sttConfig` | Current runtime config store state                               |

## Storage Integration

The base entry re-exports the storage adapter registry. Use this when you need to plug in a custom persistence layer.

### Register And Use An Adapter

```ts
import {
  registerStorageAdapter,
  createMemoryStorageAdapter,
  injectVAssistEmbed,
} from "@vassist/embed";

registerStorageAdapter("session", createMemoryStorageAdapter());

injectVAssistEmbed({
  config: {
    storage: {
      mode: "host",
      adapter: "session",
    },
  },
});
```

### Register A Custom Adapter

```ts
import {
  registerStorageAdapter,
  injectVAssistEmbed,
  type StorageAdapterLike,
  type StorageRecord,
  type StorageTableName,
} from "@vassist/embed";

class MyStorageAdapter implements StorageAdapterLike {
  async get(
    table: StorageTableName,
    id: string,
  ): Promise<StorageRecord | null> {
    throw new Error(`Not implemented: ${table}:${id}`);
  }

  async set(table: StorageTableName, record: StorageRecord): Promise<void> {
    void table;
    void record;
  }

  async delete(table: StorageTableName, id: string): Promise<void> {
    void table;
    void id;
  }

  async list(table: StorageTableName): Promise<StorageRecord[]> {
    void table;
    return [];
  }

  async clear(table: StorageTableName): Promise<void> {
    void table;
  }
}

registerStorageAdapter("my-adapter", new MyStorageAdapter());

injectVAssistEmbed({
  config: {
    storage: { mode: "host", adapter: "my-adapter" },
  },
});
```

### Storage Registry API

| Function                                | Description                                                |
| --------------------------------------- | ---------------------------------------------------------- |
| `registerStorageAdapter(name, adapter)` | Register a named adapter                                   |
| `setDefaultStorageAdapter(name)`        | Change which adapter is used by default                    |
| `getDefaultStorageAdapter()`            | Read the current default adapter                           |
| `getRegisteredStorageAdapter(name)`     | Look up an adapter by name                                 |
| `listRegisteredStorageAdapters()`       | List registered adapter names                              |
| `resolveStorageAdapter(selection)`      | Resolve a `StorageAdapterSelection` to an adapter instance |
| `createMemoryStorageAdapter()`          | Create a new in-memory adapter                             |
| `createStorageManager(adapter)`         | Create a `StorageManager` backed by the given adapter      |

Built-in adapter classes exported for subclassing:

- `DexieStorageAdapter`: IndexedDB-backed adapter
- `MemoryStorageAdapter`: in-memory adapter

## Resource Loader Integration

The resource loader controls how VAssist resolves asset URLs such as 3D models, stages, motions, and ONNX assets.

### Override The Asset Base URL

```ts
injectVAssistEmbed({
  config: {
    assets: {
      assetBaseUrl: "https://cdn.example.com/vassist/",
    },
  },
});
```

### Register A Custom Loader

```ts
import {
  DefaultResourceLoader,
  registerResourceLoader,
  injectVAssistEmbed,
} from "@vassist/embed";

class CdnLoader extends DefaultResourceLoader {
  override getURL(path: string): string {
    const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
    return `https://cdn.example.com/${normalizedPath}`;
  }

  override async getURLAsync(path: string): Promise<string> {
    return this.getURL(path);
  }
}

registerResourceLoader("cdn", new CdnLoader());

injectVAssistEmbed({
  config: {
    assets: { resourceLoader: "cdn" },
  },
});
```

### Resource Loader Registry API

| Function                               | Description                                              |
| -------------------------------------- | -------------------------------------------------------- |
| `registerResourceLoader(name, loader)` | Register a named loader                                  |
| `setDefaultResourceLoader(name)`       | Change which loader is used by default                   |
| `getRegisteredResourceLoader(name)`    | Look up a loader by name                                 |
| `listRegisteredResourceLoaders()`      | List registered loader names                             |
| `resolveResourceLoader(selection)`     | Resolve a `ResourceLoaderSelection` to a loader instance |
| `builtinResourceLoader`                | Built-in loader instance                                 |
| `resourceLoader`                       | Active loader instance                                   |

## Multiple Instances

Give every instance a unique `hostId`.

```ts
import {
  injectChatVAssistEmbed,
  type VAssistEmbedElementHandle,
} from "@vassist/embed/chat";
import { injectToolbarVAssistEmbed } from "@vassist/embed/toolbar";
import { removeVAssistEmbed } from "@vassist/embed";

injectChatVAssistEmbed({
  target: document.querySelector("#chat-panel"),
  hostId: "chat",
  config: { storage: { mode: "namespaced", namespace: "my-app-chat" } },
});

injectToolbarVAssistEmbed({
  target: document.querySelector("#toolbar-area"),
  hostId: "toolbar",
  config: { theme: { mode: "light" } },
});

const chat = document.getElementById(
  "chat",
) as VAssistEmbedElementHandle | null;
chat?.openSettings({ tab: "ui" });

removeVAssistEmbed("chat");
removeVAssistEmbed("toolbar");
```

For multi-instance pages, do not rely on `window.VAssistEmbed.openChat()` or the other global instance helpers. Those target the default host only.

## Related

- [`@vassist/react` →](/architecture/react)
- [Configuration reference →](/architecture/configuration-reference)
