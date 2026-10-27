/**
 * @fileoverview Loading indicator styled to match the assistant controls.
 */
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
  const percentage =
    progress !== null && Number.isFinite(progress)
      ? Math.round(Math.min(100, Math.max(0, progress)))
      : null;

  return (
    <div
      role="progressbar"
      aria-label="Loading"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percentage ?? undefined}
      className={cn(
        centered ? "relative" : "fixed bottom-5 right-5",
        "glass-button glass-button-dark z-[10000] pointer-events-none flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
      )}
    >
      <svg
        aria-hidden="true"
        className="absolute -inset-px h-12 w-12 animate-spin motion-reduce:animate-none"
        viewBox="0 0 48 48"
      >
        <circle
          cx="24"
          cy="24"
          r="23.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
          pathLength="1"
          strokeDasharray="0.7 0.3"
        />
      </svg>
      {percentage !== null && (
        <span className="text-[10px] font-semibold tabular-nums">
          {percentage}
        </span>
      )}
    </div>
  );
};

export default LoadingIndicator;
