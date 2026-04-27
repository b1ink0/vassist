import ModelDownloader from '../shared/ModelDownloader';

const WhisperModelDownloader = ({ androidAPI, isLightBackground = false }) => (
  <ModelDownloader
    androidAPI={androidAPI}
    isLightBackground={isLightBackground}
    modelType="whisper"
    statusKey="whisper"
    downloadFn={() => androidAPI.downloadWhisperModel()}
    deleteFn={() => androidAPI.deleteWhisperModel()}
    title="Whisper Model"
    downloadSize="~99 MB"
    deleteConfirmMsg="This will free up ~99 MB of storage."
    successMsg="Whisper STT model downloaded successfully!"
  />
);

export default WhisperModelDownloader;
