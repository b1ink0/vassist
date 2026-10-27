const activeSurfaces = new Set<symbol>();
const listeners = new Set<() => void>();

export function getStageSurfaceActive(): boolean {
  return activeSurfaces.size > 0;
}

export function subscribeStageSurface(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function registerStageSurface(): () => void {
  const surface = Symbol("stage surface");
  activeSurfaces.add(surface);
  for (const listener of listeners) listener();
  return () => {
    if (!activeSurfaces.delete(surface)) return;
    for (const listener of listeners) listener();
  };
}
