import type {
  StageFormat,
  StageSettings,
  StageSelection,
} from "../config/stageConfig";
import type { SceneBuildConfig } from "../babylon/types";
import type { XrWireValue } from "../services/xr/wireCodec";
import type { RemoteStorageMethod } from "../storage/adapters/RemoteStorageAdapter";
import type { UIConfig } from "../config/uiConfig";
import type { ChatSessionState } from "../services/chat/ChatSessionRuntime";

export type XrRpcCall =
  | {
      kind: "storage";
      method: RemoteStorageMethod;
      args: XrWireValue;
    }
  | {
      kind: "provider";
      service: "ai" | "tts" | "stt" | "decision";
      method: string;
      args: XrWireValue;
    }
  | {
      kind: "action";
      action:
        | "model.select"
        | "chat.command"
        | "chat.audio"
        | "chat.playback"
        | "emote.play"
        | "emote.stop"
        | "emote.seek"
        | "emote.autoplay.start"
        | "emote.autoplay.stop";
      args: XrWireValue;
    };
export interface XrStreamChunk {
  channel: "text" | "reasoning";
  text: string;
}

export type XrBrowserId = "default" | "chrome" | "edge" | "brave";
export interface XrLaunchOptions {
  browser: XrBrowserId;
  forceOpenXR: boolean;
  clientUrl?: string;
  launch?: boolean;
  network?: XrNetworkOptions;
}
export interface XrNetworkOptions {
  enabled: boolean;
  hostname: string;
  certPath: string;
  keyPath: string;
}
export interface XrBrowserChoice {
  id: XrBrowserId;
  name: string;
}
export interface XrAsset {
  id: string;
  data: Uint8Array;
  type: string;
}
export interface XrSceneSnapshot {
  revision: number;
  model: {
    id: string;
    url: string;
    fileName: string;
    visibility?: SceneBuildConfig["modelVisibility"];
  };
  stage: StageSettings;
  customStages?: Array<{ id: string; name: string }>;
  stageUrl?: string;
  stageFormat?: StageFormat;
  shadows: boolean;
  physics: boolean;
  physicsEngine: string;
  ui?: Partial<UIConfig>;
  currentChatId?: string | null;
  emoteId?: string | null;
  emotePositionSeconds?: number;
  emoteRevision?: number;
  emotePaused?: boolean;
  emoteAutoPlay?: boolean;
  emoteAudioOwner?: string;
  chatRevision?: number;
  chat?: ChatSessionState;
  speech?: { owner: string; revision: number; epoch: number };
}
export interface XrHostUpdate {
  snapshot: Omit<XrSceneSnapshot, "revision">;
  assets: Array<{ id: string; type: string }>;
}
export type XrHostRequest =
  | { kind: "snapshot" }
  | { kind: "stage.set"; selection: StageSelection };
export interface XrRendererRequest {
  id: string;
  request:
    | XrHostRequest
    | { kind: "chat.snapshot" }
    | { kind: "asset.read"; assetId: string }
    | { kind: "rpc"; call: XrRpcCall; uploads: XrAsset[] };
}
export type XrRendererReply =
  | { id: string; stream: XrStreamChunk }
  | {
      id: string;
      chat: ChatSessionState;
      chatRevision: number;
      speech: NonNullable<XrSceneSnapshot["speech"]>;
    }
  | {
      id: string;
      value: XrWireValue;
      assets: Array<{ id: string; type: string }>;
    }
  | { id: string; update: XrHostUpdate }
  | { id: string; asset: XrAsset }
  | { id: string; error: string };
export interface ElectronXrAPI {
  browsers(): Promise<XrBrowserChoice[]>;
  open(options: XrLaunchOptions): Promise<{ url: string }>;
  revoke(): Promise<void>;
  chooseTlsFiles(): Promise<{ certPath: string; keyPath: string } | null>;
  onRequest(callback: (request: XrRendererRequest) => void): () => void;
  reply(reply: XrRendererReply): void;
  invalidate(): void;
}
