export const QUIET_STAGE_IDS = [
  "ink",
  "paper",
  "slate",
  "dusk",
  "stillwater",
  "pebble",
] as const;
export type QuietStageId = (typeof QUIET_STAGE_IDS)[number];
export type StageSeason = "spring" | "summer" | "autumn" | "winter";
export type StageSeasonSetting = "auto" | StageSeason;
export const getStageSeasonForDate = (date: Date): StageSeason => {
  const month = date.getMonth();
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 7) return "summer";
  if (month >= 8 && month <= 10) return "autumn";
  return "winter";
};
export type BuiltInStageId =
  | QuietStageId
  | "aster-observatory"
  | "moss-house"
  | "rainlight-library";
export type StageFormat = "bpmx" | "glb" | "babylon";
export type StageSelection =
  | { kind: "builtin"; id: BuiltInStageId }
  | { kind: "custom"; id: string }
  | { kind: "none" };

export interface StageOptions {
  mood: string;
  hour: number;
  localTime: boolean;
  season: StageSeasonSetting;
  seasonalEffects: boolean;
  brightness: number;
  animate: boolean;
  lightingMode?: "time" | "mood";
}

export interface StageCalibration {
  heightMeters: number;
  floorOffset: number;
}

export interface StageSettings {
  selection: StageSelection | null;
  options: Record<string, Partial<StageOptions>>;
  calibration: Record<string, StageCalibration>;
}

export const DefaultStageSettings: StageSettings = {
  selection: null,
  options: {},
  calibration: {},
};
export const DefaultStageOptions: StageOptions = {
  mood: "",
  hour: 15.5,
  localTime: true,
  season: "auto",
  seasonalEffects: true,
  brightness: 1,
  animate: true,
};
export const DefaultStageCalibration: StageCalibration = {
  heightMeters: 1.65,
  floorOffset: 0,
};

export interface BuiltInStage {
  id: BuiltInStageId;
  name: string;
  description: string;
  moods?: { value: string; label: string }[];
  time?: boolean;
  animated?: boolean;
  seasons?: boolean;
  seasonalEffects?: boolean;
}

export const BUILT_IN_STAGES: BuiltInStage[] = [
  {
    id: "ink",
    name: "Ink",
    description: "Dark seamless studio",
    time: true,
    animated: true,
    seasons: true,
  },
  {
    id: "paper",
    name: "Paper",
    description: "Warm light studio",
    time: true,
    seasons: true,
  },
  {
    id: "slate",
    name: "Slate",
    description: "Cool stone studio with a circular plinth",
    time: true,
    animated: true,
    seasons: true,
  },
  {
    id: "dusk",
    name: "Dusk",
    description: "Violet twilight and a warm open horizon",
    time: true,
    animated: true,
    seasons: true,
  },
  {
    id: "stillwater",
    name: "Stillwater",
    description: "Deep blue water beneath an open night sky",
    time: true,
    animated: true,
    seasons: true,
  },
  {
    id: "pebble",
    name: "Pebble",
    description: "Warm sandstone with a rounded base",
    time: true,
    animated: true,
    seasons: true,
  },
  {
    id: "aster-observatory",
    name: "Aster Observatory",
    description: "An observatory overlooking a quiet planet",
    animated: true,
    time: true,
    seasons: true,
    seasonalEffects: false,
    moods: [
      { value: "dawn", label: "Dawn" },
      { value: "deep-orbit", label: "Deep Orbit" },
      { value: "quiet-amber", label: "Quiet Amber" },
    ],
  },
  {
    id: "moss-house",
    name: "Moss House",
    description: "A garden room with daylight and evening lighting",
    time: true,
    seasons: true,
  },
  {
    id: "rainlight-library",
    name: "Rainlight Library",
    description: "A reading room with rain and a fireplace",
    animated: true,
    time: true,
    seasons: true,
    moods: [
      { value: "evening", label: "Evening" },
      { value: "rainy", label: "Rainy Evening" },
      { value: "embers", label: "Late Embers" },
    ],
  },
];

export const getBuiltInStage = (id: string): BuiltInStage | undefined =>
  BUILT_IN_STAGES.find((stage) => stage.id === id);
