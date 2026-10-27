import { useEffect, useMemo, useRef, useState } from "react";
import {
  BUILT_IN_STAGES,
  DefaultStageCalibration,
  DefaultStageOptions,
  DefaultStageSettings,
  getBuiltInStage,
  type StageSelection,
  type StageSettings as StageSettingsValue,
} from "../../config/stageConfig";
import {
  useUIConfig,
  useConfigUIActions,
} from "../../hooks/config/useConfigUI";
import { useSceneActions } from "../../hooks/app/useScene";
import { stageStorageService } from "../../services/storage/StageStorageService";
import { modelStorageService } from "../../services/storage/ModelStorageService";
import { importStageFile } from "../../services/storage/StageImportService";
import { Button, Input, Select } from "../ui";
import Toggle from "../common/Toggle";
import Icon from "../icons/Icon";
import { isAndroid } from "../../utils/PlatformUtils";
import resourceLoader from "../../utils/ResourceLoader";
import { useXrRuntime } from "../../contexts/XrRuntimeContext";

type StageItem = Awaited<
  ReturnType<typeof stageStorageService.getStagesList>
>[number];

const formatHour = (hour: number): string => {
  const minutes = Math.min(24 * 60, Math.max(0, Math.round(hour * 4) * 15));
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
};

export function StageSelectionControls({
  settings,
  onSettingsChange,
  recreateScene = () => {},
  avatarEnabled = true,
  saveCustomDefault = true,
  parallaxEnabled,
  shadowEnabled,
  onParallaxChange,
  onShadowChange,
  refreshTrigger,
  onRequestDeleteStageDialog,
}: {
  settings: StageSettingsValue;
  onSettingsChange: (settings: StageSettingsValue) => void;
  recreateScene?: () => void;
  avatarEnabled?: boolean;
  saveCustomDefault?: boolean;
  parallaxEnabled?: boolean;
  shadowEnabled?: boolean;
  onParallaxChange?: (value: boolean) => void;
  onShadowChange?: (value: boolean) => void;
  refreshTrigger?: number;
  onRequestDeleteStageDialog?: ((id: string) => void) | undefined;
}) {
  const xr = useXrRuntime();
  const [stages, setStages] = useState<StageItem[]>([]);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [modelId, setModelId] = useState("builtin_default_model");
  const [advanced, setAdvanced] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const input = useRef<HTMLInputElement>(null);
  const latestSettings = useRef(settings);
  const latestOnSettingsChange = useRef(onSettingsChange);
  const latestRecreateScene = useRef(recreateScene);
  const latestXr = useRef(xr);
  latestXr.current = xr;
  const selected = useMemo(
    () =>
      settings.selection ??
      (stages.find((stage) => stage.isDefault)
        ? {
            kind: "custom" as const,
            id: stages.find((stage) => stage.isDefault)!.id,
          }
        : { kind: "none" as const }),
    [settings.selection, stages],
  );
  const selectedId = selected.kind === "none" ? "none" : selected.id;
  const lastSelection = useRef<StageSelection>({
    kind: "builtin",
    id: "moss-house",
  });
  useEffect(() => {
    if (selected.kind !== "none") lastSelection.current = selected;
  }, [selected]);
  useEffect(() => {
    let active = true;
    void Promise.all(
      BUILT_IN_STAGES.map(
        async ({ id }) =>
          [
            id,
            await resourceLoader.getURLAsync(
              `res/assets/stage-previews/${id}.webp`,
            ),
          ] as const,
      ),
    )
      .then((entries) => {
        if (active) setPreviews(Object.fromEntries(entries));
      })
      .catch((reason: unknown) => {
        if (active) setError(String(reason));
      });
    return () => {
      active = false;
    };
  }, []);
  const supportsAlignment =
    selected.kind === "builtin" ||
    (selected.kind === "custom" &&
      ["glb", "babylon"].includes(
        String(
          stages.find((stage) => stage.id === selected.id)?.metadata.format,
        ),
      ));
  const definition =
    selected.kind === "builtin" ? getBuiltInStage(selected.id) : undefined;
  const supportsSeason =
    selected.kind === "custom" || definition?.seasons === true;
  const [options, setOptions] = useState({
    ...DefaultStageOptions,
    ...settings.options[selectedId],
  });
  const lightingMode =
    options.lightingMode ??
    (options.localTime
      ? "time"
      : options.mood || definition?.moods
        ? "mood"
        : "time");
  const [calibration, setCalibration] = useState(
    settings.calibration[modelId] ?? DefaultStageCalibration,
  );

  const loadList = async () =>
    setStages(await stageStorageService.getStagesList());
  useEffect(() => {
    latestSettings.current = settings;
    latestOnSettingsChange.current = onSettingsChange;
    latestRecreateScene.current = recreateScene;
  }, [settings, onSettingsChange, recreateScene]);
  useEffect(() => {
    let active = true;
    void Promise.all([
      stageStorageService.getStagesList(),
      modelStorageService.getDefaultModel(),
    ])
      .then(([list, model]) => {
        if (active) {
          setStages(list);
          setModelId(model?.id ?? "builtin_default_model");
          const currentSettings = latestSettings.current;
          const selection = currentSettings.selection;
          if (
            selection?.kind === "custom" &&
            !list.some((stage) => stage.id === selection.id)
          ) {
            const next: StageSettingsValue = {
              ...currentSettings,
              selection: { kind: "none" },
            };
            latestOnSettingsChange.current(next);
            const runtime = latestXr.current;
            if (runtime.enabled && runtime.scene?.metadata?.replaceXrStage)
              void runtime.scene.metadata
                .replaceXrStage(next)
                .catch((reason: unknown) => setError(String(reason)));
            else requestAnimationFrame(latestRecreateScene.current);
          }
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(String(reason));
      });
    return () => {
      active = false;
    };
  }, [refreshTrigger]);
  useEffect(() => {
    setOptions({ ...DefaultStageOptions, ...settings.options[selectedId] });
  }, [selectedId, settings.options]);
  useEffect(() => {
    setCalibration(settings.calibration[modelId] ?? DefaultStageCalibration);
  }, [modelId, settings.calibration]);
  useEffect(() => {
    const showError = (event: Event) =>
      setError(String((event as CustomEvent<unknown>).detail));
    window.addEventListener("vassist-stage-error", showError);
    return () => {
      window.removeEventListener("vassist-stage-error", showError);
    };
  }, []);

  const select = async (selection: StageSelection) => {
    try {
      if (saveCustomDefault && selection.kind === "custom")
        await stageStorageService.setDefaultStage(selection.id);
      const next = { ...settings, selection };
      onSettingsChange(next);
      setError("");
      if (xr.enabled && xr.scene?.metadata?.replaceXrStage)
        await xr.scene.metadata.replaceXrStage(next);
      else requestAnimationFrame(recreateScene);
    } catch (reason) {
      setError(String(reason));
    }
  };
  const apply = () => {
    const next = {
      ...settings,
      options: { ...settings.options, [selectedId]: options },
      calibration: { ...settings.calibration, [modelId]: calibration },
    };
    onSettingsChange(next);
    if (xr.enabled && xr.scene?.metadata?.replaceXrStage)
      void xr.scene.metadata
        .replaceXrStage(next)
        .catch((reason: unknown) => setError(String(reason)));
    else requestAnimationFrame(recreateScene);
  };
  const upload = async (files: File[]) => {
    const errors: string[] = [];
    try {
      for (const file of files) {
        setProgress(`Importing ${file.name}`);
        try {
          await importStageFile(file, setProgress);
        } catch (reason) {
          errors.push(`${file.name}: ${String(reason)}`);
        }
      }
      await loadList();
    } finally {
      setProgress("");
      setError(errors.join("\n"));
    }
  };
  const rename = async (id: string) => {
    try {
      await stageStorageService.updateStageName(id, name);
      setEditing(null);
      await loadList();
    } catch (reason) {
      setError(String(reason));
    }
  };
  const remove = async (id: string) => {
    if (onRequestDeleteStageDialog) {
      onRequestDeleteStageDialog(id);
      return;
    }
    try {
      await stageStorageService.deleteStage(id);
      if (selectedId === id) await select({ kind: "none" });
      await loadList();
    } catch (reason) {
      setError(String(reason));
    }
  };

  return (
    <div
      className="flex flex-col gap-4"
      title={!avatarEnabled ? "Turn on the avatar to use stages" : undefined}
    >
      {!avatarEnabled && (
        <p className="text-xs text-white/50">
          Turn on the avatar to use stages.
        </p>
      )}
      <fieldset
        disabled={!avatarEnabled}
        className="flex min-w-0 flex-col gap-4 disabled:opacity-45"
      >
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-white">Stages</h4>
          <Toggle
            aria-label="Enable stages"
            checked={selected.kind !== "none"}
            onChange={(enabled) =>
              void select(enabled ? lastSelection.current : { kind: "none" })
            }
          />
        </div>
        {selected.kind !== "none" && (
          <div className="flex flex-wrap gap-2">
            {BUILT_IN_STAGES.map((stage) => (
              <button
                key={stage.id}
                type="button"
                title={stage.description}
                aria-pressed={
                  selected.kind === "builtin" && selected.id === stage.id
                }
                onClick={() => void select({ kind: "builtin", id: stage.id })}
                className="relative flex h-24 min-w-[min(120px,100%)] flex-[1_1_30%] items-end overflow-hidden rounded-lg border border-white/15 p-2 text-left hover:border-white/40 aria-pressed:border-white/70"
              >
                {previews[stage.id] && (
                  <img
                    src={previews[stage.id]}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                )}
                <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/65 to-transparent" />
                <span className="relative truncate text-xs font-medium text-white">
                  {stage.name}
                </span>
                {selected.kind === "builtin" && selected.id === stage.id && (
                  <Icon
                    name="check"
                    size={16}
                    className="absolute right-2 top-2 text-white"
                  />
                )}
              </button>
            ))}
          </div>
        )}
        {selected.kind !== "none" && (
          <div className="flex flex-col gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAdvanced(!advanced)}
              aria-expanded={advanced}
            >
              {advanced ? "Show less" : "Stage options"}
              <Icon name={advanced ? "chevron-up" : "chevron-down"} size={14} />
            </Button>
            {advanced && (
              <div className="flex flex-col gap-3 rounded-lg border border-white/10 p-3">
                <label className="flex flex-col gap-2 text-xs text-white/70">
                  <span className="flex items-center justify-between gap-3">
                    <span>Environment brightness</span>
                    <span className="tabular-nums text-white/90">
                      {Math.round(options.brightness * 100)}%
                    </span>
                  </span>
                  <input
                    type="range"
                    min="0.35"
                    max="1.5"
                    step="0.05"
                    value={options.brightness}
                    aria-label="Environment brightness"
                    onChange={(event) =>
                      setOptions({
                        ...options,
                        brightness: Number(event.target.value),
                      })
                    }
                    className="w-full accent-current"
                  />
                  <span className="flex justify-between text-[10px] text-white/45">
                    <span>Dim</span>
                    <span>Bright</span>
                  </span>
                </label>
                {onParallaxChange && (
                  <div className="flex items-center justify-between gap-3 text-sm text-white/80">
                    Stage parallax
                    <Toggle
                      checked={parallaxEnabled !== false}
                      onChange={onParallaxChange}
                    />
                  </div>
                )}
                {onShadowChange && (
                  <div className="flex items-center justify-between gap-3 text-sm text-white/80">
                    Avatar shadow
                    <Toggle
                      checked={shadowEnabled !== false}
                      onChange={onShadowChange}
                    />
                  </div>
                )}
                {supportsSeason && (
                  <div className="flex flex-col gap-3">
                    <label className="flex flex-col gap-1 text-xs text-white/70">
                      Season
                      <Select
                        value={options.season}
                        options={[
                          { value: "auto", label: "Automatic (local date)" },
                          { value: "spring", label: "Spring" },
                          { value: "summer", label: "Summer" },
                          { value: "autumn", label: "Autumn" },
                          { value: "winter", label: "Winter" },
                        ]}
                        onChange={(event) =>
                          setOptions({
                            ...options,
                            season: event.target.value as typeof options.season,
                          })
                        }
                      />
                    </label>
                    {definition?.seasonalEffects !== false && (
                      <div className="flex items-center justify-between gap-3 text-sm text-white/80">
                        Seasonal effects
                        <Toggle
                          checked={options.seasonalEffects}
                          onChange={(seasonalEffects) =>
                            setOptions({ ...options, seasonalEffects })
                          }
                        />
                      </div>
                    )}
                  </div>
                )}
                {definition?.time && (
                  <div className="flex flex-col gap-3">
                    {definition.moods && (
                      <label className="flex flex-col gap-1 text-xs text-white/70">
                        Lighting
                        <Select
                          value={lightingMode}
                          options={[
                            { value: "time", label: "Time of day" },
                            { value: "mood", label: "Mood" },
                          ]}
                          onChange={(event) => {
                            const mode = event.target.value as "time" | "mood";
                            setOptions({
                              ...options,
                              lightingMode: mode,
                            });
                          }}
                        />
                      </label>
                    )}
                    {lightingMode === "mood" && definition.moods ? (
                      <label className="flex flex-col gap-1 text-xs text-white/70">
                        Mood
                        <Select
                          value={options.mood}
                          options={[
                            { value: "", label: "Default" },
                            ...definition.moods,
                          ]}
                          onChange={(event) =>
                            setOptions({ ...options, mood: event.target.value })
                          }
                        />
                      </label>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-3 text-sm text-white/80">
                          Use local time
                          <Toggle
                            checked={options.localTime}
                            onChange={(localTime) =>
                              setOptions({ ...options, localTime })
                            }
                          />
                        </div>
                        {!options.localTime && (
                          <label className="flex flex-col gap-2 text-xs text-white/70">
                            <span className="flex items-center justify-between gap-3">
                              <span>Time of day</span>
                              <span className="tabular-nums text-white/90">
                                {formatHour(options.hour)}
                              </span>
                            </span>
                            <input
                              type="range"
                              min={0}
                              max={24}
                              step={0.25}
                              value={options.hour}
                              aria-label="Time of day"
                              aria-valuetext={formatHour(options.hour)}
                              onChange={(event) =>
                                setOptions({
                                  ...options,
                                  hour: Number(event.target.value),
                                })
                              }
                              className="w-full accent-current"
                            />
                            <span
                              className="flex justify-between text-[10px] text-white/45"
                              aria-hidden="true"
                            >
                              <span>00:00</span>
                              <span>06:00</span>
                              <span>12:00</span>
                              <span>18:00</span>
                              <span>24:00</span>
                            </span>
                          </label>
                        )}
                      </>
                    )}
                  </div>
                )}
                {definition?.animated && (
                  <div className="flex items-center justify-between gap-3 text-sm text-white/80">
                    Animate environment
                    <Toggle
                      checked={options.animate}
                      onChange={(animate) =>
                        setOptions({ ...options, animate })
                      }
                    />
                  </div>
                )}
                {supportsAlignment && (
                  <>
                    <label className="flex flex-col gap-1 text-xs text-white/70">
                      Avatar height in meters
                      <Input
                        type="number"
                        min={0.25}
                        max={4}
                        step={0.05}
                        value={calibration.heightMeters}
                        onChange={(event) =>
                          setCalibration({
                            ...calibration,
                            heightMeters: Math.min(
                              4,
                              Math.max(0.25, Number(event.target.value)),
                            ),
                          })
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-white/70">
                      Floor adjustment in meters
                      <Input
                        type="number"
                        min={-1}
                        max={1}
                        step={0.01}
                        value={calibration.floorOffset}
                        onChange={(event) =>
                          setCalibration({
                            ...calibration,
                            floorOffset: Math.min(
                              1,
                              Math.max(-1, Number(event.target.value)),
                            ),
                          })
                        }
                      />
                    </label>
                    <p className="text-xs text-white/45">
                      Alignment is saved for this avatar. Adjust the room size
                      or floor contact without changing the avatar's physics.
                    </p>
                  </>
                )}
                <Button size="sm" onClick={apply}>
                  Apply
                </Button>
              </div>
            )}
          </div>
        )}
        <details>
          <summary className="cursor-pointer text-xs text-white/60">
            Custom stages
          </summary>
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-white">Custom stages</h4>
            <input
              ref={input}
              type="file"
              accept=".zip,.glb,.babylon"
              multiple
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                void upload(files);
              }}
            />
            <Button
              variant="ghost"
              size="sm"
              disabled={Boolean(progress)}
              onClick={() => input.current?.click()}
            >
              <Icon name="upload" size={15} />
              Import
            </Button>
          </div>
          <p className="text-xs text-white/50">
            GLB, Babylon scenes with embedded textures, or PMX stage ZIPs.
          </p>
          {progress && (
            <p className="text-xs text-white/70" role="status">
              {progress}
            </p>
          )}
          {error && (
            <p
              className="whitespace-pre-wrap text-xs text-red-300"
              role="alert"
            >
              {error}
            </p>
          )}
          <div className="flex max-h-[360px] flex-col gap-2 overflow-y-auto scrollbar-glass">
            {stages.map((stage) => (
              <div
                key={stage.id}
                className="flex items-center gap-2 rounded-lg border border-white/10 p-2"
              >
                {editing === stage.id ? (
                  <Input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void rename(stage.id);
                      if (event.key === "Escape") setEditing(null);
                    }}
                    className="min-w-0 flex-1"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      void select({ kind: "custom", id: stage.id })
                    }
                    className="flex min-w-0 flex-1 flex-col text-left"
                  >
                    <span className="w-full truncate text-sm text-white">
                      {stage.name}
                    </span>
                    <span className="text-xs text-white/45">
                      {((stage.metadata.fileSize ?? 0) / 1048576).toFixed(1)} MB
                    </span>
                  </button>
                )}
                {editing === stage.id ? (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Save name"
                      onClick={() => void rename(stage.id)}
                    >
                      <Icon name="check" size={15} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Cancel"
                      onClick={() => setEditing(null)}
                    >
                      <Icon name="x" size={15} />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Rename stage"
                      onClick={() => {
                        setEditing(stage.id);
                        setName(stage.name);
                      }}
                    >
                      <Icon name="pencil" size={15} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Delete stage"
                      onClick={() => void remove(stage.id)}
                    >
                      <Icon name="trash-2" size={15} />
                    </Button>
                    <Toggle
                      checked={
                        selected.kind === "custom" && selected.id === stage.id
                      }
                      onChange={(checked) => {
                        if (checked)
                          void select({ kind: "custom", id: stage.id });
                        else void select({ kind: "none" });
                      }}
                    />
                  </>
                )}
              </div>
            ))}
          </div>
        </details>
      </fieldset>
    </div>
  );
}

export default function StageSettings(props: {
  refreshTrigger?: number;
  onRequestDeleteStageDialog?: ((id: string) => void) | undefined;
}) {
  const uiConfig = useUIConfig();
  const { updateUIConfig } = useConfigUIActions();
  const { recreateScene } = useSceneActions();
  const backgroundKey = isAndroid ? "androidBackground" : "desktopBackground";
  return (
    <StageSelectionControls
      parallaxEnabled={uiConfig[backgroundKey].parallaxEnabled}
      shadowEnabled={uiConfig.enableAvatarShadow !== false}
      onParallaxChange={(value) =>
        updateUIConfig(backgroundKey + ".parallaxEnabled", value)
      }
      onShadowChange={(value) => updateUIConfig("enableAvatarShadow", value)}
      {...props}
      settings={uiConfig.stage ?? DefaultStageSettings}
      avatarEnabled={uiConfig.enableModelLoading}
      onSettingsChange={(settings) => updateUIConfig("stage", settings)}
      recreateScene={recreateScene}
    />
  );
}
