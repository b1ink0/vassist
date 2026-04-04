/**
 * Platform detection utilities
 */

export const isAndroid = typeof __ANDROID_MODE__ !== 'undefined' && __ANDROID_MODE__;

export const isExtension = typeof __EXTENSION_MODE__ !== 'undefined' && __EXTENSION_MODE__;

export const isDesktop = typeof __DESKTOP_MODE__ !== 'undefined' && __DESKTOP_MODE__;

export const isProduction = typeof __PROD_MODE__ !== 'undefined' && __PROD_MODE__;

export const isDev = !isAndroid && !isExtension && !isDesktop;

export const isInputWindow = isDesktop && typeof window !== 'undefined' && window.location.search.includes('window=input');

export const isScreenPicker = isDesktop && typeof window !== 'undefined' && window.location.search.includes('mode=screenPicker');
