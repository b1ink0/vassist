/**
 * AppContent Component
 * Main application content shared between dev mode and extension mode
 * This component contains all the core UI logic without the background gradient
 */

import { useState, useCallback, useMemo } from 'react';
import VirtualAssistant from './VirtualAssistant';
import ControlPanel from './ControlPanel';
import ChatController from './ChatController';
import LoadingIndicator from './LoadingIndicator';
import ModelLoadingOverlay from './ModelLoadingOverlay';
import { useApp } from '../contexts/AppContext';
import { useConfig } from '../contexts/ConfigContext';
import { useVisibilityUnmount } from '../hooks/useVisibilityUnmount';

function AppContent({ mode = 'development' }) {
  const [currentState, setCurrentState] = useState('IDLE');
  
  // Get shared state from AppContext
  const {
    isAssistantReady,
    isChatUIReady,
    enableModelLoading,
    assistantRef,
    sceneRef,
    positionManagerRef,
    handleAssistantReady: contextHandleAssistantReady,
  } = useApp();

  // Get Kokoro status from ConfigContext
  const { kokoroStatus, ttsConfig } = useConfig();
  
  // Auto-unmount when tab is hidden for 15+ seconds
  const shouldMountModel = useVisibilityUnmount(enableModelLoading === true);
  
  // Check if we should wait for Kokoro pre-initialization
  const shouldWaitForKokoro = ttsConfig.enabled && 
                              ttsConfig.provider === 'kokoro' && 
                              ttsConfig.kokoro?.keepModelLoaded !== false &&
                              kokoroStatus.preInitializing;
  
  /**
   * Handle VirtualAssistant ready
   * Wrapped in useCallback to prevent infinite re-renders
   */
  const handleAssistantReady = useCallback(({ animationManager, positionManager, scene }) => {
    console.log(`[AppContent ${mode}] VirtualAssistant ready!`);
    setCurrentState(animationManager.getCurrentState());
    
    // Call context handler to update global state
    contextHandleAssistantReady({ animationManager, positionManager, scene });
    
    console.log(`[AppContent ${mode}] Position manager ref set, ready for position tracking`);
  }, [mode, contextHandleAssistantReady]);

  // Memoize VirtualAssistant to prevent unmount on parent re-renders (e.g., ConfigContext updates)
  // This is CRITICAL - without this, ConfigContext state changes cause VirtualAssistant to unmount/remount
  const virtualAssistantComponent = useMemo(() => {
    if (enableModelLoading === null) {
      return null; // Still loading config
    }
    if (!enableModelLoading) {
      return null; // Model disabled
    }
    if (shouldWaitForKokoro) {
      console.log('[AppContent] Waiting for Kokoro pre-initialization before loading model...');
      return null; // Wait for Kokoro to pre-initialize
    }
    if (!shouldMountModel) {
      console.log('[AppContent] Model unmounted due to prolonged tab inactivity');
      return null; // Unmounted to free resources while tab is hidden
    }
    return (
      <VirtualAssistant 
        ref={assistantRef}
        onReady={handleAssistantReady}
        mode={mode}
      />
    );
  }, [enableModelLoading, shouldMountModel, shouldWaitForKokoro, handleAssistantReady, mode, assistantRef]);

  return (
    <div className="relative">
      {/* Don't render anything until config is loaded to prevent mount/unmount cycles */}
      {enableModelLoading === null || shouldWaitForKokoro ? (
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
              modelDisabled={!enableModelLoading}
            />
          </div>
          
          {/* Loading indicator for chat-only mode */}
          {!enableModelLoading && !isChatUIReady && (
            <LoadingIndicator isVisible={true} />
          )}

          {/* Model loading overlay */}
          <ModelLoadingOverlay />
        </>
      )}
    </div>
  );
}

export default AppContent;
