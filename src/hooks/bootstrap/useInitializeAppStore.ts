import { useCallback, useEffect, useRef } from "react";
import type { ResolvedVAssistEmbedConfig } from "../../embed/config";
import Logger from "../../services/LoggerService";
import VoiceConversationService, {
  ConversationStates,
} from "../../services/VoiceConversationService";
import { TTSServiceProxy } from "../../services/proxies";
import { useAppStore, useAppStoreApi } from "../../stores/useAppStore";
import { useConfigStore } from "../../stores/useConfigStore";
import { useDesktopStore } from "../../stores/useDesktopStore";
import {
  isDesktop,
  isInputWindow,
  isScreenPicker,
} from "../../utils/PlatformUtils";

const parseKeyEvent = (event: KeyboardEvent): string | null => {
  const modifiers = [];
  let mainKey = event.key;

  if (["Control", "Alt", "Shift", "Meta"].includes(mainKey)) {
    return null;
  }

  if (event.ctrlKey) modifiers.push("Ctrl");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  if (event.metaKey) modifiers.push("Meta");

  if (mainKey.length === 1) {
    mainKey = mainKey.toUpperCase();
  }

  return [...modifiers, mainKey].join("+");
};

export function useInitializeAppStore(
  embedConfig?: ResolvedVAssistEmbedConfig,
) {
  const appStore = useAppStoreApi();
  const api = useDesktopStore((state) => state.api);
  const isVoiceMode = useAppStore((state) => state.isVoiceMode);
  const isAssistantReady = useAppStore((state) => state.isAssistantReady);
  const isConfigLoading = useConfigStore((state) => state.isConfigLoading);
  const uiConfig = useConfigStore((state) => state.uiConfig);
  const hasNotifiedFrontendReadyRef = useRef(false);

  const notifyFrontendReady = useCallback(
    (reason: string) => {
      if (
        !__DESKTOP_MODE__ ||
        isInputWindow ||
        isScreenPicker ||
        !api?.window?.frontendReady ||
        hasNotifiedFrontendReadyRef.current
      ) {
        return;
      }

      api.window
        .frontendReady()
        .then(() => {
          hasNotifiedFrontendReadyRef.current = true;
          Logger.log(
            "AppBootstrap",
            `Notified Electron that frontend is ready (${reason})`,
          );
        })
        .catch((error) => {
          Logger.error(
            "AppBootstrap",
            `Failed to notify Electron frontend ready (${reason}):`,
            error,
          );
        });
    },
    [api],
  );

  useEffect(() => {
    if (isConfigLoading) {
      return;
    }

    if (uiConfig.enableModelLoading !== false) {
      return;
    }

    const timer = setTimeout(() => {
      appStore.setState({
        isAssistantReady: true,
        isChatUIReady: true,
      });
      Logger.log("AppBootstrap", "Running in chat-only mode (no 3D model)");
    }, 800);

    return () => clearTimeout(timer);
  }, [
    appStore,
    embedConfig?.features.liveAssistant3d,
    isConfigLoading,
    uiConfig.enableModelLoading,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => {
      notifyFrontendReady("startup");
    }, 300);

    return () => clearTimeout(timer);
  }, [notifyFrontendReady]);

  useEffect(() => {
    if (!isAssistantReady) {
      return;
    }

    notifyFrontendReady("assistant-ready");
  }, [isAssistantReady, notifyFrontendReady]);

  useEffect(() => {
    if (
      isConfigLoading ||
      !isDesktop ||
      !api?.window?.setNativeDevToolsEnabled
    ) {
      return;
    }

    const enabled = uiConfig?.nativeDevTools === true;

    api.window.setNativeDevToolsEnabled(enabled).catch((error) => {
      Logger.error(
        "AppBootstrap",
        "Failed to sync native Electron DevTools setting:",
        error,
      );
    });
  }, [api, isConfigLoading, uiConfig?.nativeDevTools]);

  useEffect(() => {
    if (isInputWindow) {
      return;
    }

    const handleStateChange = (state: string) => {
      appStore.setState({
        isSpeaking: state === ConversationStates.SPEAKING,
      });
    };

    VoiceConversationService.setStateChangeCallback(handleStateChange);

    return () => {
      VoiceConversationService.setStateChangeCallback(null);
    };
  }, [appStore]);

  useEffect(() => {
    if (isVoiceMode) {
      return;
    }

    const interval = setInterval(() => {
      const isPlaying = TTSServiceProxy.isCurrentlyPlaying();
      appStore.setState((state) =>
        state.isSpeaking === isPlaying ? state : { isSpeaking: isPlaying },
      );
    }, 100);

    return () => clearInterval(interval);
  }, [appStore, isVoiceMode]);

  useEffect(() => {
    if (isDesktop || !uiConfig?.shortcuts?.enabled) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const combo = parseKeyEvent(event);
      if (!combo) {
        return;
      }

      const shortcuts = useConfigStore.getState().uiConfig.shortcuts;
      if (!shortcuts) {
        return;
      }

      if (shortcuts.openChat && combo === shortcuts.openChat) {
        if (embedConfig && !embedConfig.features.chat) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        appStore.getState().toggleChat();
        return;
      }

      if (shortcuts.toggleMode && combo === shortcuts.toggleMode) {
        if (embedConfig && !embedConfig.features.liveAssistant3d) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        const configStore = useConfigStore.getState();
        const newValue = !configStore.uiConfig.enableModelLoading;
        configStore.updateUIConfig("enableModelLoading", newValue, {
          debounceMs: 0,
        });
        void configStore.saveUIConfig();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [embedConfig, uiConfig?.shortcuts?.enabled]);

  useEffect(() => {
    if (!isDesktop || !api?.shortcuts || isInputWindow) {
      return;
    }

    if (uiConfig?.shortcuts) {
      api.shortcuts
        .register(uiConfig.shortcuts)
        .then(() => {
          Logger.log("AppBootstrap", "Global shortcuts registered in Electron");
        })
        .catch((error) => {
          Logger.error("AppBootstrap", "Failed to register shortcuts:", error);
        });
    }

    const cleanupOpenChat = api.shortcuts.onOpenChat(() => {
      if (embedConfig && !embedConfig.features.chat) {
        return;
      }
      appStore.getState().toggleChat();
    });

    const cleanupToggleModel = api.shortcuts.onToggleModel(() => {
      if (embedConfig && !embedConfig.features.liveAssistant3d) {
        return;
      }
      const configStore = useConfigStore.getState();
      const newValue = !configStore.uiConfig.enableModelLoading;
      configStore.updateUIConfig("enableModelLoading", newValue, {
        debounceMs: 0,
      });
      void configStore.saveUIConfig();
    });

    return () => {
      cleanupOpenChat?.();
      cleanupToggleModel?.();
    };
  }, [api, appStore, embedConfig, uiConfig?.shortcuts]);
}
