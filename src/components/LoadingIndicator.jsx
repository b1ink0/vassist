/**
 * LoadingIndicator - Custom loading spinner for bottom-right corner
 * 
 * Replaces the full-page Babylon loading screen with a non-intrusive
 * loading indicator that doesn't block the page.
 * 
 * Features:
 * - Bottom-right corner positioning
 * - Glassmorphism design with Tailwind
 * - Optional progress percentage display
 * - Smooth fade in/out transitions
 */

const LoadingIndicator = ({ isVisible = false, progress = null }) => {
  if (!isVisible) return null;

  return (
    <div
      className="fixed bottom-5 right-5 z-[10000] pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-2xl"
      style={{
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
    >
      {/* Animated spinner */}
      <div className="relative w-8 h-8">
        <div className="absolute inset-0 rounded-full border-4 border-white/20"></div>
        <div className="absolute inset-0 rounded-full border-4 border-t-white border-r-white border-b-transparent border-l-transparent animate-spin"></div>
      </div>

      {/* Loading text */}
      <div className="flex flex-col">
        <span className="text-white text-sm font-medium">Loading...</span>
        {progress !== null && (
          <span className="text-white/70 text-xs">{Math.round(progress)}%</span>
        )}
      </div>
    </div>
  );
};

export default LoadingIndicator;
