export interface BuiltInBackground {
  id: string;
  title: string;
  description: string;
  preview: string;
}

export const BUILT_IN_BACKGROUNDS: BuiltInBackground[] = [
  {
    id: "night-fence",
    title: "Dark stars and fence",
    description: "A quiet night sky",
    preview: "night-fence.webp",
  },
  {
    id: "milky-way",
    title: "Blue Milky Way",
    description: "A colorful view of the night sky",
    preview: "milky-way.webp",
  },
  {
    id: "aurora-homes",
    title: "Aurora and houses",
    description: "Northern lights over a mountain village",
    preview: "aurora-homes.webp",
  },
  {
    id: "fog-cabin",
    title: "Woodland cabin",
    description: "A foggy forest at night",
    preview: "fog-cabin.webp",
  },
  {
    id: "city-night",
    title: "City after dark",
    description: "A city with evening light trails",
    preview: "city-night.webp",
  },
  {
    id: "soft-lights",
    title: "Soft coloured lights",
    description: "An abstract bokeh photograph",
    preview: "soft-lights.webp",
  },
];

export const DEFAULT_BUILT_IN_BACKGROUND_IDS = ["milky-way"];

export const isBuiltInBackgroundId = (id: string): boolean =>
  BUILT_IN_BACKGROUNDS.some((background) => background.id === id);

export const getBuiltInBackgroundPreviewUrl = (id: string): string => {
  const background = BUILT_IN_BACKGROUNDS.find((item) => item.id === id);
  if (!background || typeof window === "undefined") return "";
  return new URL(
    `../res/assets/backgrounds/${background.preview}`,
    window.location.href,
  ).href;
};
