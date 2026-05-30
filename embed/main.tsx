import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "../src/App";
import {
  DEFAULT_VASSIST_EMBED_HOST_ID,
  mergeVAssistEmbedConfig,
  normalizeVAssistEmbedConfig,
  type ResolvedVAssistEmbedConfig,
  type VAssistEmbedApi,
  type VAssistEmbedConfig,
  type VAssistEmbedElementHandle,
  type VAssistEmbedHooks,
  type VAssistEmbedInjectOptions,
  type VAssistMessageEventPayload,
} from "../src/embed/config";
import { setEmbedConfig } from "../src/embed/runtimeStore";
import appStyles from "../src/index.css?inline";
import type { AppStore } from "../src/stores/createAppStore";
import { VASSIST_REACT_ROOT_ID } from "../src/utils/VAssistDomIds";

const elementTagName = "vassist-embed";
const deferSetupAttributeName = "defer-setup-until-started";
const iframeRuntimeFlag = "__VASSIST_EMBED_IFRAME_RUNTIME__";
const childApiReadyTimeoutMs = 15000;
let iframeRuntimeStore: AppStore | null = null;
const EmbedHTMLElement = (globalThis.HTMLElement ??
  class {}) as typeof HTMLElement;

const hostStyles = `
:host {
  all: initial;
  display: block;
  position: fixed;
  inset: 0;
  z-index: 9998;
  pointer-events: none;
  overflow: visible;
  isolation: isolate;
  color-scheme: dark;
}

:host,
:host *,
:host *::before,
:host *::after {
  box-sizing: border-box;
}

.vassist-embed-shadow-root,
.vassist-embed-frame {
  width: 100%;
  height: 100vh;
  pointer-events: auto;
}

.vassist-embed-shadow-root {
  font-family: system-ui, Avenir, Helvetica, Arial, sans-serif;
  line-height: 1.5;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.87);
  background: transparent;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.vassist-embed-frame {
  display: block;
  border: 0;
  background: transparent;
}

.virtual-assistant-container {
  isolation: isolate;
}
`;

type EmbedHostEventName =
  | "ready"
  | "open"
  | "close"
  | "require-setup"
  | "message"
  | "message-sent"
  | "message-received";

type MountedState = {
  root: Root;
  mountElement: HTMLElement;
  store: AppStore | null;
};

type ChildRuntimeWindow = Window & {
  VAssistEmbed?: VAssistEmbedApi;
  VAssistEmbedConfig?: VAssistEmbedConfig;
  [iframeRuntimeFlag]?: boolean;
};

type IframeState = {
  iframe: HTMLIFrameElement;
  readyPromise: Promise<ChildRuntimeWindow>;
};

function isIframeRuntime(targetWindow?: Window | null): boolean {
  const runtimeWindow =
    targetWindow ??
    (typeof window !== "undefined" ? (window as Window | null) : null);

  if (!runtimeWindow) {
    return false;
  }

  return Boolean((runtimeWindow as ChildRuntimeWindow)[iframeRuntimeFlag]);
}

function shouldDeferSetupUntilStarted(hostElement: HTMLElement): boolean {
  const attributeValue = hostElement.getAttribute(deferSetupAttributeName);
  if (attributeValue === null) {
    return false;
  }

  return !["0", "false", "no", "off"].includes(attributeValue.toLowerCase());
}

function toLegacyConfig(value: unknown): VAssistEmbedConfig {
  if (!value || typeof value !== "object") {
    return {};
  }

  const candidate = value as Record<string, unknown>;

  return {
    mount: {
      ...(candidate.target !== undefined
        ? { target: candidate.target as string | HTMLElement | null }
        : {}),
      ...(typeof candidate.hostId === "string"
        ? { hostId: candidate.hostId }
        : {}),
      ...(typeof candidate.autoInject === "boolean"
        ? { autoInject: candidate.autoInject }
        : {}),
    },
    ...(typeof candidate.deferSetupUntilStarted === "boolean"
      ? {
          shell: {
            deferSetupUntilStarted: candidate.deferSetupUntilStarted,
          },
          setup: {
            mode: candidate.deferSetupUntilStarted ? "deferred" : "full",
          },
        }
      : {}),
  };
}

function getGlobalEmbedConfig(): VAssistEmbedConfig {
  if (typeof window === "undefined") {
    return {};
  }

  const rawConfig = window.VAssistEmbedConfig;
  return mergeVAssistEmbedConfig(
    (rawConfig as VAssistEmbedConfig) || {},
    toLegacyConfig(rawConfig),
  );
}

function hasGlobalEmbedConfig(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return typeof window.VAssistEmbedConfig !== "undefined";
}

function resolveTarget(target?: string | HTMLElement | null): HTMLElement {
  if (!target) {
    return document.body;
  }

  if (typeof target === "string") {
    const resolvedTarget = document.querySelector<HTMLElement>(target);
    if (!resolvedTarget) {
      throw new Error(`VAssist embed target not found: ${target}`);
    }
    return resolvedTarget;
  }

  return target;
}

function resolveInjectConfig(
  options: VAssistEmbedInjectOptions = {},
): VAssistEmbedConfig {
  const legacyConfig: VAssistEmbedConfig = {
    mount: {
      ...(options.target !== undefined ? { target: options.target } : {}),
      ...(options.hostId ? { hostId: options.hostId } : {}),
    },
    ...(options.deferSetupUntilStarted !== undefined
      ? {
          shell: {
            deferSetupUntilStarted: options.deferSetupUntilStarted,
          },
          setup: {
            mode: options.deferSetupUntilStarted ? "deferred" : "full",
          },
        }
      : {}),
  };

  return mergeVAssistEmbedConfig(options.config ?? {}, legacyConfig);
}

function getResolvedElementConfig(
  currentConfig: VAssistEmbedConfig,
  hostElement: HTMLElement,
): ResolvedVAssistEmbedConfig {
  const attributeConfig = shouldDeferSetupUntilStarted(hostElement)
    ? {
        shell: { deferSetupUntilStarted: true },
        setup: { mode: "deferred" as const },
      }
    : {};

  return normalizeVAssistEmbedConfig(
    mergeVAssistEmbedConfig(currentConfig, attributeConfig),
  );
}

function attachDirectMountContainer(
  hostElement: HTMLElement,
  shadowMode: "open" | "closed" | false,
): HTMLElement {
  const styleElement = document.createElement("style");
  const mountElement = document.createElement("div");

  styleElement.textContent = `${hostStyles}\n${appStyles}`;
  mountElement.id = VASSIST_REACT_ROOT_ID;
  mountElement.className = "vassist-embed-shadow-root";

  if (shadowMode === false) {
    hostElement.replaceChildren(styleElement, mountElement);
    return mountElement;
  }

  const shadowRoot =
    hostElement.shadowRoot ?? hostElement.attachShadow({ mode: shadowMode });
  shadowRoot.replaceChildren(styleElement, mountElement);
  return mountElement;
}

function attachIsolatedIframe(
  hostElement: HTMLElement,
  shadowMode: "open" | "closed" | false,
): HTMLIFrameElement {
  const styleElement = document.createElement("style");
  const iframeElement = document.createElement("iframe");

  styleElement.textContent = hostStyles;
  iframeElement.className = "vassist-embed-frame";
  iframeElement.title = "VAssist Embed";
  iframeElement.setAttribute(
    "allow",
    "microphone *; camera *; display-capture *",
  );

  if (shadowMode === false) {
    hostElement.replaceChildren(styleElement, iframeElement);
    return iframeElement;
  }

  const shadowRoot =
    hostElement.shadowRoot ?? hostElement.attachShadow({ mode: shadowMode });
  shadowRoot.replaceChildren(styleElement, iframeElement);
  return iframeElement;
}

function waitForChildEmbedApi(
  childWindow: ChildRuntimeWindow,
): Promise<ChildRuntimeWindow> {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      if (childWindow.VAssistEmbed) {
        resolve(childWindow);
        return;
      }

      if (Date.now() - startedAt >= childApiReadyTimeoutMs) {
        reject(new Error("Timed out waiting for isolated VAssist runtime"));
        return;
      }

      window.setTimeout(check, 16);
    };

    check();
  });
}

async function initializeChildRuntime(
  iframeElement: HTMLIFrameElement,
): Promise<ChildRuntimeWindow> {
  const childWindow = iframeElement.contentWindow as ChildRuntimeWindow | null;
  const childDocument = iframeElement.contentDocument;

  if (!childWindow || !childDocument) {
    throw new Error("Failed to access isolated iframe runtime");
  }

  childWindow[iframeRuntimeFlag] = true;
  childWindow.VAssistEmbedConfig = {
    mount: {
      autoInject: false,
    },
  };

  const { documentElement, head, body } = childDocument;
  documentElement.style.margin = "0";
  documentElement.style.width = "100%";
  documentElement.style.height = "100%";

  body.style.margin = "0";
  body.style.width = "100%";
  body.style.height = "100%";
  body.style.overflow = "hidden";
  body.style.background = "transparent";
  body.replaceChildren();

  if (!head.querySelector(`script[src="${import.meta.url}"]`)) {
    const scriptElement = childDocument.createElement("script");
    scriptElement.type = "module";
    scriptElement.src = import.meta.url;
    head.appendChild(scriptElement);
  }

  return waitForChildEmbedApi(childWindow);
}

function dispatchParentEmbedEvent(
  hostId: string,
  eventName: EmbedHostEventName,
  detail?: VAssistMessageEventPayload,
): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(
      `vassist:${eventName}`,
      detail === undefined ? undefined : { detail },
    ),
  );
  window.dispatchEvent(
    new CustomEvent(
      `vassist:${eventName}:${hostId}`,
      detail === undefined ? undefined : { detail },
    ),
  );
}

function createHookBridge(
  hooks: VAssistEmbedHooks | undefined,
  hostId: string,
): VAssistEmbedHooks {
  return {
    onReady: () => {
      hooks?.onReady?.();
      dispatchParentEmbedEvent(hostId, "ready");
    },
    onOpen: () => {
      hooks?.onOpen?.();
      dispatchParentEmbedEvent(hostId, "open");
    },
    onClose: () => {
      hooks?.onClose?.();
      dispatchParentEmbedEvent(hostId, "close");
    },
    onRequireSetup: () => {
      hooks?.onRequireSetup?.();
      dispatchParentEmbedEvent(hostId, "require-setup");
    },
    onMessage: (payload) => {
      hooks?.onMessage?.(payload);
      dispatchParentEmbedEvent(hostId, "message", payload);
    },
    onMessageSent: (payload) => {
      hooks?.onMessageSent?.(payload);
      dispatchParentEmbedEvent(hostId, "message-sent", payload);
    },
    onMessageReceived: (payload) => {
      hooks?.onMessageReceived?.(payload);
      dispatchParentEmbedEvent(hostId, "message-received", payload);
    },
  };
}

function resolveChildStorageConfig(
  config: VAssistEmbedConfig,
  resolvedConfig: ResolvedVAssistEmbedConfig,
): VAssistEmbedConfig["storage"] | undefined {
  const configuredStorage = config.storage;

  if (config.storage?.mode) {
    return configuredStorage;
  }

  if (config.storage?.namespace) {
    return {
      ...configuredStorage,
      mode: "namespaced",
      namespace: config.storage.namespace,
    };
  }

  if (resolvedConfig.mount.hostId !== DEFAULT_VASSIST_EMBED_HOST_ID) {
    return {
      ...configuredStorage,
      mode: "namespaced",
      namespace: resolvedConfig.mount.hostId,
    };
  }

  return configuredStorage;
}

function createChildRuntimeConfig(
  config: VAssistEmbedConfig,
  resolvedConfig: ResolvedVAssistEmbedConfig,
): VAssistEmbedConfig {
  const storage = resolveChildStorageConfig(config, resolvedConfig);

  return mergeVAssistEmbedConfig(config, {
    mount: {
      target: null,
      hostId: resolvedConfig.mount.hostId,
      shadowRoot: resolvedConfig.mount.shadowRoot,
      autoInject: false,
      runtimeIsolation: "shadow-root",
    },
    shell: {
      mode: resolvedConfig.shell.mode,
      deferSetupUntilStarted: resolvedConfig.shell.deferSetupUntilStarted,
      forcePortraitMode: resolvedConfig.shell.forcePortraitMode,
    },
    features: resolvedConfig.features,
    settings: resolvedConfig.settings,
    setup: {
      mode: resolvedConfig.setup.mode,
      allowedSteps: resolvedConfig.setup.allowedSteps,
    },
    providers: resolvedConfig.providers,
    assets: resolvedConfig.assets,
    transport: resolvedConfig.transport,
    hooks: createHookBridge(config.hooks, resolvedConfig.mount.hostId),
    ...(storage !== undefined ? { storage } : {}),
  });
}

function getHostElement(
  hostId = DEFAULT_VASSIST_EMBED_HOST_ID,
): VAssistEmbedElementHandle | null {
  return document.getElementById(hostId) as VAssistEmbedElementHandle | null;
}

function runGlobalHostCommand(
  command: (hostElement: VAssistEmbedElementHandle) => void,
): void {
  const hostElement = getHostElement();
  if (!hostElement) {
    return;
  }

  command(hostElement);
}

class VAssistEmbedElement
  extends EmbedHTMLElement
  implements VAssistEmbedElementHandle
{
  private mountedState: MountedState | null = null;

  private iframeState: IframeState | null = null;

  private currentConfig: VAssistEmbedConfig = {};

  private renderVersion = 0;

  private forceDirectMount = false;

  private resetRenderedContent() {
    this.mountedState?.root.unmount();
    this.mountedState = null;
    this.iframeState = null;
    this.shadowRoot?.replaceChildren();
    this.replaceChildren();
  }

  connectedCallback() {
    this.renderApp();
  }

  disconnectedCallback() {
    this.teardown();
  }

  setConfig(config: VAssistEmbedConfig) {
    this.currentConfig = mergeVAssistEmbedConfig(this.currentConfig, config);
    this.renderApp();
  }

  getConfig(): ResolvedVAssistEmbedConfig {
    return getResolvedElementConfig(this.currentConfig, this);
  }

  openChat() {
    if (this.iframeState && !this.forceDirectMount) {
      void this.runChildCommand((api) => {
        api.openChat();
      });
      return;
    }

    this.mountedState?.store?.getState().openChat();
  }

  closeChat() {
    if (this.iframeState && !this.forceDirectMount) {
      void this.runChildCommand((api) => {
        api.closeChat();
      });
      return;
    }

    this.mountedState?.store?.getState().closeChat();
  }

  toggleVisibility() {
    if (this.iframeState && !this.forceDirectMount) {
      void this.runChildCommand((api) => {
        api.toggleVisibility();
      });
      return;
    }

    this.mountedState?.store?.getState().toggleChat();
  }

  resetSession() {
    if (this.iframeState && !this.forceDirectMount) {
      void this.runChildCommand((api) => {
        api.resetSession();
      });
      return;
    }

    void this.mountedState?.store?.getState().clearChat();
  }

  private teardown() {
    this.resetRenderedContent();
  }

  private renderApp() {
    const resolvedConfig = getResolvedElementConfig(this.currentConfig, this);
    const shouldUseIsolatedRuntime =
      !isIframeRuntime() &&
      !this.forceDirectMount &&
      resolvedConfig.mount.runtimeIsolation === "iframe";

    if (shouldUseIsolatedRuntime) {
      if (this.mountedState) {
        this.resetRenderedContent();
      }
      this.renderIsolatedApp(resolvedConfig);
      return;
    }

    if (this.iframeState) {
      this.resetRenderedContent();
    }

    this.renderDirectApp(resolvedConfig);
  }

  private renderDirectApp(resolvedConfig: ResolvedVAssistEmbedConfig) {
    if (!this.mountedState) {
      const mountElement = attachDirectMountContainer(
        this,
        resolvedConfig.mount.shadowRoot,
      );
      this.mountedState = {
        root: createRoot(mountElement),
        mountElement,
        store: null,
      };
    }

    setEmbedConfig(this.currentConfig, resolvedConfig.mount.hostId);
    this.mountedState.root.render(
      <StrictMode>
        <App
          mode="development"
          embedded={true}
          embedConfig={resolvedConfig}
          onStoreReady={(store) => {
            iframeRuntimeStore = store;
            if (this.mountedState) {
              this.mountedState.store = store;
            }
          }}
        />
      </StrictMode>,
    );
  }

  private renderIsolatedApp(resolvedConfig: ResolvedVAssistEmbedConfig) {
    if (!this.iframeState) {
      const iframeElement = attachIsolatedIframe(
        this,
        resolvedConfig.mount.shadowRoot,
      );
      this.iframeState = {
        iframe: iframeElement,
        readyPromise: initializeChildRuntime(iframeElement),
      };
    }

    const currentRenderVersion = ++this.renderVersion;
    void this.syncChildRuntime(currentRenderVersion, resolvedConfig);
  }

  private async syncChildRuntime(
    renderVersion: number,
    resolvedConfig: ResolvedVAssistEmbedConfig,
  ) {
    if (!this.iframeState) {
      return;
    }

    try {
      const childWindow = await this.iframeState.readyPromise;
      if (renderVersion !== this.renderVersion || !this.isConnected) {
        return;
      }

      const childApi = childWindow.VAssistEmbed;
      if (!childApi) {
        throw new Error("Isolated VAssist runtime API is unavailable");
      }

      const childConfig = createChildRuntimeConfig(
        this.currentConfig,
        resolvedConfig,
      );
      const updatedHost = childApi.updateConfig(
        childConfig,
        resolvedConfig.mount.hostId,
      );

      if (!updatedHost) {
        childApi.inject({ config: childConfig });
      }
    } catch (error) {
      console.error(
        "VAssist embed failed to initialize isolated runtime, falling back to direct mount.",
        error,
      );
      this.forceDirectMount = true;
      this.iframeState = null;
      this.shadowRoot?.replaceChildren();
      this.replaceChildren();
      this.renderDirectApp(resolvedConfig);
    }
  }

  private async runChildCommand(
    command: (api: VAssistEmbedApi) => void,
  ): Promise<void> {
    if (!this.iframeState) {
      return;
    }

    try {
      const childWindow = await this.iframeState.readyPromise;
      const childApi = childWindow.VAssistEmbed;
      if (!childApi) {
        return;
      }

      command(childApi);
    } catch (error) {
      console.error("VAssist embed iframe command failed.", error);
    }
  }
}

export function defineVAssistEmbedElement(): string {
  if (typeof customElements === "undefined") {
    return elementTagName;
  }

  if (!customElements.get(elementTagName)) {
    customElements.define(elementTagName, VAssistEmbedElement);
  }

  return elementTagName;
}

export function createVAssistShadowRootMount(
  config: VAssistEmbedConfig = {},
): VAssistEmbedElementHandle {
  defineVAssistEmbedElement();

  const hostElement = document.createElement(
    elementTagName,
  ) as VAssistEmbedElementHandle;
  const resolvedConfig = normalizeVAssistEmbedConfig(config);
  hostElement.id = resolvedConfig.mount.hostId;
  hostElement.setConfig(config);
  return hostElement;
}

export function injectVAssistEmbed(
  options: VAssistEmbedInjectOptions = {},
): HTMLElement {
  defineVAssistEmbedElement();

  const config = resolveInjectConfig(options);
  const resolvedConfig = normalizeVAssistEmbedConfig(config);
  const hostId = resolvedConfig.mount.hostId;
  const existingHost = document.getElementById(
    hostId,
  ) as VAssistEmbedElementHandle | null;

  if (existingHost) {
    existingHost.setConfig(config);
    const targetElement = resolveTarget(resolvedConfig.mount.target);
    if (existingHost.parentElement !== targetElement) {
      targetElement.appendChild(existingHost);
    }
    return existingHost;
  }

  const targetElement = resolveTarget(resolvedConfig.mount.target);
  const hostElement = createVAssistShadowRootMount(config);
  if (resolvedConfig.shell.deferSetupUntilStarted) {
    hostElement.setAttribute(deferSetupAttributeName, "true");
  }
  targetElement.appendChild(hostElement);
  return hostElement;
}

export function updateVAssistEmbedConfig(
  config: VAssistEmbedConfig,
  hostId = DEFAULT_VASSIST_EMBED_HOST_ID,
): HTMLElement | null {
  const targetHostId = config.mount?.hostId ?? hostId;
  const hostElement = document.getElementById(
    targetHostId,
  ) as VAssistEmbedElementHandle | null;

  if (!hostElement) {
    return null;
  }

  hostElement.setConfig(config);
  return hostElement;
}

export function removeVAssistEmbed(
  hostId = DEFAULT_VASSIST_EMBED_HOST_ID,
): void {
  document.getElementById(hostId)?.remove();
}

defineVAssistEmbedElement();

if (typeof window !== "undefined") {
  window.VAssistEmbed = {
    inject: injectVAssistEmbed,
    remove: removeVAssistEmbed,
    updateConfig: updateVAssistEmbedConfig,
    openChat: () => {
      if (isIframeRuntime()) {
        iframeRuntimeStore?.getState().openChat();
        return;
      }

      runGlobalHostCommand((hostElement) => {
        hostElement.openChat();
      });
    },
    closeChat: () => {
      if (isIframeRuntime()) {
        iframeRuntimeStore?.getState().closeChat();
        return;
      }

      runGlobalHostCommand((hostElement) => {
        hostElement.closeChat();
      });
    },
    toggleVisibility: () => {
      if (isIframeRuntime()) {
        iframeRuntimeStore?.getState().toggleChat();
        return;
      }

      runGlobalHostCommand((hostElement) => {
        hostElement.toggleVisibility();
      });
    },
    resetSession: () => {
      if (isIframeRuntime()) {
        void iframeRuntimeStore?.getState().clearChat();
        return;
      }

      runGlobalHostCommand((hostElement) => {
        hostElement.resetSession();
      });
    },
  } satisfies VAssistEmbedApi;

  if (typeof document !== "undefined" && hasGlobalEmbedConfig()) {
    const globalConfig = getGlobalEmbedConfig();
    if (normalizeVAssistEmbedConfig(globalConfig).mount.autoInject !== false) {
      injectVAssistEmbed({ config: globalConfig });
    }
  }
}
