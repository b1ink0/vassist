declare module "@met4citizen/headaudio/dist/headaudio.min.mjs" {
  export interface HeadAudioOptions {
    processorOptions?: {
      frameEventsEnabled?: boolean;
      vadEventsEnabled?: boolean;
      featureEventsEnabled?: boolean;
      visemeEventsEnabled?: boolean;
    };
    parameterData?: Record<string, number>;
  }

  export class HeadAudio extends AudioWorkletNode {
    constructor(context: BaseAudioContext, options?: HeadAudioOptions);
    onvalue: ((viseme: string, value: number) => void) | null;
    onstarted: ((event: unknown) => void) | null;
    onended: ((event: unknown) => void) | null;
    loadModel(url: string, reset?: boolean): Promise<void>;
    update(deltaMilliseconds: number): void;
    start(): void;
    stop(): void;
    resetAll(): void;
    resetTimer(): void;
  }
}
