import { useEffect, useState } from "react";
import {
  getARPlacementState,
  getARError,
  onARErrorChanged,
  onARPlacementStateChanged,
  type ARPlacementState,
} from "../../babylon/ar/ARModeLifecycle";
import { cn } from "../../utils/cn";
import { Icon } from "../icons";

export function ARPlacementGuide() {
  const [state, setState] = useState<ARPlacementState>(getARPlacementState);
  const [error, setError] = useState<string | null>(getARError);

  useEffect(() => onARPlacementStateChanged(setState), []);
  useEffect(() => onARErrorChanged(setError), []);
  useEffect(() => {
    if (!error) return;
    const timeout = window.setTimeout(() => setError(null), 8000);
    return () => window.clearTimeout(timeout);
  }, [error]);

  if (error) {
    return (
      <div
        className="pointer-events-none fixed left-1/2 top-1/2 z-[1000] flex w-[min(88vw,360px)] -translate-x-1/2 -translate-y-1/2 items-start gap-2 rounded-2xl border border-white/30 bg-black/85 px-4 py-3 text-sm font-medium leading-5 text-white shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-md"
        role="alert"
        aria-live="assertive"
      >
        <Icon name="error-status" size={18} className="mt-0.5 shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  if (state === "inactive" || state === "placed") return null;

  const isScanning = state === "scanning";

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[1000] animate-fade-in"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {isScanning && (
        <div
          className="fixed left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2"
          aria-hidden="true"
        >
          <div className="absolute inset-0 animate-ping rounded-full border border-white/40 motion-reduce:animate-none" />
          <div className="absolute inset-0 animate-[spin_3s_linear_infinite] rounded-full border-2 border-dashed border-white/90 shadow-[0_0_0_6px_rgba(255,255,255,0.1),0_0_22px_rgba(255,255,255,0.18)] motion-reduce:animate-none" />
          <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90" />
        </div>
      )}

      <div
        className={cn(
          "fixed left-1/2 top-[calc(50%+48px)] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border px-3 py-2 text-xs font-semibold tracking-[0.01em] text-white shadow-[0_8px_24px_rgba(0,0,0,0.24)] backdrop-blur-md",
          isScanning
            ? "border-white/20 bg-black/80"
            : "border-white/40 bg-neutral-900/85",
        )}
      >
        <Icon
          name={isScanning ? "loading" : "check"}
          size={14}
          className={cn(
            isScanning && "animate-spin motion-reduce:animate-none",
          )}
        />
        <span>
          {isScanning
            ? "Move slowly - aim at the floor"
            : "Floor found - tap to place"}
        </span>
      </div>
    </div>
  );
}
