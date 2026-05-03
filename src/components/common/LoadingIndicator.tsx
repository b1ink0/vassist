/**
 * @fileoverview Custom loading spinner component.
 */

/**
 * Loading indicator component for bottom-right corner or centered positioning.
 *
 * @param {Object} props
 * @param {boolean} props.isVisible - Visibility state
 * @param {number|null} props.progress - Progress percentage (0-100)
 * @param {boolean} props.centered - Whether to center in container
 * @returns {JSX.Element|null}
 */
import { Icon } from "../icons";
import { cn } from "../../utils/cn";

interface LoadingIndicatorProps {
  isVisible?: boolean;
  progress?: number | null;
  centered?: boolean;
}

const LoadingIndicator = ({
  isVisible = false,
  progress = null,
  centered = false,
}: LoadingIndicatorProps) => {
  if (!isVisible) return null;

  return (
    <div
      className={cn(
        !centered && "fixed bottom-5 right-5",
        "z-[10000] pointer-events-auto flex items-center justify-center px-2 py-2 rounded-xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-2xl",
      )}
    >
      <div className="relative w-8 h-8 flex items-center justify-center">
        <Icon
          name="loading-2"
          size={32}
          className="animate-spin text-white opacity-90"
        />
        {progress !== null && (
          <span className="absolute text-white text-[9px] font-bold z-10">
            {Math.round(progress)}
          </span>
        )}
      </div>
    </div>
  );
};

export default LoadingIndicator;
