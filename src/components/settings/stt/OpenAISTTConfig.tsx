/**
 * OpenAI STT Configuration Component
 * Shared between Settings and Setup Wizard
 */

import { Input } from "../../ui";
import RemoteModelPicker from "../shared/RemoteModelPicker";

interface OpenAISTTConfigShape {
  apiKey?: string;
  model?: string;
}

type OpenAISTTOnChange =
  | ((field: string, value: string) => void)
  | ((updates: OpenAISTTConfigShape) => void);

interface OpenAISTTConfigProps {
  config: OpenAISTTConfigShape;
  onChange: OpenAISTTOnChange;
  isLightBackground?: boolean;
}

const OpenAISTTConfig = ({
  config,
  onChange,
  isLightBackground = false,
}: OpenAISTTConfigProps) => {
  const handleFieldChange = (
    field: keyof OpenAISTTConfigShape,
    value: string,
  ) => {
    if (onChange.length === 2) {
      (onChange as (field: string, value: string) => void)(field, value);
    } else {
      (onChange as (updates: OpenAISTTConfigShape) => void)({
        ...config,
        [field]: value,
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* API Key */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-white/90">
          API Key <span className="text-red-400">*</span>
        </label>
        <Input
          type="password"
          value={config.apiKey || ""}
          onChange={(e) => handleFieldChange("apiKey", e.target.value)}
          placeholder="sk-..."
          variant={isLightBackground ? "dark" : "default"}
        />
      </div>

      {/* Model */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-white/90">Model</label>
        <RemoteModelPicker
          value={config.model || "whisper-1"}
          onChange={(value) => handleFieldChange("model", value)}
          provider="openai"
          apiKey={config.apiKey || ""}
          placeholder="whisper-1"
          isLightBackground={isLightBackground}
        />
      </div>
    </div>
  );
};

export default OpenAISTTConfig;
