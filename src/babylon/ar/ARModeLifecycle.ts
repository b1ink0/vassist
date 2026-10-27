const AR_MODE_STATE_EVENT = "vassist-ar-mode-state";
const AR_PLACEMENT_STATE_EVENT = "vassist-ar-placement-state";
const AR_ERROR_EVENT = "vassist-ar-error";

export type ARPlacementState = "inactive" | "scanning" | "ready" | "placed";

let arModeRequested = false;
let arPlacementState: ARPlacementState = "inactive";
let arErrorMessage: string | null = null;

export const isARModeRequested = (): boolean => arModeRequested;

export const setARModeRequested = (requested: boolean): void => {
  arModeRequested = requested;
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(AR_MODE_STATE_EVENT, { detail: { requested } }),
    );
  }
};

export const notifyARModeActive = (active: boolean): void => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(AR_MODE_STATE_EVENT, {
        detail: { requested: arModeRequested, active },
      }),
    );
  }
};

export const onARModeStateChanged = (
  listener: (state: { requested: boolean; active?: boolean }) => void,
): (() => void) => {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent).detail as
      | { requested?: boolean; active?: boolean }
      | undefined;
    listener({
      requested: detail?.requested ?? arModeRequested,
      ...(typeof detail?.active === "boolean" ? { active: detail.active } : {}),
    });
  };
  window.addEventListener(AR_MODE_STATE_EVENT, handler);
  return () => window.removeEventListener(AR_MODE_STATE_EVENT, handler);
};

const setARPlacementState = (state: ARPlacementState): void => {
  if (arPlacementState === state) return;
  arPlacementState = state;
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(AR_PLACEMENT_STATE_EVENT, { detail: { state } }),
    );
  }
};

export const getARPlacementState = (): ARPlacementState => arPlacementState;

export const notifyARPlacementActive = (active: boolean): void => {
  setARPlacementState(active ? "scanning" : "inactive");
};

export const notifyARSurfaceFound = (found: boolean): void => {
  if (arPlacementState === "inactive" || arPlacementState === "placed") return;
  setARPlacementState(found ? "ready" : "scanning");
};

export const notifyARModelPlaced = (): void => {
  if (arPlacementState !== "inactive") setARPlacementState("placed");
};

export const onARPlacementStateChanged = (
  listener: (state: ARPlacementState) => void,
): (() => void) => {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent).detail as
      | { state?: ARPlacementState }
      | undefined;
    listener(detail?.state ?? arPlacementState);
  };
  window.addEventListener(AR_PLACEMENT_STATE_EVENT, handler);
  return () => window.removeEventListener(AR_PLACEMENT_STATE_EVENT, handler);
};

export const getARError = (): string | null => arErrorMessage;

export const notifyARError = (message: string | null): void => {
  arErrorMessage = message;
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(AR_ERROR_EVENT, { detail: { message } }),
    );
  }
};

export const onARErrorChanged = (
  listener: (message: string | null) => void,
): (() => void) => {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent).detail as
      | { message?: string | null }
      | undefined;
    listener(detail?.message ?? null);
  };
  window.addEventListener(AR_ERROR_EVENT, handler);
  return () => window.removeEventListener(AR_ERROR_EVENT, handler);
};
