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
   * True when building for Android WebView, false for other platforms
   * @constant
   */
  const __ANDROID_MODE__: boolean;

  /**
   * True when building in production mode, false for development
   * @constant
   */
  const __PROD_MODE__: boolean;
}

export {};
