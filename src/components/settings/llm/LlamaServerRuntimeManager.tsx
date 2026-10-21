import { useEffect, useMemo, useState } from "react";
import type { ElectronLlamaServerAPI } from "../../../types/electron";
import { Button, Select } from "../../ui";
import { Icon } from "../../icons";
import { cn } from "../../../utils/cn";

export interface LlamaRuntimePack {
  id: string;
  title: string;
  size: string;
  requiresLink?: { label: string; url: string };
}

export const CHAT_LLAMA_RUNTIME_PACKS: Record<string, LlamaRuntimePack[]> = {
  "win-x64": [
    { id: "cpu", title: "CPU", size: "~18 MB" },
    { id: "vulkan", title: "Vulkan (any GPU)", size: "~34 MB" },
    { id: "cuda", title: "NVIDIA CUDA 12.4", size: "~640 MB incl. runtime" },
    {
      id: "rocm",
      title: "AMD ROCm 7.14",
      size: "~196 MB",
      requiresLink: {
        label: "ROCm 7.14 setup guide",
        url: "https://github.com/ggml-org/llama.cpp/discussions/27047",
      },
    },
  ],
  "linux-x64": [
    { id: "cpu", title: "CPU", size: "~16 MB" },
    { id: "vulkan", title: "Vulkan (any GPU)", size: "~33 MB" },
    { id: "rocm", title: "AMD ROCm 7.14", size: "~213 MB" },
  ],
  "mac-arm64": [
    { id: "metal", title: "Metal (Apple Silicon)", size: "~11 MB" },
  ],
};

export const DECISION_LLAMA_RUNTIME_PACKS: Record<string, LlamaRuntimePack[]> =
  {
    "win-x64": [
      { id: "cpu", title: "CPU", size: "~18 MB" },
      { id: "vulkan", title: "Vulkan (any GPU)", size: "~34 MB" },
      { id: "cuda", title: "NVIDIA CUDA 12.4", size: "~640 MB incl. runtime" },
      { id: "rocm", title: "AMD ROCm 10.0", size: "~196 MB" },
    ],
    "linux-x64": [
      { id: "cpu", title: "CPU", size: "~16 MB" },
      { id: "vulkan", title: "Vulkan (any GPU)", size: "~33 MB" },
      { id: "rocm", title: "AMD ROCm 10.0", size: "~213 MB" },
    ],
    "mac-arm64": [
      { id: "metal", title: "Metal (Apple Silicon)", size: "~11 MB" },
    ],
  };

interface RuntimeStatus {
  installedBackends?: string[];
  build?: string;
  platformKey?: string;
}

interface RuntimeProgress {
  percent: number;
  status: string;
}

interface LlamaServerRuntimeManagerProps {
  api?: ElectronLlamaServerAPI | null | undefined;
  packs: Record<string, LlamaRuntimePack[]>;
  isLightBackground?: boolean;
  selectedBackend?: string;
  onBackendChange?: (backend: string) => void;
  runtimeChannel?: "pinned" | "latest";
  onRuntimeChannelChange?: (channel: "pinned" | "latest") => void;
  onRequestDeleteBackend?: ((backend: string) => void) | null;
  refreshTrigger?: unknown;
  showBackendSelector?: boolean;
  selectorLabel?: string;
  testIdPrefix?: string;
}

const fallbackPlatform = () =>
  navigator.userAgent.includes("Mac")
    ? "mac-arm64"
    : navigator.userAgent.includes("Linux")
      ? "linux-x64"
      : "win-x64";

const LlamaServerRuntimeManager = ({
  api,
  packs,
  isLightBackground = false,
  selectedBackend = "auto",
  onBackendChange,
  runtimeChannel,
  onRuntimeChannelChange,
  onRequestDeleteBackend = null,
  refreshTrigger,
  showBackendSelector = true,
  selectorLabel = "llama.cpp Runtime Backend",
  testIdPrefix = "llama-backend",
}: LlamaServerRuntimeManagerProps) => {
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(
    null,
  );
  const [installing, setInstalling] = useState<string | null>(null);
  const [progress, setProgress] = useState<RuntimeProgress | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [latestBuild, setLatestBuild] = useState<string | null>(null);

  const refreshStatus = () => {
    const request = api?.getStatus?.();
    return request
      ?.then((status) => {
        if (status && typeof status === "object") {
          setRuntimeStatus(status as RuntimeStatus);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (!api?.getStatus) return;
    refreshStatus();
    const offLog = api.onInstallLog?.((value) => {
      if (value && typeof value === "object" && "message" in value) {
        const message = (value as { message?: unknown }).message;
        if (typeof message === "string") {
          setLogs((previous) => [...previous.slice(-30), message]);
        }
      }
    });
    const offProgress = api.onInstallProgress?.((value) => {
      if (!value || typeof value !== "object") return;
      const next = value as { percent?: unknown; status?: unknown };
      if (typeof next.percent === "number") {
        setProgress({
          percent: Math.max(0, Math.min(100, next.percent)),
          status: typeof next.status === "string" ? next.status : "",
        });
      }
    });
    const offComplete = api.onInstallComplete?.((value) => {
      setInstalling(null);
      setProgress(null);
      if (
        value &&
        typeof value === "object" &&
        (value as { success?: boolean }).success
      ) {
        refreshStatus();
      }
    });
    return () => {
      offLog?.();
      offProgress?.();
      offComplete?.();
    };
    // The API object is stable for the lifetime of the desktop preload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  useEffect(() => {
    if (!api?.getLatestBuild) return;
    let active = true;
    void api
      .getLatestBuild()
      .then((build) => {
        if (active && typeof build === "string") setLatestBuild(build);
      })
      .catch(() => {
        if (active) setLatestBuild(null);
      });
    return () => {
      active = false;
    };
  }, [api]);

  useEffect(() => {
    if (refreshTrigger !== undefined) refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  const platformKey = runtimeStatus?.platformKey ?? fallbackPlatform();
  const runtimePacks = useMemo(
    () => packs[platformKey] ?? [],
    [packs, platformKey],
  );
  const backendOptions = useMemo(() => {
    const options = runtimePacks.map((pack) => ({
      value: pack.id,
      label:
        pack.id === "cpu"
          ? "CPU (~18 MB)"
          : pack.id === "vulkan"
            ? platformKey === "win-x64"
              ? "Vulkan, any GPU (~34 MB)"
              : "Vulkan (~33 MB)"
            : pack.id === "cuda"
              ? "NVIDIA CUDA 12.4 (~640 MB incl. runtime)"
              : pack.title,
    }));
    return [{ value: "auto", label: "Auto" }, ...options];
  }, [platformKey, runtimePacks]);

  const install = async (backend: string) => {
    if (!api?.install) return;
    setInstalling(backend);
    setProgress({ percent: 0, status: "Downloading..." });
    setLogs([]);
    try {
      await api.install(backend, runtimeChannel);
    } catch (error) {
      setInstalling(null);
      setProgress(null);
      setLogs((previous) => [
        ...previous,
        `Install failed: ${error instanceof Error ? error.message : String(error)}`,
      ]);
    }
  };

  return (
    <div className="space-y-2">
      <label className="mb-1 block text-xs font-medium text-white/90">
        {selectorLabel} ({runtimeStatus?.build ?? "pin pending"})
      </label>
      {runtimeChannel && onRuntimeChannelChange && (
        <div className="space-y-1">
          <Select
            data-testid={`${testIdPrefix}-version-select`}
            value={runtimeChannel}
            onChange={(event) =>
              onRuntimeChannelChange(event.target.value as "pinned" | "latest")
            }
            variant={isLightBackground ? "dark" : "default"}
            options={[
              {
                value: "pinned",
                label: `Recommended (b11570)${runtimeStatus?.build === "b11570" ? " · installed" : ""}`,
              },
              {
                value: "latest",
                label: `Latest official${latestBuild ? ` (${latestBuild})` : " (check on install)"}${runtimeStatus?.build === latestBuild && latestBuild ? " · installed" : ""}`,
              },
            ]}
          />
          <p className="text-[11px] text-white/50">
            Latest uses the newest official release and may be less tested.
          </p>
        </div>
      )}
      {showBackendSelector && onBackendChange && (
        <Select
          data-testid={`${testIdPrefix}-select`}
          value={selectedBackend}
          onChange={(event) => onBackendChange(event.target.value)}
          variant={isLightBackground ? "dark" : "default"}
          options={backendOptions}
        />
      )}

      <div className="space-y-2">
        {runtimePacks.map((pack) => {
          const installed = runtimeStatus?.installedBackends?.includes(pack.id);
          const installedForSelectedBuild =
            installed &&
            (!runtimeChannel ||
              (runtimeChannel === "pinned"
                ? runtimeStatus?.build === "b11570"
                : !latestBuild || runtimeStatus?.build === latestBuild));
          const installingThis = installing === pack.id;
          const isActive =
            installed && showBackendSelector && selectedBackend === pack.id;
          return (
            <div
              key={pack.id}
              className={cn(
                "rounded-lg border bg-white/5 p-2 transition-colors md:p-3",
                installingThis ? "border-white/30" : "border-white/10",
              )}
            >
              <div className="mb-1.5 flex items-center justify-between">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium text-white/90">
                    {pack.title}
                  </span>
                  {isActive && (
                    <span className="flex-shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-medium text-white/70">
                      Active
                    </span>
                  )}
                </div>
              </div>

              {installingThis ? (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="truncate text-white/70">
                      {progress?.status || "Downloading..."}
                    </span>
                    <span className="text-white/70">
                      {progress ? `${Math.round(progress.percent)}%` : ""}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full bg-white/40 transition-all duration-300"
                      style={{ width: `${progress?.percent ?? 0}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-white/50">
                    {installedForSelectedBuild
                      ? "Installed"
                      : installed
                        ? `Installed ${runtimeStatus?.build}; update available`
                        : `Download ${pack.size}`}
                  </span>
                  <div className="flex flex-shrink-0 gap-1">
                    {installedForSelectedBuild ? (
                      <button
                        type="button"
                        onClick={() => onRequestDeleteBackend?.(pack.id)}
                        disabled={!onRequestDeleteBackend}
                        data-testid={`${testIdPrefix}-delete-${pack.id}`}
                        className="flex flex-shrink-0 items-center gap-1 rounded bg-white/10 px-2 py-1 text-xs font-medium text-white/80 transition-colors hover:bg-white/20 disabled:opacity-40"
                      >
                        <Icon name="trash" size={11} />
                        <span>Delete</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void install(pack.id)}
                        disabled={Boolean(installing)}
                        data-testid={`${testIdPrefix}-download-${pack.id}`}
                        className="flex flex-shrink-0 items-center gap-1 rounded bg-white/10 px-2 py-1 text-xs font-medium text-white/90 transition-colors hover:bg-white/20 disabled:opacity-40"
                      >
                        <Icon name="download" size={11} />
                        <span>{installed ? "Update" : "Download"}</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
              {pack.requiresLink && (
                <a
                  href={pack.requiresLink.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={cn(
                    "mt-1.5 inline-block text-[11px] underline opacity-75 hover:opacity-100",
                    isLightBackground ? "text-black/70" : "glass-text",
                  )}
                >
                  {pack.requiresLink.label}
                </a>
              )}
            </div>
          );
        })}
        {(logs.length > 0 || progress) && (
          <div className="max-h-24 overflow-y-auto whitespace-pre-wrap rounded bg-black/30 p-2 font-mono text-[10px] text-white/60">
            {(progress
              ? [
                  `[progress] ${progress.status} ${Math.round(progress.percent)}%`,
                ]
              : []
            )
              .concat(logs.slice(-8))
              .map((line, index) => (
                <div key={`${index}-${line.slice(0, 10)}`}>{line}</div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default LlamaServerRuntimeManager;
