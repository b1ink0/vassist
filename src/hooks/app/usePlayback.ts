import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../../stores/useAppStore";

export const usePlayback = () =>
  useAppStore(
    useShallow((state) => ({
      isVoiceMode: state.isVoiceMode,
      isSpeaking: state.isSpeaking,
      playingMessageIndex: state.playingMessageIndex,
      loadingMessageIndex: state.loadingMessageIndex,
      setIsVoiceMode: state.setIsVoiceMode,
      setIsSpeaking: state.setIsSpeaking,
      setPlayingMessageIndex: state.setPlayingMessageIndex,
      setLoadingMessageIndex: state.setLoadingMessageIndex,
    })),
  );
