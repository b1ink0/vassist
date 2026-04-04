/**
 * AnimationContext
 * Centralized animation configuration state management
 * Manages default animations, custom animations, and disabled states
 * Auto-saves configuration changes with debouncing
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getDefaultAnimationsByCategory } from '../config/animationConfig';
import { motionStorageService } from '../services/MotionStorageService';
import { StorageServiceProxy } from '../services/proxies';
import Logger from '../services/LoggerService';

const AnimationContext = createContext(null);

export const useAnimation = () => {
  const context = useContext(AnimationContext);
  if (!context) {
    throw new Error('useAnimation must be used within AnimationProvider');
  }
  return context;
};

export const AnimationProvider = ({ children }) => {
  const initialLoadRef = useRef(true);
  const [isLoading, setIsLoading] = useState(true);
  
  const saveTimeoutRef = useRef(null);

  const [disabledDefaultAnimations, setDisabledDefaultAnimations] = useState({});
  const [customAnimations, setCustomAnimations] = useState([]);
  const [configSaved, setConfigSaved] = useState(false);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await StorageServiceProxy.configLoad('animationConfig', {
          disabledDefaultAnimations: {}
        });
        setDisabledDefaultAnimations(config.disabledDefaultAnimations || {});
        Logger.log('AnimationContext', 'Disabled animations config loaded:', config.disabledDefaultAnimations);

        const customs = await motionStorageService.getMotionsList();
        setCustomAnimations(customs);
        Logger.log('AnimationContext', `Loaded ${customs.length} custom animations`);

        setIsLoading(false);
        initialLoadRef.current = false;
      } catch (error) {
        Logger.error('AnimationContext', 'Failed to load animation config:', error);
        setIsLoading(false);
      }
    };

    loadConfig();
  }, []);

  useEffect(() => {
    if (initialLoadRef.current) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        setConfigSaved(false);
        await StorageServiceProxy.configSave('animationConfig', {
          disabledDefaultAnimations
        });
        setConfigSaved(true);
        Logger.log('AnimationContext', 'Animation config auto-saved');
        
        setTimeout(() => setConfigSaved(false), 2000);
      } catch (error) {
        Logger.error('AnimationContext', 'Failed to save animation config:', error);
      }
    }, 500); 

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [disabledDefaultAnimations]);

  /**
   * Get all enabled animations for a category (default + custom)
   * @param {string} category - Animation category
   * @returns {Array} Array of enabled animation configs
   */
  const getEnabledAnimations = useCallback((category) => {
    const defaultAnims = getDefaultAnimationsByCategory(category);
    const enabledDefaults = defaultAnims.filter(anim => !disabledDefaultAnimations[anim.id]);

    const enabledCustom = customAnimations
      .filter(m => 
        m.animationCategories && 
        m.animationCategories.includes(category) && 
        m.enabledByCategory && 
        m.enabledByCategory[category] === true
      )
      .map(m => ({
        id: m.id,
        name: m.name,
        filePath: null,
        isCustom: true,
        customMotionId: m.id, 
        loop: true,
        loopTransition: true,
        transitionFrames: 30,
        weight: 1.0,
        metadata: {
          ...m.metadata,
          description: `Custom - ${(m.metadata?.fileSize / 1024).toFixed(1)} KB`,
          tags: ['custom', category],
        }
      }));

    return [...enabledDefaults, ...enabledCustom];
  }, [disabledDefaultAnimations, customAnimations]);

  /**
   * Get random enabled animation from category
   * @param {string} category - Animation category
   * @returns {Object|null} Random animation config or null
   */
  const getRandomAnimation = useCallback((category) => {
    const animations = getEnabledAnimations(category);
    if (animations.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * animations.length);
    return animations[randomIndex];
  }, [getEnabledAnimations]);

  /**
   * Toggle default animation enabled state
   * @param {string} animationId - Animation ID
   * @param {boolean} isEnabled - New enabled state
   */
  const toggleDefaultAnimation = useCallback((animationId, isEnabled) => {
    setDisabledDefaultAnimations(prev => {
      const updated = { ...prev };
      if (isEnabled) {
        delete updated[animationId]; 
      } else {
        updated[animationId] = true; 
      }
      return updated;
    });
  }, []);

  /**
   * Toggle custom animation enabled state for a specific category
   * @param {string} motionId - Motion ID
   * @param {string} category - Category to toggle
   * @param {boolean} isEnabled - New enabled state for this category
   */
  const toggleCustomAnimation = useCallback(async (motionId, category, isEnabled) => {
    try {
      const motion = customAnimations.find(m => m.id === motionId);
      if (!motion) {
        throw new Error(`Motion ${motionId} not found`);
      }

      const updatedEnabledByCategory = {
        ...motion.enabledByCategory,
        [category]: isEnabled
      };

      await motionStorageService.updateMotionMetadata(motionId, { 
        enabledByCategory: updatedEnabledByCategory 
      });
      
      setCustomAnimations(prev => 
        prev.map(m => m.id === motionId ? { 
          ...m, 
          enabledByCategory: updatedEnabledByCategory 
        } : m)
      );
      
      Logger.log('AnimationContext', `Custom animation ${motionId} ${isEnabled ? 'enabled' : 'disabled'} for category ${category}`);
    } catch (error) {
      Logger.error('AnimationContext', 'Failed to toggle custom animation:', error);
      throw error;
    }
  }, [customAnimations]);

  /**
   * Reload custom animations list
   */
  const reloadCustomAnimations = useCallback(async () => {
    try {
      const customs = await motionStorageService.getMotionsList();
      setCustomAnimations(customs);
      Logger.log('AnimationContext', `Reloaded ${customs.length} custom animations`);
    } catch (error) {
      Logger.error('AnimationContext', 'Failed to reload custom animations:', error);
    }
  }, []);

  /**
   * Check if at least one animation is enabled in category
   * @param {string} category - Animation category
   * @returns {boolean} True if at least one animation is enabled
   */
  const hasEnabledAnimation = useCallback((category) => {
    const enabled = getEnabledAnimations(category);
    return enabled.length > 0;
  }, [getEnabledAnimations]);

  /**
   * Get count of enabled animations per category
   * @param {string} category - Animation category
   * @returns {Object} { defaultCount, customCount, totalCount }
   */
  const getEnabledCounts = useCallback((category) => {
    const defaultAnims = getDefaultAnimationsByCategory(category);
    const defaultCount = defaultAnims.filter(anim => !disabledDefaultAnimations[anim.id]).length;
    const customCount = customAnimations.filter(m => 
      m.animationCategories && 
      m.animationCategories.includes(category) && 
      m.enabledByCategory && 
      m.enabledByCategory[category] === true
    ).length;
    
    return {
      defaultCount,
      customCount,
      totalCount: defaultCount + customCount
    };
  }, [disabledDefaultAnimations, customAnimations]);

  const value = {
    // State
    isLoading,
    configSaved,
    disabledDefaultAnimations,
    customAnimations,

    // Methods
    getEnabledAnimations,
    getRandomAnimation,
    toggleDefaultAnimation,
    toggleCustomAnimation,
    reloadCustomAnimations,
    hasEnabledAnimation,
    getEnabledCounts,
  };

  return (
    <AnimationContext.Provider value={value}>
      {children}
    </AnimationContext.Provider>
  );
};

export default AnimationContext;
