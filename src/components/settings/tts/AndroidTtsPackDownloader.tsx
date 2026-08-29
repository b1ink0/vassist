import { useCallback, useEffect, useState } from "react";
import { Icon } from "../../icons";
import Dialog from "../../common/Dialog";
import { Select } from "../../ui";
import SttTtsEventService from "../../../services/SttTtsEventService";
import {
  ANDROID_TTS_EVENT_TYPES,
  ANDROID_TTS_PACKS,
  type AndroidTtsPack,
} from "../../../config/androidTtsModels";

interface PackStatus {
  downloaded?: boolean;
  size?: number;
  approxDownloadSize?: string;
  numSpeakers?: number;
}

interface AndroidApiLike {
  getSTTTTSStatus?: () => string;
  downloadVitsModel?: () => string;
  deleteVitsModel?: () => string;
  downloadTtsPack?: (packId: string) => string;
  deleteTtsPack?: (packId: string) => string;
  _onSTTTTSProgress?:
    | ((type: string, percent: number, statusText: string) => void)
    | null;
  _onSTTTTSComplete?:
    | ((type: string, result: { success?: boolean; error?: string }) => void)
    | null;
  _onSTTTTSError?: ((type: string, errorMsg: string) => void) | null;
}

interface AndroidTtsPackDownloaderProps {
  androidAPI: AndroidApiLike | null;
  isLightBackground?: boolean;
  /** Currently selected pack id in the TTS config ("vits-local" = default) */
  activePackId?: string;
  /** Called when the user picks a different active pack */
  onActivePackChange?: (packId: string) => void;
  /** Current speaker id in the TTS config */
  speakerId?: number;
  /** Called when the user changes the speaker id */
  onSpeakerIdChange?: (speakerId: number) => void;
  /** Hoist delete confirmation to the host via TypedDialog instead of inline Dialog */
  onRequestDeleteDialog?: ((packId: string) => void) | undefined;
  /** Incremented by the host after an externally-confirmed delete to reload status */
  externalDeleteTick?: number | undefined;
}

const formatBytes = (bytes: number) => {
  if (!bytes || bytes === 0) return "0 MB";
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** A single downloadable TTS pack rendered by the shared card. */
interface CardItem {
  id: string;
  title: string;
  badge?: string | undefined;
  sizeLabel: string;
  installed: boolean;
  installedSize?: number | undefined;
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
 * Shared card so every TTS pack entry looks and behaves identically
 * (same monochrome style as the STT model cards).
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
          {item.installed && item.installedSize
            ? `Installed (${formatBytes(item.installedSize)})`
            : `Download ${item.sizeLabel}`}
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
            disabled={anyDownloading}
            className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white/90 text-xs font-medium transition-colors flex items-center gap-1 flex-shrink-0 disabled:opacity-40"
          >
            <Icon name="download" size={11} />
            <span>Download</span>
          </button>
        )}
      </div>
    )}
  </div>
);

/**
 * AndroidTtsPackDownloader - Install/delete offline TTS language packs and
 * pick the active voice. Replaces the single-model VITS downloader.
 */
const AndroidTtsPackDownloader = ({
  androidAPI,
  isLightBackground = false,
  activePackId,
  onActivePackChange,
  speakerId,
  onSpeakerIdChange,
  onRequestDeleteDialog,
  externalDeleteTick,
}: AndroidTtsPackDownloaderProps) => {
  const [packsStatus, setPacksStatus] = useState<Record<string, PackStatus>>(
    {},
  );
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    percent: number;
    status: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [speakerText, setSpeakerText] = useState(String(speakerId ?? 0));

  const loadStatus = useCallback(async () => {
    if (!androidAPI?.getSTTTTSStatus) return;

    try {
      const result = JSON.parse(androidAPI.getSTTTTSStatus()) as {
        success?: boolean;
        status?: {
          vits?: {
            packs?: Record<string, PackStatus>;
            numSpeakers?: number;
          };
        };
      };

      if (result?.success) {
        setPacksStatus(result.status?.vits?.packs ?? {});
        setStatusLoaded(true);
      }
    } catch (err) {
      console.error("Failed to load TTS pack status:", err);
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

    // Fan-out service: SettingsPanel keeps every tab mounted, so components
    // must not overwrite each other's window.AndroidAI callback slots.
    return SttTtsEventService.subscribe({
      onProgress: (type, percent, statusText) => {
        if (ANDROID_TTS_EVENT_TYPES.includes(type)) {
          setProgress({ percent, status: statusText });
        }
      },
      onComplete: (type) => {
        if (ANDROID_TTS_EVENT_TYPES.includes(type)) {
          setDownloadingId(null);
          setProgress(null);
          setSuccessMessage("Voice pack download complete");
          setTimeout(() => setSuccessMessage(""), 5000);
          loadStatus();
        }
      },
      onError: (type, errorMsg) => {
        if (ANDROID_TTS_EVENT_TYPES.includes(type)) {
          setDownloadingId(null);
          setProgress(null);
          setError(`Download failed: ${errorMsg}`);
        }
      },
    });
  }, [androidAPI, loadStatus]);

  const handleDownload = (packId: string) => {
    if (!androidAPI) {
      setError("Android API not available");
      return;
    }

    setDownloadingId(packId);
    setError("");
    setSuccessMessage("");
    setProgress({ percent: 0, status: "Starting download..." });

    try {
      const pack = ANDROID_TTS_PACKS.find((p) => p.id === packId);
      let resultJson: string | undefined;
      if (pack?.kind === "vits-legacy") {
        resultJson = androidAPI.downloadVitsModel?.();
      } else {
        resultJson = androidAPI.downloadTtsPack?.(packId);
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
    const packId = pendingDeleteId;
    setPendingDeleteId(null);

    try {
      const pack = ANDROID_TTS_PACKS.find((p) => p.id === packId);
      let resultJson: string | undefined;
      if (pack?.kind === "vits-legacy") {
        resultJson = androidAPI.deleteVitsModel?.();
      } else {
        resultJson = androidAPI.deleteTtsPack?.(packId);
      }

      if (!resultJson) {
        throw new Error("Delete API is unavailable");
      }

      const result = JSON.parse(resultJson) as {
        success?: boolean;
        error?: string;
      };
      if (result?.success) {
        // If the deleted pack was active, fall back to default resolution
        if (activePackId === packId) {
          onActivePackChange?.("vits-local");
        }
        setSuccessMessage("Pack deleted");
        setTimeout(() => setSuccessMessage(""), 3000);
        loadStatus();
      } else {
        setError(result?.error || "Delete failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const requestDelete = (packId: string) => {
    if (onRequestDeleteDialog) {
      onRequestDeleteDialog(packId);
      return;
    }
    setPendingDeleteId(packId);
  };

  const buildItems = (): CardItem[] =>
    ANDROID_TTS_PACKS.map((p) => {
      const ps = packsStatus[p.id];
      const installed = Boolean(ps?.downloaded);
      return {
        id: p.id,
        title: p.displayName,
        badge: p.badgeLabel,
        sizeLabel: ps?.approxDownloadSize ?? p.downloadSize,
        installedSize: installed ? ps?.size : undefined,
        installed,
      };
    });

  /** Packs available for the active-voice picker (installed only). */
  const installedPacks: AndroidTtsPack[] = ANDROID_TTS_PACKS.filter((p) =>
    Boolean(packsStatus[p.id]?.downloaded),
  );

  const normalizedActive =
    activePackId && installedPacks.some((p) => p.id === activePackId)
      ? activePackId
      : "";

  const activePack = installedPacks.find((p) => p.id === normalizedActive);
  const speakerMax =
    activePack?.numSpeakers ?? packsStatus[normalizedActive]?.numSpeakers;
  const speakerMaxId =
    typeof speakerMax === "number" && speakerMax > 0 ? speakerMax - 1 : 999;

  useEffect(() => {
    setSpeakerText(String(speakerId ?? 0));
  }, [normalizedActive, speakerId]);

  // If the active pack disappears (e.g. deleted via the host delete dialog),
  // fall back to default resolution
  useEffect(() => {
    if (
      activePackId &&
      packsStatus[activePackId] &&
      !packsStatus[activePackId]?.downloaded
    ) {
      onActivePackChange?.("vits-local");
    }
  }, [activePackId, packsStatus, onActivePackChange]);

  const commitSpeakerId = () => {
    const parsed = parseInt(speakerText.trim(), 10);
    const next = Number.isFinite(parsed)
      ? Math.min(Math.max(parsed, 0), speakerMaxId)
      : 0;
    setSpeakerText(String(next));
    if (next !== (speakerId ?? 0)) {
      onSpeakerIdChange?.(next);
    }
  };

  const stepSpeakerId = (delta: number) => {
    const parsed = parseInt(speakerText.trim(), 10);
    const base = Number.isFinite(parsed) ? parsed : (speakerId ?? 0);
    const next = Math.min(Math.max(base + delta, 0), speakerMaxId);
    setSpeakerText(String(next));
    if (next !== (speakerId ?? 0)) {
      onSpeakerIdChange?.(next);
    }
  };

  if (!statusLoaded) return null;

  const pendingItem = buildItems().find((i) => i.id === pendingDeleteId);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Icon name="speaker" size={16} className="text-white/70" />
          <h4 className="text-sm font-semibold text-white/90">Voice Packs</h4>
        </div>

        <p className="text-xs text-white/50 px-0.5">
          Offline voices per language. Download only what you need.
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
      </div>

      {/* Active voice picker */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-white/90">
          Active Voice
        </label>
        <Select
          value={normalizedActive}
          onChange={(e) => onActivePackChange?.(e.target.value)}
          variant={isLightBackground ? "dark" : "default"}
          className="min-h-[32px]"
          options={[
            { value: "", label: "Default (VCTK English)" },
            ...installedPacks.map((p) => ({
              value: p.id,
              label: p.displayName,
            })),
          ]}
        />

        {activePack?.supportsSpeakerId && (
          <div className="flex items-center justify-between gap-2 mt-2">
            <div>
              <div className="text-xs text-white/60">Speaker ID</div>
              {typeof speakerMax === "number" && speakerMax > 0 && (
                <div className="text-[10px] text-white/40">
                  0 – {speakerMaxId}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => stepSpeakerId(-1)}
                disabled={(speakerId ?? 0) <= 0}
                className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white/80 text-xs font-medium disabled:opacity-40"
              >
                <Icon name="minus" size={11} />
              </button>
              <input
                type="text"
                inputMode="numeric"
                value={speakerText}
                onChange={(e) => setSpeakerText(e.target.value)}
                onBlur={commitSpeakerId}
                className="w-14 px-2 py-1 text-sm rounded-md border border-white/10 bg-white/5 text-center text-white/80"
              />
              <button
                type="button"
                onClick={() => stepSpeakerId(1)}
                disabled={(speakerId ?? 0) >= speakerMaxId}
                className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white/80 text-xs font-medium disabled:opacity-40"
              >
                <Icon name="plus" size={11} />
              </button>
            </div>
          </div>
        )}
      </div>

      {!onRequestDeleteDialog && pendingDeleteId && (
        <Dialog
          type="confirm"
          title={`Delete ${pendingItem?.title ?? "voice pack"}?`}
          message="This will free up storage on your device."
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </div>
  );
};

export default AndroidTtsPackDownloader;
