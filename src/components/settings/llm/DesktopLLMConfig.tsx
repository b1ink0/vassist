import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../../icons";
import { useDesktopApi } from "../../../hooks/useDesktopStore";
import { isDesktop } from "../../../utils/PlatformUtils";
import { Button, Select, Input } from "../../ui";
import { DEFAULT_ENDPOINTS } from "../../../config/serviceEndpoints";
import LocalLLMModelManager from "./LocalLLMModelManager";
import LLMParameterSettings from "./LLMParameterSettings";
import type { LLMParameters } from "../../../config/llmParameters";
import {
  CHAT_LLAMA_RUNTIME_PACKS,
  default as LlamaServerRuntimeManager,
} from "./LlamaServerRuntimeManager";
import {
  getLLMModelStorage,
  type DiscoveryResult,
} from "../../../services/storage/LLMModelStorageService";

interface DesktopLLMConfigShape extends LLMParameters {
  endpoint?: string;
  model?: string;
  customModelsPath?: string | null;
  backend?: string;
  temperature?: number;
  maxTokens?: number;
  contextSize?: number;
  gpuLayers?: number;
  threads?: number;
  llmEngine?: string;
  llmBackend?: string;
}

interface BackendItem {
  name: string;
  supported?: boolean;
}

interface BackendStatus {
  success?: boolean;
  error?: string;
  selectedInstalled?: boolean;
  supportedBackends?: BackendItem[];
}

interface BackendProgress {
  downloadedBytes?: number;
  totalBytes?: number;
  percent?: number;
  stage?: string;
  status?: string;
}

interface DesktopLlmBridge {
  listModels: (customPath?: string | null) => Promise<unknown>;
  pullModel: (
    modelName: string,
    customPath?: string | null,
  ) => Promise<unknown>;
  downloadModel: (url: string, customPath?: string | null) => Promise<unknown>;
  deleteModel: (
    filename: string,
    customPath?: string | null,
  ) => Promise<unknown>;
  chooseModelFile: () => Promise<unknown>;
  importModel: (
    filePath: string,
    customPath?: string | null,
  ) => Promise<unknown>;
  chooseModelsFolder: () => Promise<unknown>;
  onDownloadProgress: (
    callback: (progress: { percent: number; status: string }) => void,
  ) => (() => void) | undefined;
  getBackendStatus: (backend?: string) => Promise<unknown>;
  installBackend: (backend: string) => Promise<unknown>;
  cancelBackendInstall: () => Promise<unknown>;
  onBackendInstallProgress: (
    callback: (progress: Record<string, unknown>) => void,
  ) => (() => void) | undefined;
}

interface ModelEntry {
  name: string;
  size: number;
  modified: Date;
}

const isDesktopLlmBridge = (value: unknown): value is DesktopLlmBridge => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.listModels === "function" &&
    typeof record.pullModel === "function" &&
    typeof record.downloadModel === "function" &&
    typeof record.deleteModel === "function" &&
    typeof record.chooseModelFile === "function" &&
    typeof record.importModel === "function" &&
    typeof record.chooseModelsFolder === "function" &&
    typeof record.onDownloadProgress === "function" &&
    typeof record.getBackendStatus === "function" &&
    typeof record.installBackend === "function" &&
    typeof record.cancelBackendInstall === "function" &&
    typeof record.onBackendInstallProgress === "function"
  );
};

interface DesktopLLMConfigProps {
  config?: DesktopLLMConfigShape;
  onChange: (updates: Record<string, unknown>) => void;
  isLightBackground?: boolean;
  isSetupMode?: boolean;
  onRequestDeleteModel?: ((modelName: string) => void) | null;
  refreshTrigger?: unknown;
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

/**
 * Reusable Desktop LLM Configuration Component
 * Used in both setup wizard and settings panel for desktop-local LLM provider
 *
 * @param {Object} config - Current LLM configuration (endpoint, model, etc.)
 * @param {Function} onChange - Callback when configuration changes
 * @param {boolean} isLightBackground - Whether component is on light background
 * @param {boolean} showTitle - Whether to show section title
 * @param {boolean} isSetupMode - Whether in setup wizard (affects UI slightly)
 */
const DesktopLLMConfig = ({
  config = {},
  onChange,
  isLightBackground = false,
  onRequestDeleteModel,
  refreshTrigger,
}: DesktopLLMConfigProps) => {
  const api = useDesktopApi();
  const [backendStatus, setBackendStatus] = useState<BackendStatus | null>(
    null,
  );
  const [backendLoading, setBackendLoading] = useState(false);
  const [backendError, setBackendError] = useState("");
  const [backendProgress, setBackendProgress] =
    useState<BackendProgress | null>(null);

  const handleChange = (key: string, value: unknown) => {
    onChange({ [key]: value });
  };

  const handleModelSelect = (modelName: string) => {
    handleChange("model", modelName);
  };

  const handleCustomPathChange = (path: string | null) => {
    handleChange("customModelsPath", path);
  };

  const desktopLlmBridge = isDesktopLlmBridge(api?.llm) ? api.llm : null;
  const desktopLlmApi = useMemo(() => {
    if (!desktopLlmBridge) {
      return null;
    }

    const unsupportedDiscovery = async (): Promise<DiscoveryResult> => ({
      success: false,
      items: [],
      error:
        "Desktop model discovery is unavailable. Restart the desktop app to reload preload APIs.",
    });

    return {
      listModels: (customPath?: string | null) =>
        desktopLlmBridge.listModels(customPath) as Promise<{
          success: boolean;
          models?: ModelEntry[];
        }>,
      pullModel: (modelName: string, customPath?: string | null) =>
        desktopLlmBridge.pullModel(modelName, customPath) as Promise<{
          success: boolean;
          error?: string;
        }>,
      downloadModel: (url: string, customPath?: string | null) =>
        desktopLlmBridge.downloadModel(url, customPath) as Promise<{
          success: boolean;
          error?: string;
        }>,
      searchOllamaModels: (query: string, page = 1, pageSize = 20) =>
        desktopLlmBridge.searchOllamaModels
          ? (desktopLlmBridge.searchOllamaModels(
              query,
              page,
              pageSize,
            ) as Promise<DiscoveryResult>)
          : unsupportedDiscovery(),
      listOllamaModelTags: (
        modelId: string,
        query = "",
        page = 1,
        pageSize = 20,
      ) =>
        desktopLlmBridge.listOllamaModelTags
          ? (desktopLlmBridge.listOllamaModelTags(
              modelId,
              query,
              page,
              pageSize,
            ) as Promise<DiscoveryResult>)
          : unsupportedDiscovery(),
      searchHuggingFaceModels: (query: string, cursor = "", pageSize = 20) =>
        desktopLlmBridge.searchHuggingFaceModels
          ? (desktopLlmBridge.searchHuggingFaceModels(
              query,
              cursor,
              pageSize,
            ) as Promise<DiscoveryResult>)
          : unsupportedDiscovery(),
      listHuggingFaceFiles: (
        repoId: string,
        query = "",
        page = 1,
        pageSize = 20,
      ) =>
        desktopLlmBridge.listHuggingFaceFiles
          ? (desktopLlmBridge.listHuggingFaceFiles(
              repoId,
              query,
              page,
              pageSize,
            ) as Promise<DiscoveryResult>)
          : unsupportedDiscovery(),
      deleteModel: (filename: string, customPath?: string | null) =>
        desktopLlmBridge.deleteModel(filename, customPath) as Promise<{
          success: boolean;
          error?: string;
        }>,
      chooseModelFile: () =>
        desktopLlmBridge.chooseModelFile() as Promise<{
          canceled?: boolean;
          path?: string;
        }>,
      importModel: (filePath: string, customPath?: string | null) =>
        desktopLlmBridge.importModel(filePath, customPath) as Promise<{
          success: boolean;
          error?: string;
        }>,
      chooseModelsFolder: () =>
        desktopLlmBridge.chooseModelsFolder() as Promise<{
          success: boolean;
          error?: string;
          path?: string;
        }>,
      onDownloadProgress: (
        callback: (progress: { percent: number; status: string }) => void,
      ) => {
        const unsubscribe = desktopLlmBridge.onDownloadProgress(callback);
        return () => unsubscribe?.();
      },
      getBackendStatus: (backend = "auto") =>
        desktopLlmBridge.getBackendStatus(backend) as Promise<
          { success: boolean } & Record<string, unknown>
        >,
      installBackend: (backend: string) =>
        desktopLlmBridge.installBackend(backend) as Promise<
          { success: boolean } & Record<string, unknown>
        >,
      cancelBackendInstall: () =>
        desktopLlmBridge.cancelBackendInstall() as Promise<
          { success: boolean } & Record<string, unknown>
        >,
      onBackendInstallProgress: (
        callback: (progress: Record<string, unknown>) => void,
      ) => {
        const unsubscribe = desktopLlmBridge.onBackendInstallProgress(callback);
        return () => unsubscribe?.();
      },
    };
  }, [desktopLlmBridge]);
  const storageService = useMemo(
    () =>
      isDesktop && desktopLlmApi
        ? getLLMModelStorage({ llm: desktopLlmApi })
        : null,
    [desktopLlmApi],
  );
  const selectedBackend = config.backend || "auto";
  const backendProgressBytes = useMemo(() => {
    if (!backendProgress) return null;
    const downloaded =
      typeof backendProgress.downloadedBytes === "number"
        ? backendProgress.downloadedBytes
        : null;
    const total =
      typeof backendProgress.totalBytes === "number"
        ? backendProgress.totalBytes
        : null;
    if (downloaded === null) return null;
    return {
      downloadedMB: (downloaded / 1024 / 1024).toFixed(1),
      totalMB: total !== null ? (total / 1024 / 1024).toFixed(1) : null,
    };
  }, [backendProgress]);

  const backendItems = useMemo(() => {
    return backendStatus?.supportedBackends || [];
  }, [backendStatus]);

  const loadBackendStatus = useCallback(async () => {
    if (!storageService) return;
    try {
      const status = await storageService.getBackendStatus(selectedBackend);
      if (status?.success) {
        setBackendStatus(status);
      } else if (status?.error) {
        setBackendError(status.error);
      }
    } catch (error: unknown) {
      setBackendError(
        getErrorMessage(error) || "Failed to load backend status",
      );
    }
  }, [selectedBackend, storageService]);

  useEffect(() => {
    if (!storageService) return;

    loadBackendStatus();

    const unsubscribe = storageService.onBackendInstallProgress(
      (progress: BackendProgress) => {
        setBackendProgress(progress);
        if (progress?.stage === "done") {
          setBackendLoading(false);
          setBackendError("");
          loadBackendStatus();
        } else if (progress?.stage === "error") {
          setBackendLoading(false);
          setBackendError(progress.status || "Backend installation failed");
        }
      },
    );

    return () => unsubscribe?.();
  }, [storageService, selectedBackend, loadBackendStatus]);

  const installSelectedBackend = async () => {
    if (!storageService) return;

    setBackendLoading(true);
    setBackendError("");
    setBackendProgress({
      percent: 0,
      stage: "install",
      status: "Starting backend setup...",
    });

    try {
      const result = await storageService.installBackend(selectedBackend);
      if (!result?.success) {
        setBackendLoading(false);
        setBackendError(result?.error || "Backend installation failed");
      }
    } catch (error: unknown) {
      setBackendLoading(false);
      setBackendError(getErrorMessage(error) || "Backend installation failed");
    }
  };

  return (
    <div className="space-y-3">
      {/* Info Banner */}
      <div className="p-3 rounded-lg bg-white/10 border border-white/20">
        <div className="flex items-start gap-2">
          <Icon
            name="cpu"
            size={18}
            className="text-white/90 shrink-0 mt-0.5"
          />
          <p className="text-xs text-white/90">
            <span className="font-semibold">Desktop Local AI</span> - On-device
            language model using llama.cpp. GPU-accelerated and runs entirely on
            your desktop!
          </p>
        </div>
      </div>

      {/* Status */}
      <div className="p-3 rounded-lg bg-white/5 border border-white/10">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-white/40"></div>
          <span className="text-sm font-semibold text-white/90">
            {config.model ? "Model selected" : "No model selected"}
          </span>
        </div>
        <p className="text-xs text-white/60">
          Model: {config.model || "No model selected"} •{" "}
          {config.llmEngine !== "node-llama"
            ? "llama-server"
            : "node-llama-cpp"}
        </p>
        {!config.model && (
          <p className="text-[10px] text-yellow-400 mt-1">
            ⚠ Select a model below to enable LLM features
          </p>
        )}
      </div>

      {/* Inference Engine */}
      <div className="p-3 rounded-lg bg-white/5 border border-white/10 space-y-3">
        <h3 className="text-sm font-semibold text-white/90">
          Inference Engine
        </h3>
        <Select
          data-testid="desktop-llm-engine-select"
          value={config.llmEngine || "llama-server"}
          onChange={(e) => handleChange("llmEngine", e.target.value)}
          variant={isLightBackground ? "dark" : "default"}
          options={[
            {
              value: "llama-server",
              label: "llama-server (recommended)",
            },
            { value: "node-llama", label: "node-llama-cpp" },
          ]}
        />

        {config.llmEngine !== "node-llama" && (
          <LlamaServerRuntimeManager
            api={api?.llamaServer}
            packs={CHAT_LLAMA_RUNTIME_PACKS}
            selectedBackend={config.llmBackend || "auto"}
            onBackendChange={(backend) => handleChange("llmBackend", backend)}
            onRequestDeleteBackend={
              onRequestDeleteModel
                ? (backend) => onRequestDeleteModel(`llama-backend:${backend}`)
                : null
            }
            refreshTrigger={refreshTrigger}
            isLightBackground={isLightBackground}
            testIdPrefix="desktop-llama-backend"
          />
        )}
      </div>

      {/* Backend Manager (node-llama-cpp engine only) */}
      {config.llmEngine === "node-llama" && (
        <div className="p-3 rounded-lg bg-white/5 border border-white/10 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-white/90">
                Runtime Backend
              </h3>
              <p className="text-[11px] text-white/60">
                Choose and install llama.cpp compute backend
              </p>
            </div>
            <button
              onClick={loadBackendStatus}
              className="text-xs text-white/70 hover:text-white/90"
              type="button"
            >
              Refresh
            </button>
          </div>

          <Select
            value={selectedBackend}
            onChange={(e) => handleChange("backend", e.target.value)}
            variant={isLightBackground ? "dark" : "default"}
            options={
              backendItems.length > 0
                ? backendItems.map((item) => ({
                    value: item.name,
                    label: `${item.name.toUpperCase()}${!item.supported ? " (unsupported)" : ""}`,
                    disabled: !item.supported,
                  }))
                : [
                    { value: "auto", label: "AUTO" },
                    { value: "cpu", label: "CPU" },
                    { value: "cuda", label: "CUDA" },
                    { value: "vulkan", label: "VULKAN" },
                    { value: "metal", label: "METAL" },
                  ]
            }
          />

          <div className="flex items-center justify-between">
            <p className="text-[11px] text-white/60">
              {backendStatus?.selectedInstalled
                ? `Selected backend (${selectedBackend}) is installed`
                : `Selected backend (${selectedBackend}) is not installed`}
            </p>
            <Button
              onClick={installSelectedBackend}
              disabled={backendLoading || selectedBackend === "auto"}
              variant={isLightBackground ? "dark" : "default"}
              size="sm"
              type="button"
            >
              {backendLoading
                ? "Installing..."
                : backendStatus?.selectedInstalled
                  ? "Reinstall"
                  : "Install"}
            </Button>
          </div>

          {backendProgress && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-white/70">{backendProgress.status}</span>
                <span className="text-white/70">
                  {Math.round(backendProgress.percent || 0)}%
                </span>
              </div>
              {backendProgressBytes && (
                <div className="text-xs text-white/70">
                  {backendProgressBytes.totalMB
                    ? `${backendProgressBytes.downloadedMB}MB / ${backendProgressBytes.totalMB}MB`
                    : `${backendProgressBytes.downloadedMB}MB downloaded`}
                </div>
              )}
              <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-linear-to-r from-white/40 to-white/60 transition-all duration-300"
                  style={{
                    width: `${Math.max(0, Math.min(100, backendProgress.percent || 0))}%`,
                  }}
                />
              </div>
            </div>
          )}

          {backendError && (
            <p className="text-[11px] text-red-300">{backendError}</p>
          )}
        </div>
      )}

      <div className="space-y-4">
        <label className="block text-xs font-medium text-white/90">
          Endpoint URL
        </label>
        <Input
          type="text"
          value={config.endpoint || DEFAULT_ENDPOINTS.desktopLocal}
          onChange={(event) => handleChange("endpoint", event.target.value)}
          placeholder={DEFAULT_ENDPOINTS.desktopLocal}
          variant={isLightBackground ? "dark" : "default"}
        />
        <LLMParameterSettings
          provider="desktop-local"
          config={config}
          onChange={handleChange}
          isLightBackground={isLightBackground}
        />
      </div>

      {/* Model Management Section */}
      {isDesktop && storageService && (
        <LocalLLMModelManager
          storageService={storageService}
          selectedModel={config.model ?? null}
          onModelSelect={handleModelSelect}
          customModelsPath={config.customModelsPath || null}
          onCustomPathChange={handleCustomPathChange}
          isLightBackground={isLightBackground}
          onRequestDeleteModel={onRequestDeleteModel}
          refreshTrigger={refreshTrigger}
          supportsCustomFolder={true}
        />
      )}
    </div>
  );
};

export default DesktopLLMConfig;
