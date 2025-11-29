/**
 * ThreeDSettings Component
 * 3D configuration tab for SettingsPanel
 * Handles model loading, physics, animations, custom model/motion uploads
 */

import { useState, useEffect, useRef } from 'react';
import { useConfig } from '../../contexts/ConfigContext';
import { useApp } from '../../contexts/AppContext';
import { useAnimation } from '../../contexts/AnimationContext';
import { PositionPresets, FPSLimitOptions, PhysicsEngineOptions, RenderQualityOptions } from '../../config/uiConfig';
import { AnimationCategory, getDefaultAnimationsByCategory } from '../../config/animationConfig';
import Toggle from '../common/Toggle';
import Dialog from '../common/Dialog';
import Icon from '../icons/Icon';
import { pmxConverterService } from '../../services/PMXConverterService';
import { vmdConverterService } from '../../services/VMDConverterService';
import { modelStorageService } from '../../services/ModelStorageService';
import { motionStorageService } from '../../services/MotionStorageService';

const ThreeDSettings = ({ isLightBackground, onRequestDeleteModelDialog, onRequestDeleteMotionDialog, refreshTrigger }) => {
  const {
    uiConfig,
    updateUIConfig,
  } = useConfig();

  const { reloadScene } = useApp();
  const { sceneRef } = useApp();

  const {
    disabledDefaultAnimations,
    customAnimations,
    toggleDefaultAnimation,
    toggleCustomAnimation,
    reloadCustomAnimations,
  } = useAnimation();

  // Model upload state
  const [models, setModels] = useState([]);
  const [modelUploadState, setModelUploadState] = useState({
    uploading: false,
    progress: '',
    error: null
  });
  const [editingModelId, setEditingModelId] = useState(null);
  const [editingModelName, setEditingModelName] = useState('');
  const modelFileInputRef = useRef(null);

  // Motion upload state
  const [motions, setMotions] = useState([]);
  const [motionUploadState, setMotionUploadState] = useState({
    uploading: false,
    progress: '',
    error: null,
    showCategoryPicker: false,
    pendingFiles: []
  });
  const [editingMotionId, setEditingMotionId] = useState(null);
  const [editingMotionName, setEditingMotionName] = useState('');
  const [expandedMotionSettings, setExpandedMotionSettings] = useState(null); // ID of motion showing expanded settings
  const motionFileInputRef = useRef(null);
  
  const [expandedModelSettings, setExpandedModelSettings] = useState(null); // ID of model showing expanded settings
  
  const [builtinModelMetadata, setBuiltinModelMetadata] = useState({ textures: [], meshParts: [] });

  const [portraitClipping, setPortraitClipping] = useState(12); // Default value (matches uiConfig)
  const [currentDefaultModelId, setCurrentDefaultModelId] = useState(null);
  const portraitClippingSaveTimer = useRef(null);

  // Error dialog state
  const [errorDialogMessage, setErrorDialogMessage] = useState('');
  const [showErrorDialog, setShowErrorDialog] = useState(false);

  useEffect(() => {
    loadModels();
    loadMotions();
    loadBuiltinModelMetadata();
  }, [refreshTrigger]);

  useEffect(() => {
    const loadPortraitClipping = async () => {
      const defaultModel = await modelStorageService.getDefaultModel();
      if (defaultModel) {
        setCurrentDefaultModelId(defaultModel.id);
        const clipping = defaultModel.metadata?.portraitClipping ?? 12;
        setPortraitClipping(clipping);
      } else {
        setCurrentDefaultModelId(null);
        setPortraitClipping(12);
      }
    };
    loadPortraitClipping();
  }, [models]);

  const loadModels = async () => {
    try {
      const modelsList = await modelStorageService.getModelsList();
      setModels(modelsList);
    } catch (error) {
      console.error('Failed to load models:', error);
    }
  };
  
  const loadBuiltinModelMetadata = async () => {
    try {
      const metadata = await modelStorageService.getBuiltinModelMetadata();
      setBuiltinModelMetadata(metadata);
    } catch (error) {
      console.error('Failed to load built-in model metadata:', error);
    }
  };

  const loadMotions = async () => {
    try {
      const motionsList = await motionStorageService.getMotionsList();
      setMotions(motionsList);
    } catch (error) {
      console.error('Failed to load motions:', error);
    }
  };

  const handleModelUpload = async (file) => {
    if (!file) return;

    setModelUploadState({ uploading: true, progress: 'Validating...', error: null });

    try {
      const validation = await pmxConverterService.quickValidate(file);
      if (!validation.isValid) {
        throw new Error(validation.errors.join(', '));
      }

      const modelName = file.name.replace(/\.zip$/i, '');

      await pmxConverterService.processModelUpload(file, modelName, (step, message) => {
        setModelUploadState(prev => ({ ...prev, progress: message }));
      });

      setModelUploadState({ uploading: false, progress: '', error: null });
      
      await loadModels();
      
    } catch (error) {
      setModelUploadState({ 
        uploading: false, 
        progress: '', 
        error: error.message 
      });
    }
  };

  const handleMotionUpload = async (files, animationCategories = []) => {
    if (!files || files.length === 0) return;

    setMotionUploadState({ uploading: true, progress: 'Converting...', error: null, showCategoryPicker: false, pendingFiles: [] });

    try {
      const fileArray = Array.from(files);
      
      const results = await vmdConverterService.convertBatch(fileArray);

      let savedCount = 0;
      for (const result of results) {
        if (!result.error && result.bvmdData) {
          const motionName = result.filename.replace(/\.vmd$/i, '');
          await motionStorageService.saveMotion(
            null,
            motionName,
            result.bvmdData,
            animationCategories,
            { originalFileName: result.filename },
            {} 
          );
          savedCount++;
        }
      }

      const failedCount = results.length - savedCount;
      
      setMotionUploadState({
        uploading: false,
        progress: '',
        error: failedCount > 0 ? `${failedCount} file(s) failed to upload` : null,
        showCategoryPicker: false,
        pendingFiles: []
      });

      // Refresh list AND reload animations in context
      await loadMotions();
      await reloadCustomAnimations();

    } catch (error) {
      setMotionUploadState({
        uploading: false,
        progress: '',
        error: error.message,
        showCategoryPicker: false,
        pendingFiles: []
      });
    }
  };

  const handleModelFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleModelUpload(file);
  };

  const handleMotionFileChange = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleMotionUpload(files, []);
    }
  };

  const handleSetDefault = async (modelId) => {
    try {
      await modelStorageService.setDefaultModel(modelId);
      await loadModels();
    } catch (error) {
      console.error('Failed to set default model:', error);
    }
  };

  const handleEditModel = (modelId, currentName) => {
    setEditingModelId(modelId);
    setEditingModelName(currentName);
  };

  const handleSaveModelName = async (modelId) => {
    try {
      await modelStorageService.updateModelName(modelId, editingModelName);
      setEditingModelId(null);
      setEditingModelName('');
      await loadModels();
    } catch (error) {
      console.error('Failed to update model name:', error);
    }
  };

  const handleCancelEditModel = () => {
    setEditingModelId(null);
    setEditingModelName('');
  };

  const handleDeleteModel = async (modelId) => {
    if (onRequestDeleteModelDialog) {
      onRequestDeleteModelDialog(modelId);
    }
  };

  const groupTexturesByType = (textures) => {
    if (!textures || textures.length === 0) return {};
    
    const grouped = {};
    textures.forEach(texture => {
      const type = texture.type || 'other';
      if (!grouped[type]) {
        grouped[type] = [];
      }
      grouped[type].push(texture);
    });
    
    Object.keys(grouped).forEach(type => {
      grouped[type].sort((a, b) => a.name.localeCompare(b.name));
    });
    
    return grouped;
  };

  const groupMeshPartsByCategory = (meshParts) => {
    if (!meshParts || meshParts.length === 0) return {};
    
    const grouped = {};
    meshParts.forEach(meshPart => {
      const category = meshPart.type || 'other';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(meshPart);
    });
    
    Object.keys(grouped).forEach(category => {
      grouped[category].sort((a, b) => a.name.localeCompare(b.name));
    });
    
    return grouped;
  };

  const handleToggleTexture = async (modelId, textureId) => {
    try {
      if (modelId === 'default') {
        const textures = builtinModelMetadata.textures || [];
        const texture = textures.find(t => t.id === textureId);
        if (!texture) return;

        const newIsActive = !texture.isActive;
        const updatedTextures = textures.map(t => 
          t.id === textureId ? { ...t, isActive: newIsActive } : t
        );

        await modelStorageService.updateModelMetadata('builtin_default_model', {
          textures: updatedTextures
        });

        setBuiltinModelMetadata(prev => ({ ...prev, textures: updatedTextures }));

        if (sceneRef?.current) {
          applyTextureToggleToScene(texture, newIsActive);
        }

        console.log(`🎨 Texture ${textureId} ${newIsActive ? 'enabled' : 'disabled'} for built-in model`);
        return;
      }
      
      const model = models.find(m => m.id === modelId);
      if (!model) return;

      const textures = model.metadata?.textures || [];
      const texture = textures.find(t => t.id === textureId);
      if (!texture) return;

      const newIsActive = !texture.isActive;
      const updatedTextures = textures.map(t => 
        t.id === textureId ? { ...t, isActive: newIsActive } : t
      );

      await modelStorageService.updateModelMetadata(modelId, {
        textures: updatedTextures
      });

      setModels(prev => prev.map(m => 
        m.id === modelId 
          ? { ...m, metadata: { ...m.metadata, textures: updatedTextures } }
          : m
      ));

      if (sceneRef?.current && modelId === (await modelStorageService.getDefaultModel())?.id) {
        applyTextureToggleToScene(texture, newIsActive);
      }

      console.log(`🎨 Texture ${textureId} ${newIsActive ? 'enabled' : 'disabled'} for model ${modelId}`);
    } catch (error) {
      console.error('Failed to toggle texture:', error);
    }
  };

  const handleToggleMeshPart = async (modelId, meshPartId) => {
    try {
      if (modelId === 'default') {
        const meshParts = builtinModelMetadata.meshParts || [];
        const meshPart = meshParts.find(mp => mp.id === meshPartId);
        if (!meshPart) return;

        const newIsVisible = !meshPart.isVisible;
        const updatedMeshParts = meshParts.map(mp => 
          mp.id === meshPartId ? { ...mp, isVisible: newIsVisible } : mp
        );

        await modelStorageService.updateModelMetadata('builtin_default_model', {
          meshParts: updatedMeshParts
        });

        setBuiltinModelMetadata(prev => ({ ...prev, meshParts: updatedMeshParts }));

        if (sceneRef?.current) {
          applyMeshPartToggleToScene(meshPart, newIsVisible);
        }

        console.log(`🎭 Mesh part ${meshPartId} ${newIsVisible ? 'shown' : 'hidden'} for built-in model`);
        return;
      }
      
      const model = models.find(m => m.id === modelId);
      if (!model) return;

      const meshParts = model.metadata?.meshParts || [];
      const meshPart = meshParts.find(mp => mp.id === meshPartId);
      if (!meshPart) return;

      const newIsVisible = !meshPart.isVisible;
      const updatedMeshParts = meshParts.map(mp => 
        mp.id === meshPartId ? { ...mp, isVisible: newIsVisible } : mp
      );

      await modelStorageService.updateModelMetadata(modelId, {
        meshParts: updatedMeshParts
      });

      setModels(prev => prev.map(m => 
        m.id === modelId 
          ? { ...m, metadata: { ...m.metadata, meshParts: updatedMeshParts } }
          : m
      ));

      if (sceneRef?.current && modelId === (await modelStorageService.getDefaultModel())?.id) {
        applyMeshPartToggleToScene(meshPart, newIsVisible);
      }

      console.log(`🎭 Mesh part ${meshPartId} ${newIsVisible ? 'shown' : 'hidden'} for model ${modelId}`);
    } catch (error) {
      console.error('Failed to toggle mesh part:', error);
    }
  };

  const applyTextureToggleToScene = (texture, isActive) => {
    try {
      const scene = sceneRef.current;
      if (!scene) {
        console.warn('⚠ Scene not available for texture toggle');
        return;
      }

      const modelMesh = scene.metadata?.modelMesh;
      if (!modelMesh) {
        console.warn('⚠ Model mesh not found in scene.metadata.modelMesh');
        return;
      }

      console.log('✓ Found model mesh:', modelMesh.name);

      const materials = [];
      
      if (modelMesh.metadata && modelMesh.metadata.materials) {
        console.log(`Adding ${modelMesh.metadata.materials.length} materials from metadata.materials`);
        materials.push(...modelMesh.metadata.materials);
      }
      
      if (modelMesh.material && !materials.includes(modelMesh.material)) {
        console.log(`Adding main material: ${modelMesh.material.name || 'Unnamed'}`);
        materials.push(modelMesh.material);
      }
      
      if (modelMesh.subMeshes) {
        console.log(`Checking ${modelMesh.subMeshes.length} submeshes`);
        modelMesh.subMeshes.forEach((subMesh, idx) => {
          if (subMesh.getMaterial && subMesh.getMaterial()) {
            const subMaterial = subMesh.getMaterial();
            if (subMaterial && !materials.includes(subMaterial)) {
              console.log(`Adding submesh ${idx} material: ${subMaterial.name || 'Unnamed'}`);
              materials.push(subMaterial);
            }
          }
        });
      }

      console.log(`✓ Collected ${materials.length} total materials, looking for index ${texture.materialIndex}`);

      if (texture.materialIndex >= materials.length) {
        console.warn(`❌ Material index ${texture.materialIndex} out of bounds (${materials.length} materials available)`);
        return;
      }

      const material = materials[texture.materialIndex];
      if (!material) {
        console.warn(`❌ Material at index ${texture.materialIndex} is null`);
        return;
      }

      console.log(`✓ Target material: ${material.name || 'Unnamed'}, texture type: ${texture.type}, isActive: ${isActive}`);

      const originalKey = `_original_${texture.type}_texture`;
      
      if (isActive) {
        switch (texture.type) {
          case 'diffuse':
            if (material[originalKey]) {
              material.diffuseTexture = material[originalKey];
              console.log('✓ Enabled diffuse texture (restored from original)');
            } else {
              console.warn('⚠ No original diffuse texture stored on material');
            }
            break;
          case 'sphere':
            if (material[originalKey]) {
              material.sphereTexture = material[originalKey];
              console.log('✓ Enabled sphere texture (restored from original)');
            } else {
              console.warn('⚠ No original sphere texture stored on material');
            }
            break;
          case 'toon':
            if (material[originalKey]) {
              material.toonTexture = material[originalKey];
              console.log('✓ Enabled toon texture (restored from original)');
            } else {
              console.warn('⚠ No original toon texture stored on material');
            }
            break;
          default:
            console.warn(`❌ Unknown texture type: ${texture.type}`);
        }
      } else {
        switch (texture.type) {
          case 'diffuse':
            if (material.diffuseTexture) {
              if (!material[originalKey]) {
                material[originalKey] = material.diffuseTexture;
                console.log('→ Stored original diffuse texture on material');
              }
              material.diffuseTexture = null;
              console.log('✓ Disabled diffuse texture (set to null)');
            } else {
              console.warn('⚠ No diffuse texture to disable');
            }
            break;
          case 'sphere':
            if (material.sphereTexture) {
              if (!material[originalKey]) {
                material[originalKey] = material.sphereTexture;
                console.log('→ Stored original sphere texture on material');
              }
              material.sphereTexture = null;
              console.log('✓ Disabled sphere texture (set to null)');
            } else {
              console.warn('⚠ No sphere texture to disable');
            }
            break;
          case 'toon':
            if (material.toonTexture) {
              if (!material[originalKey]) {
                material[originalKey] = material.toonTexture;
                console.log('→ Stored original toon texture on material');
              }
              material.toonTexture = null;
              console.log('✓ Disabled toon texture (set to null)');
            } else {
              console.warn('⚠ No toon texture to disable');
            }
            break;
          default:
            console.warn(`❌ Unknown texture type: ${texture.type}`);
        }
      }

      console.log(`✅ Applied texture ${texture.name} ${isActive ? 'enable' : 'disable'} to scene`);
    } catch (error) {
      console.error('❌ Failed to apply texture toggle to scene:', error);
    }
  };

  const applyMeshPartToggleToScene = (meshPart, isVisible) => {
    try {
      const scene = sceneRef.current;
      if (!scene) {
        console.warn('⚠ Scene not available for mesh toggle');
        return;
      }

      const modelMesh = scene.metadata?.modelMesh;
      if (!modelMesh) {
        console.warn('⚠ Model mesh not found in scene.metadata.modelMesh');
        return;
      }

      if (!modelMesh.metadata || !modelMesh.metadata.meshes) {
        console.warn('⚠ Model mesh.metadata.meshes not found');
        return;
      }

      const mesh = modelMesh.metadata.meshes[meshPart.meshIndex];
      if (!mesh) {
        console.warn(`⚠ Mesh at index ${meshPart.meshIndex} not found`);
        return;
      }

      console.log(`→ Toggling mesh ${meshPart.name} (type: ${meshPart.type}) to ${isVisible ? 'visible' : 'hidden'}`);

      if (meshPart.type === 'submesh' && meshPart.subMeshIndex !== undefined) {
        // Toggle submesh via material alpha (vassistant approach)
        if (mesh.subMeshes && mesh.subMeshes[meshPart.subMeshIndex]) {
          const subMesh = mesh.subMeshes[meshPart.subMeshIndex];
          const material = subMesh.getMaterial ? subMesh.getMaterial() : mesh.material;
          
          if (material) {
            if (isVisible) {
              // Restore original alpha
              material.alpha = material._originalAlpha !== undefined ? material._originalAlpha : 1;
              material._isHidden = false;
              console.log(`✓ Submesh ${meshPart.subMeshIndex} shown (alpha restored)`);
            } else {
              // Store original alpha and hide
              if (material._originalAlpha === undefined) {
                material._originalAlpha = material.alpha !== undefined ? material.alpha : 1;
                console.log(`→ Stored original alpha: ${material._originalAlpha}`);
              }
              material.alpha = 0;
              material._isHidden = true;
              console.log(`✓ Submesh ${meshPart.subMeshIndex} hidden (alpha = 0)`);
            }
          } else {
            console.warn('⚠ No material found for submesh');
          }
        } else {
          console.warn(`⚠ Submesh ${meshPart.subMeshIndex} not found`);
        }
      } else {
        // Toggle main mesh via setEnabled (vassistant approach)
        mesh.setEnabled(isVisible);
        console.log(`✓ Main mesh ${meshPart.name} ${isVisible ? 'shown' : 'hidden'} (setEnabled)`);
      }

      console.log(`✅ Applied mesh ${meshPart.name} ${isVisible ? 'show' : 'hide'} to scene`);
    } catch (error) {
      console.error('❌ Failed to apply mesh toggle to scene:', error);
    }
  };

  const handleDeleteMotion = async (motionId) => {
    if (onRequestDeleteMotionDialog) {
      onRequestDeleteMotionDialog(motionId);
    }
  };

  const handleEditMotion = (motionId, currentName) => {
    setEditingMotionId(motionId);
    setEditingMotionName(currentName);
  };

  const handleSaveMotionName = async (motionId) => {
    try {
      await motionStorageService.updateMotionName(motionId, editingMotionName);
      setEditingMotionId(null);
      setEditingMotionName('');
      await loadMotions();
    } catch (error) {
      console.error('Failed to update motion name:', error);
    }
  };

  const handleCancelEditMotion = () => {
    setEditingMotionId(null);
    setEditingMotionName('');
  };

  // Handle toggling category for a motion
  const handleToggleMotionCategory = async (motionId, category, isEnabled) => {
    try {
      const motion = motions.find(m => m.id === motionId);
      if (!motion) return;

      let updatedCategories = [...(motion.animationCategories || [])];
      const updatedEnabledByCategory = { ...(motion.enabledByCategory || {}) };

      if (isEnabled) {
        // Add category if not present
        if (!updatedCategories.includes(category)) {
          updatedCategories.push(category);
        }
        updatedEnabledByCategory[category] = true;
      } else {
        // Check if this is the last enabled motion in the category
        const categoryMotions = motions.filter(m => 
          m.animationCategories && m.animationCategories.includes(category)
        );
        const enabledInCategory = categoryMotions.filter(m => 
          m.enabledByCategory && m.enabledByCategory[category] === true
        );
        
        if (enabledInCategory.length === 1 && enabledInCategory[0].id === motionId) {
          throw new Error(`Cannot disable last enabled motion in category: ${category}`);
        }
        
        // Remove category from array and delete from enabledByCategory
        updatedCategories = updatedCategories.filter(cat => cat !== category);
        delete updatedEnabledByCategory[category];
      }

      // Update motion metadata
      await motionStorageService.updateMotionMetadata(motionId, {
        animationCategories: updatedCategories,
        enabledByCategory: updatedEnabledByCategory
      });

      // Update local state immediately for instant UI feedback
      setMotions(prev => prev.map(m => 
        m.id === motionId 
          ? { ...m, animationCategories: updatedCategories, enabledByCategory: updatedEnabledByCategory }
          : m
      ));

      console.log(`🔄 Motion ${motionId} category ${category} ${isEnabled ? 'enabled' : 'disabled'}`);
      console.log('Updated categories:', updatedCategories);
      console.log('Updated enabledByCategory:', updatedEnabledByCategory);

      await reloadCustomAnimations();
      
      console.log('✅ reloadCustomAnimations() completed');

      console.log(`Motion ${motionId} category ${category} ${isEnabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error('Failed to toggle motion category:', error);
      setErrorDialogMessage(error.message || 'Failed to toggle motion category');
      setShowErrorDialog(true);
    }
  };

  const handleToggleAnimation = async (animationId, newChecked, isDefault, category) => {
    try {
      if (isDefault) {
        toggleDefaultAnimation(animationId, newChecked);
        console.log(`Default animation ${animationId} ${newChecked ? 'enabled' : 'disabled'}`);
      } else {
        await toggleCustomAnimation(animationId, category, newChecked);
        console.log(`Custom animation ${animationId} ${newChecked ? 'enabled' : 'disabled'} in ${category}`);
      }
    } catch (error) {
      console.error('Failed to toggle animation:', error);
    }
  };

  const handlePortraitClippingChange = async (value) => {
    setPortraitClipping(value);
    
    const scene = sceneRef?.current;
    if (scene && scene.clipPlane) {
      const BABYLON = await import('@babylonjs/core');
      scene.clipPlane = new BABYLON.Plane(0, -1, 0, value);
      scene.metadata.portraitClipPlaneY = value;
    }
    
    if (portraitClippingSaveTimer.current) {
      clearTimeout(portraitClippingSaveTimer.current);
    }
    
    portraitClippingSaveTimer.current = setTimeout(async () => {
      if (currentDefaultModelId) {
        try {
          await modelStorageService.updateModelMetadata(currentDefaultModelId, {
            portraitClipping: value
          });
          
          console.log('Portrait clipping saved:', value);
        } catch (error) {
          console.error('Failed to save portrait clipping:', error);
        }
      }
    }, 500);
  };

  return (
    <div className="space-y-6">
      <h3 className="text-base font-semibold text-white mb-4">Avatar Configuration</h3>
      
      {/* Enable Avatar Toggle */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <label className="text-sm text-white font-medium">Enable Avatar</label>
            <p className="text-xs text-white/50 mt-0.5">
              {uiConfig.enableModelLoading 
                ? 'Virtual assistant with animated 3D avatar' 
                : 'Chat-only mode (no 3D avatar)'}
            </p>
          </div>
          <Toggle
            checked={uiConfig.enableModelLoading}
            onChange={(checked) => updateUIConfig('enableModelLoading', checked)}
          />
        </div>
      </div>

      {/* Reload Scene Button */}
      {uiConfig.enableModelLoading && (
        <div className="space-y-2">
          <button
            onClick={reloadScene}
            className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} w-full px-4 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2`}
          >
            <Icon name="refresh" size={16} />
            Reload Avatar
          </button>
          <p className="text-xs text-white/50 text-center">
            Refresh the avatar after changing model or settings
          </p>
        </div>
      )}

      {/* Character Display Settings - Only show when avatar is enabled */}
      {uiConfig.enableModelLoading && (
        <>
          {/* Portrait Mode Toggle */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <label className="text-sm text-white font-medium">Portrait Mode</label>
                <p className="text-xs text-white/50 mt-0.5">
                  {uiConfig.enablePortraitMode 
                    ? 'Upper body framing with closer camera view' 
                    : 'Full body view with standard camera'}
                </p>
              </div>
              <Toggle
                checked={uiConfig.enablePortraitMode || false}
                onChange={(checked) => updateUIConfig('enablePortraitMode', checked)}
              />
            </div>

            {/* Portrait Clipping Adjustment - Only show when portrait mode is enabled */}
            {uiConfig.enablePortraitMode && (
              <div className="mt-3 pt-3 border-t border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-white/70 font-medium">Clipping Height</label>
                  <span className="text-xs text-white/50">{portraitClipping.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="15"
                  step="0.1"
                  value={portraitClipping}
                  onChange={(e) => handlePortraitClippingChange(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer"
                  style={{
                    accentColor: 'rgba(147, 51, 234, 0.8)'
                  }}
                />
                <p className="text-xs text-white/40 mt-1.5">
                  Adjust for different model heights (lower = show more body, higher = show less)
                </p>
              </div>
            )}
          </div>

          {/* Physics Toggle */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <label className="text-sm text-white font-medium">Physics Simulation</label>
                <p className="text-xs text-white/50 mt-0.5">
                  {uiConfig.enablePhysics !== false
                    ? 'Realistic hair and cloth movement' 
                    : 'Disable physics for better performance'}
                </p>
              </div>
              <Toggle
                checked={uiConfig.enablePhysics !== false}
                onChange={(checked) => updateUIConfig('enablePhysics', checked)}
              />
            </div>
            
            {/* Physics Engine Selector - Only show in non-extension mode when physics is enabled */}
            {uiConfig.enablePhysics !== false && (typeof __EXTENSION_MODE__ === 'undefined' || !__EXTENSION_MODE__) && (
              <div className="mt-3 pt-3 border-t border-white/10">
                <label className="block text-xs text-white/70 font-medium mb-2">Physics Engine</label>
                <select
                  value={uiConfig.physicsEngine || PhysicsEngineOptions.BULLET}
                  onChange={(e) => updateUIConfig('physicsEngine', e.target.value)}
                  className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full text-sm`}
                >
                  <option value={PhysicsEngineOptions.BULLET} className="bg-gray-900">Bullet Physics (Recommended)</option>
                  <option value={PhysicsEngineOptions.HAVOK} className="bg-gray-900">Havok Physics</option>
                </select>
                <p className="text-xs text-white/40 mt-1.5">
                  {uiConfig.physicsEngine === PhysicsEngineOptions.BULLET
                    ? 'WASM-based physics with better MMD compatibility'
                    : 'Alternative physics engine'}
                </p>
              </div>
            )}
          </div>

          {/* FPS Limit */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/90">Frame Rate Limit</label>
            <select
              value={uiConfig.fpsLimit || FPSLimitOptions.FPS_60}
              onChange={(e) => {
                const value = e.target.value === 'native' ? 'native' : parseInt(e.target.value);
                updateUIConfig('fpsLimit', value);
              }}
              className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
            >
              <option value={FPSLimitOptions.FPS_15} className="bg-gray-900">15 FPS (Ultra Battery Saver)</option>
              <option value={FPSLimitOptions.FPS_24} className="bg-gray-900">24 FPS (Cinematic)</option>
              <option value={FPSLimitOptions.FPS_30} className="bg-gray-900">30 FPS (Battery Saver)</option>
              <option value={FPSLimitOptions.FPS_60} className="bg-gray-900">60 FPS (Recommended)</option>
              <option value={FPSLimitOptions.FPS_90} className="bg-gray-900">90 FPS (High Refresh)</option>
              <option value={FPSLimitOptions.NATIVE} className="bg-gray-900">Native (Monitor Rate)</option>
            </select>
            {uiConfig.fpsLimit === FPSLimitOptions.NATIVE || uiConfig.fpsLimit === 'native' ? (
              <div className="mt-2 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex items-start gap-2">
                <Icon name="alert-triangle" size={14} className="text-yellow-200/90 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-yellow-200/90">
                  Native refresh rate may impact performance on high-refresh monitors (144Hz+)
                </p>
              </div>
            ) : (
              <p className="text-xs text-white/50">
                Limits rendering to {uiConfig.fpsLimit || 60} frames per second
              </p>
            )}
          </div>

          {/* Render Quality */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/90">Render Quality</label>
            <select
              value={uiConfig.renderQuality || RenderQualityOptions.MEDIUM}
              onChange={(e) => updateUIConfig('renderQuality', e.target.value)}
              className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
            >
              <option value={RenderQualityOptions.LOW} className="bg-gray-900">Low (Best Performance)</option>
              <option value={RenderQualityOptions.MEDIUM} className="bg-gray-900">Medium (Balanced)</option>
              <option value={RenderQualityOptions.HIGH} className="bg-gray-900">High (Better Quality)</option>
              <option value={RenderQualityOptions.ULTRA} className="bg-gray-900">Ultra (Maximum Quality)</option>
            </select>
            <p className="text-xs text-white/50">
              {uiConfig.renderQuality === RenderQualityOptions.LOW && 'Minimal effects for low-end devices and better battery life'}
              {(uiConfig.renderQuality === RenderQualityOptions.MEDIUM || !uiConfig.renderQuality) && 'Balanced quality with bloom, FXAA, and tone mapping'}
              {uiConfig.renderQuality === RenderQualityOptions.HIGH && 'Full post-processing with high-quality anti-aliasing'}
              {uiConfig.renderQuality === RenderQualityOptions.ULTRA && 'Maximum quality with 8x MSAA and all effects enabled'}
            </p>
          </div>

          {/* Position Preset */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/90">Character Position</label>
            <select
              value={uiConfig.position?.preset || 'bottom-right'}
              onChange={(e) => updateUIConfig('position.preset', e.target.value)}
              className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
            >
              <option value="last-location" className="bg-gray-900">Last Location (Remember Position)</option>
              {Object.entries(PositionPresets).map(([key, preset]) => (
                <option key={key} value={key} className="bg-gray-900">
                  {preset.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-white/50">
              {uiConfig.position?.preset === 'last-location'
                ? 'Will load at the last dragged position. Drag to save new position.'
                : 'Changes will apply on next page load or reload'}
            </p>
          </div>

          {/* Model Management Section */}
          <div className="space-y-4 border-t border-white/10 pt-4">
            <h4 className="text-sm font-semibold text-white mb-3">Custom Models</h4>
            
            {/* Model Upload */}
            <div className="space-y-3">
              <input
                ref={modelFileInputRef}
                type="file"
                accept=".zip"
                onChange={handleModelFileChange}
                className="hidden"
              />
              
              <button
                onClick={() => modelFileInputRef.current?.click()}
                disabled={modelUploadState.uploading}
                className="w-full p-4 border-2 border-dashed border-white/20 hover:border-white/40 rounded-lg text-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Icon name="upload" size={32} className="mx-auto mb-2 text-white/70" />
                <p className="text-sm text-white/90 mb-1">
                  {modelUploadState.uploading ? modelUploadState.progress : 'Upload PMX Model (ZIP)'}
                </p>
                <p className="text-xs text-white/50">Click to browse</p>
              </button>

              {modelUploadState.error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-400/20">
                  <p className="text-xs text-red-200">{modelUploadState.error}</p>
                </div>
              )}
            </div>

            {/* Model List */}
            <div className="max-h-[400px] overflow-y-auto space-y-2 hover-scrollbar">
              {/* Default Built-in Model */}
              <div className="rounded-lg bg-white/5 border border-white/10">
                <div className="p-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">
                      VAssist Default
                    </p>
                    <p className="text-xs text-white/50">Built-in model</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {/* Dropdown button for default model textures/meshes */}
                    <button
                      onClick={() => setExpandedModelSettings(expandedModelSettings === 'default' ? null : 'default')}
                      className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white/80 transition-colors"
                      title="Configure textures & meshes"
                    >
                      <Icon name={expandedModelSettings === 'default' ? "chevron-down" : "chevron-right"} size={16} />
                    </button>
                    
                    <Toggle
                      checked={models.every(m => !m.isDefault)}
                      onChange={(checked) => {
                        if (checked) {
                          // Clear all defaults to use built-in
                          modelStorageService.clearAllDefaults().then(loadModels);
                        }
                      }}
                    />
                  </div>
                </div>
                
                {/* Expandable Settings for Default Model */}
                {expandedModelSettings === 'default' && (
                  <div className="px-3 pb-3 pt-0 space-y-4 border-t border-white/10 max-h-[400px] overflow-y-auto">
                    {/* Textures Section - Grouped by Type */}
                    {builtinModelMetadata.textures && builtinModelMetadata.textures.length > 0 ? (() => {
                      const groupedTextures = groupTexturesByType(builtinModelMetadata.textures);
                      return (
                        <div className="space-y-3">
                          <p className="text-xs font-medium text-white/70 py-1">
                            Textures
                          </p>
                          {Object.entries(groupedTextures).map(([type, textures]) => (
                            <div key={type} className="space-y-2">
                              <p className="text-[10px] font-medium text-white/50 uppercase tracking-wide">
                                {type}
                              </p>
                              <div className="grid grid-cols-3 gap-2">
                                {textures.map((texture) => (
                                  <button
                                    key={texture.id}
                                    onClick={() => handleToggleTexture('default', texture.id)}
                                    className={`
                                      relative p-2 rounded-lg text-left transition-all duration-200
                                      backdrop-blur-sm
                                      ${texture.isActive 
                                        ? 'bg-white/10 hover:bg-white/15 shadow-sm' 
                                        : 'bg-white/5 hover:bg-white/10 opacity-40'
                                      }
                                    `}
                                    title={texture.name}
                                  >
                                    <span className="text-xs text-white/90 truncate block">
                                      {(() => {
                                        let cleanName = texture.name
                                          .replace(/\s*-\s*(Diffuse|Sphere|Toon|Normal|Specular|Emission|Alpha)$/i, '')
                                          .replace(/_mat\d+_\w+$/i, '')
                                          .replace(/^.*?\s*-\s*/, '');
                                        return cleanName || texture.name;
                                      })()}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })() : null}
                    
                    {/* Mesh Parts Section - Grouped by Category */}
                    {builtinModelMetadata.meshParts && builtinModelMetadata.meshParts.length > 0 ? (() => {
                      const groupedMeshParts = groupMeshPartsByCategory(builtinModelMetadata.meshParts);
                      return (
                        <div className="space-y-3">
                          <p className="text-xs font-medium text-white/70 py-1">
                            Mesh Parts
                          </p>
                          {Object.entries(groupedMeshParts).map(([category, meshParts]) => (
                            <div key={category} className="space-y-2">
                              <p className="text-[10px] font-medium text-white/50 uppercase tracking-wide">
                                {category}
                              </p>
                              <div className="grid grid-cols-3 gap-2">
                                {meshParts.map((meshPart) => (
                                  <button
                                    key={meshPart.id}
                                    onClick={() => handleToggleMeshPart('default', meshPart.id)}
                                    className={`
                                      relative p-2 rounded-lg text-left transition-all duration-200
                                      backdrop-blur-sm
                                      ${meshPart.isVisible 
                                        ? 'bg-white/10 hover:bg-white/15 shadow-sm' 
                                        : 'bg-white/5 hover:bg-white/10 opacity-40'
                                      }
                                    `}
                                    title={meshPart.name}
                                  >
                                    <span className="text-xs text-white/90 truncate block">
                                      {(() => {
                                        let cleanName = meshPart.name
                                          .replace(/^mesh_\d+\s*-?\s*/i, '')
                                          .replace(/^Mesh \d+\s*-?\s*/i, '')
                                          .trim();
                                        return cleanName || meshPart.name;
                                      })()}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })() : null}
                    
                    {/* No textures/meshes message */}
                    {(!builtinModelMetadata.textures || builtinModelMetadata.textures.length === 0) && 
                     (!builtinModelMetadata.meshParts || builtinModelMetadata.meshParts.length === 0) && (
                      <p className="text-xs text-white/50 text-center py-4">
                        Texture and mesh configuration will be available after the model loads
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Custom Models */}
              {models.map((model) => (
                <div
                  key={model.id}
                  className="relative rounded-lg bg-white/5 border border-white/10"
                >
                  {/* Model info and name editing */}
                  <div className="flex items-center justify-between gap-3 p-3">
                    <div className="flex-1 min-w-0">
                      {editingModelId === model.id ? (
                        <input
                          type="text"
                          value={editingModelName}
                          onChange={(e) => setEditingModelName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveModelName(model.id);
                            if (e.key === 'Escape') handleCancelEditModel();
                          }}
                          className="text-sm text-white font-medium bg-transparent border-none outline-none w-full p-0"
                          autoFocus
                        />
                      ) : (
                        <p className="text-sm text-white font-medium truncate">
                          {model.name}
                        </p>
                      )}
                      <p className="text-xs text-white/50">
                        {(model.metadata?.fileSize / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                    
                    {/* Right side controls */}
                    <div className="flex items-center gap-1">
                      {editingModelId === model.id ? (
                        <>
                          <button
                            onClick={() => handleSaveModelName(model.id)}
                            className="p-1 rounded hover:bg-green-500/20 text-green-300 transition-colors"
                            title="Save"
                          >
                            <Icon name="check" size={16} />
                          </button>
                          <button
                            onClick={handleCancelEditModel}
                            className="p-1 rounded hover:bg-red-500/20 text-red-300 transition-colors"
                            title="Cancel"
                          >
                            <Icon name="x" size={16} />
                          </button>
                        </>
                      ) : (
                        <>
                          {/* Settings button for textures/meshes */}
                          <button
                            onClick={() => setExpandedModelSettings(expandedModelSettings === model.id ? null : model.id)}
                            className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white/80 transition-colors"
                            title="Configure textures & meshes"
                          >
                            <Icon name={expandedModelSettings === model.id ? "chevron-down" : "chevron-right"} size={16} />
                          </button>
                          
                          <button
                            onClick={() => handleEditModel(model.id, model.name)}
                            className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white/80 transition-colors"
                            title="Edit name"
                          >
                            <Icon name="edit-2" size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteModel(model.id)}
                            className="p-1 rounded hover:bg-red-500/20 text-white/50 hover:text-red-300 transition-colors"
                            title="Delete"
                          >
                            <Icon name="trash-2" size={16} />
                          </button>
                          <Toggle
                            checked={model.isDefault}
                            onChange={(checked) => {
                              if (checked) {
                                handleSetDefault(model.id);
                              }
                            }}
                          />
                        </>
                      )}
                    </div>
                  </div>
                  
                  {/* Expandable Texture & Mesh Settings */}
                  {expandedModelSettings === model.id && (
                    <div className="px-3 pb-3 pt-0 space-y-4 border-t border-white/10 max-h-[400px] overflow-y-auto">
                      {/* Textures Section - Grouped by Type */}
                      {model.metadata?.textures && model.metadata.textures.length > 0 && (() => {
                        const groupedTextures = groupTexturesByType(model.metadata.textures);
                        return (
                          <div className="space-y-3">
                            <p className="text-xs font-medium text-white/70 py-1">
                              Textures
                            </p>
                            {Object.entries(groupedTextures).map(([type, textures]) => (
                              <div key={type} className="space-y-2">
                                <p className="text-[10px] font-medium text-white/50 uppercase tracking-wide">
                                  {type}
                                </p>
                                <div className="grid grid-cols-3 gap-2">
                                  {textures.map((texture) => (
                                    <button
                                      key={texture.id}
                                      onClick={() => handleToggleTexture(model.id, texture.id)}
                                      className={`
                                        relative p-2 rounded-lg text-left transition-all duration-200
                                        backdrop-blur-sm
                                        ${texture.isActive 
                                          ? 'bg-white/10 hover:bg-white/15 shadow-sm' 
                                          : 'bg-white/5 hover:bg-white/10 opacity-40'
                                        }
                                      `}
                                      title={texture.name}
                                    >
                                      <span className="text-xs text-white/90 truncate block">
                                        {(() => {
                                          // Clean up texture name: remove "mat##_type" pattern
                                          let cleanName = texture.name
                                            .replace(/\s*-\s*(Diffuse|Sphere|Toon|Normal|Specular|Emission|Alpha)$/i, '')
                                            .replace(/_mat\d+_\w+$/i, '')
                                            .replace(/^.*?\s*-\s*/, ''); // Remove "Material ## -" prefix
                                          return cleanName || texture.name;
                                        })()}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                      
                      {/* Mesh Parts Section - Grouped by Category */}
                      {model.metadata?.meshParts && model.metadata.meshParts.length > 0 && (() => {
                        const groupedMeshParts = groupMeshPartsByCategory(model.metadata.meshParts);
                        return (
                          <div className="space-y-3">
                            <p className="text-xs font-medium text-white/70 py-1">
                              Mesh Parts
                            </p>
                            {Object.entries(groupedMeshParts).map(([category, meshParts]) => (
                              <div key={category} className="space-y-2">
                                <p className="text-[10px] font-medium text-white/50 uppercase tracking-wide">
                                  {category}
                                </p>
                                <div className="grid grid-cols-3 gap-2">
                                  {meshParts.map((meshPart) => (
                                    <button
                                      key={meshPart.id}
                                      onClick={() => handleToggleMeshPart(model.id, meshPart.id)}
                                      className={`
                                        relative p-2 rounded-lg text-left transition-all duration-200
                                        backdrop-blur-sm
                                        ${meshPart.isVisible 
                                          ? 'bg-white/10 hover:bg-white/15 shadow-sm' 
                                          : 'bg-white/5 hover:bg-white/10 opacity-40'
                                        }
                                      `}
                                      title={meshPart.name}
                                    >
                                      <span className="text-xs text-white/90 truncate block">
                                        {(() => {
                                          // Clean up mesh part name
                                          let cleanName = meshPart.name
                                            .replace(/^mesh_\d+\s*-?\s*/i, '') // Remove "mesh_##" prefix
                                            .replace(/^Mesh \d+\s*-?\s*/i, '') // Remove "Mesh ##" prefix
                                            .trim();
                                          return cleanName || meshPart.name;
                                        })()}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                      
                      {/* No textures/meshes message */}
                      {(!model.metadata?.textures || model.metadata.textures.length === 0) && 
                       (!model.metadata?.meshParts || model.metadata.meshParts.length === 0) && (
                        <p className="text-xs text-white/50 text-center py-2">
                          No textures or mesh parts available
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Motion Management Section */}
          <div className="space-y-4 border-t border-white/10 pt-4">
            <h4 className="text-sm font-semibold text-white mb-3">Custom Animations</h4>
            
            {/* Motion Upload */}
            <div className="space-y-3">
              <input
                ref={motionFileInputRef}
                type="file"
                accept=".vmd"
                multiple
                onChange={handleMotionFileChange}
                className="hidden"
              />
              
              <button
                onClick={() => motionFileInputRef.current?.click()}
                disabled={motionUploadState.uploading}
                className="w-full p-4 border-2 border-dashed border-white/20 hover:border-white/40 rounded-lg text-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Icon name="upload" size={32} className="mx-auto mb-2 text-white/70" />
                <p className="text-sm text-white/90 mb-1">
                  {motionUploadState.uploading ? motionUploadState.progress : 'Upload VMD Animations'}
                </p>
                <p className="text-xs text-white/50">Click to browse (supports multiple files)</p>
              </button>

              {motionUploadState.error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-400/20">
                  <p className="text-xs text-red-200">{motionUploadState.error}</p>
                </div>
              )}

            </div>

            {/* Motion List */}
            {motions.length > 0 && (
              <div className="max-h-[400px] overflow-y-auto space-y-2 hover-scrollbar">
                {motions.map((motion) => {
                  return (
                    <div
                      key={motion.id}
                      className="relative rounded-lg bg-white/5 border border-white/10"
                    >
                      {/* Motion info and name editing */}
                      <div className="flex items-center justify-between gap-3 p-3">
                        <div className="flex-1 min-w-0">
                          {editingMotionId === motion.id ? (
                            <input
                              type="text"
                              value={editingMotionName}
                              onChange={(e) => setEditingMotionName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveMotionName(motion.id);
                                if (e.key === 'Escape') handleCancelEditMotion();
                              }}
                              className="text-sm text-white font-medium bg-transparent border-none outline-none w-full p-0"
                              autoFocus
                            />
                          ) : (
                            <p className="text-sm text-white font-medium truncate">
                              {motion.name}
                            </p>
                          )}
                          <p className="text-xs text-white/50">
                            {(motion.metadata?.fileSize / 1024).toFixed(1)} KB
                          </p>
                        </div>
                        
                        {/* Right side controls */}
                        <div className="flex items-center gap-1">
                          {editingMotionId === motion.id ? (
                            <>
                              <button
                                onClick={() => handleSaveMotionName(motion.id)}
                                className="p-1 rounded hover:bg-green-500/20 text-green-300 transition-colors"
                                title="Save"
                              >
                                <Icon name="check" size={16} />
                              </button>
                              <button
                                onClick={handleCancelEditMotion}
                                className="p-1 rounded hover:bg-red-500/20 text-red-300 transition-colors"
                                title="Cancel"
                              >
                                <Icon name="x" size={16} />
                              </button>
                            </>
                          ) : (
                            <>
                              {/* Settings button BEFORE edit/delete */}
                              <button
                                onClick={() => setExpandedMotionSettings(expandedMotionSettings === motion.id ? null : motion.id)}
                                className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white/80 transition-colors"
                                title="Configure categories"
                              >
                                <Icon name={expandedMotionSettings === motion.id ? "chevron-down" : "chevron-right"} size={16} />
                              </button>
                              
                              <button
                                onClick={() => handleEditMotion(motion.id, motion.name)}
                                className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white/80 transition-colors"
                                title="Edit name"
                              >
                                <Icon name="edit-2" size={16} />
                              </button>
                              <button
                                onClick={() => handleDeleteMotion(motion.id)}
                                className="p-1 rounded hover:bg-red-500/20 text-white/50 hover:text-red-300 transition-colors"
                                title="Delete"
                              >
                                <Icon name="trash-2" size={16} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      
                      {/* Expandable Category Settings */}
                      {expandedMotionSettings === motion.id && (
                        <div className="px-3 pb-3 pt-0 space-y-2 border-t border-white/10">
                          <p className="text-xs font-medium text-white/70 mb-1">Animation Categories</p>
                          {Object.values(AnimationCategory).map((category) => {
                            const isEnabled = motion.enabledByCategory && motion.enabledByCategory[category] === true;
                            return (
                              <div key={category} className="flex items-center justify-between gap-2">
                                <span className="text-xs capitalize text-white/80">{category}</span>
                                <Toggle
                                  checked={isEnabled}
                                  onChange={(checked) => handleToggleMotionCategory(motion.id, category, checked)}
                                  size="sm"
                                  isLightBackground={isLightBackground}
                                />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Animation Management */}
          <div className="space-y-3 pt-6 border-t border-white/10">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-white">Animation Management</h4>
            </div>

            {/* Animation Categories */}
            <div className="space-y-4">
              {Object.keys(AnimationCategory).map((categoryKey) => {
                const category = AnimationCategory[categoryKey];
                return (
                  <AnimationCategorySection
                    key={category}
                    category={category}
                    customMotions={customAnimations}
                    disabledDefaultAnimations={disabledDefaultAnimations}
                    onToggleAnimation={handleToggleAnimation}
                    isLightBackground={isLightBackground}
                  />
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Error Dialog */}
      {showErrorDialog && (
        <Dialog
          type="confirm"
          title="Error"
          message={errorDialogMessage}
          confirmLabel="OK"
          confirmStyle="primary"
          isLightBackground={isLightBackground}
          onConfirm={() => setShowErrorDialog(false)}
          onCancel={() => setShowErrorDialog(false)}
        />
      )}
    </div>
  );
};

// Animation Category Section Component
const AnimationCategorySection = ({ category, customMotions, disabledDefaultAnimations, onToggleAnimation, isLightBackground }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const defaultAnimations = getDefaultAnimationsByCategory(category);

  const customMotionsInCategory = customMotions.filter(m => 
    m.animationCategories && m.animationCategories.includes(category)
  );
  
  const totalAnimations = defaultAnimations.length + customMotionsInCategory.length;
  const enabledDefaultCount = defaultAnimations.filter(anim => !disabledDefaultAnimations[anim.id]).length;
  const enabledCustomCount = customMotionsInCategory.filter(m => 
    m.enabledByCategory && m.enabledByCategory[category] === true
  ).length;
  const totalEnabledCount = enabledDefaultCount + enabledCustomCount;
  
  return (
    <div className="rounded-lg bg-white/5 border border-white/10 overflow-hidden">
      {/* Category Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-3 flex items-center justify-between hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Icon name={isExpanded ? 'chevron-down' : 'chevron-right'} size={16} />
          <div className="text-left">
            <p className="text-sm font-medium text-white capitalize">{category}</p>
            <p className="text-xs text-white/50">
              {enabledDefaultCount}/{defaultAnimations.length} default + {enabledCustomCount}/{customMotionsInCategory.length} custom
            </p>
          </div>
        </div>
        <span className="text-xs text-white/50">{totalAnimations} total</span>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-3 pt-0 space-y-2 border-t border-white/10">
          {/* Default Animations */}
          {defaultAnimations.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-white/70 mb-2">Default Animations</p>
              <div className="max-h-[200px] overflow-y-auto space-y-1 hover-scrollbar">
                {defaultAnimations.map((anim) => {
                  const isEnabled = !disabledDefaultAnimations[anim.id];
                  const isLastEnabled = isEnabled && totalEnabledCount === 1;
                  return (
                    <div
                      key={anim.id}
                      className="p-2 rounded bg-white/3 flex items-center justify-between gap-2"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-white/80 truncate">{anim.name}</p>
                        <p className="text-[10px] text-white/40 truncate">{anim.metadata?.description || 'Built-in animation'}</p>
                      </div>
                      <Toggle
                        checked={isEnabled}
                        onChange={(newChecked) => onToggleAnimation(anim.id, newChecked, true)}
                        disabled={isLastEnabled}
                        size="sm"
                        isLightBackground={isLightBackground}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Custom Animations */}
          {customMotionsInCategory.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-white/70 mb-2">Custom Animations</p>
              <div className="max-h-[200px] overflow-y-auto space-y-1 hover-scrollbar">
                {customMotionsInCategory.map((motion) => {
                  const isEnabled = motion.enabledByCategory && motion.enabledByCategory[category] === true;
                  const isLastEnabled = isEnabled && totalEnabledCount === 1;
                  return (
                    <div
                      key={motion.id}
                      className="p-2 rounded bg-white/3 flex items-center justify-between gap-2"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-white/80 truncate">{motion.name}</p>
                        <p className="text-[10px] text-white/40 truncate">
                          {(motion.metadata?.fileSize / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      {/* Enable/Disable Toggle for this category */}
                      <Toggle
                        checked={isEnabled}
                        onChange={async (newChecked) => await onToggleAnimation(motion.id, newChecked, false, category)}
                        disabled={isLastEnabled}
                        size="sm"
                        isLightBackground={isLightBackground}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty State */}
          {customMotions.length === 0 && (
            <p className="text-xs text-white/40 text-center py-2">
              No custom animations in this category
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default ThreeDSettings;
