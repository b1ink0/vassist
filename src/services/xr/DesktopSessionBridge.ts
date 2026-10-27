import { DefaultStageSettings } from "../../config/stageConfig";
import { modelStorageService } from "../storage/ModelStorageService";
import { stageStorageService } from "../storage/StageStorageService";
import { useConfigStore } from "../../stores/useConfigStore";
import type { AppStore } from "../../stores/useAppStore";
import { isInputWindow, isScreenPicker } from "../../utils/PlatformUtils";
import type { XrHostRequest, XrHostUpdate } from "../../types/xr";
import { DesktopXrRepository, projectXrUI } from "./DesktopXrRepository";
import { decodeXrValue, encodeXrValue } from "./wireCodec";
import emotePlayerService from "../mmd/EmotePlayerService";
import { getChatSession } from "../chat/ChatSessionRuntime";

let installedStore: AppStore | null = null;
let cleanupBridge: (() => void) | undefined;
export function installDesktopXrBridge(appStore: AppStore): void {
  const api = window.electron?.xr;
  if (!api || isInputWindow || isScreenPicker) return;
  if (installedStore === appStore) return;
  cleanupBridge?.();
  installedStore = appStore;
  const repository = new DesktopXrRepository(appStore);
  let chatRevision = 0;
  let emoteRevision = 0;
  const rpcAssets = new Map<string, { blob: Blob; expires: number }>();
  const assets = new Map<
    string,
    { id: string; kind: "model" | "stage"; sourceId: string }
  >();
  async function snapshot(request: XrHostRequest): Promise<XrHostUpdate> {
    await repository.waitForSelection();
    const state = useConfigStore.getState();
    if (!state.hasHydrated)
      throw new Error("Wait for VAssist setup to finish before opening XR.");
    if (request.kind === "stage.set") {
      if (
        request.selection.kind === "custom" &&
        !(await stageStorageService.setDefaultStage(request.selection.id))
      )
        throw new Error("The selected stage is no longer available.");
      state.updateUIConfig("stage.selection", request.selection);
      appStore.getState().recreateScene();
    }
    const ui = useConfigStore.getState().uiConfig;
    const model = (await modelStorageService.getModelsList()).find(
      (entry) => entry.isDefault,
    );
    const stageList = await stageStorageService.getStagesList();
    const stage = structuredClone(ui.stage ?? DefaultStageSettings);
    const files: XrHostUpdate["assets"] = [];
    const register = (kind: "model" | "stage", sourceId: string) => {
      const key = `${kind}:${sourceId}`;
      // Reuse stable URLs while the selected library entry remains unchanged.
      let cached = assets.get(key);
      if (!cached) {
        cached = { id: crypto.randomUUID(), kind, sourceId };
        assets.set(key, cached);
      }
      files.push({ id: cached.id, type: "application/octet-stream" });
      return `/api/xr/assets/${cached.id}`;
    };
    const modelUrl = model
      ? register("model", model.id)
      : "/res/assets/model/vassist_default.bpmx";
    const visibility = (value: unknown, keys: string[]) =>
      Array.isArray(value)
        ? value.map((item) => {
            if (!item || typeof item !== "object") return {};
            return Object.fromEntries(
              keys.flatMap((key) => {
                const field = (item as Record<string, unknown>)[key];
                return typeof field === "boolean" ||
                  typeof field === "number" ||
                  (key === "type" && typeof field === "string")
                  ? [[key, field]]
                  : [];
              }),
            );
          })
        : [];
    const selection = stage.selection;
    const selectedStage =
      selection?.kind === "custom"
        ? stageList.find((entry) => entry.id === selection.id)
        : !stage.selection
          ? stageList.find((entry) => entry.isDefault)
          : null;
    const selectedStageId =
      stage.selection?.kind === "custom"
        ? stage.selection.id
        : typeof selectedStage?.id === "string"
          ? selectedStage.id
          : null;
    const stageUrl =
      selectedStage && selectedStageId
        ? register("stage", selectedStageId)
        : undefined;
    if (stage.selection?.kind === "custom" && !stageUrl)
      throw new Error(
        "The selected stage file is unavailable. Choose another stage in VAssist.",
      );
    if (!stage.selection)
      stage.selection =
        selectedStage && typeof selectedStage.id === "string"
          ? { kind: "custom", id: selectedStage.id }
          : { kind: "none" };
    // Only renderer settings used by this slice cross the process boundary.
    return {
      assets: files,
      snapshot: {
        model: {
          id: model?.id ?? "builtin_default_model",
          url: modelUrl,
          fileName:
            model?.metadata.originalFileName?.split(/[\\/]/).pop() ??
            "vassist_default.bpmx",
          visibility: {
            textures: visibility(model?.metadata.textures, [
              "materialIndex",
              "type",
              "isActive",
            ]),
            meshParts: visibility(model?.metadata.meshParts, [
              "meshIndex",
              "type",
              "subMeshIndex",
              "isVisible",
            ]),
          },
        },
        stage,
        customStages: stageList.map(({ id, name }) => ({ id, name })),
        ...(stageUrl
          ? {
              stageUrl,
              stageFormat:
                selectedStage?.metadata.format === "glb"
                  ? ("glb" as const)
                  : selectedStage?.metadata.format === "babylon"
                    ? ("babylon" as const)
                    : ("bpmx" as const),
            }
          : {}),
        shadows: ui.enableAvatarShadow,
        physics: ui.enablePhysics,
        physicsEngine: ui.physicsEngine,
        ui: projectXrUI(ui),
        currentChatId: appStore.getState().currentChatId,
        emoteId: emotePlayerService.getCurrentEmoteId(),
        emotePositionSeconds: emotePlayerService.getPlaybackCurrentTime(),
        emoteRevision,
        emotePaused: emotePlayerService.isPlaybackPaused(),
        emoteAutoPlay: emotePlayerService.isAutoPlayActive(),
        emoteAudioOwner: emotePlayerService.getAudioOwner(),
        chatRevision,
        chat: getChatSession(appStore).snapshot(),
        speech: getChatSession(appStore).speechState(),
      },
    };
  }
  let queue = Promise.resolve();
  const removeRequest = api.onRequest((message) => {
    if (message.request.kind === "chat.snapshot") {
      api.reply({
        id: message.id,
        chat: getChatSession(appStore).snapshot(),
        chatRevision,
        speech: getChatSession(appStore).speechState(),
      });
      return;
    }
    if (message.request.kind === "rpc") {
      const request = message.request;
      void (async () => {
        const args = await decodeXrValue(
          request.call.args,
          async (id, mime) => {
            const upload = request.uploads.find((asset) => asset.id === id);
            if (!upload) throw new Error("Missing XR upload.");
            return new Blob([new Uint8Array(upload.data)], { type: mime });
          },
        );
        if (!Array.isArray(args)) throw new Error("Invalid XR arguments.");
        const result = await repository.execute(request.call, args, (stream) =>
          api.reply({ id: message.id, stream }),
        );
        const files: Array<{ id: string; type: string }> = [];
        const value = await encodeXrValue(result, (blob) => {
          for (const [id, asset] of rpcAssets)
            if (asset.expires < Date.now()) rpcAssets.delete(id);
          if (
            [...rpcAssets.values()].reduce(
              (size, asset) => size + asset.blob.size,
              blob.size,
            ) >
            512 * 1024 * 1024
          )
            throw new Error(
              "The XR asset transfer limit was reached. Try again shortly.",
            );
          const id = crypto.randomUUID();
          rpcAssets.set(id, { blob, expires: Date.now() + 5 * 60_000 });
          files.push({ id, type: blob.type || "application/octet-stream" });
          return id;
        });
        api.reply({ id: message.id, value, assets: files });
        if (
          (request.call.kind === "action" &&
            request.call.action !== "chat.audio") ||
          (request.call.kind === "storage" &&
            ["set", "setMultiple", "remove"].includes(request.call.method))
        )
          api.invalidate();
      })().catch((error: unknown) =>
        api.reply({
          id: message.id,
          error:
            error instanceof Error ? error.message : "XR operation failed.",
        }),
      );
      return;
    }
    queue = queue.then(async () => {
      try {
        if (message.request.kind === "asset.read") {
          const assetId = message.request.assetId;
          const temporary = rpcAssets.get(assetId);
          if (temporary && temporary.expires > Date.now()) {
            api.reply({
              id: message.id,
              asset: {
                id: assetId,
                type: temporary.blob.type,
                data: new Uint8Array(await temporary.blob.arrayBuffer()),
              },
            });
            return;
          }
          const source = [...assets.values()].find(
            (asset) => asset.id === assetId,
          );
          if (!source) throw new Error("Unknown XR asset.");
          const blob =
            source.kind === "model"
              ? (await modelStorageService.getModel(source.sourceId))?.modelData
              : (await stageStorageService.getStage(source.sourceId))
                  ?.stageData;
          if (!blob) throw new Error("The selected file is unavailable.");
          if (blob.size > 512 * 1024 * 1024)
            throw new Error("The selected file exceeds the XR transfer limit.");
          api.reply({
            id: message.id,
            asset: {
              id: assetId,
              type: "application/octet-stream",
              data: new Uint8Array(await blob.arrayBuffer()),
            },
          });
        } else if (
          message.request.kind === "snapshot" ||
          message.request.kind === "stage.set"
        )
          api.reply({
            id: message.id,
            update: await snapshot(message.request),
          });
      } catch (error) {
        api.reply({
          id: message.id,
          error:
            error instanceof Error
              ? error.message
              : "Unable to prepare XR scene.",
        });
      }
    });
  });
  const removeConfig = useConfigStore.subscribe((state, previous) => {
    if (state.uiConfig !== previous.uiConfig) api.invalidate();
  });
  const removeApp = appStore.subscribe((state, previous) => {
    const chatChanged =
      state.chatMessages !== previous.chatMessages ||
      state.currentChatId !== previous.currentChatId ||
      state.isTempChat !== previous.isTempChat ||
      state.isProcessing !== previous.isProcessing ||
      state.isSpeaking !== previous.isSpeaking ||
      state.playingMessageIndex !== previous.playingMessageIndex ||
      state.loadingMessageIndex !== previous.loadingMessageIndex;
    if (chatChanged) chatRevision++;
    if (
      state.sceneKey !== previous.sceneKey ||
      state.currentChatId !== previous.currentChatId ||
      chatChanged
    )
      api.invalidate();
  });
  const removePlayback = emotePlayerService.subscribePlayback(() => {
    emoteRevision++;
    api.invalidate();
  });
  const removeSpeech = getChatSession(appStore).subscribeSpeech(() =>
    api.invalidate(),
  );
  cleanupBridge = () => {
    removeRequest();
    removeConfig();
    removeApp();
    removePlayback();
    removeSpeech();
    assets.clear();
    rpcAssets.clear();
  };
}
