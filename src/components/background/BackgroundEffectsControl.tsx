import { useEffect, useRef, useState } from "react";
import type { BackgroundImageEffects } from "../../config/uiConfig";
import { Select } from "../ui";

type EffectKey = keyof BackgroundImageEffects;
type EffectPreset =
  | "custom"
  | "natural"
  | "vivid"
  | "warm"
  | "monochrome"
  | "soft";

const neutralEffects = {
  contrastPercent: 100,
  saturationPercent: 100,
  blurPixels: 0,
  grayscalePercent: 0,
  sepiaPercent: 0,
  hueRotateDegrees: 0,
};

const presets: Record<
  Exclude<EffectPreset, "custom">,
  Partial<Omit<BackgroundImageEffects, "brightnessPercent">>
> = {
  natural: {
    ...neutralEffects,
  },
  vivid: {
    ...neutralEffects,
    contrastPercent: 115,
    saturationPercent: 145,
  },
  warm: {
    ...neutralEffects,
    contrastPercent: 105,
    saturationPercent: 115,
    sepiaPercent: 25,
  },
  monochrome: {
    ...neutralEffects,
    contrastPercent: 110,
    grayscalePercent: 100,
  },
  soft: {
    ...neutralEffects,
    contrastPercent: 90,
    blurPixels: 1,
  },
};

const effectSliders: Array<{
  key: EffectKey;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
}> = [
  {
    key: "contrastPercent",
    label: "Contrast",
    min: 50,
    max: 150,
    step: 5,
    unit: "%",
  },
  {
    key: "saturationPercent",
    label: "Saturation",
    min: 0,
    max: 200,
    step: 5,
    unit: "%",
  },
  { key: "blurPixels", label: "Blur", min: 0, max: 12, step: 1, unit: " px" },
  {
    key: "grayscalePercent",
    label: "Grayscale",
    min: 0,
    max: 100,
    step: 5,
    unit: "%",
  },
  {
    key: "sepiaPercent",
    label: "Sepia",
    min: 0,
    max: 100,
    step: 5,
    unit: "%",
  },
  {
    key: "hueRotateDegrees",
    label: "Hue",
    min: 0,
    max: 360,
    step: 5,
    unit: "°",
  },
];

interface BackgroundEffectsControlProps {
  effects: BackgroundImageEffects;
  isLightBackground?: boolean;
  onChange: (effects: BackgroundImageEffects) => void;
}

export default function BackgroundEffectsControl({
  effects,
  isLightBackground = false,
  onChange,
}: BackgroundEffectsControlProps) {
  const [expanded, setExpanded] = useState(false);
  const [preset, setPreset] = useState<EffectPreset>("custom");
  const [draftEffects, setDraftEffects] = useState(effects);
  const draftEffectsRef = useRef(effects);
  const hasUncommittedChangesRef = useRef(false);

  useEffect(() => {
    if (hasUncommittedChangesRef.current) return;
    draftEffectsRef.current = effects;
    setDraftEffects(effects);
  }, [effects]);

  const changeEffect = (key: EffectKey, value: number) => {
    setPreset("custom");
    const nextEffects = { ...draftEffectsRef.current, [key]: value };
    draftEffectsRef.current = nextEffects;
    hasUncommittedChangesRef.current = true;
    setDraftEffects(nextEffects);
  };

  const commitEffects = () => {
    if (!hasUncommittedChangesRef.current) return;
    hasUncommittedChangesRef.current = false;
    onChange(draftEffectsRef.current);
  };

  const applyPreset = (nextPreset: EffectPreset) => {
    setPreset(nextPreset);
    if (nextPreset === "custom") return;
    const nextEffects = {
      ...draftEffectsRef.current,
      ...presets[nextPreset],
    };
    draftEffectsRef.current = nextEffects;
    hasUncommittedChangesRef.current = false;
    setDraftEffects(nextEffects);
    onChange(nextEffects);
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/5 p-3">
      <label className="flex flex-col gap-1 text-xs text-white/80">
        <span className="flex items-center justify-between gap-2">
          <span>Background brightness</span>
          <span>{draftEffects.brightnessPercent}%</span>
        </span>
        <input
          type="range"
          aria-label="Background brightness"
          min={20}
          max={100}
          step={5}
          value={draftEffects.brightnessPercent}
          onChange={(event) =>
            changeEffect("brightnessPercent", Number(event.target.value))
          }
          onPointerUp={commitEffects}
          onKeyUp={commitEffects}
          onBlur={commitEffects}
          className="w-full accent-current"
        />
      </label>

      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className="flex items-center justify-between text-left text-xs font-medium text-white/75 hover:text-white"
      >
        <span>More image effects</span>
        <span>{expanded ? "Hide" : "Show"}</span>
      </button>

      {expanded && (
        <div className="flex flex-col gap-3 border-t border-white/10 pt-3">
          <label className="flex items-center justify-between gap-2 text-xs text-white/80">
            <span>Quick effect</span>
            <Select
              variant={isLightBackground ? "dark" : "default"}
              value={preset}
              onChange={(event) => {
                const nextPreset = event.target.value as EffectPreset;
                applyPreset(nextPreset);
              }}
              options={[
                { value: "custom", label: "Custom" },
                { value: "natural", label: "Natural" },
                { value: "vivid", label: "Vivid" },
                { value: "warm", label: "Warm" },
                { value: "monochrome", label: "Monochrome" },
                { value: "soft", label: "Soft" },
              ]}
              className="max-w-40"
            />
          </label>

          {effectSliders.map((effect) => (
            <label
              key={effect.key}
              className="flex flex-col gap-1 text-xs text-white/80"
            >
              <span className="flex items-center justify-between gap-2">
                <span>{effect.label}</span>
                <span>
                  {draftEffects[effect.key]}
                  {effect.unit}
                </span>
              </span>
              <input
                type="range"
                aria-label={effect.label}
                min={effect.min}
                max={effect.max}
                step={effect.step}
                value={draftEffects[effect.key]}
                onChange={(event) =>
                  changeEffect(effect.key, Number(event.target.value))
                }
                onPointerUp={commitEffects}
                onKeyUp={commitEffects}
                onBlur={commitEffects}
                className="w-full accent-current"
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
