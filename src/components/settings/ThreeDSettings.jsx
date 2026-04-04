/**
 * ThreeDSettings Component
 * 3D configuration tab for SettingsPanel
 * Handles model loading, physics, animations, custom model/motion uploads
 */

import { useState, useEffect, useRef } from 'react';
import { useConfig } from '../../contexts/ConfigContext';
import { useApp } from '../../contexts/AppContext';
import { useAnimation } from '../../contexts/AnimationContext';
import { PositionPresets, FPSLimitOptions, PhysicsEngineOptions, RenderQualityOptions, DefaultCustomQualitySettings } from '../../config/uiConfig';
import { AnimationCategory, getDefaultAnimationsByCategory } from '../../config/animationConfig';
import Toggle from '../common/Toggle';
import Dialog from '../common/Dialog';
import Icon from '../icons/Icon';
import { pmxConverterService } from '../../services/PMXConverterService';
import { vmdConverterService } from '../../services/VMDConverterService';
import { modelStorageService } from '../../services/ModelStorageService';
import { stageStorageService } from '../../services/StageStorageService';
import { motionStorageService } from '../../services/MotionStorageService';
import emoteStorageService from '../../services/EmoteStorageService';
import JSZip from 'jszip';

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

  const [activeSubTab, setActiveSubTab] = useState('display');
  const [subTabIndicatorStyle, setSubTabIndicatorStyle] = useState({ left: 0, width: 0 });
  const subTabsRef = useState({
    display: null,
    performance: null,
    models: null,
    animations: null,
    emotes: null,
  })[0];

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

  // Stage upload state
  const [stages, setStages] = useState([]);
  const [stageUploadState, setStageUploadState] = useState({
    uploading: false,
    progress: '',
    error: null
  });
  const [editingStageId, setEditingStageId] = useState(null);
  const [editingStageName, setEditingStageName] = useState('');
  const stageFileInputRef = useRef(null);

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

  const [emotes, setEmotes] = useState([]);
  const [emoteUploadState, setEmoteUploadState] = useState({
    uploading: false,
    progress: '',
    error: null
  });
  const [editingEmoteId, setEditingEmoteId] = useState(null);
  const [editingEmoteName, setEditingEmoteName] = useState('');
  const [emoteName, setEmoteName] = useState('');
  const [selectedEmoteAudioFile, setSelectedEmoteAudioFile] = useState(null);
  const [selectedEmoteMotionFile, setSelectedEmoteMotionFile] = useState(null);
  const [selectedEmoteCameraFile, setSelectedEmoteCameraFile] = useState(null);
  const emoteAudioFileInputRef = useRef(null);
  const emoteMotionFileInputRef = useRef(null);
  const emoteCameraFileInputRef = useRef(null);
  const emoteZipFileInputRef = useRef(null);
  
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
    loadStages();
    loadMotions();
    loadEmotes();
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

  // Update sub-tab indicator position
  useEffect(() => {
    const activeTabElement = subTabsRef[activeSubTab];
    if (activeTabElement) {
      const { offsetLeft, offsetWidth } = activeTabElement;
      setSubTabIndicatorStyle({ left: offsetLeft, width: offsetWidth });
    }
  }, [activeSubTab, subTabsRef]);

  const loadModels = async () => {
    try {
      const modelsList = await modelStorageService.getModelsList();
      // Filter out Unknown Model (default model without data)
      const filteredModels = modelsList.filter(model => model.name !== 'Unknown Model');
      setModels(filteredModels);
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

  const loadStages = async () => {
    try {
      const stagesList = await stageStorageService.getStagesList();
      setStages(stagesList);
    } catch (error) {
      console.error('Failed to load stages:', error);
    }
  };

  const handleStageUpload = async (file) => {
    if (!file) return;

    setStageUploadState({ uploading: true, progress: 'Validating...', error: null });

    try {
      const validation = await pmxConverterService.quickValidate(file);
      if (!validation.isValid) {
        throw new Error(validation.errors.join(', '));
      }

      const stageName = file.name.replace(/\.zip$/i, '');

      await pmxConverterService.processModelUpload(file, stageName, (step, message) => {
        setStageUploadState(prev => ({ ...prev, progress: message }));
      }).then(async (modelId) => {
        // Get the converted model data
        const modelData = await modelStorageService.getModel(modelId);
        
        // Save as stage instead
        const stageId = await stageStorageService.saveStage(
          null,
          stageName,
          modelData.modelData,
          modelData.metadata
        );
        
        // Delete from models storage
        await modelStorageService.deleteModel(modelId);
        
        return stageId;
      });

      setStageUploadState({ uploading: false, progress: '', error: null });
      
      await loadStages();
      
    } catch (error) {
      setStageUploadState({ 
        uploading: false, 
        progress: '', 
        error: error.message 
      });
    }
  };

  const handleStageFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleStageUpload(file);
  };

  const handleSetDefaultStage = async (stageId) => {
    try {
      await stageStorageService.setDefaultStage(stageId);
      await loadStages();
    } catch (error) {
      console.error('Failed to set default stage:', error);
    }
  };

  const handleEditStage = (stageId, currentName) => {
    setEditingStageId(stageId);
    setEditingStageName(currentName);
  };

  const handleSaveStageName = async (stageId) => {
    try {
      await stageStorageService.updateStageName(stageId, editingStageName);
      setEditingStageId(null);
      setEditingStageName('');
      await loadStages();
    } catch (error) {
      console.error('Failed to update stage name:', error);
    }
  };

  const handleCancelEditStage = () => {
    setEditingStageId(null);
    setEditingStageName('');
  };

  const handleDeleteStage = async (stageId) => {
    if (!confirm('Delete this stage?\n\nThis action cannot be undone.')) return;
    
    try {
      await stageStorageService.deleteStage(stageId);
      await loadStages();
    } catch (error) {
      console.error('Failed to delete stage:', error);
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

  // Emote management functions
  const loadEmotes = async () => {
    try {
      const emotesList = await emoteStorageService.getEmotesList();
      setEmotes(emotesList);
    } catch (error) {
      console.error('Failed to load emotes:', error);
    }
  };

  const handleEmoteAudioFileChange = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedEmoteAudioFile(file);
    }
  };

  const handleEmoteMotionFileChange = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedEmoteMotionFile(file);
    }
  };

  const handleEmoteCameraFileChange = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedEmoteCameraFile(file);
    }
  };

  const handleEmoteUpload = async () => {
    try {
      if (!emoteName.trim()) {
        setEmoteUploadState({ uploading: false, progress: '', error: 'Please enter an emote name' });
        return;
      }

      const audioFile = selectedEmoteAudioFile;
      const motionFile = selectedEmoteMotionFile;
      const cameraFile = selectedEmoteCameraFile; // Optional

      if (!audioFile || !motionFile) {
        setEmoteUploadState({ uploading: false, progress: '', error: 'Please select both audio and motion files' });
        return;
      }

      setEmoteUploadState({ uploading: true, progress: 'Converting motion...', error: null });

      const bvmdData = await vmdConverterService.convertVMDToBVMD(motionFile);

      // Convert camera VMD if provided (optional)
      let cameraBvmdData = null;
      if (cameraFile) {
        setEmoteUploadState({ uploading: true, progress: 'Converting camera animation...', error: null });
        cameraBvmdData = await vmdConverterService.convertVMDToBVMD(cameraFile);
      }

      setEmoteUploadState({ uploading: true, progress: 'Uploading emote...', error: null });

      await emoteStorageService.saveEmote(
        null,
        emoteName,
        audioFile,
        bvmdData,
        cameraBvmdData, // Can be null
        {
          originalAudioFileName: audioFile.name,
          originalMotionFileName: motionFile.name,
          originalCameraFileName: cameraFile ? cameraFile.name : null,
          audioMimeType: audioFile.type
        }
      );

      setEmoteUploadState({ uploading: false, progress: '', error: null });
      setEmoteName('');
      setSelectedEmoteAudioFile(null);
      setSelectedEmoteMotionFile(null);
      setSelectedEmoteCameraFile(null);
      if (emoteAudioFileInputRef.current) emoteAudioFileInputRef.current.value = '';
      if (emoteMotionFileInputRef.current) emoteMotionFileInputRef.current.value = '';
      if (emoteCameraFileInputRef.current) emoteCameraFileInputRef.current.value = '';
      await loadEmotes();
    } catch (error) {
      console.error('Failed to upload emote:', error);
      setEmoteUploadState({ uploading: false, progress: '', error: error.message || 'Upload failed' });
    }
  };

  const handleEmoteZipUpload = async (zipFile) => {
    try {
      setEmoteUploadState({ uploading: true, progress: 'Extracting ZIP...', error: null });

      const zip = new JSZip();
      const zipContent = await zip.loadAsync(zipFile);

      const emoteFolders = [];
      Object.keys(zipContent.files).forEach(path => {
        const parts = path.split('/');
        if (parts.length >= 2 && !zipContent.files[path].dir) {
          const folderName = parts[0];
          if (!emoteFolders.find(f => f.name === folderName)) {
            emoteFolders.push({ name: folderName, files: [] });
          }
          const folder = emoteFolders.find(f => f.name === folderName);
          folder.files.push(path);
        }
      });

      if (emoteFolders.length === 0) {
        throw new Error('No emote folders found in ZIP. Expected structure: EmoteName/audio.mp3 + EmoteName/motion.vmd');
      }

      let successCount = 0;
      let failedCount = 0;

      for (let i = 0; i < emoteFolders.length; i++) {
        const folder = emoteFolders[i];
        const emoteName = folder.name;

        try {
          setEmoteUploadState({
            uploading: true,
            progress: `Processing ${i + 1}/${emoteFolders.length}: ${emoteName}...`,
            error: null
          });

          // Find VMD files - separate camera from model animation
          const vmdFiles = folder.files.filter(f => f.toLowerCase().endsWith('.vmd'));
          
          // Detect camera VMD (case-insensitive: 'camera' or 'カメラ')
          const cameraVmdFile = vmdFiles.find(f => {
            const fileName = f.toLowerCase();
            return fileName.includes('camera') || fileName.includes('カメラ'.toLowerCase());
          });
          
          // Model animation VMD (not camera)
          const modelVmdFile = vmdFiles.find(f => {
            const fileName = f.toLowerCase();
            return !(fileName.includes('camera') || fileName.includes('カメラ'.toLowerCase()));
          });
          
          const audioFile = folder.files.find(f => {
            const lower = f.toLowerCase();
            return lower.endsWith('.mp3') || lower.endsWith('.wav') || 
                   lower.endsWith('.ogg') || lower.endsWith('.m4a') || 
                   lower.endsWith('.aac') || lower.endsWith('.flac');
          });

          if (!modelVmdFile || !audioFile) {
            console.warn(`Skipping ${emoteName}: missing model VMD or audio file`);
            failedCount++;
            continue;
          }

          const vmdBlob = await zipContent.files[modelVmdFile].async('blob');
          const audioBlob = await zipContent.files[audioFile].async('blob');
          
          // Load camera VMD if found (optional)
          let cameraBlob = null;
          let cameraFileName = null;
          if (cameraVmdFile) {
            cameraBlob = await zipContent.files[cameraVmdFile].async('blob');
            cameraFileName = cameraVmdFile.split('/').pop();
          }

          const vmdFileName = modelVmdFile.split('/').pop();
          const audioFileName = audioFile.split('/').pop();

          const vmdFileObj = new File([vmdBlob], vmdFileName, { type: 'application/octet-stream' });
          const audioFileObj = new File([audioBlob], audioFileName, { type: audioBlob.type || 'audio/mpeg' });
          const cameraFileObj = cameraBlob ? new File([cameraBlob], cameraFileName, { type: 'application/octet-stream' }) : null;

          setEmoteUploadState({
            uploading: true,
            progress: `Converting ${i + 1}/${emoteFolders.length}: ${emoteName}...`,
            error: null
          });

          const bvmdData = await vmdConverterService.convertVMDToBVMD(vmdFileObj);
          
          // Convert camera VMD if present
          let cameraBvmdData = null;
          if (cameraFileObj) {
            cameraBvmdData = await vmdConverterService.convertVMDToBVMD(cameraFileObj);
          }

          setEmoteUploadState({
            uploading: true,
            progress: `Saving ${i + 1}/${emoteFolders.length}: ${emoteName}...`,
            error: null
          });

          await emoteStorageService.saveEmote(
            null,
            emoteName,
            audioFileObj,
            bvmdData,
            cameraBvmdData, // Can be null
            {
              originalAudioFileName: audioFileName,
              originalMotionFileName: vmdFileName,
              originalCameraFileName: cameraFileName,
              audioMimeType: audioFileObj.type
            }
          );

          successCount++;
        } catch (error) {
          console.error(`Failed to process emote ${emoteName}:`, error);
          failedCount++;
        }
      }

      await loadEmotes();

      if (failedCount > 0) {
        setEmoteUploadState({
          uploading: false,
          progress: '',
          error: `Imported ${successCount} emote(s), ${failedCount} failed`
        });
      } else {
        setEmoteUploadState({
          uploading: false,
          progress: `Successfully imported ${successCount} emote(s)`,
          error: null
        });
        setTimeout(() => {
          setEmoteUploadState({ uploading: false, progress: '', error: null });
        }, 3000);
      }

      if (emoteZipFileInputRef.current) {
        emoteZipFileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Failed to process ZIP:', error);
      setEmoteUploadState({ uploading: false, progress: '', error: error.message || 'ZIP import failed' });
    }
  };

  const handleEmoteZipFileChange = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      handleEmoteZipUpload(file);
    }
  };

  const handleDeleteEmote = async (emoteId) => {
    if (window.confirm('Are you sure you want to delete this emote?')) {
      try {
        await emoteStorageService.deleteEmote(emoteId);
        await loadEmotes();
      } catch (error) {
        console.error('Failed to delete emote:', error);
        setErrorDialogMessage(error.message || 'Failed to delete emote');
        setShowErrorDialog(true);
      }
    }
  };

  const handleEditEmote = (emoteId, currentName) => {
    setEditingEmoteId(emoteId);
    setEditingEmoteName(currentName);
  };

  const handleSaveEmoteName = async (emoteId) => {
    try {
      await emoteStorageService.updateEmoteName(emoteId, editingEmoteName);
      setEditingEmoteId(null);
      setEditingEmoteName('');
      await loadEmotes();
    } catch (error) {
      console.error('Failed to update emote name:', error);
      setErrorDialogMessage(error.message || 'Failed to update emote name');
      setShowErrorDialog(true);
    }
  };

  const handleCancelEditEmote = () => {
    setEditingEmoteId(null);
    setEditingEmoteName('');
  };

  const handleToggleEmoteVisibility = async (emoteId, isVisible) => {
    try {
      await emoteStorageService.toggleEmoteVisibility(emoteId, isVisible);
      
      setEmotes(prev => prev.map(e => 
        e.id === emoteId ? { ...e, isVisible } : e
      ));
      
      console.log(`Emote ${emoteId} visibility set to: ${isVisible}`);
    } catch (error) {
      console.error('Failed to toggle emote visibility:', error);
      setErrorDialogMessage(error.message || 'Failed to toggle emote visibility');
      setShowErrorDialog(true);
    }
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

  const handleCustomQualityChange = async (key, value) => {
    updateUIConfig(`customQuality.${key}`, value);
    
    const scene = sceneRef?.current;
    if (!scene || !scene.metadata?.renderPipeline) return;
    
    const pipeline = scene.metadata.renderPipeline;
    
    switch (key) {
      case 'samples':
        pipeline.samples = value;
        break;
      case 'fxaaEnabled':
        pipeline.fxaaEnabled = value;
        break;
      case 'bloomEnabled':
        pipeline.bloomEnabled = value;
        break;
      case 'bloomThreshold':
        pipeline.bloomThreshold = value;
        break;
      case 'bloomWeight':
        pipeline.bloomWeight = value;
        break;
      case 'bloomScale':
        pipeline.bloomScale = value;
        break;
      case 'bloomKernel':
        pipeline.bloomKernel = value;
        break;
      case 'contrast':
        if (pipeline.imageProcessing) {
          pipeline.imageProcessing.contrast = value;
        }
        break;
      case 'exposure':
        if (pipeline.imageProcessing) {
          pipeline.imageProcessing.exposure = value;
        }
        break;
      case 'saturation':
        if (pipeline.imageProcessing?.colorCurves) {
          pipeline.imageProcessing.colorCurves.globalSaturation = value;
        } else if (pipeline.imageProcessing) {
          const { ColorCurves } = await import('@babylonjs/core');
          const colorCurves = new ColorCurves();
          colorCurves.globalSaturation = value;
          pipeline.imageProcessing.colorCurvesEnabled = true;
          pipeline.imageProcessing.colorCurves = colorCurves;
        }
        break;
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
    <div className="flex flex-col h-full">
      {/* Sub-tabs */}
      <div className="flex border-b border-white/20 relative">
        <div 
          className="absolute bottom-0 h-0.5 bg-white transition-all duration-300 ease-out"
          style={{
            left: `${subTabIndicatorStyle.left}px`,
            width: `${subTabIndicatorStyle.width}px`,
          }}
        />
        
        <button
          ref={(el) => (subTabsRef.display = el)}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-all duration-300 ease-out ${
            activeSubTab === 'display' 
              ? 'text-white' 
              : 'text-white/60 hover:text-white/90'
          }`}
          onClick={() => setActiveSubTab('display')}
        >
          Display
        </button>
        <button
          ref={(el) => (subTabsRef.performance = el)}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-all duration-300 ease-out ${
            activeSubTab === 'performance' 
              ? 'text-white' 
              : 'text-white/60 hover:text-white/90'
          }`}
          onClick={() => setActiveSubTab('performance')}
        >
          Performance
        </button>
        <button
          ref={(el) => (subTabsRef.models = el)}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-all duration-300 ease-out ${
            activeSubTab === 'models' 
              ? 'text-white' 
              : 'text-white/60 hover:text-white/90'
          }`}
          onClick={() => setActiveSubTab('models')}
        >
          Models
        </button>
        <button
          ref={(el) => (subTabsRef.animations = el)}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-all duration-300 ease-out ${
            activeSubTab === 'animations' 
              ? 'text-white' 
              : 'text-white/60 hover:text-white/90'
          }`}
          onClick={() => setActiveSubTab('animations')}
        >
          Animations
        </button>
        <button
          ref={(el) => (subTabsRef.emotes = el)}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-all duration-300 ease-out ${
            activeSubTab === 'emotes' 
              ? 'text-white' 
              : 'text-white/60 hover:text-white/90'
          }`}
          onClick={() => setActiveSubTab('emotes')}
        >
          Emotes
        </button>
      </div>

      {/* Sub-tab content with sliding animation */}
      <div className="flex-1 overflow-hidden">
        <div 
          className="flex flex-nowrap transition-transform duration-300 ease-out"
          style={{
            transform: `translateX(-${['display', 'performance', 'models', 'animations', 'emotes'].indexOf(activeSubTab) * 100}%)`,
            height: '100%'
          }}
        >
          {/* Display Tab */}
          <div className="flex-shrink-0 w-full min-w-full h-full overflow-y-auto px-6 py-2 md:py-4 space-y-4" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255, 255, 255, 0.3) rgba(255, 255, 255, 0.1)' }}>
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
            className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} w-full px-2 md:px-4 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2`}
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
        </>
      )}
      </div>

      {/* Performance Tab */}
      <div className="flex-shrink-0 w-full min-w-full h-full overflow-y-auto px-6 py-2 md:py-4 space-y-4" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255, 255, 255, 0.3) rgba(255, 255, 255, 0.1)' }}>
          {/* Physics Simulation */}
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
              <option value={RenderQualityOptions.CUSTOM} className="bg-gray-900">Custom (Advanced)</option>
            </select>
            <p className="text-xs text-white/50">
              {uiConfig.renderQuality === RenderQualityOptions.LOW && 'Minimal effects, sharp image for low-end devices'}
              {(uiConfig.renderQuality === RenderQualityOptions.MEDIUM || !uiConfig.renderQuality) && 'Subtle bloom highlights'}
              {uiConfig.renderQuality === RenderQualityOptions.HIGH && 'Smooth edges and soft glow'}
              {uiConfig.renderQuality === RenderQualityOptions.ULTRA && 'Maximum clarity with 8x anti-aliasing'}
              {uiConfig.renderQuality === RenderQualityOptions.CUSTOM && 'Fine-tune all rendering parameters'}
            </p>
            
            {/* Custom Quality Settings */}
            {uiConfig.renderQuality === RenderQualityOptions.CUSTOM && (
              <div className="mt-3 pt-3 border-t border-white/10 space-y-4">
                <p className="text-xs font-medium text-white/70">Custom Quality Settings</p>
                
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-white/70">Anti-Aliasing (MSAA)</label>
                    <span className="text-xs text-white/50">{uiConfig.customQuality?.samples || DefaultCustomQualitySettings.samples}x</span>
                  </div>
                  <select
                    value={uiConfig.customQuality?.samples || DefaultCustomQualitySettings.samples}
                    onChange={(e) => handleCustomQualityChange('samples', parseInt(e.target.value))}
                    className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full text-sm`}
                  >
                    <option value={1} className="bg-gray-900">1x (Off)</option>
                    <option value={2} className="bg-gray-900">2x</option>
                    <option value={4} className="bg-gray-900">4x</option>
                    <option value={8} className="bg-gray-900">8x (High GPU)</option>
                  </select>
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs text-white/70">FXAA (Fast Anti-Aliasing)</label>
                    <p className="text-[10px] text-white/40">Smooth edges without blur</p>
                  </div>
                  <Toggle
                    checked={uiConfig.customQuality?.fxaaEnabled ?? DefaultCustomQualitySettings.fxaaEnabled}
                    onChange={(checked) => handleCustomQualityChange('fxaaEnabled', checked)}
                    size="sm"
                    isLightBackground={isLightBackground}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs text-white/70">Bloom Effect</label>
                    <p className="text-[10px] text-white/40">Glow on bright areas</p>
                  </div>
                  <Toggle
                    checked={uiConfig.customQuality?.bloomEnabled ?? DefaultCustomQualitySettings.bloomEnabled}
                    onChange={(checked) => handleCustomQualityChange('bloomEnabled', checked)}
                    size="sm"
                    isLightBackground={isLightBackground}
                  />
                </div>
                
                {(uiConfig.customQuality?.bloomEnabled ?? DefaultCustomQualitySettings.bloomEnabled) && (
                  <div className="pl-3 border-l border-white/10 space-y-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-white/60">Bloom Threshold</label>
                        <span className="text-xs text-white/40">{(uiConfig.customQuality?.bloomThreshold || DefaultCustomQualitySettings.bloomThreshold).toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="1.0"
                        step="0.05"
                        value={uiConfig.customQuality?.bloomThreshold || DefaultCustomQualitySettings.bloomThreshold}
                        onChange={(e) => handleCustomQualityChange('bloomThreshold', parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer"
                      />
                      <p className="text-[10px] text-white/30">Higher = only brightest areas glow</p>
                    </div>
                    
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-white/60">Bloom Intensity</label>
                        <span className="text-xs text-white/40">{(uiConfig.customQuality?.bloomWeight || DefaultCustomQualitySettings.bloomWeight).toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.05"
                        max="0.5"
                        step="0.05"
                        value={uiConfig.customQuality?.bloomWeight || DefaultCustomQualitySettings.bloomWeight}
                        onChange={(e) => handleCustomQualityChange('bloomWeight', parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                    
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-white/60">Bloom Scale</label>
                        <span className="text-xs text-white/40">{(uiConfig.customQuality?.bloomScale || DefaultCustomQualitySettings.bloomScale).toFixed(1)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.1"
                        max="1.0"
                        step="0.1"
                        value={uiConfig.customQuality?.bloomScale || DefaultCustomQualitySettings.bloomScale}
                        onChange={(e) => handleCustomQualityChange('bloomScale', parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                    
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-white/60">Bloom Kernel Size</label>
                        <span className="text-xs text-white/40">{uiConfig.customQuality?.bloomKernel || DefaultCustomQualitySettings.bloomKernel}</span>
                      </div>
                      <select
                        value={uiConfig.customQuality?.bloomKernel || DefaultCustomQualitySettings.bloomKernel}
                        onChange={(e) => handleCustomQualityChange('bloomKernel', parseInt(e.target.value))}
                        className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full text-xs`}
                      >
                        <option value={16} className="bg-gray-900">16 (Tight)</option>
                        <option value={32} className="bg-gray-900">32 (Normal)</option>
                        <option value={48} className="bg-gray-900">48 (Wide)</option>
                        <option value={64} className="bg-gray-900">64 (Very Wide)</option>
                      </select>
                    </div>
                  </div>
                )}
                
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-white/70">Contrast</label>
                    <span className="text-xs text-white/50">{(uiConfig.customQuality?.contrast || DefaultCustomQualitySettings.contrast).toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.05"
                    value={uiConfig.customQuality?.contrast || DefaultCustomQualitySettings.contrast}
                    onChange={(e) => handleCustomQualityChange('contrast', parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
                
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-white/70">Exposure</label>
                    <span className="text-xs text-white/50">{(uiConfig.customQuality?.exposure || DefaultCustomQualitySettings.exposure).toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.05"
                    value={uiConfig.customQuality?.exposure || DefaultCustomQualitySettings.exposure}
                    onChange={(e) => handleCustomQualityChange('exposure', parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
                
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-white/70">Saturation</label>
                    <span className="text-xs text-white/50">{uiConfig.customQuality?.saturation ?? DefaultCustomQualitySettings.saturation}</span>
                  </div>
                  <input
                    type="range"
                    min="-50"
                    max="50"
                    step="5"
                    value={uiConfig.customQuality?.saturation ?? DefaultCustomQualitySettings.saturation}
                    onChange={(e) => handleCustomQualityChange('saturation', parseInt(e.target.value))}
                    className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer"
                  />
                  <p className="text-[10px] text-white/30">0 = neutral, positive = more vibrant</p>
                </div>
                
                <button
                  onClick={() => {
                    updateUIConfig('customQuality', { ...DefaultCustomQualitySettings });
                    const scene = sceneRef?.current;
                    if (scene?.metadata?.renderPipeline) {
                      const pipeline = scene.metadata.renderPipeline;
                      const d = DefaultCustomQualitySettings;
                      pipeline.samples = d.samples;
                      pipeline.fxaaEnabled = d.fxaaEnabled;
                      pipeline.bloomEnabled = d.bloomEnabled;
                      pipeline.bloomThreshold = d.bloomThreshold;
                      pipeline.bloomWeight = d.bloomWeight;
                      pipeline.bloomScale = d.bloomScale;
                      pipeline.bloomKernel = d.bloomKernel;
                      if (pipeline.imageProcessing) {
                        pipeline.imageProcessing.contrast = d.contrast;
                        pipeline.imageProcessing.exposure = d.exposure;
                        if (pipeline.imageProcessing.colorCurves) {
                          pipeline.imageProcessing.colorCurves.globalSaturation = d.saturation;
                        }
                      }
                    }
                  }}
                  className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} w-full px-3 py-1.5 rounded text-xs font-medium`}
                >
                  Reset to Defaults
                </button>
              </div>
            )}
          </div>
        </div>

      {/* Models Tab */}
      <div className="flex-shrink-0 w-full min-w-full h-full overflow-y-auto px-6 py-2 md:py-4 space-y-4" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255, 255, 255, 0.3) rgba(255, 255, 255, 0.1)' }}>
          {/* Model Management Section */}
          <div className="space-y-4">
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
                className="w-full p-2 md:p-4 border-2 border-dashed border-white/20 hover:border-white/40 rounded-lg text-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                  <div className="px-3 pb-3 pt-0 space-y-4 border-t border-white/10 max-h-[400px] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255, 255, 255, 0.3) rgba(255, 255, 255, 0.1)' }}>
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
                      <p className="text-xs text-white/50 text-center py-2 md:py-4">
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
                    <div className="px-3 pb-3 pt-0 space-y-4 border-t border-white/10 max-h-[400px] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255, 255, 255, 0.3) rgba(255, 255, 255, 0.1)' }}>
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

          {/* Stage Management Section */}
          <div className="space-y-4 mt-8 pt-8 border-t border-white/10">
            <h4 className="text-sm font-semibold text-white mb-3">Custom Stages</h4>
            
            {/* Stage Upload */}
            <div className="space-y-3">
              <input
                ref={stageFileInputRef}
                type="file"
                accept=".zip"
                onChange={handleStageFileChange}
                className="hidden"
              />
              
              <button
                onClick={() => stageFileInputRef.current?.click()}
                disabled={stageUploadState.uploading}
                className="w-full p-2 md:p-4 border-2 border-dashed border-white/20 hover:border-white/40 rounded-lg text-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Icon name="upload" size={32} className="mx-auto mb-2 text-white/70" />
                <p className="text-sm text-white/90 mb-1">
                  {stageUploadState.uploading ? stageUploadState.progress : 'Upload PMX Stage (ZIP)'}
                </p>
                <p className="text-xs text-white/50">Click to browse</p>
              </button>

              {stageUploadState.error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-400/20">
                  <p className="text-xs text-red-200">{stageUploadState.error}</p>
                </div>
              )}
            </div>

            {/* Stage List */}
            <div className="max-h-[400px] overflow-y-auto space-y-2 hover-scrollbar">
              {/* No Stages */}
              {stages.length === 0 ? (
                <div className="rounded-lg bg-white/5 border border-white/10">
                  <div className="p-3 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium truncate">
                        No Stage
                      </p>
                      <p className="text-xs text-white/50">Default stage will be used</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Toggle
                        checked={true}
                        onChange={() => {}}
                        disabled={true}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Custom Stages */}
                  {stages.map((stage) => (
                    <div
                      key={stage.id}
                      className="relative rounded-lg bg-white/5 border border-white/10"
                    >
                      {/* Stage info and name editing */}
                      <div className="flex items-center justify-between gap-3 p-3">
                        <div className="flex-1 min-w-0">
                          {editingStageId === stage.id ? (
                            <input
                              type="text"
                              value={editingStageName}
                              onChange={(e) => setEditingStageName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveStageName(stage.id);
                                if (e.key === 'Escape') handleCancelEditStage();
                              }}
                              className="text-sm text-white font-medium bg-transparent border-none outline-none w-full p-0"
                              autoFocus
                            />
                          ) : (
                            <p className="text-sm text-white font-medium truncate">
                              {stage.name}
                            </p>
                          )}
                          <p className="text-xs text-white/50">
                            {(stage.metadata?.fileSize / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                        
                        {/* Right side controls */}
                        <div className="flex items-center gap-1">
                          {editingStageId === stage.id ? (
                            <>
                              <button
                                onClick={() => handleSaveStageName(stage.id)}
                                className="p-1 rounded hover:bg-green-500/20 text-green-300 transition-colors"
                                title="Save"
                              >
                                <Icon name="check" size={16} />
                              </button>
                              <button
                                onClick={handleCancelEditStage}
                                className="p-1 rounded hover:bg-red-500/20 text-red-300 transition-colors"
                                title="Cancel"
                              >
                                <Icon name="x" size={16} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => handleEditStage(stage.id, stage.name)}
                                className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white/80 transition-colors"
                                title="Edit name"
                              >
                                <Icon name="edit-2" size={16} />
                              </button>
                              <button
                                onClick={() => handleDeleteStage(stage.id)}
                                className="p-1 rounded hover:bg-red-500/20 text-white/50 hover:text-red-300 transition-colors"
                                title="Delete"
                              >
                                <Icon name="trash-2" size={16} />
                              </button>
                              <Toggle
                                checked={stage.isDefault}
                                onChange={(checked) => {
                                  if (checked) {
                                    handleSetDefaultStage(stage.id);
                                  }
                                }}
                              />
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

      {/* Animations Tab */}
      <div className="flex-shrink-0 w-full min-w-full h-full overflow-y-auto px-6 py-2 md:py-4 space-y-4" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255, 255, 255, 0.3) rgba(255, 255, 255, 0.1)' }}>
          {/* Motion Management */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-white">Custom Animations</h4>
          </div>
            
          {/* Motion Upload */}
          <div className="space-y-2">
            <input
              ref={motionFileInputRef}
              type="file"
              accept="*/*,.vmd"
              multiple
              onChange={handleMotionFileChange}
              className="hidden"
            />
            
            <button
              onClick={() => motionFileInputRef.current?.click()}
              disabled={motionUploadState.uploading}
              className="w-full p-2 md:p-4 border-2 border-dashed border-white/20 hover:border-white/40 rounded-lg text-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
            <div className="space-y-2">
              <div className="max-h-[400px] overflow-y-auto space-y-2 hover-scrollbar" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255, 255, 255, 0.3) rgba(255, 255, 255, 0.1)' }}>
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
            </div>
            )}

          {/* Animation Management */}
          <h4 className="text-sm font-semibold text-white pt-6 border-t border-white/10">Animation Management</h4>

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

      {/* Emotes Tab */}
      <div className="flex-shrink-0 w-full min-w-full h-full overflow-y-auto px-6 py-2 md:py-4 space-y-4" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255, 255, 255, 0.3) rgba(255, 255, 255, 0.1)' }}>
          {/* Emote Upload */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-white">Emote Management</h4>
          </div>

          <div className="space-y-2">
            {/* Emote Name Input */}
            <div className="space-y-1">
              <label className="text-xs text-white/70">Emote Name</label>
              <input
                type="text"
                value={emoteName}
                onChange={(e) => setEmoteName(e.target.value)}
                placeholder="Enter emote name"
                disabled={emoteUploadState.uploading}
                className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full text-sm`}
              />
            </div>

            {/* Hidden File Inputs */}
            <input
              ref={emoteAudioFileInputRef}
              type="file"
              accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/x-m4a,.mp3,.wav,.ogg,.m4a"
              onChange={handleEmoteAudioFileChange}
              className="hidden"
            />
            <input
              ref={emoteMotionFileInputRef}
              type="file"
              accept="*/*,.vmd"
              onChange={handleEmoteMotionFileChange}
              className="hidden"
            />
            <input
              ref={emoteCameraFileInputRef}
              type="file"
              accept="*/*,.vmd"
              onChange={handleEmoteCameraFileChange}
              className="hidden"
            />
            <input
              ref={emoteZipFileInputRef}
              type="file"
              accept=".zip,application/zip"
              onChange={handleEmoteZipFileChange}
              className="hidden"
            />
            
            {/* Bulk Import Label */}
            <div className="space-y-1">
              <label className="text-xs text-white/70">Bulk Import</label>
              <button
                onClick={() => emoteZipFileInputRef.current?.click()}
                disabled={emoteUploadState.uploading}
                className="w-full p-3 border-2 border-dashed border-white/20 hover:border-white/40 rounded-lg text-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Icon name="upload" size={24} className="mx-auto mb-1 text-white/70" />
                <p className="text-sm text-white/90">
                  {emoteUploadState.uploading && emoteUploadState.progress ? emoteUploadState.progress : 'Import ZIP Package'}
                </p>
                <p className="text-xs text-white/50">Multiple emotes from ZIP</p>
              </button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-2 bg-transparent text-white/40">OR</span>
              </div>
            </div>

            {/* Audio File Upload Button */}
            <button
              onClick={() => emoteAudioFileInputRef.current?.click()}
              disabled={emoteUploadState.uploading}
              className="w-full p-3 border-2 border-dashed border-white/20 hover:border-white/40 rounded-lg text-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Icon name="upload" size={24} className="mx-auto mb-1 text-white/70" />
              <p className="text-sm text-white/90">
                {selectedEmoteAudioFile?.name || 'Upload Audio'}
              </p>
              <p className="text-xs text-white/50">MP3, WAV, OGG, M4A</p>
            </button>

            {/* Motion File Upload Button */}
            <button
              onClick={() => emoteMotionFileInputRef.current?.click()}
              disabled={emoteUploadState.uploading}
              className="w-full p-3 border-2 border-dashed border-white/20 hover:border-white/40 rounded-lg text-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Icon name="upload" size={24} className="mx-auto mb-1 text-white/70" />
              <p className="text-sm text-white/90">
                {selectedEmoteMotionFile?.name || 'Upload Motion'}
              </p>
              <p className="text-xs text-white/50">VMD file</p>
            </button>

            {/* Camera File Upload Button (Optional) */}
            <button
              onClick={() => emoteCameraFileInputRef.current?.click()}
              disabled={emoteUploadState.uploading}
              className="w-full p-3 border-2 border-dashed border-white/20 hover:border-white/40 rounded-lg text-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Icon name="camera" size={24} className="mx-auto mb-1 text-white/70" />
              <p className="text-sm text-white/90">
                {selectedEmoteCameraFile?.name || 'Upload Camera (Optional)'}
              </p>
              <p className="text-xs text-white/50">VMD camera animation</p>
            </button>

            {/* Upload Button */}
            <button
              onClick={handleEmoteUpload}
              disabled={emoteUploadState.uploading || !emoteName.trim()}
              className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} w-full px-2 md:px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {emoteUploadState.uploading ? emoteUploadState.progress : 'Upload Emote'}
            </button>

            {emoteUploadState.progress && !emoteUploadState.uploading && !emoteUploadState.error && (
              <div className="p-3 rounded-lg bg-green-500/10 border border-green-400/20">
                <p className="text-xs text-green-200">{emoteUploadState.progress}</p>
              </div>
            )}

            {emoteUploadState.error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-400/20">
                <p className="text-xs text-red-200">{emoteUploadState.error}</p>
              </div>
            )}
          </div>

          {/* Emote List */}
          {emotes.length > 0 && (
            <div className="space-y-2">
              <div className="max-h-[300px] overflow-y-auto space-y-2 hover-scrollbar" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255, 255, 255, 0.3) rgba(255, 255, 255, 0.1)' }}>
                {emotes.map((emote) => {
                  const isEditing = editingEmoteId === emote.id;
                  return (
                    <div key={emote.id} className="relative rounded-lg bg-white/5 border border-white/10">
                      <div className="flex items-start justify-between gap-3 p-3">
                        <div className="flex-1 min-w-0">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editingEmoteName}
                              onChange={(e) => setEditingEmoteName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEmoteName(emote.id);
                                if (e.key === 'Escape') handleCancelEditEmote();
                              }}
                              className="text-sm text-white font-medium bg-transparent border-none outline-none w-full p-0"
                              autoFocus
                            />
                          ) : (
                            <p className="text-sm text-white font-medium truncate">
                              {emote.name}
                            </p>
                          )}
                          {isEditing && (
                            <>
                              <p className="text-xs text-white/50 truncate">
                                {emote.metadata?.originalAudioFileName || 'Unknown'}
                              </p>
                              <p className="text-xs text-white/50 truncate">
                                {emote.metadata?.originalMotionFileName || 'Unknown'}
                              </p>
                            </>
                          )}
                          </div>
                          <div className="flex items-center gap-1">
                            {isEditing ? (
                              <>
                                <button
                                  onClick={() => handleSaveEmoteName(emote.id)}
                                  className="p-1 rounded hover:bg-green-500/20 text-white/50 hover:text-green-300 transition-colors"
                                  title="Save"
                                >
                                  <Icon name="check" size={16} />
                                </button>
                                <button
                                  onClick={handleCancelEditEmote}
                                  className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white/80 transition-colors"
                                  title="Cancel"
                                >
                                  <Icon name="x" size={16} />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleEditEmote(emote.id, emote.name)}
                                  className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white/80 transition-colors"
                                  title="Edit name"
                                >
                                  <Icon name="edit-2" size={16} />
                                </button>
                                <button
                                  onClick={() => handleDeleteEmote(emote.id)}
                                  className="p-1 rounded hover:bg-red-500/20 text-white/50 hover:text-red-300 transition-colors"
                                  title="Delete"
                                >
                                  <Icon name="trash-2" size={16} />
                                </button>
                                <Toggle
                                  checked={emote.isVisible !== false}
                                  onChange={(checked) => handleToggleEmoteVisibility(emote.id, checked)}
                                  size="sm"
                                  isLightBackground={isLightBackground}
                                  title="Show in emote panel"
                                />
                              </>
                            )}
                          </div>
                        </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
      </div>
      </div>
      </div>

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
              <div className="max-h-[200px] overflow-y-auto space-y-1 hover-scrollbar" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255, 255, 255, 0.3) rgba(255, 255, 255, 0.1)' }}>
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
              <div className="max-h-[200px] overflow-y-auto space-y-1 hover-scrollbar" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255, 255, 255, 0.3) rgba(255, 255, 255, 0.1)' }}>
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
