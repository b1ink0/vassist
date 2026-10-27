import TTSProviderStep from "./TTSProviderStep";

interface STTProviderStepProps {
  isLightBackground?: boolean;
}

const STTProviderStep = ({
  isLightBackground = false,
}: STTProviderStepProps) => (
  <TTSProviderStep isLightBackground={isLightBackground} section="stt" />
);

export default STTProviderStep;
