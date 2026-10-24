import { useSyncExternalStore } from "react";
import {
  getStageSurfaceActive,
  subscribeStageSurface,
} from "../../babylon/stages/stageSurfaceState";

export function useStageSurface(): boolean {
  return useSyncExternalStore(
    subscribeStageSurface,
    getStageSurfaceActive,
    () => false,
  );
}
