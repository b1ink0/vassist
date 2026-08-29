import type {
  VAssistOpenSettingsOptions,
  VAssistToolbarActionId,
  VAssistTriggerToolbarActionOptions,
} from "./config";

export type VAssistHostCommandName =
  | "open-settings"
  | "submit-draft"
  | "focus-input"
  | "toolbar-action"
  | "enqueue-drop-data";

export interface VAssistHostAttachment {
  dataUrl: string;
  name: string;
  size: number;
  type: "image" | "audio";
}

export interface VAssistHostDropData {
  text?: string;
  images?: VAssistHostAttachment[];
  audios?: VAssistHostAttachment[];
  autoSend?: boolean;
}

export interface VAssistToolbarActionEventDetail {
  action: VAssistToolbarActionId;
  options?: VAssistTriggerToolbarActionOptions;
}

export function getHostCommandEventName(
  hostId: string,
  command: VAssistHostCommandName,
): string {
  return `vassist:host:${command}:${hostId}`;
}

export function dispatchOpenSettingsCommand(
  hostId: string,
  options?: VAssistOpenSettingsOptions,
): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(getHostCommandEventName(hostId, "open-settings"), {
      detail: options,
    }),
  );
}

export function dispatchSubmitDraftCommand(hostId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(getHostCommandEventName(hostId, "submit-draft")),
  );
}

export function dispatchFocusInputCommand(hostId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(getHostCommandEventName(hostId, "focus-input")),
  );
}

export function dispatchToolbarActionCommand(
  hostId: string,
  action: VAssistToolbarActionId,
  options?: VAssistTriggerToolbarActionOptions,
): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(getHostCommandEventName(hostId, "toolbar-action"), {
      detail: {
        action,
        ...(options !== undefined ? { options } : {}),
      } satisfies VAssistToolbarActionEventDetail,
    }),
  );
}

export function dispatchEnqueueDropDataCommand(
  hostId: string,
  detail: VAssistHostDropData,
): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(getHostCommandEventName(hostId, "enqueue-drop-data"), {
      detail,
    }),
  );
}
