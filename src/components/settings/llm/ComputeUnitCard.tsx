import { useEffect, useState } from "react";
import type * as React from "react";
import { Icon } from "../../icons";
import { Select } from "../../ui";

interface AndroidApiLike {
  getLLMComputeUnit?: () => string;
  setLLMComputeUnit?: (unit: string) => void;
  getLLMBackendInfo?: () => string;
}

interface ComputeUnitCardProps {
  androidAPI: AndroidApiLike | null;
  value: string;
  onChange: (unit: string) => void;
}

const COMPUTE_UNITS = [
  {
    value: "auto",
    label: "Auto (accelerator if available)",
    hint: "Offloads to GPU/NPU when the device supports it, CPU otherwise.",
  },
  { value: "cpu", label: "CPU", hint: "Always run on CPU. Most compatible." },
  {
    value: "gpu",
    label: "GPU (OpenCL / Vulkan)",
    hint: "Adreno (OpenCL) on Snapdragon; Mali/Xclipse (Vulkan) on MediaTek, Exynos and others. Falls back to CPU when unsupported.",
  },
  {
    value: "npu",
    label: "NPU (Hexagon HTP)",
    hint: "Snapdragon 8 Gen 3 / 8 Elite / 8 Elite Gen 5. Requires Q4_0/Q8_0 model quants. Falls back to CPU otherwise.",
  },
];

/**
 * ComputeUnitCard - Snapdragon compute-unit picker for the on-device
 * llama.cpp runtime, plus a live readout of the registered ggml backends.
 */
const ComputeUnitCard = ({
  androidAPI,
  value,
  onChange,
}: ComputeUnitCardProps) => {
  const [backends, setBackends] = useState<string | null>(null);

  // One-shot readout of the native backend registry (best-effort)
  useEffect(() => {
    try {
      const info = androidAPI?.getLLMBackendInfo?.();
      if (info && info !== "unavailable") {
        setBackends(info);
      }
    } catch {
      // bridge not ready - leave hidden
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeHint = COMPUTE_UNITS.find((u) => u.value === value)?.hint ?? "";

  /** "cpu|CPU,opencl|Adreno(750),hexagon|Hexagon(v81)" -> readable list */
  const parseBackends = (info: string): string[] =>
    info
      .split(",")
      .map((entry) => entry.split("|")[0]?.trim())
      .filter((name): name is string => Boolean(name));

  return (
    <div className="space-y-2 p-3 rounded-lg bg-white/5 border border-white/10">
      <div className="flex items-center gap-2">
        <Icon name="stats" size={14} className="text-white/70" />
        <h4 className="text-sm font-semibold text-white/90">Compute Unit</h4>
        <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-white/10 text-white/50">
          Snapdragon
        </span>
      </div>

      <Select
        value={value}
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
          onChange(e.target.value)
        }
        options={COMPUTE_UNITS.map((u) => ({ value: u.value, label: u.label }))}
        className="min-h-[32px]"
      />

      <p className="text-xs text-white/50">{activeHint}</p>

      {backends && (
        <div className="flex flex-wrap gap-1 pt-1">
          {parseBackends(backends).map((name) => (
            <span
              key={name}
              className="px-1.5 py-0.5 rounded text-[10px] bg-white/10 text-white/60"
            >
              {name}
            </span>
          ))}
        </div>
      )}

      <p className="text-[10px] text-white/40">
        Applies on the next message (model reloads automatically).
      </p>
    </div>
  );
};

export default ComputeUnitCard;
