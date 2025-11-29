/**
 * @fileoverview Android-specific content component for live wallpaper.
 * This component only renders in the WebView wallpaper service.
 * The main app UI is handled natively by Jetpack Compose.
 */

import { useMemo, useCallback } from 'react';
import VirtualAssistant from '../src/components/VirtualAssistant';
import { useApp } from '../src/contexts/AppContext';
import Logger from '../src/services/LoggerService';

/**
 * Android content component optimized for live wallpaper.
 * 
 * @returns {JSX.Element}
 */
function AndroidContent() {
  const {
    assistantRef,
    handleAssistantReady: contextHandleAssistantReady,
  } = useApp();

  /**
   * Handles VirtualAssistant ready event.
   */
  const handleAssistantReady = useCallback(({ animationManager, positionManager, scene }) => {
    Logger.log('AndroidContent', 'VirtualAssistant ready for live wallpaper!');
    contextHandleAssistantReady({ animationManager, positionManager, scene });
  }, [contextHandleAssistantReady]);

  const virtualAssistantComponent = useMemo(() => (
    <VirtualAssistant 
      ref={assistantRef}
      onReady={handleAssistantReady}
      mode="android"
    />
  ), [handleAssistantReady, assistantRef]);

  return (
    <div className="relative w-full h-full bg-transparent">
      {virtualAssistantComponent}
    </div>
  );
}

export default AndroidContent;
