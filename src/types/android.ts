export interface AndroidDownloadProgress {
  percent: number;
  status: string;
}

export interface AndroidSttTtsProgress {
  modelType: string;
  percent: number;
  statusText: string;
}

export interface AndroidAPI {
  listLLMModels?: () => string;
  pullLLMModel?: (modelName: string) => string;
  downloadLLMModel?: (url: string) => string;
  deleteLLMModel?: (filename: string) => string;
  importLLMModel?: () => string;
  getLLMModelsDirectory?: () => string;

  getSTTTTSStatus?: () => string;
  downloadWhisperModel?: () => string;
  deleteWhisperModel?: () => string;
  downloadVitsModel?: () => string;
  deleteVitsModel?: () => string;

  _onDownloadComplete?: ((result: unknown) => void) | null;
  _onDownloadError?: ((error: string) => void) | null;
  _onImportComplete?: ((result: unknown) => void) | null;
  _onDownloadProgress?: ((percent: number, status: string) => void) | null;

  _onSTTTTSProgress?: ((modelType: string, percent: number, statusText: string) => void) | null;
  _onSTTTTSComplete?: ((modelType: string, result: unknown) => void) | null;
  _onSTTTTSError?: ((modelType: string, errorMsg: string) => void) | null;
}
