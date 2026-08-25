/**
 * STTSettings Component
 * STT configuration tab for SettingsPanel
 * Handles Speech-to-Text provider selection and configuration
 */

import { useMemo, useState, useEffect } from "react";
import {
  useChromeAIStatus,
  useConfigStatusActions,
} from "../../hooks/config/useConfigStatus";
import {
  useConfigSTTActions,
  useSTTConfig,
  useSTTTesting,
} from "../../hooks/config/useConfigSTT";
import { useAndroidApi } from "../../hooks/useAndroidStore";
import {
  STTProviders,
  type STTRemoteProviderProfile,
} from "../../config/aiConfig";
import { isAndroid, isDesktop } from "../../utils/PlatformUtils";
import OpenAISTTConfig from "./stt/OpenAISTTConfig";
import OpenAICompatibleSTTConfig from "./stt/OpenAICompatibleSTTConfig";
import ChromeAISTTConfig from "./stt/ChromeAISTTConfig";
import DesktopSTTConfig from "./stt/DesktopSTTConfig";
import WhisperModelDownloader from "./stt/WhisperModelDownloader";
import Toggle from "../common/Toggle";
import { Icon } from "../icons";
import { Button, Input, Select, Card, SettingsRow } from "../ui";

interface STTSettingsProps {
  isLightBackground?: boolean;
  hasChromeAI?: boolean;
  onRequestDeleteSttModel?: ((variantId: string) => void) | undefined;
  externalDeleteTick?: number | undefined;
}

type STTProviderKey =
  | "android-local"
  | "desktop-local"
  | "chrome-ai-multimodal"
  | "openai"
  | "openai-compatible";

interface ProviderRecord {
  [key: string]: string;
}

const STT_PROVIDER_LABELS: Record<string, string> = {
  [STTProviders.ANDROID_LOCAL]: "Android Local",
  [STTProviders.DESKTOP_LOCAL]: "Desktop Local",
  [STTProviders.CHROME_AI_MULTIMODAL]: "Chrome Built-in AI",
  [STTProviders.OPENAI]: "OpenAI",
  [STTProviders.OPENAI_COMPATIBLE]: "OpenAI-Compatible",
};

const STTSettings = ({
  isLightBackground = false,
  hasChromeAI = false,
  onRequestDeleteSttModel,
  externalDeleteTick,
}: STTSettingsProps) => {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [profileName, setProfileName] = useState("");

  const androidAPI = useAndroidApi();
  const chromeAiStatus = useChromeAIStatus();
  const { checkChromeAIAvailability, startChromeAIDownload } =
    useConfigStatusActions();

  const sttConfig = useSTTConfig();
  const sttTesting = useSTTTesting();
  const { updateSTTConfig, testSTTRecording } = useConfigSTTActions();
  const remoteProfiles = useMemo(
    () =>
      Array.isArray(sttConfig.remoteProfiles) ? sttConfig.remoteProfiles : [],
    [sttConfig.remoteProfiles],
  );
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const currentRemoteProvider =
    sttConfig.provider === STTProviders.OPENAI ||
    sttConfig.provider === STTProviders.OPENAI_COMPATIBLE
      ? sttConfig.provider
      : null;
  const currentProviderProfiles = useMemo(
    () =>
      currentRemoteProvider
        ? remoteProfiles.filter(
            (profile) => profile.provider === currentRemoteProvider,
          )
        : [],
    [currentRemoteProvider, remoteProfiles],
  );
  const selectedProfile =
    currentProviderProfiles.find(
      (profile) => profile.id === selectedProfileId,
    ) || null;
  const compactActionVariant = isLightBackground ? "dark" : "ghost";

  useEffect(() => {
    if (
      selectedProfileId &&
      !currentProviderProfiles.some(
        (profile) => profile.id === selectedProfileId,
      )
    ) {
      setSelectedProfileId("");
    }
  }, [currentProviderProfiles, selectedProfileId]);

  useEffect(() => {
    if (!selectedProfile) {
      if (!selectedProfileId) {
        setProfileName("");
      }
      return;
    }

    setProfileName(selectedProfile.name);
  }, [selectedProfile, selectedProfileId]);

  const applyRemoteProfile = (profile: STTRemoteProviderProfile) => {
    if (profile.provider === "openai") {
      updateSTTConfig("openai", {
        ...sttConfig.openai,
        apiKey: profile.apiKey || "",
        model: profile.model,
        language: profile.language || sttConfig.openai.language,
        temperature: profile.temperature ?? sttConfig.openai.temperature,
      });
      return;
    }

    updateSTTConfig("openai-compatible", {
      ...sttConfig["openai-compatible"],
      endpoint:
        profile.endpoint || sttConfig["openai-compatible"]?.endpoint || "",
      apiKey: profile.apiKey || "",
      model: profile.model,
      language:
        profile.language || sttConfig["openai-compatible"]?.language || "auto",
      temperature:
        profile.temperature ?? sttConfig["openai-compatible"]?.temperature ?? 0,
    });
  };

  const handleRemoteProfileSelection = (
    provider: STTRemoteProviderProfile["provider"],
    nextProfileId: string,
  ) => {
    setSelectedProfileId(nextProfileId);

    if (!nextProfileId) {
      setProfileName("");
      return;
    }

    const profile = remoteProfiles.find(
      (entry) => entry.id === nextProfileId && entry.provider === provider,
    );
    if (!profile) {
      return;
    }

    setProfileName(profile.name);
    applyRemoteProfile(profile);
  };

  const saveCurrentRemoteProfile = (
    provider: STTRemoteProviderProfile["provider"],
  ) => {
    const nextProfileId = selectedProfile?.id || `stt-remote-${Date.now()}`;
    const defaultName = `Saved Backend ${currentProviderProfiles.length + (selectedProfile ? 0 : 1)}`;
    const nextProfile: STTRemoteProviderProfile =
      provider === STTProviders.OPENAI
        ? {
            id: nextProfileId,
            name: profileName.trim() || selectedProfile?.name || defaultName,
            provider: "openai",
            apiKey: sttConfig.openai.apiKey,
            model: sttConfig.openai.model,
            language: sttConfig.openai.language,
            temperature: sttConfig.openai.temperature,
          }
        : {
            id: nextProfileId,
            name: profileName.trim() || selectedProfile?.name || defaultName,
            provider: "openai-compatible",
            endpoint: sttConfig["openai-compatible"]?.endpoint,
            apiKey: sttConfig["openai-compatible"]?.apiKey,
            model: sttConfig["openai-compatible"]?.model || "",
            language: sttConfig["openai-compatible"]?.language,
            temperature: sttConfig["openai-compatible"]?.temperature,
          };

    updateSTTConfig(
      "remoteProfiles",
      selectedProfile
        ? remoteProfiles.map((profile) =>
            profile.id === selectedProfile.id ? nextProfile : profile,
          )
        : [...remoteProfiles, nextProfile],
    );
    setSelectedProfileId(nextProfile.id);
    setProfileName(nextProfile.name);
  };

  const startNewRemoteProfile = () => {
    setSelectedProfileId("");
    setProfileName("");
  };

  const deleteRemoteProfile = () => {
    if (!selectedProfile) {
      return;
    }

    updateSTTConfig(
      "remoteProfiles",
      remoteProfiles.filter((profile) => profile.id !== selectedProfile.id),
    );
    setSelectedProfileId("");
    setProfileName("");
  };

  const renderRemoteProfileBar = (
    provider: STTRemoteProviderProfile["provider"],
  ) => (
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
          onChange={(event) =>
            handleRemoteProfileSelection(provider, event.target.value)
          }
          variant={isLightBackground ? "dark" : "default"}
          className="min-h-[32px]"
          options={[
            {
              value: "",
              label:
                currentProviderProfiles.length === 0
                  ? "No saved backends yet"
                  : "Select a saved backend",
            },
            ...currentProviderProfiles.map((profile) => ({
              value: profile.id,
              label: profile.name,
            })),
          ]}
        />
        <Button
          variant={compactActionVariant}
          size="icon"
          onClick={startNewRemoteProfile}
          title="Create a new saved backend"
          aria-label="Create a new saved backend"
        >
          <Icon name="add" size={14} />
        </Button>
        <Button
          variant={isLightBackground ? "dark" : "default"}
          size="icon"
          onClick={() => saveCurrentRemoteProfile(provider)}
          title="Save current STT backend"
          aria-label="Save current STT backend"
        >
          <Icon name="save" size={14} />
        </Button>
        <Button
          variant="error"
          size="icon"
          onClick={deleteRemoteProfile}
          disabled={!selectedProfile}
          title="Delete selected STT backend"
          aria-label="Delete selected STT backend"
        >
          <Icon name="delete" size={14} />
        </Button>
      </div>
    </div>
  );
  // Load available microphones (desktop mode only)
  useEffect(() => {
    if (!isDesktop || sttConfig.provider !== STTProviders.DESKTOP_LOCAL) return;

    const loadDevices = async () => {
      try {
        const deviceList = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = deviceList.filter(
          (device) => device.kind === "audioinput",
        );
        setDevices(audioInputs);

        if (!selectedDeviceId && audioInputs.length > 0) {
          setSelectedDeviceId(audioInputs[0]?.deviceId ?? "");
        }
      } catch (error) {
        console.error("Failed to enumerate devices:", error);
      }
    };

    loadDevices();
  }, [selectedDeviceId, sttConfig.provider]);
  // Filter providers based on platform
  const availableProviders = useMemo(() => {
    if (isAndroid) {
      const { DESKTOP_LOCAL, CHROME_AI_MULTIMODAL, ...androidProviders } =
        STTProviders;
      return androidProviders as ProviderRecord;
    }

    if (isDesktop) {
      const { ANDROID_LOCAL, CHROME_AI_MULTIMODAL, ...desktopProviders } =
        STTProviders;
      return desktopProviders as ProviderRecord;
    }

    const { ANDROID_LOCAL, DESKTOP_LOCAL, ...webProviders } = STTProviders;
    return webProviders as ProviderRecord;
  }, []);

  return (
    <div className="space-y-6">
      <h3 className="text-base font-semibold text-white mb-4">
        STT Configuration
      </h3>

      {/* Enable STT Toggle */}
      <Card variant="default">
        <SettingsRow label="Enable Speech-to-Text" targetId="stt.enabled">
          <Toggle
            id="enable-stt"
            data-testid="toggle-enable-stt"
            checked={sttConfig.enabled}
            onChange={(checked) => updateSTTConfig("enabled", checked)}
          />
        </SettingsRow>
      </Card>

      {/* Provider Selection */}
      <div className="space-y-2">
        <SettingsRow
          label="Provider"
          targetId="stt.provider.select"
          layout="stacked"
        >
          <Select
            value={sttConfig.provider}
            onChange={(e) => updateSTTConfig("provider", e.target.value)}
            variant={isLightBackground ? "dark" : "default"}
            disabled={!sttConfig.enabled}
            options={Object.entries(availableProviders).map(([key, value]) => ({
              value,
              label: STT_PROVIDER_LABELS[value] || key,
            }))}
          />
        </SettingsRow>
        {isAndroid && (
          <p className="text-xs text-white/50">
            Using native Android STT via local Whisper model
          </p>
        )}
      </div>

      {sttConfig.provider === "chrome-ai-multimodal" && !hasChromeAI && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-xs text-red-300">
            Chrome AI requires Chrome 138 or later. Please update your browser.
          </p>
        </div>
      )}

      {/* Configuration sections - only show when enabled */}
      {sttConfig.enabled && (
        <>
          {/* Android Local STT Configuration */}
          {sttConfig.provider === STTProviders.ANDROID_LOCAL && (
            <>
              {/* Whisper Model Downloader */}
              <WhisperModelDownloader
                androidAPI={androidAPI}
                isLightBackground={isLightBackground}
                onRequestDeleteDialog={onRequestDeleteSttModel}
                externalDeleteTick={externalDeleteTick}
              />

              <h4 className="text-sm font-semibold text-white/90">
                Android Local STT
              </h4>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-white/90">
                    Model
                  </label>
                  <Select
                    value={sttConfig["android-local"]?.model || "whisper-local"}
                    onChange={(e) =>
                      updateSTTConfig("android-local.model", e.target.value)
                    }
                    variant={isLightBackground ? "dark" : "default"}
                    options={[
                      {
                        value: "whisper-local",
                        label: "Auto (use downloaded model)",
                      },
                      {
                        value: "whisper-tiny.en",
                        label: "Whisper Tiny English · 113 MB",
                      },
                      {
                        value: "whisper-tiny",
                        label: "Whisper Tiny Multilingual · 110 MB",
                      },
                      {
                        value: "whisper-base.en",
                        label: "Whisper Base English · 145 MB",
                      },
                      {
                        value: "whisper-base",
                        label: "Whisper Base Multilingual · 200 MB",
                      },
                      {
                        value: "sensevoice",
                        label: "SenseVoice Multilingual · 230 MB",
                      },
                      {
                        value: "dolphin-base",
                        label: "Dolphin Base CTC · 99 MB",
                      },
                      {
                        value: "dolphin-small",
                        label: "Dolphin Small CTC · 239 MB",
                      },
                    ]}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-white/90">
                    Language
                  </label>
                  <Select
                    value={sttConfig["android-local"]?.language || "en"}
                    onChange={(e) =>
                      updateSTTConfig("android-local.language", e.target.value)
                    }
                    variant={isLightBackground ? "dark" : "default"}
                    options={[
                      { value: "auto", label: "Auto Detect" },
                      { value: "en", label: "English" },
                      { value: "es", label: "Spanish" },
                      { value: "ja", label: "Japanese" },
                      { value: "zh", label: "Chinese" },
                      { value: "de", label: "German" },
                      { value: "fr", label: "French" },
                    ]}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-white/90">
                    Compute Provider
                  </label>
                  <Select
                    value={
                      (sttConfig["android-local"] as { provider?: string })
                        ?.provider || "auto"
                    }
                    onChange={(e) =>
                      updateSTTConfig("android-local.provider", e.target.value)
                    }
                    variant={isLightBackground ? "dark" : "default"}
                    options={[
                      {
                        value: "auto",
                        label: "Auto (benchmarks real backends)",
                      },
                      { value: "cpu", label: "CPU (most compatible)" },
                      {
                        value: "nnapi",
                        label: "NNAPI (needs custom build - see docs)",
                      },
                      {
                        value: "xnnpack",
                        label: "XNNPACK (needs custom build - see docs)",
                      },
                      {
                        value: "qnn",
                        label: "QNN Snapdragon NPU (experimental)",
                      },
                    ]}
                  />
                </div>
              </div>
              <p className="text-xs text-white/50">
                Powered by Whisper / SenseVoice running locally on your device.
                Chinese/Japanese: use a <b>Multilingual</b> Whisper model or{" "}
                <b>SenseVoice</b> (supports zh/ja/ko/yue/en only). English-only
                models ignore the language setting.
              </p>
            </>
          )}

          {/* Desktop Local STT Configuration */}
          {sttConfig.provider === STTProviders.DESKTOP_LOCAL && isDesktop && (
            <>
              <h4 className="text-sm font-semibold text-white/90">
                Desktop Local STT (Whisper)
              </h4>
              <DesktopSTTConfig
                config={sttConfig["desktop-local"] || {}}
                onChange={(updates: Record<string, unknown>) => {
                  Object.entries(updates).forEach(([key, value]) => {
                    updateSTTConfig(`desktop-local.${key}`, value);
                  });
                }}
                onRequestDeleteDialog={(modelId) =>
                  onRequestDeleteSttModel?.(modelId)
                }
                externalDeleteTick={externalDeleteTick}
                isSetupMode={false}
                isLightBackground={isLightBackground}
              />
            </>
          )}

          {/* OpenAI Whisper Configuration */}
          {sttConfig.provider === STTProviders.OPENAI && (
            <>
              {renderRemoteProfileBar("openai")}
              <OpenAISTTConfig
                config={sttConfig.openai || {}}
                onChange={(field: string, value: string) =>
                  updateSTTConfig(`openai.${field}`, value)
                }
                isLightBackground={isLightBackground}
              />
            </>
          )}

          {/* OpenAI-Compatible STT Configuration */}
          {sttConfig.provider === STTProviders.OPENAI_COMPATIBLE && (
            <>
              {renderRemoteProfileBar("openai-compatible")}
              <OpenAICompatibleSTTConfig
                config={sttConfig["openai-compatible"] || {}}
                onChange={(field: string, value: string) =>
                  updateSTTConfig(`openai-compatible.${field}`, value)
                }
                isLightBackground={isLightBackground}
              />
            </>
          )}

          {/* Chrome AI Multimodal STT Configuration */}
          {sttConfig.provider === STTProviders.CHROME_AI_MULTIMODAL && (
            <ChromeAISTTConfig
              config={sttConfig["chrome-ai-multimodal"] || {}}
              onChange={(updates) => {
                Object.entries(updates).forEach(([field, value]) => {
                  updateSTTConfig(`chrome-ai-multimodal.${field}`, value);
                });
              }}
              chromeAiStatus={chromeAiStatus}
              onCheckStatus={checkChromeAIAvailability}
              onStartDownload={startChromeAIDownload}
              isLightBackground={isLightBackground}
              isSetupMode={false}
            />
          )}
        </>
      )}

      {/* Actions */}
      <div className="space-y-3 pt-4">
        {/* Microphone Selector (Desktop mode only) */}
        {isDesktop &&
          sttConfig.provider === STTProviders.DESKTOP_LOCAL &&
          devices.length > 0 && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white/90">
                Microphone
              </label>
              <Select
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                variant={isLightBackground ? "dark" : "default"}
                options={devices.map((d) => ({
                  value: d.deviceId,
                  label: d.label || `Microphone ${d.deviceId.substring(0, 8)}`,
                }))}
              />
            </div>
          )}

        <Button
          variant={isLightBackground ? "dark" : "default"}
          onClick={() => testSTTRecording(selectedDeviceId)}
          disabled={!sttConfig.enabled || sttTesting}
        >
          Test Recording (3s)
        </Button>
      </div>
    </div>
  );
};

export default STTSettings;
