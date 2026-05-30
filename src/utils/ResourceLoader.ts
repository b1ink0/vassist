import { getEmbedConfig } from "../embed/runtimeStore";
import Logger from "../services/LoggerService";
import { isDesktop, isEmbed, isProduction } from "./PlatformUtils";
import type {
  ResourceLoaderAdapterLike,
  ResourceLoaderSelection,
} from "./resource-loader/types";

export type { ResourceLoaderAdapterLike, ResourceLoaderSelection };

export class DefaultResourceLoader implements ResourceLoaderAdapterLike {
  private isExtension: boolean;

  constructor() {
    this.isExtension = this.detectExtensionMode();
  }

  private detectExtensionMode(): boolean {
    return import.meta.url.startsWith("chrome-extension://");
  }

  setMode(isExtension: boolean): void {
    this.isExtension = isExtension;
    Logger.log(
      "ResourceLoader",
      `Mode set to: ${this.isExtension ? "Extension" : "Development"}`,
    );
  }

  private getModuleDirectoryUrl(): string {
    const currentModuleUrl = import.meta.url;
    const lastSlashIndex = currentModuleUrl.lastIndexOf("/");

    return lastSlashIndex === -1
      ? currentModuleUrl
      : currentModuleUrl.slice(0, lastSlashIndex + 1);
  }

  private normalizeRuntimePath(path: string): string | null {
    if (path.startsWith("blob:") || path.includes("://")) {
      return null;
    }

    return path.startsWith("/") ? path.slice(1) : path;
  }

  private resolveEmbedRuntimeUrl(path: string): string | null {
    if (!isEmbed) {
      return null;
    }

    const normalizedPath = this.normalizeRuntimePath(path);
    if (!normalizedPath) {
      return null;
    }

    const URLConstructor = URL;
    return new URLConstructor(
      `../${normalizedPath}`,
      this.getModuleDirectoryUrl(),
    ).toString();
  }

  private resolveRuntimeUrl(path: string): string | null {
    return this.resolveEmbedRuntimeUrl(path);
  }

  getURL(path: string): string {
    const runtimeUrl = this.resolveRuntimeUrl(path);
    if (runtimeUrl) {
      return runtimeUrl;
    }

    if (!this.isExtension) {
      return path.startsWith("/") ? path : `/${path}`;
    }

    void import("./ExtensionBridge").then(({ extensionBridge }) => {
      return extensionBridge.getResourceURL(path);
    });

    Logger.warn(
      "ResourceLoader",
      "getURL in extension mode should use getURLAsync for host-aware resolution",
    );
    return `/${path}`;
  }

  async getURLAsync(path: string): Promise<string> {
    if (!this.isExtension) {
      if (path.startsWith("blob:") || path.includes("://")) {
        return path;
      }

      const runtimeUrl = this.resolveRuntimeUrl(path);
      if (runtimeUrl) {
        return runtimeUrl;
      }

      if (isDesktop && isProduction) {
        if (path.startsWith("res/")) {
          return `../${path}`;
        }
        return path.startsWith("/") ? path.substring(1) : path;
      }

      return path.startsWith("/") ? path : `/${path}`;
    }

    const { extensionBridge } = await import("./ExtensionBridge");
    return extensionBridge.getResourceURL(path);
  }

  getModelURL(filename: string): string {
    return this.getURL(`res/models/${filename}`);
  }

  getAnimationURL(filename: string): string {
    return this.getURL(`res/animations/${filename}`);
  }

  getTextureURL(filename: string): string {
    return this.getURL(`res/textures/${filename}`);
  }

  getPrivateTestURL(type: string, filename: string): string {
    return this.getURL(`res/private_test/${type}/${filename}`);
  }

  isExtensionMode(): boolean {
    return this.isExtension;
  }

  async loadJSON<T = Record<string, unknown>>(path: string): Promise<T> {
    const url = await this.getURLAsync(path);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Failed to load JSON from ${url}: ${response.statusText}`,
      );
    }

    return response.json() as Promise<T>;
  }

  async loadText(path: string): Promise<string> {
    const url = await this.getURLAsync(path);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Failed to load text from ${url}: ${response.statusText}`,
      );
    }

    return response.text();
  }

  async loadBinary(path: string): Promise<ArrayBuffer> {
    const url = await this.getURLAsync(path);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Failed to load binary from ${url}: ${response.statusText}`,
      );
    }

    return response.arrayBuffer();
  }

  async preloadResources(paths: string[]): Promise<ArrayBuffer[]> {
    return Promise.all(paths.map((path) => this.loadBinary(path)));
  }
}

const builtinResourceLoader = new DefaultResourceLoader();
const registeredResourceLoaders = new Map<string, ResourceLoaderAdapterLike>([
  ["default", builtinResourceLoader],
  ["builtin", builtinResourceLoader],
]);

let defaultResourceLoaderSelection: ResourceLoaderSelection = "default";

export function registerResourceLoader(
  name: string,
  loader: ResourceLoaderAdapterLike,
): void {
  registeredResourceLoaders.set(name, loader);
}

export function getRegisteredResourceLoader(
  name: string,
): ResourceLoaderAdapterLike | undefined {
  return registeredResourceLoaders.get(name);
}

export function listRegisteredResourceLoaders(): string[] {
  return Array.from(registeredResourceLoaders.keys());
}

export function resolveResourceLoader(
  selection?: ResourceLoaderSelection,
): ResourceLoaderAdapterLike {
  const resolvedSelection = selection ?? defaultResourceLoaderSelection;

  if (typeof resolvedSelection === "string") {
    const loader = registeredResourceLoaders.get(resolvedSelection);
    if (!loader) {
      throw new Error(`Unknown resource loader: ${resolvedSelection}`);
    }
    return loader;
  }

  return resolvedSelection;
}

export function setDefaultResourceLoader(
  selection: ResourceLoaderSelection,
): void {
  defaultResourceLoaderSelection = selection;
}

function getConfiguredResourceLoader(): ResourceLoaderAdapterLike {
  return resolveResourceLoader(getEmbedConfig().assets.resourceLoader);
}

export const resourceLoader: ResourceLoaderAdapterLike = {
  setMode(isExtension: boolean) {
    getConfiguredResourceLoader().setMode?.(isExtension);
  },
  getURL(path: string) {
    return getConfiguredResourceLoader().getURL(path);
  },
  getURLAsync(path: string) {
    return getConfiguredResourceLoader().getURLAsync(path);
  },
  getModelURL(filename: string) {
    return getConfiguredResourceLoader().getModelURL(filename);
  },
  getAnimationURL(filename: string) {
    return getConfiguredResourceLoader().getAnimationURL(filename);
  },
  getTextureURL(filename: string) {
    return getConfiguredResourceLoader().getTextureURL(filename);
  },
  getPrivateTestURL(type: string, filename: string) {
    return getConfiguredResourceLoader().getPrivateTestURL(type, filename);
  },
  isExtensionMode() {
    return getConfiguredResourceLoader().isExtensionMode();
  },
  loadJSON<T = Record<string, unknown>>(path: string) {
    return getConfiguredResourceLoader().loadJSON<T>(path);
  },
  loadText(path: string) {
    return getConfiguredResourceLoader().loadText(path);
  },
  loadBinary(path: string) {
    return getConfiguredResourceLoader().loadBinary(path);
  },
  preloadResources(paths: string[]) {
    return getConfiguredResourceLoader().preloadResources(paths);
  },
};

export { builtinResourceLoader };

export default resourceLoader;
