import type { AppStore, AppStoreState } from "../../stores/createAppStore";

export type ChatCommand =
  | {
      type: "send";
      text: string;
      images?: string[] | null;
      audios?: string[] | null;
    }
  | { type: "new" }
  | { type: "select"; chatId: string }
  | { type: "stop" }
  | { type: "speak"; messageId: string }
  | { type: "temporary"; enabled: boolean }
  | { type: "edit"; messageId: string; text: string }
  | { type: "regenerate"; messageId: string }
  | { type: "previous" | "next"; messageId: string }
  | { type: "branch"; parentId: string; index: number };

export type ChatSessionState = Pick<
  AppStoreState,
  | "currentChatId"
  | "chatMessages"
  | "isTempChat"
  | "isProcessing"
  | "isSpeaking"
  | "playingMessageIndex"
  | "loadingMessageIndex"
>;

export interface ChatSpeechChunk {
  id: string;
  text: string;
  audio: Blob;
  bvmd?: Blob;
  sessionId: string;
}

/** One command owner per application store. Paired views never run a second pipeline. */
export class ChatSessionRuntime {
  private send:
    | ((
        text: string,
        images: string[] | null,
        audios: string[] | null,
      ) => Promise<void>)
    | undefined;
  private remote?: (command: ChatCommand) => Promise<void>;
  private pending: symbol | undefined;
  private navigation = Promise.resolve();
  private epoch = 0;
  private audioOwner = "local";
  private speechRevision = 0;
  private speech: ChatSpeechChunk[] = [];
  private completeSpeechSessions: string[] = [];
  private readonly speechListeners = new Set<() => void>();
  private speak: ((index: number, text: string) => Promise<void>) | undefined;
  private readonly aborters = new Set<() => void>();

  constructor(private readonly store: AppStore) {}

  registerSpeaker(speak: NonNullable<ChatSessionRuntime["speak"]>): () => void {
    this.speak = speak;
    return () => {
      if (this.speak === speak) this.speak = undefined;
    };
  }

  subscribeSpeech(listener: () => void): () => void {
    this.speechListeners.add(listener);
    return () => {
      this.speechListeners.delete(listener);
    };
  }

  private changedSpeech(): void {
    this.speechRevision++;
    for (const listener of this.speechListeners) listener();
  }

  speechState() {
    return {
      owner: this.audioOwner,
      revision: this.speechRevision,
      epoch: this.epoch,
    };
  }
  speechOutput() {
    return {
      ...this.speechState(),
      chunks: this.speech,
      complete: this.completeSpeechSessions,
    };
  }

  async queueSpeech(
    text: string,
    audio: Blob,
    bvmdUrl: string | undefined,
    sessionId: string,
  ): Promise<boolean> {
    if (this.audioOwner === "local") return false;
    const generation = this.generation();
    const bvmd = bvmdUrl
      ? await fetch(bvmdUrl).then((response) => response.blob())
      : undefined;
    if (!generation.isCurrent()) return true;
    this.speech.push({
      id: crypto.randomUUID(),
      text,
      audio,
      sessionId,
      ...(bvmd ? { bvmd } : {}),
    });
    this.changedSpeech();
    return true;
  }

  completeSpeech(sessionId: string): void {
    if (this.audioOwner === "local") return;
    this.completeSpeechSessions.push(sessionId);
    this.changedSpeech();
  }

  updatePlayback(
    owner: string,
    epoch: number,
    playing: number | null,
    loading: number | null,
    speaking: boolean,
  ): void {
    if (owner !== this.audioOwner || epoch !== this.epoch) return;
    this.store.setState({
      playingMessageIndex: playing,
      loadingMessageIndex: loading,
      isSpeaking: speaking,
    });
  }

  registerSender(sender: NonNullable<ChatSessionRuntime["send"]>): () => void {
    this.send = sender;
    return () => {
      if (this.send === sender) this.send = undefined;
    };
  }

  connect(remote: NonNullable<ChatSessionRuntime["remote"]>): void {
    this.remote = remote;
  }

  get isRemote(): boolean {
    return !!this.remote;
  }

  beginVoice(): void {
    this.cancel();
    this.audioOwner = "local";
  }

  /** A conversation change invalidates every delayed stream and thinking callback. */
  cancel(): void {
    this.epoch++;
    this.pending = undefined;
    for (const abort of this.aborters) abort();
    this.aborters.clear();
    this.store.setState({
      playingMessageIndex: null,
      loadingMessageIndex: null,
      isSpeaking: false,
    });
    this.speech = [];
    this.completeSpeechSessions = [];
    this.changedSpeech();
  }

  generation(): { isCurrent: () => boolean; signal: AbortSignal } {
    const epoch = this.epoch;
    const controller = new AbortController();
    this.aborters.add(() => controller.abort());
    return {
      isCurrent: () => epoch === this.epoch && !controller.signal.aborted,
      signal: controller.signal,
    };
  }

  snapshot(): ChatSessionState {
    const state = this.store.getState();
    return {
      currentChatId: state.currentChatId,
      chatMessages: state.chatMessages,
      isTempChat: state.isTempChat,
      isProcessing: state.isProcessing,
      isSpeaking: state.isSpeaking,
      playingMessageIndex: state.playingMessageIndex,
      loadingMessageIndex: state.loadingMessageIndex,
    };
  }

  apply(state: ChatSessionState): void {
    const previous = this.store.getState();
    this.store.setState({
      ...state,
      ...(previous.currentChatId !== state.currentChatId
        ? { chatDraft: "" }
        : {}),
      ...(state.chatMessages.length > 0 &&
      (previous.currentChatId !== state.currentChatId ||
        state.chatMessages.some(
          (message) =>
            message.role === "user" &&
            !previous.chatMessages.some((old) => old.id === message.id),
        ))
        ? { isChatContainerVisible: true, isChatInputVisible: true }
        : {}),
    });
  }

  async execute(command: ChatCommand, audioOwner = "local"): Promise<void> {
    if (command.type === "new" || command.type === "select") {
      this.cancel();
      const task = this.navigation.then(async () => {
        if (this.remote) return this.remote(command);
        const state = this.store.getState();
        if (command.type === "new") await state.clearChat();
        else await state.loadChatFromHistory({ chatId: command.chatId });
      });
      this.navigation = task.catch(() => undefined);
      return task;
    }
    await this.navigation;
    if (this.remote) return this.remote(command);
    const state = this.store.getState();
    if (command.type === "stop") {
      state.stopGeneration();
      return;
    }
    if (command.type === "temporary") {
      state.setIsTempChat(command.enabled);
      return;
    }
    if (command.type === "speak") {
      const index = state.chatMessages.findIndex(
        (message) => message.id === command.messageId,
      );
      if (index < 0 || !this.speak)
        throw new Error("The message is unavailable.");
      if (
        state.playingMessageIndex === index ||
        state.loadingMessageIndex === index
      ) {
        state.stopGeneration();
        return;
      }
      if (state.isProcessing) state.stopGeneration();
      this.audioOwner = audioOwner;
      await this.speak(index, state.chatMessages[index]!.content);
      return;
    }
    if (this.pending || state.isProcessing)
      throw new Error("Wait for the response to finish or stop it first.");
    this.cancel();
    this.audioOwner = audioOwner;
    const pending = Symbol();
    this.pending = pending;
    try {
      switch (command.type) {
        case "send":
          if (!this.send) throw new Error("The chat session is not ready yet.");
          state.openChat();
          await this.send(
            command.text,
            command.images ?? null,
            command.audios ?? null,
          );
          break;
        case "edit":
          await state.editUserMessage(command.messageId, command.text);
          break;
        case "regenerate":
          await state.regenerateAIMessage(command.messageId);
          break;
        case "previous":
          state.previousBranch(command.messageId);
          break;
        case "next":
          state.nextBranch(command.messageId);
          break;
        case "branch":
          state.switchToBranch(command.parentId, command.index);
          break;
      }
    } catch (error) {
      if (this.pending === pending)
        this.store.setState({ isProcessing: false });
      throw error;
    } finally {
      if (this.pending === pending) this.pending = undefined;
    }
  }
}

const sessions = new WeakMap<AppStore, ChatSessionRuntime>();
export function getChatSession(store: AppStore): ChatSessionRuntime {
  let session = sessions.get(store);
  if (!session) {
    session = new ChatSessionRuntime(store);
    sessions.set(store, session);
  }
  return session;
}
