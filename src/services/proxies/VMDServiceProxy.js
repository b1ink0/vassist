/**
 * VMD Service Proxy
 * Dual-mode wrapper for VMD/BVMD generation services
 * Dev mode: Local processing (AudioProcessor, VMDGenerationService, BVMDConverter)
 * Extension mode: Offscreen does heavy lifting, returns BVMD blob URL
 */

import { ServiceProxy } from './ServiceProxy.js';
import { vmdGenerationService } from '../VMDGenerationService.js';
import { MessageTypes } from '../../../extension/shared/MessageTypes.js';

class VMDServiceProxy extends ServiceProxy {
  constructor() {
    super('VMDService');
    this.directService = vmdGenerationService;
    this.bvmdConverter = null; // Will be set in dev mode
  }

  /**
   * Initialize BVMD converter with scene (dev mode only)
   * @param {Scene} scene - Babylon.js scene
   */
  initializeBVMDConverter(scene) {
    if (!this.isExtension) {
      // In dev mode, we need the converter
      // Import dynamically to avoid issues
      import('../BVMDConverterService.js').then(module => {
        this.bvmdConverter = new module.BVMDConverterService(scene);
        console.log('[VMDServiceProxy] BVMD converter initialized');
      });
    }
    // In extension mode, conversion happens in offscreen
  }

  /**
   * Generate VMD from audio blob
   * @param {Blob} audioBlob - Audio data from TTS
   * @param {string} modelName - Model name for VMD
   * @returns {Promise<ArrayBuffer>} VMD data
   */
  async generateVMDFromAudio(audioBlob, modelName = 'Model') {
    if (this.isExtension) {
      const response = await this.bridge.sendMessage(
        MessageTypes.OFFSCREEN_VMD_GENERATE,
        { audioBlob, modelName },
        { timeout: 120000 } // 2 minutes for VMD generation
      );
      
      return response.vmdData;
    } else {
      return await this.directService.generateVMDFromAudio(audioBlob, modelName);
    }
  }

  /**
   * Generate VMD from ArrayBuffer
   * @param {ArrayBuffer} audioBuffer - Audio data
   * @param {string} modelName - Model name for VMD
   * @returns {Promise<ArrayBuffer>} VMD data
   */
  async generateVMDFromArrayBuffer(audioBuffer, modelName = 'Model') {
    if (this.isExtension) {
      // Convert ArrayBuffer to Blob
      const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });
      return await this.generateVMDFromAudio(audioBlob, modelName);
    } else {
      return await this.directService.generateVMDFromArrayBuffer(audioBuffer, modelName);
    }
  }

  /**
   * Convert VMD to BVMD and return blob URL
   * @param {ArrayBuffer} vmdData - VMD file data
   * @param {string} filename - Optional filename
   * @returns {Promise<string>} BVMD blob URL
   */
  async convertVMDToBVMD(vmdData, filename = 'lipsync.vmd') {
    if (this.isExtension) {
      const response = await this.bridge.sendMessage(
        MessageTypes.BVMD_CONVERT,
        { vmdData, filename },
        { timeout: 60000 } // 1 minute for BVMD conversion
      );
      
      return response.bvmdUrl;
    } else {
      if (!this.bvmdConverter) {
        throw new Error('BVMD converter not initialized. Call initializeBVMDConverter first.');
      }
      
      return await this.bvmdConverter.convertVMDToBVMD(vmdData, filename);
    }
  }

  /**
   * Generate VMD and convert to BVMD in one step
   * @param {Blob} audioBlob - Audio blob from TTS
   * @param {string} modelName - Model name
   * @returns {Promise<string>} BVMD blob URL
   */
  async generateBVMDFromAudio(audioBlob, modelName = 'Model') {
    if (this.isExtension) {
      // In extension mode, offscreen can do both steps
      const response = await this.bridge.sendMessage(
        MessageTypes.OFFSCREEN_VMD_GENERATE,
        { audioBlob, modelName, convertToBVMD: true },
        { timeout: 120000 }
      );
      
      return response.bvmdUrl;
    } else {
      // Dev mode: do both steps
      const vmdData = await this.generateVMDFromAudio(audioBlob, modelName);
      const bvmdUrl = await this.convertVMDToBVMD(vmdData);
      return bvmdUrl;
    }
  }

  /**
   * Update VMD generation config
   * @param {Object} config - Configuration options
   */
  updateConfig(config) {
    if (!this.isExtension) {
      this.directService.updateConfig(config);
    }
    // In extension mode, could send message to update config
  }

  /**
   * Create a blob URL from VMD data
   * @param {ArrayBuffer} vmdData - VMD data
   * @returns {string} Blob URL
   */
  createVMDBlobURL(vmdData) {
    // This is a simple operation, do it locally
    const blob = new Blob([vmdData], { type: 'application/octet-stream' });
    return URL.createObjectURL(blob);
  }

  /**
   * Download VMD file (for debugging)
   * @param {ArrayBuffer} vmdData - VMD data
   * @param {string} filename - Filename
   */
  downloadVMD(vmdData, filename = 'lipsync.vmd') {
    if (!this.isExtension) {
      this.directService.downloadVMD(vmdData, filename);
    } else {
      // Simple download in extension mode
      const blob = new Blob([vmdData], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Cleanup blob URLs (BVMD converter)
   * @param {string|string[]} urls - URLs to cleanup
   */
  cleanup(urls = null) {
    if (!this.isExtension && this.bvmdConverter) {
      this.bvmdConverter.cleanup(urls);
    }
    // In extension mode, background handles cleanup
  }

  /**
   * Implementation of callViaBridge (required by ServiceProxy)
   */
  async callViaBridge(method, ...args) {
    const methodMap = {
      generateVMDFromAudio: MessageTypes.OFFSCREEN_VMD_GENERATE,
      convertVMDToBVMD: MessageTypes.BVMD_CONVERT,
      generateBVMDFromAudio: MessageTypes.OFFSCREEN_VMD_GENERATE
    };

    const messageType = methodMap[method];
    if (!messageType) {
      throw new Error(`Unknown method: ${method}`);
    }

    const response = await this.bridge.sendMessage(messageType, { args });
    return response;
  }

  /**
   * Implementation of callDirect (required by ServiceProxy)
   */
  async callDirect(method, ...args) {
    if (method === 'convertVMDToBVMD') {
      // Special handling for BVMD conversion
      if (!this.bvmdConverter) {
        throw new Error('BVMD converter not initialized');
      }
      return await this.bvmdConverter[method](...args);
    }

    if (typeof this.directService[method] !== 'function') {
      throw new Error(`Method ${method} not found on VMDGenerationService`);
    }

    return await this.directService[method](...args);
  }
}

// Export singleton instance
const vmdServiceProxy = new VMDServiceProxy();
export default vmdServiceProxy;
