import SettingsScrollArea from "../shared/SettingsScrollArea";
import Dialog from "../../common/Dialog";
import { useEffect, useRef, useState } from "react";
import { Icon } from "../../icons";
import { useDesktopApi } from "../../../hooks/useDesktopStore";
import { cn } from "../../../utils/cn";
import { Button, Input, Select } from "../../ui";
import { DEFAULT_ENDPOINTS } from "../../../config/serviceEndpoints";
import SettingsDisclosure from "../shared/SettingsDisclosure";
import SettingsRow from "../../ui/SettingsRow";

interface DesktopSTTConfigShape {
  endpoint?: string;
  model?: string;
  language?: string;
  threads?: number;
  engine?: "python" | "whispercpp";
  whisperCppVariant?: string | undefined;
}

interface WhisperCppVariant {
  id: string;
  label: string;
  sizeHint: string;
  installed: boolean;
}

interface WhisperCppModel {
  id: string;
  label: string;
  file: string;
  sizeHint: string;
  downloaded: boolean;
  active: boolean;
  sizeBytes: number;
}

interface WhisperCppStatus {
  engine: string;
  port: number;
  variants: WhisperCppVariant[];
  models: WhisperCppModel[];
  running: boolean;
}

interface WhisperCppApi {
  getStatus?: () => Promise<WhisperCppStatus>;
  setEngine?: (engine: string) => Promise<unknown>;
  startSetup?: (options: { variantId: string }) => Promise<unknown>;
  downloadModel?: (options: { modelId: string }) => Promise<unknown>;
  deleteModel?: (options: { modelId: string }) => Promise<{ deleted: boolean }>;
  onLog?: (
    cb: (log: { message?: string; type?: string }) => void,
  ) => (() => void) | undefined;
  onSetupProgress?: (
    cb: (progress: { percent?: number; status?: string }) => void,
  ) => (() => void) | undefined;
  onComplete?: (
    cb: (result: { success?: boolean; error?: string }) => void,
  ) => (() => void) | undefined;
  onModelProgress?: (
    cb: (progress: { id?: string; percent?: number; status?: string }) => void,
  ) => (() => void) | undefined;
  onModelComplete?: (
    cb: (result: { id?: string; success?: boolean; error?: string }) => void,
  ) => (() => void) | undefined;
}

interface SetupStatus {
  isSetup?: boolean;
  pythonExists?: boolean;
  dependenciesInstalled?: boolean;
  modelExists?: boolean;
}

interface SetupLogMessage {
  message: string;
}

interface SetupResult {
  success?: boolean;
  error?: string;
}

interface WhisperSetupApi {
  getStatus?: () => Promise<SetupStatus>;
  onLog?: (
    callback: (log: SetupLogMessage) => void,
  ) => (() => void) | undefined;
  onComplete?: (
    callback: (result: SetupResult) => void,
  ) => (() => void) | undefined;
  start?: (options: { model: string }) => Promise<void>;
  cancel?: () => Promise<void>;
}

interface DesktopSTTConfigProps {
  config?: DesktopSTTConfigShape;
  onChange: (updates: Record<string, unknown>) => void;
  isSetupMode?: boolean;
  isLightBackground?: boolean;
  onRequestDeleteDialog?: ((modelId: string) => void) | undefined;
  externalDeleteTick?: number | undefined;
}

/**
 * Reusable Desktop STT Configuration Component
 * Used in both setup wizard and settings panel for desktop-local STT provider
 *
 * @param {Object} config - Current STT configuration (endpoint, model, etc.)
 * @param {Function} onChange - Callback when configuration changes
 * @param {boolean} isLightBackground - Whether component is on light background
 * @param {boolean} showTitle - Whether to show section title
 * @param {boolean} isSetupMode - Whether in setup wizard (affects UI slightly)
 */
const DesktopSTTConfig = ({
  config = {},
  onChange,
  isLightBackground = false,
  onRequestDeleteDialog,
  externalDeleteTick,
}: DesktopSTTConfigProps) => {
  const desktopAPI = useDesktopApi();
  const whisperSetup = desktopAPI?.whisperSetup as WhisperSetupApi | undefined;
  const whisperCpp = desktopAPI?.whisperCpp as WhisperCppApi | undefined;
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [cppStatus, setCppStatus] = useState<WhisperCppStatus | null>(null);
  const [cppLog, setCppLog] = useState<string[]>([]);
  const [cppInstalling, setCppInstalling] = useState(false);
  const [cppProgress, setCppProgress] = useState("");
  const [downloadingModels, setDownloadingModels] = useState<
    Record<string, string>
  >({});
  const [cppProgressVariantId, setCppProgressVariantId] = useState<
    string | null
  >(null);
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [isSetupRunning, setIsSetupRunning] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupComplete, setSetupComplete] = useState(false);

  // ── whisper.cpp engine state ──
  const refreshCppStatus = () => {
    if (!whisperCpp?.getStatus) return;
    whisperCpp
      .getStatus()
      .then((status) => setCppStatus(status))
      .catch(() => setCppStatus(null));
  };

  // Live progress per item, driven by IPC events + getStatus polling
  const modelProgressRef = useRef<Record<string, number>>({});
  // Ref mirror so the status poller reads live values without re-subscribing
  const activityRef = useRef({ installing: false, downloading: false });
  const [cppProgressPct, setCppProgressPct] = useState<number | null>(null);
  const [modelProgressPct, setModelProgressPct] = useState<
    Record<string, number>
  >({});

  useEffect(() => {
    refreshCppStatus();
    if (!whisperCpp?.onLog || !whisperCpp?.onComplete) return;
    const unsubLog = whisperCpp.onLog((log) => {
      const message =
        typeof log?.message === "string" ? log.message : String(log ?? "");
      setCppLog((prev) => [...prev.slice(-40), message]);
    });
    const unsubProgress = whisperCpp.onSetupProgress?.((progress) => {
      const pct =
        typeof progress?.percent === "number"
          ? Math.max(0, Math.min(100, progress.percent))
          : null;
      const text =
        `${progress?.status ?? ""} ${pct != null ? `${pct}%` : ""}`.trim();
      setCppProgress(text);
      if (pct != null) setCppProgressPct(pct);
    });
    const unsubComplete = whisperCpp.onComplete((result) => {
      setCppInstalling(false);
      setCppProgress("");
      setCppProgressVariantId(null);
      setCppProgressPct(null);
      if (!result?.success && result?.error) {
        setCppLog((prev) => [...prev.slice(-5), `Error: ${result.error}`]);
      }
      refreshCppStatus();
    });
    const unsubModelProgress = whisperCpp.onModelProgress?.((progress) => {
      if (!progress?.id) return;
      const id = progress.id as string;
      const pct =
        typeof progress.percent === "number"
          ? Math.max(0, Math.min(100, progress.percent))
          : 0;
      modelProgressRef.current[id] = pct;
      setModelProgressPct({ ...modelProgressRef.current });
      setDownloadingModels((prev) => ({
        ...prev,
        [id]: `${progress.status ?? ""} ${progress.percent != null ? `${Math.round(progress.percent)}%` : ""}`.trim(),
      }));
    });
    const unsubModelComplete = whisperCpp.onModelComplete?.((result) => {
      if (result?.id) {
        setDownloadingModels((prev) => {
          const next = { ...prev };
          delete next[result.id as string];
          return next;
        });
      }
      refreshCppStatus();
    });

    // Poll real backend state while any activity is in flight — never rely
    // on event state alone.
    const poll = setInterval(() => {
      if (activityRef.current.installing || activityRef.current.downloading) {
        refreshCppStatus();
      }
    }, 1500);

    return () => {
      unsubLog?.();
      unsubProgress?.();
      unsubComplete?.();
      unsubModelProgress?.();
      unsubModelComplete?.();
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    activityRef.current.installing = cppInstalling;
    activityRef.current.downloading = Object.keys(downloadingModels).length > 0;
  }, [cppInstalling, downloadingModels]);

  useEffect(() => {
    if (externalDeleteTick) {
      refreshCppStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalDeleteTick]);

  const [logs, setLogs] = useState<string[]>([]);
  const logsContainerRef = useRef<HTMLDivElement | null>(null);

  const handleChange = (key: string, value: string | number) => {
    onChange({ [key]: value });
  };

  useEffect(() => {
    if (!whisperSetup?.getStatus) return;

    whisperSetup
      .getStatus()
      .then(setSetupStatus)
      .catch((error: unknown) => {
        console.error("[DesktopSTTConfig] Whisper status check failed:", error);
      });
  }, [whisperSetup]);

  useEffect(() => {
    if (!whisperSetup?.onLog || !whisperSetup?.onComplete) return;

    const unsubscribeLog = whisperSetup.onLog((log: SetupLogMessage) => {
      setLogs((prev) => [...prev, log.message]);
    });

    const unsubscribeComplete = whisperSetup.onComplete(
      (result: SetupResult) => {
        setIsSetupRunning(false);

        if (result.success) {
          setSetupComplete(true);
          setSetupError(null);
          whisperSetup
            .getStatus?.()
            .then(setSetupStatus)
            .catch((error: unknown) => {
              console.error(
                "[DesktopSTTConfig] Whisper status refresh failed:",
                error,
              );
            });
        } else {
          setSetupComplete(false);
          setSetupError(result.error || "Whisper setup failed");
        }
      },
    );

    return () => {
      unsubscribeLog?.();
      unsubscribeComplete?.();
    };
  }, [whisperSetup]);

  useEffect(() => {
    if (!logsContainerRef.current) return;
    logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
  }, [logs]);

  const handleStartSetup = async () => {
    if (!whisperSetup?.start) return;

    setIsSetupRunning(true);
    setSetupError(null);
    setSetupComplete(false);
    setLogs([]);

    try {
      const selectedModel = (config.model || "tiny").toString().trim();
      await whisperSetup.start({ model: selectedModel });
    } catch (error: unknown) {
      setIsSetupRunning(false);
      setSetupError(
        error instanceof Error ? error.message : "Failed to start setup",
      );
    }
  };

  const handleCancelSetup = async () => {
    if (!whisperSetup?.cancel) return;

    try {
      await whisperSetup.cancel();
      setIsSetupRunning(false);
      setLogs((prev) => [...prev, "\n❌ Setup cancelled by user\n"]);
    } catch (error) {
      console.error("[DesktopSTTConfig] Whisper setup cancel failed:", error);
    }
  };

  const handleVerifySetup = async () => {
    if (!whisperSetup?.getStatus) return;

    try {
      setSetupError(null);
      const status = await whisperSetup.getStatus();
      setSetupStatus(status);
      if (status?.isSetup) {
        setSetupComplete(true);
      }
    } catch (error: unknown) {
      setSetupError(
        error instanceof Error
          ? error.message
          : "Failed to verify setup status",
      );
    }
  };

  const isInstalled = Boolean(setupStatus?.isSetup);
  const isWhisperCppInstalled = Boolean(
    cppStatus?.variants.some((variant) => variant.installed),
  );
  const isSelectedEngineInstalled =
    config.engine === "whispercpp" ? isWhisperCppInstalled : isInstalled;
  const isPartialInstall = Boolean(
    setupStatus &&
    !setupStatus.isSetup &&
    (setupStatus.pythonExists ||
      setupStatus.dependenciesInstalled ||
      setupStatus.modelExists),
  );
  const canManageSetup = Boolean(whisperSetup);

  return (
    <div className="flex flex-col gap-3">
      {/* Info Banner */}
      <div className="p-3 rounded-lg bg-current/10 border border-current/20">
        <div className="flex items-start gap-2">
          <Icon
            name="microphone"
            size={18}
            className="vassist-text-primary shrink-0 pt-0.5"
          />
          <p className="text-xs vassist-text-primary">
            <span className="font-semibold">Desktop Local STT</span> - On-device
            speech recognition using Whisper via Electron!
          </p>
        </div>
      </div>

      {/* Status */}
      <div className="settings-section">
        <div className="flex items-center gap-2 pb-2">
          <div
            className={cn(
              "w-2 h-2 rounded-full",
              isSelectedEngineInstalled ? "bg-green-400" : "bg-yellow-400",
            )}
          ></div>
          <span className="text-sm font-semibold vassist-text-primary">
            {config.engine === "whispercpp"
              ? isWhisperCppInstalled
                ? "whisper.cpp runtime is ready"
                : "whisper.cpp runtime setup required"
              : isInstalled
                ? "faster-whisper is ready to use"
                : "faster-whisper setup required"}
          </span>
        </div>
        <p className="text-xs vassist-text-muted">
          Model: faster-whisper {config.model || "tiny"} • Local speech
          recognition
        </p>
      </div>

      {/* Setup actions */}
      {config.engine !== "whispercpp" && canManageSetup && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button
              onClick={handleStartSetup}
              disabled={isSetupRunning}
              variant={isLightBackground ? "dark" : "default"}
              className="flex-1 text-sm flex items-center justify-center gap-2"
            >
              {isSetupRunning ? (
                <>
                  <Icon name="loader" size={14} className="animate-spin" />
                  Initializing...
                </>
              ) : (
                <>
                  <Icon
                    name={
                      isInstalled || isPartialInstall
                        ? "refresh-cw"
                        : "download"
                    }
                    size={14}
                  />
                  {isInstalled
                    ? "Re-initialize Whisper"
                    : isPartialInstall
                      ? "Complete Whisper Setup"
                      : "Initialize Whisper"}
                </>
              )}
            </Button>

            <Button
              onClick={handleVerifySetup}
              disabled={isSetupRunning}
              variant={isLightBackground ? "dark" : "default"}
              className="text-sm flex items-center justify-center gap-2"
              title="Verify Whisper setup status"
            >
              <Icon name="check-circle" size={14} />
              Verify
            </Button>

            {isSetupRunning && (
              <Button
                onClick={handleCancelSetup}
                variant={isLightBackground ? "dark" : "default"}
                className="hover:bg-red-500/20"
                title="Cancel Whisper setup"
              >
                <Icon name="x" size={14} />
              </Button>
            )}
          </div>

          {(isSetupRunning ||
            setupError ||
            setupComplete ||
            logs.length > 0) && (
            <div className="flex flex-col gap-2">
              <label className="block text-xs font-medium vassist-text-primary">
                Setup Log
              </label>
              <SettingsScrollArea
                ref={logsContainerRef}
                className={cn(
                  "glass-input h-40 overflow-y-auto p-2 font-mono text-[11px] whitespace-pre-wrap",
                  isLightBackground && "glass-input-dark",
                )}
              >
                {logs.map((log, index) => (
                  <div key={index} className="vassist-text-primary">
                    {log}
                  </div>
                ))}
              </SettingsScrollArea>

              {setupComplete && (
                <div className="p-2 bg-green-500/10 border border-green-500/30 rounded-lg">
                  <div className="flex items-center gap-2 text-green-400">
                    <Icon name="check-circle" size={14} />
                    <span className="text-xs font-medium">
                      Whisper setup complete
                    </span>
                  </div>
                </div>
              )}

              {setupError && (
                <div className="p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <div className="flex items-center gap-2 text-red-400">
                    <Icon name="alert-circle" size={14} />
                    <span className="text-xs font-medium">Setup failed</span>
                  </div>
                  <p className="text-xs text-red-300/80 pt-1">{setupError}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Engine selection and runtime setup are available in both setup and settings. */}
      <div className="flex flex-col gap-3 settings-section">
        <SettingsRow
          label="STT Engine"
          description="Both engines can be installed side by side — this selects which one serves speech-to-text."
          layout="stacked"
        >
          <Select
            value={config.engine || "python"}
            onChange={(e) => {
              const engine = e.target.value as "python" | "whispercpp";
              handleChange("engine", engine);
              whisperCpp?.setEngine?.(engine);
              refreshCppStatus();
            }}
            variant={isLightBackground ? "dark" : "default"}
            options={[
              {
                value: "python",
                label: "faster-whisper (Python · CUDA on NVIDIA)",
              },
              {
                value: "whispercpp",
                label: "whisper.cpp (CPU / CUDA / Vulkan packs)",
              },
            ]}
          />
        </SettingsRow>

        {config.engine === "whispercpp" && (
          <div className="flex flex-col gap-4 pt-1">
            {/* Runtime variants — same card language as the Android STT downloader */}
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium vassist-text-primary">
                Runtime{cppStatus?.running ? " (server running)" : ""}
              </p>
              {(cppStatus?.variants ?? []).map((variant) => {
                const installingThis =
                  cppInstalling && cppProgressVariantId === variant.id;
                return (
                  <div
                    key={variant.id}
                    className={cn(
                      "p-2 md:p-3 rounded-lg bg-current/5 border transition-colors",
                      installingThis
                        ? "border-current/30"
                        : "border-current/10",
                    )}
                  >
                    <div className="flex items-center justify-between pb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium vassist-text-primary truncate">
                          {variant.label}
                        </span>
                        {variant.id === config.whisperCppVariant && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-current/10 vassist-text-secondary flex-shrink-0">
                            Active
                          </span>
                        )}
                      </div>
                    </div>

                    {installingThis ? (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="vassist-text-secondary">
                            {cppProgress.replace(/\s*\d+%$/, "")}
                          </span>
                          <span className="vassist-text-secondary">
                            {cppProgressPct != null ? `${cppProgressPct}%` : ""}
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-current/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-current/40 transition-all duration-300"
                            style={{ width: `${cppProgressPct ?? 0}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs vassist-text-muted truncate">
                          {variant.installed
                            ? "Installed"
                            : `Download ${variant.sizeHint}`}
                        </span>
                        <div className="flex gap-1 flex-shrink-0">
                          {variant.installed &&
                            variant.id !== config.whisperCppVariant && (
                              <button
                                onClick={() => {
                                  onChange({ whisperCppVariant: variant.id });
                                }}
                                className="px-2 py-1 rounded bg-current/10 hover:bg-current/20 vassist-text-primary text-xs font-medium transition-colors flex items-center gap-1 flex-shrink-0"
                              >
                                <Icon name="check" size={11} />
                                <span>Use</span>
                              </button>
                            )}
                          <button
                            onClick={async () => {
                              setCppInstalling(true);
                              setCppProgressVariantId(variant.id);
                              setCppLog([]);
                              try {
                                await whisperCpp?.startSetup?.({
                                  variantId: variant.id,
                                });
                              } catch (error) {
                                setCppInstalling(false);
                                setCppProgressVariantId(null);
                                setCppLog((prev) => [
                                  ...prev,
                                  `Error: ${String(error)}`,
                                ]);
                              }
                            }}
                            disabled={cppInstalling}
                            className="px-2 py-1 rounded bg-current/10 hover:bg-current/20 vassist-text-primary text-xs font-medium transition-colors flex items-center gap-1 flex-shrink-0 disabled:opacity-40"
                          >
                            <Icon name="download" size={11} />
                            <span>
                              {variant.installed ? "Reinstall" : "Install"}
                            </span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {(cppLog.length > 0 || cppProgress) && (
                <SettingsScrollArea className="max-h-24 overflow-y-auto p-2 rounded bg-black/30 font-mono text-[10px] vassist-text-muted whitespace-pre-wrap">
                  {cppLog.slice(-12).map((line, index) => (
                    <div key={`${index}-${line.slice(0, 8)}`}>{line}</div>
                  ))}
                </SettingsScrollArea>
              )}
            </div>

            {/* GGML models */}
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium vassist-text-primary">Models</p>
              {(cppStatus?.models ?? []).map((model) => {
                const progress = downloadingModels[model.id];
                return (
                  <div
                    key={model.id}
                    className={cn(
                      "p-2 md:p-3 rounded-lg bg-current/5 border transition-colors",
                      progress ? "border-current/30" : "border-current/10",
                    )}
                  >
                    <div className="flex items-center justify-between pb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium vassist-text-primary truncate">
                          {model.label}
                        </span>
                        {model.active && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-current/10 vassist-text-secondary flex-shrink-0">
                            Active
                          </span>
                        )}
                      </div>
                    </div>

                    {progress ? (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="vassist-text-secondary">
                            {progress.replace(/\s*\d+%$/, "")}
                          </span>
                          <span className="vassist-text-secondary">
                            {modelProgressPct[model.id] != null
                              ? `${modelProgressPct[model.id]}%`
                              : ""}
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-current/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-current/40 transition-all duration-300"
                            style={{
                              width: `${modelProgressPct[model.id] ?? 0}%`,
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs vassist-text-muted truncate">
                          {model.downloaded
                            ? `Installed (${(model.sizeBytes / 1024 / 1024).toFixed(0)} MB)`
                            : `Download ${model.sizeHint}`}
                        </span>
                        <div className="flex gap-1 flex-shrink-0">
                          {model.downloaded ? (
                            <button
                              onClick={() => {
                                if (onRequestDeleteDialog) {
                                  onRequestDeleteDialog(
                                    `whispercpp:${model.id}`,
                                  );
                                } else {
                                  setPendingDelete(model.id);
                                }
                              }}
                              data-testid={`stt-cpp-model-delete-${model.id}`}
                              className="px-2 py-1 rounded bg-current/10 hover:bg-current/20 vassist-text-primary text-xs font-medium transition-colors flex items-center gap-1 flex-shrink-0"
                            >
                              <Icon name="trash" size={11} />
                              <span>Delete</span>
                            </button>
                          ) : (
                            <button
                              onClick={() =>
                                whisperCpp?.downloadModel?.({
                                  modelId: model.id,
                                })
                              }
                              className="px-2 py-1 rounded bg-current/10 hover:bg-current/20 vassist-text-primary text-xs font-medium transition-colors flex items-center gap-1 flex-shrink-0"
                            >
                              <Icon name="download" size={11} />
                              <span>Download</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Core model settings */}
      <div className="flex flex-col gap-3 settings-section">
        {config.engine !== "whispercpp" && (
          <SettingsRow
            label="Whisper Model"
            description="Pick multilingual tiny/base for multi-language STT, or *.en for English-only."
            layout="stacked"
          >
            <Select
              value={config.model || "tiny"}
              onChange={(e) => handleChange("model", e.target.value)}
              variant={isLightBackground ? "dark" : "default"}
              options={[
                {
                  value: "tiny",
                  label: "tiny (multilingual, ~75-80MB, fastest)",
                },
                {
                  value: "base",
                  label: "base (multilingual, ~140-150MB, better accuracy)",
                },
                { value: "tiny.en", label: "tiny.en (English-only, ~75MB)" },
                { value: "base.en", label: "base.en (English-only, ~140MB)" },
              ]}
            />
          </SettingsRow>
        )}

        <SettingsRow label="Language" layout="stacked">
          <Select
            value={config.language || "auto"}
            onChange={(e) => handleChange("language", e.target.value)}
            variant={isLightBackground ? "dark" : "default"}
            options={[
              { value: "auto", label: "Auto-detect" },
              { value: "en", label: "English" },
              { value: "es", label: "Spanish" },
              { value: "fr", label: "French" },
              { value: "de", label: "German" },
              { value: "it", label: "Italian" },
              { value: "pt", label: "Portuguese" },
              { value: "zh", label: "Chinese" },
              { value: "ja", label: "Japanese" },
              { value: "ko", label: "Korean" },
            ]}
          />
        </SettingsRow>
      </div>

      {/* Advanced Config */}
      <SettingsDisclosure
        title={
          <>
            <span>Advanced Settings</span>
          </>
        }
      >
        <div className="pt-2 flex flex-col gap-3">
          <SettingsRow
            label="Endpoint URL"
            description="Local AI server endpoint"
            layout="stacked"
          >
            <Input
              type="text"
              value={config.endpoint || DEFAULT_ENDPOINTS.desktopLocal}
              onChange={(e) => handleChange("endpoint", e.target.value)}
              placeholder={DEFAULT_ENDPOINTS.desktopLocal}
              variant={isLightBackground ? "dark" : "default"}
            />
          </SettingsRow>

          <SettingsRow
            label={<>Threads ({config.threads || 4})</>}
            description="CPU threads for processing"
            layout="stacked"
          >
            <Input
              type="number"
              min="1"
              max="16"
              value={config.threads || 4}
              onChange={(e) =>
                handleChange("threads", parseInt(e.target.value))
              }
              variant={isLightBackground ? "dark" : "default"}
            />
          </SettingsRow>
        </div>
      </SettingsDisclosure>
      {pendingDelete && (
        <Dialog
          type="delete"
          title="Delete speech model"
          message={`Delete the installed ${pendingDelete} model?`}
          isLightBackground={isLightBackground}
          onCancel={() => setPendingDelete(null)}
          onConfirmComplete={() => setPendingDelete(null)}
          onConfirm={async () => {
            if (!whisperCpp?.deleteModel)
              throw new Error("Model deletion is unavailable");
            const result = await whisperCpp.deleteModel({
              modelId: pendingDelete,
            });
            if (!result.deleted)
              throw new Error("The model could not be deleted");
            refreshCppStatus();
          }}
        />
      )}
    </div>
  );
};

export default DesktopSTTConfig;
