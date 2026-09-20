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
  searchOllamaModels?: (
    query: string,
    page?: number,
    pageSize?: number,
  ) => string;
  listOllamaModelTags?: (
    modelId: string,
    query?: string,
    page?: number,
    pageSize?: number,
  ) => string;
  searchHuggingFaceModels?: (
    query: string,
    cursor?: string,
    pageSize?: number,
  ) => string;
  listHuggingFaceFiles?: (
    repoId: string,
    query?: string,
    page?: number,
    pageSize?: number,
  ) => string;

  getSTTTTSStatus?: () => string;
  downloadWhisperModel?: () => string;
  deleteWhisperModel?: () => string;
  downloadVitsModel?: () => string;
  deleteVitsModel?: () => string;

  /** Snapdragon compute unit for the on-device llama.cpp runtime */
  setLLMComputeUnit?: (unit: string) => void;
  getLLMComputeUnit?: () => string;
  /** Registered ggml backends/devices, e.g. "cpu|CPU,opencl|Adreno..." */
  getLLMBackendInfo?: () => string;

  _onDownloadComplete?: ((result: unknown) => void) | null;
  _onDownloadError?: ((error: string) => void) | null;
  _onImportComplete?: ((result: unknown) => void) | null;
  _onDownloadProgress?: ((percent: number, status: string) => void) | null;

  _onSTTTTSProgress?:
    | ((modelType: string, percent: number, statusText: string) => void)
    | null;
  _onSTTTTSComplete?: ((modelType: string, result: unknown) => void) | null;
  _onSTTTTSError?: ((modelType: string, errorMsg: string) => void) | null;
}
