import { DefaultTTSConfig } from "../../config/aiConfig";
import type { AppStore } from "../../stores/createAppStore";
import { StorageServiceProxy, TTSServiceProxy } from "../proxies";
import { getChatSession } from "./ChatSessionRuntime";

/** Generates speech once on the chat owner and routes playback to the requesting view. */
export async function playChatMessageSpeech(
  store: AppStore,
  index: number,
  text: string,
): Promise<void> {
  const session = getChatSession(store);
  const request = session.generation();
  const state = store.getState();
  if (
    state.playingMessageIndex === index ||
    state.loadingMessageIndex === index
  ) {
    state.stopGeneration();
    return;
  }
  const config = (await StorageServiceProxy.configLoad(
    "ttsConfig",
    DefaultTTSConfig,
  )) as typeof DefaultTTSConfig;
  if (!request.isCurrent()) return;
  if (!config.enabled || !TTSServiceProxy.isConfigured()) return;
  session.cancel();
  const generation = session.generation();
  const sessionId = `manual_${index}_${Date.now()}`;
  store.setState({ playingMessageIndex: null, loadingMessageIndex: index });
  TTSServiceProxy.stopPlayback();
  TTSServiceProxy.resumePlayback();
  const urls: string[] = [];
  try {
    const chunks: Array<{
      text: string;
      audioUrl: string;
      bvmdUrl: string | null;
      sessionId: string;
    }> = [];
    const remote = session.speechState().owner !== "local";
    for (const chunk of TTSServiceProxy.chunkText(
      text,
      config.chunkSize,
      config.minChunkSize,
    )) {
      if (!generation.isCurrent()) return;
      const result = await TTSServiceProxy.generateSpeech(chunk, true);
      if (result?.bvmdUrl) urls.push(result.bvmdUrl);
      if (!generation.isCurrent()) return;
      if (!result?.audio) continue;
      const audio =
        result.audio instanceof Blob
          ? result.audio
          : new Blob([result.audio], { type: result.mimeType ?? "audio/mpeg" });
      if (remote) {
        await session.queueSpeech(
          chunk,
          audio,
          result.bvmdUrl ?? undefined,
          sessionId,
        );
      } else {
        const audioUrl = URL.createObjectURL(audio);
        urls.push(audioUrl);
        chunks.push({
          text: chunk,
          audioUrl,
          bvmdUrl: result.bvmdUrl,
          sessionId,
        });
      }
    }
    if (!generation.isCurrent()) return;
    if (remote) session.completeSpeech(sessionId);
    else await TTSServiceProxy.playAudioSequence(chunks, sessionId);
  } finally {
    TTSServiceProxy.cleanupBlobUrls(urls);
    if (generation.isCurrent()) store.setState({ loadingMessageIndex: null });
  }
}
