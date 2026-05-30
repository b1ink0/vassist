import {
  useAppStoreApi,
  useAppStoreSelector,
} from "../contexts/AppRuntimeContext";
import {
  appStore,
  createAppStore,
  getDesktopApi,
  syncAppSpeakingFromConversationState,
  ConversationStates,
  isDesktop,
  isInputWindow,
  isScreenPicker,
  type AppPositionManager,
  type AppStore,
  type AppStoreState,
  type ChatMessageItem,
  type PendingDropData,
  type PendingDropValue,
} from "./createAppStore";

export const useAppStore = <T>(selector: (state: AppStoreState) => T): T =>
  useAppStoreSelector(selector);

export {
  appStore,
  createAppStore,
  getDesktopApi,
  syncAppSpeakingFromConversationState,
};
export { ConversationStates, isDesktop, isInputWindow, isScreenPicker };
export { useAppStoreApi };
export type {
  AppPositionManager,
  AppStore,
  AppStoreState,
  ChatMessageItem,
  PendingDropData,
  PendingDropValue,
};
