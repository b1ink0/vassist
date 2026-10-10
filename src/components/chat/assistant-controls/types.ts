import type { MouseEvent as ReactMouseEvent, RefObject } from "react";
import type {
  PositionManagerLike,
  PositionPixels,
  PositionPresetLike,
  SceneWithMetadata,
} from "../../../babylon/types";

export interface ButtonPosition {
  x: number;
  y: number;
}

export interface AssistantControlDockProps {
  onClick?: (event?: ReactMouseEvent<HTMLElement>) => void;
  isVisible?: boolean;
  modelDisabled?: boolean;
  isChatOpen?: boolean;
  chatInputRef?: RefObject<HTMLElement | null>;
}

export interface EmoteListItem {
  id: string;
  name: string;
  categories?: string[];
  isVisible: boolean;
  metadata: unknown;
}

export interface StoredModelItem {
  id: string;
  name: string;
  isDefault: boolean;
  metadata: unknown;
}

export interface StoredStageItem {
  id: string;
  name: string;
  isDefault: boolean;
  metadata: unknown;
}

export interface PositionManagerForButton extends PositionManagerLike {
  applyPreset: (
    preset: string,
    options?: { modelSizePx?: { width: number; height: number } },
  ) => void;
}

export interface SceneMetadataCameraControls {
  toggleCameraMode?: () => void;
  getCameraMode?: () => "2D" | "3D";
  toggleCameraLock?: () => void;
  isCameraLocked?: () => boolean;
  resetCameraPosition?: () => void;
  rotateCameraBy?: (degrees: number) => void;
  resetCameraRotation?: () => void;
  toggleCameraSave?: () => void;
  isCameraSaveEnabled?: () => boolean;
}

export type SceneWithCameraControls = SceneWithMetadata & {
  metadata?: SceneWithMetadata["metadata"] & SceneMetadataCameraControls;
};

export interface DesktopApiForAssistantControls {
  window?: {
    getPosition?: () => Promise<{ x: number; y: number }>;
    setPosition?: (x: number, y: number) => Promise<void>;
    getSize?: () => Promise<{ width: number; height: number }>;
    updateWindowSizeForZoom?: (width: number, height: number) => Promise<void>;
  };
}

export interface DragDropServiceLike {
  attach: (
    element: HTMLElement,
    callbacks: {
      onSetDragOver?: (flag: boolean) => void;
      onShowError?: (error: unknown) => void;
      checkVoiceMode?: (() => boolean) | null;
      getCurrentCounts?: () => { images: number; audios: number };
      onProcessData?: (data: unknown) => void;
    },
  ) => void;
  detach: () => void;
}

export type DragDropServiceCtor = new (options: {
  maxImages: number;
  maxAudios: number;
}) => DragDropServiceLike;

export interface AssistantControlLayout {
  emote: { left: number; top: number };
  avatar: { left: number; top: number };
  camera: { left: number; top: number };
  button: { left: string; top?: string; bottom?: string };
  isLeftSide: boolean;
}

export interface AssistantControlActions {
  onModelSelect: (modelId: string | null) => void;
  onStageSelect: (stageId: string | null) => void;
  onPlayEmote: (emoteId: string) => void;
  onToggleAutoPlay: () => void;
  onCategoryChange: (category: string) => void;
  onToggle3D: () => void;
  onCameraReset: () => void;
  onCameraLockToggle: () => void;
  onCameraSaveToggle: () => void;
  onToggleStagePanel: () => void;
}
