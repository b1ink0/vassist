import { Engine } from "@babylonjs/core/Engines/engine";

export interface XrCapabilities {
  secureContext: boolean;
  webXR: boolean;
  immersiveVR: boolean;
  supportError: string | null;
  webGL: boolean;
  webGL2: boolean;
  webGPU: boolean;
  nativeHtmlInCanvas: boolean;
  babylonVersion: string;
  userAgent: string;
}

/** Availability is diagnostic information, not a guarantee that entry succeeds. */
export async function detectXrCapabilities(): Promise<XrCapabilities> {
  const xr = navigator.xr;
  let immersiveVR = false;
  let supportError: string | null = null;
  if (xr) {
    try {
      immersiveVR = await xr.isSessionSupported("immersive-vr");
    } catch (error) {
      supportError = error instanceof Error ? error.message : String(error);
    }
  }

  const webGL2 = supportsContext("webgl2");
  return {
    secureContext: window.isSecureContext,
    webXR: !!xr,
    immersiveVR,
    supportError,
    webGL: webGL2 || supportsContext("webgl"),
    webGL2,
    webGPU: "gpu" in navigator,
    nativeHtmlInCanvas:
      typeof HTMLCanvasElement !== "undefined" &&
      "captureElementImage" in HTMLCanvasElement.prototype,
    babylonVersion: Engine.Version,
    userAgent: navigator.userAgent,
  };
}

function supportsContext(kind: "webgl" | "webgl2"): boolean {
  try {
    const canvas = document.createElement("canvas");
    const context =
      kind === "webgl2"
        ? canvas.getContext("webgl2")
        : canvas.getContext("webgl");
    if (!context) return false;
    context.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}
