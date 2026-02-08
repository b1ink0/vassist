/**
 * AIService - Multi-provider AI service
 * 
 * Unified interface for Chrome AI, OpenAI, and Ollama.
 */

import OpenAI from 'openai';
import { AIProviders } from '../config/aiConfig';
import { PromptConfig } from '../config/promptConfig';
import ChromeAIValidator from './ChromeAIValidator';
import Logger from './LoggerService';
import FrameCaptureService from './FrameCaptureService';

class AIService {
  constructor() {
    this.isExtensionMode = __EXTENSION_MODE__;
    
    if (this.isExtensionMode) {
      this.tabStates = new Map();
    } else {
      this.client = null;
      this.provider = null;
      this.config = null;
      this.abortController = null;
      this.chromeAISession = null;
      this.chromeAIUtilitySession = null; // Separate session for utility calls (analyzer, etc.)
    }
  }

  /**
   * Initialize state for a tab (extension mode only)
   * @param {number} tabId - Tab ID
   */
  initTab(tabId) {
    if (!this.isExtensionMode) return;
    
    if (!this.tabStates.has(tabId)) {
      this.tabStates.set(tabId, {
        client: null,
        config: null,
        provider: null,
        abortController: null,
        chromeAISession: null,
        chromeAIUtilitySession: null, // Separate session for utility calls (analyzer, etc.)
      });
      Logger.log('AIService', `Tab ${tabId} initialized`);
    }
  }

  /**
   * Cleanup tab state (extension mode only)
   * @param {number} tabId - Tab ID
   */
  cleanupTab(tabId) {
    if (!this.isExtensionMode) return;
    
    const state = this.tabStates.get(tabId);
    if (state) {
      if (state.abortController) {
        state.abortController.abort();
      }
      this.tabStates.delete(tabId);
      Logger.log('AIService', `Tab ${tabId} cleaned up`);
    }
  }

  /**
   * Get state object for current context
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {Object} State object
   */
  _getState(tabId = null) {
    if (this.isExtensionMode) {
      this.initTab(tabId);
      return this.tabStates.get(tabId);
    }
    return this; // In dev mode, state is on the instance itself
  }

  /**
   * Configure AI client with provider settings
   * Dev mode: configure(config)
   * Extension mode: configure(config, tabId)
   * @param {Object} config - Config object
   * @param {number|null} tabId - Tab ID (extension mode only)
   * @returns {Promise<boolean>} Success status
   */
  configure(config, tabId = null) {
    const state = this._getState(tabId);
    const { provider } = config;
    const logPrefix = this.isExtensionMode ? `[AIService] Tab ${tabId}` : '[AIService]';
    Logger.log('other', `${logPrefix} - Configuring provider: ${provider}`);
    
    try {
      if (provider === AIProviders.CHROME_AI || provider === 'chrome-ai') {
        if (!ChromeAIValidator.isSupported()) {
          throw new Error('Chrome AI not supported. Chrome 138+ required.');
        }
        
        const chromeAiConfig = config.chromeAi || config;
        const newImageSupport = chromeAiConfig.enableImageSupport !== false;
        const newAudioSupport = chromeAiConfig.enableAudioSupport !== false;
        
        // Check if image or audio support settings changed
        const imageSupportChanged = state.config && 
          (state.config.enableImageSupport !== newImageSupport);
        const audioSupportChanged = state.config && 
          (state.config.enableAudioSupport !== newAudioSupport);
        
        // If image or audio support changed, destroy existing session to force recreation
        if ((imageSupportChanged || audioSupportChanged) && state.chromeAISession) {
          Logger.log('other', `${logPrefix} - Multi-modal support changed, destroying existing session`);
          try {
            state.chromeAISession.destroy();
          } catch (error) {
            Logger.warn('other', `${logPrefix} - Error destroying main session:`, error);
          }
          state.chromeAISession = null;
        }
        
        // Also destroy utility session if multi-modal support changed
        if ((imageSupportChanged || audioSupportChanged) && state.chromeAIUtilitySession) {
          Logger.log('other', `${logPrefix} - Multi-modal support changed, destroying utility session`);
          try {
            state.chromeAIUtilitySession.destroy();
          } catch (error) {
            Logger.warn('other', `${logPrefix} - Error destroying utility session:`, error);
          }
          state.chromeAIUtilitySession = null;
        }
        
        state.config = {
          temperature: chromeAiConfig.temperature,
          topK: chromeAiConfig.topK,
          enableImageSupport: newImageSupport,
          enableAudioSupport: newAudioSupport,
        };
        
        Logger.log('other', `${logPrefix} - Chrome AI configured:`, state.config);
      }
      else if (provider === AIProviders.OPENAI || provider === 'openai') {
        const openaiConfig = config.openai || config;
        state.client = new OpenAI({
          apiKey: openaiConfig.apiKey,
          dangerouslyAllowBrowser: !this.isExtensionMode,
        });
        
        state.config = {
          model: openaiConfig.model,
          temperature: openaiConfig.temperature,
          maxTokens: openaiConfig.maxTokens,
          enableImageSupport: openaiConfig.enableImageSupport !== false,
          enableAudioSupport: openaiConfig.enableAudioSupport !== false,
          routing: openaiConfig.routing || { enabled: false },
        };
        
        Logger.log('other', `${logPrefix} - OpenAI configured:`, {
          model: state.config.model,
          temperature: state.config.temperature,
          maxTokens: state.config.maxTokens,
        });
      } 
      else if (provider === AIProviders.OLLAMA || provider === 'ollama') {
        const ollamaConfig = config.ollama || config;
        let endpoint = ollamaConfig.endpoint || 'http://localhost:11434';
        
        // Only append /v1 if not already present
        if (!endpoint.endsWith('/v1')) {
          endpoint = endpoint.replace(/\/$/, '') + '/v1';
        }
        
        state.client = new OpenAI({
          apiKey: 'ollama',
          baseURL: endpoint,
          dangerouslyAllowBrowser: !this.isExtensionMode,
        });
        
        state.config = {
          model: ollamaConfig.model,
          temperature: ollamaConfig.temperature,
          maxTokens: ollamaConfig.maxTokens,
          enableImageSupport: ollamaConfig.enableImageSupport !== false,
          enableAudioSupport: ollamaConfig.enableAudioSupport !== false,
          routing: ollamaConfig.routing || { enabled: false },
        };
        
        Logger.log('other', `${logPrefix} - Ollama configured:`, {
          endpoint: ollamaConfig.endpoint,
          model: state.config.model,
        });
      }
      else if (provider === AIProviders.ANDROID_LOCAL || provider === 'android-local') {
        const androidConfig = config['android-local'] || {};
        let endpoint = androidConfig.endpoint || 'http://127.0.0.1:8765';
        
        if (!endpoint.endsWith('/v1')) {
          endpoint = endpoint.replace(/\/$/, '') + '/v1';
        }
        
        state.client = new OpenAI({
          apiKey: 'android-local',
          baseURL: endpoint,
          dangerouslyAllowBrowser: true,
        });
        
        state.config = {
          model: androidConfig.model || 'qwen3-local',
          temperature: androidConfig.temperature || 0.7,
          maxTokens: androidConfig.maxTokens || 2048,
          enableImageSupport: false,
          routing: androidConfig.routing || { enabled: false },
          enableAudioSupport: false,
        };
        
        Logger.log('other', `${logPrefix} - Android local LLM configured:`, {
          endpoint: endpoint,
          model: state.config.model,
        });
      }
      else if (provider === AIProviders.DESKTOP_LOCAL || provider === 'desktop-local') {
        const desktopConfig = config['desktop-local'] || {};
        let endpoint = desktopConfig.endpoint || 'http://127.0.0.1:11438';
        
        if (!endpoint.endsWith('/v1')) {
          endpoint = endpoint.replace(/\/$/, '') + '/v1';
        }
        
        state.client = new OpenAI({
          apiKey: 'desktop-local',
          baseURL: endpoint,
          dangerouslyAllowBrowser: true,
        });
        
        state.config = {
          model: desktopConfig.model || 'qwen3:0.6b',
          temperature: desktopConfig.temperature || 0.7,
          maxTokens: desktopConfig.maxTokens || 2048,
          customModelsPath: desktopConfig.customModelsPath || null,
          enableImageSupport: false,
          routing: desktopConfig.routing || { enabled: false },
          enableAudioSupport: false,
        };
        
        Logger.log('other', `${logPrefix} - Desktop local LLM configured:`, {
          endpoint: endpoint,
          model: state.config.model,
        });
      } else {
        throw new Error(`Unknown provider: ${provider}`);
      }
      
      state.provider = provider;
      return true;
      
    } catch (error) {
      Logger.error('other', `${logPrefix} - Configuration failed:`, error);
      state.client = null;
      state.config = null;
      state.provider = null;
      throw error;
    }
  }

  /**
   * Check if service is configured and ready
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {boolean} True if ready
   */
  isConfigured(tabId = null) {
    const state = this._getState(tabId);
    
    if (!state || !state.config || !state.provider) {
      return false;
    }
    if (state.provider === 'chrome-ai' || state.provider === AIProviders.CHROME_AI) {
      return true;
    }
    return state.client !== null;
  }

  /**
   * Get current provider name
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {string|null} Provider name or null
   */
  getCurrentProvider(tabId = null) {
    const state = this._getState(tabId);
    return state?.provider || null;
  }

  /**
   * Convert data URL to Blob
   * @param {string} dataUrl - Data URL (e.g., data:image/jpeg;base64,...)
   * @returns {Blob} Image blob
   */
  _dataUrlToBlob(dataUrl) {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  }

  /**
   * Convert data URL to ArrayBuffer
   * @param {string} dataUrl - Data URL (e.g., data:audio/wav;base64,...)
   * @returns {ArrayBuffer} Audio array buffer
   */
  _dataUrlToArrayBuffer(dataUrl) {
    const arr = dataUrl.split(',');
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return u8arr.buffer;
  }

  /**
   * Format messages for multi-modal support
   * Converts ChatManager format to provider-specific format
   * @param {Array} messages - Messages from ChatManager
   * @param {string} provider - Provider name
   * @returns {Array} Formatted messages
   */
  _formatMultiModalMessages(messages, provider) {
    return messages.map(msg => {
      // Check if multi-modal (has images or audios)
      const hasImages = msg.images && msg.images.length > 0;
      const hasAudios = msg.audios && msg.audios.length > 0;
      
      // If no attachments, return as-is
      if (!hasImages && !hasAudios) {
        return { role: msg.role, content: msg.content };
      }

      // Multi-modal message with images and/or audios
      if (provider === AIProviders.CHROME_AI || provider === 'chrome-ai') {
        // Chrome AI format: content is array of {type, value}
        const content = [
          { type: 'text', value: msg.content }
        ];
        
        // Add images
        if (hasImages) {
          for (const imageDataUrl of msg.images) {
            content.push({
              type: 'image',
              value: this._dataUrlToBlob(imageDataUrl)
            });
          }
        }
        
        // Add audios
        if (hasAudios) {
          for (const audioDataUrl of msg.audios) {
            content.push({
              type: 'audio',
              value: this._dataUrlToArrayBuffer(audioDataUrl)
            });
          }
        }
        
        return { role: msg.role, content };
      } else {
        // OpenAI/Ollama format: content is array of {type, text/image_url/input_audio}
        const content = [
          { type: 'text', text: msg.content }
        ];
        
        // Add images
        if (hasImages) {
          for (const imageDataUrl of msg.images) {
            content.push({
              type: 'image_url',
              image_url: { url: imageDataUrl }
            });
          }
        }
        
        // Add audios (OpenAI format for audio input)
        if (hasAudios) {
          for (const audioDataUrl of msg.audios) {
            // Extract base64 data from data URL
            const base64Data = audioDataUrl.split(',')[1];
            content.push({
              type: 'input_audio',
              input_audio: { 
                data: base64Data,
                format: 'wav' // Default to wav, can be made dynamic
              }
            });
          }
        }
        
        return { role: msg.role, content };
      }
    });
  }

  /**
   * Prepare request body for API call based on provider
   * @param {Object} state - State object
   * @param {Array} formattedMessages - Formatted messages
   * @returns {Object} Request body for API call
   */
  _prepareRequestBody(state, formattedMessages) {
    const body = {
      model: state.config.model,
      messages: formattedMessages,
      temperature: state.config.temperature,
      max_tokens: state.config.maxTokens,
      stream: true,
    };
    
    if ((state.provider === AIProviders.DESKTOP_LOCAL || state.provider === 'desktop-local') && state.config.customModelsPath) {
      body.customModelsPath = state.config.customModelsPath;
    }
    
    return body;
  }

  /**
   * Check if routing should be applied
   * @param {Object} config - Provider config
   * @param {Array} messages - Messages array
   * @returns {boolean} True if routing should be applied
   */
  _shouldApplyRouting(config, messages) {
    // Check if routing is enabled
    if (!config.routing || !config.routing.enabled) {
      return false;
    }

    return true;
  }

  /**
   * Strip images from messages array
   * @param {Array} messages - Messages array
   * @returns {Array} Messages without images
   */
  _stripImagesFromMessages(messages) {
    return messages.map(msg => {
      if (msg.images) {
        const { images, ...rest } = msg;
        return rest;
      }
      return msg;
    });
  }

  /**
   * Parse JSON response, handling potential markdown code blocks
   * @param {string} response - Raw response text
   * @returns {Object|null} Parsed JSON or null
   */
  _parseJSONResponse(response) {
    try {
      // Try direct parse first
      return JSON.parse(response);
    } catch (e) {
      // Try to extract JSON from markdown code block
      const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1]);
        } catch (e2) {
          Logger.error('AIService', 'Failed to parse JSON from markdown block:', e2);
        }
      }
      
      // Try to find JSON object in response
      const objectMatch = response.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        try {
          return JSON.parse(objectMatch[0]);
        } catch (e3) {
          Logger.error('AIService', 'Failed to parse extracted JSON:', e3);
        }
      }
      
      Logger.error('AIService', 'Failed to parse JSON response:', e);
      return null;
    }
  }

  /**
   * Apply multi-model routing when enabled
   * @param {Array} messages - Original messages
   * @param {Function} onStream - Streaming callback
   * @param {number} tabId - Tab ID
   * @param {Object} config - Provider config
   * @returns {Promise<Object>} Result object
   */
  async _applyRouting(messages, onStream, tabId, config) {
    const logPrefix = this.isExtensionMode ? `[AIService Routing] Tab ${tabId}` : '[AIService Routing]';
    Logger.log('other', `${logPrefix} - Starting multi-model routing`);

    const state = this._getState(tabId);
    const userMessage = messages[messages.length - 1];
    const userText = typeof userMessage.content === 'string' ? userMessage.content : 
                     (Array.isArray(userMessage.content) ? userMessage.content.find(c => c.type === 'text')?.text || userMessage.content.find(c => c.type === 'text')?.value || '' : '');

    const manualImages = userMessage.images && userMessage.images.length > 0 ? userMessage.images : null;

    try {
      Logger.log('other', `${logPrefix} - Step 1: Router deciding if vision needed`);
      
      const routerMessages = [
        {
          role: 'system',
          content: PromptConfig.routing.routerSystemPrompt
        },
        {
          role: 'user',
          content: PromptConfig.routing.generateVisionPrompt(userText)
        }
      ];

      const routerModelName = this._getModelOverride(config.routing.routerModel, state.provider);

      const routerResult = await this.sendMessage(routerMessages, null, tabId, { 
        modelOverride: routerModelName,
        useUtilitySession: true 
      });
      
      if (!routerResult.success) {
        Logger.error('other', `${logPrefix} - Router failed, falling back to main LLM`);
        
        const errorContext = `[Note: Routing system encountered an error: ${routerResult.error?.message || 'Router failed'}. Proceeding with best effort.]`;
        const fallbackMessages = [
          ...messages.slice(0, -1),
          {
            role: 'user',
            content: `${userText}\n\n${errorContext}`,
            images: manualImages
          }
        ];

        const tempConfig = { ...config, routing: { ...config.routing, enabled: false } };
        state.config = tempConfig;
        
        const result = await this.sendMessage(fallbackMessages, onStream, tabId);
        
        state.config = config;
        return result;
      }

      const routerDecision = this._parseJSONResponse(routerResult.response);
      
      // Router returned invalid JSON - fallback to main LLM
      if (!routerDecision) {
        Logger.error('other', `${logPrefix} - Invalid router response, falling back to main LLM`);
        
        const errorContext = `[Note: Routing system returned invalid response. Proceeding with best effort.]`;
        const fallbackMessages = [
          ...messages.slice(0, -1),
          {
            role: 'user',
            content: `${userText}\n\n${errorContext}`,
            images: manualImages
          }
        ];

        const tempConfig = { ...config, routing: { ...config.routing, enabled: false } };
        state.config = tempConfig;
        
        const result = await this.sendMessage(fallbackMessages, onStream, tabId);
        
        state.config = config;
        return result;
      }

      Logger.log('other', `${logPrefix} - Router decision:`, routerDecision);

      const needsVision = routerDecision.needsVision !== false; // Default to true for backwards compat
      
      if (!needsVision && !manualImages) {
        Logger.log('other', `${logPrefix} - Router decided vision not needed, proceeding text-only`);
        
        const tempConfig = { ...config, routing: { ...config.routing, enabled: false } };
        state.config = tempConfig;
        
        const result = await this.sendMessage(messages, onStream, tabId);
        
        state.config = config;
        return result;
      }

      // Vision is needed - get images (manual or captured)
      let imageToUse = manualImages;
      let captureContext = '';

      if (!imageToUse && FrameCaptureService.isEnabled()) {
        Logger.log('other', `${logPrefix} - No manual image, attempting frame capture...`);
        
        const captureResult = await FrameCaptureService.getLatestFrame();
        
        if (captureResult.success && captureResult.frame) {
          imageToUse = [captureResult.frame];
          captureContext = '[Frame captured from active source]';
          Logger.log('other', `${logPrefix} - Frame capture successful`);
        } else {
          captureContext = `[Frame capture attempted but failed: ${captureResult.error}. Proceeding without visual context.]`;
          Logger.warn('other', `${logPrefix} - Frame capture failed: ${captureResult.error}`);
        }
      } else if (manualImages) {
        captureContext = '[Vision analysis from attached image]';
      }

      // If no images available, fall back to text-only
      if (!imageToUse) {
        Logger.log('other', `${logPrefix} - Vision needed but no images available, falling back to text-only`);
        
        const errorContext = `[Note: Vision analysis was needed but no visual input available. ${captureContext || 'Frame capture not enabled.'}]`;
        const fallbackMessages = [
          ...messages.slice(0, -1),
          {
            role: 'user',
            content: `${userText}\n\n${errorContext}`
          }
        ];

        const tempConfig = { ...config, routing: { ...config.routing, enabled: false } };
        state.config = tempConfig;
        
        const result = await this.sendMessage(fallbackMessages, onStream, tabId);
        
        state.config = config;
        return result;
      }

      // Router missing visionPrompt - use generic fallback
      let visionPromptToUse = routerDecision.visionPrompt;
      if (!visionPromptToUse) {
        Logger.warn('other', `${logPrefix} - Router missing visionPrompt, using generic`);
        visionPromptToUse = 'Describe what you see in this image in detail.';
      }

      const skipVLM = config.routing.visionModel && config.routing.visionModel.useSameAsMain;
      
      let visionAnalysis = '';
      let visionStatus = '';

      if (skipVLM) {
        // Main LLM supports vision - skip VLM step
        Logger.log('other', `${logPrefix} - Step 2: Skipping VLM (vision = main model)`);
        
        visionAnalysis = visionPromptToUse;
        visionStatus = `${captureContext}\n[Main LLM will analyze image directly with guidance: ${routerDecision.focus || 'general_description'}]`;
      } else {
        // Run separate VLM
        Logger.log('other', `${logPrefix} - Step 2: Vision model analyzing image`);
        
        const visionPrompt = PromptConfig.routing.visionAnalysisPrompt(visionPromptToUse);
        const visionMessages = [
          {
            role: 'user',
            content: visionPrompt,
            images: imageToUse
          }
        ];

        // Get vision model config
        const visionModelName = this._getModelOverride(config.routing.visionModel, state.provider);
        
        let visionResult = null;
        const maxRetries = 2;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          Logger.log('other', `${logPrefix} - Vision analysis attempt ${attempt}/${maxRetries}`);
          
          visionResult = await this.sendMessage(visionMessages, null, tabId, { 
            modelOverride: visionModelName,
            useUtilitySession: true 
          });
          
          if (visionResult.success) {
            break;
          }
          
          if (attempt < maxRetries) {
            Logger.warn('other', `${logPrefix} - Vision attempt ${attempt} failed, retrying...`);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
          }
        }
        
        if (visionResult && visionResult.success) {
          visionAnalysis = visionResult.response;
          visionStatus = captureContext;
          Logger.log('other', `${logPrefix} - Vision analysis complete (${visionAnalysis.length} chars):`);
          Logger.log('other', `${logPrefix} - VLM Response: ${visionAnalysis}`);
        } else {
          visionAnalysis = `Unable to analyze visual content due to: ${visionResult?.error?.message || 'Unknown error'}`;
          visionStatus = `${captureContext}\n[Vision analysis failed after ${maxRetries} attempts]`;
          Logger.error('other', `${logPrefix} - Vision analysis failed after ${maxRetries} attempts`);
        }
      }

      Logger.log('other', `${logPrefix} - Step 3: Sending to main LLM with vision context`);
      
      let finalMessages;
      
      if (skipVLM) {
        // Main LLM supports vision - send image + router's guidance
        const enhancedPrompt = `${userText}\n\n${visionStatus}\n${visionAnalysis}`;
        
        // Remove images from previous messages, only keep latest
        const previousMessages = this._stripImagesFromMessages(messages.slice(0, -1));
        
        finalMessages = [
          ...previousMessages,
          {
            role: 'user',
            content: enhancedPrompt,
            images: imageToUse 
          }
        ];
        
        Logger.log('other', `${logPrefix} - Main LLM will analyze image directly`);
      } else {
        const enhancedPrompt = `${userText}\n\n${visionStatus}\n[Vision Analysis]\n${visionAnalysis}`;
        const messagesWithoutImages = this._stripImagesFromMessages(messages);
        
        finalMessages = [
          ...messagesWithoutImages.slice(0, -1),
          {
            role: 'user',
            content: enhancedPrompt 
          }
        ];
        
        Logger.log('other', `${logPrefix} - Enhanced prompt with VLM context (${enhancedPrompt.length} chars):`);
        Logger.log('other', `${logPrefix} - ${enhancedPrompt}`);
      }

      const tempConfig = { ...config, routing: { ...config.routing, enabled: false } };
      state.config = tempConfig;
      
      const result = await this.sendMessage(finalMessages, onStream, tabId);
      
      state.config = config;
      
      Logger.log('other', `${logPrefix} - Routing complete`);
      return result;

    } catch (error) {
      Logger.error('other', `${logPrefix} - Routing failed:`, error);
      
      // Fallback: Send error as context to main LLM
      const errorContext = `[Note: Multi-model routing encountered an error: ${error.message}. ${captureContext || 'No visual context available.'}]`;
      
      const fallbackMessages = [
        ...messages.slice(0, -1),
        {
          role: 'user',
          content: `${userText}\n\n${errorContext}`
        }
      ];

      const tempConfig = { ...config, routing: { ...config.routing, enabled: false } };
      state.config = tempConfig;
      
      const result = await this.sendMessage(fallbackMessages, onStream, tabId);
      
      state.config = config;
      
      return result;
    }
  }

  /**
   * Get model override from config
   * @param {Object} modelConfig - Model config object
   * @param {string} provider - Provider name
   * @returns {string|null} Model name or null
   */
  _getModelOverride(modelConfig, provider) {
    if (!modelConfig || modelConfig.useSameAsMain) {
      return null;
    }

    if (provider === 'openai' || provider === 'ollama') {
      return modelConfig.modelName || null;
    }

    if (provider === 'android-local' || provider === 'desktop-local') {
      return modelConfig.selectedModel || null;
    }

    return null;
  }

  /**
   * Send message with streaming support
   * 
   * @param {Array} messages - Array of message objects
   * @param {Function|null} onStream - Callback for streaming tokens
   * @param {number|null} tabId - Tab ID (extension mode only)
   * @param {Object} options - Additional options { useUtilitySession: boolean, modelOverride: string, disableRouting: boolean }
   * @returns {Promise<{success: boolean, response: string|null, cancelled: boolean, error: Error|null}>}
   */
  async sendMessage(messages, onStream = null, tabId = null, options = {}) {
    const state = this._getState(tabId);
    
    if (!this.isConfigured(tabId)) {
      return { success: false, response: null, cancelled: false, error: new Error('AIService not configured. Call configure() first.') };
    }

    const logPrefix = this.isExtensionMode ? `[AIService] Tab ${tabId}` : '[AIService]';

    // Check if routing should be applied (only if not already in a routing sub-call and not explicitly disabled)
    if (!options.modelOverride && !options.useUtilitySession && !options.disableRouting && this._shouldApplyRouting(state.config, messages)) {
      return await this._applyRouting(messages, onStream, tabId, state.config);
    }
    
    // Check if any message contains images or audios
    const hasImages = messages.some(m => m.images && m.images.length > 0);
    const hasAudios = messages.some(m => m.audios && m.audios.length > 0);
    const hasAttachments = hasImages || hasAudios;
    
    Logger.log('other', `${logPrefix} - Sending message to ${state.provider}:`, {
      messageCount: messages.length,
      model: options.modelOverride || state.config.model || 'chrome-ai',
      hasImages,
      hasAudios,
      useUtilitySession: options.useUtilitySession || false,
      modelOverride: options.modelOverride || null,
    });

    // Format messages for multi-modal if needed
    const formattedMessages = hasAttachments 
      ? this._formatMultiModalMessages(messages, state.provider)
      : messages;

    // Chrome AI implementation
    if (state.provider === AIProviders.CHROME_AI || state.provider === 'chrome-ai') {
      return await this._sendMessageChromeAI(state, formattedMessages, onStream, logPrefix, options.useUtilitySession);
    }

    // Create new abort controller for this request
    state.abortController = new AbortController();

    try {
      // Prepare request body
      const requestBody = this._prepareRequestBody(state, formattedMessages);
      
      if (options.modelOverride) {
        requestBody.model = options.modelOverride;
      }
      
      // Create streaming request with abort signal
      const stream = await state.client.chat.completions.create(requestBody, {
        signal: state.abortController.signal
      });

      let fullResponse = '';
      
      // Process streaming chunks
      for await (const chunk of stream) {
        // Check if request was aborted - return cancelled, don't throw
        if (!state.abortController) {
          Logger.log('other', `${logPrefix} - Streaming aborted by user`);
          state.abortController = null;
          return { success: false, response: fullResponse, cancelled: true, error: null };
        }
        
        const content = chunk.choices[0]?.delta?.content || '';
        
        if (content) {
          fullResponse += content;
          
          // Call streaming callback if provided
          if (onStream) {
            onStream(content);
          }
        }
      }

      Logger.log('other', `${logPrefix} - Response received (${fullResponse.length} chars)`);
      state.abortController = null;
      
      return { success: true, response: fullResponse, cancelled: false, error: null };
      
    } catch (error) {
      state.abortController = null;
      
      // Check if error is from abort - check name AND message
      const errorMsg = error.message?.toLowerCase() || '';
      const isAbort = error.name === 'AbortError' || 
                      errorMsg.includes('abort') || 
                      errorMsg.includes('cancel');
      
      if (isAbort) {
        Logger.log('other', `${logPrefix} - Request aborted by user`);
        return { success: false, response: null, cancelled: true, error: null };
      }
      
      Logger.error('other', `${logPrefix} - Request failed:`, error);
      
      // Return error result with enhanced message
      let errorMessage = error.message;
      if (error.message?.includes('401')) {
        errorMessage = 'Invalid API key. Please check your configuration.';
      } else if (error.message?.includes('429')) {
        errorMessage = 'Rate limit exceeded. Please try again later.';
      } else if (error.message?.includes('fetch')) {
        errorMessage = 'Network error. Please check your connection and endpoint URL.';
      }
      
      return { success: false, response: null, cancelled: false, error: new Error(errorMessage) };
    }
  }

  /**
   * Send message using Chrome AI LanguageModel (internal method)
   * @param {Object} state - State object
   * @param {Array} messages - Message array {role, content}
   * @param {Function} onStream - Streaming callback
   * @param {string} logPrefix - Log prefix
   * @param {boolean} useUtilitySession - Use utility session instead of main session
   * @returns {Promise<{success: boolean, response: string|null, cancelled: boolean, error: Error|null}>}
   */
  async _sendMessageChromeAI(state, messages, onStream, logPrefix, useUtilitySession = false) {
    const sessionKey = useUtilitySession ? 'chromeAIUtilitySession' : 'chromeAISession';
    
    try {
      const systemPrompts = messages.filter(m => m.role === 'system');
      const conversationMsgs = messages.filter(m => m.role !== 'system');
      
      let sessionToUse = state[sessionKey];
      
      if (!sessionToUse) {
        Logger.log('other', `${logPrefix} - Creating Chrome AI ${useUtilitySession ? 'utility' : 'main'} session...`);
        
        if (!self.LanguageModel) {
          throw new Error('Chrome AI LanguageModel not available');
        }
        
        // Session config
        const sessionConfig = {
          temperature: state.config.temperature,
          topK: state.config.topK,
          language: state.config.outputLanguage || 'en',
          initialPrompts: systemPrompts.length > 0 ? systemPrompts : undefined,
        };
        
        // Add multi-modal support if enabled in config (default: true)
        const imageSupport = state.config.enableImageSupport !== false;
        const audioSupport = state.config.enableAudioSupport !== false;
        
        if (imageSupport || audioSupport) {
          sessionConfig.expectedInputs = [
            { type: 'text' }
          ];
          
          if (imageSupport) {
            sessionConfig.expectedInputs.push({ type: 'image' });
          }
          
          if (audioSupport) {
            sessionConfig.expectedInputs.push({ type: 'audio' });
          }
        }
        
        sessionToUse = await self.LanguageModel.create(sessionConfig);
        state[sessionKey] = sessionToUse;
        
        Logger.log('other', `${logPrefix} - Chrome AI ${useUtilitySession ? 'utility' : 'main'} session created`);
        
        messages = conversationMsgs;
      }

      const lastMessage = messages[messages.length - 1];
      Logger.log('other', `${logPrefix} - Chrome AI prompting with ${messages.length} message(s)`);

      // For multi-modal messages (content is array), pass as message object with role
      // For text-only messages (content is string), pass just the string
      const isMultiModal = Array.isArray(lastMessage.content);
      const promptInput = isMultiModal ? [lastMessage] : lastMessage.content;
      
      let fullResponse = '';

      if (onStream) {
        const stream = sessionToUse.promptStreaming(promptInput);
        
        for await (const chunk of stream) {
          // Check if session was destroyed (aborted) - return cancelled
          if (!state[sessionKey]) {
            Logger.log('other', `${logPrefix} - Chrome AI streaming aborted by user`);
            return { success: false, response: fullResponse, cancelled: true, error: null };
          }
          
          fullResponse += chunk;
          if (chunk && onStream) {
            onStream(chunk);
          }
        }
      } else {
        fullResponse = await sessionToUse.prompt(promptInput);
      }

      Logger.log('other', `${logPrefix} - Chrome AI response (${fullResponse.length} chars)`);
      
      // Clean up excessive whitespace and newlines
      fullResponse = fullResponse.trim().replace(/\n\s*\n\s*\n/g, '\n\n');
      
      return { success: true, response: fullResponse, cancelled: false, error: null };

    } catch (error) {
      Logger.error('other', `${logPrefix} - Chrome AI error:`, error);
      
      if (state[sessionKey]) {
        try {
          state[sessionKey].destroy();
        } catch (destroyError) {
          Logger.warn('other', `Failed to destroy ${useUtilitySession ? 'utility' : 'main'} session:`, destroyError);
        }
        state[sessionKey] = null;
      }

      let errorMessage = error.message;
      if (error.name === 'NotSupportedError') {
        errorMessage = 'Chrome AI not available. Enable required flags at chrome://flags';
      } else if (error.name === 'QuotaExceededError') {
        errorMessage = 'Chrome AI context limit exceeded (1028 tokens). Start a new conversation.';
      }
      
      return { success: false, response: null, cancelled: false, error: new Error(errorMessage) };
    }
  }

  /**
   * Abort the current ongoing request
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {boolean} True if aborted
   */
  abortRequest(tabId = null) {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[AIService] Tab ${tabId}` : '[AIService]';
    
    let aborted = false;
    
    // Abort both main and utility Chrome AI sessions
    if (state && (state.provider === 'chrome-ai' || state.provider === AIProviders.CHROME_AI)) {
      if (state.chromeAISession) {
        Logger.log('other', `${logPrefix} - Destroying Chrome AI main session`);
        try {
          state.chromeAISession.destroy();
        } catch (destroyError) {
          Logger.warn('other', 'Failed to destroy main session:', destroyError);
        }
        state.chromeAISession = null;
        aborted = true;
      }
      
      if (state.chromeAIUtilitySession) {
        Logger.log('other', `${logPrefix} - Destroying Chrome AI utility session`);
        try {
          state.chromeAIUtilitySession.destroy();
        } catch (destroyError) {
          Logger.warn('other', 'Failed to destroy utility session:', destroyError);
        }
        state.chromeAIUtilitySession = null;
        aborted = true;
      }
      
      if (aborted) return true;
    }
    
    if (state && state.abortController) {
      Logger.log('other', `${logPrefix} - Aborting current request`);
      state.abortController.abort();
      state.abortController = null;
      return true;
    }
    return false;
  }

  isGenerating(tabId = null) {
    const state = this._getState(tabId);
    return state && state.abortController !== null;
  }

  /**
   * Send message without streaming (simpler interface)
   * @param {Array|number} messagesOrTabId - Messages (dev) or tabId (extension)
   * @param {Array} messages - Messages (extension mode only)
   * @returns {Promise<string>} Full response text
   */
  async sendMessageSync(messagesOrTabId, messages = null) {
    if (this.isExtensionMode) {
      return await this.sendMessage(messages, null, messagesOrTabId);
    } else {
      return await this.sendMessage(messagesOrTabId, null, null);
    }
  }

  async testConnection(tabId = null) {
    if (!this.isConfigured(tabId)) {
      throw new Error('AIService not configured');
    }

    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[AIService] Tab ${tabId}` : '[AIService]';
    Logger.log('other', `${logPrefix} - Testing connection to ${state.provider}...`);

    if ((state.provider === AIProviders.CHROME_AI || state.provider === 'chrome-ai') && !this.isExtensionMode) {
      const result = await ChromeAIValidator.testConnection();
      if (!result.success) {
        throw new Error(result.message);
      }
      return true;
    }

    try {
      const testMessages = [
        { role: 'user', content: 'Say "OK" if you can hear me.' }
      ];

      const result = await this.sendMessage(testMessages, null, tabId);
      
      if (!result.success) {
        throw result.error || new Error('Connection test failed');
      }
      
      Logger.log('other', `${logPrefix} - Connection test successful:`, result.response);
      return true;
      
    } catch (error) {
      Logger.error('other', `${logPrefix} - Connection test failed:`, error);
      throw error;
    }
  }
}

// Export singleton instance
export default new AIService();
