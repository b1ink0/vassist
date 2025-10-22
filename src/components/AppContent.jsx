/**
 * AppContent Component
 * Main application content shared between dev mode and extension mode
 * This component contains all the core UI logic without the background gradient
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import VirtualAssistant from './VirtualAssistant';
import ControlPanel from './ControlPanel';
import ChatController from './ChatController';
import LoadingIndicator from './LoadingIndicator';
import { StorageServiceProxy } from '../services/proxies';

function AppContent({ mode = 'development' }) {
  const [currentState, setCurrentState] = useState('IDLE');
  const [isAssistantReady, setIsAssistantReady] = useState(false);
  const [isChatUIReady, setIsChatUIReady] = useState(false);
  
  // Initialize with null to indicate loading, preventing premature rendering
  const [enableModelLoading, setEnableModelLoading] = useState(null);
  
  // Load general config from storage BEFORE rendering VirtualAssistant
  useEffect(() => {
    const loadGeneralConfig = async () => {
      try {
        const generalConfig = await StorageServiceProxy.configLoad('generalConfig', { enableModelLoading: true });
        console.log(`[AppContent ${mode}] Config loaded - model loading enabled:`, generalConfig.enableModelLoading);
        setEnableModelLoading(generalConfig.enableModelLoading);
      } catch (error) {
        console.error('[AppContent] Failed to load general config:', error);
        setEnableModelLoading(true); // Default to true on error
      }
    };
    
    loadGeneralConfig();
  }, [mode]);
  
  // Refs for accessing internal APIs
  const assistantRef = useRef(null);
  const sceneRef = useRef(null);
  const positionManagerRef = useRef(null);
  
  // Set assistant ready if model is disabled
  useEffect(() => {
    // Only run when config is loaded and model is disabled
    if (enableModelLoading === false) {
      // Simulate brief loading time for chat-only mode (for smooth UX)
      const timer = setTimeout(() => {
        setIsAssistantReady(true);
        setIsChatUIReady(true);
        console.log(`[AppContent ${mode}] Running in chat-only mode (no 3D model)`);
      }, 800); // Brief delay for loading indicator visibility
      
      return () => clearTimeout(timer);
    }
  }, [enableModelLoading, mode]);
  
  /**
   * Handle VirtualAssistant ready
   * Wrapped in useCallback to prevent infinite re-renders
   */
  const handleAssistantReady = useCallback(({ animationManager, positionManager, scene }) => {
    console.log(`[AppContent ${mode}] VirtualAssistant ready!`);
    setCurrentState(animationManager.getCurrentState());
    setIsAssistantReady(true);
    setIsChatUIReady(true);
    
    // Store refs for debug controls and chat integration
    // CRITICAL: Set positionManagerRef FIRST before any event listeners
    positionManagerRef.current = positionManager;
    sceneRef.current = scene;
    
    console.log(`[AppContent ${mode}] Position manager ref set, ready for position tracking`);
  }, [mode]);

  // Memoize VirtualAssistant to prevent unmount on parent re-renders (e.g., ConfigContext updates)
  // This is CRITICAL - without this, ConfigContext state changes cause VirtualAssistant to unmount/remount
  const virtualAssistantComponent = useMemo(() => {
    if (enableModelLoading === null) {
      return null; // Still loading config
    }
    if (!enableModelLoading) {
      return null; // Model disabled
    }
    return (
      <VirtualAssistant 
        ref={assistantRef}
        onReady={handleAssistantReady}
        mode={mode}
      />
    );
  }, [enableModelLoading, handleAssistantReady, mode]);

  return (
    <div className="relative">
      {/* Don't render anything until config is loaded to prevent mount/unmount cycles */}
      {enableModelLoading === null ? (
        <LoadingIndicator isVisible={true} />
      ) : (
        <>
          {/* Transparent 3D canvas overlay - memoized to survive parent re-renders */}
          {virtualAssistantComponent}

          {/* Unified Control Panel */}
          <ControlPanel
            isAssistantReady={isAssistantReady}
            currentState={currentState}
            assistantRef={assistantRef}
            sceneRef={sceneRef}
            positionManagerRef={positionManagerRef}
            onStateChange={setCurrentState}
          />

          {/* Chat System - handles all chat logic with fade-in transition */}
          <div className={`transition-opacity duration-700 ${isChatUIReady ? 'opacity-100' : 'opacity-0'}`}>
            <ChatController
              assistantRef={assistantRef}
              positionManagerRef={positionManagerRef}
              isAssistantReady={isAssistantReady}
              modelDisabled={!enableModelLoading}
            />
          </div>
          
          {/* Loading indicator for chat-only mode */}
          {!enableModelLoading && !isChatUIReady && (
            <LoadingIndicator isVisible={true} />
          )}
        </>
      )}
    </div>
  );
}

export default AppContent;
