import { useEffect, useRef, useState } from "react";
import type { BackgroundFillSettings, BackgroundMode } from "../../config/uiConfig";
import { Select } from "../ui";

const gradientPresets = {
  midnight: { start: "#101827", end: "#243b63", angle: 135 },
  ocean: { start: "#063b4a", end: "#267a9a", angle: 125 },
  aurora: { start: "#182447", end: "#65528f", angle: 145 },
  sunset: { start: "#48233f", end: "#c96951", angle: 120 },
  forest: { start: "#102f2b", end: "#53806c", angle: 135 },
} as const;

type GradientPreset = "custom" | keyof typeof gradientPresets;

interface BackgroundFillControlsProps {
  fill: BackgroundFillSettings;
  isLightBackground?: boolean;
  onChange: (fill: BackgroundFillSettings) => void;
}

export default function BackgroundFillControls({
  fill,
  isLightBackground = false,
  onChange,
}: BackgroundFillControlsProps) {
  const [draft, setDraft] = useState(fill);
  const draftRef = useRef(fill);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasDraftChangesRef = useRef(false);
  const [gradientPreset, setGradientPreset] = useState<GradientPreset>("custom");
  const [angle, setAngle] = useState(fill.gradientAngleDegrees);
  const variant = isLightBackground ? "dark" : "default";

  useEffect(() => {
    hasDraftChangesRef.current = false;
    draftRef.current = fill;
    setDraft(fill);
    setAngle(fill.gradientAngleDegrees);
  }, [fill]);

  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    },
    [],
  );

  const commit = (nextFill = draftRef.current) => {
    if (!hasDraftChangesRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    hasDraftChangesRef.current = false;
    draftRef.current = nextFill;
    setDraft(nextFill);
    onChange(nextFill);
  };

  const updateDraft = (nextFill: BackgroundFillSettings) => {
    hasDraftChangesRef.current = true;
    draftRef.current = nextFill;
    setDraft(nextFill);
  };

  const updateColor = (nextFill: BackgroundFillSettings) => {
    updateDraft(nextFill);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => commit(nextFill), 180);
  };

  const changeMode = (mode: BackgroundMode) => {
    const nextFill = { ...draftRef.current, mode };
    updateDraft(nextFill);
    commit(nextFill);
  };

  const applyGradientPreset = (value: GradientPreset) => {
    setGradientPreset(value);
    if (value === "custom") return;
    const selected = gradientPresets[value];
    const nextFill = {
      ...draftRef.current,
      mode: "gradient" as const,
      gradientStartColor: selected.start,
      gradientEndColor: selected.end,
      gradientAngleDegrees: selected.angle,
    };
    setAngle(selected.angle);
    updateDraft(nextFill);
    commit(nextFill);
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/5 p-3">
      <label className="flex flex-col gap-1 text-xs text-white/80">
        <span>Background type</span>
        <Select
          value={draft.mode}
          variant={variant}
          onChange={(event) => changeMode(event.target.value as BackgroundMode)}
          options={[
            { value: "images", label: "Images" },
            { value: "solid", label: "Solid color" },
            { value: "gradient", label: "Gradient" },
          ]}
        />
      </label>

      {draft.mode === "solid" && (
        <label className="flex items-center justify-between gap-3 text-xs text-white/80">
          <span>Background color</span>
          <span className="flex items-center gap-2">
            <span>{draft.solidColor.toUpperCase()}</span>
            <input
              type="color"
              aria-label="Background color"
              value={draft.solidColor}
              onChange={(event) =>
                updateColor({ ...draftRef.current, solidColor: event.target.value })
              }
              onBlur={() => commit()}
              className="h-8 w-10 cursor-pointer rounded border border-white/20 bg-transparent p-0.5"
            />
          </span>
        </label>
      )}

      {draft.mode === "gradient" && (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs text-white/80">
            <span>Gradient preset</span>
            <Select
              value={gradientPreset}
              variant={variant}
              onChange={(event) =>
                applyGradientPreset(event.target.value as GradientPreset)
              }
              options={[
                { value: "custom", label: "Custom" },
                { value: "midnight", label: "Midnight" },
                { value: "ocean", label: "Ocean" },
                { value: "aurora", label: "Aurora" },
                { value: "sunset", label: "Sunset" },
                { value: "forest", label: "Forest" },
              ]}
            />
          </label>

          <div className="flex gap-3">
            {([
              ["Start color", "gradientStartColor"],
              ["End color", "gradientEndColor"],
            ] as const).map(([label, key]) => (
              <label
                key={key}
                className="flex min-w-0 flex-1 items-center justify-between gap-2 text-xs text-white/80"
              >
                <span>{label}</span>
                <input
                  type="color"
                  aria-label={label}
                  value={draft[key]}
                  onChange={(event) => {
                    setGradientPreset("custom");
                    updateColor({
                      ...draftRef.current,
                      [key]: event.target.value,
                    });
                  }}
                  onBlur={() => commit()}
                  className="h-8 w-10 cursor-pointer rounded border border-white/20 bg-transparent p-0.5"
                />
              </label>
            ))}
          </div>

          <label className="flex flex-col gap-1 text-xs text-white/80">
            <span className="flex items-center justify-between gap-2">
              <span>Gradient angle</span>
              <span>{angle}°</span>
            </span>
            <input
              type="range"
              aria-label="Gradient angle"
              min={0}
              max={360}
              step={5}
              value={angle}
              onChange={(event) => {
                const nextAngle = Number(event.target.value);
                setGradientPreset("custom");
                setAngle(nextAngle);
                updateDraft({
                  ...draftRef.current,
                  gradientAngleDegrees: nextAngle,
                });
              }}
              onPointerUp={() => commit()}
              onKeyUp={() => commit()}
              onBlur={() => commit()}
              className="w-full accent-current"
            />
          </label>

          <div
            aria-hidden="true"
            className="h-12 rounded-md border border-white/15"
            style={{
              background: `linear-gradient(${angle}deg, ${draft.gradientStartColor}, ${draft.gradientEndColor})`,
            }}
          />
        </div>
      )}
    </div>
  );
}
