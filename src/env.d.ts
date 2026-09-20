import type { VAssistTestApi } from "./testing/testBridge";

import type { VAssistEmbedApi, VAssistEmbedConfig } from "./embed/config";

/**
 * Build-time environment constants
 * These are injected by Vite at build time via the `define` option
 */

interface ImportMetaEnv {
  readonly VITE_VASSIST_TEST_MODE?: string;
  readonly VITE_VASSIST_DISABLE_CAMERA?: string;
  readonly VITE_VASSIST_DISABLE_MIC?: string;
  readonly VITE_VASSIST_DISABLE_TTS?: string;
  readonly VITE_VASSIST_DISABLE_STT?: string;
  readonly VITE_VASSIST_DISABLE_HEAVY_MODEL_LOADING?: string;
  readonly VITE_VASSIST_FAKE_AI?: string;
  readonly VITE_VASSIST_FAKE_EXTENSION_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    VAssistEmbed?: VAssistEmbedApi;
    VAssistEmbedConfig?: VAssistEmbedConfig;
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

  interface Window {
    __VASSIST_TEST_API__?: VAssistTestApi;
  }
}

export {};
