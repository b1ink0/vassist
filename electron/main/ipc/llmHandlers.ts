import type { App, IpcMain, IpcMainInvokeEvent } from 'electron';
import type * as fsType from 'fs';
import type * as pathType from 'path';
import type { IncomingMessage } from 'http';

type ModelDirDeps = {
  app: App;
  fs: typeof fsType;
  path: typeof pathType;
  baseDir: string;
};

type DownloadProgress = {
  percent: number;
  status: string;
};

type DownloadedLayer = {
  path: string;
  size: number;
  type: 'model' | 'mmproj';
};

type LLMHandlersDeps = {
  ipcMain: IpcMain;
  fs: typeof fsType;
  path: typeof pathType;
  require: NodeRequire;
  getModelsDir: (customPath?: string | null) => string;
  llmBackendManager: {
    getStatus: (arg: { backend?: string }) => unknown;
    installBackend: (arg: { event?: IpcMainInvokeEvent; backend?: string }) => Promise<unknown>;
  } | null;
};

type HuggingFaceTreeEntry = {
  path?: string;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function createGetModelsDir({ app, fs, path, baseDir }: ModelDirDeps) {
  const ensureDirectory = (dirPath: string): string => {
    if (fs.existsSync(dirPath)) {
      const stat = fs.statSync(dirPath);
      if (!stat.isDirectory()) {
        throw new Error(`Models path exists but is not a directory: ${dirPath}`);
      }
      return dirPath;
    }

    fs.mkdirSync(dirPath, { recursive: true });
    return dirPath;
  };

  return function getModelsDir(customPath: string | null = null): string {
    if (customPath && typeof customPath === 'string') {
      const normalizedCustomPath = customPath.trim();
      if (normalizedCustomPath) {
        if (fs.existsSync(normalizedCustomPath)) {
          const stat = fs.statSync(normalizedCustomPath);
          if (stat.isDirectory()) {
            return normalizedCustomPath;
          }

          // If a model file path was accidentally saved, use its parent directory.
          const parentDir = path.dirname(normalizedCustomPath);
          console.warn('[LLM] customModelsPath points to a file, using parent directory:', parentDir);
          return ensureDirectory(parentDir);
        }

        return ensureDirectory(normalizedCustomPath);
      }
    }

    const defaultModelsDir = process.env.VITE_DEV_SERVER_URL
      ? path.join(baseDir, '..', 'electron', 'server', 'models')
      : path.join(app.getPath('userData'), 'models');

    return ensureDirectory(defaultModelsDir);
  };
}

export function registerLLMHandlers({ ipcMain, fs, path, require, getModelsDir, llmBackendManager }: LLMHandlersDeps) {
  // List models in models directory
  ipcMain.handle('llm:list-models', async (_event: IpcMainInvokeEvent, customPath: string | null = null) => {
    try {
      const modelsDir = getModelsDir(customPath);

      if (!fs.existsSync(modelsDir)) {
        fs.mkdirSync(modelsDir, { recursive: true });
        return { success: true, models: [] };
      }

      const files = fs.readdirSync(modelsDir);
      const models = files
        .filter((file: string) => file.endsWith('.gguf') && !file.startsWith('mmproj-')) // Exclude mmproj files
        .map((file: string) => {
          const filePath = path.join(modelsDir, file);
          const stats = fs.statSync(filePath);

          // Check if mmproj file exists for this model
          const mmprojFile = `mmproj-${file}`;
          const mmprojPath = path.join(modelsDir, mmprojFile);
          const hasImageSupport = fs.existsSync(mmprojPath);

          return {
            name: file,
            size: stats.size,
            modified: stats.mtime,
            hasImageSupport
          };
        });

      return { success: true, models };
    } catch (error) {
      console.error('[LLM] List models error:', error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  // Pull model using Ollama (free, open source)
  ipcMain.handle('llm:pull-model', async (event: IpcMainInvokeEvent, modelName: string, customPath: string | null = null) => {
    const https = require('https');
    const http = require('http');

    try {
      console.log('[LLM] Pulling model from Ollama registry:', modelName);
      const modelsDir = getModelsDir(customPath);
      if (!fs.existsSync(modelsDir)) {
        fs.mkdirSync(modelsDir, { recursive: true });
      }

      const [rawModel, tag = 'latest'] = modelName.split(':');
      const model = rawModel || modelName;
      const namespace = model.includes('/') ? model : `library/${model}`;

      event.sender.send('llm:download-progress', { status: 'Pulling manifest...', percent: 0 });

      const manifestUrl = `https://registry.ollama.ai/v2/${namespace}/manifests/${tag}`;
      const manifestRes = await fetch(manifestUrl, {
        headers: { 'Accept': 'application/vnd.docker.distribution.manifest.v2+json' }
      });

      if (!manifestRes.ok) {
        throw new Error(`Model not found: ${modelName}`);
      }

      const manifest = await manifestRes.json() as { layers?: Array<{ digest: string; size: number; mediaType?: string }> };
      const layers = manifest.layers || [];

      // Separate model and mmproj layers by mediaType
      const modelLayers: Array<{ digest: string; size: number; mediaType?: string }> = [];
      const mmprojLayers: Array<{ digest: string; size: number; mediaType?: string }> = [];

      for (const layer of layers) {
        const mediaType = layer.mediaType || '';
        // Detect mmproj layers (vision encoder)
        if (mediaType.includes('projector') || mediaType === 'application/vnd.ollama.image.projector') {
          mmprojLayers.push(layer);
          console.log('[LLM] Detected mmproj layer:', layer.digest.substring(0, 20));
        } else {
          modelLayers.push(layer);
        }
      }

      const isMultimodal = mmprojLayers.length > 0;
      const totalLayers = modelLayers.length + mmprojLayers.length;

      event.sender.send('llm:download-progress', {
        status: `Found ${modelLayers.length} model layers${isMultimodal ? ' + ' + mmprojLayers.length + ' vision layers' : ''}`,
        percent: 2
      });

      const downloadFile = (url: string, destPath: string, layerSize: number, layerIndex: number, totalLayersCount: number, fileType: 'model' | 'mmproj' = 'model') => {
        return new Promise<DownloadedLayer>((resolve, reject) => {
          const protocol = url.startsWith('https') ? https : http;
          const file = fs.createWriteStream(destPath);
          let downloadedBytes = 0;

          const request = protocol.get(url, (response: IncomingMessage) => {
            if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
              file.close();
              if (fs.existsSync(destPath)) fs.unlinkSync(destPath);

              const redirectUrl = response.headers.location;
              if (!redirectUrl) {
                reject(new Error('Redirect without location header'));
                return;
              }

              console.log(`[LLM] Following redirect to: ${redirectUrl}`);
              // Follow redirect
              downloadFile(redirectUrl, destPath, layerSize, layerIndex, totalLayersCount, fileType)
                .then(resolve)
                .catch(reject);
              return;
            }

            if (response.statusCode !== 200) {
              reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
              return;
            }

            const totalBytes = parseInt(response.headers['content-length'] ?? '0', 10) || layerSize;

            response.on('data', (chunk: Buffer) => {
              downloadedBytes += chunk.length;
              file.write(chunk);

              const layerProgress = Math.round((downloadedBytes / totalBytes) * 1000) / 10;

              if (Math.floor(layerProgress * 2) % 1 === 0) {
                const sizeMB = (downloadedBytes / 1024 / 1024).toFixed(1);
                const totalMB = (totalBytes / 1024 / 1024).toFixed(1);
                const prefix = fileType === 'mmproj' ? 'Vision' : 'Model';
                event.sender.send('llm:download-progress', {
                  status: `${prefix} ${layerIndex + 1}/${totalLayersCount}: ${sizeMB}MB / ${totalMB}MB`,
                  percent: Math.min(100, layerProgress)
                });
              }
            });

            response.on('end', () => {
              file.end();
              resolve({ path: destPath, size: downloadedBytes, type: fileType });
            });

            response.on('error', (err: Error) => {
              file.close();
              fs.unlinkSync(destPath);
              reject(err);
            });
          });

          request.on('error', (err: Error) => {
            file.close();
            if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
            reject(err);
          });

          file.on('error', (err: Error) => {
            file.close();
            if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
            reject(err);
          });
        });
      };

      // Download model layers
      const downloadedModelFiles: DownloadedLayer[] = [];
      for (let i = 0; i < modelLayers.length; i++) {
        const layer = modelLayers[i];
        if (!layer) {
          continue;
        }
        const digest = layer.digest;
        const size = layer.size;

        const blobUrl = `https://registry.ollama.ai/v2/${namespace}/blobs/${digest}`;
        const tempFileName = `${model.replace('/', '_')}-${tag}-model-${digest.replace('sha256:', '').substring(0, 12)}.tmp`;
        const tempFilePath = path.join(modelsDir, tempFileName);

        event.sender.send('llm:download-progress', {
          status: `Starting model layer ${i + 1}/${modelLayers.length}...`,
          percent: 2 + (i / totalLayers) * 93
        });

        const result = await downloadFile(blobUrl, tempFilePath, size, i, modelLayers.length, 'model');
        downloadedModelFiles.push(result);
      }

      // Download mmproj layers if multimodal
      const downloadedMmprojFiles: DownloadedLayer[] = [];
      if (isMultimodal) {
        for (let i = 0; i < mmprojLayers.length; i++) {
          const layer = mmprojLayers[i];
          if (!layer) {
            continue;
          }
          const digest = layer.digest;
          const size = layer.size;

          const blobUrl = `https://registry.ollama.ai/v2/${namespace}/blobs/${digest}`;
          const tempFileName = `${model.replace('/', '_')}-${tag}-mmproj-${digest.replace('sha256:', '').substring(0, 12)}.tmp`;
          const tempFilePath = path.join(modelsDir, tempFileName);

          event.sender.send('llm:download-progress', {
            status: `Starting vision layer ${i + 1}/${mmprojLayers.length}...`,
            percent: 2 + ((modelLayers.length + i) / totalLayers) * 93
          });

          const result = await downloadFile(blobUrl, tempFilePath, size, i, mmprojLayers.length, 'mmproj');
          downloadedMmprojFiles.push(result);
        }
      }

      event.sender.send('llm:download-progress', { status: 'Processing files...', percent: 95 });

      // Save main model (largest file from model layers)
      const initialModelFile = downloadedModelFiles[0];
      if (!initialModelFile) {
        throw new Error('No model layers were downloaded');
      }
      let largestModelFile = initialModelFile;
      for (const file of downloadedModelFiles) {
        if (file.size > largestModelFile.size) {
          largestModelFile = file;
        }
      }

      const finalModelName = `${model.replace('/', '_')}-${tag}.gguf`;
      const finalModelPath = path.join(modelsDir, finalModelName);
      fs.renameSync(largestModelFile.path, finalModelPath);

      // Save mmproj if exists (largest file from mmproj layers)
      let mmprojFileName = null;
      if (downloadedMmprojFiles.length > 0) {
        const initialMmprojFile = downloadedMmprojFiles[0];
        if (!initialMmprojFile) {
          throw new Error('No vision layers were downloaded');
        }
        let largestMmprojFile = initialMmprojFile;
        for (const file of downloadedMmprojFiles) {
          if (file.size > largestMmprojFile.size) {
            largestMmprojFile = file;
          }
        }

        mmprojFileName = `mmproj-${finalModelName}`;
        const finalMmprojPath = path.join(modelsDir, mmprojFileName);
        fs.renameSync(largestMmprojFile.path, finalMmprojPath);

        console.log('[LLM] Vision encoder saved:', mmprojFileName, `(${(largestMmprojFile.size / 1024 / 1024).toFixed(1)}MB)`);
      }

      event.sender.send('llm:download-progress', { status: 'Cleaning up...', percent: 97 });

      // Clean up temp files
      for (const file of [...downloadedModelFiles, ...downloadedMmprojFiles]) {
        if (file.path !== largestModelFile.path &&
            (!downloadedMmprojFiles.length || file.path !== downloadedMmprojFiles.find(f => f.size === Math.max(...downloadedMmprojFiles.map(f => f.size)))?.path) &&
            fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      }

      event.sender.send('llm:download-progress', {
        status: `Model ready${isMultimodal ? ' (with vision support)' : ''}`,
        percent: 100
      });

      console.log('[LLM] Model downloaded:', finalModelName, `(${(largestModelFile.size / 1024 / 1024).toFixed(1)}MB)`);

      return {
        success: true,
        modelFile: finalModelName,
        mmprojFile: mmprojFileName,
        isMultimodal,
        note: isMultimodal ? 'Multimodal model with vision support' : `Model saved as ${finalModelName}`
      };
    } catch (error) {
      console.error('[LLM] Pull error:', error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  // Download model from Hugging Face
  ipcMain.handle('llm:download-model', async (event: IpcMainInvokeEvent, url: string, customPath: string | null = null) => {
    try {
      const https = require('https');
      const modelsDir = getModelsDir(customPath);

      if (!fs.existsSync(modelsDir)) {
        fs.mkdirSync(modelsDir, { recursive: true });
      }

      // Extract filename from URL
      const urlParts = url.split('/');
      let filename = urlParts[urlParts.length - 1] || 'model.gguf';

      // Handle Hugging Face URLs and remove query parameters
      if (url.includes('huggingface.co') && url.includes('/resolve/')) {
        filename = urlParts[urlParts.length - 1] || filename;
      }
      filename = filename.split('?')[0] || filename;

      if (!filename.endsWith('.gguf')) {
        return { success: false, error: 'Invalid file: must be a .gguf model file' };
      }

      const filePath = path.join(modelsDir, filename);

      // Check if model has mmproj file (for multimodal support)
      let mmprojUrl = null;
      let mmprojFilename = null;

      if (url.includes('huggingface.co')) {
        event.sender.send('llm:download-progress', {
          status: 'Checking for vision support...',
          percent: 0
        });

        try {
          // Parse Hugging Face URL: https://huggingface.co/{org}/{repo}/resolve/{branch}/{file}
          const match = url.match(/huggingface\.co\/([^\/]+)\/([^\/]+)\/resolve\/([^\/]+)\//);
          if (match) {
            const [, org, repo, branch] = match;
            if (!org || !repo || !branch) {
              return { success: false, error: 'Unable to parse Hugging Face URL.' };
            }

            // Try to find mmproj in the same repo
            const apiUrl = `https://huggingface.co/api/models/${org}/${repo}/tree/${branch}`;
            const apiRes = await fetch(apiUrl);

            if (apiRes.ok) {
                const files = await apiRes.json() as HuggingFaceTreeEntry[];
              // Look for mmproj-*.gguf file
                const mmprojFile = files.find((f) => typeof f.path === 'string' && /mmproj.*\.gguf$/i.test(f.path));

              if (mmprojFile) {
                mmprojFilename = `mmproj-${filename}`;
                mmprojUrl = `https://huggingface.co/${org}/${repo}/resolve/${branch}/${mmprojFile.path}`;
                console.log('[LLM] Found mmproj in repo:', mmprojFile.path);
              } else {
                // Fallback: try ggml-org/{model}-GGUF repo
                const modelName = repo.replace(/-GGUF$/i, '');
                const fallbackApiUrl = `https://huggingface.co/api/models/ggml-org/${modelName}-GGUF/tree/main`;

                try {
                  const fallbackRes = await fetch(fallbackApiUrl);
                  if (fallbackRes.ok) {
                    const fallbackFiles = await fallbackRes.json() as HuggingFaceTreeEntry[];
                    const fallbackMmproj = fallbackFiles.find((f) => typeof f.path === 'string' && /mmproj.*\.gguf$/i.test(f.path));

                    if (fallbackMmproj) {
                      mmprojFilename = `mmproj-${filename}`;
                      mmprojUrl = `https://huggingface.co/ggml-org/${modelName}-GGUF/resolve/main/${fallbackMmproj.path}`;
                      console.log('[LLM] Found mmproj in fallback repo:', fallbackMmproj.path);
                    }
                  }
                } catch (fallbackErr) {
                  console.log('[LLM] No mmproj in fallback repo:', getErrorMessage(fallbackErr));
                }
              }
            }
          }
        } catch (apiError) {
          console.log('[LLM] Could not check for mmproj:', getErrorMessage(apiError));
        }
      }

      // Download main model file
      event.sender.send('llm:download-progress', {
        status: 'Starting model download...',
        percent: 1
      });

      await new Promise((resolve, reject) => {
        https.get(url, (response: IncomingMessage) => {
          if (response.statusCode === 302 || response.statusCode === 301) {
            // Follow redirect
            const redirectLocation = response.headers.location;
            if (!redirectLocation) {
              reject(new Error('Redirect without location header'));
              return;
            }
            https.get(redirectLocation, (redirectResponse: IncomingMessage) => {
              downloadFile(redirectResponse, filePath, event, resolve, reject, path, fs, 'model', mmprojUrl ? 50 : 100);
            });
          } else {
            downloadFile(response, filePath, event, resolve, reject, path, fs, 'model', mmprojUrl ? 50 : 100);
          }
        }).on('error', (err: Error) => {
          reject(new Error(`Download failed: ${err.message}`));
        });
      });

      // Download mmproj if found
      if (mmprojUrl && mmprojFilename) {
        event.sender.send('llm:download-progress', {
          status: 'Downloading vision support...',
          percent: 51
        });

        const mmprojPath = path.join(modelsDir, mmprojFilename);

        await new Promise((resolve, reject) => {
          https.get(mmprojUrl, (response: IncomingMessage) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
              const redirectLocation = response.headers.location;
              if (!redirectLocation) {
                resolve({ success: true });
                return;
              }
              https.get(redirectLocation, (redirectResponse: IncomingMessage) => {
                downloadFile(redirectResponse, mmprojPath, event, resolve, reject, path, fs, 'mmproj', 100, 50);
              });
            } else {
              downloadFile(response, mmprojPath, event, resolve, reject, path, fs, 'mmproj', 100, 50);
            }
          }).on('error', (err: Error) => {
            console.warn('[LLM] Failed to download mmproj (non-critical):', err.message);
            resolve({ success: true }); // Continue even if mmproj fails
          });
        });

        console.log('[LLM] Downloaded with vision support:', filename, '+', mmprojFilename);
        return {
          success: true,
          filename,
          mmprojFilename,
          isMultimodal: true,
          note: 'Model downloaded with vision support'
        };
      }

      console.log('[LLM] Downloaded model:', filename);
      return {
        success: true,
        filename,
        note: 'Model downloaded successfully'
      };
    } catch (error) {
      console.error('[LLM] Download error:', error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  // Delete model
  ipcMain.handle('llm:delete-model', async (_event: IpcMainInvokeEvent, filename: string, customPath: string | null = null) => {
    try {
      const modelsDir = getModelsDir(customPath);
      const filePath = path.join(modelsDir, filename);

      // Security: ensure file is within models directory
      const normalizedFilePath = path.normalize(filePath);
      const normalizedModelsDir = path.normalize(modelsDir);

      if (!normalizedFilePath.startsWith(normalizedModelsDir)) {
        throw new Error('Invalid file path');
      }

      if (!fs.existsSync(filePath)) {
        // List files in directory to help debug
        const files = fs.readdirSync(modelsDir);
        console.log('[LLM]   Files in directory:', files);
        throw new Error('Model not found');
      }

      // Delete main model file
      fs.unlinkSync(filePath);
      console.log('[LLM] Deleted model:', filename);

      // Also delete associated mmproj file if exists
      const mmprojFile = `mmproj-${filename}`;
      const mmprojPath = path.join(modelsDir, mmprojFile);
      if (fs.existsSync(mmprojPath)) {
        fs.unlinkSync(mmprojPath);
        console.log('[LLM] Deleted associated mmproj:', mmprojFile);
      }

      return { success: true };
    } catch (error) {
      console.error('[LLM] Delete error:', error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  ipcMain.handle('llm:import-model', async (_event: IpcMainInvokeEvent, sourcePath: string, customPath: string | null = null) => {
    try {
      console.log('[LLM] Importing model from:', sourcePath);
      const modelsDir = getModelsDir(customPath);

      if (!fs.existsSync(modelsDir)) {
        fs.mkdirSync(modelsDir, { recursive: true });
      }

      if (!sourcePath.endsWith('.gguf')) {
        throw new Error('Only .gguf files are supported');
      }

      const filename = path.basename(sourcePath);
      const destPath = path.join(modelsDir, filename);

      if (fs.existsSync(destPath)) {
        throw new Error(`Model "${filename}" already exists`);
      }

      fs.copyFileSync(sourcePath, destPath);

      console.log('[LLM] Model imported successfully:', filename);
      return { success: true, filename };
    } catch (error) {
      console.error('[LLM] Import model error:', error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  ipcMain.handle('llm:choose-models-folder', async () => {
    try {
      const { dialog } = require('electron');
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
        title: 'Select Models Folder',
        buttonLabel: 'Select Folder'
      });

      if (result.canceled || !result.filePaths.length) {
        return { success: false, canceled: true };
      }

      return { success: true, path: result.filePaths[0] };
    } catch (error) {
      console.error('[LLM] Choose folder error:', error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  ipcMain.handle('llm:choose-model-file', async () => {
    try {
      const { dialog } = require('electron');
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        title: 'Select GGUF Model File',
        buttonLabel: 'Import',
        filters: [
          { name: 'GGUF Models', extensions: ['gguf'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (result.canceled || !result.filePaths.length) {
        return { success: false, canceled: true };
      }

      return { success: true, path: result.filePaths[0] };
    } catch (error) {
      console.error('[LLM] Choose file error:', error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  ipcMain.handle('llm:backend-status', async (_event: IpcMainInvokeEvent, backend = 'auto') => {
    try {
      if (!llmBackendManager) {
        return { success: false, error: 'LLM backend manager unavailable' };
      }
      return llmBackendManager.getStatus({ backend });
    } catch (error) {
      console.error('[LLM] Backend status error:', error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  ipcMain.handle('llm:backend-install', async (event: IpcMainInvokeEvent, backend = 'auto') => {
    try {
      if (!llmBackendManager) {
        return { success: false, error: 'LLM backend manager unavailable' };
      }
      return await llmBackendManager.installBackend({ event, backend });
    } catch (error) {
      console.error('[LLM] Backend install error:', error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  ipcMain.handle('llm:backend-cancel-install', async () => {
    // node-llama-cpp setup is currently not cancellable mid-flight.
    return { success: false, error: 'Cancel is not supported for backend installation yet' };
  });
}

function downloadFile(
  response: IncomingMessage,
  filePath: string,
  event: IpcMainInvokeEvent,
  resolve: (value: { success: boolean; filename?: string }) => void,
  reject: (reason?: unknown) => void,
  path: typeof pathType,
  fs: typeof fsType,
  fileType: 'model' | 'mmproj' = 'model',
  maxPercent = 100,
  startPercent = 0,
) {
  const totalSize = parseInt(response.headers['content-length'] ?? '0', 10);
  let downloadedSize = 0;
  let lastReportedPercent = 0;

  const fileStream = fs.createWriteStream(filePath);

  response.pipe(fileStream);

  response.on('data', (chunk: Buffer) => {
    downloadedSize += chunk.length;
    const downloadPercent = Math.round((downloadedSize / totalSize) * 1000) / 10;
    const actualPercent = startPercent + (downloadPercent / 100) * (maxPercent - startPercent);

    if (Math.floor(actualPercent * 2) !== Math.floor(lastReportedPercent * 2)) {
      const downloadedMB = (downloadedSize / 1024 / 1024).toFixed(1);
      const totalMB = (totalSize / 1024 / 1024).toFixed(1);
      const prefix = fileType === 'mmproj' ? 'Vision' : 'Model';
      event.sender.send('llm:download-progress', {
        percent: Math.min(100, actualPercent),
        status: `${prefix}: ${downloadedMB}MB / ${totalMB}MB`
      });
      lastReportedPercent = actualPercent;
    }
  });

  fileStream.on('finish', () => {
    fileStream.close();
    event.sender.send('llm:download-progress', {
      percent: maxPercent,
      status: fileType === 'mmproj' ? 'Vision support ready' : `Download complete: ${path.basename(filePath)}`
    });
    resolve({ success: true, filename: path.basename(filePath) });
  });

  fileStream.on('error', (err: Error) => {
    fs.unlink(filePath, () => {});
    reject(new Error(`File write error: ${err.message}`));
  });
}
