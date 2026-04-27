/**
 * VMD to BVMD Converter Service
 * 
 * Converts user-uploaded VMD animation files to BVMD (optimized binary format).
 * Uses babylon-mmd's VmdLoader and BvmdConverter for proper conversion.
 */

import Logger from './LoggerService';

class VMDConverterService {
  /**
   * Create a minimal scene for VMD loading
   * @returns {Promise<Scene>}
   */
  async createConversionScene() {
    try {
      const { Scene } = await import('@babylonjs/core/scene');
      const { NullEngine } = await import('@babylonjs/core/Engines/nullEngine');
      
      Logger.log('VMDConverter', 'Creating NullEngine for conversion...');
      const engine = new NullEngine();
      const scene = new Scene(engine);
      
      Logger.log('VMDConverter', 'Conversion scene created successfully');
      return scene;
    } catch (error) {
      Logger.error('VMDConverter', 'Failed to create conversion scene:', error);
      throw error;
    }
  }

  /**
   * Convert user-uploaded VMD file to BVMD ArrayBuffer
   * @param {File} vmdFile - VMD file
   * @param {Scene} scene - Optional Babylon scene (creates one if not provided)
   * @returns {Promise<ArrayBuffer>} BVMD data
   */
  async convertVMDToBVMD(vmdFile, scene = null) {
    try {
      Logger.log('VMDConverter', `Converting VMD: ${vmdFile.name} (${vmdFile.size} bytes)`);
      
      let createdScene = false;
      let conversionScene = scene;
      
      if (!conversionScene) {
        Logger.log('VMDConverter', 'No scene provided, creating conversion scene...');
        conversionScene = await this.createConversionScene();
        createdScene = true;
      }
      
      try {
        const { VmdLoader } = await import('babylon-mmd/esm/Loader/vmdLoader');
        const { BvmdConverter } = await import('babylon-mmd/esm/Loader/Optimized/bvmdConverter');
        
        Logger.log('VMDConverter', 'Loading VMD animation...');
        
        const vmdLoader = new VmdLoader(conversionScene);
        vmdLoader.loggingEnabled = true;
        
        const animation = await vmdLoader.loadAsync(vmdFile.name, [vmdFile]);
        
        Logger.log('VMDConverter', 'VMD loaded, converting to BVMD...');
        
        const bvmdArrayBuffer = BvmdConverter.Convert(animation);
        
        Logger.log('VMDConverter', `BVMD created (${bvmdArrayBuffer.byteLength} bytes)`);
        
        return bvmdArrayBuffer;
        
      } finally {
        if (createdScene && conversionScene.getEngine()) {
          Logger.log('VMDConverter', 'Cleaning up conversion scene');
          conversionScene.getEngine().dispose();
        }
      }
      
    } catch (error) {
      Logger.error('VMDConverter', `Failed to convert ${vmdFile.name}:`, error);
      throw new Error(`VMD conversion failed: ${error.message}`);
    }
  }

  /**
   * Batch convert multiple VMD files
   * @param {File[]} vmdFiles - Array of VMD files
   * @param {Scene} scene - Optional shared scene for all conversions
   * @returns {Promise<Array<{filename: string, bvmdData: ArrayBuffer, error: string|null}>>}
   */
  async convertBatch(vmdFiles, scene = null) {
    Logger.log('VMDConverter', `Starting batch conversion of ${vmdFiles.length} VMD files`);
    
    let sharedScene = scene;
    let createdScene = false;
    
    if (!sharedScene) {
      Logger.log('VMDConverter', 'Creating shared conversion scene for batch...');
      sharedScene = await this.createConversionScene();
      createdScene = true;
    }
    
    const results = [];
    
    try {
      const { VmdLoader } = await import('babylon-mmd/esm/Loader/vmdLoader');
      const { BvmdConverter } = await import('babylon-mmd/esm/Loader/Optimized/bvmdConverter');
      
      const vmdLoader = new VmdLoader(sharedScene);
      vmdLoader.loggingEnabled = true;
      
      for (const vmdFile of vmdFiles) {
        try {
          Logger.log('VMDConverter', `Converting: ${vmdFile.name}`);
          
          const animation = await vmdLoader.loadAsync(vmdFile.name, [vmdFile]);
          
          const bvmdData = BvmdConverter.Convert(animation);
          
          results.push({
            filename: vmdFile.name,
            bvmdData,
            error: null
          });
          
          Logger.log('VMDConverter', `✓ Converted: ${vmdFile.name}`);
          
        } catch (error) {
          results.push({
            filename: vmdFile.name,
            bvmdData: null,
            error: error.message
          });
          
          Logger.error('VMDConverter', `✗ Failed: ${vmdFile.name}`, error);
        }
      }
      
    } finally {
      if (createdScene && sharedScene?.getEngine()) {
        Logger.log('VMDConverter', 'Cleaning up shared conversion scene');
        sharedScene.getEngine().dispose();
      }
    }
    
    const successCount = results.filter(r => !r.error).length;
    const failCount = results.filter(r => r.error).length;
    
    Logger.log('VMDConverter', `Batch conversion complete: ${successCount} succeeded, ${failCount} failed`);
    
    return results;
  }

  /**
   * Validate VMD file structure
   * Basic validation to check if file is likely a valid VMD
   * @param {File} vmdFile - VMD file
   * @returns {Promise<boolean>} True if appears to be valid VMD
   */
  async validateVMD(vmdFile) {
    try {
      const headerBuffer = await vmdFile.slice(0, 30).arrayBuffer();
      const header = new Uint8Array(headerBuffer);
      const headerText = String.fromCharCode(...header);
      
      const isValid = headerText.startsWith('Vocaloid Motion Data');
      
      if (!isValid) {
        Logger.warn('VMDConverter', `Invalid VMD header detected: ${vmdFile.name}`);
      }
      
      return isValid;
    } catch (error) {
      Logger.error('VMDConverter', 'VMD validation error:', error);
      return false;
    }
  }

  /**
   * Get VMD file info without full conversion
   * @param {File} vmdFile - VMD file
   * @returns {Promise<Object>} Basic VMD info
   */
  async getVMDInfo(vmdFile) {
    try {
      const headerBuffer = await vmdFile.slice(0, 50).arrayBuffer();
      const header = new Uint8Array(headerBuffer);
      const headerText = String.fromCharCode(...header.slice(0, 30));
      
      const modelNameBytes = header.slice(30, 50);
      const modelName = String.fromCharCode(...modelNameBytes)
        .replace(/\0/g, '')
        .trim();
      
      return {
        isValid: headerText.startsWith('Vocaloid Motion Data'),
        version: headerText.includes('0002') ? '0002' : '0001',
        modelName: modelName || 'Unknown',
        fileSize: vmdFile.size
      };
    } catch (error) {
      Logger.error('VMDConverter', 'Failed to extract VMD info:', error);
      return {
        isValid: false,
        version: 'Unknown',
        modelName: 'Unknown',
        fileSize: vmdFile.size
      };
    }
  }
}

// Create singleton instance
export const vmdConverterService = new VMDConverterService();

export default vmdConverterService;
