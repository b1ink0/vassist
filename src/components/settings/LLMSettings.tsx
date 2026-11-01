/**
 * LLMSettings Component
 * LLM configuration tab for SettingsPanel
 * Handles provider selection and configuration for OpenAI, Ollama, and Chrome AI
 */

import SettingsScrollArea from "./shared/SettingsScrollArea";
import SettingsLoading from "./shared/SettingsLoading";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import * as React from "react";
import ThinkingControl from "../ui/ThinkingControl";
import SettingsDisclosure from "./shared/SettingsDisclosure";
import {
  useAIConfig,
  useAITesting,
  useConfigAIActions,
  useApplyAIProfile,
} from "../../hooks/config/useConfigAI";
import {
  useChromeAIStatus,
  useConfigStatusActions,
} from "../../hooks/config/useConfigStatus";
import {
  AIProviders,
  getThinkingSelection,
  getAvailableAIProviders,
  getAIProviderSection,
  DefaultAIConfig,
  type AIConfig,
  type AIRemoteProviderProfile,
} from "../../config/aiConfig";
import type {
  VAssistSettingsSubTabId,
  VAssistSettingsTargetId,
} from "../../embed/config";
import { useEmbedHost } from "../../embed/EmbedHostContext";
import {
  isSettingsTargetHidden,
  isSettingsTargetReadOnly,
} from "../../embed/settingsPolicy";
import {
  PromptConfig,
  type SystemPromptProfile,
} from "../../config/promptConfig";
import { useConfigStore } from "../../stores/useConfigStore";
import { isAndroid, isDesktop } from "../../utils/PlatformUtils";
import { useAndroidApi } from "../../hooks/useAndroidStore";
import ComputeUnitCard from "./llm/ComputeUnitCard";
import { useDesktopApi } from "../../hooks/useDesktopStore";
import DesktopLLMConfig from "./llm/DesktopLLMConfig";
import LLMParameterSettings, {
  NumberParameter,
} from "./llm/LLMParameterSettings";
import { getLLMProfileParameters } from "../../config/llmParameters";
import ChromeAIValidator from "../../services/ai/ChromeAIValidator";
import LocalLLMModelManager from "./llm/LocalLLMModelManager";
import {
  getLLMModelStorage,
  type DiscoveryResult,
} from "../../services/storage/LLMModelStorageService";
import RemoteModelPicker from "./shared/RemoteModelPicker";
import Toggle from "../common/Toggle";

import StatusMessage from "../common/StatusMessage";
import { Icon } from "../icons";
import { cn } from "../../utils/cn";
import { Button, Input, Select, SettingsRow, TabBar } from "../ui";

import {
  DEFAULT_SERVICE_PORTS,
  DEFAULT_ENDPOINTS,
  resolveDesktopInternalPorts,
  validateDesktopServicePorts,
} from "../../config/serviceEndpoints";

import SettingsSubTabContent from "./SettingsSubTabContent";
const DecisionSettings = lazy(() => import("./llm/DecisionSettings"));

interface RoutingModelConfig {
  useSameAsMain?: boolean;
  modelName?: string;
  selectedModel?: string;
  profileId?: string;
}

interface RoutingConfig {
  enabled?: boolean;
  visionModel?: RoutingModelConfig;
  routerModel?: RoutingModelConfig;
}

interface LocalModelEntry {
  name: string;
  size: number;
  modified: Date;
  hasImageSupport?: boolean;
}

interface LocalModelResult {
  success?: boolean;
  models?: LocalModelEntry[];
}

interface StorageServiceLike {
  listModels: (customModelsPath?: string | null) => Promise<LocalModelResult>;
}

interface ModelConfigRemoteProps {
  providerKey: "openai" | "ollama" | "android-local" | "desktop-local";
  routing: RoutingConfig | undefined;
  profiles: AIRemoteProviderProfile[];
  endpoint?: string | undefined;
  apiKey?: string | undefined;
  onChange: (field: string, value: unknown) => void;
  isLightBackground: boolean;
}

interface ModelConfigLocalProps {
  routing: RoutingConfig | undefined;
  profiles: AIRemoteProviderProfile[];
  onChange: (field: string, value: unknown) => void;
  storageService: StorageServiceLike | null;
  refreshTrigger: unknown;
  customModelsPath: string | null;
  isLightBackground: boolean;
}

type AIConfigShape = AIConfig;

interface ImageAudioToggleProps {
  providerKey:
    | "openai"
    | "ollama"
    | "android-local"
    | "desktop-local"
    | "chromeAi";
  updateAIConfig: (path: string, value: unknown) => void;
  aiConfig: AIConfigShape;
  additionalNote?: string;
}

interface SystemPromptSectionProps {
  providerKey:
    | "openai"
    | "ollama"
    | "android-local"
    | "desktop-local"
    | "chromeAi";
  isLightBackground: boolean;
  updateAIConfig: (
    path: string,
    value: unknown,
    options?: { debounceMs?: number },
  ) => void;
  aiConfig: AIConfigShape;
}

interface LLMSettingsProps {
  page?:
    | "provider"
    | "generation"
    | "models"
    | "runtime"
    | "routing"
    | "decision"
    | "profiles"
    | undefined;
  isLightBackground?: boolean;
  hasChromeAI?: boolean;
  onRequestDeleteLLMModel?: ((modelName: string) => void) | undefined;
  refreshTrigger?: unknown;
  onActiveTargetChange?:
    | ((target: VAssistSettingsTargetId | null) => void)
    | undefined;
}

type LLMSubTabId = "provider" | "routing" | "decision" | "profiles";

const PROVIDER_LABELS: Record<string, string> = {
  [AIProviders.OPENAI]: "OpenAI",
  [AIProviders.OLLAMA]: "OpenAI-Compatible / Ollama",
  [AIProviders.DESKTOP_LOCAL]: "Desktop Local",
  [AIProviders.ANDROID_LOCAL]: "Android Local",
  [AIProviders.CHROME_AI]: "Chrome Built-in AI",
};

const getRemoteProfileOptionLabel = (profile: AIRemoteProviderProfile) =>
  profile.name;

interface DesktopLlmBridge {
  getDecisionModelsDir: (customPath?: string | null) => Promise<unknown>;
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
  searchHuggingFaceModels?: (
    query: string,
    cursor?: string,
    pageSize?: number,
    filter?: string,
  ) => Promise<unknown>;
  listHuggingFaceFiles?: (
    repoId: string,
    query?: string,
    page?: number,
    pageSize?: number,
  ) => Promise<unknown>;
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

const isDesktopLlmBridge = (value: unknown): value is DesktopLlmBridge => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.listModels === "function" &&
    typeof record.getDecisionModelsDir === "function" &&
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

const RemoteProfileManager = ({
  aiConfig,
  updateAIConfig,
  isLightBackground,
  provider,
}: {
  aiConfig: AIConfigShape;
  updateAIConfig: (path: string, value: unknown) => void;
  isLightBackground: boolean;
  provider: AIRemoteProviderProfile["provider"];
}) => {
  const allProfiles = Array.isArray(aiConfig.remoteProfiles)
    ? aiConfig.remoteProfiles
    : [];
  const profiles = allProfiles.filter(
    (profile) => profile.provider === provider,
  );
  const [profileName, setProfileName] = React.useState("");
  const selectedProfileId = aiConfig[provider].selectedBackendProfileId || "";
  const setSelectedProfileId = React.useCallback(
    (id: string) => {
      updateAIConfig(`${provider}.selectedBackendProfileId`, id);
    },
    [provider, updateAIConfig],
  );
  const selectedProfile =
    profiles.find((profile) => profile.id === selectedProfileId) || null;
  const selectedProfileName = selectedProfile?.name;
  const actionVariant = isLightBackground ? "dark" : "ghost";

  React.useEffect(() => {
    if (
      selectedProfileId &&
      !profiles.some((profile) => profile.id === selectedProfileId)
    ) {
      setSelectedProfileId("");
    }
  }, [profiles, selectedProfileId, setSelectedProfileId]);

  React.useEffect(() => {
    if (selectedProfileName === undefined) {
      if (!selectedProfileId) {
        setProfileName("");
      }
      return;
    }

    setProfileName(selectedProfileName);
  }, [selectedProfileName, selectedProfileId]);

  const applyProfileToProvider = useApplyAIProfile();

  const handleProfileChange = (nextProfileId: string) => {
    setSelectedProfileId(nextProfileId);

    if (!nextProfileId) {
      setProfileName("");
      return;
    }

    const profile = profiles.find((entry) => entry.id === nextProfileId);
    if (!profile) {
      return;
    }

    setProfileName(profile.name);
    applyProfileToProvider(profile);
  };

  const saveCurrentProvider = () => {
    const nextProfileId = selectedProfile?.id || `remote-${Date.now()}`;
    const defaultName = `Saved Backend ${profiles.length + (selectedProfile ? 0 : 1)}`;
    let nextProfile: AIRemoteProviderProfile;

    if (provider === AIProviders.OPENAI) {
      nextProfile = {
        id: nextProfileId,
        name: profileName.trim() || selectedProfile?.name || defaultName,
        provider: "openai",
        ...getLLMProfileParameters(aiConfig.openai),
        endpoint: aiConfig.openai.endpoint,
        apiKey: aiConfig.openai.apiKey,
        model: aiConfig.openai.model || "",
        temperature: aiConfig.openai.temperature,
        maxTokens: aiConfig.openai.maxTokens,
        enableImageSupport: aiConfig.openai.enableImageSupport !== false,
        enableAudioSupport: aiConfig.openai.enableAudioSupport !== false,
      };
    } else if (provider === AIProviders.ANDROID_LOCAL) {
      nextProfile = {
        id: nextProfileId,
        name: profileName.trim() || selectedProfile?.name || defaultName,
        provider: "android-local",
        ...getLLMProfileParameters(aiConfig["android-local"]),
        endpoint: aiConfig["android-local"].endpoint,
        model: aiConfig["android-local"].model || "",
        temperature: aiConfig["android-local"].temperature,
        maxTokens: aiConfig["android-local"].maxTokens,
        enableImageSupport: false,
        enableAudioSupport: false,
      };
    } else if (provider === AIProviders.DESKTOP_LOCAL) {
      nextProfile = {
        id: nextProfileId,
        name: profileName.trim() || selectedProfile?.name || defaultName,
        provider: "desktop-local",
        ...getLLMProfileParameters(aiConfig["desktop-local"]),
        endpoint: aiConfig["desktop-local"].endpoint,
        model: aiConfig["desktop-local"].model || "",
        customModelsPath: aiConfig["desktop-local"].customModelsPath ?? null,
        shareOnNetwork: aiConfig["desktop-local"].shareOnNetwork === true,
        serverPort: aiConfig["desktop-local"].serverPort,
        backend: aiConfig["desktop-local"].backend,
        temperature: aiConfig["desktop-local"].temperature,
        maxTokens: aiConfig["desktop-local"].maxTokens,
        contextSize: aiConfig["desktop-local"].contextSize,
        gpuLayers: aiConfig["desktop-local"].gpuLayers,
        threads: aiConfig["desktop-local"].threads,
        enableImageSupport: false,
        enableAudioSupport: false,
      };
    } else {
      nextProfile = {
        id: nextProfileId,
        name: profileName.trim() || selectedProfile?.name || defaultName,
        provider: "ollama",
        ...getLLMProfileParameters(aiConfig.ollama),
        endpoint: aiConfig.ollama.endpoint,
        apiKey: aiConfig.ollama.apiKey,
        model: aiConfig.ollama.model || "",
        temperature: aiConfig.ollama.temperature,
        maxTokens: aiConfig.ollama.maxTokens,
        enableImageSupport: aiConfig.ollama.enableImageSupport !== false,
        enableAudioSupport: aiConfig.ollama.enableAudioSupport !== false,
      };
    }

    updateAIConfig(
      "remoteProfiles",
      selectedProfile
        ? allProfiles.map((profile) =>
            profile.id === selectedProfile.id ? nextProfile : profile,
          )
        : [...allProfiles, nextProfile],
    );
    setSelectedProfileId(nextProfile.id);
    setProfileName(nextProfile.name);
  };

  const startNewProfile = () => {
    setSelectedProfileId("");
    setProfileName("");
  };

  const deleteProfile = () => {
    if (!selectedProfile) {
      return;
    }

    updateAIConfig(
      "remoteProfiles",
      allProfiles.filter((profile) => profile.id !== selectedProfile.id),
    );
    setSelectedProfileId("");
    setProfileName("");
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="block text-sm font-medium vassist-text-primary">
        Saved Backends
      </label>
      <Input
        data-testid="llm-saved-backend-name-input"
        type="text"
        value={profileName}
        onChange={(event) => setProfileName(event.target.value)}
        placeholder="Backend name"
        variant={isLightBackground ? "dark" : "default"}
        size="xs"
      />
      <div className="flex flex-1 flex-wrap items-center flex-col gap-2 [&>button:first-child]:min-w-0 [&>button:first-child]:flex-1">
        <div className="w-full min-w-0">
          <Select
            data-testid="llm-saved-backend-select"
            value={selectedProfileId}
            onChange={(event) => handleProfileChange(event.target.value)}
            variant={isLightBackground ? "dark" : "default"}
            className="min-h-[32px] w-full"
            options={[
              {
                value: "",
                label:
                  profiles.length === 0
                    ? "No saved backends yet"
                    : "Select a saved backend",
              },
              ...profiles.map((profile) => ({
                value: profile.id,
                label: getRemoteProfileOptionLabel(profile),
              })),
            ]}
          />
        </div>
        <div className="flex w-full items-center gap-2">
          <Button
            type="button"
            className="flex-1"
            data-testid="llm-saved-backend-new-button"
            size="icon"
            variant={actionVariant}
            onClick={startNewProfile}
            title="Create a new saved backend"
            aria-label="Create a new saved backend"
          >
            <Icon name="add" size={14} />
          </Button>
          <Button
            type="button"
            className="flex-1"
            data-testid="llm-saved-backend-save-button"
            size="icon"
            variant={isLightBackground ? "dark" : "default"}
            onClick={saveCurrentProvider}
            title="Save current backend"
            aria-label="Save current backend"
          >
            <Icon name="save" size={14} />
          </Button>
          <Button
            type="button"
            className="flex-1"
            data-testid="llm-saved-backend-delete-button"
            size="icon"
            variant="error"
            onClick={deleteProfile}
            disabled={!selectedProfile}
            title="Delete selected backend"
            aria-label="Delete selected backend"
          >
            <Icon name="delete" size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
};

const ModelConfigRemote = ({
  providerKey,
  routing,
  profiles = [],
  endpoint,
  apiKey,
  onChange,
  isLightBackground,
}: ModelConfigRemoteProps) => {
  const examples =
    providerKey === "openai"
      ? {
          vision: "gpt-4-vision-preview",
          router: "gpt-3.5-turbo",
        }
      : {
          vision: "llava:7b",
          router: "llama3.2:1b",
        };

  const profileOptions = [
    { value: "", label: "Use current provider connection" },
    ...profiles.map((profile) => ({
      value: profile.id,
      label: getRemoteProfileOptionLabel(profile),
    })),
  ];

  const visionProfile = profiles.find(
    (profile) => profile.id === routing?.visionModel?.profileId,
  );
  const routerProfile = profiles.find(
    (profile) => profile.id === routing?.routerModel?.profileId,
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Main Routing Toggle */}
      <SettingsRow
        label="Enable Model Routing"
        description="Use separate models for vision/routing tasks"
      >
        <Toggle
          data-testid="llm-routing-enabled-toggle"
          checked={routing?.enabled === true}
          onChange={(checked) =>
            onChange("routing", { ...routing, enabled: checked })
          }
        />
      </SettingsRow>

      {routing?.enabled && (
        <>
          {/* Vision Model */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium vassist-text-primary">
                Vision Model
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs vassist-text-muted">Use main LLM</span>
                <Toggle
                  data-testid="llm-routing-vision-use-main-toggle"
                  checked={routing?.visionModel?.useSameAsMain !== false}
                  onChange={(checked) =>
                    onChange("routing", {
                      ...routing,
                      visionModel: {
                        ...routing?.visionModel,
                        useSameAsMain: checked,
                      },
                    })
                  }
                />
              </div>
            </div>
            {routing?.visionModel?.useSameAsMain === false && (
              <div className="flex flex-col gap-2">
                <Select
                  data-testid="llm-routing-vision-profile-select"
                  value={routing?.visionModel?.profileId || ""}
                  onChange={(event) =>
                    onChange("routing", {
                      ...routing,
                      visionModel: {
                        ...routing?.visionModel,
                        profileId: event.target.value,
                      },
                    })
                  }
                  variant={isLightBackground ? "dark" : "default"}
                  options={profileOptions}
                />
                <RemoteModelPicker
                  inputTestId="llm-routing-vision-model-input"
                  value={routing?.visionModel?.modelName || ""}
                  onChange={(value) =>
                    onChange("routing", {
                      ...routing,
                      visionModel: {
                        ...routing?.visionModel,
                        modelName: value,
                      },
                    })
                  }
                  provider={visionProfile?.provider || providerKey}
                  endpoint={visionProfile?.endpoint || endpoint}
                  customModelsPath={visionProfile?.customModelsPath}
                  apiKey={visionProfile?.apiKey || apiKey}
                  placeholder={visionProfile?.model || examples.vision}
                  isLightBackground={isLightBackground}
                />
              </div>
            )}
          </div>

          {/* Router Model */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium vassist-text-primary">
                Router Model
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs vassist-text-muted">Use main LLM</span>
                <Toggle
                  data-testid="llm-routing-router-use-main-toggle"
                  checked={routing?.routerModel?.useSameAsMain !== false}
                  onChange={(checked) =>
                    onChange("routing", {
                      ...routing,
                      routerModel: {
                        ...routing?.routerModel,
                        useSameAsMain: checked,
                      },
                    })
                  }
                />
              </div>
            </div>
            {routing?.routerModel?.useSameAsMain === false && (
              <div className="flex flex-col gap-2">
                <Select
                  data-testid="llm-routing-router-profile-select"
                  value={routing?.routerModel?.profileId || ""}
                  onChange={(event) =>
                    onChange("routing", {
                      ...routing,
                      routerModel: {
                        ...routing?.routerModel,
                        profileId: event.target.value,
                      },
                    })
                  }
                  variant={isLightBackground ? "dark" : "default"}
                  options={profileOptions}
                />
                <RemoteModelPicker
                  inputTestId="llm-routing-router-model-input"
                  value={routing?.routerModel?.modelName || ""}
                  onChange={(value) =>
                    onChange("routing", {
                      ...routing,
                      routerModel: {
                        ...routing?.routerModel,
                        modelName: value,
                      },
                    })
                  }
                  provider={routerProfile?.provider || providerKey}
                  endpoint={routerProfile?.endpoint || endpoint}
                  customModelsPath={routerProfile?.customModelsPath}
                  apiKey={routerProfile?.apiKey || apiKey}
                  placeholder={routerProfile?.model || examples.router}
                  isLightBackground={isLightBackground}
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const ModelConfigLocal = ({
  routing,
  profiles = [],
  onChange,
  storageService,
  refreshTrigger,
  customModelsPath,
  isLightBackground,
}: ModelConfigLocalProps) => {
  const [models, setModels] = React.useState<LocalModelEntry[]>([]);
  const [loading, setLoading] = React.useState(false);
  const profileOptions = [
    { value: "", label: "Use local models on this device" },
    ...profiles.map((profile) => ({
      value: profile.id,
      label: getRemoteProfileOptionLabel(profile),
    })),
  ];
  const visionProfile = profiles.find(
    (profile) => profile.id === routing?.visionModel?.profileId,
  );
  const routerProfile = profiles.find(
    (profile) => profile.id === routing?.routerModel?.profileId,
  );

  React.useEffect(() => {
    const loadModels = async () => {
      if (!storageService) return;
      setLoading(true);
      try {
        const result = await storageService.listModels(customModelsPath);
        if (result?.success) {
          setModels(result.models || []);
        }
      } catch (err) {
        console.error("Failed to load models:", err);
      }
      setLoading(false);
    };
    loadModels();
  }, [storageService, refreshTrigger, customModelsPath]);

  const formatBytes = (bytes: number) => {
    if (!bytes) return "Unknown";
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(1)} GB`;
    }
    return `${mb.toFixed(0)} MB`;
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Main Routing Toggle */}
      <SettingsRow
        label="Enable Model Routing"
        description="Use separate models for vision/routing tasks"
      >
        <Toggle
          checked={routing?.enabled === true}
          onChange={(checked) =>
            onChange("routing", { ...routing, enabled: checked })
          }
        />
      </SettingsRow>

      {routing?.enabled && (
        <>
          {/* Vision Model */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium vassist-text-primary">
                Vision Model
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs vassist-text-muted">Use main LLM</span>
                <Toggle
                  checked={routing?.visionModel?.useSameAsMain !== false}
                  onChange={(checked) =>
                    onChange("routing", {
                      ...routing,
                      visionModel: {
                        ...routing?.visionModel,
                        useSameAsMain: checked,
                      },
                    })
                  }
                />
              </div>
            </div>
            {routing?.visionModel?.useSameAsMain === false && (
              <>
                <Select
                  value={routing?.visionModel?.profileId || ""}
                  onChange={(event) =>
                    onChange("routing", {
                      ...routing,
                      visionModel: {
                        ...routing?.visionModel,
                        profileId: event.target.value,
                      },
                    })
                  }
                  variant={isLightBackground ? "dark" : "default"}
                  options={profileOptions}
                />
                {visionProfile ? (
                  <div className="flex flex-col gap-2">
                    <RemoteModelPicker
                      value={routing?.visionModel?.modelName || ""}
                      onChange={(value) =>
                        onChange("routing", {
                          ...routing,
                          visionModel: {
                            ...routing?.visionModel,
                            modelName: value,
                          },
                        })
                      }
                      provider={visionProfile.provider}
                      endpoint={visionProfile.endpoint}
                      customModelsPath={visionProfile.customModelsPath}
                      apiKey={visionProfile.apiKey}
                      placeholder={visionProfile.model || "Remote model"}
                      isLightBackground={isLightBackground}
                    />
                  </div>
                ) : (
                  <>
                    {loading ? (
                      <div className="text-xs vassist-text-muted py-2">
                        Loading models...
                      </div>
                    ) : models.length === 0 ? (
                      <div className="text-xs vassist-text-muted py-2">
                        No models found
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {models.map((model) => (
                          <div
                            key={model.name}
                            className="flex items-center justify-between hover:bg-current/10 transition-colors settings-section"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 pb-1">
                                <Icon
                                  name="document"
                                  size={14}
                                  className="vassist-text-secondary flex-shrink-0"
                                />
                                <span className="text-sm font-medium vassist-text-primary truncate">
                                  {model.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-[10px] vassist-text-muted">
                                <span>{formatBytes(model.size)}</span>
                                {model.modified && (
                                  <span>
                                    {new Date(
                                      model.modified,
                                    ).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              {model.hasImageSupport && (
                                <div
                                  className="p-2 vassist-text-secondary"
                                  title="Supports vision/image input"
                                >
                                  <Icon name="image" size={16} />
                                </div>
                              )}
                              <Toggle
                                checked={
                                  routing?.visionModel?.selectedModel ===
                                  model.name
                                }
                                onChange={(checked) => {
                                  if (checked) {
                                    onChange("routing", {
                                      ...routing,
                                      visionModel: {
                                        ...routing?.visionModel,
                                        selectedModel: model.name,
                                      },
                                    });
                                  }
                                }}
                                title="Select as vision model"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          {/* Router Model */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium vassist-text-primary">
                Router Model
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs vassist-text-muted">Use main LLM</span>
                <Toggle
                  checked={routing?.routerModel?.useSameAsMain !== false}
                  onChange={(checked) =>
                    onChange("routing", {
                      ...routing,
                      routerModel: {
                        ...routing?.routerModel,
                        useSameAsMain: checked,
                      },
                    })
                  }
                />
              </div>
            </div>
            {routing?.routerModel?.useSameAsMain === false && (
              <>
                <Select
                  value={routing?.routerModel?.profileId || ""}
                  onChange={(event) =>
                    onChange("routing", {
                      ...routing,
                      routerModel: {
                        ...routing?.routerModel,
                        profileId: event.target.value,
                      },
                    })
                  }
                  variant={isLightBackground ? "dark" : "default"}
                  options={profileOptions}
                />
                {routerProfile ? (
                  <div className="flex flex-col gap-2">
                    <RemoteModelPicker
                      value={routing?.routerModel?.modelName || ""}
                      onChange={(value) =>
                        onChange("routing", {
                          ...routing,
                          routerModel: {
                            ...routing?.routerModel,
                            modelName: value,
                          },
                        })
                      }
                      provider={routerProfile.provider}
                      endpoint={routerProfile.endpoint}
                      customModelsPath={routerProfile.customModelsPath}
                      apiKey={routerProfile.apiKey}
                      placeholder={routerProfile.model || "Remote model"}
                      isLightBackground={isLightBackground}
                    />
                  </div>
                ) : (
                  <>
                    {loading ? (
                      <div className="text-xs vassist-text-muted py-2">
                        Loading models...
                      </div>
                    ) : models.length === 0 ? (
                      <div className="text-xs vassist-text-muted py-2">
                        No models found
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {models.map((model) => (
                          <div
                            key={model.name}
                            className="flex items-center justify-between hover:bg-current/10 transition-colors settings-section"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 pb-1">
                                <Icon
                                  name="document"
                                  size={14}
                                  className="vassist-text-secondary flex-shrink-0"
                                />
                                <span className="text-sm font-medium vassist-text-primary truncate">
                                  {model.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-[10px] vassist-text-muted">
                                <span>{formatBytes(model.size)}</span>
                                {model.modified && (
                                  <span>
                                    {new Date(
                                      model.modified,
                                    ).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              {model.hasImageSupport && (
                                <div
                                  className="p-2 vassist-text-secondary"
                                  title="Supports vision/image input"
                                >
                                  <Icon name="image" size={16} />
                                </div>
                              )}
                              <Toggle
                                checked={
                                  routing?.routerModel?.selectedModel ===
                                  model.name
                                }
                                onChange={(checked) => {
                                  if (checked) {
                                    onChange("routing", {
                                      ...routing,
                                      routerModel: {
                                        ...routing?.routerModel,
                                        selectedModel: model.name,
                                      },
                                    });
                                  }
                                }}
                                title="Select as router model"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const ImageSupportToggle = ({
  providerKey,
  updateAIConfig,
  aiConfig,
  additionalNote = "",
}: ImageAudioToggleProps) => {
  const providerConfig = aiConfig[providerKey as keyof AIConfigShape] as
    | Record<string, unknown>
    | undefined;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 settings-section">
        <label
          htmlFor={`${providerKey}-image-support`}
          className="text-sm font-medium vassist-text-primary cursor-pointer flex-1"
        >
          Enable Image Support (Multi-modal)
          <p className="text-xs vassist-text-muted pt-0.5">
            Allows sending images with text prompts. Enabled by default.
            {additionalNote && ` ${additionalNote}`}
          </p>
        </label>
        <Toggle
          id={`${providerKey}-image-support`}
          checked={providerConfig?.enableImageSupport !== false}
          onChange={(checked) =>
            updateAIConfig(`${providerKey}.enableImageSupport`, checked)
          }
        />
      </div>
    </div>
  );
};

const AudioSupportToggle = ({
  providerKey,
  updateAIConfig,
  aiConfig,
  additionalNote = "",
}: ImageAudioToggleProps) => {
  const providerConfig = aiConfig[providerKey as keyof AIConfigShape] as
    | Record<string, unknown>
    | undefined;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 settings-section">
        <label
          htmlFor={`${providerKey}-audio-support`}
          className="text-sm font-medium vassist-text-primary cursor-pointer flex-1"
        >
          Enable Audio Support (Multi-modal)
          <p className="text-xs vassist-text-muted pt-0.5">
            Allows sending audio files with text prompts. Enabled by default.
            {additionalNote && ` ${additionalNote}`}
          </p>
        </label>
        <Toggle
          id={`${providerKey}-audio-support`}
          checked={providerConfig?.enableAudioSupport !== false}
          onChange={(checked) =>
            updateAIConfig(`${providerKey}.enableAudioSupport`, checked)
          }
        />
      </div>
    </div>
  );
};

const SystemPromptSection = ({
  providerKey,
  isLightBackground,
  updateAIConfig,
  aiConfig,
}: SystemPromptSectionProps) => {
  const providerConfig = React.useMemo(
    () => (aiConfig[providerKey] || {}) as Record<string, unknown>,
    [aiConfig, providerKey],
  );
  const systemPrompts = PromptConfig.systemPrompts;

  const buildDefaultProfiles = React.useCallback(
    (): SystemPromptProfile[] =>
      Object.entries(systemPrompts).map(([key, value]) => ({
        id: key,
        name: value.name,
        prompt: value.prompt,
        isBuiltIn: key !== "custom",
      })),
    [systemPrompts],
  );

  const normalizeProfiles = React.useCallback((): {
    profiles: SystemPromptProfile[];
    selectedId: string;
  } => {
    const rawProfiles = Array.isArray(providerConfig.systemPromptProfiles)
      ? providerConfig.systemPromptProfiles
      : [];

    const parsedProfiles = rawProfiles
      .map((profile) => {
        if (!profile || typeof profile !== "object") {
          return null;
        }
        const raw = profile as Record<string, unknown>;
        const id =
          typeof raw.id === "string" && raw.id.trim()
            ? raw.id.trim()
            : `profile_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const name = typeof raw.name === "string" ? raw.name : "Unnamed";
        const prompt = typeof raw.prompt === "string" ? raw.prompt : "";
        const isBuiltIn =
          typeof raw.isBuiltIn === "boolean" ? raw.isBuiltIn : false;
        return { id, name, prompt, isBuiltIn } as SystemPromptProfile;
      })
      .filter((profile) => profile !== null) as SystemPromptProfile[];

    const mergedMap = new Map<string, SystemPromptProfile>();
    buildDefaultProfiles().forEach((profile) =>
      mergedMap.set(profile.id, profile),
    );
    parsedProfiles.forEach((profile) => mergedMap.set(profile.id, profile));

    const profiles = Array.from(mergedMap.values());
    const selectedId =
      typeof providerConfig.selectedSystemPromptProfileId === "string"
        ? providerConfig.selectedSystemPromptProfileId
        : "default";
    const finalSelectedId = profiles.some(
      (profile) => profile.id === selectedId,
    )
      ? selectedId
      : profiles[0]?.id || "default";

    return { profiles, selectedId: finalSelectedId };
  }, [buildDefaultProfiles, providerConfig]);

  const normalized = normalizeProfiles();
  const profiles = normalized.profiles;
  const selectedProfileId = normalized.selectedId;
  const selectedProfile =
    profiles.find((profile) => profile.id === selectedProfileId) || profiles[0];
  const persistProfiles = React.useCallback(
    (nextProfiles: SystemPromptProfile[], nextSelectedId: string) => {
      const current = useConfigStore.getState().aiConfig[providerKey] as Record<
        string,
        unknown
      >;
      const nextActive = nextProfiles.find(
        (profile) => profile.id === nextSelectedId,
      );
      updateAIConfig(providerKey, {
        ...current,
        systemPromptProfiles: nextProfiles,
        selectedSystemPromptProfileId: nextSelectedId,
        ...(nextActive
          ? {
              systemPromptType: nextActive.isBuiltIn ? nextActive.id : "custom",
              systemPrompt: nextActive.prompt,
            }
          : {}),
      });
    },
    [providerKey, updateAIConfig],
  );
  const updateSelectedProfile = (
    changes: Partial<Pick<SystemPromptProfile, "name" | "prompt">>,
  ) => {
    if (!selectedProfile) return;
    persistProfiles(
      profiles.map((profile) =>
        profile.id === selectedProfile.id
          ? { ...profile, ...changes }
          : profile,
      ),
      selectedProfile.id,
    );
  };

  React.useEffect(() => {
    const rawProfiles = Array.isArray(providerConfig.systemPromptProfiles)
      ? providerConfig.systemPromptProfiles
      : [];
    const rawSelectedId =
      typeof providerConfig.selectedSystemPromptProfileId === "string"
        ? providerConfig.selectedSystemPromptProfileId
        : "";

    const needsSync =
      rawProfiles.length !== profiles.length ||
      rawSelectedId !== selectedProfileId;
    if (!needsSync) {
      return;
    }

    persistProfiles(profiles, selectedProfileId);
  }, [
    persistProfiles,
    profiles,
    providerConfig.selectedSystemPromptProfileId,
    providerConfig.systemPromptProfiles,
    selectedProfileId,
  ]);

  const addProfile = (): void => {
    const timestamp = Date.now();
    const nextProfile: SystemPromptProfile = {
      id: `custom-${timestamp}`,
      name: `Custom ${profiles.filter((profile) => profile.id.startsWith("custom-")).length + 1}`,
      prompt: selectedProfile?.prompt || "",
      isBuiltIn: false,
    };
    persistProfiles([...profiles, nextProfile], nextProfile.id);
  };

  const deleteCurrentProfile = (): void => {
    if (!selectedProfile || profiles.length <= 1) {
      return;
    }
    const remaining = profiles.filter(
      (profile) => profile.id !== selectedProfile.id,
    );
    const fallbackId = remaining[0]?.id || "default";
    persistProfiles(remaining, fallbackId);
  };

  const profileOptions = profiles.map((profile) => ({
    value: profile.id,
    label: profile.name,
  }));

  return (
    <>
      {/* System Prompt Profiles */}
      <div className="flex flex-col gap-2">
        <label className="block text-sm font-medium vassist-text-primary">
          System Prompt Profile
        </label>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <Select
              data-testid="llm-system-profile-select"
              value={selectedProfile?.id || "default"}
              onChange={(e) => {
                const nextId = e.target.value;
                if (profiles.some((profile) => profile.id === nextId)) {
                  persistProfiles(profiles, nextId);
                }
              }}
              variant={isLightBackground ? "dark" : "default"}
              options={profileOptions}
            />
          </div>
          <Button
            data-testid="llm-system-profile-add-button"
            size="icon"
            variant={isLightBackground ? "dark" : "default"}
            title="Add profile"
            onClick={addProfile}
          >
            <Icon name="add" size={16} />
          </Button>
          <Button
            data-testid="llm-system-profile-delete-button"
            size="icon"
            variant={isLightBackground ? "dark" : "default"}
            title="Delete current profile"
            onClick={deleteCurrentProfile}
            disabled={profiles.length <= 1}
          >
            <Icon name="trash-2" size={16} />
          </Button>
        </div>
        <p className="text-xs vassist-text-muted">
          Create and manage multiple persistent prompt personalities.
        </p>
      </div>

      <SettingsRow label="Profile Name" layout="stacked">
        <Input
          data-testid="llm-system-profile-name-input"
          value={selectedProfile?.name ?? ""}
          onChange={(e) => updateSelectedProfile({ name: e.target.value })}
          variant={isLightBackground ? "dark" : "default"}
          placeholder="Profile name"
          className="w-full"
        />
      </SettingsRow>

      <SettingsRow
        label={<>System Prompt</>}
        description={
          <>
            Profile changes persist. Switching profiles keeps each profile's own
            prompt text.
          </>
        }
        layout="stacked"
      >
        <textarea
          data-testid="llm-system-profile-prompt-input"
          value={selectedProfile?.prompt ?? ""}
          onChange={(e) => updateSelectedProfile({ prompt: e.target.value })}
          placeholder="Enter system prompt..."
          rows={4}
          className={cn(
            "glass-input w-full resize-y",
            isLightBackground && "glass-input-dark",
          )}
        />
      </SettingsRow>
    </>
  );
};

const LLMSettings = ({
  isLightBackground = false,
  hasChromeAI = false,
  onRequestDeleteLLMModel,
  refreshTrigger = 0,
  page,
  onActiveTargetChange,
}: LLMSettingsProps) => {
  const { embedConfig } = useEmbedHost();
  const chromeAiStatus = useChromeAIStatus();
  const { checkChromeAIAvailability, startChromeAIDownload } =
    useConfigStatusActions();
  const aiConfig = useAIConfig();
  const aiTesting = useAITesting();
  const [chromeParams, setChromeParams] = useState<Record<
    string,
    number
  > | null>(null);
  useEffect(() => {
    let active = true;
    if (aiConfig.provider === AIProviders.CHROME_AI) {
      void ChromeAIValidator.getModelParams().then((params) => {
        if (active) setChromeParams(params);
      });
    }
    return () => {
      active = false;
    };
  }, [aiConfig.provider, hasChromeAI]);
  const { updateAIConfig, testAIConnection } = useConfigAIActions();
  const activeSectionKey = getAIProviderSection(aiConfig.provider);
  const thinkingEffort = aiConfig[activeSectionKey].thinkingEffort;

  const androidAPI = useAndroidApi();
  const desktopAPI = useDesktopApi();
  const desktopLlmBridge = isDesktopLlmBridge(desktopAPI?.llm)
    ? desktopAPI.llm
    : null;
  const [desktopDecisionModelsPath, setDesktopDecisionModelsPath] = useState<
    string | null
  >(null);
  const desktopCustomModelsPath =
    aiConfig["desktop-local"]?.customModelsPath ?? null;

  useEffect(() => {
    let active = true;
    if (!desktopLlmBridge) {
      setDesktopDecisionModelsPath(null);
      return () => {
        active = false;
      };
    }
    void desktopLlmBridge
      .getDecisionModelsDir(desktopCustomModelsPath)
      .then((value) => {
        if (active && typeof value === "string") {
          setDesktopDecisionModelsPath(value);
        }
      })
      .catch(() => {
        if (active) setDesktopDecisionModelsPath(null);
      });
    return () => {
      active = false;
    };
  }, [desktopCustomModelsPath, desktopLlmBridge]);
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
          models?: LocalModelEntry[];
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
      searchHuggingFaceModels: (
        query: string,
        cursor = "",
        pageSize = 20,
        filter = "",
      ) =>
        desktopLlmBridge.searchHuggingFaceModels
          ? (desktopLlmBridge.searchHuggingFaceModels(
              query,
              cursor,
              pageSize,
              filter,
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
  const androidStorageService = useMemo(
    () => (isAndroid ? getLLMModelStorage(androidAPI) : null),
    [androidAPI],
  );
  const desktopStorageService = useMemo(
    () =>
      isDesktop && desktopLlmApi
        ? getLLMModelStorage({ llm: desktopLlmApi })
        : null,
    [desktopLlmApi],
  );
  const [_desktopServerStatus, setDesktopServerStatus] = useState<
    unknown | null
  >(null);
  const desktopServerPort = Number(
    aiConfig["desktop-local"]?.serverPort || DEFAULT_SERVICE_PORTS.server,
  );
  const isDesktopServerPortValid =
    Number.isInteger(desktopServerPort) &&
    desktopServerPort >= 1 &&
    desktopServerPort <= 65535;
  const desktopInternalPorts = resolveDesktopInternalPorts(
    aiConfig["desktop-local"]?.internalPorts,
  );
  const desktopPortErrors = validateDesktopServicePorts(
    desktopServerPort,
    desktopInternalPorts,
  );

  useEffect(() => {
    if (!isDesktop || !desktopAPI?.server?.getStatus) {
      return;
    }

    let active = true;

    const refreshStatus = async () => {
      const getStatus = desktopAPI?.server?.getStatus;
      if (!getStatus) {
        return;
      }
      try {
        const status = await getStatus();
        if (active) {
          setDesktopServerStatus(status);
        }
      } catch {
        if (active) {
          setDesktopServerStatus(null);
        }
      }
    };

    refreshStatus();
    const interval = setInterval(refreshStatus, 5000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [desktopAPI]);

  // Filter providers based on platform
  const availableProviders = useMemo(() => {
    return getAvailableAIProviders({ isAndroid, isDesktop });
  }, []);

  const activeSubTab: LLMSubTabId =
    page === "routing" || page === "decision" || page === "profiles"
      ? page
      : "provider";
  const activeSubTabReadOnly = isSettingsTargetReadOnly(
    embedConfig,
    ("llm." + activeSubTab) as VAssistSettingsSubTabId,
  );
  useEffect(() => {
    onActiveTargetChange?.(("llm." + activeSubTab) as VAssistSettingsSubTabId);
  }, [activeSubTab, onActiveTargetChange]);

  const renderProviderSettings = () => {
    if (page === "generation")
      return activeSectionKey === "chromeAi" ? (
        <p className="text-sm opacity-60">
          Browser AI manages generation limits. Configure its available options
          under AI connection.
        </p>
      ) : (
        <>
          <ThinkingControl
            value={
              !aiConfig[activeSectionKey].thinkingEnabled
                ? "off"
                : thinkingEffort || "auto"
            }
            onChange={(value) => {
              const selection = getThinkingSelection(value);
              if (selection)
                updateAIConfig(activeSectionKey, {
                  ...aiConfig[activeSectionKey],
                  ...selection,
                });
            }}
          />
          <LLMParameterSettings
            provider={activeSectionKey}
            config={aiConfig[activeSectionKey]}
            onChange={(field, value) =>
              updateAIConfig(activeSectionKey + "." + field, value)
            }
            isLightBackground={isLightBackground}
          />
        </>
      );
    if (page === "models")
      return aiConfig.provider === AIProviders.DESKTOP_LOCAL ? (
        <DesktopLLMConfig
          view={page}
          config={aiConfig["desktop-local"]}
          onChange={(updates) =>
            Object.entries(updates).forEach(([key, value]) =>
              updateAIConfig("desktop-local." + key, value),
            )
          }
          isLightBackground={isLightBackground}
          onRequestDeleteModel={onRequestDeleteLLMModel ?? null}
          refreshTrigger={refreshTrigger}
        />
      ) : (
        <LocalLLMModelManager
          storageService={androidStorageService}
          selectedModel={aiConfig["android-local"]?.model || null}
          onModelSelect={(modelName: string) =>
            updateAIConfig("android-local.model", modelName)
          }
          customModelsPath={null}
          onCustomPathChange={null}
          isLightBackground={isLightBackground}
          onRequestDeleteModel={onRequestDeleteLLMModel ?? null}
          refreshTrigger={refreshTrigger}
          supportsCustomFolder={false}
        />
      );
    if (page === "runtime")
      return (
        <>
          {isDesktop && (
            <section className="settings-section">
              <div className="text-sm font-medium vassist-text-primary">
                Shared Local API Server (LLM/TTS/STT)
              </div>

              <SettingsRow
                className="pt-2"
                label="Share On Local Network"
                description="When enabled, binds to LAN so other devices can use your hosted server."
              >
                <Toggle
                  id="desktop-local-share-network"
                  checked={aiConfig["desktop-local"]?.shareOnNetwork === true}
                  onChange={(checked) =>
                    updateAIConfig("desktop-local.shareOnNetwork", checked)
                  }
                />
              </SettingsRow>

              <div className="flex min-w-0 flex-col gap-2">
                <SettingsRow label="Shared Server Port" layout="stacked">
                  <Input
                    type="number"
                    min="1"
                    max="65535"
                    step="1"
                    value={desktopServerPort}
                    onChange={(e) => {
                      const nextPort = Number.parseInt(e.target.value, 10);
                      if (Number.isInteger(nextPort)) {
                        updateAIConfig("desktop-local.serverPort", nextPort);
                      }
                    }}
                    variant={isLightBackground ? "dark" : "default"}
                  />
                </SettingsRow>
                {!isDesktopServerPortValid && (
                  <p className="text-xs text-red-300">
                    Port must be between 1 and 65535.
                  </p>
                )}
              </div>

              <SettingsDisclosure title="Internal ports">
                <div className="px-3 pb-3">
                  <p className="text-xs vassist-text-muted">
                    Each port must be unique and between 1 and 65535.
                  </p>
                  <div className="pt-3 flex flex-col gap-3">
                    {(
                      [
                        ["llamaServer", "llama-server", "Local LLM worker"],
                        [
                          "decisionLlamaServer",
                          "decision-server",
                          "System One decision worker",
                        ],
                        ["gptSovits", "GPT-SoVITS", "Local voice synthesis"],
                        [
                          "fasterWhisper",
                          "faster-whisper",
                          "Speech recognition",
                        ],
                        ["supertonic", "Supertonic", "Local TTS worker"],
                        ["whisperCpp", "whisper.cpp", "Speech recognition"],
                      ] as const
                    ).map(([key, label, description]) => (
                      <label
                        key={key}
                        className="flex flex-col gap-1 text-xs vassist-text-secondary"
                      >
                        <span className="block font-medium vassist-text-primary">
                          {label}
                        </span>
                        <span className="block vassist-text-muted">
                          {description}
                        </span>
                        <Input
                          type="number"
                          min="1"
                          max="65535"
                          step="1"
                          value={desktopInternalPorts[key]}
                          onChange={(e) => {
                            const nextPort = Number.parseInt(
                              e.target.value,
                              10,
                            );
                            if (Number.isInteger(nextPort)) {
                              updateAIConfig(
                                `desktop-local.internalPorts.${key}`,
                                nextPort,
                              );
                            }
                          }}
                          variant={isLightBackground ? "dark" : "default"}
                        />
                      </label>
                    ))}
                  </div>
                  {desktopPortErrors.length > 0 && (
                    <div className="pt-3 flex flex-col gap-1 text-xs text-red-300">
                      {desktopPortErrors.map((error) => (
                        <p key={error}>{error}</p>
                      ))}
                    </div>
                  )}
                </div>
              </SettingsDisclosure>
            </section>
          )}

          {aiConfig.provider === AIProviders.DESKTOP_LOCAL ? (
            <DesktopLLMConfig
              view={page}
              config={aiConfig["desktop-local"]}
              onChange={(updates) =>
                Object.entries(updates).forEach(([key, value]) =>
                  updateAIConfig("desktop-local." + key, value),
                )
              }
              isLightBackground={isLightBackground}
              onRequestDeleteModel={onRequestDeleteLLMModel ?? null}
              refreshTrigger={refreshTrigger}
            />
          ) : (
            <ComputeUnitCard
              androidAPI={androidAPI}
              value={aiConfig["android-local"]?.computeUnit || "auto"}
              onChange={(unit) => {
                updateAIConfig("android-local.computeUnit", unit);
                androidAPI?.setLLMComputeUnit?.(unit);
              }}
            />
          )}
        </>
      );
    return (
      <>
        <div className="flex flex-col gap-2">
          <SettingsRow
            label="Provider"
            targetId="llm.provider.select"
            layout="stacked"
          >
            <Select
              value={aiConfig.provider}
              onChange={(e) => updateAIConfig("provider", e.target.value)}
              variant={isLightBackground ? "dark" : "default"}
              options={availableProviders.map((value) => ({
                value,
                label: PROVIDER_LABELS[value] || value,
              }))}
            />
          </SettingsRow>
        </div>

        {aiConfig.provider === "chrome-ai" && !hasChromeAI && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-xs text-red-300">
              Chrome AI requires Chrome 138 or later. Please update your
              browser.
            </p>
          </div>
        )}

        {aiConfig.provider === AIProviders.OPENAI && (
          <>
            <RemoteProfileManager
              aiConfig={aiConfig}
              updateAIConfig={updateAIConfig}
              isLightBackground={isLightBackground}
              provider="openai"
            />
            <SettingsRow
              label="Endpoint URL"
              targetId="llm.openai.endpoint"
              layout="stacked"
            >
              <Input
                value={aiConfig.openai.endpoint}
                onChange={(event) =>
                  updateAIConfig("openai.endpoint", event.target.value)
                }
                placeholder={DEFAULT_ENDPOINTS.openaiApi}
                variant={isLightBackground ? "dark" : "default"}
              />
            </SettingsRow>
            <SettingsRow
              label="API Key"
              targetId="llm.openai.apiKey"
              layout="stacked"
            >
              <Input
                type="password"
                value={aiConfig.openai.apiKey}
                onChange={(e) =>
                  updateAIConfig("openai.apiKey", e.target.value)
                }
                placeholder="sk-..."
                variant={isLightBackground ? "dark" : "default"}
                className="w-full"
              />
            </SettingsRow>
            <SettingsRow
              label="Model"
              targetId="llm.openai.model"
              layout="stacked"
            >
              <RemoteModelPicker
                value={aiConfig.openai.model}
                onChange={(value) => updateAIConfig("openai.model", value)}
                provider="openai"
                endpoint={aiConfig.openai.endpoint}
                placeholder="gpt-4o"
                apiKey={aiConfig.openai.apiKey}
                isLightBackground={isLightBackground}
              />
            </SettingsRow>
            <ImageSupportToggle
              providerKey="openai"
              aiConfig={aiConfig}
              updateAIConfig={updateAIConfig}
            />
            <AudioSupportToggle
              providerKey="openai"
              aiConfig={aiConfig}
              updateAIConfig={updateAIConfig}
            />
          </>
        )}

        {aiConfig.provider === AIProviders.OLLAMA && (
          <>
            <RemoteProfileManager
              aiConfig={aiConfig}
              updateAIConfig={updateAIConfig}
              isLightBackground={isLightBackground}
              provider="ollama"
            />
            <SettingsRow
              label="API format"
              targetId="llm.ollama.apiFormat"
              layout="stacked"
            >
              <Select
                value={aiConfig.ollama.apiFormat}
                onChange={(event) =>
                  updateAIConfig("ollama.apiFormat", event.target.value)
                }
                variant={isLightBackground ? "dark" : "default"}
                options={[
                  { value: "openai", label: "OpenAI-compatible" },
                  { value: "ollama", label: "Ollama native (runtime options)" },
                ]}
              />
            </SettingsRow>
            <SettingsRow
              label="Endpoint URL"
              targetId="llm.ollama.endpoint"
              layout="stacked"
            >
              <Input
                type="text"
                value={aiConfig.ollama?.endpoint ?? ""}
                onChange={(e) =>
                  updateAIConfig("ollama.endpoint", e.target.value)
                }
                placeholder={DEFAULT_ENDPOINTS.ollama}
                variant={isLightBackground ? "dark" : "default"}
                className="w-full"
              />
            </SettingsRow>
            <SettingsRow
              label="API Key"
              targetId="llm.ollama.apiKey"
              layout="stacked"
            >
              <Input
                type="password"
                value={aiConfig.ollama.apiKey}
                onChange={(event) =>
                  updateAIConfig("ollama.apiKey", event.target.value)
                }
                placeholder="Optional"
                variant={isLightBackground ? "dark" : "default"}
              />
            </SettingsRow>
            <SettingsRow
              label="Model"
              targetId="llm.ollama.model"
              layout="stacked"
            >
              <RemoteModelPicker
                value={aiConfig.ollama?.model ?? ""}
                onChange={(value) => updateAIConfig("ollama.model", value)}
                provider="ollama"
                endpoint={aiConfig.ollama?.endpoint}
                placeholder="llama2"
                isLightBackground={isLightBackground}
              />
            </SettingsRow>
            <ImageSupportToggle
              providerKey="ollama"
              aiConfig={aiConfig}
              updateAIConfig={updateAIConfig}
              additionalNote="Requires multi-modal capable model."
            />
            {aiConfig.ollama.apiFormat !== "ollama" && (
              <AudioSupportToggle
                providerKey="ollama"
                aiConfig={aiConfig}
                updateAIConfig={updateAIConfig}
                additionalNote="Requires multi-modal capable model."
              />
            )}
          </>
        )}

        {aiConfig.provider === AIProviders.ANDROID_LOCAL && isAndroid && (
          <>
            <div className="p-3 rounded-lg bg-current/10 border border-current/20">
              <p className="text-xs text-green-300">
                <span className="font-semibold">Android Local LLM</span> -
                On-device AI using llama.cpp. Download and manage GGUF models
                below.
              </p>
            </div>
            <RemoteProfileManager
              aiConfig={aiConfig}
              updateAIConfig={updateAIConfig}
              isLightBackground={isLightBackground}
              provider="android-local"
            />

            <SettingsRow label="Endpoint URL" layout="stacked">
              <Input
                type="text"
                value={
                  aiConfig["android-local"]?.endpoint ??
                  DEFAULT_ENDPOINTS.androidLocal
                }
                onChange={(e) =>
                  updateAIConfig("android-local.endpoint", e.target.value)
                }
                placeholder={DEFAULT_ENDPOINTS.androidLocal}
                variant={isLightBackground ? "dark" : "default"}
                className="w-full"
              />
            </SettingsRow>

            <RemoteModelPicker
              provider="android-local"
              value={aiConfig["android-local"].model}
              endpoint={aiConfig["android-local"].endpoint}
              onChange={(model) => updateAIConfig("android-local.model", model)}
              isLightBackground={isLightBackground}
            />
          </>
        )}

        {aiConfig.provider === AIProviders.DESKTOP_LOCAL && isDesktop && (
          <>
            <RemoteProfileManager
              aiConfig={aiConfig}
              updateAIConfig={updateAIConfig}
              isLightBackground={isLightBackground}
              provider="desktop-local"
            />
            <DesktopLLMConfig
              view="connection"
              config={aiConfig["desktop-local"] || {}}
              onChange={(updates: Record<string, unknown>) => {
                Object.entries(updates).forEach(([key, value]) => {
                  updateAIConfig(`desktop-local.${key}`, value);
                });
              }}
              isSetupMode={false}
              isLightBackground={isLightBackground}
              {...(onRequestDeleteLLMModel
                ? { onRequestDeleteModel: onRequestDeleteLLMModel }
                : {})}
              {...(typeof refreshTrigger !== "undefined"
                ? { refreshTrigger }
                : {})}
            />
          </>
        )}

        {aiConfig.provider === AIProviders.CHROME_AI && (
          <>
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <p className="text-xs text-blue-300">
                <span className="font-semibold">
                  Chrome Built-in AI (Gemini Nano)
                </span>{" "}
                - On-device AI running locally
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <label className="block text-sm font-medium vassist-text-primary">
                Status
              </label>
              <div className="settings-section">
                {chromeAiStatus.checking ? (
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
                    <span className="text-xs vassist-text-secondary">
                      Checking availability...
                    </span>
                  </div>
                ) : chromeAiStatus.state ? (
                  <>
                    <StatusMessage
                      message={chromeAiStatus.message}
                      isLightBackground={isLightBackground}
                      className="pb-2"
                    />
                    <p className="text-xs vassist-text-muted">
                      {chromeAiStatus.details}
                    </p>

                    {chromeAiStatus.downloading && (
                      <div className="pt-3 flex flex-col gap-2">
                        <div className="p-2 rounded bg-yellow-500/10 border border-yellow-500/20">
                          <p className="text-xs text-yellow-300">
                            Download in progress. For real-time progress, visit{" "}
                            <a
                              href="chrome://on-device-internals/"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline hover:text-yellow-200"
                            >
                              chrome://on-device-internals/
                            </a>
                          </p>
                        </div>
                      </div>
                    )}

                    {(chromeAiStatus.state === "downloadable" ||
                      chromeAiStatus.state === "after-download") &&
                      !chromeAiStatus.downloading && (
                        <Button
                          onClick={startChromeAIDownload}
                          variant={isLightBackground ? "dark" : "default"}
                          size="sm"
                          className="pt-3 w-full"
                        >
                          Start Model Download
                        </Button>
                      )}

                    <button
                      onClick={checkChromeAIAvailability}
                      className="pt-2 text-xs text-blue-400 hover:text-blue-300"
                    >
                      ↻ Refresh Status
                    </button>
                  </>
                ) : (
                  <Button
                    onClick={checkChromeAIAvailability}
                    variant={isLightBackground ? "dark" : "default"}
                    size="sm"
                    className="w-full"
                  >
                    Check Status
                  </Button>
                )}
              </div>
            </div>

            {chromeParams ? (
              <div className="flex flex-col gap-4">
                <NumberParameter
                  label="Temperature"
                  value={aiConfig.chromeAi.temperature}
                  min={0}
                  max={chromeParams.maxTemperature}
                  step={0.01}
                  onChange={(value) =>
                    updateAIConfig(
                      "chromeAi.temperature",
                      value ?? chromeParams.defaultTemperature,
                    )
                  }
                  isLightBackground={isLightBackground}
                />
                <NumberParameter
                  label="Top K"
                  value={aiConfig.chromeAi.topK}
                  min={1}
                  max={chromeParams.maxTopK}
                  onChange={(value) =>
                    updateAIConfig(
                      "chromeAi.topK",
                      value ?? chromeParams.defaultTopK,
                    )
                  }
                  isLightBackground={isLightBackground}
                />
                <p className="text-xs vassist-text-muted">
                  Context capacity is managed by the browser.
                </p>
              </div>
            ) : (
              <p className="text-xs vassist-text-muted">
                Sampling and context capacity are managed by the browser.
                Numeric sampling controls are available when the browser exposes
                them.
              </p>
            )}

            <SettingsRow label="Output Language" layout="stacked">
              <Select
                value={aiConfig.chromeAi?.outputLanguage || "en"}
                onChange={(e) =>
                  updateAIConfig("chromeAi.outputLanguage", e.target.value)
                }
                variant={isLightBackground ? "dark" : "default"}
                options={[
                  { value: "en", label: "English (en)" },
                  { value: "es", label: "Spanish (es)" },
                  { value: "ja", label: "Japanese (ja)" },
                ]}
              />
            </SettingsRow>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3 settings-section">
                <label
                  htmlFor="chrome-ai-image-support"
                  className="text-sm font-medium vassist-text-primary cursor-pointer flex-1"
                >
                  Enable Image Support (Multi-modal)
                </label>
                <Toggle
                  id="chrome-ai-image-support"
                  checked={aiConfig.chromeAi?.enableImageSupport !== false}
                  onChange={(checked) =>
                    updateAIConfig("chromeAi.enableImageSupport", checked)
                  }
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3 settings-section">
                <label
                  htmlFor="chrome-ai-audio-support"
                  className="text-sm font-medium vassist-text-primary cursor-pointer flex-1"
                >
                  Enable Audio Support (Multi-modal)
                </label>
                <Toggle
                  id="chrome-ai-audio-support"
                  checked={aiConfig.chromeAi?.enableAudioSupport !== false}
                  onChange={(checked) =>
                    updateAIConfig("chromeAi.enableAudioSupport", checked)
                  }
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="block text-sm font-medium vassist-text-primary">
                Required Chrome Flags
              </label>
              <div className="flex flex-col gap-2 text-xs settings-section">
                <div className="flex items-center justify-between">
                  <span className="vassist-text-secondary">
                    optimization-guide-on-device-model
                  </span>
                  <button
                    onClick={() =>
                      navigator.clipboard.writeText(
                        "chrome://flags/#optimization-guide-on-device-model",
                      )
                    }
                    className="text-blue-400 hover:text-blue-300 text-xs"
                  >
                    Copy
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="vassist-text-secondary">
                    prompt-api-for-gemini-nano
                  </span>
                  <button
                    onClick={() =>
                      navigator.clipboard.writeText(
                        "chrome://flags/#prompt-api-for-gemini-nano",
                      )
                    }
                    className="text-blue-400 hover:text-blue-300 text-xs"
                  >
                    Copy
                  </button>
                </div>
                <p className="vassist-text-muted pt-2">
                  Enable these flags and restart Chrome, then visit{" "}
                  <code className="text-blue-300">chrome://components</code> to
                  download Gemini Nano
                </p>
              </div>
            </div>
          </>
        )}

        <div className="flex items-center gap-3 pt-4">
          <Button
            onClick={testAIConnection}
            disabled={aiTesting}
            variant={isLightBackground ? "dark" : "default"}
          >
            Test Connection
          </Button>
        </div>
      </>
    );
  };

  const renderRoutingSettings = () => {
    if (aiConfig.provider === AIProviders.OPENAI) {
      return (
        <div className="settings-section">
          <ModelConfigRemote
            providerKey="openai"
            routing={aiConfig.openai?.routing}
            profiles={aiConfig.remoteProfiles}
            apiKey={aiConfig.openai.apiKey}
            onChange={(field: string, value: unknown) =>
              updateAIConfig(`openai.${field}`, value)
            }
            isLightBackground={isLightBackground}
          />
        </div>
      );
    }

    if (aiConfig.provider === AIProviders.OLLAMA) {
      return (
        <div className="settings-section">
          <ModelConfigRemote
            providerKey="ollama"
            routing={aiConfig.ollama?.routing}
            profiles={aiConfig.remoteProfiles}
            endpoint={aiConfig.ollama?.endpoint}
            onChange={(field: string, value: unknown) =>
              updateAIConfig(`ollama.${field}`, value)
            }
            isLightBackground={isLightBackground}
          />
        </div>
      );
    }

    if (aiConfig.provider === AIProviders.ANDROID_LOCAL && isAndroid) {
      return (
        <div className="settings-section">
          <ModelConfigLocal
            routing={aiConfig["android-local"]?.routing}
            profiles={aiConfig.remoteProfiles}
            onChange={(field, value) =>
              updateAIConfig(`android-local.${field}`, value)
            }
            storageService={androidStorageService}
            refreshTrigger={refreshTrigger}
            customModelsPath={null}
            isLightBackground={isLightBackground}
          />
        </div>
      );
    }

    if (aiConfig.provider === AIProviders.DESKTOP_LOCAL && isDesktop) {
      return (
        <div className="settings-section">
          <ModelConfigLocal
            routing={aiConfig["desktop-local"]?.routing}
            profiles={aiConfig.remoteProfiles}
            onChange={(field, value) =>
              updateAIConfig(`desktop-local.${field}`, value)
            }
            storageService={desktopStorageService}
            refreshTrigger={refreshTrigger}
            customModelsPath={
              aiConfig["desktop-local"]?.customModelsPath ?? null
            }
            isLightBackground={isLightBackground}
          />
        </div>
      );
    }

    return (
      <div className="text-sm vassist-text-secondary settings-section">
        Routing is not available for this provider yet.
      </div>
    );
  };

  const renderProfileSettings = () => {
    const providerKey =
      aiConfig.provider === AIProviders.CHROME_AI
        ? "chromeAi"
        : aiConfig.provider;

    return (
      <SystemPromptSection
        providerKey={providerKey as SystemPromptSectionProps["providerKey"]}
        isLightBackground={isLightBackground}
        aiConfig={aiConfig}
        updateAIConfig={updateAIConfig}
      />
    );
  };

  if (
    isSettingsTargetHidden(
      embedConfig,
      ("llm." + activeSubTab) as VAssistSettingsSubTabId,
    )
  )
    return null;

  return (
    <div className={page ? "flex flex-col gap-5" : "flex flex-col h-full"}>
      <div className={page ? "flex flex-col gap-5" : "flex-1 overflow-hidden"}>
        <SettingsScrollArea
          className={
            page
              ? "flex flex-col gap-5"
              : "h-full overflow-y-auto scrollbar-glass"
          }
        >
          <Suspense fallback={<SettingsLoading />}>
            <SettingsSubTabContent
              render={() => (
                <div
                  className={
                    activeSubTabReadOnly
                      ? "pointer-events-none opacity-70"
                      : undefined
                  }
                  inert={activeSubTabReadOnly}
                >
                  <div className="flex flex-col gap-5">
                    {activeSubTab === "provider" && renderProviderSettings()}
                    {activeSubTab === "routing" && renderRoutingSettings()}
                    {activeSubTab === "decision" && (
                      <DecisionSettings
                        aiConfig={aiConfig}
                        provider={aiConfig.provider}
                        isLightBackground={isLightBackground}
                        updateAIConfig={updateAIConfig}
                        storageService={desktopStorageService}
                        decisionModelsPath={desktopDecisionModelsPath}
                      />
                    )}
                    {activeSubTab === "profiles" && renderProfileSettings()}
                  </div>
                </div>
              )}
            />
          </Suspense>
        </SettingsScrollArea>
      </div>
    </div>
  );
};

export default LLMSettings;
