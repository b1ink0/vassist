import { useEffect, useRef } from "react";
import { useSetup } from "../../contexts/SetupContext";
import {
  useConfigUIActions,
  useUIConfig,
} from "../../hooks/config/useConfigUI";
import { useDesktopApi } from "../../hooks/useDesktopStore";
import {
  isAppModeWindow,
  isDetachedAvatarWindow,
} from "../../utils/PlatformUtils";

type DesktopMode = "floating-app" | "app" | "live-wallpaper";
type LiveWallpaperInteraction = "non-interactive" | "interactive";
type DesktopControlPlacement = "attached" | "detached";
type DesktopModeRequest = {
  mode: DesktopMode;
  liveWallpaperInteraction?: LiveWallpaperInteraction;
  controlPlacement?: DesktopControlPlacement;
};

const isDesktopMode = (value: unknown): value is DesktopMode =>
  value === "floating-app" || value === "app" || value === "live-wallpaper";

export default function DesktopModeController() {
  const api = useDesktopApi();
  const uiConfig = useUIConfig();
  const { updateUIConfig, saveUIConfig } = useConfigUIActions();
  const { setupCompleted } = useSetup();
  const boundsAppliedRef = useRef(false);
  const requestedModeRef = useRef<DesktopMode | null>(null);
  const configuredMode = uiConfig.desktopMode.mode;
  const desiredMode = setupCompleted ? configuredMode : "app";
  const desiredWallpaperInteraction =
    uiConfig.desktopMode.liveWallpaper.interaction;
  const desiredControlPlacement = uiConfig.desktopMode.controlPlacement;

  useEffect(() => {
    if (
      isDetachedAvatarWindow ||
      !api?.window?.getDesktopMode ||
      !api.window.setDesktopMode
    ) {
      return;
    }

    let cancelled = false;
    void api.window
      .getDesktopMode()
      .then((currentState) => {
        if (
          !cancelled &&
          (currentState.mode !== desiredMode ||
            (desiredMode === "live-wallpaper" &&
              currentState.liveWallpaperInteraction !==
                desiredWallpaperInteraction) ||
            (desiredMode !== "app" &&
              currentState.controlPlacement !== desiredControlPlacement)) &&
          requestedModeRef.current !== desiredMode
        ) {
          return saveUIConfig().then(() =>
            api.window.setDesktopMode({
              mode: desiredMode,
              liveWallpaperInteraction: desiredWallpaperInteraction,
              controlPlacement: desiredControlPlacement,
            }),
          );
        }
        return undefined;
      })
      .catch(() => {
        if (requestedModeRef.current === desiredMode) {
          requestedModeRef.current = null;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    api,
    desiredMode,
    desiredControlPlacement,
    desiredWallpaperInteraction,
    saveUIConfig,
  ]);

  useEffect(() => {
    if (isDetachedAvatarWindow || !api?.ipc) return;

    return api.ipc.on("desktop:mode-request", (requestedMode: unknown) => {
      const nextMode =
        typeof requestedMode === "string"
          ? requestedMode
          : requestedMode && typeof requestedMode === "object"
            ? (requestedMode as { mode?: unknown }).mode
            : undefined;
      if (!isDesktopMode(nextMode)) return;

      const requestedInteraction =
        requestedMode && typeof requestedMode === "object"
          ? (requestedMode as { liveWallpaperInteraction?: unknown })
              .liveWallpaperInteraction
          : undefined;
      const nextRequest: DesktopModeRequest = {
        mode: nextMode,
        ...(requestedInteraction === "interactive" ||
        requestedInteraction === "non-interactive"
          ? { liveWallpaperInteraction: requestedInteraction }
          : {}),
        ...(requestedMode &&
        typeof requestedMode === "object" &&
        ((requestedMode as { controlPlacement?: unknown }).controlPlacement ===
          "attached" ||
          (requestedMode as { controlPlacement?: unknown }).controlPlacement ===
            "detached")
          ? {
              controlPlacement: (
                requestedMode as {
                  controlPlacement: DesktopControlPlacement;
                }
              ).controlPlacement,
            }
          : {}),
      };

      // Persist before asking Electron to recreate the BrowserWindow. The
      // new renderer must boot from the same source of truth.
      requestedModeRef.current = nextMode;
      updateUIConfig("desktopMode.mode", nextMode);
      if (
        requestedMode &&
        typeof requestedMode === "object" &&
        "liveWallpaperInteraction" in requestedMode
      ) {
        const interaction = requestedInteraction;
        if (
          interaction === "interactive" ||
          interaction === "non-interactive"
        ) {
          updateUIConfig("desktopMode.liveWallpaper.interaction", interaction);
        }
      }
      if (
        requestedMode &&
        typeof requestedMode === "object" &&
        "controlPlacement" in requestedMode
      ) {
        const placement = (requestedMode as { controlPlacement?: unknown })
          .controlPlacement;
        if (placement === "attached" || placement === "detached") {
          updateUIConfig("desktopMode.controlPlacement", placement);
        }
      }
      void saveUIConfig()
        .then(() => api.window.setDesktopMode(nextRequest))
        .catch(() => {
          if (requestedModeRef.current === nextMode) {
            requestedModeRef.current = null;
          }
        });
    });
  }, [api, saveUIConfig, updateUIConfig]);

  useEffect(() => {
    if (!setupCompleted && configuredMode !== "app") {
      updateUIConfig("desktopMode.mode", "app");
      void saveUIConfig().catch(() => undefined);
    }
  }, [configuredMode, saveUIConfig, setupCompleted, updateUIConfig]);

  useEffect(() => {
    if (!isAppModeWindow || !api?.window || boundsAppliedRef.current) {
      return;
    }

    const savedBounds = uiConfig.desktopMode.appMode;
    boundsAppliedRef.current = true;

    void (async () => {
      if (
        savedBounds.x !== null &&
        savedBounds.y !== null &&
        savedBounds.width > 0 &&
        savedBounds.height > 0
      ) {
        await api.window.setBounds(
          savedBounds.x,
          savedBounds.y,
          savedBounds.width,
          savedBounds.height,
        );
      } else if (savedBounds.width > 0 && savedBounds.height > 0) {
        await api.window.setSize(savedBounds.width, savedBounds.height);
      }
    })().catch(() => undefined);
  }, [api, uiConfig.desktopMode.appMode]);

  useEffect(() => {
    if (!isAppModeWindow || !api?.ipc) return;

    return api.ipc.on("desktop:app-window-bounds", (payload: unknown) => {
      if (!payload || typeof payload !== "object") return;
      const bounds = payload as Partial<{
        x: number;
        y: number;
        width: number;
        height: number;
      }>;
      if (
        typeof bounds.x !== "number" ||
        typeof bounds.y !== "number" ||
        typeof bounds.width !== "number" ||
        typeof bounds.height !== "number"
      ) {
        return;
      }

      updateUIConfig("desktopMode.appMode.x", bounds.x, {
        debounceMs: 250,
      });
      updateUIConfig("desktopMode.appMode.y", bounds.y, {
        debounceMs: 250,
      });
      updateUIConfig("desktopMode.appMode.width", bounds.width, {
        debounceMs: 250,
      });
      updateUIConfig("desktopMode.appMode.height", bounds.height, {
        debounceMs: 250,
      });
    });
  }, [api, updateUIConfig]);

  return null;
}
