import { createStore } from "zustand/vanilla";
import { getDefaultAnimationsByCategory } from "../config/animationConfig";
import { motionStorageService } from "../services/MotionStorageService";
import { StorageServiceProxy } from "../services/proxies";
import Logger from "../services/LoggerService";

interface MotionItem {
  id: string;
  name: string;
  animationCategories?: string[];
  enabledByCategory?: Record<string, boolean>;
  metadata?: {
    fileSize?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface EnabledAnimation {
  id: string;
  name: string;
  filePath: string | null;
  isCustom: boolean;
  customMotionId?: string;
  loop?: boolean;
  loopTransition?: boolean;
  transitionFrames?: number;
  weight?: number;
  metadata?: Record<string, unknown>;
}

export interface AnimationStoreState {
  isLoading: boolean;
  configSaved: boolean;
  disabledDefaultAnimations: Record<string, boolean>;
  customAnimations: MotionItem[];
  getEnabledAnimations: (category: string) => EnabledAnimation[];
  getRandomAnimation: (category: string) => EnabledAnimation | null;
  toggleDefaultAnimation: (animationId: string, isEnabled: boolean) => void;
  toggleCustomAnimation: (
    motionId: string,
    category: string,
    isEnabled: boolean,
  ) => Promise<void>;
  reloadCustomAnimations: () => Promise<void>;
  hasEnabledAnimation: (category: string) => boolean;
  getEnabledCounts: (category: string) => {
    defaultCount: number;
    customCount: number;
    totalCount: number;
  };
}

export const createAnimationStore = () => {
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;
  let hasLoaded = false;

  const store = createStore<AnimationStoreState>((set, get) => {
    const scheduleSave = () => {
      if (!hasLoaded) {
        return;
      }

      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }

      saveTimeout = setTimeout(async () => {
        try {
          set({ configSaved: false });
          await StorageServiceProxy.configSave("animationConfig", {
            disabledDefaultAnimations: get().disabledDefaultAnimations,
          });
          set({ configSaved: true });
          Logger.log("AnimationStore", "Animation config auto-saved");

          setTimeout(() => {
            set({ configSaved: false });
          }, 2000);
        } catch (error) {
          Logger.error("AnimationStore", "Failed to save animation config:", error);
        }
      }, 500);
    };

    void (async () => {
      try {
        const config = (await StorageServiceProxy.configLoad(
          "animationConfig",
        )) as { disabledDefaultAnimations?: Record<string, boolean> } | null;
        const customs = await motionStorageService.getMotionsList();

        set({
          disabledDefaultAnimations: config?.disabledDefaultAnimations || {},
          customAnimations: customs,
          isLoading: false,
        });

        Logger.log(
          "AnimationStore",
          "Disabled animations config loaded:",
          config?.disabledDefaultAnimations,
        );
        Logger.log("AnimationStore", `Loaded ${customs.length} custom animations`);
      } catch (error) {
        Logger.error("AnimationStore", "Failed to load animation config:", error);
        set({ isLoading: false });
      } finally {
        hasLoaded = true;
      }
    })();

    return {
      isLoading: true,
      configSaved: false,
      disabledDefaultAnimations: {},
      customAnimations: [],
      getEnabledAnimations: (category) => {
        const defaultAnims = getDefaultAnimationsByCategory(category);
        const { disabledDefaultAnimations, customAnimations } = get();
        const enabledDefaults: EnabledAnimation[] = defaultAnims
          .filter((anim: { id: string }) => !disabledDefaultAnimations[anim.id])
          .map(
            (anim: {
              id: string;
              name: string;
              filePath: string;
              loop?: boolean;
              loopTransition?: boolean;
              transitionFrames?: number;
              weight?: number;
              metadata?: Record<string, unknown>;
            }) => ({
              id: anim.id,
              name: anim.name,
              filePath: anim.filePath,
              isCustom: false,
              loop: anim.loop ?? false,
              loopTransition: anim.loopTransition ?? false,
              transitionFrames: anim.transitionFrames ?? 30,
              weight: anim.weight ?? 1.0,
              metadata: anim.metadata ?? {},
            }),
          );

        const enabledCustom = customAnimations
          .filter(
            (motion) =>
              motion.animationCategories?.includes(category) &&
              motion.enabledByCategory?.[category] === true,
          )
          .map((motion) => ({
            id: motion.id,
            name: motion.name,
            filePath: null,
            isCustom: true,
            customMotionId: motion.id,
            loop: true,
            loopTransition: true,
            transitionFrames: 30,
            weight: 1.0,
            metadata: {
              ...motion.metadata,
              description: `Custom - ${(((motion.metadata?.fileSize as number | undefined) ?? 0) / 1024).toFixed(1)} KB`,
              tags: ["custom", category],
            },
          }));

        return [...enabledDefaults, ...enabledCustom];
      },
      getRandomAnimation: (category) => {
        const animations = get().getEnabledAnimations(category);
        if (animations.length === 0) {
          return null;
        }
        const randomIndex = Math.floor(Math.random() * animations.length);
        return animations[randomIndex] ?? null;
      },
      toggleDefaultAnimation: (animationId, isEnabled) => {
        const updated = { ...get().disabledDefaultAnimations };
        if (isEnabled) {
          delete updated[animationId];
        } else {
          updated[animationId] = true;
        }
        set({ disabledDefaultAnimations: updated });
        scheduleSave();
      },
      toggleCustomAnimation: async (motionId, category, isEnabled) => {
        try {
          const motion = get().customAnimations.find((item) => item.id === motionId);
          if (!motion) {
            throw new Error(`Motion ${motionId} not found`);
          }

          const updatedEnabledByCategory = {
            ...motion.enabledByCategory,
            [category]: isEnabled,
          };

          await motionStorageService.updateMotionMetadata(motionId, {
            enabledByCategory: updatedEnabledByCategory,
          });

          set({
            customAnimations: get().customAnimations.map((item) =>
              item.id === motionId
                ? {
                    ...item,
                    enabledByCategory: updatedEnabledByCategory,
                  }
                : item,
            ),
          });

          Logger.log(
            "AnimationStore",
            `Custom animation ${motionId} ${isEnabled ? "enabled" : "disabled"} for category ${category}`,
          );
        } catch (error) {
          Logger.error("AnimationStore", "Failed to toggle custom animation:", error);
          throw error;
        }
      },
      reloadCustomAnimations: async () => {
        try {
          const customs = await motionStorageService.getMotionsList();
          set({ customAnimations: customs });
          Logger.log(
            "AnimationStore",
            `Reloaded ${customs.length} custom animations`,
          );
        } catch (error) {
          Logger.error("AnimationStore", "Failed to reload custom animations:", error);
        }
      },
      hasEnabledAnimation: (category) => get().getEnabledAnimations(category).length > 0,
      getEnabledCounts: (category) => {
        const defaultAnims = getDefaultAnimationsByCategory(category);
        const { disabledDefaultAnimations, customAnimations } = get();
        const defaultCount = defaultAnims.filter(
          (anim: { id: string }) => !disabledDefaultAnimations[anim.id],
        ).length;
        const customCount = customAnimations.filter(
          (motion) =>
            motion.animationCategories?.includes(category) &&
            motion.enabledByCategory?.[category] === true,
        ).length;
        return {
          defaultCount,
          customCount,
          totalCount: defaultCount + customCount,
        };
      },
    };
  });

  return store;
};

export type AnimationStore = ReturnType<typeof createAnimationStore>;