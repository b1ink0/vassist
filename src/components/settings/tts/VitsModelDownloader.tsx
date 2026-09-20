import ModelDownloader from "../shared/ModelDownloader";

interface VitsModelDownloaderProps {
  androidAPI: {
    getSTTTTSStatus?: () => string;
    _onSTTTTSProgress?:
      | ((modelType: string, percent: number, statusText: string) => void)
      | null;
    _onSTTTTSComplete?:
      | ((
          modelType: string,
          result: { success?: boolean; error?: string },
        ) => void)
      | null;
    _onSTTTTSError?: ((modelType: string, errorMsg: string) => void) | null;
    downloadVitsModel?: () => string;
    deleteVitsModel?: () => string;
  } | null;
  isLightBackground?: boolean;
}

const VitsModelDownloader = ({
  androidAPI,
  isLightBackground = false,
}: VitsModelDownloaderProps) => (
  <ModelDownloader
    androidAPI={androidAPI}
    isLightBackground={isLightBackground}
    modelType="vits"
    statusKey="vits"
    downloadFn={() =>
      androidAPI?.downloadVitsModel?.() ??
      '{"success":false,"error":"VITS download API unavailable"}'
    }
    deleteFn={() =>
      androidAPI?.deleteVitsModel?.() ??
      '{"success":false,"error":"VITS delete API unavailable"}'
    }
    title="VITS Model"
    downloadSize="~145 MB"
    deleteConfirmMsg="This will free up ~152 MB of storage."
    successMsg="VITS TTS model downloaded successfully!"
  />
);

export default VitsModelDownloader;
