import { lazy, Suspense, type ReactNode } from "react";
import { useXrRuntime } from "../../contexts/XrRuntimeContext";
const SpatialHtmlPanel = lazy(async () => ({
  default: (await import("./SpatialHtmlPanel")).SpatialHtmlPanel,
}));

export interface XrSurfaceProps {
  id: string;
  widthMeters: number;
  heightMeters: number;
  widthPixels: number;
  heightPixels: number;
  offsetMeters?: [number, number, number];
  visible?: boolean;
  children: ReactNode;
}

/** The same subtree stays mounted when moving between DOM and immersive panels. */
export function XrSurface({
  children,
  visible = true,
  ...props
}: XrSurfaceProps) {
  const { scene, active } = useXrRuntime();
  const units = scene?.metadata?.xrWorldUnitsPerMeter;
  return scene && units ? (
    <Suspense fallback={children}>
      <SpatialHtmlPanel
        {...props}
        scene={scene}
        worldUnitsPerMeter={units}
        active={active && visible}
      >
        {children}
      </SpatialHtmlPanel>
    </Suspense>
  ) : (
    children
  );
}
