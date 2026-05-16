/**
 * LLMSettings Component
 * LLM configuration tab for SettingsPanel
 * Handles provider selection and configuration for OpenAI, Ollama, and Chrome AI
 */

import { useEffect, useMemo, useRef, useState } from "react";
import * as React from "react";
import {
  useAIConfig,
  useAITesting,
  useConfigAIActions,
} from "../../hooks/config/useConfigAI";
import {
  useChromeAIStatus,
  useConfigStatusActions,
} from "../../hooks/config/useConfigStatus";
import {
  AIProviders,
  type AIConfig,
  type AIRemoteProviderProfile,
} from "../../config/aiConfig";
import { PromptConfig } from "../../config/promptConfig";
import { isAndroid, isDesktop } from "../../utils/PlatformUtils";
import { useAndroidApi } from "../../hooks/useAndroidStore";
import { useDesktopApi } from "../../hooks/useDesktopStore";
import DesktopLLMConfig from "./llm/DesktopLLMConfig";
import LocalLLMModelManager from "./llm/LocalLLMModelManager";
import {
  getLLMModelStorage,
  type DiscoveryResult,
} from "../../services/LLMModelStorageService";
import RemoteModelPicker from "./shared/RemoteModelPicker";
import Toggle from "../common/Toggle";
import StatusMessage from "../common/StatusMessage";
import { Icon } from "../icons";
import { cn } from "../../utils/cn";
import { Button, Input, Select, Card, SettingsRow, TabBar } from "../ui";

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

interface SystemPromptProfile {
  id: string;
  name: string;
  prompt: string;
  isBuiltIn?: boolean;
}

interface LLMSettingsProps {
  isLightBackground?: boolean;
  hasChromeAI?: boolean;
  onRequestDeleteLLMModel?: ((modelName: string) => void) | undefined;
  refreshTrigger?: unknown;
}

type LLMSubTabId = "provider" | "routing" | "profiles";

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
  const [selectedProfileId, setSelectedProfileId] = React.useState("");
  const selectedProfile =
    profiles.find((profile) => profile.id === selectedProfileId) || null;
  const actionVariant = isLightBackground ? "dark" : "ghost";

  React.useEffect(() => {
    if (
      selectedProfileId &&
      !profiles.some((profile) => profile.id === selectedProfileId)
    ) {
      setSelectedProfileId("");
    }
  }, [profiles, selectedProfileId]);

  React.useEffect(() => {
    if (!selectedProfile) {
      if (!selectedProfileId) {
        setProfileName("");
      }
      return;
    }

    setProfileName(selectedProfile.name);
  }, [selectedProfile, selectedProfileId]);

  const applyProfileToProvider = (profile: AIRemoteProviderProfile) => {
    if (profile.provider === AIProviders.OPENAI) {
      updateAIConfig("openai", {
        ...aiConfig.openai,
        apiKey: profile.apiKey || "",
        model: profile.model,
        temperature: profile.temperature ?? aiConfig.openai.temperature,
        maxTokens: profile.maxTokens ?? aiConfig.openai.maxTokens,
        enableImageSupport: profile.enableImageSupport !== false,
        enableAudioSupport: profile.enableAudioSupport !== false,
      });
      return;
    }

    if (profile.provider === AIProviders.ANDROID_LOCAL) {
      updateAIConfig("android-local", {
        ...aiConfig["android-local"],
        endpoint: profile.endpoint || aiConfig["android-local"].endpoint,
        model: profile.model,
        temperature:
          profile.temperature ?? aiConfig["android-local"].temperature,
        maxTokens: profile.maxTokens ?? aiConfig["android-local"].maxTokens,
      });
      return;
    }

    if (profile.provider === AIProviders.DESKTOP_LOCAL) {
      updateAIConfig("desktop-local", {
        ...aiConfig["desktop-local"],
        endpoint: profile.endpoint || aiConfig["desktop-local"].endpoint,
        model: profile.model,
        customModelsPath:
          profile.customModelsPath ??
          aiConfig["desktop-local"].customModelsPath,
        shareOnNetwork:
          profile.shareOnNetwork ?? aiConfig["desktop-local"].shareOnNetwork,
        serverPort: profile.serverPort ?? aiConfig["desktop-local"].serverPort,
        backend: profile.backend ?? aiConfig["desktop-local"].backend,
        temperature:
          profile.temperature ?? aiConfig["desktop-local"].temperature,
        maxTokens: profile.maxTokens ?? aiConfig["desktop-local"].maxTokens,
        contextSize:
          profile.contextSize ?? aiConfig["desktop-local"].contextSize,
        gpuLayers: profile.gpuLayers ?? aiConfig["desktop-local"].gpuLayers,
        threads: profile.threads ?? aiConfig["desktop-local"].threads,
      });
      return;
    }

    updateAIConfig("ollama", {
      ...aiConfig.ollama,
      endpoint: profile.endpoint || aiConfig.ollama.endpoint,
      model: profile.model,
      temperature: profile.temperature ?? aiConfig.ollama.temperature,
      maxTokens: profile.maxTokens ?? aiConfig.ollama.maxTokens,
      enableImageSupport: profile.enableImageSupport !== false,
      enableAudioSupport: profile.enableAudioSupport !== false,
    });
  };

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
        endpoint: aiConfig.ollama.endpoint,
        apiKey: "",
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
    <div className="space-y-2">
      <label className="block text-sm font-medium text-white/90">
        Saved Backends
      </label>
      <Input
        type="text"
        value={profileName}
        onChange={(event) => setProfileName(event.target.value)}
        placeholder="Backend name"
        variant={isLightBackground ? "dark" : "default"}
        size="xs"
      />
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
        <Select
          value={selectedProfileId}
          onChange={(event) => handleProfileChange(event.target.value)}
          variant={isLightBackground ? "dark" : "default"}
          className="min-h-[32px]"
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
        <Button
          type="button"
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
    <div className="space-y-3">
      {/* Main Routing Toggle */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
        <div>
          <label className="text-sm font-medium text-white/90">
            Enable Model Routing
          </label>
          <p className="text-xs text-white/50 mt-0.5">
            Use separate models for vision/routing tasks
          </p>
        </div>
        <Toggle
          checked={routing?.enabled === true}
          onChange={(checked) =>
            onChange("routing", { ...routing, enabled: checked })
          }
        />
      </div>

      {routing?.enabled && (
        <>
          {/* Vision Model */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-white/80">
                Vision Model
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/60">Use main LLM</span>
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
              <div className="space-y-2">
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
                  provider={visionProfile?.provider || providerKey}
                  endpoint={visionProfile?.endpoint || endpoint}
                  apiKey={visionProfile?.apiKey || apiKey}
                  placeholder={visionProfile?.model || examples.vision}
                  isLightBackground={isLightBackground}
                />
              </div>
            )}
          </div>

          {/* Router Model */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-white/80">
                Router Model
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/60">Use main LLM</span>
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
              <div className="space-y-2">
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
                  provider={routerProfile?.provider || providerKey}
                  endpoint={routerProfile?.endpoint || endpoint}
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
    <div className="space-y-3">
      {/* Main Routing Toggle */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
        <div>
          <label className="text-sm font-medium text-white/90">
            Enable Model Routing
          </label>
          <p className="text-xs text-white/50 mt-0.5">
            Use separate models for vision/routing tasks
          </p>
        </div>
        <Toggle
          checked={routing?.enabled === true}
          onChange={(checked) =>
            onChange("routing", { ...routing, enabled: checked })
          }
        />
      </div>

      {routing?.enabled && (
        <>
          {/* Vision Model */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-white/80">
                Vision Model
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/60">Use main LLM</span>
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
                  <div className="space-y-2">
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
                      apiKey={visionProfile.apiKey}
                      placeholder={visionProfile.model || "Remote model"}
                      isLightBackground={isLightBackground}
                    />
                  </div>
                ) : (
                  <>
                    {loading ? (
                      <div className="text-xs text-white/50 py-2">
                        Loading models...
                      </div>
                    ) : models.length === 0 ? (
                      <div className="text-xs text-white/40 py-2">
                        No models found
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {models.map((model) => (
                          <div
                            key={model.name}
                            className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Icon
                                  name="document"
                                  size={14}
                                  className="text-white/70 flex-shrink-0"
                                />
                                <span className="text-sm font-medium text-white/90 truncate">
                                  {model.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-[10px] text-white/50">
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
                                  className="p-2 text-white/70"
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
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-white/80">
                Router Model
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/60">Use main LLM</span>
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
                  <div className="space-y-2">
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
                      apiKey={routerProfile.apiKey}
                      placeholder={routerProfile.model || "Remote model"}
                      isLightBackground={isLightBackground}
                    />
                  </div>
                ) : (
                  <>
                    {loading ? (
                      <div className="text-xs text-white/50 py-2">
                        Loading models...
                      </div>
                    ) : models.length === 0 ? (
                      <div className="text-xs text-white/40 py-2">
                        No models found
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {models.map((model) => (
                          <div
                            key={model.name}
                            className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Icon
                                  name="document"
                                  size={14}
                                  className="text-white/70 flex-shrink-0"
                                />
                                <span className="text-sm font-medium text-white/90 truncate">
                                  {model.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-[10px] text-white/50">
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
                                  className="p-2 text-white/70"
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
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
        <label
          htmlFor={`${providerKey}-image-support`}
          className="text-sm font-medium text-white/90 cursor-pointer flex-1"
        >
          Enable Image Support (Multi-modal)
          <p className="text-xs text-white/50 mt-0.5">
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
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
        <label
          htmlFor={`${providerKey}-audio-support`}
          className="text-sm font-medium text-white/90 cursor-pointer flex-1"
        >
          Enable Audio Support (Multi-modal)
          <p className="text-xs text-white/50 mt-0.5">
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
  const [draftProfileName, setDraftProfileName] = React.useState(
    selectedProfile?.name || "",
  );
  const [draftProfilePrompt, setDraftProfilePrompt] = React.useState(
    selectedProfile?.prompt || "",
  );

  const persistProfiles = React.useCallback(
    (
      nextProfiles: SystemPromptProfile[],
      nextSelectedId: string,
      options?: { debounceMs?: number },
    ) => {
      updateAIConfig(
        `${providerKey}.systemPromptProfiles`,
        nextProfiles,
        options,
      );
      updateAIConfig(
        `${providerKey}.selectedSystemPromptProfileId`,
        nextSelectedId,
        options,
      );

      const nextActive =
        nextProfiles.find((profile) => profile.id === nextSelectedId) ||
        nextProfiles[0];
      if (nextActive) {
        updateAIConfig(
          `${providerKey}.systemPromptType`,
          nextActive.id,
          options,
        );
        updateAIConfig(
          `${providerKey}.systemPrompt`,
          nextActive.prompt,
          options,
        );
      }
    },
    [providerKey, updateAIConfig],
  );

  const getProfilesWithDraftEdits = React.useCallback((): {
    nextProfiles: SystemPromptProfile[];
    changed: boolean;
  } => {
    if (!selectedProfile) {
      return { nextProfiles: profiles, changed: false };
    }

    let changed = false;
    const nextProfiles = profiles.map((profile) => {
      if (profile.id !== selectedProfile.id) {
        return profile;
      }

      const nextName =
        draftProfileName.length > 0 ? draftProfileName : "Unnamed";
      const nextPrompt = draftProfilePrompt;
      if (profile.name === nextName && profile.prompt === nextPrompt) {
        return profile;
      }

      changed = true;
      return { ...profile, name: nextName, prompt: nextPrompt };
    });

    return { nextProfiles, changed };
  }, [draftProfileName, draftProfilePrompt, profiles, selectedProfile]);

  const commitDraftEdits = React.useCallback(
    (options?: { debounceMs?: number }) => {
      if (!selectedProfile) {
        return;
      }

      const { nextProfiles, changed } = getProfilesWithDraftEdits();
      if (changed) {
        persistProfiles(nextProfiles, selectedProfile.id, options);
      }
    },
    [getProfilesWithDraftEdits, persistProfiles, selectedProfile],
  );

  React.useEffect(() => {
    setDraftProfileName(selectedProfile?.name || "");
    setDraftProfilePrompt(selectedProfile?.prompt || "");
  }, [selectedProfile?.id, selectedProfile?.name, selectedProfile?.prompt]);

  React.useEffect(() => {
    if (!selectedProfile) {
      return;
    }

    if (
      draftProfileName === selectedProfile.name &&
      draftProfilePrompt === selectedProfile.prompt
    ) {
      return;
    }

    commitDraftEdits({ debounceMs: 250 });
  }, [commitDraftEdits, draftProfileName, draftProfilePrompt, selectedProfile]);

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
    const { nextProfiles: profilesWithDrafts } = getProfilesWithDraftEdits();
    const timestamp = Date.now();
    const nextProfile: SystemPromptProfile = {
      id: `custom-${timestamp}`,
      name: `Custom ${profilesWithDrafts.filter((profile) => profile.id.startsWith("custom-")).length + 1}`,
      prompt: selectedProfile?.prompt || "",
      isBuiltIn: false,
    };
    persistProfiles([...profilesWithDrafts, nextProfile], nextProfile.id);
  };

  const deleteCurrentProfile = (): void => {
    if (!selectedProfile || profiles.length <= 1) {
      return;
    }
    const { nextProfiles: profilesWithDrafts } = getProfilesWithDraftEdits();
    const remaining = profilesWithDrafts.filter(
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
      <div className="space-y-2">
        <label className="block text-sm font-medium text-white/90">
          System Prompt Profile
        </label>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <Select
              value={selectedProfile?.id || "default"}
              onChange={(e) => {
                const nextId = e.target.value;
                if (profiles.some((profile) => profile.id === nextId)) {
                  const { nextProfiles } = getProfilesWithDraftEdits();
                  persistProfiles(nextProfiles, nextId);
                }
              }}
              variant={isLightBackground ? "dark" : "default"}
              options={profileOptions}
            />
          </div>
          <Button
            size="icon"
            variant={isLightBackground ? "dark" : "default"}
            title="Add profile"
            onClick={addProfile}
          >
            <Icon name="add" size={16} />
          </Button>
          <Button
            size="icon"
            variant={isLightBackground ? "dark" : "default"}
            title="Delete current profile"
            onClick={deleteCurrentProfile}
            disabled={profiles.length <= 1}
          >
            <Icon name="trash-2" size={16} />
          </Button>
        </div>
        <p className="text-xs text-white/50">
          Create and manage multiple persistent prompt personalities.
        </p>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-white/90">
          Profile Name
        </label>
        <Input
          value={draftProfileName}
          onChange={(e) => setDraftProfileName(e.target.value)}
          onBlur={() => commitDraftEdits()}
          variant={isLightBackground ? "dark" : "default"}
          placeholder="Profile name"
          className="w-full"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-white/90">
          System Prompt
        </label>
        <textarea
          value={draftProfilePrompt}
          onChange={(e) => setDraftProfilePrompt(e.target.value)}
          onBlur={() => commitDraftEdits()}
          placeholder="Enter system prompt..."
          rows={4}
          className={cn(
            "glass-input w-full resize-y",
            isLightBackground && "glass-input-dark",
          )}
        />
        <p className="text-xs text-white/50">
          Profile changes persist. Switching profiles keeps each profile's own
          prompt text.
        </p>
      </div>
    </>
  );
};

const LLMSettings = ({
  isLightBackground = false,
  hasChromeAI = false,
  onRequestDeleteLLMModel,
  refreshTrigger = 0,
}: LLMSettingsProps) => {
  const chromeAiStatus = useChromeAIStatus();
  const { checkChromeAIAvailability, startChromeAIDownload } =
    useConfigStatusActions();
  const aiConfig = useAIConfig();
  const aiTesting = useAITesting();
  const { updateAIConfig, testAIConnection } = useConfigAIActions();

  const androidAPI = useAndroidApi();
  const desktopAPI = useDesktopApi();
  const desktopLlmBridge = isDesktopLlmBridge(desktopAPI?.llm)
    ? desktopAPI.llm
    : null;
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
    aiConfig["desktop-local"]?.serverPort || 11438,
  );
  const isDesktopServerPortValid =
    Number.isInteger(desktopServerPort) &&
    desktopServerPort >= 1 &&
    desktopServerPort <= 65535;

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
    if (isAndroid) {
      return AIProviders;
    }
    const { ANDROID_LOCAL, CHROME_AI, ...otherProviders } = AIProviders;
    return otherProviders;
  }, []);

  const llmSubTabOrder: LLMSubTabId[] = ["provider", "routing", "profiles"];
  const [activeSubTab, setActiveSubTab] = useState<LLMSubTabId>("provider");
  const [subTabIndicatorStyle, setSubTabIndicatorStyle] = useState({
    left: 0,
    width: 0,
  });
  const subTabsRef = useRef<Record<LLMSubTabId, HTMLButtonElement | null>>({
    provider: null,
    routing: null,
    profiles: null,
  });

  useEffect(() => {
    const activeTabElement = subTabsRef.current[activeSubTab];
    if (!activeTabElement) {
      return;
    }

    const { offsetLeft, offsetWidth } = activeTabElement;
    setSubTabIndicatorStyle({ left: offsetLeft, width: offsetWidth });
  }, [activeSubTab]);

  const renderProviderSettings = () => (
    <>
      {isDesktop && (
        <Card variant="default">
          <div className="text-sm font-medium text-white/90">
            Shared Local API Server (LLM/TTS/STT)
          </div>

          <SettingsRow
            className="mt-2"
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

          <div className="space-y-2 mt-2">
            <label className="block text-sm font-medium text-white/90">
              Shared Server Port
            </label>
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
            {!isDesktopServerPortValid && (
              <p className="text-xs text-red-300">
                Port must be between 1 and 65535.
              </p>
            )}
          </div>
        </Card>
      )}

      <div className="space-y-2">
        <label className="block text-sm font-medium text-white/90">
          Provider
        </label>
        <Select
          value={aiConfig.provider}
          onChange={(e) => updateAIConfig("provider", e.target.value)}
          variant={isLightBackground ? "dark" : "default"}
          options={Object.entries(availableProviders).map(([key, value]) => ({
            value,
            label: PROVIDER_LABELS[value] || key,
          }))}
        />
      </div>

      {aiConfig.provider === "chrome-ai" && !hasChromeAI && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-xs text-red-300">
            Chrome AI requires Chrome 138 or later. Please update your browser.
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
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/90">
              API Key
            </label>
            <Input
              type="password"
              value={aiConfig.openai.apiKey}
              onChange={(e) => updateAIConfig("openai.apiKey", e.target.value)}
              placeholder="sk-..."
              variant={isLightBackground ? "dark" : "default"}
              className="w-full"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/90">
              Model
            </label>
            <RemoteModelPicker
              value={aiConfig.openai.model}
              onChange={(value) => updateAIConfig("openai.model", value)}
              provider="openai"
              placeholder="gpt-4o"
              apiKey={aiConfig.openai.apiKey}
              isLightBackground={isLightBackground}
            />
          </div>
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
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/90">
              Endpoint URL
            </label>
            <Input
              type="text"
              value={aiConfig.ollama?.endpoint ?? ""}
              onChange={(e) =>
                updateAIConfig("ollama.endpoint", e.target.value)
              }
              placeholder="http://localhost:11434"
              variant={isLightBackground ? "dark" : "default"}
              className="w-full"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/90">
              Model
            </label>
            <RemoteModelPicker
              value={aiConfig.ollama?.model ?? ""}
              onChange={(value) => updateAIConfig("ollama.model", value)}
              provider="ollama"
              endpoint={aiConfig.ollama?.endpoint}
              placeholder="llama2"
              isLightBackground={isLightBackground}
            />
          </div>
          <ImageSupportToggle
            providerKey="ollama"
            aiConfig={aiConfig}
            updateAIConfig={updateAIConfig}
            additionalNote="Requires multi-modal capable model."
          />
          <AudioSupportToggle
            providerKey="ollama"
            aiConfig={aiConfig}
            updateAIConfig={updateAIConfig}
            additionalNote="Requires multi-modal capable model."
          />
        </>
      )}

      {aiConfig.provider === AIProviders.ANDROID_LOCAL && isAndroid && (
        <>
          <div className="p-3 rounded-lg bg-white/10 border border-white/20">
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

          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/90">
              Endpoint URL
            </label>
            <Input
              type="text"
              value={
                aiConfig["android-local"]?.endpoint ?? "http://127.0.0.1:8765"
              }
              onChange={(e) =>
                updateAIConfig("android-local.endpoint", e.target.value)
              }
              placeholder="http://127.0.0.1:8765"
              variant={isLightBackground ? "dark" : "default"}
              className="w-full"
            />
          </div>

          <LocalLLMModelManager
            storageService={androidStorageService}
            selectedModel={aiConfig["android-local"]?.model || null}
            onModelSelect={(modelName: string) =>
              updateAIConfig("android-local.model", modelName)
            }
            customModelsPath={null}
            onCustomPathChange={null}
            isLightBackground={isLightBackground}
            onRequestDeleteModel={onRequestDeleteLLMModel}
            refreshTrigger={refreshTrigger}
            supportsCustomFolder={false}
          />

          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/90">
              Temperature: {aiConfig["android-local"]?.temperature || 0.7}
            </label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={aiConfig["android-local"]?.temperature || 0.7}
              onChange={(e) =>
                updateAIConfig(
                  "android-local.temperature",
                  parseFloat(e.target.value),
                )
              }
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/90">
              Max Tokens: {aiConfig["android-local"]?.maxTokens || 2048}
            </label>
            <input
              type="range"
              min="64"
              max="2048"
              step="64"
              value={aiConfig["android-local"]?.maxTokens || 2048}
              onChange={(e) =>
                updateAIConfig(
                  "android-local.maxTokens",
                  parseInt(e.target.value),
                )
              }
              className="w-full"
            />
          </div>
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

          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/90">
              Status
            </label>
            <div className="p-3 rounded-lg bg-white/5 border border-white/10">
              {chromeAiStatus.checking ? (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
                  <span className="text-xs text-white/70">
                    Checking availability...
                  </span>
                </div>
              ) : chromeAiStatus.state ? (
                <>
                  <StatusMessage
                    message={chromeAiStatus.message}
                    isLightBackground={isLightBackground}
                    className="mb-2"
                  />
                  <p className="text-xs text-white/60">
                    {chromeAiStatus.details}
                  </p>

                  {chromeAiStatus.downloading && (
                    <div className="mt-3 space-y-2">
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
                        className="mt-3 w-full"
                      >
                        Start Model Download
                      </Button>
                    )}

                  <button
                    onClick={checkChromeAIAvailability}
                    className="mt-2 text-xs text-blue-400 hover:text-blue-300"
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

          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/90">
              Temperature: {aiConfig.chromeAi?.temperature || 1.0}
            </label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={aiConfig.chromeAi?.temperature || 1.0}
              onChange={(e) =>
                updateAIConfig(
                  "chromeAi.temperature",
                  parseFloat(e.target.value),
                )
              }
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/90">
              Top-K: {aiConfig.chromeAi?.topK || 3}
            </label>
            <input
              type="range"
              min="1"
              max="10"
              step="1"
              value={aiConfig.chromeAi?.topK || 3}
              onChange={(e) =>
                updateAIConfig("chromeAi.topK", parseInt(e.target.value))
              }
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/90">
              Output Language
            </label>
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
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
              <label
                htmlFor="chrome-ai-image-support"
                className="text-sm font-medium text-white/90 cursor-pointer flex-1"
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

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
              <label
                htmlFor="chrome-ai-audio-support"
                className="text-sm font-medium text-white/90 cursor-pointer flex-1"
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

          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/90">
              Required Chrome Flags
            </label>
            <div className="p-3 rounded-lg bg-white/5 border border-white/10 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-white/70">
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
                <span className="text-white/70">
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
              <p className="text-white/50 mt-2">
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

  const renderRoutingSettings = () => {
    if (aiConfig.provider === AIProviders.OPENAI) {
      return (
        <div className="p-3 rounded-lg bg-white/5 border border-white/10">
          <h4 className="text-sm font-medium text-white/90 mb-3">
            Model Routing
          </h4>
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
        <div className="p-3 rounded-lg bg-white/5 border border-white/10">
          <h4 className="text-sm font-medium text-white/90 mb-3">
            Model Routing
          </h4>
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
        <div className="p-3 rounded-lg bg-white/5 border border-white/10">
          <h4 className="text-sm font-medium text-white/90 mb-3">
            Model Routing
          </h4>
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
        <div className="p-3 rounded-lg bg-white/5 border border-white/10">
          <h4 className="text-sm font-medium text-white/90 mb-3">
            Model Routing
          </h4>
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
      <div className="p-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white/70">
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

  return (
    <div className="flex flex-col h-full">
      <div className="relative">
        <div
          className="absolute bottom-0 h-0.5 bg-white transition-all duration-300 ease-out"
          style={{
            left: `${subTabIndicatorStyle.left}px`,
            width: `${subTabIndicatorStyle.width}px`,
          }}
        />
        <TabBar
          tabs={[
            { id: "provider", label: "Provider" },
            { id: "routing", label: "Routing" },
            { id: "profiles", label: "Profiles" },
          ]}
          size="compact"
          activeTab={activeSubTab}
          onTabChange={(tabId) => setActiveSubTab(tabId as LLMSubTabId)}
          tabsRef={subTabsRef}
        />
      </div>

      <div className="flex-1 overflow-hidden">
        <div
          className="flex flex-nowrap transition-transform duration-300 ease-out"
          style={{
            transform: `translateX(-${llmSubTabOrder.indexOf(activeSubTab) * 100}%)`,
            height: "100%",
          }}
        >
          <div className="flex-shrink-0 w-full min-w-full h-full overflow-y-auto px-4 md:px-6 py-2 md:py-4 space-y-6 scrollbar-glass">
            {renderProviderSettings()}
          </div>
          <div className="flex-shrink-0 w-full min-w-full h-full overflow-y-auto px-4 md:px-6 py-2 md:py-4 space-y-6 scrollbar-glass">
            {renderRoutingSettings()}
          </div>
          <div className="flex-shrink-0 w-full min-w-full h-full overflow-y-auto px-4 md:px-6 py-2 md:py-4 space-y-6 scrollbar-glass">
            {renderProfileSettings()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LLMSettings;
