/**
 * @fileoverview Loading overlay component for 3D model loading states.
 */

import { useApp } from '../contexts/AppContext';
import LoadingIndicator from './LoadingIndicator';

/**
 * Loading overlay displayed over model position during loading states.
 * 
 * @returns {JSX.Element|null}
 */
const ModelLoadingOverlay = () => {
  const { showModelLoadingOverlay, modelOverlayPos } = useApp();

  if (!showModelLoadingOverlay || modelOverlayPos.width === 0) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        left: `${modelOverlayPos.x}px`,
        top: `${modelOverlayPos.y}px`,
        width: `${modelOverlayPos.width}px`,
        height: `${modelOverlayPos.height}px`,
        zIndex: 10000,
        borderRadius: '24px',
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '24px',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          backgroundColor: 'rgba(0, 0, 0, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none'
        }}
      >
        <LoadingIndicator isVisible={true} centered={true} />
      </div>
    </div>
  );
};

export default ModelLoadingOverlay;
