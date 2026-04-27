import ModelDownloader from '../shared/ModelDownloader';

const VitsModelDownloader = ({ androidAPI, isLightBackground = false }) => (
  <ModelDownloader
    androidAPI={androidAPI}
    isLightBackground={isLightBackground}
    modelType="vits"
    statusKey="vits"
    downloadFn={() => androidAPI.downloadVitsModel()}
    deleteFn={() => androidAPI.deleteVitsModel()}
    title="VITS Model"
    downloadSize="~145 MB"
    deleteConfirmMsg="This will free up ~152 MB of storage."
    successMsg="VITS TTS model downloaded successfully!"
  />
);

export default VitsModelDownloader;
