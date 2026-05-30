/**
 * OpenAI-Compatible STT Configuration Component
 * Shared between Settings and Setup Wizard
 */

import { Input, Select, SettingsRow } from "../../ui";
import RemoteModelPicker from "../shared/RemoteModelPicker";

interface OpenAICompatibleSTTConfigShape {
  endpoint?: string;
  apiKey?: string;
  model?: string;
  language?: string;
}

type OpenAICompatibleOnChange =
  | ((field: string, value: string) => void)
  | ((updates: OpenAICompatibleSTTConfigShape) => void);

interface OpenAICompatibleSTTConfigProps {
  config: OpenAICompatibleSTTConfigShape;
  onChange: OpenAICompatibleOnChange;
  isLightBackground?: boolean;
}

const OpenAICompatibleSTTConfig = ({
  config,
  onChange,
  isLightBackground = false,
}: OpenAICompatibleSTTConfigProps) => {
  const handleFieldChange = (
    field: keyof OpenAICompatibleSTTConfigShape,
    value: string,
  ) => {
    if (onChange.length === 2) {
      (onChange as (field: string, value: string) => void)(field, value);
    } else {
      (onChange as (updates: OpenAICompatibleSTTConfigShape) => void)({
        ...config,
        [field]: value,
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Endpoint URL */}
      <SettingsRow
        label="Endpoint URL *"
        targetId="stt.openaiCompatible.endpoint"
      >
        <Input
          type="text"
          value={config.endpoint || ""}
          onChange={(e) => handleFieldChange("endpoint", e.target.value)}
          placeholder="http://localhost:8000"
          variant={isLightBackground ? "dark" : "default"}
        />
      </SettingsRow>

      {/* API Key (Optional) */}
      <SettingsRow
        label="API Key (Optional)"
        targetId="stt.openaiCompatible.apiKey"
      >
        <Input
          type="password"
          value={config.apiKey || ""}
          onChange={(e) => handleFieldChange("apiKey", e.target.value)}
          placeholder="Leave empty if not required"
          variant={isLightBackground ? "dark" : "default"}
        />
      </SettingsRow>

      {/* Model */}
      <SettingsRow label="Model" targetId="stt.openaiCompatible.model">
        <RemoteModelPicker
          value={config.model || ""}
          onChange={(value) => handleFieldChange("model", value)}
          provider="ollama"
          endpoint={config.endpoint || ""}
          apiKey={config.apiKey || ""}
          placeholder="whisper"
          isLightBackground={isLightBackground}
        />
      </SettingsRow>

      {/* Language */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-white/90">
          Language
        </label>
        <Select
          value={config.language || "auto"}
          onChange={(e) => handleFieldChange("language", e.target.value)}
          variant={isLightBackground ? "dark" : "default"}
          options={[
            { value: "auto", label: "Auto-detect" },
            { value: "en", label: "English" },
            { value: "es", label: "Spanish" },
            { value: "fr", label: "French" },
            { value: "de", label: "German" },
            { value: "it", label: "Italian" },
            { value: "pt", label: "Portuguese" },
            { value: "zh", label: "Chinese" },
            { value: "ja", label: "Japanese" },
            { value: "ko", label: "Korean" },
          ]}
        />
      </div>
    </div>
  );
};

export default OpenAICompatibleSTTConfig;
