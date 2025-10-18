/**
 * Build-time environment constants
 * These are injected by Vite at build time via the `define` option
 */

declare global {
  /**
   * True when building for Chrome Extension, false for standalone dev mode
   * @constant
   */
  const __EXTENSION_MODE__: boolean;

  /**
   * True when building for standalone dev mode, false for Chrome Extension
   * @constant
   */
  const __DEV_MODE__: boolean;
}

export {};
