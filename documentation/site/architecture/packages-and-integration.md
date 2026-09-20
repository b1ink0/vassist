# Package Integration

VAssist ships two browser packages:

- `@vassist/embed` for plain JavaScript hosts and non-React frameworks
- `@vassist/react` for React hosts

If you are embedding VAssist, the normal decision order is:

1. Pick the package and shell entry point.
2. Give the instance a stable `hostId` if you need multi-instance control.
3. Decide who owns provider settings in the UI.
4. Decide who executes AI, TTS, and STT requests.
5. Pick the control surface you will call from your host.

## Pick A Package

| Host app                                                                        | Package          | Use it when                                                                               |
| ------------------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------- |
| Plain JS, Vue, Svelte, Angular, server-rendered HTML with a small client script | `@vassist/embed` | You want imperative mount/update/remove helpers and direct element-handle control         |
| React                                                                           | `@vassist/react` | You want a component wrapper, reactive config props, and React-only render customizations |

Both packages share the same runtime, `VAssistEmbedConfig`, provider bridge types, storage registry, and resource-loader registry.

## Pick An Entry Point

Both packages ship the same entry point pattern.

| Entry suffix    | Shell you get                     | Typical use                                                |
| --------------- | --------------------------------- | ---------------------------------------------------------- |
| `/full`         | Full assistant                    | Chat + settings + history + toolbar + voice + 3D           |
| `/chat`         | Chat only                         | Embedded assistant panel without the page toolbar          |
| `/chat-toolbar` | Chat + toolbar                    | Chat UI plus the on-page toolbar                           |
| `/toolbar`      | Toolbar only                      | Selection or input-field actions without the chat shell    |
| base package    | Whatever `config.shell.mode` says | Hosts that want one import and runtime-selected shell mode |

Examples:

- `@vassist/embed/full`
- `@vassist/react/full`
- `@vassist/embed/toolbar`
- `@vassist/react`

## Install

```bash
npm install @vassist/embed
# or
npm install @vassist/react react react-dom
```

`@vassist/react` requires `react` and `react-dom` as peer dependencies.

## Plain JS Quickstart

```ts
import {
  injectFullVAssistEmbed,
  type VAssistEmbedElementHandle,
} from "@vassist/embed/full";

const hostId = "assistant";

injectFullVAssistEmbed({
  target: document.querySelector("#assistant-slot"),
  hostId,
  config: {
    storage: { mode: "namespaced", namespace: "my-app" },
    shell: { deferSetupUntilStarted: true },
  },
});

const assistant = document.getElementById(
  hostId,
) as VAssistEmbedElementHandle | null;

assistant?.openChat();
assistant?.setDraftInput("Summarize the current page.", { focus: true });
```

Use `updateVAssistEmbedConfig()` when you need to change config later without remounting the instance.

## React Quickstart

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

In React, the `config` prop is reactive. Changing it updates the mounted instance in place.

## The Two Decisions That Matter Most

The most common integration mistake is mixing up provider ownership with request execution.

| Concern               | Field(s)                                                     | What it actually changes                                                        |
| --------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Provider UI ownership | `providers.mode`, `lockProviderSelection`, `settings.policy` | Whether users can configure providers inside VAssist                            |
| Request execution     | `transport.mode`, `transport.bridge`                         | Whether the browser runtime or your host/backend performs AI, TTS, and STT work |

This means:

- `providers.mode: "host-managed"` locks down the UI model.
- `transport.mode: "host-bridge"` moves request execution to your host.
- You often want both in production.

If browser code must not hold vendor credentials, keep the real keys in your backend or native host and use `transport.mode: "host-bridge"`.

## Common Deployment Patterns

| Pattern              | Typical config                                                                               | When teams actually use it                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Browser-managed      | `providers.mode: "user-configurable"` and no `transport.bridge`                              | Internal tools, local development, prototypes                                                |
| Host-managed UI only | `providers.mode: "host-managed"` and no `transport.bridge`                                   | The host wants locked settings, but browser-side provider execution is still acceptable      |
| Secure host bridge   | `providers.mode: "host-managed"` with `transport.mode: "host-bridge"` and `transport.bridge` | Production browser deployments where your host or backend must own secrets and network calls |

## Secure Host Bridge Pattern

Use the same bridge object with either package. The config shape is identical.

```ts
import type { VAssistBinaryLike, VAssistProviderBridge } from "@vassist/embed";

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

const config = {
  providers: {
    mode: "host-managed",
    lockProviderSelection: true,
  },
  settings: {
    policy: {
      readOnly: ["llm", "tts", "stt"],
    },
  },
  transport: {
    mode: "host-bridge",
    bridge,
  },
};
```

Runtime ownership in host-bridge mode is still split:

- Your host owns provider requests and secrets.
- The VAssist runtime still owns chat UI, selection context, toolbar workflows, panel state, and theme application.
- TTS playback and queueing still happen in the browser runtime after your host returns audio.
- STT audio capture still happens in the browser runtime before bytes are passed to `stt.transcribeAudio`.

## Control Surfaces You Will Actually Use

| Need                                   | Use                                                             | Notes                                                                                            |
| -------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Mount from plain JS                    | `inject*VAssistEmbed()`                                         | Best fit for non-React hosts                                                                     |
| Mount from React                       | `VAssistEmbed` or a preset component such as `FullVAssistEmbed` | Config stays declarative                                                                         |
| Update config after mount              | React `config` prop or `updateVAssistEmbedConfig()`             | No remount required                                                                              |
| Control one specific instance          | `VAssistEmbedElementHandle`                                     | Best choice for multi-instance pages                                                             |
| Control only the default host          | `window.VAssistEmbed`                                           | Convenient, but not a multi-instance API                                                         |
| Control built-in AI toolbar items      | `aiToolbar` config                                              | Force input-focus/image-hover behavior and hide, whitelist, or reorder built-in toolbar items    |
| Lock or hide settings                  | `settings.policy`                                               | Use tab, section, field, or subtab target IDs                                                    |
| Move popovers or canvas portals        | `mount.portalContainers`                                        | Mainly useful for shadow DOM hosts and custom overlay stacks                                     |
| Replace built-in labels or icons       | `branding.labelOverrides`, `branding.iconOverrides`             | Non-React host customization path                                                                |
| Add React-only UI around the assistant | `customizations` prop                                           | Header actions, footer content, empty state, toolbar actions, settings extension, icon renderers |
| Swap persistence backend               | `storage.mode: "host"` with `storage.adapter`                   | Uses the storage adapter registry                                                                |
| Swap asset resolution                  | `assets.resourceLoader`                                         | Uses the resource loader registry                                                                |

## Options Most Hosts Touch Early

| Field                                           | Why it matters quickly                                                        |
| ----------------------------------------------- | ----------------------------------------------------------------------------- |
| `mount.hostId`                                  | Required for predictable DOM lookup and multi-instance orchestration          |
| `shell.mode`                                    | Decides whether you are embedding chat, toolbar, or the full assistant        |
| `aiToolbar`                                     | Controls where the built-in toolbar appears and which built-in items it shows |
| `settings.policy`                               | Lets you hide or lock settings without forking UI                             |
| `providers.mode`                                | Tells the runtime who owns provider setup                                     |
| `transport.bridge`                              | Lets your host own AI, TTS, and STT execution                                 |
| `theme.fontFamily` / `theme.monoFontFamily`     | Lets the host pick typography, but the host still loads the fonts             |
| `storage`                                       | Controls persistence isolation or host-owned storage                          |
| `assets.assetBaseUrl` / `assets.resourceLoader` | Controls where models, stages, motions, and other assets resolve from         |
| `branding`                                      | Lets the host change app-facing labels and icons                              |

## Recommended Reading Order

If you are integrating VAssist into a real host app, read the docs in this order:

1. This page for package choice, control surfaces, and deployment model.
2. [@vassist/embed](/architecture/embed) if your host is imperative or non-React.
3. [@vassist/react](/architecture/react) if your host is React.
4. [Configuration Reference](/architecture/configuration-reference) once you know which fields you need.

## Related

- [@vassist/embed →](/architecture/embed)
- [@vassist/react →](/architecture/react)
- [Configuration Reference →](/architecture/configuration-reference)
