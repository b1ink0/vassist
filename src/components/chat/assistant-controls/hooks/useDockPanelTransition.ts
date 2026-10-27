import { useEffect, useState, type HTMLAttributes } from "react";

export function useDockPanelTransition(open: boolean) {
  const [retained, setRetained] = useState(open);
  useEffect(() => {
    if (open) {
      setRetained(true);
      return;
    }
    const timeout = setTimeout(() => setRetained(false), 180);
    return () => clearTimeout(timeout);
  }, [open]);

  const transitionProps: HTMLAttributes<HTMLDivElement> = {
    className: open ? "dock-panel-enter" : "dock-panel-exit",
    inert: !open,
    onClickCapture: !open ? (event) => event.stopPropagation() : undefined,
    onPointerDownCapture: !open
      ? (event) => event.stopPropagation()
      : undefined,
  };
  return { isMounted: open || retained, transitionProps };
}

export type DockPanelTransitionProps = ReturnType<
  typeof useDockPanelTransition
>["transitionProps"];
