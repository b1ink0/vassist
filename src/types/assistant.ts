export interface AnimationOptionsLike {
  primaryWeight?: number;
  fillWeight?: number;
}

export interface AssistantQueueItem {
  type?: string;
  animationName?: string;
  primary?: string;
  text?: string;
}

export interface AssistantQueueStatus {
  length: number;
  isEmpty: boolean;
  items: AssistantQueueItem[];
}

export interface AssistantHandle {
  isReady: () => boolean;
  idle: () => void | Promise<void>;
  speak: (text: string, mouthAnimationBlobUrl?: string, emotionCategory?: string, options?: AnimationOptionsLike) => Promise<void>;
  setState?: (stateOrEmotion: string) => Promise<void>;
  triggerAction: (action: string) => Promise<void>;
  playComposite: (primaryAnimName: string, fillCategory?: string, options?: AnimationOptionsLike) => Promise<void>;
  getState: () => string;
  setPosition: (preset: string) => void;
  queueAnimation: (animationName: string, force?: boolean) => void;
  queueSpeak: (text: string, mouthBlobUrl?: string, emotionCategory?: string, options?: AnimationOptionsLike, force?: boolean) => void;
  clearQueue: () => void;
  getQueueStatus: () => AssistantQueueStatus;
}
