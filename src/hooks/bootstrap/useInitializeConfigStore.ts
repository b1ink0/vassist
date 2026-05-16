import { useEffect, useRef } from "react";
import { TTSProviders } from "../../config/aiConfig";
import Logger from "../../services/LoggerService";
import { TTSServiceProxy } from "../../services/proxies";
import { useConfigStore } from "../../stores/useConfigStore";

export function useInitializeConfigStore() {
  const startedRef = useRef(false);
  const hydrateConfigStore = useConfigStore((state) => state.hydrateConfigStore);
  const hasHydrated = useConfigStore((state) => state.hasHydrated);
  const ttsEnabled = useConfigStore((state) => state.ttsConfig.enabled);
  const ttsProvider = useConfigStore((state) => state.ttsConfig.provider);
  const keepModelLoaded = useConfigStore(
    (state) => state.ttsConfig.kokoro?.keepModelLoaded,
  );

  useEffect(() => {
    if (startedRef.current) {
      return;
    }

    startedRef.current = true;
    void hydrateConfigStore();
  }, [hydrateConfigStore]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    if (
      !ttsEnabled ||
      ttsProvider !== TTSProviders.KOKORO ||
      keepModelLoaded === false
    ) {
      return;
    }

    let cancelled = false;

    const checkAndAutoInit = async () => {
      try {
        Logger.log("ConfigBootstrap", "Pre-initializing Kokoro before scene loads...");
        useConfigStore.setState((state) => ({
          kokoroStatus: {
            ...state.kokoroStatus,
            preInitializing: true,
          },
        }));

        const status = await TTSServiceProxy.checkKokoroStatus();
        const kokoroStatus =
          status && typeof status === "object"
            ? (status as { initialized?: boolean; initializing?: boolean })
            : {};

        if (!kokoroStatus.initialized && !kokoroStatus.initializing) {
          Logger.log("ConfigBootstrap", "Initializing Kokoro model...");
          await useConfigStore.getState().initializeKokoro();
          Logger.log("ConfigBootstrap", "Kokoro initialization complete with warmup");
        } else if (kokoroStatus.initialized) {
          Logger.log(
            "ConfigBootstrap",
            "Kokoro already initialized, doing warmup ping...",
          );
          try {
            await TTSServiceProxy.pingKokoro();
          } catch (pingError) {
            Logger.warn("ConfigBootstrap", "Warmup ping failed:", pingError);
          }
        }
      } catch (error) {
        Logger.error("ConfigBootstrap", "Kokoro pre-initialization failed:", error);
      } finally {
        if (!cancelled) {
          useConfigStore.setState((state) => ({
            kokoroStatus: {
              ...state.kokoroStatus,
              preInitializing: false,
            },
          }));
        }
      }
    };

    void checkAndAutoInit();

    return () => {
      cancelled = true;
    };
  }, [hasHydrated, keepModelLoaded, ttsEnabled, ttsProvider]);
}
