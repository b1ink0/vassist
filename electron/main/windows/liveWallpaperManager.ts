import type { BrowserWindow as BrowserWindowInstance } from "electron";
import type { LiveWallpaperInteraction } from "./desktopMode";

type PhysicalRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type DesktopHostAddon = {
  attach: (
    hwnd: Buffer,
    rect: PhysicalRect,
    interactive: boolean,
  ) => {
    mode: "classic" | "raised";
    attached: boolean;
  };
  reposition: (hwnd: Buffer, rect: PhysicalRect) => void;
  validate: (hwnd: Buffer) => {
    attached: boolean;
    parentValid: boolean;
    zOrderValid: boolean;
  };
  detach: (hwnd: Buffer) => void;
};

type LiveWallpaperManagerDeps = {
  path: typeof import("path");
  process: NodeJS.Process;
  require: NodeRequire;
};

type ActiveWallpaper = {
  window: BrowserWindowInstance;
  hwnd: Buffer;
  rect: PhysicalRect;
  interaction: LiveWallpaperInteraction;
};

function describeLoadFailure(candidates: string[], errors: unknown[]): Error {
  const details = errors
    .map((error) => (error instanceof Error ? error.message : String(error)))
    .join(" | ");

  return new Error(
    `The Windows desktop host addon is unavailable. Build electron/native/desktop-host first. ` +
      `Tried: ${candidates.join(", ")}${details ? ` (${details})` : ""}`,
  );
}

/**
 * Owns only the Windows shell integration for live wallpaper mode.
 *
 * Explorer's Progman/WorkerW hierarchy is dynamic, so the native addon is
 * checked periodically and the HWND is reattached if Explorer recreates the
 * desktop host. The Electron window remains responsible for rendering.
 */
export function createLiveWallpaperManager({
  path,
  process,
  require,
}: LiveWallpaperManagerDeps) {
  let nativeHost: DesktopHostAddon | null = null;
  let active: ActiveWallpaper | null = null;
  let recoveryTimer: NodeJS.Timeout | null = null;

  function loadNativeHost(): DesktopHostAddon {
    if (nativeHost) return nativeHost;

    if (process.platform !== "win32") {
      throw new Error("Live wallpaper is currently supported on Windows only");
    }

    const candidates = [
      path.join(
        process.cwd(),
        "electron",
        "native",
        "desktop-host",
        "build",
        "Release",
        "desktop_host.node",
      ),
      path.join(
        process.resourcesPath,
        "native",
        "desktop-host",
        "desktop_host.node",
      ),
      path.join(
        process.resourcesPath,
        "app.asar.unpacked",
        "native",
        "desktop-host",
        "desktop_host.node",
      ),
    ];
    const errors: unknown[] = [];

    for (const candidate of candidates) {
      try {
        nativeHost = require(candidate) as DesktopHostAddon;
        return nativeHost;
      } catch (error) {
        errors.push(error);
      }
    }

    throw describeLoadFailure(candidates, errors);
  }

  function stopRecovery() {
    if (recoveryTimer) clearInterval(recoveryTimer);
    recoveryTimer = null;
  }

  function startRecovery() {
    stopRecovery();
    recoveryTimer = setInterval(() => {
      const current = active;
      if (!current || current.window.isDestroyed()) return;

      try {
        const host = loadNativeHost();
        const validation = host.validate(current.hwnd);
        if (
          !validation.attached ||
          !validation.parentValid ||
          !validation.zOrderValid
        ) {
          console.warn(
            "[Main] Live wallpaper desktop host/order changed; reattaching",
          );
          host.attach(
            current.hwnd,
            current.rect,
            current.interaction === "interactive",
          );
        }
      } catch (error) {
        console.error("[Main] Live wallpaper recovery failed:", error);
      }
    }, 1000);
  }

  async function attach(
    window: BrowserWindowInstance,
    rect: PhysicalRect,
    interaction: LiveWallpaperInteraction,
  ): Promise<void> {
    const hwnd = window.getNativeWindowHandle();
    if (!hwnd || hwnd.length < 4) {
      throw new Error("Could not read the Electron wallpaper window handle");
    }

    const host = loadNativeHost();
    const result = host.attach(hwnd, rect, interaction === "interactive");
    if (!result.attached) {
      throw new Error("The Windows desktop host rejected the wallpaper HWND");
    }

    active = { window, hwnd, rect, interaction };
    startRecovery();
    console.log(`[Main] Live wallpaper attached using ${result.mode} desktop`);
  }

  function stop() {
    stopRecovery();

    const current = active;
    active = null;
    if (!current) return;

    try {
      loadNativeHost().detach(current.hwnd);
    } catch (error) {
      console.warn("[Main] Failed to detach live wallpaper HWND:", error);
    }
  }

  return { attach, stop };
}
