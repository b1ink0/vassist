import { useCallback, useEffect, useState, type ReactNode } from "react";
import { WebXRState } from "@babylonjs/core/XR/webXRTypes";
import { IsHtmlInCanvasUploadSupported } from "@babylonjs/core/Materials/Textures/HTML/htmlTexture";
import { XrRuntimeContext } from "../../contexts/XrRuntimeContext";
import { XrSessionController } from "../../babylon/xr/XrSessionController";
import { useSceneRef, useSceneKey } from "../../hooks/app/useScene";
import { useIsAssistantReady } from "../../hooks/app/useAssistant";

import {
  getXrClientRuntime,
  isXrClientConnected,
} from "../../services/xr/XrClientRuntime";

import { useUIConfig } from "../../hooks/config/useConfigUI";

import { useEmbedHost } from "../../embed/EmbedHostContext";
import { getHostCommandEventName } from "../../embed/hostCommands";

export function XrRuntimeProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const sceneRef = useSceneRef();
  const { hostId } = useEmbedHost();
  const { xr, enableModelLoading } = useUIConfig();
  const handTracking = xr.handTracking === true;

  const ready = useIsAssistantReady();
  const sceneKey = useSceneKey();
  const [controller, setController] = useState<XrSessionController | null>(
    null,
  );
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(isXrClientConnected);

  useEffect(() => {
    const status = (event: Event) =>
      setConnected(
        (event as CustomEvent<{ connected: boolean }>).detail.connected,
      );
    const failure = (event: Event) =>
      setError(String((event as CustomEvent).detail));
    window.addEventListener("vassist:xr-connection", status);
    window.addEventListener("vassist:xr-connection-error", failure);
    return () => {
      window.removeEventListener("vassist:xr-connection", status);
      window.removeEventListener("vassist:xr-connection-error", failure);
    };
  }, []);
  const [, refreshScale] = useState(0);
  const scene = ready ? sceneRef.current : null;
  useEffect(() => {
    if (!scene || !enabled) return;
    let units = scene.metadata?.xrWorldUnitsPerMeter;
    const observer = scene.onBeforeRenderObservable.add(() => {
      const next = scene.metadata?.xrWorldUnitsPerMeter;
      if (next && next !== units) {
        units = next;
        if (controller)
          controller.experience.baseExperience.sessionManager.worldScalingFactor =
            next;
        refreshScale((value) => value + 1);
      }
    });
    return () => {
      scene.onBeforeRenderObservable.remove(observer);
    };
  }, [controller, enabled, scene]);
  useEffect(() => {
    if (!enabled || !enableModelLoading || !scene) return;
    let cancelled = false;
    let instance: XrSessionController | undefined;
    setError("");
    setController(null);
    void (async () => {
      if (!window.isSecureContext || !navigator.xr)
        throw new Error(
          "VR requires a secure browser context with WebXR support.",
        );
      if (!IsHtmlInCanvasUploadSupported(scene.getEngine()))
        throw new Error(
          "Enable HTML-in-Canvas at chrome://flags/#canvas-draw-element (Brave: brave://flags/#canvas-draw-element), then relaunch the browser.",
        );
      if (!(await navigator.xr.isSessionSupported("immersive-vr")))
        throw new Error(
          "Connect your headset, start its OpenXR runtime, then reload this page in a WebXR-capable browser.",
        );
      const units = scene.metadata?.xrWorldUnitsPerMeter;
      if (!units) throw new Error("The avatar's XR scale is unavailable.");
      const next = await XrSessionController.create(scene, {
        worldUnitsPerMeter: units,
        floorMeshes: scene.metadata?.xrFloorMeshes ?? [],
        handTracking,
      });
      instance = next;
      if (cancelled || scene.isDisposed) {
        next.dispose();
        return;
      }
      next.experience.baseExperience.onStateChangedObservable.add((state) => {
        const ownsCamera = state !== WebXRState.NOT_IN_XR;
        scene.metadata?.setXrActive?.(ownsCamera);
        setActive(state === WebXRState.IN_XR);
        setBusy(
          state === WebXRState.ENTERING_XR || state === WebXRState.EXITING_XR,
        );
      });
      setController(next);
      scene.metadata!.exitXr = () => next.exit();
    })().catch((reason: unknown) => {
      if (!cancelled)
        setError(reason instanceof Error ? reason.message : String(reason));
    });
    return () => {
      cancelled = true;
      instance?.dispose();
      if (!scene.isDisposed) scene.metadata?.setXrActive?.(false);
      if (scene.metadata) delete scene.metadata.exitXr;
      setActive(false);
    };
  }, [enabled, enableModelLoading, handTracking, scene, sceneKey]);
  const enter = useCallback(() => {
    if (busy) return;
    if (!enableModelLoading) {
      setError("Enable Avatar to use XR.");
      return;
    }
    if (!controller) {
      setError(error || "Wait for the avatar and XR runtime to be ready.");
      return;
    }
    setBusy(true);
    setError("");
    // Start directly from this click. Awaiting other work loses user activation.
    void controller
      .enter()
      .catch((reason: unknown) => {
        scene?.metadata?.setXrActive?.(false);
        setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => setBusy(false));
  }, [busy, controller, enableModelLoading, error, scene]);
  useEffect(() => {
    const requestEntry = () => {
      if (enabled) enter();
    };
    const event = getHostCommandEventName(hostId, "enter-xr");
    window.addEventListener(event, requestEntry);
    return () => window.removeEventListener(event, requestEntry);
  }, [enabled, enter, hostId]);
  return (
    <XrRuntimeContext.Provider
      value={{
        enabled,
        active,
        scene,
        controller,
        busy,
        error,
        connected,
        enter,
        canInteract: !getXrClientRuntime() || connected,
      }}
    >
      {children}
    </XrRuntimeContext.Provider>
  );
}
