# @vassist/react

React components wrapping the same runtime as `@vassist/embed`. Requires React 18 or 19.

## Entry Points

| Import                        | Components                                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| `@vassist/react`              | `VAssistEmbed` plus all public embed types, storage helpers, and resource loader registry |
| `@vassist/react/full`         | `FullVAssistEmbed` plus everything from the base entry                                    |
| `@vassist/react/chat`         | `ChatVAssistEmbed` plus everything from the base entry                                    |
| `@vassist/react/chat-toolbar` | `ChatToolbarVAssistEmbed` plus everything from the base entry                             |
| `@vassist/react/toolbar`      | `ToolbarVAssistEmbed` plus everything from the base entry                                 |

Preset entries re-export the base entry.

## Components

| Component                 | Shell mode                               |
| ------------------------- | ---------------------------------------- |
| `VAssistEmbed`            | Whatever you pass in `config.shell.mode` |
| `FullVAssistEmbed`        | `full`                                   |
| `ChatVAssistEmbed`        | `chat-only`                              |
| `ChatToolbarVAssistEmbed` | `chat-toolbar`                           |
| `ToolbarVAssistEmbed`     | `toolbar-only`                           |

```tsx
import { FullVAssistEmbed } from "@vassist/react/full";

export function Assistant() {
  return (
    <FullVAssistEmbed
      hostId="assistant"
      config={{
        storage: { mode: "namespaced", namespace: "my-app" },
        shell: { deferSetupUntilStarted: true },
      }}
    />
  );
}
```

## Props

All components accept `VAssistEmbedProps`, which extends `HTMLAttributes<HTMLDivElement>` minus `children`.

| Prop             | Type                             | Description                                                                                             |
| ---------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `config`         | `VAssistEmbedConfig`             | Reactive config for this instance                                                                       |
| `defaultConfig`  | `VAssistEmbedConfig`             | Baseline config merged underneath `config`                                                              |
| `hostId`         | `string`                         | Stable host ID. Auto-generated with `useId()` if omitted                                                |
| `customizations` | `VAssistReactCustomizations`     | React-only render hooks for header, footer, empty state, toolbar actions, settings extension, and icons |
| `style`          | `CSSProperties`                  | Style applied to the wrapper `<div>`                                                                    |
| `...rest`        | `HTMLAttributes<HTMLDivElement>` | Standard div props such as `className`, `data-*`, and `aria-*`                                          |

Use an explicit `hostId` whenever you need instance-specific control, host-scoped customizations, or predictable DOM lookup from outside the component tree.

## `config` vs `defaultConfig`

`defaultConfig` is merged first, then `config` is merged on top.

```tsx
import { VAssistEmbed, type VAssistEmbedConfig } from "@vassist/react";

function AppAssistant({ overrides }: { overrides?: VAssistEmbedConfig }) {
  return (
    <VAssistEmbed
      hostId="assistant"
      defaultConfig={{
        storage: { mode: "namespaced", namespace: "my-app" },
        shell: { deferSetupUntilStarted: true },
      }}
      config={overrides}
    />
  );
}
```

The `config` prop is reactive. Changing it between renders calls `updateVAssistEmbedConfig()` internally; you do not need to remount the component.

## Secure Host Bridge From React

```tsx
import { useMemo } from "react";
import {
  FullVAssistEmbed,
  type VAssistBinaryLike,
  type VAssistProviderBridge,
} from "@vassist/react/full";

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

export function SecureAssistant() {
  const bridge = useMemo<VAssistProviderBridge>(
    () => ({
      ai: {
        getCurrentProvider: () => "host-backend",
        async sendMessage({ messages, signal }) {
          const response = await fetch("/api/vassist/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages }),
            signal: signal ?? undefined,
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
    }),
    [],
  );

  return (
    <FullVAssistEmbed
      hostId="secure-assistant"
      config={{
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
      }}
    />
  );
}
```

The same runtime rules from `@vassist/embed` apply here:

- The bridge can implement `ai`, `tts`, `stt`, or any combination of them. All three are part of the public React package surface.
- `providers.mode: "host-managed"` changes who owns provider settings.
- `transport.mode: "host-bridge"` delegates provider I/O to your host.
- `ai.getCurrentProvider` and `tts.getCurrentProvider` should return a plain string or `null` synchronously in the current runtime.

## React Customizations

`customizations` is the React-only composition layer. It is scoped by `hostId`, registered when the component mounts, updated when props change, and cleared on unmount.

| Customization             | Context                                  | Purpose                                                    |
| ------------------------- | ---------------------------------------- | ---------------------------------------------------------- |
| `renderHeaderActions`     | `{ hostId }`                             | Add controls next to the built-in chat header actions      |
| `renderFooterContent`     | `{ hostId }`                             | Render extra content at the bottom of the chat container   |
| `renderEmptyState`        | `{ hostId }`                             | Replace or augment the built-in empty state                |
| `renderToolbarActions`    | `{ hostId }`                             | Add extra buttons to the AI toolbar                        |
| `renderSettingsExtension` | `{ hostId, activeTab, activeTarget }`    | Render extra settings UI alongside the active settings tab |
| `iconRenderers`           | `(name) => ReactNode` keyed by icon name | Replace built-in icons with React-rendered icons           |

`iconRenderers` take precedence over URL-based `branding.iconOverrides`, so React hosts can supply real components instead of image URLs.

`renderToolbarActions` is append-only. It adds extra React buttons after the built-in toolbar items. If you need to hide, whitelist, or reorder the built-in toolbar items themselves, use `config.aiToolbar` instead.

```tsx
import {
  FullVAssistEmbed,
  type VAssistEmbedElementHandle,
  type VAssistReactCustomizations,
} from "@vassist/react/full";

const hostId = "assistant";

const customizations: VAssistReactCustomizations = {
  renderHeaderActions: () => (
    <button
      type="button"
      onClick={() => {
        const host = document.getElementById(
          hostId,
        ) as VAssistEmbedElementHandle | null;
        host?.openHistory();
      }}
    >
      Recent chats
    </button>
  ),
  renderFooterContent: () => (
    <small>Answers are served by your host backend.</small>
  ),
  renderSettingsExtension: ({ activeTab, activeTarget }) => (
    <div>
      <strong>Host policy</strong>
      <div>Tab: {activeTab}</div>
      <div>Target: {activeTarget ?? "none"}</div>
    </div>
  ),
  iconRenderers: {
    settings: ({ size = 18 }) => (
      <span aria-hidden="true" style={{ fontSize: size }}>
        S
      </span>
    ),
  },
};

export function Assistant() {
  return <FullVAssistEmbed hostId={hostId} customizations={customizations} />;
}
```

For non-React hosts, use `branding.labelOverrides` and `branding.iconOverrides` instead.

## Imperative Control From React

The React component does not expose a forwarded ref to the underlying embed handle. When you need imperative control, give the component a stable `hostId` and query the DOM.

```tsx
import {
  FullVAssistEmbed,
  type VAssistEmbedElementHandle,
} from "@vassist/react/full";

const hostId = "assistant";

function openProviderSettings() {
  const host = document.getElementById(
    hostId,
  ) as VAssistEmbedElementHandle | null;
  host?.openSettings({ target: "llm.provider.select" });
}

function seedDraft() {
  const host = document.getElementById(
    hostId,
  ) as VAssistEmbedElementHandle | null;
  host?.setDraftInput("Summarize the current document.", { focus: true });
}

export function Page() {
  return (
    <>
      <button onClick={openProviderSettings}>Provider settings</button>
      <button onClick={seedDraft}>Seed draft</button>
      <FullVAssistEmbed hostId={hostId} />
    </>
  );
}
```

`window.VAssistEmbed` is still available, but it is only a good fit for the default host. Prefer explicit `hostId` lookup for multi-instance React pages.

## Multiple Instances

If you omit `hostId`, the component generates one with React `useId()`. That is fine for purely declarative usage, but explicit IDs are better when you need:

- Imperative control from outside the component tree
- Predictable host-scoped `customizations`
- Debugging with DOM inspection or runtime snapshots

```tsx
<FullVAssistEmbed hostId="main-assistant" />
<ToolbarVAssistEmbed hostId="selection-toolbar" />
```

Each instance keeps its own config, runtime state, and React customization registry entries.

## Hooks, Feature Flags, And Theme Tokens

Everything you can do through `VAssistEmbedConfig` in `@vassist/embed` works the same way in React.

```tsx
<FullVAssistEmbed
  hostId="assistant"
  config={{
    features: {
      liveAssistant3d: false,
      screenShare: false,
      camera: false,
    },
    theme: {
      mode: "dark",
      surfaceStyle: "flat",
      tokens: {
        accentColor: "#1f6feb",
        accentTextColor: "#ffffff",
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
  }}
/>
```

See the [configuration reference](/architecture/configuration-reference) for the full config surface.

## Storage And Resource Loader Re-exports

`@vassist/react` re-exports the same storage and resource loader registries as `@vassist/embed`, so you can configure them at app startup.

```tsx
import {
  createMemoryStorageAdapter,
  registerStorageAdapter,
  registerResourceLoader,
  DefaultResourceLoader,
} from "@vassist/react";
import { FullVAssistEmbed } from "@vassist/react/full";

class CdnLoader extends DefaultResourceLoader {
  override getURL(path: string): string {
    const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
    return `https://cdn.example.com/${normalizedPath}`;
  }

  override async getURLAsync(path: string): Promise<string> {
    return this.getURL(path);
  }
}

registerStorageAdapter("session", createMemoryStorageAdapter());
registerResourceLoader("cdn", new CdnLoader());

export function App() {
  return (
    <FullVAssistEmbed
      hostId="assistant"
      config={{
        storage: { mode: "host", adapter: "session" },
        assets: { resourceLoader: "cdn" },
      }}
    />
  );
}
```

## Related

- [`@vassist/embed` →](/architecture/embed) - imperative API for non-React hosts
- [Configuration reference →](/architecture/configuration-reference)
