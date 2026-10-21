import { useEffect, useState, type ComponentProps } from "react";
import type {
  AIConfig,
  DecisionProvider,
  DecisionRemoteProviderProfile,
} from "../../../config/aiConfig";
import { useDesktopApi } from "../../../hooks/useDesktopStore";
import {
  DEFAULT_ENDPOINTS,
  SERVICE_ROUTES,
  joinEndpointPath,
} from "../../../config/serviceEndpoints";
import {
  DecisionApiError,
  DecisionClient,
} from "../../../services/ai/DecisionClient";
import { useConfigAIActions } from "../../../hooks/config/useConfigAI";
import { Button, Card, Input, Select, SettingsRow } from "../../ui";
import Toggle from "../../common/Toggle";
import { Icon } from "../../icons";
import { isDesktop } from "../../../utils/PlatformUtils";
import LocalLLMModelManager from "./LocalLLMModelManager";
import {
  DECISION_LLAMA_RUNTIME_PACKS,
  default as LlamaServerRuntimeManager,
} from "./LlamaServerRuntimeManager";

type DecisionStorageService = ComponentProps<
  typeof LocalLLMModelManager
>["storageService"];

const TEST_REQUEST = {
  state: "Decision API connection check.",
  questions: {
    connection: {
      type: "choice" as const,
      instructions: "Determine whether the decision service is available.",
      criteria: {
        ready: "The service accepted the request and returned a decision.",
        unavailable: "The service could not process the request.",
      },
    },
  },
};

interface DecisionSettingsProps {
  aiConfig: AIConfig;
  provider: string;
  isLightBackground: boolean;
  updateAIConfig: (path: string, value: unknown) => void;
  storageService?: DecisionStorageService | null;
  decisionModelsPath?: string | null;
}

const DecisionSettings = ({
  aiConfig,
  provider,
  isLightBackground,
  updateAIConfig,
  storageService = null,
  decisionModelsPath = null,
}: DecisionSettingsProps) => {
  const decision = aiConfig.decision;
  const desktopApi = useDesktopApi();
  const decisionRuntime = desktopApi?.decisionLlamaServer;
  const { setAIConfigError } = useConfigAIActions();
  const [testing, setTesting] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const providerProfiles = (decision.remoteProfiles || []).filter(
    (profile) => profile.provider === decision.provider,
  );
  const selectedProfile =
    providerProfiles.find((profile) => profile.id === selectedProfileId) ||
    null;

  const updateDecision = (field: string, value: unknown) => {
    updateAIConfig(`decision.${field}`, value);
  };

  const effectiveEndpoint =
    decision.endpoint.trim() ||
    (decision.provider === "desktop-local"
      ? joinEndpointPath(
          DEFAULT_ENDPOINTS.desktopLocal,
          SERVICE_ROUTES.openai.systemOne,
        )
      : "");

  const testDecisionApi = async () => {
    if (!effectiveEndpoint) {
      setAIConfigError("error:Enter a Decision API URL first.");
      return;
    }

    setTesting(true);
    setAIConfigError("hourglass:Testing Decision API...");
    try {
      const response = await new DecisionClient({
        endpoint: effectiveEndpoint,
        apiKey: decision.apiKey,
        timeoutMs:
          decision.provider === "desktop-local"
            ? Math.max(decision.timeoutMs, 30_000)
            : decision.timeoutMs,
      }).decide({
        ...TEST_REQUEST,
        ...(decision.provider === "desktop-local" && decisionModelsPath
          ? { customModelsPath: decisionModelsPath }
          : {}),
        ...(decision.model.trim() ? { model: decision.model.trim() } : {}),
      });
      setAIConfigError(
        `success:Decision service responded${response.model ? ` with ${response.model}` : ""}.`,
      );
      setTimeout(() => setAIConfigError(""), 3000);
    } catch (error) {
      const message =
        error instanceof DecisionApiError || error instanceof Error
          ? error.message
          : "Decision service request failed";
      setAIConfigError(`error-status:Decision API test failed: ${message}`);
    } finally {
      setTesting(false);
    }
  };

  useEffect(() => {
    if (
      selectedProfileId &&
      !providerProfiles.some((profile) => profile.id === selectedProfileId)
    ) {
      setSelectedProfileId("");
    }
  }, [providerProfiles, selectedProfileId]);

  useEffect(() => {
    setProfileName(selectedProfile?.name || "");
  }, [selectedProfile]);

  const applyProfile = (profile: DecisionRemoteProviderProfile) => {
    updateDecision("endpoint", profile.endpoint || "");
    updateDecision("apiKey", profile.apiKey || "");
    updateDecision("model", profile.model || "");
    updateDecision("contextSize", profile.contextSize ?? decision.contextSize);
  };

  const saveProfile = () => {
    const nextId = selectedProfile?.id || `decision-backend-${Date.now()}`;
    const nextProfile: DecisionRemoteProviderProfile = {
      id: nextId,
      name: profileName.trim() || selectedProfile?.name || "Saved Backend",
      provider: decision.provider as DecisionProvider,
      endpoint: decision.endpoint,
      apiKey: decision.apiKey,
      model: decision.model,
      contextSize: decision.contextSize,
    };
    const nextProfiles = selectedProfile
      ? decision.remoteProfiles.map((profile) =>
          profile.id === selectedProfile.id ? nextProfile : profile,
        )
      : [...decision.remoteProfiles, nextProfile];
    updateDecision("remoteProfiles", nextProfiles);
    setSelectedProfileId(nextId);
    setProfileName(nextProfile.name);
  };

  const deleteProfile = () => {
    if (!selectedProfile) return;
    updateDecision(
      "remoteProfiles",
      decision.remoteProfiles.filter(
        (profile) => profile.id !== selectedProfile.id,
      ),
    );
    setSelectedProfileId("");
    setProfileName("");
  };

  return (
    <div className="space-y-6">
      <h3 className="text-base font-semibold text-white mb-4">
        Decision Configuration
      </h3>

      <Card variant="default">
        <SettingsRow label="Enable Decision API">
          <Toggle
            id="enable-decision-api"
            checked={decision.enabled}
            onChange={(checked) => updateDecision("enabled", checked)}
          />
        </SettingsRow>
      </Card>

      {decision.enabled && (
        <>
          <SettingsRow label="Provider" layout="stacked">
            <Select
              value={decision.provider}
              onChange={(event) =>
                updateDecision(
                  "provider",
                  event.target.value as DecisionProvider,
                )
              }
              disabled={!decision.enabled}
              options={[
                { value: "remote", label: "Remote System One" },
                ...(isDesktop
                  ? [{ value: "desktop-local", label: "Desktop Local" }]
                  : []),
                { value: "host", label: "Embed Host" },
              ]}
              variant={isLightBackground ? "dark" : "default"}
            />
          </SettingsRow>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/90">
              Saved Backends
            </label>
            <Input
              type="text"
              value={profileName}
              onChange={(event) => setProfileName(event.target.value)}
              placeholder="Backend name"
              size="xs"
              variant={isLightBackground ? "dark" : "default"}
            />
            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
              <Select
                value={selectedProfileId}
                onChange={(event) => {
                  const nextId = event.target.value;
                  setSelectedProfileId(nextId);
                  const profile = providerProfiles.find(
                    (entry) => entry.id === nextId,
                  );
                  if (profile) applyProfile(profile);
                }}
                options={[
                  {
                    value: "",
                    label:
                      providerProfiles.length === 0
                        ? "No saved backends yet"
                        : "Select a saved backend",
                  },
                  ...providerProfiles.map((profile) => ({
                    value: profile.id,
                    label: profile.name,
                  })),
                ]}
                variant={isLightBackground ? "dark" : "default"}
                className="min-h-[32px]"
              />
              <Button
                type="button"
                size="icon"
                variant={isLightBackground ? "dark" : "ghost"}
                onClick={() => {
                  setSelectedProfileId("");
                  setProfileName("");
                }}
                title="Create a new saved backend"
                aria-label="Create a new saved backend"
              >
                <Icon name="add" size={14} />
              </Button>
              <Button
                type="button"
                size="icon"
                variant={isLightBackground ? "dark" : "default"}
                onClick={saveProfile}
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

          <SettingsRow
            label="API URL"
            description="Base URL, /v1, or a full /v1/systemone URL."
            layout="stacked"
          >
            <Input
              value={decision.endpoint}
              onChange={(event) =>
                updateDecision("endpoint", event.target.value)
              }
              placeholder={
                decision.provider === "desktop-local"
                  ? joinEndpointPath(
                      DEFAULT_ENDPOINTS.desktopLocal,
                      SERVICE_ROUTES.openai.systemOne,
                    )
                  : "https://example.com/v1/systemone"
              }
              type="url"
              autoComplete="off"
              disableDebounce
              variant={isLightBackground ? "dark" : "default"}
            />
          </SettingsRow>

          <SettingsRow
            label="Model"
            description="Choose a local decision model or enter a remote model id."
            layout="stacked"
          >
            <Input
              value={decision.model}
              onChange={(event) => updateDecision("model", event.target.value)}
              placeholder="Optional model ID"
              autoComplete="off"
              disableDebounce
              variant={isLightBackground ? "dark" : "default"}
            />
          </SettingsRow>

          <SettingsRow
            label="API key"
            description="Optional Bearer token for a protected endpoint."
            layout="stacked"
          >
            <Input
              value={decision.apiKey}
              onChange={(event) => updateDecision("apiKey", event.target.value)}
              placeholder="Optional"
              type="password"
              autoComplete="off"
              disableDebounce
              variant={isLightBackground ? "dark" : "default"}
            />
          </SettingsRow>

          <SettingsRow
            label="Request timeout"
            description="How long a decision request may wait before failing."
          >
            <div className="flex items-center gap-2">
              <Input
                value={decision.timeoutMs}
                onChange={(event) =>
                  updateDecision(
                    "timeoutMs",
                    Number(event.target.value) || 1500,
                  )
                }
                type="number"
                min={250}
                max={60000}
                step={250}
                className="w-28"
                disableDebounce
                variant={isLightBackground ? "dark" : "default"}
              />
              <span className="text-xs text-white/50">ms</span>
            </div>
          </SettingsRow>

          {decision.provider === "desktop-local" && (
            <SettingsRow
              label="Context Size"
              description="Maximum tokens per local decision request. Larger contexts use more memory."
              layout="stacked"
            >
              <Input
                type="number"
                min="512"
                step="512"
                value={decision.contextSize}
                onChange={(event) =>
                  updateDecision(
                    "contextSize",
                    parseInt(event.target.value, 10) || 4096,
                  )
                }
                variant={isLightBackground ? "dark" : "default"}
              />
            </SettingsRow>
          )}
        </>
      )}

      {decision.enabled && provider === "android-local" && (
        <Card variant="default">
          <p className="text-xs text-amber-200/80">
            Android Local does not currently expose the native decision API.
            Configure a remote Decision API URL above if you want to use
            decisions on Android.
          </p>
        </Card>
      )}

      {decision.enabled &&
        storageService &&
        decision.provider === "desktop-local" &&
        provider === "desktop-local" && (
          <Card variant="default">
            <div className="text-sm font-medium text-white/90">
              Local decision models
            </div>
            <p className="mt-1 text-xs text-white/55">
              These models use the same Desktop Local model storage and are kept
              in its <code className="text-white/75">decisions</code> folder.
              They run in a separate router so your chat model is unaffected.
            </p>
            <div className="mt-4">
              <LocalLLMModelManager
                storageService={storageService}
                selectedModel={decision.model || null}
                onModelSelect={(modelName) =>
                  updateDecision("model", modelName)
                }
                customModelsPath={decisionModelsPath}
                supportsCustomFolder={false}
                huggingFaceFilter="decision-model"
                isLightBackground={isLightBackground}
              />
            </div>
          </Card>
        )}

      {decision.enabled &&
        decision.provider === "desktop-local" &&
        provider === "desktop-local" &&
        decisionRuntime && (
          <Card variant="default">
            <div className="text-sm font-medium text-white/90">
              Local runtime
            </div>
            <LlamaServerRuntimeManager
              api={decisionRuntime}
              packs={DECISION_LLAMA_RUNTIME_PACKS}
              selectedBackend={decision.backend}
              onBackendChange={(backend) => updateDecision("backend", backend)}
              runtimeChannel={decision.runtimeChannel as "pinned" | "latest"}
              onRuntimeChannelChange={(channel) =>
                updateDecision("runtimeChannel", channel)
              }
              selectorLabel="llama.cpp Runtime Backend"
              isLightBackground={isLightBackground}
              testIdPrefix="decision-llama-backend"
            />
          </Card>
        )}

      {decision.enabled && (
        <div className="flex items-center gap-3 pt-4">
          <Button
            onClick={testDecisionApi}
            disabled={testing || !effectiveEndpoint}
            variant={isLightBackground ? "dark" : "default"}
          >
            {testing ? "Testing..." : "Test Connection"}
          </Button>
        </div>
      )}
    </div>
  );
};

export default DecisionSettings;
