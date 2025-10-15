/**
 * AppContent Component
 * Main application content shared between dev mode and extension mode
 * This component contains all the core UI logic without the background gradient
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import VirtualAssistant from './VirtualAssistant';
import ControlPanel from './ControlPanel';
import ChatController from './ChatController';
import LoadingIndicator from './LoadingIndicator';
import StorageManager from '../managers/StorageManager';

function AppContent({ mode = 'development' }) {
  const [currentState, setCurrentState] = useState('IDLE');
  const [isAssistantReady, setIsAssistantReady] = useState(false);
  const [isChatUIReady, setIsChatUIReady] = useState(false);
  
  // Initialize from localStorage IMMEDIATELY - don't wait for useEffect
  const [enableModelLoading, setEnableModelLoading] = useState(() => {
    const generalConfig = StorageManager.getConfig('generalConfig', { enableModelLoading: true });
    console.log(`[AppContent ${mode}] Initial model loading state:`, generalConfig.enableModelLoading);
    return generalConfig.enableModelLoading;
  });
  
  // Refs for accessing internal APIs
  const assistantRef = useRef(null);
  const sceneRef = useRef(null);
  const positionManagerRef = useRef(null);
  
  // Set assistant ready if model is disabled
  useEffect(() => {
    if (!enableModelLoading) {
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
    sceneRef.current = scene;
    positionManagerRef.current = positionManager;
  }, [mode]);

  return (
    <div className="relative">
      {/* Transparent 3D canvas overlay */}
      {enableModelLoading && (
        <VirtualAssistant 
          ref={assistantRef}
          onReady={handleAssistantReady}
          mode={mode}
        />
      )}

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
    </div>
  );
}

export default AppContent;
