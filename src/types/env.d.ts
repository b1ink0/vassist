/**
 * @fileoverview Global environment variable type declarations
 */

declare global {
  interface Window {
    VAssistEmbed?: {
      inject: (options?: {
        target?: string | HTMLElement | null;
        hostId?: string;
        deferSetupUntilStarted?: boolean;
      }) => HTMLElement;
      remove: (hostId?: string) => void;
    };
    VAssistEmbedConfig?: {
      target?: string | HTMLElement | null;
      hostId?: string;
      deferSetupUntilStarted?: boolean;
      autoInject?: boolean;
    };
  }

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
   * True when building for Android WebView, false for other platforms
   * @constant
   */
  const __ANDROID_MODE__: boolean;

  /**
   * True when building for generic embedded usage, false otherwise
   * @constant
   */
  const __EMBED_MODE__: boolean;

  /**
   * True when building in production mode, false for development
   * @constant
   */
  const __PROD_MODE__: boolean;
}

export {};
