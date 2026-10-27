import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import {
  HtmlTexture,
  IsHtmlInCanvasUploadSupported,
} from "@babylonjs/core/Materials/Textures/HTML/htmlTexture";
import { HtmlRaycastInteractionManager } from "@babylonjs/core/Materials/Textures/HTML/htmlRaycastInteractionManager";
import "@babylonjs/core/Culling/ray";
import {
  SpatialPanel,
  type SpatialAnchor,
} from "../../babylon/xr/SpatialPanel";
import { EmbedHostProvider, useEmbedHost } from "../../embed/EmbedHostContext";
import { getVAssistThemeRootAttributes } from "../../embed/theme";
import { SpatialHtmlPanelContext } from "./SpatialHtmlPanelContext";
import { useXrRuntime } from "../../contexts/XrRuntimeContext";
import { HtmlPanelInput } from "../../babylon/xr/HtmlPanelInput";
import { XrKeyboard } from "./XrKeyboard";
import {
  useUIConfig,
  useConfigUIActions,
} from "../../hooks/config/useConfigUI";
import { Button } from "../ui";
import { Icon } from "../icons";

interface SpatialHtmlPanelProps {
  id: string;
  scene: Scene;
  worldUnitsPerMeter: number;
  widthMeters: number;
  heightMeters: number;
  widthPixels: number;
  heightPixels: number;
  anchor?: SpatialAnchor;
  active?: boolean;
  offsetMeters?: [number, number, number];
  children: ReactNode;
}

/** Spatializes the original React subtree without creating another React root. */
export function SpatialHtmlPanel({
  id,
  scene,
  worldUnitsPerMeter,
  widthMeters,
  heightMeters,
  widthPixels,
  heightPixels,
  anchor = "follow",
  active = true,
  offsetMeters = [0, 0, 0],
  children,
}: SpatialHtmlPanelProps) {
  const { embedConfig } = useEmbedHost();
  const { controller, canInteract } = useXrRuntime();
  const { xr } = useUIConfig();
  const { updateUIConfig } = useConfigUIActions();
  const panelRef = useRef<SpatialPanel | null>(null);
  const savedPose = useRef(xr.panels?.[id]);
  const [pinned, setPinned] = useState(savedPose.current?.anchor === "world");
  const [textInput, setTextInput] = useState<
    HTMLInputElement | HTMLTextAreaElement | null
  >(null);
  const [host] = useState(() => document.createElement("div"));
  const mount = useRef<HTMLDivElement>(null);
  const [offsetX, offsetY, offsetZ] = offsetMeters;
  useEffect(() => {
    const pose = xr.panels?.[id];
    if (!pose || JSON.stringify(pose) === JSON.stringify(savedPose.current))
      return;
    savedPose.current = pose;
    panelRef.current?.applyPose(pose);
    setPinned(pose.anchor === "world");
  }, [id, xr.panels]);
  useLayoutEffect(() => {
    host.style.display = "contents";
    mount.current?.appendChild(host);
    return () => host.remove();
  }, [host]);
  const supported = IsHtmlInCanvasUploadSupported(scene.getEngine());
  useEffect(() => {
    const theme = getVAssistThemeRootAttributes(embedConfig);
    host.className = "vassist-theme-root";
    for (const [name, value] of Object.entries(theme.style)) {
      if (name.startsWith("--")) host.style.setProperty(name, String(value));
    }
    host.dataset.vassistHostId = embedConfig.mount.hostId;
    host.dataset.vassistThemeMode = theme.mode;
    host.dataset.vassistSurfaceStyle = theme.surfaceStyle;
    host.style.colorScheme = theme.colorScheme;
  }, [embedConfig, host]);
  const panelConfig = useMemo(
    () =>
      !active
        ? embedConfig
        : {
            ...embedConfig,
            mount: {
              ...embedConfig.mount,
              portalContainers: {
                ...embedConfig.mount.portalContainers,
                overlays: host,
                popovers: host,
              },
            },
          },
    [active, embedConfig, host],
  );

  useEffect(() => {
    if (!active || !supported || scene.isDisposed) return;
    host.dataset.spatialPanel = id;
    Object.assign(host.style, {
      display: "block",
      position: "relative",
      width: `${widthPixels}px`,
      height: `${heightPixels}px`,
      contain: "layout paint",
    });
    const texture = new HtmlTexture(id, host, {
      scene,
      width: widthPixels,
      height: heightPixels,
      autoUpdate: true,
      useSvgFallback: false,
    });
    const material = new StandardMaterial(`${id}-html`, scene);
    material.disableLighting = true;
    material.imageProcessingConfiguration = new ImageProcessingConfiguration();
    material.imageProcessingConfiguration.isEnabled = false;
    material.emissiveColor = Color3.White();
    material.diffuseTexture = texture;
    material.useAlphaFromDiffuseTexture = true;
    material.backFaceCulling = false;
    texture.hasAlpha = true;
    const panel = new SpatialPanel(scene, {
      id,
      widthMeters,
      heightMeters,
      worldUnitsPerMeter,
      material,
      anchor,
      offsetMeters: [offsetX, offsetY, offsetZ],
      pose: savedPose.current,
      onMoved: (pose) => {
        savedPose.current = pose;
        setPinned(pose.anchor === "world");
        updateUIConfig(`xr.panels.${id}`, pose);
      },
    });
    panelRef.current = panel;
    if (id === "tool-dock" && xr.handTracking && controller)
      panel.enableHandAnchor(
        controller.experience.baseExperience,
        savedPose.current?.anchor === "hand",
      );
    const interaction = new HtmlRaycastInteractionManager(
      scene,
      texture,
      panel.mesh,
    );
    const input = new HtmlPanelInput(scene, panel.mesh, host, setTextInput);
    const unregisterInput = controller?.registerHtmlPanel(panel.mesh, (delta) =>
      input.scroll(delta),
    );
    const repaint = () => texture.requestUpdate();
    host.addEventListener("vassist:html-panel-repaint", repaint);
    const mutations = new MutationObserver(repaint);
    mutations.observe(host, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      mutations.disconnect();
      host.removeEventListener("vassist:html-panel-repaint", repaint);
      unregisterInput?.();
      input.dispose();
      interaction.dispose();
      panel.dispose();
      if (panelRef.current === panel) panelRef.current = null;
      material.dispose();
      texture.dispose();
      delete host.dataset.spatialPanel;
      host.style.display = "contents";
      host.style.position = "";
      host.style.width = "";
      host.style.height = "";
      host.style.contain = "";
    };
    const observer = scene.onDisposeObservable.addOnce(dispose);
    return () => {
      scene.onDisposeObservable.remove(observer);
      dispose();
    };
  }, [
    anchor,
    controller,
    active,
    offsetX,
    offsetY,
    offsetZ,
    heightMeters,
    heightPixels,
    host,
    id,
    scene,
    supported,
    widthMeters,
    widthPixels,
    worldUnitsPerMeter,
    updateUIConfig,
    xr.handTracking,
  ]);

  useEffect(() => {
    const blocked = !canInteract && id !== "tool-dock";
    host.inert = blocked;
    host.style.opacity = blocked ? "0.5" : "";
    if (panelRef.current)
      for (const mesh of panelRef.current.root.getChildMeshes())
        mesh.isPickable = !blocked;
  }, [
    active,
    canInteract,
    host,
    id,
    supported,
    controller,
    scene,
    worldUnitsPerMeter,
  ]);

  return (
    <div ref={mount} style={{ display: "contents" }}>
      {createPortal(
        <EmbedHostProvider embedConfig={panelConfig}>
          <SpatialHtmlPanelContext.Provider
            value={active && supported ? host : null}
          >
            {children}
            {active && (
              <div className="absolute right-1 top-1 z-[19000] flex gap-1">
                <Button
                  size="icon"
                  title={pinned ? "Follow view" : "Pin panel"}
                  aria-pressed={pinned}
                  onClick={() => panelRef.current?.togglePin()}
                >
                  <Icon name={pinned ? "lock" : "unlock"} size={14} />
                </Button>
                {id === "tool-dock" && xr.handTracking && (
                  <Button
                    size="icon"
                    title="Attach dock to left hand"
                    onClick={() => panelRef.current?.toggleHand()}
                  >
                    <Icon name="hand-stop" size={14} />
                  </Button>
                )}
              </div>
            )}
            {active && textInput && (
              <XrKeyboard
                input={textInput}
                onClose={() => setTextInput(null)}
              />
            )}
          </SpatialHtmlPanelContext.Provider>
        </EmbedHostProvider>,
        host,
      )}
    </div>
  );
}
