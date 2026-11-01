import { Select } from "../../ui";
import WhisperModelDownloader from "./WhisperModelDownloader";
import type { AndroidAPI } from "../../../types/android";
import SettingsRow from "../../ui/SettingsRow";

interface AndroidLocalSTTConfigProps {
  androidAPI: AndroidAPI | null;
  model: string;
  language: string;
  provider: string;
  onChange: (field: "model" | "language" | "provider", value: string) => void;
  isLightBackground?: boolean;
  onRequestDeleteDialog?: ((variantId: string) => void) | undefined;
  externalDeleteTick?: number | undefined;
}

const AndroidLocalSTTConfig = ({
  androidAPI,
  model,
  language,
  provider,
  onChange,
  isLightBackground = false,
  onRequestDeleteDialog,
  externalDeleteTick,
}: AndroidLocalSTTConfigProps) => (
  <div className="flex flex-col gap-4">
    <WhisperModelDownloader
      androidAPI={androidAPI}
      isLightBackground={isLightBackground}
      onRequestDeleteDialog={onRequestDeleteDialog}
      externalDeleteTick={externalDeleteTick}
    />
    <h4 className="settings-group-heading">Android Local STT</h4>
    <div className="flex flex-col gap-4">
      <SettingsRow label="Model" layout="stacked">
        <Select
          value={model}
          onChange={(event) => onChange("model", event.target.value)}
          variant={isLightBackground ? "dark" : "default"}
          options={[
            { value: "whisper-local", label: "Auto (use downloaded model)" },
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
            { value: "sensevoice", label: "SenseVoice Multilingual · 230 MB" },
            { value: "dolphin-base", label: "Dolphin Base CTC · 99 MB" },
            { value: "dolphin-small", label: "Dolphin Small CTC · 239 MB" },
          ]}
        />
      </SettingsRow>
      <SettingsRow label="Language" layout="stacked">
        <Select
          value={language}
          onChange={(event) => onChange("language", event.target.value)}
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
      </SettingsRow>
      <SettingsRow label="Compute Provider" layout="stacked">
        <Select
          value={provider}
          onChange={(event) => onChange("provider", event.target.value)}
          variant={isLightBackground ? "dark" : "default"}
          options={[
            { value: "auto", label: "Auto (benchmarks real backends)" },
            { value: "cpu", label: "CPU (most compatible)" },
            { value: "nnapi", label: "NNAPI (needs custom build - see docs)" },
            {
              value: "xnnpack",
              label: "XNNPACK (needs custom build - see docs)",
            },
            { value: "qnn", label: "QNN Snapdragon NPU (experimental)" },
          ]}
        />
      </SettingsRow>
    </div>
    <p className="text-xs vassist-text-muted">
      Powered by Whisper / SenseVoice running locally on your device.
      Chinese/Japanese: use a <b>Multilingual</b> Whisper model or{" "}
      <b>SenseVoice</b> (supports zh/ja/ko/yue/en only). English-only models
      ignore the language setting.
    </p>
  </div>
);

export default AndroidLocalSTTConfig;
