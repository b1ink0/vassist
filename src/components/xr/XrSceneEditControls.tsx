import { useEffect, useRef, useState } from "react";
import { useXrRuntime } from "../../contexts/XrRuntimeContext";
import { useConfigStore } from "../../stores/useConfigStore";
import { XrSceneEditor, type XrEditMode } from "../../babylon/xr/XrSceneEditor";
import { Button } from "../ui";
import { Icon } from "../icons";
import {
  iconButtonClassName,
  panelButtonVariant,
} from "../chat/assistant-controls/panelStyles";

export function XrSceneEditControls({
  isLightBackground = false,
}: {
  isLightBackground?: boolean;
}) {
  const variant = panelButtonVariant(isLightBackground);
  const { scene, active, controller, canInteract } = useXrRuntime();
  const [mode, setMode] = useState<XrEditMode | null>(null);
  const [available, setAvailable] = useState(false);
  const editor = useRef<XrSceneEditor | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  useEffect(() => {
    if (!active || !scene) return;
    let currentRoot = scene.metadata?.stageMesh;
    let currentKey = "";
    const attach = () => {
      editor.current?.dispose();
      editor.current = null;
      const root = scene.metadata?.stageMesh;
      const units = scene.metadata?.xrWorldUnitsPerMeter;
      const state = useConfigStore.getState();
      const selection = state.uiConfig.stage.selection;
      setAvailable(Boolean(root && units));
      if (!root || !units || !selection || selection.kind === "none") return;
      const key = `${selection.kind}:${selection.id}`;
      currentKey = key;
      editor.current = new XrSceneEditor(
        scene,
        root,
        units,
        state.uiConfig.xr.environments?.[key],
        (pose) => {
          const latest = useConfigStore.getState();
          latest.updateUIConfig("xr.environments", {
            ...latest.uiConfig.xr.environments,
            [key]: pose,
          });
        },
      );
      editor.current.setMode(canInteract ? modeRef.current : null);
    };
    attach();
    const removeConfig = useConfigStore.subscribe((state, old) => {
      if (state.uiConfig.xr.environments !== old.uiConfig.xr.environments)
        editor.current?.syncPose(state.uiConfig.xr.environments?.[currentKey]);
    });
    const observer = scene.onBeforeRenderObservable.add(() => {
      if (currentRoot === scene.metadata?.stageMesh) return;
      currentRoot = scene.metadata?.stageMesh;
      attach();
    });
    return () => {
      removeConfig();
      scene.onBeforeRenderObservable.remove(observer);
      editor.current?.dispose();
      editor.current = null;
      controller?.setSceneEditing(false);
    };
  }, [active, controller, scene, canInteract]);
  useEffect(() => {
    editor.current?.setMode(canInteract ? mode : null);
    controller?.setSceneEditing(
      active && canInteract && available && mode !== null,
    );
  }, [active, available, controller, mode, canInteract]);
  if (!active || !available || !canInteract) return null;
  return (
    <div className="flex flex-wrap gap-1">
      <Button
        variant={variant}
        className={iconButtonClassName + (mode ? "" : " opacity-50")}
        title={mode ? "Done editing" : "Edit environment"}
        aria-label={mode ? "Done editing" : "Edit environment"}
        aria-pressed={mode !== null}
        onClick={() => setMode(mode ? null : "move")}
      >
        <Icon name={mode ? "check" : "pencil"} size={18} />
      </Button>
      {mode && (
        <>
          {(["move", "rotate", "scale"] as const).map((value) => (
            <Button
              key={value}
              variant={variant}
              className={
                iconButtonClassName + (mode === value ? "" : " opacity-50")
              }
              title={value}
              aria-label={value}
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              <Icon
                name={
                  value === "move"
                    ? "move"
                    : value === "rotate"
                      ? "rotate-right"
                      : "maximize"
                }
                size={18}
              />
            </Button>
          ))}
          <Button
            variant={variant}
            className={iconButtonClassName}
            title="Undo"
            aria-label="Undo"
            onClick={() => editor.current?.undo()}
          >
            <Icon name="undo" size={18} />
          </Button>
          <Button
            variant={variant}
            className={iconButtonClassName}
            title="Redo"
            aria-label="Redo"
            onClick={() => editor.current?.redo()}
          >
            <Icon name="redo" size={18} />
          </Button>
          <Button
            variant={variant}
            className={iconButtonClassName}
            title="Reset environment"
            aria-label="Reset environment"
            onClick={() => editor.current?.reset()}
          >
            <Icon name="refresh" size={18} />
          </Button>
        </>
      )}
    </div>
  );
}
