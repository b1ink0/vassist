/**
 * TTSSettings Component
 * TTS configuration tab for SettingsPanel
 * Handles Text-to-Speech provider selection and configuration
 */

import { useState, useMemo, useEffect } from "react";
import { Icon } from "../icons";
import {
  useConfigStatusActions,
  useKokoroStatus,
} from "../../hooks/config/useConfigStatus";
import {
  useConfigTTSActions,
  useTTSConfig,
  useTTSConfigError,
  useTTSTesting,
} from "../../hooks/config/useConfigTTS";
import { useAndroidApi } from "../../hooks/useAndroidStore";
import {
  TTSProviders,
  OpenAIVoices,
  KokoroVoices,
  KokoroQuantization,
  KokoroDevice,
  GPTSoVITSLanguages,
  type TTSRemoteProviderProfile,
} from "../../config/aiConfig";
import { isAndroid, isDesktop } from "../../utils/PlatformUtils";
import TTSServiceProxy from "../../services/proxies/TTSServiceProxy";
import KokoroTTSConfig from "./tts/KokoroTTSConfig";
import GPTSoVITSConfig from "./tts/GPTSoVITSConfig";
import AndroidTtsPackDownloader from "./tts/AndroidTtsPackDownloader";
import RemoteModelPicker from "./shared/RemoteModelPicker";
import Toggle from "../common/Toggle";
import Logger from "../../services/LoggerService";
import { Button, Input, Select, Card, SettingsRow } from "../ui";

interface TTSSettingsProps {
  isLightBackground?: boolean;
  onRequestDeleteVoiceDialog?: ((voiceId: string) => void) | undefined;
  onRequestDeleteTtsPack?: ((packId: string) => void) | undefined;
  externalDeleteTick?: number | undefined;
  refreshTrigger?: unknown;
}

interface KokoroCacheSize {
  usage?: number;
}

const TTS_PROVIDER_LABELS: Record<string, string> = {
  [TTSProviders.ANDROID_LOCAL]: "Android Local",
  [TTSProviders.DESKTOP_LOCAL]: "Desktop Local",
  [TTSProviders.KOKORO]: "Kokoro (Local)",
  [TTSProviders.OPENAI]: "OpenAI",
  [TTSProviders.OPENAI_COMPATIBLE]: "OpenAI-Compatible",
  [TTSProviders.GPTSOVITS_REMOTE]: "GPT-SoVITS (Remote)",
};

const TTSSettings = ({
  isLightBackground = false,
  onRequestDeleteVoiceDialog,
  onRequestDeleteTtsPack,
  externalDeleteTick,
  refreshTrigger,
}: TTSSettingsProps) => {
  const [clearingCache, setClearingCache] = useState(false);
  const [cacheSize, setCacheSize] = useState<KokoroCacheSize | null>(null);
  const [testText, setTestText] = useState(
    "Hello, this is a test of the text to speech system.",
  );
  const [testLanguage, setTestLanguage] = useState(GPTSoVITSLanguages.ENGLISH);
  const [profileName, setProfileName] = useState("");

  const androidAPI = useAndroidApi();
  const kokoroStatus = useKokoroStatus();
  const { checkKokoroStatus, initializeKokoro } = useConfigStatusActions();

  const ttsConfig = useTTSConfig();
  const ttsTesting = useTTSTesting();
  const ttsConfigError = useTTSConfigError();
  const { setTtsConfigError, updateTTSConfig, testTTSConnection } =
    useConfigTTSActions();
  const remoteProfiles = useMemo(
    () =>
      Array.isArray(ttsConfig.remoteProfiles) ? ttsConfig.remoteProfiles : [],
    [ttsConfig.remoteProfiles],
  );
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const currentRemoteProvider =
    ttsConfig.provider === TTSProviders.OPENAI ||
    ttsConfig.provider === TTSProviders.OPENAI_COMPATIBLE ||
    ttsConfig.provider === TTSProviders.GPTSOVITS_REMOTE
      ? ttsConfig.provider
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

  const applyRemoteProfile = (profile: TTSRemoteProviderProfile) => {
    if (profile.provider === "openai") {
      updateTTSConfig("openai", {
        ...ttsConfig.openai,
        apiKey: profile.apiKey || "",
        model: profile.model,
        voice: profile.voice || ttsConfig.openai.voice,
        speed: profile.speed ?? ttsConfig.openai.speed,
      });
      return;
    }

    if (profile.provider === "openai-compatible") {
      updateTTSConfig("openai-compatible", {
        ...ttsConfig["openai-compatible"],
        endpoint:
          profile.endpoint || ttsConfig["openai-compatible"]?.endpoint || "",
        apiKey: profile.apiKey || "",
        model: profile.model,
        voice: profile.voice || ttsConfig["openai-compatible"]?.voice || "",
        speed: profile.speed ?? ttsConfig["openai-compatible"]?.speed ?? 1,
      });
      return;
    }

    updateTTSConfig("gptsovits-remote", {
      ...ttsConfig["gptsovits-remote"],
      endpoint:
        profile.endpoint || ttsConfig["gptsovits-remote"]?.endpoint || "",
      model: profile.model,
      speed: profile.speed ?? ttsConfig["gptsovits-remote"]?.speed ?? 1,
    });
  };

  const handleRemoteProfileSelection = (
    provider: TTSRemoteProviderProfile["provider"],
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
    provider: TTSRemoteProviderProfile["provider"],
  ) => {
    const nextProfileId = selectedProfile?.id || `tts-remote-${Date.now()}`;
    const defaultName = `Saved Backend ${currentProviderProfiles.length + (selectedProfile ? 0 : 1)}`;
    let nextProfile: TTSRemoteProviderProfile | null = null;
    if (provider === TTSProviders.OPENAI) {
      nextProfile = {
        id: nextProfileId,
        name: profileName.trim() || selectedProfile?.name || defaultName,
        provider: "openai",
        apiKey: ttsConfig.openai.apiKey,
        model: ttsConfig.openai.model,
        voice: ttsConfig.openai.voice,
        speed: ttsConfig.openai.speed,
      };
    } else if (provider === TTSProviders.OPENAI_COMPATIBLE) {
      nextProfile = {
        id: nextProfileId,
        name: profileName.trim() || selectedProfile?.name || defaultName,
        provider: "openai-compatible",
        endpoint: ttsConfig["openai-compatible"]?.endpoint,
        apiKey: ttsConfig["openai-compatible"]?.apiKey,
        model: ttsConfig["openai-compatible"]?.model || "",
        voice: ttsConfig["openai-compatible"]?.voice,
        speed: ttsConfig["openai-compatible"]?.speed,
      };
    } else if (provider === TTSProviders.GPTSOVITS_REMOTE) {
      nextProfile = {
        id: nextProfileId,
        name: profileName.trim() || selectedProfile?.name || defaultName,
        provider: "gptsovits-remote",
        endpoint: ttsConfig["gptsovits-remote"]?.endpoint,
        model: ttsConfig["gptsovits-remote"]?.model || "",
        speed: ttsConfig["gptsovits-remote"]?.speed,
      };
    }

    if (!nextProfile) {
      return;
    }

    updateTTSConfig(
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

    updateTTSConfig(
      "remoteProfiles",
      remoteProfiles.filter((profile) => profile.id !== selectedProfile.id),
    );
    setSelectedProfileId("");
    setProfileName("");
  };

  const renderRemoteProfileBar = (
    provider: TTSRemoteProviderProfile["provider"],
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
          title="Save current TTS backend"
          aria-label="Save current TTS backend"
          onClick={() => saveCurrentRemoteProfile(provider)}
        >
          <Icon name="save" size={14} />
        </Button>
        <Button
          variant="error"
          size="icon"
          onClick={deleteRemoteProfile}
          disabled={!selectedProfile}
          title="Delete selected TTS backend"
          aria-label="Delete selected TTS backend"
        >
          <Icon name="delete" size={14} />
        </Button>
      </div>
    </div>
  );

  // Filter providers based on platform
  const availableProviders = useMemo(() => {
    if (isAndroid) {
      const { DESKTOP_LOCAL, KOKORO, ...androidProviders } = TTSProviders;
      return androidProviders;
    }

    if (isDesktop) {
      const { ANDROID_LOCAL, ...desktopProviders } = TTSProviders;
      return desktopProviders;
    }

    const { ANDROID_LOCAL, DESKTOP_LOCAL, ...webProviders } = TTSProviders;
    return webProviders;
  }, []);

  return (
    <div className="space-y-6">
      <h3 className="text-base font-semibold text-white mb-4">
        TTS Configuration
      </h3>

      {/* Enable TTS Toggle */}
      <Card variant="default">
        <SettingsRow label="Enable Text-to-Speech" targetId="tts.enabled">
          <Toggle
            id="enable-tts"
            data-testid="toggle-enable-tts"
            checked={ttsConfig.enabled}
            onChange={(checked) => updateTTSConfig("enabled", checked)}
          />
        </SettingsRow>
      </Card>

      <SettingsRow label="Accurate Lip Sync" targetId="tts.accurateLipSync">
        <Toggle
          id="accurate-lip-sync"
          checked={ttsConfig.accurateLipSync}
          onChange={(checked) => updateTTSConfig("accurateLipSync", checked)}
        />
      </SettingsRow>

      <SettingsRow label="Use Legacy Lip Sync" targetId="tts.legacyLipSync">
        <Toggle
          id="legacy-lip-sync"
          checked={ttsConfig.legacyLipSync}
          disabled={!ttsConfig.accurateLipSync}
          onChange={(checked) => updateTTSConfig("legacyLipSync", checked)}
        />
      </SettingsRow>

      {/* Provider Selection */}
      <div className="space-y-2">
        <SettingsRow
          label="Provider"
          targetId="tts.provider.select"
          layout="stacked"
        >
          <Select
            value={ttsConfig.provider}
            onChange={(e) => updateTTSConfig("provider", e.target.value)}
            variant={isLightBackground ? "dark" : "default"}
            options={Object.entries(availableProviders).map(([key, value]) => ({
              value,
              label: TTS_PROVIDER_LABELS[value] || key,
            }))}
          />
        </SettingsRow>
        {isAndroid && (
          <p className="text-xs text-white/50">
            Using native Android TTS via local VITS model
          </p>
        )}
      </div>

      {/* Configuration sections - only show when enabled */}
      {ttsConfig.enabled && (
        <>
          {/* Android Local TTS Configuration */}
          {ttsConfig.provider === TTSProviders.ANDROID_LOCAL && (
            <>
              {/* TTS language packs: install/delete + active voice picker */}
              <AndroidTtsPackDownloader
                androidAPI={androidAPI}
                isLightBackground={isLightBackground}
                activePackId={ttsConfig["android-local"]?.model}
                onActivePackChange={(packId) =>
                  updateTTSConfig("android-local.model", packId)
                }
                speakerId={ttsConfig["android-local"]?.speakerId || 0}
                onSpeakerIdChange={(speakerId) =>
                  updateTTSConfig("android-local.speakerId", speakerId)
                }
                onRequestDeleteDialog={onRequestDeleteTtsPack}
                externalDeleteTick={externalDeleteTick}
              />

              <div className="space-y-4 p-2 md:p-4 rounded-lg bg-white/5 border border-white/10">
                <h4 className="text-sm font-semibold text-white/90">
                  Android Local TTS
                </h4>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-white/90">
                    Speed
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.1"
                    value={ttsConfig["android-local"]?.speed || 1.0}
                    onChange={(e) =>
                      updateTTSConfig(
                        "android-local.speed",
                        parseFloat(e.target.value),
                      )
                    }
                    className="w-full"
                  />
                  <span className="text-xs text-white/60">
                    {ttsConfig["android-local"]?.speed || 1.0}x
                  </span>
                </div>
                <p className="text-xs text-white/50">
                  Offline voices running locally on your device (CPU via
                  sherpa-onnx)
                </p>
              </div>
            </>
          )}

          {/* Desktop Local TTS Configuration */}
          {ttsConfig.provider === TTSProviders.DESKTOP_LOCAL && isDesktop && (
            <>
              <h4 className="text-sm font-semibold text-white/90 mb-3">
                Desktop Local TTS
              </h4>
              <GPTSoVITSConfig
                config={ttsConfig["desktop-local"] || {}}
                onChange={(field: string, value: string | number | null) => {
                  updateTTSConfig(`desktop-local.${field}`, value);
                }}
                showTitle={false}
                isSetupMode={false}
                onRequestDeleteVoiceDialog={onRequestDeleteVoiceDialog}
                refreshTrigger={refreshTrigger}
                isLightBackground={isLightBackground}
                errorMessage={ttsConfigError}
                setErrorMessage={setTtsConfigError}
              />
            </>
          )}

          {/* GPTSoVITS Remote TTS Configuration */}
          {ttsConfig.provider === TTSProviders.GPTSOVITS_REMOTE && (
            <>
              {renderRemoteProfileBar("gptsovits-remote")}
              <SettingsRow
                label="Server URL"
                targetId="tts.gptsovitsRemote.endpoint"
                layout="stacked"
              >
                <Input
                  type="text"
                  value={ttsConfig["gptsovits-remote"]?.endpoint || ""}
                  onChange={(e) =>
                    updateTTSConfig("gptsovits-remote.endpoint", e.target.value)
                  }
                  placeholder="http://localhost:11438"
                  variant={isLightBackground ? "dark" : "default"}
                />
              </SettingsRow>

              {/* Voice Cloning Configuration - Reuse GPTSoVITSConfig */}
              <GPTSoVITSConfig
                config={ttsConfig["gptsovits-remote"] || {}}
                onChange={(field: string, value: string | number | null) => {
                  updateTTSConfig(`gptsovits-remote.${field}`, value);
                }}
                showTitle={false}
                isSetupMode={false}
                onRequestDeleteVoiceDialog={onRequestDeleteVoiceDialog}
                refreshTrigger={refreshTrigger}
                isLightBackground={isLightBackground}
                errorMessage={ttsConfigError}
                setErrorMessage={setTtsConfigError}
                skipSetup={true}
              />
            </>
          )}

          {/* Kokoro TTS Configuration */}
          {ttsConfig.provider === TTSProviders.KOKORO && (
            <>
              <KokoroTTSConfig
                config={ttsConfig.kokoro || {}}
                onChange={(field: string, value: string | number | boolean) => {
                  updateTTSConfig(`kokoro.${field}`, value);
                  if (field === "device" && typeof value === "string") {
                    setTimeout(() => checkKokoroStatus(value), 100);
                  }
                }}
                kokoroStatus={kokoroStatus}
                onInitialize={async () => {
                  try {
                    await initializeKokoro();
                  } catch (error) {
                    Logger.error(
                      "other",
                      "Kokoro initialization failed:",
                      error,
                    );
                  }
                }}
                onCheckStatus={checkKokoroStatus}
                onTestVoice={null}
                isLightBackground={isLightBackground}
                showTitle={true}
                showTestButton={false}
              />

              {/* Cache Management - Only in Settings */}
              {kokoroStatus.initialized && (
                <div className="space-y-2 p-2 md:p-4 rounded-lg bg-white/5 border border-white/10">
                  <h4 className="text-sm font-semibold text-white/90">
                    Cache Management
                  </h4>
                  <div className="flex gap-2">
                    <Button
                      variant={isLightBackground ? "dark" : "default"}
                      size="sm"
                      onClick={async () => {
                        try {
                          const size =
                            (await TTSServiceProxy.getKokoroCacheSize()) as KokoroCacheSize;
                          setCacheSize(size);
                        } catch (error) {
                          Logger.error(
                            "other",
                            "Failed to get cache size:",
                            error,
                          );
                        }
                      }}
                      title="Check cache size"
                    >
                      <Icon name="stats" size={14} /> Check Size
                    </Button>
                    <Button
                      variant={isLightBackground ? "dark" : "default"}
                      size="sm"
                      onClick={async () => {
                        try {
                          setClearingCache(true);
                          await TTSServiceProxy.clearKokoroCache();
                          setCacheSize(null);
                          await checkKokoroStatus();
                        } catch (error) {
                          Logger.error(
                            "other",
                            "Failed to clear cache:",
                            error,
                          );
                        } finally {
                          setClearingCache(false);
                        }
                      }}
                      disabled={clearingCache}
                      title="Clear model cache"
                    >
                      {clearingCache ? (
                        <>
                          <Icon
                            name="loading"
                            size={14}
                            className="animate-spin"
                          />{" "}
                          Clearing...
                        </>
                      ) : (
                        <>
                          <Icon name="delete" size={14} /> Clear Cache
                        </>
                      )}
                    </Button>
                  </div>
                  {cacheSize !== null && cacheSize.usage !== undefined && (
                    <div className="text-xs text-white/60">
                      Cache: {(cacheSize.usage / 1024 / 1024).toFixed(1)} MB
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* OpenAI TTS Configuration */}
          {ttsConfig.provider === TTSProviders.OPENAI && (
            <>
              {renderRemoteProfileBar("openai")}
              <SettingsRow
                label="API Key"
                targetId="tts.openai.apiKey"
                layout="stacked"
              >
                <Input
                  type="password"
                  value={ttsConfig.openai.apiKey}
                  onChange={(e) =>
                    updateTTSConfig("openai.apiKey", e.target.value)
                  }
                  placeholder="sk-..."
                  variant={isLightBackground ? "dark" : "default"}
                />
              </SettingsRow>
              <SettingsRow
                label="Model"
                targetId="tts.openai.model"
                layout="stacked"
              >
                <RemoteModelPicker
                  value={ttsConfig.openai.model}
                  onChange={(value) => updateTTSConfig("openai.model", value)}
                  provider="openai"
                  apiKey={ttsConfig.openai.apiKey}
                  placeholder="tts-1"
                  isLightBackground={isLightBackground}
                />
              </SettingsRow>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white/90">
                  Voice
                </label>
                <Select
                  value={ttsConfig.openai.voice}
                  onChange={(e) =>
                    updateTTSConfig("openai.voice", e.target.value)
                  }
                  variant={isLightBackground ? "dark" : "default"}
                  options={Object.entries(OpenAIVoices).map(([key, value]) => ({
                    value,
                    label: key.charAt(0) + key.slice(1).toLowerCase(),
                  }))}
                />
              </div>
            </>
          )}

          {/* OpenAI-Compatible TTS Configuration */}
          {ttsConfig.provider === TTSProviders.OPENAI_COMPATIBLE && (
            <>
              {renderRemoteProfileBar("openai-compatible")}
              <SettingsRow
                label="Endpoint URL"
                targetId="tts.openaiCompatible.endpoint"
                layout="stacked"
              >
                <Input
                  type="text"
                  value={ttsConfig["openai-compatible"]?.endpoint ?? ""}
                  onChange={(e) =>
                    updateTTSConfig(
                      "openai-compatible.endpoint",
                      e.target.value,
                    )
                  }
                  placeholder="http://localhost:8000"
                  variant={isLightBackground ? "dark" : "default"}
                />
              </SettingsRow>
              <SettingsRow
                label="API Key (Optional)"
                targetId="tts.openaiCompatible.apiKey"
                layout="stacked"
              >
                <Input
                  type="password"
                  value={ttsConfig["openai-compatible"]?.apiKey ?? ""}
                  onChange={(e) =>
                    updateTTSConfig("openai-compatible.apiKey", e.target.value)
                  }
                  placeholder="Leave empty if not required"
                  variant={isLightBackground ? "dark" : "default"}
                />
              </SettingsRow>
              <SettingsRow
                label="Model"
                targetId="tts.openaiCompatible.model"
                layout="stacked"
              >
                <RemoteModelPicker
                  value={ttsConfig["openai-compatible"]?.model ?? ""}
                  onChange={(value) =>
                    updateTTSConfig("openai-compatible.model", value)
                  }
                  provider="ollama"
                  endpoint={ttsConfig["openai-compatible"]?.endpoint ?? ""}
                  apiKey={ttsConfig["openai-compatible"]?.apiKey ?? ""}
                  placeholder="tts"
                  isLightBackground={isLightBackground}
                />
              </SettingsRow>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white/90">
                  Voice
                </label>
                <Input
                  type="text"
                  value={ttsConfig["openai-compatible"]?.voice ?? ""}
                  onChange={(e) =>
                    updateTTSConfig("openai-compatible.voice", e.target.value)
                  }
                  placeholder="default"
                  variant={isLightBackground ? "dark" : "default"}
                />
              </div>
            </>
          )}
        </>
      )}

      {/* Actions */}
      <div className="space-y-3 pt-4">
        {/* Test Text Input */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-white/90">
            Test Text
          </label>
          <Input
            type="text"
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            placeholder="Enter text to test TTS..."
            variant={isLightBackground ? "dark" : "default"}
          />
        </div>

        {/* Test Language (only for GPT-SoVITS) */}
        {ttsConfig.provider === TTSProviders.DESKTOP_LOCAL && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/90">
              Test Language
            </label>
            <Select
              value={testLanguage}
              onChange={(e) => setTestLanguage(e.target.value)}
              variant={isLightBackground ? "dark" : "default"}
              options={[
                { value: GPTSoVITSLanguages.ENGLISH, label: "English" },
                {
                  value: GPTSoVITSLanguages.JAPANESE,
                  label: "Japanese (日本語)",
                },
                { value: GPTSoVITSLanguages.CHINESE, label: "Chinese (中文)" },
              ]}
            />
          </div>
        )}

        <Button
          variant={isLightBackground ? "dark" : "default"}
          onClick={() => testTTSConnection(testText)}
          disabled={!ttsConfig.enabled || ttsTesting}
        >
          Test TTS
        </Button>
      </div>
    </div>
  );
};

export default TTSSettings;
