import type {
  VAssistEmbedConfig,
  VAssistProviderBridge,
} from "../../embed/config";
import { setEmbedConfig } from "../../embed/runtimeStore";
import { RemoteStorageAdapter } from "../../storage/adapters/RemoteStorageAdapter";
import { normalizeUIConfig, useConfigStore } from "../../stores/useConfigStore";
import type { AppStore } from "../../stores/createAppStore";
import type { XrSceneSnapshot } from "../../types/xr";
import { XrConnection } from "./XrConnection";
import emotePlayerService from "../mmd/EmotePlayerService";
import type { XrRpcCall } from "../../types/xr";
import { getChatSession } from "../chat/ChatSessionRuntime";
import type { ChatSpeechChunk } from "../chat/ChatSessionRuntime";
import { TTSServiceProxy } from "../proxies";

export interface XrClientRuntime {
  config: VAssistEmbedConfig;
  attachStore: (store: AppStore) => void;
  disconnect: () => Promise<void>;
  action: (
    action: Extract<XrRpcCall, { kind: "action" }>["action"],
    args: unknown[],
  ) => Promise<unknown>;
  getPlaybackState: () => { autoPlay: boolean };
}
let preparation: Promise<XrClientRuntime | null> | undefined;
let activeRuntime: XrClientRuntime | null = null;
export const getXrClientRuntime = () => activeRuntime;
let connected = false;
export const isXrClientConnected = () => connected;

export function prepareXrClient(
  pairingUrl?: string,
): Promise<XrClientRuntime | null> {
  if (preparation) return preparation;
  const fragment = new URLSearchParams(
    (pairingUrl ? new URL(pairingUrl).hash : location.hash).slice(1),
  );
  if (!fragment.has("ticket") && !fragment.has("xrHost"))
    return Promise.resolve(null);
  preparation = connectClient(
    fragment.get("xrHost") ?? location.origin,
    fragment.get("ticket") ?? undefined,
  )
    .then((runtime) => {
      activeRuntime = runtime;
      return runtime;
    })
    .catch((reason: unknown) => {
      preparation = undefined;
      throw reason;
    });
  return preparation;
}

async function connectClient(
  origin: string,
  ticket?: string,
): Promise<XrClientRuntime> {
  const url = new URL(origin);
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("XR connections require an HTTP or HTTPS host.");
  let store: AppStore | null = null;
  const audioOwner = crypto.randomUUID();
  emotePlayerService.setAudioListener(audioOwner);
  let current: XrSceneSnapshot | null = null;
  let receivedAt = performance.now();
  let previous: XrSceneSnapshot | null = null;
  let applying = Promise.resolve();
  let playbackRevision = -1;
  let playbackScene: unknown;
  let activityScene: unknown;
  let activity: "busy" | "speaking" | "idle" | undefined;
  let applyingChat = false;
  let appliedChatRevision = -1;
  let speechEpoch = -1;
  let speechRevision = -1;
  const queuedSpeech = new Set<string>();
  const speechUrls = new Set<string>();
  const clearSpeech = () => {
    TTSServiceProxy.stopPlayback();
    for (const url of speechUrls) URL.revokeObjectURL(url);
    speechUrls.clear();
  };
  const speechUrl = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    speechUrls.add(url);
    return url;
  };
  let applyingUI = false;
  let uiDirty = false;
  let uiVersion = 0;
  let baseUI: Record<string, unknown> = {};
  const apply = () => {
    const snapshot = current;
    const snapshotReceivedAt = receivedAt;
    const appStore = store;
    if (!snapshot || !appStore || !useConfigStore.getState().hasHydrated)
      return;
    if (snapshot.chat && appliedChatRevision !== snapshot.chatRevision) {
      appliedChatRevision = snapshot.chatRevision ?? 0;
      applyingChat = true;
      getChatSession(appStore).apply(snapshot.chat);
      applyingChat = false;
    }
    applying = applying
      .then(async () => {
        if (current !== snapshot) return;
        const old = previous;
        previous = snapshot;
        const config = useConfigStore.getState();
        const stageChanged =
          JSON.stringify(config.uiConfig.stage) !==
          JSON.stringify(snapshot.stage);
        if (!uiDirty) {
          baseUI = structuredClone(snapshot.ui ?? {});
          applyingUI = true;
          useConfigStore.setState({
            uiConfig: normalizeUIConfig({
              ...config.uiConfig,
              ...snapshot.ui,
              stage: snapshot.stage,
            }),
          });
          applyingUI = false;
        }
        const app = appStore.getState();
        if (
          old &&
          (old.model.id !== snapshot.model.id ||
            JSON.stringify(old.model.visibility) !==
              JSON.stringify(snapshot.model.visibility) ||
            old.physics !== snapshot.physics ||
            old.physicsEngine !== snapshot.physicsEngine)
        ) {
          await app.sceneRef.current?.metadata?.exitXr?.();
          app.reloadScene();
        } else if (
          !uiDirty &&
          stageChanged &&
          app.sceneRef.current?.metadata?.replaceXrStage
        )
          await app.sceneRef.current.metadata.replaceXrStage(snapshot.stage);
        if (current !== snapshot) return;
        if (snapshot.speech && speechRevision !== snapshot.speech.revision) {
          if (
            speechEpoch !== snapshot.speech.epoch ||
            snapshot.speech.owner !== audioOwner
          ) {
            clearSpeech();
            queuedSpeech.clear();
            speechEpoch = snapshot.speech.epoch;
          }
          if (snapshot.speech.owner === audioOwner) {
            const output = (await connection.request(
              { kind: "action", action: "chat.audio" },
              [[...queuedSpeech]],
            )) as {
              owner: string;
              epoch: number;
              revision: number;
              chunks: ChatSpeechChunk[];
              complete: string[];
            };
            if (
              output.owner === audioOwner &&
              output.epoch === speechEpoch &&
              current?.speech?.epoch === output.epoch &&
              current.speech.owner === audioOwner
            ) {
              for (const chunk of output.chunks) {
                if (queuedSpeech.has(chunk.id)) continue;
                queuedSpeech.add(chunk.id);
                TTSServiceProxy.resumePlayback();
                TTSServiceProxy.queueAudio(
                  chunk.text,
                  speechUrl(chunk.audio),
                  chunk.bvmd ? speechUrl(chunk.bvmd) : null,
                  chunk.sessionId,
                );
              }
              for (const sessionId of output.complete)
                TTSServiceProxy.markSessionComplete(sessionId);
            }
          }
          speechRevision = snapshot.speech.revision;
        }
        const readyApp = appStore.getState();
        const assistant = readyApp.assistantRef.current;
        if (
          assistant?.isReady() &&
          snapshot.chat &&
          !snapshot.emoteId &&
          !TTSServiceProxy.isAudioActive()
        ) {
          const nextActivity =
            snapshot.chat.isSpeaking ||
            snapshot.chat.playingMessageIndex !== null
              ? "speaking"
              : snapshot.chat.isProcessing
                ? "busy"
                : "idle";
          if (
            activity !== nextActivity ||
            activityScene !== readyApp.sceneRef.current
          ) {
            activity = nextActivity;
            activityScene = readyApp.sceneRef.current;
            if (activity === "busy") await assistant.setState?.("BUSY");
            else if (activity === "speaking")
              await assistant.triggerAction("speak");
            else await assistant.idle();
          }
        }
        if (
          readyApp.isAssistantReady &&
          readyApp.sceneRef.current &&
          (playbackRevision !== (snapshot.emoteRevision ?? 0) ||
            playbackScene !== readyApp.sceneRef.current)
        ) {
          if (!snapshot.emoteId) emotePlayerService.stopEmote();
          else {
            if (emotePlayerService.getCurrentEmoteId() !== snapshot.emoteId)
              await emotePlayerService.playEmote(
                snapshot.emoteId,
                snapshot.emoteAudioOwner ?? "local",
              );
            emotePlayerService.setAudioOwner(
              snapshot.emoteAudioOwner ?? "local",
            );
            const duration = emotePlayerService.getPlaybackDuration();
            if (duration > 0 && snapshot.emotePositionSeconds !== undefined)
              emotePlayerService.seekToProgress(
                Math.max(
                  0,
                  Math.min(
                    1,
                    (snapshot.emotePositionSeconds +
                      (snapshot.emotePaused
                        ? 0
                        : (performance.now() - snapshotReceivedAt) / 1000)) /
                      duration,
                  ),
                ),
              );
            if (snapshot.emotePaused) emotePlayerService.pausePlayback();
            else if (emotePlayerService.isPlaybackPaused())
              emotePlayerService.resumePlayback();
          }
          playbackRevision = snapshot.emoteRevision ?? 0;
          playbackScene = readyApp.sceneRef.current;
        }
      })
      .catch((error: unknown) => {
        window.dispatchEvent(
          new CustomEvent("vassist:xr-connection-error", {
            detail: error instanceof Error ? error.message : String(error),
          }),
        );
      })
      .finally(() => {
        applyingChat = false;
        applyingUI = false;
      });
  };
  const connection = new XrConnection(
    (snapshot) => {
      current = snapshot;
      receivedAt = performance.now();
      apply();
    },
    (status) => {
      connected = status;
      if (!status) clearSpeech();
      window.dispatchEvent(
        new CustomEvent("vassist:xr-connection", {
          detail: { connected: status },
        }),
      );
    },
    url.origin,
  );
  await connection.connect(ticket);
  const provider = (
    service: "ai" | "tts" | "stt" | "decision",
    method: string,
    args: unknown[] = [],
  ) => connection.request({ kind: "provider", service, method }, args);
  let aiRequestActive = false;
  const bridge: VAssistProviderBridge = {
    ai: {
      configure: () => Promise.resolve(true),
      isConfigured: async () => (await provider("ai", "isConfigured")) === true,
      getCurrentProvider: async () =>
        (await provider("ai", "getCurrentProvider")) as string,
      sendMessage: async ({ messages, options, onStream, signal }) => {
        if (signal?.aborted)
          throw new DOMException("Request cancelled", "AbortError");
        if (aiRequestActive)
          throw new Error("Wait for the current response to finish.");
        aiRequestActive = true;
        const abort = () => {
          void provider("ai", "abortRequest").catch(() => undefined);
        };
        signal?.addEventListener("abort", abort, { once: true });
        try {
          const safeOptions = Object.fromEntries(
            Object.entries(options ?? {}).filter(
              ([key, value]) => typeof value !== "function" && key !== "signal",
            ),
          );
          const result = (await connection.request(
            { kind: "provider", service: "ai", method: "sendMessage" },
            [messages, safeOptions],
            (chunk) => {
              if (chunk.channel === "text") onStream?.(chunk.text);
              else if (typeof options?.onReasoning === "function")
                options.onReasoning(chunk.text);
            },
          )) as { success: boolean; response?: string; error?: string };
          return { ...result, response: result.response ?? "" };
        } finally {
          aiRequestActive = false;
          signal?.removeEventListener("abort", abort);
        }
      },
      abortRequest: async () =>
        aiRequestActive
          ? (await provider("ai", "abortRequest")) === true
          : false,
    },
    tts: {
      configure: () => Promise.resolve(true),
      isConfigured: async () =>
        (await provider("tts", "isConfigured")) === true,
      getCurrentProvider: async () =>
        (await provider("tts", "getCurrentProvider")) as string,
      generateSpeech: async ({ text, generateLipSync }) => {
        const result = (await provider("tts", "generateSpeech", [
          text,
          generateLipSync,
        ])) as {
          audio: ArrayBuffer | Blob;
          lipSync?: Blob;
          mimeType?: string;
        } | null;
        if (!result) return null;
        return {
          audio: result.audio,
          ...(result.lipSync
            ? { bvmdUrl: URL.createObjectURL(result.lipSync) }
            : {}),
          ...(result.mimeType ? { mimeType: result.mimeType } : {}),
        };
      },
    },
    stt: {
      configure: () => Promise.resolve(true),
      isConfigured: async () =>
        (await provider("stt", "isConfigured")) === true,
      transcribeAudio: async ({ audio, mimeType }) => {
        const blob =
          audio instanceof Blob
            ? audio
            : new Blob(
                [
                  audio instanceof ArrayBuffer
                    ? audio
                    : new Uint8Array(audio as number[]),
                ],
                { type: mimeType ?? "audio/webm" },
              );
        return (await provider("stt", "transcribeAudio", [blob])) as string;
      },
    },
  };
  const adapter = new RemoteStorageAdapter({
    request: async <T>(
      method: import("../../storage/adapters/RemoteStorageAdapter").RemoteStorageMethod,
      args: unknown[],
    ) => {
      const version = uiVersion;
      const saveUI =
        method === "set" && args[0] === "config" && args[1] === "uiConfig";
      let sentArgs = args;
      if (saveUI && args[2] && typeof args[2] === "object") {
        const value = args[2] as Record<string, unknown>;
        const changes = Object.fromEntries(
          Object.keys(baseUI)
            .filter(
              (key) =>
                JSON.stringify(value[key]) !== JSON.stringify(baseUI[key]),
            )
            .map((key) => [key, value[key]]),
        );
        sentArgs = [args[0], args[1], changes, ...args.slice(3)];
      }
      const result = (await connection.request(
        {
          kind: "storage",
          method,
        },
        sentArgs,
      )) as T;
      if (
        method === "get" &&
        args[0] === "config" &&
        args[1] === "uiConfig" &&
        result &&
        typeof result === "object"
      )
        baseUI = structuredClone(result) as Record<string, unknown>;
      if (
        method === "set" &&
        args[0] === "config" &&
        args[1] === "uiConfig" &&
        result !== false &&
        version === uiVersion
      ) {
        uiDirty = false;
        apply();
      }
      return result;
    },
  });
  const config: VAssistEmbedConfig = {
    features: { xr: true },
    setup: { mode: "hidden" },
    storage: { mode: "host", adapter },
    providers: { mode: "host-managed", lockProviderSelection: true },
    transport: { mode: "host-bridge", bridge },
    settings: {
      readOnlyTabs: ["llm", "tts", "stt", "ai-plus"],
      policy: { hidden: ["ui.storage"] },
    },
  };
  setEmbedConfig(config);
  const removeConfig = useConfigStore.subscribe((state, old) => {
    if (
      state.hasHydrated &&
      old.hasHydrated &&
      state.uiConfig !== old.uiConfig &&
      !applyingUI
    ) {
      uiDirty = true;
      uiVersion++;
    }
  });
  window.addEventListener(
    "pagehide",
    () => {
      removeConfig();
      removeHydration?.();
      removeApp?.();
      connection.dispose();
      clearSpeech();
    },
    {
      once: true,
    },
  );
  let removeHydration: (() => void) | undefined;
  let removeApp: (() => void) | undefined;
  return {
    config,
    attachStore: (next) => {
      removeHydration?.();
      removeApp?.();
      store = next;
      const session = getChatSession(next);
      session.connect(async (command) => {
        if (["stop", "new", "select"].includes(command.type)) clearSpeech();
        await connection.request({ kind: "action", action: "chat.command" }, [
          command,
          audioOwner,
        ]);
      });
      next.setState({
        clearChat: () => session.execute({ type: "new" }),
        setIsTempChat: (update) => {
          const enabled =
            typeof update === "function"
              ? update(next.getState().isTempChat)
              : update;
          void session.execute({ type: "temporary", enabled });
        },
        loadChatFromHistory: ({ chatId }) =>
          session.execute({ type: "select", chatId }),
        stopGeneration: () => {
          void session.execute({ type: "stop" });
        },
        editUserMessage: (messageId, text) =>
          session.execute({ type: "edit", messageId, text }),
        regenerateAIMessage: (messageId) =>
          session.execute({ type: "regenerate", messageId }),
        previousBranch: (messageId) => {
          void session.execute({ type: "previous", messageId });
        },
        nextBranch: (messageId) => {
          void session.execute({ type: "next", messageId });
        },
        switchToBranch: (parentId, index) => {
          void session.execute({ type: "branch", parentId, index });
        },
      });
      removeApp = next.subscribe((state, old) => {
        if (
          !applyingChat &&
          current?.speech?.owner === audioOwner &&
          (state.playingMessageIndex !== old.playingMessageIndex ||
            state.loadingMessageIndex !== old.loadingMessageIndex ||
            state.isSpeaking !== old.isSpeaking)
        )
          void connection
            .request({ kind: "action", action: "chat.playback" }, [
              {
                playing: state.playingMessageIndex,
                loading: state.loadingMessageIndex,
                speaking: state.isSpeaking,
                epoch: current.speech.epoch,
              },
              audioOwner,
            ])
            .catch(() => undefined);
        if (
          (state.isAssistantReady && !old.isAssistantReady) ||
          (!state.isProcessing && old.isProcessing)
        )
          apply();
      });
      apply();
      if (useConfigStore.getState().hasHydrated) return;
      removeHydration = useConfigStore.subscribe((state, old) => {
        if (state.hasHydrated && !old.hasHydrated) {
          apply();
          removeHydration?.();
          removeHydration = undefined;
        }
      });
    },
    disconnect: () => connection.disconnect(),
    action: (action, args) =>
      connection.request(
        { kind: "action", action },
        action === "emote.play" || action === "emote.autoplay.start"
          ? [...args, audioOwner]
          : args,
      ),
    getPlaybackState: () => ({ autoPlay: current?.emoteAutoPlay === true }),
  };
}
