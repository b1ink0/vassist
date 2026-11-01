import { useEffect, useState } from "react";
import { useDesktopApi } from "../../hooks/useDesktopStore";
import { Button, Select, SettingsRow, Input } from "../ui";
import Toggle from "../common/Toggle";
import { Icon } from "../icons";
import { iconButtonClassName } from "../chat/assistant-controls/panelStyles";
import type { XrBrowserChoice, XrBrowserId } from "../../types/xr";
import {
  useUIConfig,
  useConfigUIActions,
} from "../../hooks/config/useConfigUI";

export function XrSettings({
  isLightBackground = false,
  compact = false,
  iconOnly = false,
}: {
  isLightBackground?: boolean;
  compact?: boolean;
  iconOnly?: boolean;
}) {
  const api = useDesktopApi()?.xr;
  const { xr, enableModelLoading } = useUIConfig();
  const { updateUIConfig } = useConfigUIActions();
  const [browsers, setBrowsers] = useState<XrBrowserChoice[]>([]);
  const browser = xr.browser;
  const forceOpenXR = xr.forceOpenXR;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  useEffect(() => {
    if (!api) return;
    let active = true;
    api
      .browsers()
      .then((choices) => {
        if (!active) return;
        setBrowsers(choices);
      })
      .catch((error) => {
        if (active) setError(String(error));
      });
    return () => {
      active = false;
    };
  }, [api]);
  if (!api) return null;
  const open = async () => {
    if (!enableModelLoading) return;
    setBusy(true);
    setError("");
    try {
      await api.open({
        browser,
        forceOpenXR: browser !== "default" && forceOpenXR,
        ...(xr.clientUrl ? { clientUrl: xr.clientUrl } : {}),
        ...(xr.network ? { network: xr.network } : {}),
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };
  const launchButton = (
    <Button
      className={
        iconOnly
          ? iconButtonClassName
          : compact
            ? "min-h-8 shrink-0 gap-1.5 rounded-lg px-2 text-xs"
            : "w-full"
      }
      aria-label="Open in XR"
      disabled={busy || !enableModelLoading || browsers.length === 0}
      title={!enableModelLoading ? "Enable Avatar to open XR" : "Open in XR"}
      variant={compact ? "ghost" : isLightBackground ? "dark" : "default"}
      onClick={open}
    >
      {iconOnly || compact ? (
        <Icon
          name={busy ? "loading" : "vr-headset"}
          size={18}
          className={busy ? "animate-spin" : ""}
        />
      ) : null}
      {!iconOnly && (busy ? "Please wait…" : compact ? "Open" : "Open in XR")}
    </Button>
  );
  if (compact)
    return (
      <section className="flex flex-col gap-3">
        <h3 className="settings-group-heading">
          <Icon name="vr-headset" size={14} />
          XR
        </h3>
        <div className="settings-control-group">
          <SettingsRow
            label="Open in XR"
            description={
              !enableModelLoading
                ? "Enable Avatar to use XR"
                : "Use your session in a VR browser"
            }
            className="settings-control-row"
          >
            {launchButton}
          </SettingsRow>
        </div>
        {error && (
          <p role="alert" className="text-xs text-current opacity-80">
            {error}
          </p>
        )}
      </section>
    );
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="settings-group-heading">
          <Icon name="vr-headset" size={14} />
          XR
        </h3>
      </div>
      <div className="settings-control-group">
        <SettingsRow label="Browser" className="settings-control-row">
          <Select
            value={browser}
            onChange={(event) =>
              updateUIConfig("xr.browser", event.target.value as XrBrowserId)
            }
            variant={isLightBackground ? "ghost-dark" : "ghost"}
            className="max-w-[11rem] text-right"
            options={browsers.map((choice) => ({
              value: choice.id,
              label: choice.name,
            }))}
          />
        </SettingsRow>
        <SettingsRow
          label="Hosted app URL"
          className="p-3"
          layout="stacked"
          description="Optional. Leave empty to use the bundled app."
        >
          <Input
            variant={isLightBackground ? "dark" : "default"}
            value={xr.clientUrl ?? ""}
            onChange={(event) =>
              updateUIConfig("xr.clientUrl", event.target.value)
            }
            placeholder="https://…"
          />
        </SettingsRow>
        <SettingsRow
          label="Share XR over HTTPS"
          className="settings-control-row"
          description="For a separate headset. Requires a trusted certificate."
        >
          <Toggle
            checked={xr.network?.enabled === true}
            isLightBackground={isLightBackground}
            onChange={(enabled) => {
              if (!enabled) {
                setLink("");
                void api
                  .revoke()
                  .catch((reason: unknown) => setError(String(reason)));
              }
              updateUIConfig("xr.network", {
                enabled,
                hostname: xr.network?.hostname ?? "",
                certPath: xr.network?.certPath ?? "",
                keyPath: xr.network?.keyPath ?? "",
              });
            }}
          />
        </SettingsRow>
        {xr.network?.enabled && (
          <div className="flex flex-col gap-3 p-3">
            <SettingsRow
              label="HTTPS host name"
              layout="stacked"
              description="LAN address or name covered by your certificate."
            >
              <Input
                variant={isLightBackground ? "dark" : "default"}
                value={xr.network.hostname}
                onChange={(event) =>
                  updateUIConfig("xr.network.hostname", event.target.value)
                }
              />
            </SettingsRow>
            <Button
              className="w-full"
              variant={isLightBackground ? "dark" : "default"}
              onClick={async () => {
                try {
                  const files = await api.chooseTlsFiles();
                  if (files)
                    updateUIConfig("xr.network", { ...xr.network, ...files });
                } catch (reason) {
                  setError(String(reason));
                }
              }}
            >
              {xr.network.certPath && xr.network.keyPath
                ? "Change HTTPS certificate"
                : "Choose certificate and key"}
            </Button>
          </div>
        )}
        {browser !== "default" && (
          <SettingsRow
            label="Force OpenXR"
            className="settings-control-row"
            description="Use Chromium's OpenXR runtime switch"
          >
            <Toggle
              checked={forceOpenXR}
              onChange={(value) => updateUIConfig("xr.forceOpenXR", value)}
              isLightBackground={isLightBackground}
            />
          </SettingsRow>
        )}
        <div className="flex flex-col gap-2 p-3">
          {launchButton}
          {!enableModelLoading && (
            <p className="text-xs text-current opacity-60">
              Enable Avatar to use XR.
            </p>
          )}
          <div className="flex flex-wrap gap-2 [&>*]:basis-[calc(50%-0.25rem)] [&>*]:grow">
            <Button
              className="w-full min-w-0"
              title="Create a one-use link for another browser"
              disabled={busy || !enableModelLoading}
              variant={isLightBackground ? "dark" : "default"}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  setLink(
                    (
                      await api.open({
                        browser,
                        forceOpenXR: browser !== "default" && forceOpenXR,
                        launch: false,
                        ...(xr.clientUrl ? { clientUrl: xr.clientUrl } : {}),
                        ...(xr.network ? { network: xr.network } : {}),
                      })
                    ).url,
                  );
                } catch (reason) {
                  setError(
                    reason instanceof Error ? reason.message : String(reason),
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Pairing link
            </Button>
            <Button
              className="w-full min-w-0"
              disabled={busy}
              title="Disconnect paired browsers and stop sharing"
              variant={isLightBackground ? "dark" : "default"}
              onClick={async () => {
                try {
                  await api.revoke();
                  setLink("");
                } catch (reason) {
                  setError(String(reason));
                }
              }}
            >
              Disconnect
            </Button>
          </div>
        </div>
        {link && (
          <div className="flex flex-col gap-2 p-3">
            <p className="text-xs text-current opacity-60">
              One-use link, valid for one minute. Share only with a trusted
              browser.
            </p>
            <Input
              variant={isLightBackground ? "dark" : "default"}
              value={link}
              readOnly
              aria-label="XR pairing link"
            />
            <Button
              className="w-full"
              variant={isLightBackground ? "dark" : "default"}
              onClick={() => {
                void navigator.clipboard
                  .writeText(link)
                  .catch((reason: unknown) => setError(String(reason)));
              }}
            >
              Copy pairing link
            </Button>
          </div>
        )}
        {error && (
          <p role="alert" className="text-xs text-current opacity-80">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
