/**
 * Build-time environment constants
 * These are injected by Vite at build time via the `define` option
 */

declare global {
  /**
   * True when building for Chrome Extension, false otherwise
   * @constant
   */
  const __EXTENSION_MODE__: boolean;

  /**
   * True when building for Electron Desktop app, false otherwise
   * @constant
   */
  const __DESKTOP_MODE__: boolean;

  /**
   * True when building in development mode, false for production
   * @constant
   */
  const __DEV_MODE__: boolean;

  /**
   * Electron API exposed via preload script (only available in desktop mode)
   */
  interface Window {
    electron?: {
      window: {
        minimize: () => Promise<void>;
        maximize: () => Promise<void>;
        close: () => Promise<void>;
        toggleAlwaysOnTop: () => Promise<boolean>;
        setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) => Promise<void>;
      };
      app: {
        getVersion: () => Promise<string>;
        getPlatform: () => Promise<{
          platform: string;
          arch: string;
          version: Record<string, string>;
        }>;
      };
      env: {
        isDesktop: boolean;
        isDev: boolean;
      };
    };
  }
}

export {};
