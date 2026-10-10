# Windows desktop host addon

This folder contains the Windows-only native boundary used by Electron Live
Wallpaper mode. It is deliberately under `electron/`; it is not part of the
shared web, Android, or renderer application.

## Build

From the repository root, run:

```text
bun run build:native:desktop-host
```

The package script invokes the repository's pinned `node-gyp` dependency and
reads the installed Electron package version before downloading/building the
matching Electron headers. It does not invoke PowerShell or rely on a
globally installed `node-gyp`.

The build requires:

- Windows 10/11;
- Visual Studio C++ build tools with the MSVC v143 toolset;
- a Windows SDK;
- Python supported by `node-gyp`;
- network access during the first build if Electron headers are not cached.

The generated addon is:

```text
electron/native/desktop-host/build/Release/desktop_host.node
```

Development loads that file directly. Windows packaging copies it to:

```text
resources/native/desktop-host/desktop_host.node
```

The native module only performs Windows desktop-host discovery, HWND
parenting, positioning, and validation. Electron owns the BrowserWindow and
the renderer owns the Babylon/React content.
