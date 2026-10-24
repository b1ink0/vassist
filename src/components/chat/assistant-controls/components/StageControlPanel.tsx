import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { Button, Card, Select } from "../../../ui";
import Icon from "../../../icons/Icon";
import {
  useUIConfig,
  useConfigUIActions,
} from "../../../../hooks/config/useConfigUI";
import {
  useSceneRef,
  useShowModelLoadingOverlay,
} from "../../../../hooks/app/useScene";
import {
  BUILT_IN_STAGES,
  DefaultStageOptions,
  getBuiltInStage,
  type StageOptions,
} from "../../../../config/stageConfig";
import { isAndroid, isDesktop } from "../../../../utils/PlatformUtils";
import { cn } from "../../../../utils/cn";
import {
  panelClassName,
  itemClassName,
  iconButtonClassName,
  panelButtonVariant,
} from "../panelStyles";
import type {
  AssistantControlActions,
  AssistantControlLayout,
  StoredStageItem,
} from "../types";

const formatTime = (hour: number) => {
  const minutes = Math.max(0, Math.min(1440, Math.round(hour * 60)));
  return (
    String(Math.floor(minutes / 60)).padStart(2, "0") +
    ":" +
    String(minutes % 60).padStart(2, "0")
  );
};
const seasonOptions = [
  { value: "auto", label: "Auto season" },
  { value: "spring", label: "Spring" },
  { value: "summer", label: "Summer" },
  { value: "autumn", label: "Autumn" },
  { value: "winter", label: "Winter" },
];

export function StageControlPanel({
  layout,
  stages,
  selectedStageId,
  isLightBackground,
  actions,
}: {
  layout: AssistantControlLayout;
  stages: StoredStageItem[];
  selectedStageId: string | null;
  isLightBackground: boolean;
  actions: AssistantControlActions;
}) {
  const config = useUIConfig();
  const { updateUIConfig } = useConfigUIActions();
  const sceneRef = useSceneRef();
  const loading = useShowModelLoadingOverlay();
  const id = selectedStageId?.replace(/^builtin:/, "") ?? null;
  const definition = selectedStageId?.startsWith("builtin:")
    ? getBuiltInStage(id!)
    : undefined;
  const saved = id ? config.stage?.options[id] : undefined;
  const [options, setOptions] = useState<StageOptions>({
    ...DefaultStageOptions,
    ...saved,
  });
  const draft = useRef(options);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [popup, setPopup] = useState<"time" | "brightness" | null>(null);
  const [now, setNow] = useState(() => new Date());
  const dialog = useRef<HTMLDialogElement>(null);
  const variant = panelButtonVariant(isLightBackground);
  const text = isLightBackground ? "glass-text" : "glass-text-black";
  const backgroundKey = isAndroid ? "androidBackground" : "desktopBackground";
  const background = config[backgroundKey];

  const flush = useCallback(() => {
    if (timer.current === null) return;
    clearTimeout(timer.current);
    timer.current = null;
    if (id) updateUIConfig("stage.options." + id, draft.current);
  }, [id, updateUIConfig]);
  useEffect(() => () => flush(), [flush]);
  useEffect(() => {
    if (!loading && id)
      sceneRef.current?.metadata?.updateStageOptions?.(draft.current);
  }, [loading, sceneRef, id]);
  useEffect(() => {
    if (timer.current !== null) return;
    const next = { ...DefaultStageOptions, ...saved };
    draft.current = next;
    setOptions(next);
  }, [saved]);
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    if (popup && dialog.current && !dialog.current.open)
      dialog.current.showModal();
  }, [popup]);

  const change = (patch: Partial<StageOptions>) => {
    draft.current = { ...draft.current, ...patch };
    setOptions(draft.current);
    sceneRef.current?.metadata?.updateStageOptions?.(patch);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 350);
  };
  const closePopup = () => {
    flush();
    setPopup(null);
  };
  const hour = options.localTime
    ? now.getHours() + now.getMinutes() / 60
    : options.hour;
  const angle = (hour / 24) * Math.PI * 2 - Math.PI / 2;
  const followsLocalTime = options.localTime && options.lightingMode !== "mood";
  const pickTime = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const angle = Math.atan2(
      event.clientY - rect.top - rect.height / 2,
      event.clientX - rect.left - rect.width / 2,
    );
    const hour =
      (((angle + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2)) *
      24;
    change({
      hour: Math.round(hour * 4) / 4,
      localTime: false,
      lightingMode: "time",
    });
  };
  const choices = [
    { id: null, name: "No Stage" },
    ...BUILT_IN_STAGES.map((stage) => ({
      id: "builtin:" + stage.id,
      name: stage.name,
    })),
    ...stages.map((stage) => ({ id: stage.id, name: stage.name })),
  ];
  const zIndex = isAndroid ? 201 : 10001;
  const iconButton = (
    icon: string,
    title: string,
    onClick: () => void,
    active?: boolean,
    disabled = false,
  ) => (
    <Button
      key={icon}
      variant={variant}
      className={cn(iconButtonClassName, active === false && "opacity-45")}
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={loading || disabled}
      onClick={onClick}
    >
      <Icon name={icon} size={16} className={text} />
    </Button>
  );
  const buttons = [
    ...(definition?.time
      ? [
          iconButton("clock", "Choose time of day", () => setPopup("time")),
          iconButton(
            "globe",
            "Use local time",
            () =>
              change({
                localTime: !followsLocalTime,
                hour: followsLocalTime ? hour : options.hour,
                lightingMode: "time",
              }),
            followsLocalTime,
          ),
        ]
      : []),
    iconButton(
      "parallax",
      id ? "Stage parallax" : "Background parallax",
      () =>
        updateUIConfig(
          backgroundKey + ".parallaxEnabled",
          !background.parallaxEnabled,
        ),
      background.parallaxEnabled,
    ),
    iconButton(
      "avatar-shadow",
      "Avatar shadow",
      () => {
        const value = config.enableAvatarShadow === false;
        sceneRef.current?.metadata?.setShadowsEnabled?.(value);
        updateUIConfig("enableAvatarShadow", value);
      },
      config.enableAvatarShadow !== false,
    ),
    ...(id && definition?.seasonalEffects !== false
      ? [
          iconButton(
            "sparkles",
            "Seasonal effects",
            () => change({ seasonalEffects: !options.seasonalEffects }),
            options.seasonalEffects,
          ),
        ]
      : []),
    ...(definition?.animated
      ? [
          iconButton(
            "play",
            "Animate environment",
            () => change({ animate: !options.animate }),
            options.animate,
          ),
        ]
      : []),
    ...(id
      ? [
          iconButton("sun", "Environment brightness", () =>
            setPopup("brightness"),
          ),
        ]
      : []),
    ...(definition?.moods
      ? [
          <Select
            key="lighting"
            value={options.lightingMode === "mood" ? options.mood : "time"}
            options={[
              { value: "time", label: "Time of day" },
              ...definition.moods,
            ]}
            disabled={loading}
            onChange={(e) =>
              change(
                e.target.value === "time"
                  ? { lightingMode: "time" }
                  : { lightingMode: "mood", mood: e.target.value },
              )
            }
            trigger={
              <Button
                variant={variant}
                className={iconButtonClassName}
                title="Lighting preset"
                aria-label="Lighting preset"
              >
                <Icon name="bulb" size={16} className={text} />
              </Button>
            }
          />,
        ]
      : []),
  ];

  return (
    <>
      <Card
        padding="none"
        variant="none"
        className={cn(
          panelClassName,
          isDesktop && choices.length > 7 && "vassist-scroll-panel-mask",
        )}
        style={{
          left: layout.stage.left,
          top: layout.stage.top,
          maxHeight: layout.stageMaxHeight,
          zIndex,
        }}
      >
        {choices.map((stage) => (
          <Button
            key={stage.id ?? "none"}
            variant={variant}
            className={cn(
              itemClassName,
              "justify-start px-3 text-[13px]",
              selectedStageId === stage.id && "ring-2 ring-white/50",
            )}
            aria-current={selectedStageId === stage.id ? "true" : undefined}
            title={stage.name}
            onClick={() => {
              flush();
              actions.onStageSelect(stage.id);
            }}
          >
            {selectedStageId === stage.id && (
              <Icon name="check" size={14} className="shrink-0" />
            )}
            <span className="min-w-0 flex-1 truncate">{stage.name}</span>
          </Button>
        ))}
      </Card>
      <Card
        padding="none"
        variant="none"
        className="fixed flex w-[135px] flex-col gap-1 p-1"
        style={{
          left: layout.stageControls.left,
          top: layout.stageControls.top,
          zIndex,
        }}
      >
        {id && (
          <Select
            value={options.season}
            options={seasonOptions}
            disabled={loading}
            onChange={(e) =>
              change({ season: e.target.value as StageOptions["season"] })
            }
            trigger={
              <Button
                variant={variant}
                className={cn(
                  itemClassName,
                  "mb-0 justify-center px-2 text-xs",
                )}
                title="Season"
                aria-label="Season"
              >
                <span className="truncate">
                  {
                    seasonOptions.find(
                      (season) => season.value === options.season,
                    )?.label
                  }
                </span>
                <Icon name="chevron-down" size={12} />
              </Button>
            }
          />
        )}
        {Array.from({ length: Math.ceil(buttons.length / 3) }, (_, row) => (
          <div key={row} className="flex w-[125px] justify-between gap-1">
            {buttons.slice(row * 3, row * 3 + 3)}
          </div>
        ))}
      </Card>
      {popup &&
        createPortal(
          <dialog
            ref={dialog}
            onCancel={closePopup}
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) closePopup();
            }}
            className="fixed inset-0 m-auto max-h-[calc(100dvh-20px)] max-w-[calc(100vw-20px)] overflow-visible border-0 bg-transparent p-0 backdrop:bg-transparent"
            aria-label={
              popup === "time" ? "Time of day" : "Environment brightness"
            }
          >
            {popup === "time" ? (
              <div
                role="slider"
                tabIndex={0}
                aria-label="Time of day"
                aria-valuemin={0}
                aria-valuemax={24}
                aria-valuenow={hour}
                aria-valuetext={formatTime(hour)}
                className={cn(
                  "relative h-[220px] w-[220px] touch-none select-none cursor-pointer rounded-full backdrop-blur-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/70",
                  "glass-button",
                  isLightBackground && "glass-button-dark",
                  text,
                )}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  pickTime(event);
                }}
                onPointerMove={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId))
                    pickTime(event);
                }}
                onPointerUp={closePopup}
                onPointerCancel={closePopup}
                onLostPointerCapture={flush}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    closePopup();
                    return;
                  }
                  const delta =
                    event.key === "ArrowLeft" || event.key === "ArrowDown"
                      ? -0.25
                      : event.key === "ArrowRight" || event.key === "ArrowUp"
                        ? 0.25
                        : 0;
                  if (delta) {
                    event.preventDefault();
                    change({
                      hour: (hour + delta + 24) % 24,
                      localTime: false,
                      lightingMode: "time",
                    });
                  }
                }}
              >
                <svg
                  viewBox="0 0 196 196"
                  className="h-full w-full"
                  aria-hidden="true"
                >
                  <circle
                    cx="98"
                    cy="98"
                    r="82"
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity=".15"
                    strokeWidth="14"
                  />
                  {Array.from({ length: 24 }, (_, i) => {
                    const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
                    return (
                      <line
                        key={i}
                        x1={98 + Math.cos(a) * 70}
                        y1={98 + Math.sin(a) * 70}
                        x2={98 + Math.cos(a) * (i % 6 === 0 ? 61 : 66)}
                        y2={98 + Math.sin(a) * (i % 6 === 0 ? 61 : 66)}
                        stroke="currentColor"
                        strokeOpacity=".5"
                      />
                    );
                  })}
                  <circle
                    cx={98 + Math.cos(angle) * 82}
                    cy={98 + Math.sin(angle) * 82}
                    r="8"
                    fill="currentColor"
                  />
                  <text
                    x="98"
                    y="18"
                    textAnchor="middle"
                    fill="currentColor"
                    fontSize="9"
                  >
                    00
                  </text>
                  <text
                    x="179"
                    y="101"
                    textAnchor="middle"
                    fill="currentColor"
                    fontSize="9"
                  >
                    06
                  </text>
                  <text
                    x="98"
                    y="183"
                    textAnchor="middle"
                    fill="currentColor"
                    fontSize="9"
                  >
                    12
                  </text>
                  <text
                    x="17"
                    y="101"
                    textAnchor="middle"
                    fill="currentColor"
                    fontSize="9"
                  >
                    18
                  </text>
                  <text
                    x="98"
                    y="104"
                    textAnchor="middle"
                    fill="currentColor"
                    fontSize="25"
                  >
                    {formatTime(hour)}
                  </text>
                </svg>
              </div>
            ) : (
              <div
                className={cn(
                  "glass-button flex w-[220px] items-center gap-3 rounded-full px-4 py-3 backdrop-blur-xl",
                  isLightBackground && "glass-button-dark",
                  text,
                )}
              >
                <Icon name="sun" size={16} />
                <input
                  aria-label="Environment brightness"
                  type="range"
                  min={0.35}
                  max={1.5}
                  step={0.05}
                  value={options.brightness}
                  onChange={(event) =>
                    change({ brightness: Number(event.target.value) })
                  }
                  onPointerUp={closePopup}
                  onBlur={flush}
                  className="min-w-0 flex-1 accent-current"
                />
                <span className="text-xs tabular-nums">
                  {Math.round(options.brightness * 100)}%
                </span>
              </div>
            )}
          </dialog>,
          document.body,
        )}
    </>
  );
}
