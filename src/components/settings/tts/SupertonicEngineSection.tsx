import { useEffect, useRef, useState } from "react";
import { Icon } from "../../icons";
import { useDesktopApi } from "../../../hooks/useDesktopStore";
import { Button, Select } from "../../ui";

interface SetupLogMessage {
  message?: string;
  type?: string;
}

interface SetupResult {
  success?: boolean;
  error?: string;
}

interface SupertonicSetupApi {
  start?: (options: Record<string, unknown>) => Promise<unknown>;
  cancel?: () => Promise<{ cancelled: boolean }>;
  getStatus?: () => Promise<{
    isSetup?: boolean;
    dependenciesInstalled?: boolean;
    modelExists?: boolean;
  }>;
  onLog?: (
    callback: (log: SetupLogMessage) => void,
  ) => (() => void) | undefined;
  onComplete?: (
    callback: (result: SetupResult) => void,
  ) => (() => void) | undefined;
}

interface SupertonicEngineSectionProps {
  /** "gpt-sovits" | "supertonic" */
  engine?: string;
  supertonicVoice?: string;
  supertonicLang?: string;
  supertonicSteps?: number;
  isLightBackground?: boolean;
  onChange: (updates: Record<string, unknown>) => void;
}

const SUPERTONIC_VOICES = [
  { value: "F1", label: "Female (F1)" },
  { value: "F2", label: "Female (F2)" },
  { value: "F3", label: "Female (F3)" },
  { value: "F4", label: "Female (F4)" },
  { value: "F5", label: "Female (F5)" },
  { value: "M1", label: "Male (M1)" },
  { value: "M2", label: "Male (M2)" },
  { value: "M3", label: "Male (M3)" },
  { value: "M4", label: "Male (M4)" },
  { value: "M5", label: "Male (M5)" },
];

const SUPERTONIC_LANGUAGES = [
  { value: "na", label: "Auto (engine handles language)" },
  { value: "en", label: "English" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "de", label: "German" },
  { value: "fr", label: "French" },
  { value: "es", label: "Spanish" },
  { value: "zh", label: "Chinese" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
  { value: "ru", label: "Russian" },
];

const SUPERTONIC_STEPS = [
  { value: "5", label: "Fast (5 steps)" },
  { value: "8", label: "Balanced (8 steps)" },
  { value: "10", label: "High quality (10 steps)" },
  { value: "12", label: "Best quality (12 steps)" },
];

/**
 * Supertonic 3 engine section for desktop-local TTS settings:
 * one-time install (with live progress + logs), then voice / language /
 * quality selection. Mirrors the GPT-SoVITS setup UX.
 */
const SupertonicEngineSection = ({
  engine,
  supertonicVoice = "F1",
  supertonicLang = "en",
  supertonicSteps = 8,
  isLightBackground = false,
  onChange,
}: SupertonicEngineSectionProps) => {
  const desktopAPI = useDesktopApi();
  const setupApi = desktopAPI?.supertonicSetup as
    | SupertonicSetupApi
    | undefined;

  const [isInstalled, setIsInstalled] = useState<boolean | null>(null);
  const [isSetupRunning, setIsSetupRunning] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupComplete, setSetupComplete] = useState(false);
  const logContainerRef = useRef<HTMLDivElement | null>(null);

  // Probe real install status on mount (persists across app restarts)
  useEffect(() => {
    if (!setupApi?.getStatus) {
      setIsInstalled(false);
      return;
    }
    setupApi
      .getStatus()
      .then((status) => setIsInstalled(status?.isSetup === true))
      .catch(() => setIsInstalled(false));
  }, [setupApi]);

  useEffect(() => {
    if (!setupApi?.onLog || !setupApi?.onComplete) return;

    const unsubLog = setupApi.onLog((log: SetupLogMessage) => {
      const message =
        typeof log?.message === "string"
          ? log.message
          : String((log as unknown) ?? "");
      setLogs((prevLogs) => [...prevLogs.slice(-200), message]);
      // Surface coarse progress from installer output lines
      if (message.includes("Downloading") || message.includes("%")) {
        setProgressText(message.trim());
      }
      if (message.includes("model-ready")) {
        setProgressText("Finalizing install...");
      }
    });

    const unsubComplete = setupApi.onComplete((result: SetupResult) => {
      setIsSetupRunning(false);
      setProgressText("");
      if (result?.success) {
        setIsInstalled(true);
        setSetupComplete(true);
        setSetupError(null);
      } else if (!result?.success && result?.error) {
        setSetupError(result.error);
      }
    });

    return () => {
      unsubLog?.();
      unsubComplete?.();
    };
  }, [setupApi]);

  // Auto-scroll logs while installing
  useEffect(() => {
    if (logContainerRef.current && isSetupRunning) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, isSetupRunning]);

  const handleInstall = async () => {
    setIsSetupRunning(true);
    setLogs([]);
    setSetupComplete(false);
    setSetupError(null);
    try {
      await setupApi?.start?.({});
      // If the promise resolves without a completion event, treat as running.
    } catch (error: unknown) {
      setSetupError(error instanceof Error ? error.message : String(error));
      setIsSetupRunning(false);
    }
  };

  const handleCancel = async () => {
    try {
      await setupApi?.cancel?.();
    } finally {
      setIsSetupRunning(false);
    }
  };

  return (
    <div className="space-y-3 p-3 rounded-lg bg-white/5 border border-white/10 mt-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-white/90">
            Supertonic 3 Local Voice Engine
          </p>
          <p className="text-[10px] text-white/50 mt-0.5">
            Lightning-fast fixed-voice TTS · 31 languages · runs on CPU (~400 MB
            one-time download)
          </p>
        </div>
        {isInstalled === true && !isSetupRunning && (
          <span className="text-xs text-green-400 flex-shrink-0">
            Installed
          </span>
        )}
      </div>

      {/* Install section */}
      {(isInstalled !== true || isSetupRunning) && (
        <div className="space-y-2">
          {!isSetupRunning ? (
            <Button
              onClick={handleInstall}
              data-testid="supertonic-install-button"
              disabled={isSetupRunning}
              variant={isLightBackground ? "dark" : "default"}
              className="flex-1 flex items-center justify-center gap-2"
            >
              <Icon name="download" size={16} />
              Install Supertonic 3 (~400 MB)
            </Button>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse flex-shrink-0" />
                <p className="text-xs text-yellow-300">
                  Installing... {progressText}
                </p>
                <Button
                  onClick={handleCancel}
                  variant={isLightBackground ? "dark" : "default"}
                  className="hover:bg-red-500/20"
                  title="Cancel Installation"
                >
                  <Icon name="x" size={16} />
                </Button>
              </div>
              {logs.length > 0 && (
                <div
                  ref={logContainerRef}
                  className="max-h-32 overflow-y-auto p-2 rounded bg-black/30 font-mono text-[10px] text-white/60 whitespace-pre-wrap"
                >
                  {logs.slice(-30).map((line, index) => (
                    <div key={`${index}-${line.slice(0, 10)}`}>{line}</div>
                  ))}
                </div>
              )}
            </>
          )}

          {setupError && (
            <div className="flex items-start gap-2 p-2 rounded bg-red-500/10 border border-red-500/20">
              <span className="text-xs font-medium text-red-300">
                Setup failed
              </span>
              <p className="text-xs text-red-300/80">{setupError}</p>
            </div>
          )}

          {setupComplete && (
            <div className="flex items-center gap-2 p-2 rounded bg-green-500/10 border border-green-500/20">
              <span className="text-xs text-green-300">
                Supertonic 3 installed successfully!
              </span>
            </div>
          )}
        </div>
      )}

      {/* Voice / language / quality pickers — only meaningful once installed */}
      {engine === "supertonic" && isInstalled === true && (
        <div className="space-y-3 pt-1 border-t border-white/10">
          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">
              Voice
            </label>
            <Select
              data-testid="supertonic-voice-select"
              variant={isLightBackground ? "dark" : "default"}
              value={supertonicVoice}
              onChange={(e) => onChange({ supertonicVoice: e.target.value })}
              options={SUPERTONIC_VOICES}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">
              Language
            </label>
            <Select
              data-testid="supertonic-lang-select"
              variant={isLightBackground ? "dark" : "default"}
              value={supertonicLang}
              onChange={(e) => onChange({ supertonicLang: e.target.value })}
              options={SUPERTONIC_LANGUAGES}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">
              Quality
            </label>
            <Select
              data-testid="supertonic-steps-select"
              variant={isLightBackground ? "dark" : "default"}
              value={String(supertonicSteps)}
              onChange={(e) =>
                onChange({ supertonicSteps: parseInt(e.target.value, 10) })
              }
              options={SUPERTONIC_STEPS}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default SupertonicEngineSection;
