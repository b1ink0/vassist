import StorageServiceProxy from "../proxies/StorageServiceProxy";
import { AIServiceProxy, TTSServiceProxy, STTServiceProxy } from "../proxies";
import {
  DefaultAIConfig,
  DefaultTTSConfig,
  DefaultSTTConfig,
} from "../../config/aiConfig";
import { normalizeUIConfig, useConfigStore } from "../../stores/useConfigStore";
import { DefaultUIConfig, type UIConfig } from "../../config/uiConfig";
import type { AppStore } from "../../stores/createAppStore";
import type { XrRpcCall, XrStreamChunk } from "../../types/xr";
import emotePlayerService from "../mmd/EmotePlayerService";
import { modelStorageService } from "../storage/ModelStorageService";
import { getChatSession, type ChatCommand } from "../chat/ChatSessionRuntime";

const UI_KEYS = [
  "stage",
  "camera",
  "enableModelLoading",
  "enablePortraitMode",
  "enableAvatarShadow",
  "enablePhysics",
  "physicsEngine",
  "renderQuality",
  "customQuality",
  "fpsLimit",
  "stickerBorder",
  "emotePlayback",
  "smoothStreamingAnimation",
  "animateStreamingText",
  "modelSizePx",
  "position",
  "enableColoredIcons",
  "enableColoredIconsToolbarOnly",
  "backgroundDetection",
  "thinkingPanelAutoExpand",
] as const;
const FILE_CATEGORIES = ["model", "stage", "motion", "emote", "voice"] as const;
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected an XR data record.");
  return value as Record<string, unknown>;
};
export const projectXrUI = (ui: UIConfig): Partial<UIConfig> =>
  ({
    ...Object.fromEntries(
      UI_KEYS.map((key) => [key, structuredClone(ui[key])]),
    ),
    xr: {
      browser: "default",
      forceOpenXR: false,
      handTracking: ui.xr.handTracking === true,
      panels: structuredClone(ui.xr.panels ?? {}),
      environments: structuredClone(ui.xr.environments ?? {}),
    },
    desktopBackground: {
      ...DefaultUIConfig.desktopBackground,
      parallaxEnabled: ui.desktopBackground.parallaxEnabled,
    },
  }) as Partial<UIConfig>;

/** Restricted operations for a browser explicitly paired by the desktop owner. */
export class DesktopXrRepository {
  private aiBusy = false;
  private selectionQueue = Promise.resolve<unknown>(undefined);
  waitForSelection(): Promise<unknown> {
    return this.selectionQueue;
  }
  constructor(private readonly store: AppStore) {}

  async execute(
    call: XrRpcCall,
    args: unknown[],
    onStream?: (chunk: XrStreamChunk) => void,
  ): Promise<unknown> {
    if (call.kind === "action") {
      if (call.action === "chat.audio") {
        const output = getChatSession(this.store).speechOutput();
        const known = new Set(
          Array.isArray(args[0])
            ? args[0].filter((id) => typeof id === "string")
            : [],
        );
        return {
          ...output,
          chunks: output.chunks.filter((chunk) => !known.has(chunk.id)),
        };
      }
      if (call.action === "chat.playback") {
        const playback = record(args[0]);
        if (
          typeof args[1] !== "string" ||
          typeof playback.speaking !== "boolean" ||
          ![playback.playing, playback.loading].every(
            (value) =>
              value === null || (Number.isInteger(value) && Number(value) >= 0),
          )
        )
          throw new Error("Invalid speech playback state.");
        getChatSession(this.store).updatePlayback(
          args[1],
          Number(playback.epoch),
          playback.playing as number | null,
          playback.loading as number | null,
          playback.speaking,
        );
        return true;
      }
      if (call.action === "chat.command") {
        const command = record(args[0]);
        if (
          ![
            "send",
            "new",
            "select",
            "stop",
            "speak",
            "temporary",
            "edit",
            "regenerate",
            "previous",
            "next",
            "branch",
          ].includes(String(command.type))
        )
          throw new Error("Invalid chat command.");
        if (
          ["send", "edit"].includes(String(command.type)) &&
          typeof command.text !== "string"
        )
          throw new Error("Chat text is required.");
        if (
          ["speak", "edit", "regenerate", "previous", "next"].includes(
            String(command.type),
          ) &&
          typeof command.messageId !== "string"
        )
          throw new Error("A message is required.");
        if (command.type === "select" && typeof command.chatId !== "string")
          throw new Error("A conversation is required.");
        if (
          command.type === "temporary" &&
          typeof command.enabled !== "boolean"
        )
          throw new Error("Invalid temporary conversation state.");
        if (
          command.type === "branch" &&
          (typeof command.parentId !== "string" ||
            !Number.isInteger(command.index))
        )
          throw new Error("Invalid conversation branch.");
        for (const field of ["images", "audios"])
          if (
            command[field] != null &&
            (!Array.isArray(command[field]) ||
              !(command[field] as unknown[]).every(
                (value) => typeof value === "string",
              ))
          )
            throw new Error("Invalid chat attachments.");
        await getChatSession(this.store).execute(
          command as ChatCommand,
          typeof args[1] === "string" ? args[1] : "local",
        );
        return true;
      }
      if (
        call.action === "model.select" &&
        (args[0] === null || typeof args[0] === "string")
      ) {
        const id = args[0];
        const task = this.selectionQueue.then(async () => {
          if (id === null) await modelStorageService.clearAllDefaults();
          else await modelStorageService.setDefaultModel(id);
          this.store.getState().reloadScene();
          return true;
        });
        this.selectionQueue = task.catch(() => undefined);
        return task;
      }
      if (call.action === "emote.play" && typeof args[0] === "string") {
        await emotePlayerService.playEmote(
          args[0],
          typeof args[1] === "string" ? args[1] : "local",
        );
        return true;
      }
      if (call.action === "emote.stop") {
        emotePlayerService.stopEmote();
        return true;
      }
      if (call.action === "emote.autoplay.stop") {
        emotePlayerService.stopAutoPlay();
        return true;
      }
      if (
        call.action === "emote.autoplay.start" &&
        Array.isArray(args[0]) &&
        args[0].length > 0 &&
        args[0].length <= 500 &&
        args[0].every((id) => typeof id === "string" && id.length <= 200)
      ) {
        await emotePlayerService.startAutoPlay(
          args[0],
          typeof args[1] === "string" ? args[1] : "local",
        );
        return true;
      }
      if (
        call.action === "emote.seek" &&
        typeof args[0] === "number" &&
        Number.isFinite(args[0])
      ) {
        emotePlayerService.seekToProgress(Math.max(0, Math.min(1, args[0])));
        return true;
      }
      throw new Error("Unsupported XR action.");
    }
    if (call.kind === "provider")
      return this.provider(call.service, call.method, args, onStream);
    if (call.kind !== "storage") throw new Error("Unsupported XR request.");
    const [table, key, value, metadata] = args;
    const method = call.method;
    if (method === "isDatabaseReady") return true;
    if (method === "getStats") return {};
    if (method === "cleanupExpiredCache") return 0;
    if (
      !["config", "files", "chat", "data", "settings", "cache"].includes(
        String(table),
      )
    )
      throw new Error("This repository is not shared with XR.");
    if (method === "getMultiple") {
      if (!Array.isArray(key) || key.length > 200)
        throw new Error("Invalid XR batch.");
      const output: Record<string, unknown> = {};
      for (const item of key)
        output[String(item)] = await this.execute({ ...call, method: "get" }, [
          table,
          item,
        ]);
      return output;
    }
    if (method === "setMultiple") {
      const items = Object.entries(record(key));
      if (items.length > 200) throw new Error("Invalid XR batch.");
      for (const [item, entry] of items)
        await this.execute({ ...call, method: "set" }, [table, item, entry]);
      return true;
    }
    if (table === "config") {
      if (typeof key !== "string")
        throw new Error("Configuration enumeration is not available in XR.");
      const state = useConfigStore.getState();
      const read = () => {
        switch (key) {
          case "uiConfig":
            return projectXrUI(state.uiConfig);
          case "aiConfig":
            return { ...DefaultAIConfig, provider: state.aiConfig.provider };
          case "ttsConfig":
            return {
              ...DefaultTTSConfig,
              enabled: state.ttsConfig.enabled,
              provider: state.ttsConfig.provider,
              accurateLipSync: state.ttsConfig.accurateLipSync,
              legacyLipSync: state.ttsConfig.legacyLipSync,
            };
          case "sttConfig":
            return {
              ...DefaultSTTConfig,
              enabled: state.sttConfig.enabled,
              provider: state.sttConfig.provider,
            };
          case "setupState":
            return {
              setupCompleted: true,
              currentStep: 1,
              completedSteps: [],
              setupData: {},
            };
          default:
            return undefined;
        }
      };
      if (method === "get") return read();
      if (method === "getRecord") return { key, value: read() };
      if (method === "exists") return read() !== undefined;
      if (method === "set" && key === "uiConfig") {
        const changes = record(value);
        if (
          changes.desktopBackground &&
          typeof record(changes.desktopBackground).parallaxEnabled === "boolean"
        )
          state.updateUIConfig(
            "desktopBackground.parallaxEnabled",
            record(changes.desktopBackground).parallaxEnabled,
          );
        const sceneChanged = [
          "enablePhysics",
          "physicsEngine",
          "renderQuality",
          "customQuality",
        ].some(
          (field) =>
            field in changes &&
            JSON.stringify(changes[field]) !==
              JSON.stringify(state.uiConfig[field as keyof UIConfig]),
        );
        if (changes.xr) {
          const xr = record(changes.xr);
          if (xr.environments) {
            const poses = record(xr.environments);
            if (Object.keys(poses).length > 100)
              throw new Error("Too many XR environment placements.");
            for (const [id, raw] of Object.entries(poses)) {
              const pose = record(raw);
              if (
                !/^(builtin|custom):[a-zA-Z0-9_-]{1,200}$/.test(id) ||
                !Array.isArray(pose.position) ||
                pose.position.length !== 3 ||
                ![...pose.position, pose.yaw, pose.scale].every(
                  (n) =>
                    typeof n === "number" &&
                    Number.isFinite(n) &&
                    Math.abs(n) < 10000,
                ) ||
                Number(pose.scale) < 0.25 ||
                Number(pose.scale) > 4
              )
                throw new Error("Invalid XR environment placement.");
            }
            state.updateUIConfig("xr.environments", poses);
          }
          if (typeof xr.handTracking === "boolean")
            state.updateUIConfig("xr.handTracking", xr.handTracking);
          if (xr.panels && typeof xr.panels === "object") {
            const panels = record(xr.panels);
            if (Object.keys(panels).length > 32)
              throw new Error("Too many XR panels.");
            for (const [id, rawPose] of Object.entries(panels)) {
              const pose = record(rawPose);
              if (
                !/^[a-zA-Z0-9_-]{1,64}$/.test(id) ||
                !["follow", "world", "hand"].includes(String(pose.anchor)) ||
                !Array.isArray(pose.position) ||
                pose.position.length !== 3 ||
                ![...pose.position, pose.yaw].every(
                  (item) =>
                    typeof item === "number" &&
                    Number.isFinite(item) &&
                    Math.abs(item) < 10000,
                )
              )
                throw new Error("Invalid XR panel placement.");
            }
            state.updateUIConfig("xr.panels", panels);
          }
        }
        const oldStage = state.uiConfig.stage;
        const permitted = Object.fromEntries(
          UI_KEYS.filter((field) => field in changes).map((field) => [
            field,
            changes[field],
          ]),
        );
        const normalized = normalizeUIConfig({
          ...state.uiConfig,
          ...permitted,
        });
        for (const field of UI_KEYS)
          if (field in permitted)
            state.updateUIConfig(field, normalized[field]);
        await useConfigStore.getState().saveUIConfig();
        const stage = useConfigStore.getState().uiConfig.stage;
        if (
          sceneChanged ||
          JSON.stringify(oldStage.calibration) !==
            JSON.stringify(stage.calibration) ||
          JSON.stringify(oldStage.selection) !== JSON.stringify(stage.selection)
        )
          this.store.getState().recreateScene();
        else if (
          stage.selection?.kind === "builtin" ||
          stage.selection?.kind === "custom"
        )
          this.store
            .getState()
            .sceneRef.current?.metadata?.updateStageOptions?.(
              stage.options[stage.selection.id] ?? {},
            );
        return true;
      }
      throw new Error(
        "Provider credentials and desktop configuration are managed by the connected VAssist app.",
      );
    }
    if (table === "files") {
      if (["query", "queryMetadata", "getAll", "count"].includes(method)) {
        const filter =
          method === "query" || method === "queryMetadata" ? record(key) : {};
        const categories =
          filter.category === undefined
            ? FILE_CATEGORIES
            : FILE_CATEGORIES.filter(
                (category) => category === filter.category,
              );
        if (!categories.length)
          throw new Error("This library is not shared with XR.");
        const records: Record<string, unknown>[] = [];
        for (const category of categories) {
          const entries = record(
            await (method === "queryMetadata"
              ? StorageServiceProxy.filesGetMetadataByCategory(category)
              : StorageServiceProxy.filesGetByCategory(category)),
          );
          for (const [fileId, entry] of Object.entries(entries))
            records.push(
              method === "queryMetadata"
                ? { ...record(entry), fileId, category }
                : { fileId, category, value: entry },
            );
        }
        return method === "count" ? records.length : records;
      }
      if (typeof key !== "string" || key.length > 200)
        throw new Error("Invalid XR library ID.");
      let category: string | undefined;
      for (const candidate of FILE_CATEGORIES) {
        const entries = record(
          await StorageServiceProxy.filesGetMetadataByCategory(candidate),
        );
        if (Object.hasOwn(entries, key)) {
          category = candidate;
          break;
        }
      }
      if (!category && method === "set") {
        const candidate = record(metadata).category;
        if (FILE_CATEGORIES.some((item) => item === candidate))
          category = String(candidate);
      }
      if (!category) {
        if (["get", "getRecord"].includes(method)) return undefined;
        if (method === "exists") return false;
        throw new Error("Unknown XR library entry.");
      }
      if (method === "get") return StorageServiceProxy.fileLoad(key);
      if (method === "getRecord")
        return {
          fileId: key,
          category,
          value: await StorageServiceProxy.fileLoad(key),
        };
      if (method === "exists") return StorageServiceProxy.fileExists(key);
      if (method === "set")
        return StorageServiceProxy.fileSave(key, value, category);
      if (method === "remove") return StorageServiceProxy.fileRemove(key);
    }
    if (table === "chat") {
      if (["getAll", "query", "count"].includes(method)) {
        const values = Object.values(
          record(await StorageServiceProxy.chatGetAll()),
        );
        return method === "count" ? values.length : values;
      }
      if (typeof key !== "string" || key.length > 200)
        throw new Error("Invalid XR conversation ID.");
      if (method === "get" || method === "getRecord")
        return StorageServiceProxy.chatLoad(key);
      if (method === "exists") return StorageServiceProxy.chatExists(key);
      if (method === "set") {
        const existing = await StorageServiceProxy.chatLoad(key);
        if (!existing)
          throw new Error("Create conversations through the chat session.");
        const changes = record(value);
        const current = record(existing);
        // History renaming must not write a stale copy of the message tree over a live response.
        return StorageServiceProxy.chatSave(key, {
          ...current,
          ...(typeof changes.title === "string"
            ? { title: changes.title.trim().slice(0, 100) }
            : {}),
          updatedAt: new Date().toISOString(),
        });
      }
      if (method === "remove") return StorageServiceProxy.chatRemove(key);
    }
    if (table === "data") {
      const temporary = record(
        await StorageServiceProxy.dataGetByCategory("tempChats"),
      );
      if (method === "query" && record(key).category === "tempChats")
        return Object.entries(temporary).map(([id, entry]) => ({
          key: id,
          value: entry,
          category: "tempChats",
        }));
      if (typeof key === "string" && key.length <= 200) {
        if (method === "get") return temporary[key];
        if (method === "getRecord")
          return key in temporary
            ? { key, value: temporary[key], category: "tempChats" }
            : undefined;
        if (method === "exists") return key in temporary;
        if (
          method === "set" &&
          record(metadata).category === "tempChats" &&
          value === true
        )
          return StorageServiceProxy.dataSave(key, true, "tempChats");
        if (method === "remove")
          return key in temporary ? StorageServiceProxy.dataRemove(key) : true;
      }
    }
    if (["get", "getRecord"].includes(method)) return undefined;
    if (method === "exists") return false;
    if (["getAll", "query", "queryMetadata"].includes(method)) return [];
    if (method === "count") return 0;
    throw new Error(
      "This storage operation is unavailable in the connected XR session.",
    );
  }

  private async provider(
    service: string,
    method: string,
    args: unknown[],
    onStream?: (chunk: XrStreamChunk) => void,
  ): Promise<unknown> {
    if (method === "configure") return true;
    if (service === "ai") {
      if (method === "isConfigured") return AIServiceProxy.isConfigured();
      if (method === "getCurrentProvider")
        return useConfigStore.getState().aiConfig.provider;
      if (method === "abortRequest")
        return this.aiBusy ? AIServiceProxy.abortRequest() : false;
      if (method === "sendMessage" && Array.isArray(args[0])) {
        if (this.aiBusy || this.store.getState().isProcessing)
          throw new Error(
            "VAssist is already answering. Wait for the current response to finish.",
          );
        this.aiBusy = true;
        try {
          return await AIServiceProxy.sendMessage(
            args[0],
            (text) => onStream?.({ channel: "text", text }),
            {
              ...record(args[1] ?? {}),
              onReasoning: (text: string) =>
                onStream?.({ channel: "reasoning", text }),
            },
          );
        } finally {
          this.aiBusy = false;
        }
      }
    }
    if (service === "tts") {
      if (method === "isConfigured") return TTSServiceProxy.isConfigured();
      if (method === "getCurrentProvider")
        return useConfigStore.getState().ttsConfig.provider;
      if (method === "generateSpeech" && typeof args[0] === "string") {
        const result = await TTSServiceProxy.generateSpeech(
          args[0],
          args[1] === true,
        );
        if (!result?.audio) return null;
        let lipSync: Blob | undefined;
        if (result.bvmdUrl?.startsWith("blob:")) {
          try {
            lipSync = await (await fetch(result.bvmdUrl)).blob();
          } finally {
            URL.revokeObjectURL(result.bvmdUrl);
          }
        }
        return {
          audio: result.audio,
          ...(lipSync ? { lipSync } : {}),
          ...(result.mimeType ? { mimeType: result.mimeType } : {}),
        };
      }
    }
    if (service === "stt") {
      if (method === "isConfigured") return STTServiceProxy.isConfigured();
      if (method === "transcribeAudio" && args[0] instanceof Blob)
        return STTServiceProxy.transcribeAudio(args[0]);
    }
    throw new Error(
      "This provider operation is managed by the connected desktop app.",
    );
  }
}
