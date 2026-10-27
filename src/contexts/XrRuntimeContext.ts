import { createContext, useContext } from "react";
import type { SceneWithMetadata } from "../babylon/types";
import type { XrSessionController } from "../babylon/xr/XrSessionController";

export interface XrRuntime {
  enabled: boolean;
  active: boolean;
  canInteract: boolean;
  busy: boolean;
  error: string;
  connected: boolean;
  enter: () => void;
  scene: SceneWithMetadata | null;
  controller: XrSessionController | null;
}
export const XrRuntimeContext = createContext<XrRuntime>({
  enabled: false,
  active: false,
  canInteract: true,
  busy: false,
  error: "",
  connected: false,
  enter: () => {},
  scene: null,
  controller: null,
});
export const useXrRuntime = () => useContext(XrRuntimeContext);
