/**
 * Platform detection utilities
 */

export const isAndroid =
  typeof __ANDROID_MODE__ !== "undefined" && __ANDROID_MODE__;

export const isExtension =
  typeof __EXTENSION_MODE__ !== "undefined" && __EXTENSION_MODE__;

export const isDesktop =
  typeof __DESKTOP_MODE__ !== "undefined" && __DESKTOP_MODE__;

export const isEmbed = typeof __EMBED_MODE__ !== "undefined" && __EMBED_MODE__;

export const isProduction =
  typeof __PROD_MODE__ !== "undefined" && __PROD_MODE__;

export const isDev = !isAndroid && !isExtension && !isDesktop;

export const isInputWindow =
  isDesktop &&
  typeof window !== "undefined" &&
  window.location.search.includes("window=input");

export const isAppModeWindow =
  isDesktop &&
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("desktop-mode") === "app";

export const isLiveWallpaperWindow =
  isDesktop &&
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("desktop-mode") ===
    "live-wallpaper";

export const isDetachedDesktopWindow =
  isDesktop &&
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("desktop-controls") ===
    "detached";

export const isDetachedChatWindow =
  isDetachedDesktopWindow &&
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("desktop-role") === "chat";

export const isDetachedAvatarWindow =
  isDetachedDesktopWindow &&
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("desktop-role") === "avatar";

export const isDesktopWallpaperRendererWindow =
  isLiveWallpaperWindow && !isDetachedChatWindow;

export const isInteractiveLiveWallpaperWindow =
  isLiveWallpaperWindow &&
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("wallpaper-interaction") ===
    "interactive";

export const isScreenPicker =
  isDesktop &&
  typeof window !== "undefined" &&
  window.location.search.includes("mode=screenPicker");
