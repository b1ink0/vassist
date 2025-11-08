/**
 * @fileoverview Main application content component.
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
import Logger from '../services/LoggerService';

/**
 * Main application content component shared between development and extension modes.
 * 
 * @param {Object} props
 * @param {string} props.mode - Application mode ('development'|'extension')
 * @returns {JSX.Element}
 */
function AppContent({ mode = 'development' }) {
  const [currentState, setCurrentState] = useState('IDLE');
  
  const {
    isAssistantReady,
    isChatUIReady,
    enableModelLoading,
    assistantRef,
    sceneRef,
    positionManagerRef,
    handleAssistantReady: contextHandleAssistantReady,
  } = useApp();

  const { kokoroStatus, ttsConfig } = useConfig();
  
  const shouldMountModel = useVisibilityUnmount(enableModelLoading === true);
  
  const shouldWaitForKokoro = ttsConfig.enabled && 
                              ttsConfig.provider === 'kokoro' && 
                              ttsConfig.kokoro?.keepModelLoaded !== false &&
                              kokoroStatus.preInitializing;
  
  /**
   * Handles VirtualAssistant ready event.
   * 
   * @param {Object} params
   * @param {Object} params.animationManager - Animation manager instance
   * @param {Object} params.positionManager - Position manager instance
   * @param {Object} params.scene - Babylon.js scene instance
   */
  const handleAssistantReady = useCallback(({ animationManager, positionManager, scene }) => {
    Logger.log('AppContent ${mode}', 'VirtualAssistant ready!');
    setCurrentState(animationManager.getCurrentState());
    
    contextHandleAssistantReady({ animationManager, positionManager, scene });
    
    Logger.log('AppContent ${mode}', 'Position manager ref set, ready for position tracking');
  }, [contextHandleAssistantReady]);

  const virtualAssistantComponent = useMemo(() => {
    if (enableModelLoading === null) {
      return null;
    }
    if (!enableModelLoading) {
      return null;
    }
    if (shouldWaitForKokoro) {
      Logger.log('AppContent', 'Waiting for Kokoro pre-initialization before loading model...');
      return null;
    }
    if (!shouldMountModel) {
      Logger.log('AppContent', 'Model unmounted due to prolonged tab inactivity');
      return null;
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
      {enableModelLoading === null || shouldWaitForKokoro ? (
        <LoadingIndicator isVisible={true} />
      ) : (
        <>
          {virtualAssistantComponent}

          <ControlPanel
            isAssistantReady={isAssistantReady}
            currentState={currentState}
            assistantRef={assistantRef}
            sceneRef={sceneRef}
            positionManagerRef={positionManagerRef}
            onStateChange={setCurrentState}
          />

          <div className={`transition-opacity duration-700 ${isChatUIReady ? 'opacity-100' : 'opacity-0'}`}>
            <ChatController
              modelDisabled={!enableModelLoading}
            />
          </div>
          
          {!enableModelLoading && !isChatUIReady && (
            <LoadingIndicator isVisible={true} />
          )}

          <ModelLoadingOverlay />
        </>
      )}
    </div>
  );
}

export default AppContent;
