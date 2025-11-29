/**
 * PMX Converter Service
 * 
 * Handles PMX model file processing, validation, conversion to BPMX, and storage.
 * All PMX-related business logic in one place.
 */

import { zipExtractor } from '../utils/ZipExtractor';
import { modelStorageService } from './ModelStorageService';
import Logger from './LoggerService';

class PMXConverterService {
  /**
   * Extract texture and mesh metadata from a loaded MMD model
   * @param {Mesh} mmdMesh - Loaded MMD mesh
   * @returns {Object} - { textures: Array, meshParts: Array }
   */
  extractModelMetadata(mmdMesh) {
    const textures = [];
    const meshParts = [];

    if (!mmdMesh || !mmdMesh.metadata) {
      Logger.warn('PMXConverter', 'No mesh metadata available');
      return { textures, meshParts };
    }

    const processedTextureIds = new Set();

    const materials = [];
    
    if (mmdMesh.metadata.materials) {
      materials.push(...mmdMesh.metadata.materials);
    }
    
    if (mmdMesh.material && !materials.includes(mmdMesh.material)) {
      materials.push(mmdMesh.material);
    }
    
    if (mmdMesh.subMeshes) {
      mmdMesh.subMeshes.forEach((subMesh) => {
        if (subMesh.getMaterial && subMesh.getMaterial()) {
          const subMaterial = subMesh.getMaterial();
          if (subMaterial && !materials.includes(subMaterial)) {
            materials.push(subMaterial);
          }
        }
      });
    }

    materials.forEach((material, matIndex) => {
      if (!material) return;

      if (material.diffuseTexture) {
        const texId = `${mmdMesh.name}_mat${matIndex}_diffuse`;
        if (!processedTextureIds.has(texId)) {
          textures.push({
            id: texId,
            name: `${material.name || 'Material ' + matIndex} - Diffuse`,
            url: material.diffuseTexture.url || material.diffuseTexture.name || '',
            type: 'diffuse',
            isActive: true,
            materialIndex: matIndex,
            textureInfo: {
              url: material.diffuseTexture.url,
              name: material.diffuseTexture.name,
              hasAlpha: material.diffuseTexture.hasAlpha
            }
          });
          processedTextureIds.add(texId);
        }
      }

      if (material.sphereTexture) {
        const texId = `${mmdMesh.name}_mat${matIndex}_sphere`;
        if (!processedTextureIds.has(texId)) {
          textures.push({
            id: texId,
            name: `${material.name || 'Material ' + matIndex} - Sphere`,
            url: material.sphereTexture.url || material.sphereTexture.name || '',
            type: 'sphere',
            isActive: true,
            materialIndex: matIndex,
            textureInfo: {
              url: material.sphereTexture.url,
              name: material.sphereTexture.name
            }
          });
          processedTextureIds.add(texId);
        }
      }

      if (material.toonTexture) {
        const texId = `${mmdMesh.name}_mat${matIndex}_toon`;
        if (!processedTextureIds.has(texId)) {
          textures.push({
            id: texId,
            name: `${material.name || 'Material ' + matIndex} - Toon`,
            url: material.toonTexture.url || material.toonTexture.name || '',
            type: 'toon',
            isActive: true,
            materialIndex: matIndex,
            textureInfo: {
              url: material.toonTexture.url,
              name: material.toonTexture.name
            }
          });
          processedTextureIds.add(texId);
        }
      }
    });

    // Extract mesh parts
    if (mmdMesh.metadata.meshes) {
      mmdMesh.metadata.meshes.forEach((mesh, meshIndex) => {
        if (!mesh) return;

        const meshName = mesh.name || `Mesh ${meshIndex}`;
        
        let meshType = 'other';
        const nameLower = meshName.toLowerCase();
        
        if (nameLower.includes('hair') || nameLower.includes('髪')) meshType = 'hair';
        else if (nameLower.includes('face') || nameLower.includes('顔')) meshType = 'face';
        else if (nameLower.includes('body') || nameLower.includes('体')) meshType = 'body';
        else if (nameLower.includes('cloth') || nameLower.includes('服')) meshType = 'clothing';
        else if (nameLower.includes('eye') || nameLower.includes('目')) meshType = 'eyes';
        else if (nameLower.includes('hand') || nameLower.includes('手')) meshType = 'hands';
        else if (nameLower.includes('foot') || nameLower.includes('feet') || nameLower.includes('足')) meshType = 'feet';
        else if (nameLower.includes('accessory') || nameLower.includes('アクセサリ')) meshType = 'accessory';

        meshParts.push({
          id: `mesh_${meshIndex}`,
          name: meshName,
          type: meshType,
          isVisible: true,
          meshIndex: meshIndex
        });

        // Add submeshes if available
        if (mesh.subMeshes && mesh.subMeshes.length > 1) {
          mesh.subMeshes.forEach((subMesh, subIndex) => {
            meshParts.push({
              id: `submesh_${meshIndex}_${subIndex}`,
              name: `${meshName} - Part ${subIndex + 1}`,
              type: 'submesh',
              isVisible: true,
              meshIndex: meshIndex,
              subMeshIndex: subIndex
            });
          });
        }
      });
    }

    Logger.log('PMXConverter', `Extracted ${textures.length} textures and ${meshParts.length} mesh parts`);
    
    return { textures, meshParts };
  }

  /**
   * Convert PMX file to BPMX ArrayBuffer
   * @param {File} pmxFile - PMX file
   * @param {File[]} referenceFiles - All related files (textures, etc.)
   * @param {Scene} scene - Babylon scene (required for loading)
   * @param {Object} options - Conversion options
   * @returns {Promise<ArrayBuffer>} BPMX data
   */
  async convertPMXToBPMX(pmxFile, referenceFiles, scene, options = {}) {
    try {
      Logger.log('PMXConverter', `Converting PMX to BPMX: ${pmxFile.name}`);
      
      if (!scene) {
        throw new Error('Scene is required for PMX to BPMX conversion');
      }

      const { LoadAssetContainerAsync } = await import('@babylonjs/core/Loading/sceneLoader');
      const { BpmxConverter } = await import('babylon-mmd/esm/Loader/Optimized/bpmxConverter');
      const { MmdStandardMaterialBuilder } = await import('babylon-mmd/esm/Loader/mmdStandardMaterialBuilder');
      
      await import('babylon-mmd/esm/Loader/pmxLoader');
      
      Logger.log('PMXConverter', 'Setting up material builder with texture preservation...');
      
      const materialBuilder = new MmdStandardMaterialBuilder();
      materialBuilder.deleteTextureBufferAfterLoad = false; 
      
      Logger.log('PMXConverter', 'Loading PMX model into scene...');
      
      const {
        buildSkeleton = true,
        buildMorph = true,
        preserveSerializationData = true
      } = options;
      
      const fileRelativePath = pmxFile.webkitRelativePath || pmxFile.name;
      const rootUrl = fileRelativePath.includes("/")
        ? fileRelativePath.substring(0, fileRelativePath.lastIndexOf("/") + 1)
        : "";
      
      Logger.log('PMXConverter', 'PMX file path:', fileRelativePath);
      Logger.log('PMXConverter', 'Root URL:', rootUrl);
      Logger.log('PMXConverter', 'Reference files count:', referenceFiles.length);
      
      const assetContainer = await LoadAssetContainerAsync(
        pmxFile,
        scene,
        {
          rootUrl: rootUrl,
          pluginOptions: {
            mmdmodel: {
              materialBuilder: materialBuilder,
              buildMorph,
              preserveSerializationData,
              loggingEnabled: true,
              referenceFiles
            }
          }
        }
      );
      
      const mmdMesh = assetContainer.meshes[0];
      
      if (!mmdMesh) {
        throw new Error('Failed to load PMX model - no mesh found');
      }
      
      Logger.log('PMXConverter', 'PMX loaded, extracting metadata...');
      
      const modelMetadata = this.extractModelMetadata(mmdMesh);
      
      Logger.log('PMXConverter', 'Converting to BPMX...');
      
      const bpmxConverter = new BpmxConverter();
      bpmxConverter.loggingEnabled = true;
      
      const bpmxArrayBuffer = bpmxConverter.convert(mmdMesh, {
        includeSkinningData: buildSkeleton,
        includeMorphData: buildMorph
      });
      
      Logger.log('PMXConverter', `BPMX created (${bpmxArrayBuffer.byteLength} bytes)`);
      
      assetContainer.dispose();
      
      return { bpmxData: bpmxArrayBuffer, modelMetadata };
      
    } catch (error) {
      Logger.error('PMXConverter', 'Conversion failed:', error);
      throw new Error(`Failed to convert PMX to BPMX: ${error.message}`);
    }
  }

  /**
   * Create a minimal Babylon scene for conversion if none provided
   * Uses NullEngine for headless conversion (useful in workers)
   * @returns {Promise<Scene|null>} Scene or null if failed
   */
  async createConversionScene() {
    try {
      const { Scene } = await import('@babylonjs/core/scene');
      const { NullEngine } = await import('@babylonjs/core/Engines/nullEngine');
      
      Logger.log('PMXConverter', 'Creating NullEngine for conversion...');
      const engine = new NullEngine();
      const scene = new Scene(engine);
      
      Logger.log('PMXConverter', 'Conversion scene created successfully');
      return scene;
    } catch (error) {
      Logger.error('PMXConverter', 'Failed to create conversion scene:', error);
      return null;
    }
  }

  /**
   * Convert PMX file with automatic scene creation
   * @param {File} pmxFile - PMX file
   * @param {File[]} referenceFiles - All related files
   * @param {Object} options - Conversion options
   * @returns {Promise<{bpmxData: ArrayBuffer, modelMetadata: Object}>} BPMX data and extracted metadata
   */
  async convertWithAutoScene(pmxFile, referenceFiles, options = {}) {
    const scene = await this.createConversionScene();
    if (!scene) {
      throw new Error('Failed to create conversion scene');
    }
    
    try {
      return await this.convertPMXToBPMX(pmxFile, referenceFiles, scene, options);
    } finally {
      // Clean up scene
      if (scene.getEngine()) {
        scene.getEngine().dispose();
      }
    }
  }

  /**
   * Find the largest PMX file in extracted files
   * PMX models often come with multiple PMX files, the largest is usually the main model
   * @param {Map<string, ArrayBuffer>} files - Extracted files
   * @returns {{data: ArrayBuffer, filename: string}|null} Largest PMX file or null
   */
  findMainPMXFile(files) {
    try {
      let largestPmx = null;
      let largestSize = 0;
      
      for (const [filename, data] of files.entries()) {
        if (filename.toLowerCase().endsWith('.pmx')) {
          if (data.byteLength > largestSize) {
            largestSize = data.byteLength;
            largestPmx = { data, filename };
          }
        }
      }
      
      if (largestPmx) {
        Logger.log('PMXConverter', `Found main PMX: ${largestPmx.filename} (${largestSize} bytes)`);
      } else {
        Logger.warn('PMXConverter', 'No PMX file found');
      }
      
      return largestPmx;
      
    } catch (error) {
      Logger.error('PMXConverter', 'Error finding PMX file:', error);
      return null;
    }
  }

  /**
   * Validate ZIP contents for PMX model
   * @param {Map<string, ArrayBuffer>} files - Extracted files
   * @returns {{isValid: boolean, pmxCount: number, textureCount: number, totalFiles: number, errors: string[]}}
   */
  validateModelZip(files) {
    const errors = [];
    let pmxCount = 0;
    let textureCount = 0;
    
    try {
      for (const [filename] of files.entries()) {
        const lower = filename.toLowerCase();
        
        if (lower.endsWith('.pmx')) {
          pmxCount++;
        } else if (lower.endsWith('.png') || lower.endsWith('.jpg') || 
                   lower.endsWith('.jpeg') || lower.endsWith('.bmp') || 
                   lower.endsWith('.tga') || lower.endsWith('.dds')) {
          textureCount++;
        }
      }
      
      if (pmxCount === 0) {
        errors.push('No PMX file found in ZIP archive');
      }
      
      if (files.size === 0) {
        errors.push('ZIP archive is empty');
      }
      
      const isValid = pmxCount > 0 && errors.length === 0;
      
      Logger.log('PMXConverter', `Validation: ${isValid ? 'PASS' : 'FAIL'} - PMX: ${pmxCount}, Textures: ${textureCount}`);
      
      if (errors.length > 0) {
        errors.forEach(err => Logger.warn('PMXConverter', `  ✗ ${err}`));
      }
      
      return {
        isValid,
        pmxCount,
        textureCount,
        totalFiles: files.size,
        errors
      };
      
    } catch (error) {
      Logger.error('PMXConverter', 'Validation error:', error);
      return {
        isValid: false,
        pmxCount: 0,
        textureCount: 0,
        totalFiles: files.size,
        errors: ['Validation failed: ' + error.message]
      };
    }
  }

  /**
   * Process uploaded model ZIP file
   * Extracts, validates, finds PMX, converts to BPMX, and saves to storage
   * @param {File|Blob} zipFile - Uploaded ZIP file
   * @param {string} modelName - User-provided model name
   * @param {Function} progressCallback - Optional progress callback (step, message)
   * @returns {Promise<string>} Model ID
   */
  async processModelUpload(zipFile, modelName, progressCallback = null) {
    try {
      const reportProgress = (step, message) => {
        Logger.log('PMXConverter', `[${step}] ${message}`);
        if (progressCallback) progressCallback(step, message);
      };
      
      reportProgress('extract', 'Extracting ZIP archive...');
      
      const filesMap = await zipExtractor.extract(zipFile);
      
      reportProgress('validate', 'Validating contents...');
      
      const validation = this.validateModelZip(filesMap);
      if (!validation.isValid) {
        throw new Error(validation.errors.join(', '));
      }
      
      reportProgress('find', 'Finding main PMX file...');
      
      const pmxFileInfo = this.findMainPMXFile(filesMap);
      if (!pmxFileInfo) {
        throw new Error('No PMX file found in ZIP');
      }
      
      const referenceFiles = [];
      for (const [filename, data] of filesMap.entries()) {
        const file = new File([data], filename.split('/').pop(), { type: 'application/octet-stream' });
        Object.defineProperty(file, 'webkitRelativePath', {
          value: filename,
          writable: false
        });
        referenceFiles.push(file);
      }
      
      const pmxFile = referenceFiles.find(f => f.webkitRelativePath === pmxFileInfo.filename);
      if (!pmxFile) {
        throw new Error('Failed to create PMX file object');
      }
      
      reportProgress('convert', `Converting ${pmxFileInfo.filename} to BPMX...`);
      
      // Convert PMX to BPMX with reference files - now returns { bpmxData, modelMetadata }
      const { bpmxData, modelMetadata } = await this.convertWithAutoScene(
        pmxFile,
        referenceFiles,
        {
          buildSkeleton: true,
          buildMorph: true,
          preserveSerializationData: true
        }
      );
      
      reportProgress('save', 'Saving to storage...');
      
      const modelId = await modelStorageService.saveModel(
        null, 
        modelName,
        bpmxData,
        {
          originalFileName: pmxFileInfo.filename,
          zipFileName: zipFile.name || 'unknown.zip',
          pmxCount: validation.pmxCount,
          textureCount: validation.textureCount,
          totalFiles: validation.totalFiles,
          conversionInfo: {
            originalSize: pmxFileInfo.data.byteLength,
            bpmxSize: bpmxData.byteLength,
            compressionRatio: (bpmxData.byteLength / pmxFileInfo.data.byteLength).toFixed(2)
          },
          textures: modelMetadata.textures,
          meshParts: modelMetadata.meshParts
        }
      );
      
      reportProgress('complete', `Model saved: ${modelName}`);
      
      Logger.log('PMXConverter', `✓ Upload complete: ${modelId}`);
      Logger.log('PMXConverter', `  - Textures: ${modelMetadata.textures.length}`);
      Logger.log('PMXConverter', `  - Mesh Parts: ${modelMetadata.meshParts.length}`);
      return modelId;
      
    } catch (error) {
      Logger.error('PMXConverter', 'Upload failed:', error);
      throw error;
    }
  }

  /**
   * Validate ZIP file before processing
   * Quick check without full extraction
   * @param {File|Blob} zipFile - ZIP file to validate
   * @returns {Promise<{isValid: boolean, errors: string[]}>}
   */
  async quickValidate(zipFile) {
    try {
      const isValidZip = await zipExtractor.isValid(zipFile);
      if (!isValidZip) {
        return {
          isValid: false,
          errors: ['Invalid or corrupted ZIP file']
        };
      }
      
      const info = await zipExtractor.getInfo(zipFile);
      
      const errors = [];
      
      if (info.fileCount === 0) {
        errors.push('ZIP archive is empty');
      }
      
      const hasPMX = info.fileList.some(f => f.toLowerCase().endsWith('.pmx'));
      if (!hasPMX) {
        errors.push('No PMX file found in archive');
      }
      
      return {
        isValid: errors.length === 0,
        errors,
        fileCount: info.fileCount,
        totalSize: info.totalSize
      };
      
    } catch (error) {
      Logger.error('PMXConverter', 'Quick validation failed:', error);
      return {
        isValid: false,
        errors: [error.message]
      };
    }
  }
}

// Create singleton instance
export const pmxConverterService = new PMXConverterService();

export default pmxConverterService;
