import AndroidTtsPackDownloader from "./AndroidTtsPackDownloader";
import type { AndroidAPI } from "../../../types/android";
import RangeSlider from "../../ui/RangeSlider";

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
  <div className="flex flex-col gap-4">
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
    <div className="flex flex-col gap-4 settings-section">
      <h4 className="settings-group-heading">Android Local TTS</h4>
      <div className="flex flex-col gap-2">
        <label className="block text-sm font-medium vassist-text-primary">
          Speed
        </label>
        <RangeSlider
          aria-label="Speed"
          min="0.5"
          max="2.0"
          step="0.1"
          value={speed}
          onValueChange={(nextValue) => onSpeedChange(nextValue)}
        />
        <span className="text-xs vassist-text-muted">{speed}x</span>
      </div>
      <p className="text-xs vassist-text-muted">
        Offline voices running locally on your device (CPU via sherpa-onnx)
      </p>
    </div>
  </div>
);

export default AndroidLocalTTSConfig;
