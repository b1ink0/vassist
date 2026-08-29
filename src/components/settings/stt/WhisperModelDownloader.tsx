import { useCallback, useEffect, useState } from "react";
import { Icon } from "../../icons";
import Dialog from "../../common/Dialog";
import SttTtsEventService from "../../../services/SttTtsEventService";
import { ANDROID_WHISPER_VARIANTS } from "../../../config/androidWhisperModels";

interface VariantStatus {
  downloaded?: boolean;
  size?: number;
  approxDownloadSize?: string;
}

interface AndroidApiLike {
  getSTTTTSStatus?: () => string;
  downloadWhisperModel?: () => string;
  downloadWhisperVariant?: (variantId: string) => string;
  downloadSenseVoiceModel?: () => string;
  downloadSenseVoiceQnnModel?: () => string;
  downloadDolphinModel?: (variantId: string) => string;
  deleteWhisperModel?: () => string;
  deleteWhisperVariant?: (variantId: string) => string;
  deleteSenseVoiceModel?: () => string;
  deleteSenseVoiceQnnModel?: () => string;
  deleteDolphinModel?: (variantId: string) => string;
  _onSTTTTSProgress?:
    | ((type: string, percent: number, statusText: string) => void)
    | null;
  _onSTTTTSComplete?:
    | ((type: string, result: { success?: boolean; error?: string }) => void)
    | null;
  _onSTTTTSError?: ((type: string, errorMsg: string) => void) | null;
}

interface WhisperModelDownloaderProps {
  androidAPI: AndroidApiLike | null;
  isLightBackground?: boolean;
  /** Hoist delete confirmation to the host via TypedDialog instead of inline Dialog */
  onRequestDeleteDialog?: ((variantId: string) => void) | undefined;
  /** Incremented by the host after an externally-confirmed delete to reload status */
  externalDeleteTick?: number | undefined;
}

const formatBytes = (bytes: number) => {
  if (!bytes || bytes === 0) return "0 MB";
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** A single downloadable STT model rendered by the shared ModelCard. */
interface CardItem {
  id: string;
  title: string;
  badge?: string | undefined;
  /** Label shown while not installed, e.g. "~99 MB" */
  sizeLabel: string;
  installed: boolean;
  /** Shown instead of the size when installed */
  installedSize?: number | undefined;
  disabledReason?: string | undefined;
  footerNote?: string | undefined;
}

interface ModelCardProps {
  item: CardItem;
  downloading: boolean;
  progress: { percent: number; status: string } | null;
  anyDownloading: boolean;
  onDownload: (id: string) => void;
  onDelete: (id: string) => void;
}

/**
 * Shared card used for every downloadable STT model so all entries look and
 * behave identically.
 */
const ModelCard = ({
  item,
  downloading,
  progress,
  anyDownloading,
  onDownload,
  onDelete,
}: ModelCardProps) => (
  <div
    className={`p-2 md:p-3 rounded-lg bg-white/5 border transition-colors ${
      downloading ? "border-white/30" : "border-white/10"
    }`}
  >
    <div className="flex items-center justify-between mb-1.5">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-medium text-white/90 truncate">
          {item.title}
        </span>
        {item.badge && (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-white/10 text-white/50 flex-shrink-0 truncate max-w-[45%]">
            {item.badge}
          </span>
        )}
        {item.installed && (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-white/10 text-white/70 flex-shrink-0">
            Installed
          </span>
        )}
      </div>
    </div>

    {downloading && progress ? (
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-white/70">{progress.status}</span>
          <span className="text-white/70">{progress.percent}%</span>
        </div>
        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-white/40 transition-all duration-300"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      </div>
    ) : (
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-white/50 truncate">
          {item.disabledReason ??
            (item.installed && item.installedSize
              ? `Installed (${formatBytes(item.installedSize)})`
              : `Download ${item.sizeLabel}`)}
        </span>
        {item.installed ? (
          <button
            onClick={() => onDelete(item.id)}
            disabled={anyDownloading}
            className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white/80 text-xs font-medium transition-colors flex items-center gap-1 flex-shrink-0 disabled:opacity-40"
          >
            <Icon name="trash" size={11} />
            <span>Delete</span>
          </button>
        ) : (
          <button
            onClick={() => onDownload(item.id)}
            disabled={anyDownloading || Boolean(item.disabledReason)}
            className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white/90 text-xs font-medium transition-colors flex items-center gap-1 flex-shrink-0 disabled:opacity-40"
          >
            <Icon name="download" size={11} />
            <span>Download</span>
          </button>
        )}
      </div>
    )}

    {item.footerNote && (
      <p className="text-[10px] text-white/40 mt-1.5">{item.footerNote}</p>
    )}
  </div>
);

/**
 * WhisperModelDownloader - Lets the user pick and download exactly the
 * on-device STT models they want without bundling them in the app.
 * All entries are rendered through a single shared card component.
 */
const WhisperModelDownloader = ({
  androidAPI,
  onRequestDeleteDialog,
  externalDeleteTick,
}: WhisperModelDownloaderProps) => {
  const [variantsStatus, setVariantsStatus] = useState<
    Record<string, VariantStatus>
  >({});
  const [senseVoiceStatus, setSenseVoiceStatus] = useState<
    VariantStatus & { qnnDownloaded?: boolean }
  >({});
  const [dolphinStatus, setDolphinStatus] = useState<
    Record<string, VariantStatus>
  >({});
  const [qnnCapable, setQnnCapable] = useState(false);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    percent: number;
    status: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    if (!androidAPI?.getSTTTTSStatus) return;

    try {
      const result = JSON.parse(androidAPI.getSTTTTSStatus()) as {
        success?: boolean;
        status?: {
          whisper?: { variants?: Record<string, VariantStatus> };
          sensevoice?: VariantStatus & { qnnDownloaded?: boolean };
          dolphin?: { variants?: Record<string, VariantStatus> };
        };
      };

      // QNN capability comes from the local AI server status endpoint
      // (best-effort; everything else works without it)
      let qnnOk = false;
      try {
        const resp = await fetch("http://127.0.0.1:8765/v1/models/status");
        if (resp.ok) {
          const data = (await resp.json()) as {
            qnn?: {
              runtime_available?: boolean;
              device_capable?: boolean;
            };
          };
          qnnOk =
            data?.qnn?.device_capable === true &&
            data?.qnn?.runtime_available !== false;
        }
      } catch {
        // local AI server not running - QNN entry stays hidden
      }

      if (result?.success) {
        setVariantsStatus(result.status?.whisper?.variants ?? {});
        setSenseVoiceStatus(result.status?.sensevoice ?? {});
        setDolphinStatus(result.status?.dolphin?.variants ?? {});
        setQnnCapable(qnnOk);
        setStatusLoaded(true);
      }
    } catch (err) {
      console.error("Failed to load model status:", err);
    }
  }, [androidAPI]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (!externalDeleteTick) return;
    loadStatus();
  }, [externalDeleteTick, loadStatus]);

  useEffect(() => {
    if (!androidAPI) return;

    const sttEventTypes = [
      "whisper",
      "sensevoice",
      "dolphin",
      "sensevoice-qnn",
    ];

    // Fan-out service: SettingsPanel keeps every tab mounted, so components
    // must not overwrite each other's window.AndroidAI callback slots.
    return SttTtsEventService.subscribe({
      onProgress: (type, percent, statusText) => {
        if (sttEventTypes.includes(type)) {
          setProgress({ percent, status: statusText });
        }
      },
      onComplete: (type) => {
        if (sttEventTypes.includes(type)) {
          setDownloadingId(null);
          setProgress(null);
          setSuccessMessage(
            `${type === "sensevoice-qnn" ? "NPU" : "Model"} download complete`,
          );
          setTimeout(() => setSuccessMessage(""), 5000);
          loadStatus();
        }
      },
      onError: (type, errorMsg) => {
        if (sttEventTypes.includes(type)) {
          setDownloadingId(null);
          setProgress(null);
          setError(`Download failed: ${errorMsg}`);
        }
      },
    });
  }, [androidAPI, loadStatus]);

  const handleDownload = (variantId: string) => {
    if (!androidAPI) {
      setError("Android API not available");
      return;
    }

    setDownloadingId(variantId);
    setError("");
    setSuccessMessage("");
    setProgress({ percent: 0, status: "Starting download..." });

    try {
      let resultJson: string | undefined;
      if (variantId === "sensevoice-qnn") {
        resultJson = androidAPI.downloadSenseVoiceQnnModel?.();
      } else if (variantId === "sensevoice") {
        resultJson = androidAPI.downloadSenseVoiceModel?.();
      } else if (variantId.startsWith("dolphin-")) {
        resultJson = androidAPI.downloadDolphinModel?.(variantId);
      } else {
        resultJson =
          androidAPI.downloadWhisperVariant?.(variantId) ??
          (variantId === "tiny.en"
            ? androidAPI.downloadWhisperModel?.()
            : undefined);
      }

      if (!resultJson) {
        throw new Error("Download API is unavailable");
      }

      const result = JSON.parse(resultJson) as { error?: string };
      if (result?.error) {
        setError(result.error);
        setDownloadingId(null);
        setProgress(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDownloadingId(null);
      setProgress(null);
    }
  };

  const confirmDelete = () => {
    if (!androidAPI || !pendingDeleteId) return;
    const variantId = pendingDeleteId;
    setPendingDeleteId(null);

    try {
      let resultJson: string | undefined;
      if (variantId === "sensevoice-qnn") {
        resultJson = androidAPI.deleteSenseVoiceQnnModel?.();
      } else if (variantId === "sensevoice") {
        resultJson = androidAPI.deleteSenseVoiceModel?.();
      } else if (variantId.startsWith("dolphin-")) {
        resultJson = androidAPI.deleteDolphinModel?.(variantId);
      } else {
        resultJson =
          androidAPI.deleteWhisperVariant?.(variantId) ??
          (variantId === "tiny.en"
            ? androidAPI.deleteWhisperModel?.()
            : undefined);
      }

      if (!resultJson) {
        throw new Error("Delete API is unavailable");
      }

      const result = JSON.parse(resultJson) as {
        success?: boolean;
        error?: string;
      };
      if (result?.success) {
        setSuccessMessage("Model deleted");
        setTimeout(() => setSuccessMessage(""), 3000);
        loadStatus();
      } else {
        setError(result?.error || "Delete failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const requestDelete = (variantId: string) => {
    if (onRequestDeleteDialog) {
      onRequestDeleteDialog(variantId);
      return;
    }
    setPendingDeleteId(variantId);
  };

  const buildItems = (): CardItem[] => {
    const items: CardItem[] = ANDROID_WHISPER_VARIANTS.map((v) => {
      const vs =
        v.kind === "sensevoice"
          ? senseVoiceStatus
          : v.kind === "dolphin"
            ? dolphinStatus[v.id]
            : variantsStatus[v.id];
      const installed = Boolean(vs?.downloaded);
      return {
        id: v.id,
        title: v.displayName,
        badge: v.badgeLabel,
        sizeLabel: vs?.approxDownloadSize ?? v.downloadSize,
        installedSize: installed ? vs?.size : undefined,
        installed,
        disabledReason:
          v.id === "sensevoice-qnn" && !senseVoiceStatus.downloaded
            ? "Requires SenseVoice"
            : undefined,
      };
    });

    if (qnnCapable) {
      items.push({
        id: "sensevoice-qnn",
        title: "SenseVoice NPU",
        badge: "Experimental",
        sizeLabel: "~240 MB",
        installed: Boolean(senseVoiceStatus.qnnDownloaded),
        disabledReason: senseVoiceStatus.downloaded
          ? undefined
          : "Requires SenseVoice",
        footerNote:
          "Runs on the Snapdragon NPU - up to 10x faster, max 30s clips (longer audio is split automatically). Enable via Compute Provider > QNN.",
      });
    }

    return items;
  };

  if (!statusLoaded) return null;

  const pendingItem = buildItems().find((i) => i.id === pendingDeleteId);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon name="microphone" size={16} className="text-white/70" />
        <h4 className="text-sm font-semibold text-white/90">
          On-Device Models
        </h4>
      </div>

      <p className="text-xs text-white/50 px-0.5">
        Download only the models you need. Nothing is bundled with the app.
      </p>

      <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-white/10 bg-black/10 p-2 scrollbar-glass">
        {buildItems().map((item) => (
          <ModelCard
            key={item.id}
            item={item}
            downloading={downloadingId === item.id}
            progress={progress}
            anyDownloading={downloadingId !== null}
            onDownload={handleDownload}
            onDelete={requestDelete}
          />
        ))}
      </div>

      {successMessage && (
        <p className="text-xs text-white/60 px-0.5">{successMessage}</p>
      )}

      {error && <p className="text-xs text-red-300/80 px-0.5">{error}</p>}

      {!onRequestDeleteDialog && pendingDeleteId && (
        <Dialog
          type="confirm"
          title={`Delete ${pendingItem?.title ?? "model"}?`}
          message="This will free up storage on your device."
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </div>
  );
};

export default WhisperModelDownloader;
