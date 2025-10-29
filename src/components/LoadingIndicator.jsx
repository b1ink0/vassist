/**
 * LoadingIndicator - Custom loading spinner for bottom-right corner
 * 
 * Replaces the full-page Babylon loading screen with a non-intrusive
 * loading indicator that doesn't block the page.
 * 
 * Features:
 * - Bottom-right corner positioning (or centered in container)
 * - Glassmorphism design with Tailwind
 * - Optional progress percentage display
 * - Smooth fade in/out transitions
 */

import { Icon } from './icons';

const LoadingIndicator = ({ isVisible = false, progress = null, centered = false }) => {
  if (!isVisible) return null;

  return (
    <div
      className={`${centered ? '' : 'fixed bottom-5 right-5'} z-[10000] pointer-events-auto flex items-center justify-center px-2 py-2 rounded-xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-2xl`}
      style={{
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
    >
      {/* Animated spinner with percentage inside */}
      <div className="relative w-8 h-8 flex items-center justify-center">
        <div className="animate-spin">
          <Icon name="spinner" size={32} className="text-white" />
        </div>
        {progress !== null && (
          <span className="absolute text-white text-[9px] font-bold z-10">{Math.round(progress)}</span>
        )}
      </div>
    </div>
  );
};

export default LoadingIndicator;
