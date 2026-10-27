import { execFile, spawn } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { XrBrowserChoice, XrBrowserId } from "../../../src/types/xr";

const execute = promisify(execFile);
const browsers = [
  {
    id: "chrome",
    name: "Google Chrome",
    exe: "chrome.exe",
    location: "Google/Chrome/Application/chrome.exe",
  },
  {
    id: "edge",
    name: "Microsoft Edge",
    exe: "msedge.exe",
    location: "Microsoft/Edge/Application/msedge.exe",
  },
  {
    id: "brave",
    name: "Brave",
    exe: "brave.exe",
    location: "BraveSoftware/Brave-Browser/Application/brave.exe",
  },
] as const;

export async function detectXrBrowsers(): Promise<
  Map<XrBrowserId, { name: string; executable: string }>
> {
  const detected = new Map<XrBrowserId, { name: string; executable: string }>();
  if (process.platform !== "win32") return detected;
  for (const browser of browsers) {
    const candidates: string[] = [];
    for (const root of ["HKCU", "HKLM"]) {
      for (const view of ["64", "32"]) {
        try {
          const { stdout } = await execute(
            "reg.exe",
            [
              "query",
              `${root}\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${browser.exe}`,
              "/ve",
              `/reg:${view}`,
            ],
            { windowsHide: true },
          );
          const value = stdout
            .match(/REG_SZ\s+(.+)/)?.[1]
            ?.trim()
            .replace(/^"|"$/g, "");
          if (value) candidates.push(value);
        } catch {
          /* Missing registry entries are normal. */
        }
      }
    }
    for (const root of [
      process.env.LOCALAPPDATA,
      process.env.ProgramFiles,
      process.env["ProgramFiles(x86)"],
    ]) {
      if (root) candidates.push(path.join(root, browser.location));
    }
    for (const executable of candidates) {
      try {
        await access(executable);
        detected.set(browser.id, { name: browser.name, executable });
        break;
      } catch {
        /* Try the next installation location. */
      }
    }
  }
  return detected;
}

export async function listXrBrowsers(): Promise<XrBrowserChoice[]> {
  const detected = await detectXrBrowsers();
  return [
    { id: "default", name: "Default browser" },
    ...Array.from(detected, ([id, browser]) => ({ id, name: browser.name })),
  ];
}

export async function launchXrBrowser(
  url: string,
  options: { browser: XrBrowserId; forceOpenXR: boolean },
  userData: string,
  openExternal: (url: string) => Promise<void>,
): Promise<void> {
  if (options.browser === "default") await openExternal(url);
  else {
    const browser = (await detectXrBrowsers()).get(options.browser);
    if (!browser) throw new Error("The selected XR browser is not installed.");
    const profile = path.join(userData, "xr-browser", options.browser);
    await mkdir(profile, { recursive: true });
    const args = [
      `--app=${url}`,
      `--user-data-dir=${profile}`,
      "--enable-blink-features=CanvasDrawElement",
    ];
    if (options.forceOpenXR) args.push("--force-webxr-runtime=openxr");
    await new Promise<void>((resolve, reject) => {
      const child = spawn(browser.executable, args, {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      child.once("error", reject);
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    });
  }
}
