/**
 * Local AI HTTP Server
 * OpenAI-compatible endpoints on http://127.0.0.1:11438
 * 
 * Endpoints:
 *   POST /v1/chat/completions - LLM chat (streaming supported)
 *   POST /v1/audio/transcriptions - STT (proxied to Faster Whisper Python server)
 *   POST /v1/audio/speech - TTS (proxied to GPT-SoVITS)
 */

import express from 'express';
import axios from 'axios';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import FormData from 'form-data';
import multer from 'multer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class LocalAIServer {
  constructor({ loadLlamaApi, ensureTTSBackendRunning } = {}) {
    this.app = express();
    this.server = null;
    this.port = 11438;
    this.host = '127.0.0.1';
    
    // AI instances
    this.llama = null;
    this.llamaModel = null;
    this.llamaContext = null;
    this.llamaChat = null;
    this.currentModelPath = null;
    this.loadLlamaApi = loadLlamaApi || null;
    this.ensureTTSBackendRunning = typeof ensureTTSBackendRunning === 'function' ? ensureTTSBackendRunning : null;
    
    // On-demand loading state
    this.isLoadingModel = false;
    this.loadPromise = null;
    this.lastUsed = null;
    this.idleTimer = null;
    this.IDLE_TIMEOUT = 5 * 60 * 1000;
    
    // Configuration
    this.config = {
      llm: {
        modelPath: null,
        defaultModelsDir: null,
        backend: 'auto',
        temperature: 0.7,
        maxTokens: 2048,
        contextSize: 4096,
        gpuLayers: 'auto'
      },
      stt: {
        proxyUrl: 'http://127.0.0.1:9881'
      },
      tts: {
        proxyUrl: 'http://127.0.0.1:9880',
        enabled: false,
      },
      server: {
        shareOnNetwork: false,
        host: '127.0.0.1'
      }
    };

    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    const upload = multer({ 
      storage: multer.memoryStorage(),
      limits: { fileSize: 100 * 1024 * 1024 }
    });
    this.upload = upload;
    
    this.app.use(express.json({ limit: '100mb' }));
    this.app.use(express.raw({ type: 'audio/*', limit: '100mb' }));
    
    // CORS
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', '*');
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      next();
    });

    this.app.use((req, res, next) => {
      console.log(`[HTTP] ${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        llm: this.llamaModel !== null,
        stt: 'proxied',
        tts: 'proxied'
      });
    });

    this.app.post('/v1/chat/completions', async (req, res) => {
      try {
        await this.handleChatCompletion(req, res);
      } catch (error) {
        console.error('[LLM] Error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/v1/audio/transcriptions', this.upload.single('file'), async (req, res) => {
      try {
        await this.handleTranscription(req, res);
      } catch (error) {
        console.error('[STT] Error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/v1/audio/speech', async (req, res) => {
      try {
        await this.handleTextToSpeech(req, res);
      } catch (error) {
        console.error('[TTS] Error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/v1/models', (req, res) => {
      res.json({
        object: 'list',
        data: this.llamaModel ? [{
          id: path.basename(this.config.llm.modelPath),
          object: 'model',
          created: Date.now(),
          owned_by: 'local'
        }] : []
      });
    });
  }

  getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      const firstForwardedIp = forwarded.split(',')[0]?.trim();
      if (firstForwardedIp) {
        return firstForwardedIp;
      }
    }
    return req.ip || req.socket?.remoteAddress || '';
  }

  isLoopbackAddress(ipAddress) {
    if (!ipAddress || typeof ipAddress !== 'string') {
      return false;
    }
    const normalized = ipAddress.trim().toLowerCase();
    return (
      normalized === '127.0.0.1' ||
      normalized === '::1' ||
      normalized === '::ffff:127.0.0.1' ||
      normalized === 'localhost'
    );
  }

  async handleChatCompletion(req, res) {
    const { messages, stream = false, temperature, max_tokens, model, customModelsPath } = req.body;
    
    console.log('[LLM] Request received:');
    console.log('[LLM]   model:', model);
    console.log('[LLM]   customModelsPath:', customModelsPath);
    console.log('[LLM]   messages count:', messages?.length);

    if (model && model !== 'local') {
      let modelPath = model;
      
      if (!path.isAbsolute(model)) {
        let modelsDir;
        
        if (customModelsPath && fs.existsSync(customModelsPath)) {
          modelsDir = customModelsPath;
          console.log('[LLM] Using custom models directory:', modelsDir);
        } else if (this.config.llm.defaultModelsDir) {
          modelsDir = this.config.llm.defaultModelsDir;
          console.log('[LLM] Using default models directory:', modelsDir);
        } else {
          modelsDir = this.config.llm.modelPath ? path.dirname(this.config.llm.modelPath) : null;
          console.log('[LLM] Using fallback models directory:', modelsDir);
        }
        
        if (modelsDir && fs.existsSync(modelsDir)) {
          const exactPath = path.join(modelsDir, model);
          if (fs.existsSync(exactPath)) {
            modelPath = exactPath;
          } else {
            const files = fs.readdirSync(modelsDir);
            const modelLower = model.toLowerCase();
            const match = files.find(f => 
              f.toLowerCase() === modelLower || 
              f.toLowerCase().includes(modelLower.split(':')[0])
            );
            if (match) {
              modelPath = path.join(modelsDir, match);
            }
          }
        }
      }
      
      console.log('[LLM] Resolved modelPath:', modelPath);
      console.log('[LLM] Current config.llm.modelPath:', this.config.llm.modelPath);
      console.log('[LLM] Paths match?', modelPath === this.config.llm.modelPath);
      console.log('[LLM] Model exists?', fs.existsSync(modelPath));
      
      if (modelPath !== this.config.llm.modelPath && fs.existsSync(modelPath)) {
        console.log('[LLM] Request specified different model, updating config');
        console.log('[LLM]   Old:', this.config.llm.modelPath);
        console.log('[LLM]   New:', modelPath);
        this.config.llm.modelPath = modelPath;
      }
    }

    try {
      await this.ensureModelLoaded();
    } catch (error) {
      console.error('[LLM] Failed to load model:', error);
      return res.status(503).json({ error: `Failed to load model: ${error.message}` });
    }

    if (!this.llamaChat) {
      return res.status(503).json({ error: 'LLM model not available' });
    }

    console.log('[LLM] Processing request with', messages.length, 'messages');

    const chatHistory = [];
    
    for (const msg of messages) {
      if (msg.role === 'system') {
        chatHistory.push({
          type: 'system',
          text: msg.content
        });
      } else if (msg.role === 'user') {
        chatHistory.push({
          type: 'user',
          text: msg.content
        });
      } else if (msg.role === 'assistant') {
        chatHistory.push({
          type: 'model',
          response: [msg.content]
        });
      }
    }

    chatHistory.push({
      type: 'model',
      response: []
    });

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      try {
        await this.llamaChat.generateResponse(chatHistory, {
          temperature: temperature ?? this.config.llm.temperature,
          maxTokens: max_tokens ?? this.config.llm.maxTokens,
          onTextChunk: (chunk) => {
            const chunkData = {
              id: `chatcmpl-${Date.now()}`,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: path.basename(this.config.llm.modelPath),
              choices: [{
                index: 0,
                delta: { content: chunk },
                finish_reason: null
              }]
            };

            res.write(`data: ${JSON.stringify(chunkData)}\n\n`);
          }
        });

        const finalChunk = {
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: path.basename(this.config.llm.modelPath),
          choices: [{
            index: 0,
            delta: {},
            finish_reason: 'stop'
          }]
        };

        res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();

      } catch (error) {
        console.error('[LLM] Streaming error:', error);
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
      }

    } else {
      const result = await this.llamaChat.generateResponse(chatHistory, {
        temperature: temperature ?? this.config.llm.temperature,
        maxTokens: max_tokens ?? this.config.llm.maxTokens
      });
      
      const responseText = result.response;

      res.json({
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: path.basename(this.config.llm.modelPath),
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: responseText
          },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        }
      });
    }
  }

  async handleTranscription(req, res) {
    try {
      console.log('[STT] Proxying to Faster Whisper server:', this.config.stt.proxyUrl);
      
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ error: 'No audio file provided' });
      }
      
      const formData = new FormData();
      formData.append('file', req.file.buffer, {
        filename: 'audio.wav',
        contentType: req.file.mimetype || 'audio/wav'
      });

      const requestModel = typeof req.body?.model === 'string' ? req.body.model.trim() : '';
      const requestLanguage = typeof req.body?.language === 'string' ? req.body.language.trim() : '';
      const defaultModel = typeof this.config.stt?.model === 'string' ? this.config.stt.model.trim() : '';
      const defaultLanguage = typeof this.config.stt?.language === 'string' ? this.config.stt.language.trim() : '';
      const clientIp = this.getClientIp(req);
      const isRemoteRequest = !this.isLoopbackAddress(clientIp);

      const resolvedModel = isRemoteRequest
        ? (defaultModel || requestModel)
        : (requestModel || defaultModel);
      const resolvedLanguage = isRemoteRequest
        ? (defaultLanguage || requestLanguage)
        : (requestLanguage || defaultLanguage);

      if (resolvedModel) {
        formData.append('model', resolvedModel);
      }
      if (resolvedLanguage) {
        formData.append('language', resolvedLanguage);
      }
      
      if (req.body) {
        for (const [key, value] of Object.entries(req.body)) {
          if (key === 'model' || key === 'language') {
            continue;
          }
          formData.append(key, value);
        }
      }

      const response = await axios.post(
        `${this.config.stt.proxyUrl}/v1/audio/transcriptions`,
        formData,
        {
          headers: formData.getHeaders(),
          timeout: 60000
        }
      );

      res.json(response.data);
    } catch (error) {
      console.error('[STT] Proxy error:', error.message);
      if (error.response) {
        return res.status(error.response.status).json(error.response.data);
      }
      res.status(500).json({ 
        error: 'STT proxy failed',
        details: error.message
      });
    }
  }

  async handleTextToSpeech(req, res) {
    const { input, reference_audio, reference_text, reference_language = 'en' } = req.body;

    if (!input) {
      return res.status(400).json({ error: 'No text provided' });
    }

    if (this.config.tts?.enabled !== true) {
      return res.status(503).json({
        error: 'TTS is disabled',
        details: 'Desktop-local TTS is not active in settings.',
      });
    }

    try {
      if (this.ensureTTSBackendRunning) {
        await this.ensureTTSBackendRunning();
      }

      const requestBody = {
        input: input,
        reference_audio: reference_audio || null,
        reference_text: reference_text || '',
        reference_language: reference_language
      };
      
      console.log('[TTS] Forwarding to GPT-SoVITS:', {
        textLength: input.length,
        hasReferenceAudio: !!reference_audio,
        referenceTextLength: reference_text?.length || 0,
        language: reference_language
      });
      
      const response = await axios.post(`${this.config.tts.proxyUrl}/tts`, requestBody, {
        headers: { 'Content-Type': 'application/json' },
        responseType: 'arraybuffer',
        timeout: 30000
      });

      // Return audio
      res.setHeader('Content-Type', 'audio/wav');
      res.send(Buffer.from(response.data));

    } catch (error) {
      console.error('[TTS] Proxy error:', error.message);
      if (error.response) {
        console.error('[TTS] GPT-SoVITS error:', error.response.status, error.response.statusText);
      }
      throw new Error('TTS service unavailable');
    }
  }

  async initialize(config = {}) {
    console.log('[Server] Initializing...');
    console.log('[Server] Received config:', JSON.stringify(config, null, 2));
    
    if (config.llm?.modelPath && !this.config.llm.defaultModelsDir) {
      this.config.llm.defaultModelsDir = path.dirname(config.llm.modelPath);
      console.log('[Server] Default models directory set to:', this.config.llm.defaultModelsDir);
    }
    
    Object.assign(this.config.llm, config.llm || {});
    Object.assign(this.config.stt, config.stt || {});
    Object.assign(this.config.tts, config.tts || {});
    Object.assign(this.config.server, config.server || {});
    const configuredPort = Number(this.config.server?.port);
    if (Number.isInteger(configuredPort) && configuredPort >= 1 && configuredPort <= 65535) {
      this.port = configuredPort;
    } else {
      this.port = 11438;
    }
    this.host = this.config.server?.shareOnNetwork ? '0.0.0.0' : (this.config.server?.host || '127.0.0.1');
    
    console.log('[Server] Final this.config:', JSON.stringify(this.config, null, 2));
    console.log('[Server] LLM will be loaded on first request');
    console.log('[Server] STT will be proxied to:', this.config.stt.proxyUrl);

    this.startIdleTimeoutChecker();

    console.log('[Server] Initialization complete');
  }

  /**
   * Ensure LLM model is loaded (lazy loading with auto-reload on model change)
   * If model is already loaded and matches config, update last used time
   * If model path changed, unload old model and load new one
   * If model is loading, wait for it to finish
   * If model is not loaded, load it now
   */
  async ensureModelLoaded() {
    console.log('[LLM] ensureModelLoaded() - Current model:', this.currentModelPath);
    console.log('[LLM] ensureModelLoaded() - Config model:', this.config.llm.modelPath);
    
    if (!this.config.llm.modelPath) {
      throw new Error('No LLM model configured');
    }

    if (!fs.existsSync(this.config.llm.modelPath)) {
      throw new Error('LLM model file not found');
    }

    // Check if we need to reload due to model change
    if (this.llamaChat && this.llamaModel && this.currentModelPath !== this.config.llm.modelPath) {
      console.log('[LLM] Model changed from', this.currentModelPath, 'to', this.config.llm.modelPath);
      console.log('[LLM] Unloading old model and loading new one...');
      await this.unloadModel();
    }

    // If already loaded with correct model, just update timestamp and reset idle timer
    if (this.llamaChat && this.llamaModel && this.currentModelPath === this.config.llm.modelPath) {
      this.lastUsed = Date.now();
      this.resetIdleTimer();
      return;
    }

    // If currently loading, wait for it to finish
    if (this.isLoadingModel && this.loadPromise) {
      console.log('[LLM] Model is already loading, waiting...');
      await this.loadPromise;
      this.lastUsed = Date.now();
      this.resetIdleTimer();
      return;
    }

    if (!this.config.llm.modelPath) {
      throw new Error('No LLM model configured');
    }

    if (!fs.existsSync(this.config.llm.modelPath)) {
      throw new Error('LLM model file not found');
    }

    this.isLoadingModel = true;
    this.loadPromise = this.loadModel();

    try {
      await this.loadPromise;
      this.lastUsed = Date.now();
      this.resetIdleTimer();
    } finally {
      this.isLoadingModel = false;
      this.loadPromise = null;
    }
  }

  /**
   * Load the LLM model
   */
  async loadModel() {
    try {
      console.log('[LLM] Loading model on-demand...');
      console.log('[LLM]   Model:', this.config.llm.modelPath);
      console.log('[LLM]   Backend:', this.config.llm.backend || 'auto');

      const backendToGpu = {
        auto: 'auto',
        cpu: false,
        cuda: 'cuda',
        vulkan: 'vulkan',
        metal: 'metal',
        rocm: false,
      };
      const selectedGpu = backendToGpu[this.config.llm.backend] ?? 'auto';

      let getLlamaFn = null;
      let LlamaChatClass = null;

      if (!this.loadLlamaApi) {
        throw new Error('Runtime llama API loader is not configured');
      }

      const runtimeApi = await this.loadLlamaApi();
      getLlamaFn = runtimeApi.getLlama;
      LlamaChatClass = runtimeApi.LlamaChat;

      if (typeof getLlamaFn !== 'function' || typeof LlamaChatClass !== 'function') {
        throw new Error('node-llama-cpp runtime API unavailable');
      }
      
      this.llama = await getLlamaFn({
        gpu: selectedGpu
      });
      const gpuType = this.llama.gpu || 'cpu';
      console.log('[LLM]   GPU:', gpuType);
      
      this.llamaModel = await this.llama.loadModel({
        modelPath: this.config.llm.modelPath,
        gpuLayers: this.config.llm.gpuLayers
      });
      console.log('[LLM]   Layers on GPU:', this.llamaModel.gpuLayers);
      
      this.llamaContext = await this.llamaModel.createContext({
        contextSize: this.config.llm.contextSize
      });
      
      this.llamaChat = new LlamaChatClass({
        contextSequence: this.llamaContext.getSequence()
      });
      
      this.currentModelPath = this.config.llm.modelPath;
      
      console.log('[LLM] Model loaded successfully');
    } catch (error) {
      console.error('[LLM] Failed to load model:', error);
      this.llamaChat = null;
      this.llamaContext = null;
      this.llamaModel = null;
      this.llama = null;
      this.currentModelPath = null;
      throw error;
    }
  }

  /**
   * Unload the LLM model to free memory
   */
  async unloadModel() {
    if (!this.llamaModel) {
      return;
    }

    console.log('[LLM] Unloading model...');
    
    try {
      this.llamaChat = null;
      
      if (this.llamaContext) {
        await this.llamaContext.dispose();
        this.llamaContext = null;
      }
      
      if (this.llamaModel) {
        await this.llamaModel.dispose();
        this.llamaModel = null;
      }
      
      this.llama = null;
      this.lastUsed = null;
      this.currentModelPath = null;
      
      console.log('[LLM] Model unloaded successfully');
    } catch (error) {
      console.error('[LLM] Error unloading model:', error);
    }
  }

  /**
   * Start the idle timeout checker (runs every minute)
   */
  startIdleTimeoutChecker() {
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
    }

    // Check every minute
    this.idleTimer = setInterval(() => {
      if (this.lastUsed && this.llamaModel) {
        const idleTime = Date.now() - this.lastUsed;
        if (idleTime > this.IDLE_TIMEOUT) {
          console.log(`[LLM] Model idle for ${Math.round(idleTime / 1000)}s, unloading...`);
          this.unloadModel();
        }
      }
    }, 60000);
  }

  /**
   * Reset the idle timer (called when model is used)
   */
  resetIdleTimer() {
    this.lastUsed = Date.now();
  }

  async start() {
    if (this.server) {
      return;
    }

    return new Promise((resolve, reject) => {
      const listener = this.app.listen(this.port, this.host);

      listener.once('listening', () => {
        this.server = listener;
        const urls = this._getAccessibleUrls();
        console.log(`[Server] Started on ${urls.join(', ')}`);
        resolve();
      });

      listener.once('error', (error) => {
        this.server = null;
        console.error('[Server] Failed to start:', error);
        reject(error);
      });
    });
  }

  async stop() {
    console.log('[Server] Stopping...');
    
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
    
    if (this.whisperContext) {
      await this.whisperContext.release();
      this.whisperContext = null;
    }
    
    if (this.llamaContext) {
      await this.llamaContext.dispose();
      this.llamaContext = null;
    }
    
    if (this.llamaModel) {
      await this.llamaModel.dispose();
      this.llamaModel = null;
    }
    
    if (this.server) {
      await new Promise((resolve) => {
        this.server.close(resolve);
      });
      this.server = null;
    }
    
    console.log('[Server] Stopped');
  }

  getStatus() {
    const gpuType = this.llama?.gpu || 'cpu';
    const idleTime = this.lastUsed ? Date.now() - this.lastUsed : null;
    
    return {
      running: this.server !== null,
      server: {
        host: this.host,
        shareOnNetwork: this.host === '0.0.0.0',
        port: this.port,
        urls: this._getAccessibleUrls(),
      },
      llm: {
        loaded: this.llamaModel !== null,
        loading: this.isLoadingModel,
        model: this.config.llm.modelPath ? path.basename(this.config.llm.modelPath) : null,
        gpu: gpuType,
        gpuLayers: this.llamaModel?.gpuLayers || 0,
        idleSeconds: idleTime ? Math.round(idleTime / 1000) : null
      },
      stt: {
        proxyUrl: this.config.stt.proxyUrl
      },
      tts: {
        proxyUrl: this.config.tts.proxyUrl
      }
    };
  }

  _getAccessibleUrls() {
    const urls = [];
    if (this.host === '0.0.0.0') {
      urls.push(`http://127.0.0.1:${this.port}`);
      const nets = os.networkInterfaces();
      for (const ifName of Object.keys(nets)) {
        for (const net of nets[ifName] || []) {
          if (net && net.family === 'IPv4' && !net.internal) {
            urls.push(`http://${net.address}:${this.port}`);
          }
        }
      }
      return Array.from(new Set(urls));
    }

    if (this.host === '127.0.0.1' || this.host === 'localhost') {
      return [`http://127.0.0.1:${this.port}`];
    }

    return [`http://${this.host}:${this.port}`];
  }
}
