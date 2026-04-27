export function createRuntimePaths({ app, path, fs, serverBasePath, isDevServer }) {
  function getRuntimeServerBasePath() {
    if (isDevServer) {
      return serverBasePath;
    }
    return path.join(app.getPath('userData'), 'server');
  }

  function getGPTSoVITSDataDir() {
    return path.join(getRuntimeServerBasePath(), 'gpt-sovits');
  }

  function ensureRuntimeServerScripts() {
    if (isDevServer) {
      return;
    }

    const runtimeServerDir = getRuntimeServerBasePath();
    const runtimeGPTDir = path.join(runtimeServerDir, 'gpt-sovits');
    const runtimeWhisperDir = path.join(runtimeServerDir, 'whisper-stt');

    fs.mkdirSync(runtimeGPTDir, { recursive: true });
    fs.mkdirSync(runtimeWhisperDir, { recursive: true });

    const filesToCopy = [
      { src: path.join(serverBasePath, 'gpt-sovits', 'setup.py'), dest: path.join(runtimeGPTDir, 'setup.py') },
      { src: path.join(serverBasePath, 'gpt-sovits', 'api.py'), dest: path.join(runtimeGPTDir, 'api.py') },
      { src: path.join(serverBasePath, 'gpt-sovits', 'requirements.txt'), dest: path.join(runtimeGPTDir, 'requirements.txt') },
      { src: path.join(serverBasePath, 'whisper-stt', 'server.py'), dest: path.join(runtimeWhisperDir, 'server.py') },
      { src: path.join(serverBasePath, 'whisper-stt', 'setup.py'), dest: path.join(runtimeWhisperDir, 'setup.py') },
      { src: path.join(serverBasePath, 'whisper-stt', 'requirements.txt'), dest: path.join(runtimeWhisperDir, 'requirements.txt') },
    ];

    for (const { src, dest } of filesToCopy) {
      if (!fs.existsSync(src)) {
        continue;
      }
      fs.copyFileSync(src, dest);
    }
  }

  return {
    getRuntimeServerBasePath,
    getGPTSoVITSDataDir,
    ensureRuntimeServerScripts,
  };
}
