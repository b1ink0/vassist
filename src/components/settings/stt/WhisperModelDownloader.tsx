import ModelDownloader from '../shared/ModelDownloader';

interface WhisperModelDownloaderProps {
  androidAPI: {
    getSTTTTSStatus?: () => string;
    _onSTTTTSProgress?: ((modelType: string, percent: number, statusText: string) => void) | null;
    _onSTTTTSComplete?: ((modelType: string, result: { success?: boolean; error?: string }) => void) | null;
    _onSTTTTSError?: ((modelType: string, errorMsg: string) => void) | null;
    downloadWhisperModel?: () => string;
    deleteWhisperModel?: () => string;
  } | null;
  isLightBackground?: boolean;
}

const WhisperModelDownloader = ({ androidAPI, isLightBackground = false }: WhisperModelDownloaderProps) => (
  <ModelDownloader
    androidAPI={androidAPI}
    isLightBackground={isLightBackground}
    modelType="whisper"
    statusKey="whisper"
    downloadFn={() => androidAPI?.downloadWhisperModel?.() ?? '{"success":false,"error":"Whisper download API unavailable"}'}
    deleteFn={() => androidAPI?.deleteWhisperModel?.() ?? '{"success":false,"error":"Whisper delete API unavailable"}'}
    title="Whisper Model"
    downloadSize="~99 MB"
    deleteConfirmMsg="This will free up ~99 MB of storage."
    successMsg="Whisper STT model downloaded successfully!"
  />
);

export default WhisperModelDownloader;
