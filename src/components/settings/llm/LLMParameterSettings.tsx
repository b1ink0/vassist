import { useId } from "react";
import type { LLMParameters } from "../../../config/llmParameters";
import type { VAssistSettingsTargetId } from "../../../embed/config";
import { Input, Select, SettingsRow } from "../../ui";
import Toggle from "../../common/Toggle";

interface NumberParameterProps {
  label: string;
  value?: number;
  onChange: (value: number | undefined) => void;
  min?: number;
  max?: number | undefined;
  sliderMax?: number;
  step?: number;
  description?: string;
  targetId?: VAssistSettingsTargetId;
  isLightBackground?: boolean;
}

export function NumberParameter({
  label,
  value,
  onChange,
  min = 0,
  max,
  sliderMax = 2,
  step = 1,
  description,
  targetId,
  isLightBackground = false,
}: NumberParameterProps) {
  const id = useId();
  const rangeMax = max ?? Math.max(sliderMax, value ?? 0);
  return (
    <SettingsRow
      label={label}
      {...(description ? { description } : {})}
      {...(targetId ? { targetId } : {})}
      layout="stacked"
    >
      <div className="flex items-center gap-3">
        <input
          type="range"
          aria-label={`${label} slider`}
          min={min}
          max={rangeMax}
          step={step}
          value={value ?? min}
          onChange={(event) => onChange(Number(event.target.value))}
          className="min-w-0 flex-1 accent-current"
        />
        <Input
          id={id}
          aria-label={label}
          type="number"
          min={min}
          {...(max === undefined ? {} : { max })}
          step={step}
          value={value ?? ""}
          placeholder="Default"
          onChange={(event) => {
            if (!event.target.value) {
              onChange(undefined);
              return;
            }
            const next = Number(event.target.value);
            if (
              Number.isFinite(next) &&
              (step < 1 || Number.isInteger(next)) &&
              next >= min &&
              (max === undefined || next <= max)
            ) {
              onChange(next);
            }
          }}
          className="!w-28 shrink-0"
          variant={isLightBackground ? "dark" : "default"}
        />
      </div>
    </SettingsRow>
  );
}

interface LLMParameterSettingsProps {
  provider: "openai" | "ollama" | "desktop-local" | "android-local";
  config: LLMParameters & {
    llmEngine?: string;
    apiFormat?: string;
    model?: string;
  };
  onChange: (field: string, value: unknown) => void;
  isLightBackground?: boolean;
  openAdvanced?: boolean;
}

export default function LLMParameterSettings({
  provider,
  config,
  onChange,
  isLightBackground = false,
  openAdvanced = false,
}: LLMParameterSettingsProps) {
  const desktop = provider === "desktop-local";
  const android = provider === "android-local";
  const liteRt =
    android && config.model?.toLowerCase().endsWith(".litertlm") === true;
  const nativeOllama = provider === "ollama" && config.apiFormat === "ollama";
  const llamaServer = desktop && config.llmEngine === "llama-server";
  const nativeSampling = desktop || nativeOllama;
  const remote =
    provider === "openai" || (provider === "ollama" && !nativeOllama);
  const target = (field: keyof LLMParameters) =>
    `llm.${provider}.${field}` as VAssistSettingsTargetId;
  const number = (
    field: keyof LLMParameters,
    label: string,
    options: Omit<
      NumberParameterProps,
      "label" | "value" | "onChange" | "isLightBackground"
    > = {},
  ) => (
    <NumberParameter
      key={field}
      label={label}
      targetId={target(field)}
      {...(typeof config[field] === "number"
        ? { value: config[field] as number }
        : {})}
      onChange={(value) => onChange(field, value)}
      isLightBackground={isLightBackground}
      {...options}
    />
  );
  return (
    <div className="space-y-4">
      <SettingsRow
        label="Sampling parameters"
        targetId={target("samplingEnabled")}
        description="Turn off to use the model or server's sampling defaults."
      >
        <Toggle
          checked={config.samplingEnabled !== false}
          onChange={(checked) => onChange("samplingEnabled", checked)}
        />
      </SettingsRow>
      {config.samplingEnabled !== false &&
        number("temperature", "Temperature", {
          step: 0.01,
          sliderMax: 2,
          ...(remote ? { max: 2 } : {}),
        })}
      {number("maxTokens", "Output tokens", {
        min: 1,
        sliderMax: 65536,
        description:
          "Maximum generated tokens. Type a value beyond the slider range if needed.",
      })}
      {desktop || android || nativeOllama ? (
        number("contextSize", "Context size", {
          sliderMax: 1048576,
          description:
            "0 uses runtime defaults. Larger contexts require more memory and model support; the numeric field has no upper cap.",
        })
      ) : (
        <p className="text-xs text-white/55">
          Context capacity is controlled by the remote server and model.
        </p>
      )}
      <details className="group" open={openAdvanced}>
        <summary className="cursor-pointer text-sm font-medium text-white/90 py-2">
          Advanced parameters
        </summary>
        <div className="mt-2 space-y-4">
          {config.samplingEnabled !== false && (
            <>
              {number("topP", "Top P", { max: 1, step: 0.01 })}
              {(nativeSampling || android) &&
                number("topK", "Top K", { sliderMax: 128 })}
              {nativeSampling && (
                <>
                  {number("minP", "Min P", { max: 1, step: 0.01 })}
                  {llamaServer &&
                    number("typicalP", "Typical P", { max: 1, step: 0.01 })}
                  {number("repeatPenalty", "Repeat penalty", {
                    sliderMax: 2,
                    step: 0.01,
                  })}
                  {number("repeatLastN", "Repeat window", {
                    min: -1,
                    sliderMax: 1024,
                  })}
                </>
              )}
              {!android && (
                <>
                  {number("presencePenalty", "Presence penalty", {
                    min: desktop && !llamaServer ? 0 : -2,
                    max: desktop && !llamaServer ? 1 : 2,
                    step: 0.01,
                  })}
                  {number("frequencyPenalty", "Frequency penalty", {
                    min: desktop && !llamaServer ? 0 : -2,
                    max: desktop && !llamaServer ? 1 : 2,
                    step: 0.01,
                  })}
                </>
              )}
              {(!android || liteRt) &&
                number("seed", "Seed", {
                  min: liteRt ? 0 : -1,
                  sliderMax: 10000,
                  description: "Leave blank to use the runtime default.",
                })}
            </>
          )}
          {!android && (
            <SettingsRow
              label="Stop sequences"
              targetId={target("stop")}
              description="One sequence per line. Leave empty to use the model's normal stopping behavior."
              layout="stacked"
            >
              <textarea
                aria-label="Stop sequences"
                className={`glass-input w-full min-h-16 text-sm ${isLightBackground ? "glass-input-dark" : ""}`}
                value={(config.stop ?? []).join("\n")}
                onChange={(event) =>
                  onChange(
                    "stop",
                    event.target.value ? event.target.value.split("\n") : [],
                  )
                }
              />
            </SettingsRow>
          )}
          {remote && (
            <SettingsRow
              label="Output limit field"
              targetId={target("tokenLimitParameter")}
              layout="stacked"
            >
              <Select
                value={
                  config.tokenLimitParameter ??
                  (provider === "openai"
                    ? "max_completion_tokens"
                    : "max_tokens")
                }
                onChange={(event) =>
                  onChange("tokenLimitParameter", event.target.value)
                }
                variant={isLightBackground ? "dark" : "default"}
                options={[
                  {
                    value: "max_completion_tokens",
                    label: "max_completion_tokens",
                  },
                  {
                    value: "max_tokens",
                    label: "max_tokens (legacy / compatible)",
                  },
                ]}
              />
            </SettingsRow>
          )}
          {desktop && (
            <>
              {number("gpuLayers", "GPU layers", {
                min: -1,
                sliderMax: 128,
                description:
                  "-1 selects automatic offloading; 0 uses CPU only.",
              })}
              {number("threads", "CPU threads", {
                sliderMax: 64,
                description: "0 uses automatic thread selection.",
              })}
              {number("batchSize", "Batch size", { min: 1, sliderMax: 8192 })}
              {llamaServer &&
                number("ubatchSize", "Physical batch size", {
                  min: 1,
                  sliderMax: 2048,
                })}
              <SettingsRow
                label="Flash attention"
                description="Auto lets the runtime select supported acceleration. On forces it; Off disables it."
                targetId={target("flashAttention")}
                layout="stacked"
              >
                <Select
                  value={config.flashAttention ?? "auto"}
                  onChange={(event) =>
                    onChange("flashAttention", event.target.value)
                  }
                  variant={isLightBackground ? "dark" : "default"}
                  options={[
                    { value: "auto", label: "Auto" },
                    { value: "on", label: "On" },
                    { value: "off", label: "Off" },
                  ]}
                />
              </SettingsRow>
              {llamaServer && (
                <>
                  {(["cacheTypeK", "cacheTypeV"] as const).map((field) => (
                    <SettingsRow
                      key={field}
                      targetId={target(field)}
                      label={
                        field === "cacheTypeK" ? "Key cache" : "Value cache"
                      }
                      layout="stacked"
                    >
                      <Select
                        value={config[field] ?? "f16"}
                        onChange={(event) =>
                          onChange(field, event.target.value)
                        }
                        variant={isLightBackground ? "dark" : "default"}
                        options={["f16", "q8_0", "q4_0"].map((value) => ({
                          value,
                          label: value,
                        }))}
                      />
                    </SettingsRow>
                  ))}
                  <SettingsRow
                    label="RoPE scaling"
                    targetId={target("ropeScaling")}
                    layout="stacked"
                  >
                    <Select
                      value={config.ropeScaling ?? "model"}
                      onChange={(event) =>
                        onChange("ropeScaling", event.target.value)
                      }
                      variant={isLightBackground ? "dark" : "default"}
                      options={[
                        { value: "model", label: "Model default" },
                        ...["none", "linear", "yarn"].map((value) => ({
                          value,
                          label: value,
                        })),
                      ]}
                    />
                  </SettingsRow>
                  {config.ropeScaling !== "model" &&
                    config.ropeScaling !== "none" &&
                    number("ropeScale", "RoPE scale", {
                      min: 1,
                      sliderMax: 8,
                      step: 0.1,
                    })}
                </>
              )}
            </>
          )}
        </div>
      </details>
    </div>
  );
}
