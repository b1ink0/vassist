import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../../stores/useAppStore";

export const useIsVoiceMode = () => useAppStore((state) => state.isVoiceMode);

export const useIsSpeaking = () => useAppStore((state) => state.isSpeaking);

export const usePlayingMessageIndex = () =>
  useAppStore((state) => state.playingMessageIndex);

export const useLoadingMessageIndex = () =>
  useAppStore((state) => state.loadingMessageIndex);

export const usePlaybackActions = () =>
  useAppStore(
    useShallow((state) => ({
      setIsVoiceMode: state.setIsVoiceMode,
      setIsSpeaking: state.setIsSpeaking,
      setPlayingMessageIndex: state.setPlayingMessageIndex,
      setLoadingMessageIndex: state.setLoadingMessageIndex,
    })),
  );
