export interface ResourceLoaderAdapterLike {
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

export type ResourceLoaderSelection = string | ResourceLoaderAdapterLike;
