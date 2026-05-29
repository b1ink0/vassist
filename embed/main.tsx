import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "../src/App";
import appStyles from "../src/index.css?inline";
import { VASSIST_REACT_ROOT_ID } from "../src/utils/VAssistDomIds";

const elementTagName = "vassist-embed";
const defaultHostId = "vassist-embed-root";
const deferSetupAttributeName = "defer-setup-until-started";

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

.vassist-embed-shadow-root {
  width: 100%;
  height: 100vh;
  pointer-events: auto;
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

.virtual-assistant-container {
  isolation: isolate;
}
`;

type MountedState = {
  root: Root;
};

type InjectOptions = {
  target?: string | HTMLElement | null;
  hostId?: string;
  deferSetupUntilStarted?: boolean;
};

type GlobalEmbedConfig = InjectOptions & {
  autoInject?: boolean;
};

function shouldDeferSetupUntilStarted(hostElement: HTMLElement): boolean {
  const attributeValue = hostElement.getAttribute(deferSetupAttributeName);
  if (attributeValue === null) {
    return false;
  }

  return !["0", "false", "no", "off"].includes(attributeValue.toLowerCase());
}

function getGlobalEmbedConfig(): GlobalEmbedConfig {
  if (typeof window === "undefined") {
    return {};
  }

  return window.VAssistEmbedConfig || {};
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

class VAssistEmbedElement extends HTMLElement {
  private mountedState: MountedState | null = null;

  connectedCallback() {
    if (this.mountedState) {
      return;
    }

    const shadowRoot = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    const styleElement = document.createElement("style");
    const mountElement = document.createElement("div");

    styleElement.textContent = `${hostStyles}\n${appStyles}`;
    mountElement.id = VASSIST_REACT_ROOT_ID;
    mountElement.className = "vassist-embed-shadow-root";

    shadowRoot.replaceChildren(styleElement, mountElement);

    const deferSetupUntilStarted = shouldDeferSetupUntilStarted(this);

    const root = createRoot(mountElement);
    root.render(
      <StrictMode>
        <App
          mode="development"
          embedded={true}
          deferSetupUntilStarted={deferSetupUntilStarted}
        />
      </StrictMode>,
    );

    this.mountedState = { root };
  }

  disconnectedCallback() {
    this.mountedState?.root.unmount();
    this.mountedState = null;
    this.shadowRoot?.replaceChildren();
  }
}

export function defineVAssistEmbedElement(): string {
  if (!customElements.get(elementTagName)) {
    customElements.define(elementTagName, VAssistEmbedElement);
  }

  return elementTagName;
}

export function injectVAssistEmbed(options: InjectOptions = {}): HTMLElement {
  defineVAssistEmbedElement();

  const hostId = options.hostId ?? defaultHostId;
  const existingHost = document.getElementById(hostId);
  if (existingHost) {
    return existingHost;
  }

  const targetElement = resolveTarget(options.target);
  const hostElement = document.createElement(elementTagName);
  hostElement.id = hostId;
  if (options.deferSetupUntilStarted) {
    hostElement.setAttribute(deferSetupAttributeName, "true");
  }
  targetElement.appendChild(hostElement);
  return hostElement;
}

export function removeVAssistEmbed(hostId = defaultHostId): void {
  document.getElementById(hostId)?.remove();
}

defineVAssistEmbedElement();

if (typeof window !== "undefined") {
  window.VAssistEmbed = {
    inject: injectVAssistEmbed,
    remove: removeVAssistEmbed,
  };

  if (typeof document !== "undefined") {
    const globalConfig = getGlobalEmbedConfig();
    if (globalConfig.autoInject !== false) {
      injectVAssistEmbed(globalConfig);
    }
  }
}
