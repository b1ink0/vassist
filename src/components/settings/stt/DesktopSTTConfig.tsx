import { useEffect, useRef, useState } from "react";
import { Icon } from "../../icons";
import { useDesktopApi } from "../../../hooks/useDesktopStore";
import { cn } from "../../../utils/cn";
import { Button, Input, Select } from "../../ui";

interface DesktopSTTConfigShape {
  endpoint?: string;
  model?: string;
  language?: string;
  threads?: number;
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
  isSetupMode = false,
  isLightBackground = false,
}: DesktopSTTConfigProps) => {
  const desktopAPI = useDesktopApi();
  const whisperSetup = desktopAPI?.whisperSetup as WhisperSetupApi | undefined;
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [isSetupRunning, setIsSetupRunning] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupComplete, setSetupComplete] = useState(false);
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
  const isPartialInstall = Boolean(
    setupStatus &&
    !setupStatus.isSetup &&
    (setupStatus.pythonExists ||
      setupStatus.dependenciesInstalled ||
      setupStatus.modelExists),
  );
  const canManageSetup = Boolean(whisperSetup);

  return (
    <div className="space-y-3">
      {/* Info Banner */}
      <div className="p-3 rounded-lg bg-white/10 border border-white/20">
        <div className="flex items-start gap-2">
          <Icon
            name="microphone"
            size={18}
            className="text-white/90 shrink-0 mt-0.5"
          />
          <p className="text-xs text-white/90">
            <span className="font-semibold">Desktop Local STT</span> - On-device
            speech recognition using Whisper via Electron!
          </p>
        </div>
      </div>

      {/* Status */}
      <div className="p-3 rounded-lg bg-white/5 border border-white/10">
        <div className="flex items-center gap-2 mb-2">
          <div
            className={cn(
              "w-2 h-2 rounded-full",
              isInstalled ? "bg-green-400" : "bg-yellow-400",
            )}
          ></div>
          <span className="text-sm font-semibold text-white/90">
            {isInstalled ? "Whisper is ready to use" : "Whisper setup required"}
          </span>
        </div>
        <p className="text-xs text-white/60">
          Model: faster-whisper {config.model || "tiny"} • Local speech
          recognition
        </p>
      </div>

      {/* Setup actions */}
      {canManageSetup && (
        <div className="space-y-2">
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
            <div className="space-y-2">
              <label className="block text-xs font-medium text-white/80">
                Setup Log
              </label>
              <div
                ref={logsContainerRef}
                className={cn(
                  "glass-input h-40 overflow-y-auto p-2 font-mono text-[11px] whitespace-pre-wrap",
                  isLightBackground && "glass-input-dark",
                )}
              >
                {logs.map((log, index) => (
                  <div key={index} className="text-white/80">
                    {log}
                  </div>
                ))}
              </div>

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
                  <p className="text-xs text-red-300/80 mt-1">{setupError}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Core model settings */}
      <div className="space-y-3 p-3 rounded-lg bg-white/5 border border-white/10">
        <div>
          <label className="block text-xs font-medium text-white/90 mb-1">
            Whisper Model
          </label>
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
          <p className="text-[10px] text-white/50 mt-1">
            Pick multilingual tiny/base for multi-language STT, or *.en for
            English-only.
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-white/90 mb-1">
            Language
          </label>
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
        </div>
      </div>

      {/* Advanced Config */}
      <details className="group" open={isSetupMode}>
        <summary className="cursor-pointer text-sm font-medium text-white/90 flex items-center justify-between p-2 rounded hover:bg-white/5">
          <span>Advanced Settings</span>
          <Icon
            name="arrow-down"
            size={14}
            className="group-open:rotate-180 transition-transform"
          />
        </summary>
        <div className="mt-2 space-y-3">
          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">
              Endpoint URL
            </label>
            <Input
              type="text"
              value={config.endpoint || "http://127.0.0.1:11438"}
              onChange={(e) => handleChange("endpoint", e.target.value)}
              placeholder="http://127.0.0.1:11438"
              variant={isLightBackground ? "dark" : "default"}
            />
            <p className="text-[10px] text-white/50 mt-1">
              Local AI server endpoint
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">
              Threads ({config.threads || 4})
            </label>
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
            <p className="text-[10px] text-white/50 mt-1">
              CPU threads for processing
            </p>
          </div>
        </div>
      </details>
    </div>
  );
};

export default DesktopSTTConfig;
