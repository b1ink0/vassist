import AndroidTtsPackDownloader from "./AndroidTtsPackDownloader";
import type { AndroidAPI } from "../../../types/android";

interface AndroidLocalTTSConfigProps {
  androidAPI: AndroidAPI | null;
  model: string;
  speakerId: number;
  speed: number;
  onModelChange: (model: string) => void;
  onSpeakerIdChange: (speakerId: number) => void;
  onSpeedChange: (speed: number) => void;
  isLightBackground?: boolean;
  onRequestDeleteDialog?: ((packId: string) => void) | undefined;
  externalDeleteTick?: number | undefined;
}

const AndroidLocalTTSConfig = ({
  androidAPI,
  model,
  speakerId,
  speed,
  onModelChange,
  onSpeakerIdChange,
  onSpeedChange,
  isLightBackground = false,
  onRequestDeleteDialog,
  externalDeleteTick,
}: AndroidLocalTTSConfigProps) => (
  <div className="space-y-4">
    <AndroidTtsPackDownloader
      androidAPI={androidAPI}
      isLightBackground={isLightBackground}
      activePackId={model}
      onActivePackChange={onModelChange}
      speakerId={speakerId}
      onSpeakerIdChange={onSpeakerIdChange}
      onRequestDeleteDialog={onRequestDeleteDialog}
      externalDeleteTick={externalDeleteTick}
    />
    <div className="space-y-4 p-2 md:p-4 rounded-lg bg-white/5 border border-white/10">
      <h4 className="text-sm font-semibold text-white/90">Android Local TTS</h4>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-white/90">Speed</label>
        <input
          type="range"
          min="0.5"
          max="2.0"
          step="0.1"
          value={speed}
          onChange={(event) => onSpeedChange(Number(event.target.value))}
          className="w-full"
        />
        <span className="text-xs text-white/60">{speed}x</span>
      </div>
      <p className="text-xs text-white/50">
        Offline voices running locally on your device (CPU via sherpa-onnx)
      </p>
    </div>
  </div>
);

export default AndroidLocalTTSConfig;
