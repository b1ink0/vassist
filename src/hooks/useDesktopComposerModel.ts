import { useCallback, useEffect, useRef, useState } from "react";
import {
  AIProviderSections,
  getAIProviderSection,
  isAIProvider,
  isRemoteAIProvider,
  thinkingEffortOptions,
  type AIProvider,
  type AIRemoteProviderProfile,
} from "../config/aiConfig";
import { readContextUsage, type ContextUsage } from "../types/contextUsage";
import { isInputWindow } from "../utils/PlatformUtils";
import { useDesktopApi } from "./useDesktopStore";

type ModelSelection = Pick<
  AIRemoteProviderProfile,
  "model" | "thinkingEnabled" | "thinkingEffort" | "contextSize"
> & { selectedBackendProfileId: string };
type ModelState = {
  provider: AIProvider;
  sections: Partial<
    Record<(typeof AIProviderSections)[number], ModelSelection>
  >;
  profiles: Pick<AIRemoteProviderProfile, "id" | "name" | "provider">[];
  contextUsage?: ContextUsage | undefined;
  connectionRevision: number;
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object";

/** The separate input receives public selections, never a replacement credential/config store. */
export function useDesktopComposerModel(fallbackProvider: string) {
  const api = useDesktopApi();
  const [state, setState] = useState<ModelState>();
  const requests = useRef(new Set<() => void>());
  const counter = useRef(0);
  const [requestScope] = useState(() =>
    isInputWindow ? crypto.randomUUID() : "",
  );
  useEffect(() => {
    if (!isInputWindow || !api?.ipc) return;
    const unsubscribe = api.ipc.on("state:chatModel", (payload: unknown) => {
      if (
        !isRecord(payload) ||
        !isAIProvider(payload.provider) ||
        !isRecord(payload.sections) ||
        !Array.isArray(payload.profiles)
      )
        return;
      const sections: ModelState["sections"] = {};
      for (const key of AIProviderSections) {
        const item = payload.sections[key];
        if (!isRecord(item)) continue;
        const effort = thinkingEffortOptions.find(
          (option) => option.value === item.thinkingEffort,
        )?.value;
        sections[key] = {
          model: typeof item.model === "string" ? item.model : "",
          ...(typeof item.contextSize === "number" &&
          Number.isSafeInteger(item.contextSize) &&
          item.contextSize > 0
            ? { contextSize: item.contextSize }
            : {}),
          thinkingEnabled: item.thinkingEnabled === true,
          ...(effort ? { thinkingEffort: effort } : {}),
          selectedBackendProfileId:
            typeof item.selectedBackendProfileId === "string"
              ? item.selectedBackendProfileId
              : "",
        };
      }
      const profiles: ModelState["profiles"] = [];
      for (const profile of payload.profiles) {
        if (
          isRecord(profile) &&
          typeof profile.id === "string" &&
          typeof profile.name === "string" &&
          isRemoteAIProvider(profile.provider)
        )
          profiles.push({
            id: profile.id,
            name: profile.name,
            provider: profile.provider,
          });
      }
      setState({
        provider: payload.provider,
        sections,
        profiles,
        contextUsage: readContextUsage(payload.contextUsage),
        connectionRevision:
          typeof payload.connectionRevision === "number" &&
          Number.isSafeInteger(payload.connectionRevision)
            ? payload.connectionRevision
            : 0,
      });
    });
    api.ipc.send("chatInput:requestModelState");
    return () => {
      unsubscribe?.();
      for (const cancel of requests.current) cancel();
    };
  }, [api]);
  const provider = state?.provider ?? fallbackProvider;
  const backend =
    state?.sections[getAIProviderSection(provider)]?.selectedBackendProfileId ??
    "";
  const connectionRevision = state?.connectionRevision ?? 0;
  const loadModels = useCallback(
    () =>
      new Promise<{ models: string[]; error?: string }>((resolve) => {
        const ipc = api?.ipc;
        if (!ipc) {
          resolve({ models: [], error: "Model search unavailable" });
          return;
        }
        const id = requestScope + "-" + ++counter.current;
        const finish = (result: { models: string[]; error?: string }) => {
          clearTimeout(timer);
          unsubscribe?.();
          requests.current.delete(cancel);
          resolve(result);
        };
        const cancel = () =>
          finish({ models: [], error: "Model search cancelled" });
        const timer = setTimeout(
          () => finish({ models: [], error: "Model search timed out" }),
          30000,
        );
        requests.current.add(cancel);
        const unsubscribe = ipc.on("state:chatModelList", (result: unknown) => {
          if (
            !isRecord(result) ||
            result.id !== id ||
            result.provider !== provider
          )
            return;
          finish({
            models: Array.isArray(result.models)
              ? result.models.filter(
                  (model): model is string => typeof model === "string",
                )
              : [],
            ...(typeof result.error === "string"
              ? { error: result.error }
              : {}),
          });
        });
        ipc.send("chatInput:listModels", {
          id,
          provider,
          backend,
          connectionRevision,
        });
      }),
    [api, provider, backend, connectionRevision, requestScope],
  );
  const select = (path: string, value: string | boolean | undefined) =>
    api?.ipc?.send("chatInput:modelSelection", { path, value });
  const openContextSettings = () =>
    api?.ipc?.send("chatInput:openContextSettings");
  return { state, loadModels, select, openContextSettings };
}
