import https from 'https';
import http from 'http';
import { pathToFileURL } from 'url';
import * as tar from 'tar';
import type { App, IpcMainInvokeEvent } from 'electron';
import type * as fsType from 'fs';
import type * as pathType from 'path';

const SUPPORTED_BACKENDS = ['auto', 'cpu', 'cuda', 'vulkan', 'metal'] as const;
const NODE_LLAMA_CPP_VERSION = '3.18.1';
const NODE_LLAMA_CORE_BUNDLE_FILENAME = 'node-llama-core.tgz';

type BackendName = (typeof SUPPORTED_BACKENDS)[number];
type InstallableBackend = Exclude<BackendName, 'auto'>;

type BackendPackage = {
  packageName: string;
  url: string;
};

type BackendPackageMap = Record<BackendName, BackendPackage | null>;

type InstalledBackendInfo = {
  ok?: boolean;
  version?: string | null;
  installedAt?: string | null;
  sourceUrl?: string | null;
  packageCachePath?: string | null;
  packageCacheBytes?: number | null;
  packageCachedAt?: string | null;
};

type PersistedState = {
  installedBackends: Partial<Record<BackendName, InstalledBackendInfo>>;
  updatedAt: string | null;
};

type DownloadArchiveResult = {
  cachedFilePath: string;
  downloadedBytes: number;
  totalBytes: number | null;
  cached: boolean;
};

type LLMBackendManagerDeps = {
  app: App;
  fs: typeof fsType;
  path: typeof pathType;
  platform?: NodeJS.Platform;
  arch?: string;
};

type InstallState = {
  backend: InstallableBackend;
  startedAt: number;
} | null;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function toNodeLlamaGpu(backend: BackendName): 'auto' | 'cuda' | 'vulkan' | 'metal' | false {
  switch (backend) {
    case 'cpu':
      return false;
    case 'cuda':
      return 'cuda';
    case 'vulkan':
      return 'vulkan';
    case 'metal':
      return 'metal';
    case 'auto':
      return 'auto';
    default:
      return 'auto';
  }
}

function normalizeBackend(backend: string | undefined | null): BackendName {
  if (!backend || typeof backend !== 'string') return 'auto';
  const normalized = backend.toLowerCase() as BackendName;
  return SUPPORTED_BACKENDS.includes(normalized) ? normalized : 'auto';
}

function getBackendSupport(platform: NodeJS.Platform): Record<BackendName, boolean> {
  return {
    auto: true,
    cpu: true,
    cuda: platform === 'win32' || platform === 'linux',
    vulkan: platform === 'win32' || platform === 'linux',
    metal: platform === 'darwin',
  };
}

function getBackendPackageMap(version: string, platform: NodeJS.Platform, arch: string): BackendPackageMap {
  const v = String(version || '').replace(/^\^/, '');

  if (platform === 'win32') {
    if (arch === 'x64') {
      return {
        auto: null,
        cpu: { packageName: '@node-llama-cpp/win-x64', url: `https://registry.npmjs.org/@node-llama-cpp/win-x64/-/win-x64-${v}.tgz` },
        cuda: { packageName: '@node-llama-cpp/win-x64-cuda', url: `https://registry.npmjs.org/@node-llama-cpp/win-x64-cuda/-/win-x64-cuda-${v}.tgz` },
        vulkan: { packageName: '@node-llama-cpp/win-x64-vulkan', url: `https://registry.npmjs.org/@node-llama-cpp/win-x64-vulkan/-/win-x64-vulkan-${v}.tgz` },
        metal: null,
      };
    }

    if (arch === 'arm64') {
      return {
        auto: null,
        cpu: { packageName: '@node-llama-cpp/win-arm64', url: `https://registry.npmjs.org/@node-llama-cpp/win-arm64/-/win-arm64-${v}.tgz` },
        cuda: null,
        vulkan: null,
        metal: null,
      };
    }
  }

  if (platform === 'linux') {
    if (arch === 'x64') {
      return {
        auto: null,
        cpu: { packageName: '@node-llama-cpp/linux-x64', url: `https://registry.npmjs.org/@node-llama-cpp/linux-x64/-/linux-x64-${v}.tgz` },
        cuda: { packageName: '@node-llama-cpp/linux-x64-cuda', url: `https://registry.npmjs.org/@node-llama-cpp/linux-x64-cuda/-/linux-x64-cuda-${v}.tgz` },
        vulkan: { packageName: '@node-llama-cpp/linux-x64-vulkan', url: `https://registry.npmjs.org/@node-llama-cpp/linux-x64-vulkan/-/linux-x64-vulkan-${v}.tgz` },
        metal: null,
      };
    }

    if (arch === 'arm64') {
      return {
        auto: null,
        cpu: { packageName: '@node-llama-cpp/linux-arm64', url: `https://registry.npmjs.org/@node-llama-cpp/linux-arm64/-/linux-arm64-${v}.tgz` },
        cuda: null,
        vulkan: null,
        metal: null,
      };
    }

    if (arch === 'arm') {
      return {
        auto: null,
        cpu: { packageName: '@node-llama-cpp/linux-armv7l', url: `https://registry.npmjs.org/@node-llama-cpp/linux-armv7l/-/linux-armv7l-${v}.tgz` },
        cuda: null,
        vulkan: null,
        metal: null,
      };
    }
  }

  if (platform === 'darwin') {
    if (arch === 'arm64') {
      return {
        auto: null,
        cpu: null,
        cuda: null,
        vulkan: null,
        metal: { packageName: '@node-llama-cpp/mac-arm64-metal', url: `https://registry.npmjs.org/@node-llama-cpp/mac-arm64-metal/-/mac-arm64-metal-${v}.tgz` },
      };
    }

    if (arch === 'x64') {
      return {
        auto: null,
        cpu: { packageName: '@node-llama-cpp/mac-x64', url: `https://registry.npmjs.org/@node-llama-cpp/mac-x64/-/mac-x64-${v}.tgz` },
        cuda: null,
        vulkan: null,
        metal: null,
      };
    }
  }

  return {
    auto: null,
    cpu: null,
    cuda: null,
    vulkan: null,
    metal: null,
  };
}

export function createLLMBackendManager({ app, fs, path, platform = process.platform, arch = process.arch }: LLMBackendManagerDeps) {
  const stateDir = path.join(app.getPath('userData'), 'llama-backends');
  const packageCacheDir = path.join(stateDir, 'packages');
  const runtimeRootDir = path.join(stateDir, 'runtime');
  const runtimeNodeModulesDir = path.join(runtimeRootDir, 'node_modules');
  const runtimeNodeLlamaDir = path.join(runtimeNodeModulesDir, 'node-llama-cpp');
  const runtimeNodeLlamaEntry = path.join(runtimeNodeLlamaDir, 'dist', 'index.js');
  const statePath = path.join(stateDir, 'state.json');
  const support = getBackendSupport(platform);
  const backendPackageMap = getBackendPackageMap(NODE_LLAMA_CPP_VERSION, platform, arch);

  let activeInstall: InstallState = null;

  const ensureStateDir = () => {
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }
    if (!fs.existsSync(packageCacheDir)) {
      fs.mkdirSync(packageCacheDir, { recursive: true });
    }
    if (!fs.existsSync(runtimeNodeModulesDir)) {
      fs.mkdirSync(runtimeNodeModulesDir, { recursive: true });
    }
  };

  const packageNameToPath = (name: string) => path.join(runtimeNodeModulesDir, ...name.split('/'));

  const resolveBundledCoreArchivePath = () => {
    const appPath = app.getAppPath();

    const candidates = [
      path.join(appPath, 'electron', 'assets', 'runtime', NODE_LLAMA_CORE_BUNDLE_FILENAME),
      path.join(path.dirname(appPath), 'app.asar.unpacked', 'electron', 'assets', 'runtime', NODE_LLAMA_CORE_BUNDLE_FILENAME),
      path.join(path.dirname(appPath), 'electron', 'assets', 'runtime', NODE_LLAMA_CORE_BUNDLE_FILENAME),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).size > 0) {
        return candidate;
      }
    }

    return null;
  };

  const installNodeLlamaCoreIntoRuntime = async ({ event, backend }: { event: IpcMainInvokeEvent | undefined; backend: BackendName }) => {
    ensureStateDir();
    const hasCoreRuntime = fs.existsSync(runtimeNodeLlamaEntry);

    const bundledArchivePath = resolveBundledCoreArchivePath();
    if (!bundledArchivePath) {
      throw new Error('Bundled node-llama core runtime archive is missing. Rebuild desktop package with runtime-core asset included.');
    }

    if (!hasCoreRuntime) {
      emitProgress(event, {
        backend,
        percent: 12,
        stage: 'preflight',
        status: 'Extracting bundled node-llama-cpp core runtime...',
      });

      const extractTempDir = path.join(packageCacheDir, `_extract-core-${Date.now()}-${Math.random().toString(16).slice(2)}`);
      fs.mkdirSync(extractTempDir, { recursive: true });

      try {
        await tar.x({
          file: bundledArchivePath,
          cwd: extractTempDir,
        });

        const extractedNodeModulesDir = path.join(extractTempDir, 'node_modules');
        if (!fs.existsSync(extractedNodeModulesDir)) {
          throw new Error('Invalid bundled node-llama core archive (missing node_modules)');
        }

        fs.mkdirSync(runtimeRootDir, { recursive: true });
        fs.rmSync(runtimeNodeModulesDir, { recursive: true, force: true });
        fs.cpSync(extractedNodeModulesDir, runtimeNodeModulesDir, { recursive: true });
      } finally {
        fs.rmSync(extractTempDir, { recursive: true, force: true });
      }

      emitProgress(event, {
        backend,
        percent: 32,
        stage: 'preflight',
        status: 'Runtime core bootstrap complete',
      });
    }

    if (!fs.existsSync(runtimeNodeLlamaEntry)) {
      throw new Error('Runtime core bootstrap failed: node-llama-cpp entrypoint missing after extraction');
    }
  };

  const installBackendPackageIntoRuntime = async ({ packageName, archivePath }: { packageName: string; archivePath: string }) => {
    ensureStateDir();

    const extractTempDir = path.join(packageCacheDir, `_extract-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    fs.mkdirSync(extractTempDir, { recursive: true });

    try {
      await tar.x({
        file: archivePath,
        cwd: extractTempDir,
      });
    } catch (error) {
      fs.rmSync(extractTempDir, { recursive: true, force: true });
      throw new Error(`Failed to extract backend package archive (${packageName}): ${getErrorMessage(error) || 'unknown error'}`);
    }

    const extractedPackageDir = path.join(extractTempDir, 'package');
    if (!fs.existsSync(extractedPackageDir)) {
      fs.rmSync(extractTempDir, { recursive: true, force: true });
      throw new Error(`Invalid backend package archive (${packageName}): missing package directory`);
    }

    const targetDir = packageNameToPath(packageName);
    fs.mkdirSync(path.dirname(targetDir), { recursive: true });
    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.cpSync(extractedPackageDir, targetDir, { recursive: true });
    fs.rmSync(extractTempDir, { recursive: true, force: true });
  };

  const loadRuntimeGetLlama = async () => {
    if (!fs.existsSync(runtimeNodeLlamaEntry)) {
      throw new Error('Runtime node-llama-cpp package is not available');
    }

    const runtimeModule = await import(pathToFileURL(runtimeNodeLlamaEntry).href);
    if (typeof runtimeModule.getLlama !== 'function') {
      throw new Error('Runtime node-llama-cpp did not expose getLlama()');
    }

    return runtimeModule.getLlama;
  };

  const loadRuntimeLlamaApi = async () => {
    if (!fs.existsSync(runtimeNodeLlamaEntry)) {
      throw new Error('Runtime node-llama-cpp package is not available');
    }

    const runtimeModule = await import(pathToFileURL(runtimeNodeLlamaEntry).href);
    if (typeof runtimeModule.getLlama !== 'function' || typeof runtimeModule.LlamaChat !== 'function') {
      throw new Error('Runtime node-llama-cpp API is incomplete');
    }

    return {
      getLlama: runtimeModule.getLlama,
      LlamaChat: runtimeModule.LlamaChat,
    };
  };

  const readState = (): PersistedState => {
    ensureStateDir();
    if (!fs.existsSync(statePath)) {
      return { installedBackends: {}, updatedAt: null };
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8')) as Partial<PersistedState>;
      return {
        installedBackends: parsed.installedBackends || {},
        updatedAt: parsed.updatedAt || null,
      };
    } catch {
      return { installedBackends: {}, updatedAt: null };
    }
  };

  const writeState = (nextState: PersistedState) => {
    ensureStateDir();
    fs.writeFileSync(statePath, JSON.stringify(nextState, null, 2), 'utf8');
  };

  const emitProgress = (event: IpcMainInvokeEvent | undefined, payload: Record<string, unknown>) => {
    if (event?.sender && !event.sender.isDestroyed()) {
      event.sender.send('llm:backend-install-progress', payload);
    }
  };

  const downloadBackendPackageWithProgress = ({ event, backend, url }: { event: IpcMainInvokeEvent | undefined; backend: BackendName; url: string }): Promise<DownloadArchiveResult> => {
    const cachedFilePath = path.join(packageCacheDir, `${backend}-${NODE_LLAMA_CPP_VERSION}.tgz`);

    return new Promise<DownloadArchiveResult>((resolve, reject) => {
      ensureStateDir();

      if (fs.existsSync(cachedFilePath)) {
        const stats = fs.statSync(cachedFilePath);
        if (stats.size > 0) {
          emitProgress(event, {
            backend,
            stage: 'download',
            percent: 80,
            downloadedBytes: stats.size,
            totalBytes: stats.size,
            status: `Using cached backend package: ${(stats.size / (1024 * 1024)).toFixed(1)}MB`,
          });
          resolve({
            cachedFilePath,
            downloadedBytes: stats.size,
            totalBytes: stats.size,
            cached: true,
          });
          return;
        }
        fs.unlinkSync(cachedFilePath);
      }

      const requestUrl = (nextUrl: string, redirects = 0) => {
        if (redirects > 5) {
          reject(new Error('Too many redirects while downloading backend package'));
          return;
        }

        const transport = nextUrl.startsWith('https:') ? https : http;
        const req = transport.get(nextUrl, (res) => {
          const statusCode = res.statusCode || 0;

          if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
            const redirectUrl = new URL(res.headers.location, nextUrl).toString();
            res.resume();
            requestUrl(redirectUrl, redirects + 1);
            return;
          }

          if (statusCode !== 200) {
            res.resume();
            reject(new Error(`Failed to download backend package (HTTP ${statusCode})`));
            return;
          }

          const totalBytes = Number.parseInt(res.headers['content-length'] || '0', 10) || 0;
          let downloadedBytes = 0;
          let lastPercent = -1;

          const fileStream = fs.createWriteStream(cachedFilePath);

          res.on('data', (chunk) => {
            downloadedBytes += chunk.length;

            if (totalBytes > 0) {
              const percent = Math.floor((downloadedBytes / totalBytes) * 100);
              if (percent !== lastPercent) {
                lastPercent = percent;
                emitProgress(event, {
                  backend,
                  stage: 'download',
                  percent: 50 + (percent * 0.3),
                  downloadedBytes,
                  totalBytes,
                  status: `Downloading backend package: ${(downloadedBytes / (1024 * 1024)).toFixed(1)}MB / ${(totalBytes / (1024 * 1024)).toFixed(1)}MB`,
                });
              }
            } else {
              emitProgress(event, {
                backend,
                stage: 'download',
                percent: 55,
                downloadedBytes,
                totalBytes: null,
                status: `Downloading backend package: ${(downloadedBytes / (1024 * 1024)).toFixed(1)}MB`,
              });
            }
          });

          res.on('error', (error) => {
            fileStream.destroy();
            reject(error);
          });

          fileStream.on('error', (error) => {
            res.destroy();
            reject(error);
          });

          fileStream.on('finish', () => {
            fileStream.close(() => resolve({ cachedFilePath, downloadedBytes, totalBytes: totalBytes || null, cached: false }));
          });

          res.pipe(fileStream);
        });

        req.on('error', reject);
      };

      requestUrl(url);
    });
  };

  const isBackendInstalled = (backend: string) => {
    const normalizedBackend = normalizeBackend(backend);
    if (normalizedBackend === 'auto') return true;

    const saved = readState();
    const savedInfo = saved.installedBackends[normalizedBackend];
    if (savedInfo?.version === NODE_LLAMA_CPP_VERSION && savedInfo?.ok === true) {
      return true;
    }

    return false;
  };

  const installBackend = async ({ event, backend }: { event?: IpcMainInvokeEvent; backend?: string } = {}) => {
    const normalizedBackend = normalizeBackend(backend);
    if (!support[normalizedBackend]) {
      return {
        success: false,
        error: `Backend "${normalizedBackend}" is not supported on ${platform}`,
      };
    }

    if (activeInstall) {
      return {
        success: false,
        error: 'Another backend installation is already in progress',
      };
    }

    if (normalizedBackend === 'auto') {
      return { success: false, error: 'Select a concrete backend to install' };
    }

    activeInstall = { backend: normalizedBackend, startedAt: Date.now() };

    try {
      emitProgress(event, {
        backend: normalizedBackend,
        percent: 10,
        stage: 'preflight',
        status: 'Checking existing backend binaries...',
      });

      await installNodeLlamaCoreIntoRuntime({ event, backend: normalizedBackend });

      const gpu = toNodeLlamaGpu(normalizedBackend);
      const getLlama = await loadRuntimeGetLlama();

      try {
        const dryRunLlama = await getLlama({
          gpu,
          build: 'never',
          skipDownload: true,
          usePrebuiltBinaries: true,
          progressLogs: false,
          dryRun: true,
        });

        await dryRunLlama?.dispose?.();

        const current = readState();
        current.installedBackends[normalizedBackend] = {
          ok: true,
          version: NODE_LLAMA_CPP_VERSION,
          installedAt: new Date().toISOString(),
          sourceUrl: backendPackageMap[normalizedBackend]?.url || null,
        };
        current.updatedAt = new Date().toISOString();
        writeState(current);

        emitProgress(event, {
          backend: normalizedBackend,
          percent: 100,
          stage: 'done',
          status: 'Backend already installed and ready',
        });

        return { success: true, backend: normalizedBackend, alreadyInstalled: true };
      } catch {
        // Continue into install attempt.
      }

      const backendPackage = backendPackageMap[normalizedBackend];
      if (backendPackage?.url && backendPackage?.packageName) {
        emitProgress(event, {
          backend: normalizedBackend,
          percent: 50,
          stage: 'download',
          status: 'Starting backend package download...',
        });

        let downloadedArchive: DownloadArchiveResult | null = null;
        try {
          downloadedArchive = await downloadBackendPackageWithProgress({
            event,
            backend: normalizedBackend,
            url: backendPackage.url,
          });

          await installBackendPackageIntoRuntime({
            packageName: backendPackage.packageName,
            archivePath: downloadedArchive.cachedFilePath,
          });

          emitProgress(event, {
            backend: normalizedBackend,
            percent: 80,
            stage: 'download',
            downloadedBytes: downloadedArchive.downloadedBytes,
            totalBytes: downloadedArchive.totalBytes,
            status: downloadedArchive.cached
              ? 'Backend package already cached and installed'
              : 'Backend package download complete and installed',
          });

          const cached = readState();
          const existing = cached.installedBackends[normalizedBackend] || {};
          cached.installedBackends[normalizedBackend] = {
            ...existing,
            packageCachePath: downloadedArchive.cachedFilePath,
            packageCacheBytes: downloadedArchive.downloadedBytes,
            packageCachedAt: new Date().toISOString(),
          };
          cached.updatedAt = new Date().toISOString();
          writeState(cached);
        } catch (downloadError) {
          emitProgress(event, {
            backend: normalizedBackend,
            percent: 50,
            stage: 'download',
            status: `Backend package download unavailable, continuing install: ${getErrorMessage(downloadError) || 'unknown error'}`,
          });
        }
      }

      emitProgress(event, {
        backend: normalizedBackend,
        percent: 82,
        stage: 'install',
        status: 'Installing backend binaries...',
      });

      const llama = await getLlama({
        gpu,
        build: 'never',
        skipDownload: true,
        usePrebuiltBinaries: true,
        progressLogs: true,
      });

      emitProgress(event, {
        backend: normalizedBackend,
        percent: 92,
        stage: 'verify',
        status: 'Verifying backend...',
      });

      await llama?.dispose?.();

      const next = readState();
      next.installedBackends[normalizedBackend] = {
        ok: true,
        version: NODE_LLAMA_CPP_VERSION,
        installedAt: new Date().toISOString(),
        sourceUrl: backendPackageMap[normalizedBackend]?.url || null,
        packageCachePath: next.installedBackends[normalizedBackend]?.packageCachePath || null,
        packageCacheBytes: next.installedBackends[normalizedBackend]?.packageCacheBytes || null,
        packageCachedAt: next.installedBackends[normalizedBackend]?.packageCachedAt || null,
      };
      next.updatedAt = new Date().toISOString();
      writeState(next);

      emitProgress(event, {
        backend: normalizedBackend,
        percent: 100,
        stage: 'done',
        status: 'Backend installed successfully',
      });

      return { success: true, backend: normalizedBackend };
    } catch (error) {
      emitProgress(event, {
        backend: normalizedBackend,
        percent: 100,
        stage: 'error',
        status: getErrorMessage(error) || 'Backend installation failed',
      });

      return { success: false, error: getErrorMessage(error) || 'Backend installation failed' };
    } finally {
      activeInstall = null;
    }
  };

  const getStatus = ({ backend }: { backend?: string } = {}) => {
    const normalizedBackend = normalizeBackend(backend || 'auto');
    const state = readState();

    const items = SUPPORTED_BACKENDS.map((name) => ({
      name,
      supported: !!support[name],
      installed: name === 'auto' ? true : !!(state.installedBackends[name]?.ok),
      version: state.installedBackends[name]?.version || null,
      sourceUrl: backendPackageMap[name]?.url || null,
      installedAt: state.installedBackends[name]?.installedAt || null,
      packageCachePath: state.installedBackends[name]?.packageCachePath || null,
      packageCacheBytes: state.installedBackends[name]?.packageCacheBytes || null,
      packageCachedAt: state.installedBackends[name]?.packageCachedAt || null,
    }));

    return {
      success: true,
      backend: normalizedBackend,
      installInProgress: activeInstall,
      supportedBackends: items,
      selectedInstalled: normalizedBackend === 'auto' ? true : !!(state.installedBackends[normalizedBackend]?.ok),
      packageVersion: NODE_LLAMA_CPP_VERSION,
    };
  };

  return {
    normalizeBackend,
    isBackendInstalled,
    installBackend,
    getStatus,
    loadRuntimeLlamaApi,
  };
}
