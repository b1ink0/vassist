import JSZip from "jszip";
import storageServiceProxy from "./proxies/StorageServiceProxy";
import Logger from "./LoggerService";

type UnknownRecord = Record<string, unknown>;

type BackupFileCategory =
  | "model"
  | "motion"
  | "emote"
  | "stage"
  | "voice"
  | "background"
  | "image"
  | "audio"
  | "general";

export interface BackupSelection {
  config: boolean;
  settings: boolean;
  data: boolean;
  chats: boolean;
  models: boolean;
  motions: boolean;
  emotes: boolean;
  stages: boolean;
  voices: boolean;
  backgrounds: boolean;
  otherFiles: boolean;
}

interface SerializedBlobMarker {
  __backupType: "blob";
  mimeType: string;
  base64: string;
}

interface BackupArchiveV1 {
  version: 1;
  app: "vassist";
  createdAt: string;
  payload: {
    config: Record<string, unknown>;
    settings: Record<string, unknown>;
    data: Record<string, unknown>;
    chats: Record<string, unknown>;
    files: Record<string, { category: BackupFileCategory; data: unknown }>;
  };
}

const DEFAULT_SELECTION: BackupSelection = {
  config: true,
  settings: true,
  data: true,
  chats: true,
  models: true,
  motions: true,
  emotes: true,
  stages: true,
  voices: true,
  backgrounds: true,
  otherFiles: true,
};

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null;

const isBlobMarker = (value: unknown): value is SerializedBlobMarker => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.__backupType === "blob" &&
    typeof value.mimeType === "string" &&
    typeof value.base64 === "string"
  );
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
};

const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
};

const detectFileCategory = (
  fileId: string,
  value: unknown,
): BackupFileCategory => {
  if (fileId.startsWith("model_")) return "model";
  if (fileId.startsWith("motion_")) return "motion";
  if (fileId.startsWith("emote_")) return "emote";
  if (fileId.startsWith("stage_")) return "stage";
  if (fileId.startsWith("voice_")) return "voice";
  if (fileId.startsWith("background_")) return "background";
  if (fileId.startsWith("image_")) return "image";
  if (fileId.startsWith("audio_")) return "audio";

  if (!isRecord(value)) {
    return "general";
  }

  if (value.modelData instanceof Blob) return "model";
  if (value.motionData instanceof Blob) return "motion";
  if (value.audioData instanceof Blob || value.cameraData instanceof Blob)
    return "emote";
  if (value.stageData instanceof Blob) return "stage";
  if (value.referenceAudio instanceof Blob) return "voice";
  if (value.type === "image") return "image";
  if (value.type === "audio") return "audio";

  return "general";
};

const shouldIncludeFileCategory = (
  category: BackupFileCategory,
  selection: BackupSelection,
): boolean => {
  switch (category) {
    case "model":
      return selection.models;
    case "motion":
      return selection.motions;
    case "emote":
      return selection.emotes;
    case "stage":
      return selection.stages;
    case "voice":
      return selection.voices;
    case "background":
      return selection.backgrounds;
    case "image":
    case "audio":
      return selection.chats;
    case "general":
    default:
      return selection.otherFiles;
  }
};

const generateImportedId = (prefix: string): string => {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const recursivelyRewriteChatMediaIds = (
  value: unknown,
  fileIdMap: Map<string, string>,
): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => recursivelyRewriteChatMediaIds(item, fileIdMap));
  }

  if (!isRecord(value)) {
    return value;
  }

  const cloned: UnknownRecord = { ...value };

  if (Array.isArray(cloned.imageFileIds)) {
    cloned.imageFileIds = cloned.imageFileIds.map((id) => {
      if (typeof id !== "string") {
        return id;
      }
      return fileIdMap.get(id) ?? id;
    });
  }

  if (Array.isArray(cloned.audioFileIds)) {
    cloned.audioFileIds = cloned.audioFileIds.map((id) => {
      if (typeof id !== "string") {
        return id;
      }
      return fileIdMap.get(id) ?? id;
    });
  }

  Object.keys(cloned).forEach((key) => {
    cloned[key] = recursivelyRewriteChatMediaIds(cloned[key], fileIdMap);
  });

  return cloned;
};

class AppDataBackupService {
  private async serializeValue(value: unknown): Promise<unknown> {
    if (value instanceof Blob) {
      const buffer = await value.arrayBuffer();
      const blobMarker: SerializedBlobMarker = {
        __backupType: "blob",
        mimeType: value.type || "application/octet-stream",
        base64: arrayBufferToBase64(buffer),
      };
      return blobMarker;
    }

    if (Array.isArray(value)) {
      const serializedArray = await Promise.all(
        value.map((item) => this.serializeValue(item)),
      );
      return serializedArray;
    }

    if (isRecord(value)) {
      const result: UnknownRecord = {};
      const entries = Object.entries(value);
      for (const [key, nestedValue] of entries) {
        result[key] = await this.serializeValue(nestedValue);
      }
      return result;
    }

    return value;
  }

  private deserializeValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.deserializeValue(item));
    }

    if (isBlobMarker(value)) {
      const buffer = base64ToArrayBuffer(value.base64);
      return new Blob([buffer], {
        type: value.mimeType || "application/octet-stream",
      });
    }

    if (isRecord(value)) {
      const result: UnknownRecord = {};
      Object.entries(value).forEach(([key, nestedValue]) => {
        result[key] = this.deserializeValue(nestedValue);
      });
      return result;
    }

    return value;
  }

  private normalizeSelection(
    selection?: Partial<BackupSelection>,
  ): BackupSelection {
    return {
      ...DEFAULT_SELECTION,
      ...(selection ?? {}),
    };
  }

  async exportToZip(selection?: Partial<BackupSelection>): Promise<Blob> {
    const effectiveSelection = this.normalizeSelection(selection);

    const [configRaw, settingsRaw, dataRaw, chatsRaw, filesRaw] =
      await Promise.all([
        storageServiceProxy.configGetAll(),
        storageServiceProxy.settingsGetAll(),
        storageServiceProxy.dataGetAll(),
        storageServiceProxy.chatGetAll(),
        storageServiceProxy.filesGetAll(),
      ]);

    const config = isRecord(configRaw) ? configRaw : {};
    const settings = isRecord(settingsRaw) ? settingsRaw : {};
    const data = isRecord(dataRaw) ? dataRaw : {};
    const chats = isRecord(chatsRaw) ? chatsRaw : {};
    const files = isRecord(filesRaw) ? filesRaw : {};

    const serializedFiles: Record<
      string,
      { category: BackupFileCategory; data: unknown }
    > = {};
    for (const [fileId, fileData] of Object.entries(files)) {
      const category = detectFileCategory(fileId, fileData);
      if (!shouldIncludeFileCategory(category, effectiveSelection)) {
        continue;
      }
      serializedFiles[fileId] = {
        category,
        data: await this.serializeValue(fileData),
      };
    }

    const serializedData: Record<string, unknown> = {};
    if (effectiveSelection.data) {
      for (const [key, value] of Object.entries(data)) {
        serializedData[key] = await this.serializeValue(value);
      }
    }

    const serializedChats: Record<string, unknown> = {};
    if (effectiveSelection.chats) {
      for (const [key, value] of Object.entries(chats)) {
        serializedChats[key] = await this.serializeValue(value);
      }
    }

    const archive: BackupArchiveV1 = {
      version: 1,
      app: "vassist",
      createdAt: new Date().toISOString(),
      payload: {
        config: effectiveSelection.config ? config : {},
        settings: effectiveSelection.settings ? settings : {},
        data: serializedData,
        chats: serializedChats,
        files: serializedFiles,
      },
    };

    const zip = new JSZip();
    zip.file("vassist-backup.json", JSON.stringify(archive));

    return await zip.generateAsync({ type: "blob" });
  }

  async importFromZip(
    file: File,
    selection?: Partial<BackupSelection>,
  ): Promise<void> {
    const effectiveSelection = this.normalizeSelection(selection);
    const zip = await JSZip.loadAsync(file);
    const backupEntry = zip.file("vassist-backup.json");

    if (!backupEntry) {
      throw new Error("Invalid backup file. Missing vassist-backup.json");
    }

    const backupText = await backupEntry.async("string");
    const parsed = JSON.parse(backupText) as BackupArchiveV1;

    if (parsed.app !== "vassist" || parsed.version !== 1 || !parsed.payload) {
      throw new Error("Unsupported backup format.");
    }

    const payload = parsed.payload;
    const fileIdMap = new Map<string, string>();

    if (effectiveSelection.config && isRecord(payload.config)) {
      for (const [key, value] of Object.entries(payload.config)) {
        await storageServiceProxy.configSave(key, value);
      }
    }

    if (effectiveSelection.settings && isRecord(payload.settings)) {
      for (const [key, value] of Object.entries(payload.settings)) {
        await storageServiceProxy.settingsSave(key, value);
      }
    }

    if (isRecord(payload.files)) {
      for (const [oldFileId, entry] of Object.entries(payload.files)) {
        if (!isRecord(entry)) {
          continue;
        }

        const category = (entry.category as BackupFileCategory) || "general";
        if (!shouldIncludeFileCategory(category, effectiveSelection)) {
          continue;
        }

        const deserialized = this.deserializeValue(entry.data);
        const newFileId = generateImportedId(category);
        await storageServiceProxy.fileSave(newFileId, deserialized, category);
        fileIdMap.set(oldFileId, newFileId);
      }
    }

    if (effectiveSelection.data && isRecord(payload.data)) {
      for (const [key, rawValue] of Object.entries(payload.data)) {
        const deserialized = this.deserializeValue(rawValue);
        await storageServiceProxy.dataSave(key, deserialized, "imported");
      }
    }

    if (effectiveSelection.chats && isRecord(payload.chats)) {
      for (const [, rawChat] of Object.entries(payload.chats)) {
        const deserializedChat = this.deserializeValue(rawChat);
        const rewritten = recursivelyRewriteChatMediaIds(
          deserializedChat,
          fileIdMap,
        );

        if (!isRecord(rewritten)) {
          continue;
        }

        const newChatId = generateImportedId("chat");
        const chatRecord: UnknownRecord = {
          ...rewritten,
          chatId: newChatId,
          importedAt: new Date().toISOString(),
        };

        await storageServiceProxy.chatSave(newChatId, chatRecord);
      }
    }

    Logger.log("BackupService", "Backup import completed successfully");
  }
}

export const appDataBackupService = new AppDataBackupService();
export default appDataBackupService;
