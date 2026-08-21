/**
 * @fileoverview Zoom control component for model camera zoom
 */

import { useState } from "react";
import { Icon } from "../icons";
import { Button } from "../ui";
import { cn } from "../../utils/cn";

interface ZoomControlProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  isZoomOutDisabled?: boolean;
  isLeftSide?: boolean;
  isLightBackground?: boolean;
  isVisible?: boolean;
}

/**
 * Zoom control with expand/collapse functionality
 * Shows zoom in/reset/zoom out buttons when expanded
 *
 * @param {Object} props
 * @param {Function} props.onZoomIn - Zoom in handler
 * @param {Function} props.onZoomOut - Zoom out handler
 * @param {Function} props.onReset - Reset zoom handler
 * @param {boolean} props.isLeftSide - Whether buttons are on left side of model
 * @param {boolean} props.isLightBackground - Light background detection
 * @param {boolean} props.isVisible - Visibility state for fade animation
 * @returns {JSX.Element}
 */
const ZoomControl = ({
  onZoomIn,
  onZoomOut,
  onReset,
  onRotateLeft,
  onRotateRight,
  isZoomOutDisabled = false,
  isLeftSide = false,
  isLightBackground = false,
  isVisible = true,
}: ZoomControlProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="flex flex-col gap-2 items-center relative">
      {/* Main Zoom Button */}
      <Button
        onClick={handleToggle}
        variant={isLightBackground ? "dark" : "default"}
        className={cn(
          "w-12 h-12 rounded-full hover:scale-110 active:scale-95 transition-transform",
          isLightBackground ? "hover:bg-black/30" : "hover:bg-white/30",
          !isVisible && "animate-fade-out",
        )}
        title="Zoom Control"
      >
        <Icon
          name="zoomIn"
          size={24}
          className={cn(
            isLightBackground ? "glass-text" : "glass-text-black",
            "drop-shadow-lg",
          )}
        />
      </Button>

      {/* Expanded Controls - positioned beside zoom button */}
      {isExpanded && (
        <div
          className="absolute flex w-40 flex-col items-center gap-2"
          style={{
            top: 0,
            [isLeftSide ? "right" : "left"]: "-171px",
          }}
        >
          <div
            className={cn(
              "flex gap-2",
              isLeftSide ? "flex-row-reverse" : "flex-row",
            )}
          >
            {/* Zoom In */}
            <Button
              onClick={onZoomIn}
              variant={isLightBackground ? "dark" : "default"}
              className={cn(
                "w-12 h-12 rounded-full hover:scale-110 active:scale-95 transition-all",
                isLightBackground ? "hover:bg-black/30" : "hover:bg-white/30",
                "animate-fade-in",
              )}
              title="Zoom In"
            >
              <Icon
                name="plus"
                size={24}
                className={cn(
                  isLightBackground ? "glass-text" : "glass-text-black",
                  "drop-shadow-lg",
                )}
              />
            </Button>

            {/* Reset */}
            <Button
              onClick={onReset}
              variant={isLightBackground ? "dark" : "default"}
              className={cn(
                "w-12 h-12 rounded-full hover:scale-110 active:scale-95 transition-all",
                isLightBackground ? "hover:bg-black/30" : "hover:bg-white/30",
                "animate-fade-in",
              )}
              title="Reset Zoom and Rotation"
              style={{ animationDelay: "50ms" }}
            >
              <Icon
                name="refresh"
                size={24}
                className={cn(
                  isLightBackground ? "glass-text" : "glass-text-black",
                  "drop-shadow-lg",
                )}
              />
            </Button>

            {/* Zoom Out */}
            <Button
              onClick={() => {
                if (!isZoomOutDisabled) onZoomOut();
              }}
              disabled={isZoomOutDisabled}
              variant={isLightBackground ? "dark" : "default"}
              className={cn(
                "w-12 h-12 rounded-full transition-all animate-fade-in",
                isZoomOutDisabled
                  ? "opacity-40 cursor-not-allowed"
                  : cn(
                      "hover:scale-110 active:scale-95",
                      isLightBackground
                        ? "hover:bg-black/30"
                        : "hover:bg-white/30",
                    ),
              )}
              title={isZoomOutDisabled ? "At minimum size" : "Zoom Out"}
              style={{ animationDelay: "100ms" }}
            >
              <Icon
                name="minus"
                size={24}
                className={cn(
                  isLightBackground ? "glass-text" : "glass-text-black",
                  "drop-shadow-lg",
                )}
              />
            </Button>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={onRotateLeft}
              variant={isLightBackground ? "dark" : "default"}
              className={cn(
                "h-12 w-12 animate-fade-in rounded-full transition-all hover:scale-110 active:scale-95",
                isLightBackground ? "hover:bg-black/30" : "hover:bg-white/30",
              )}
              title="Rotate Left 10 degrees"
              aria-label="Rotate avatar left 10 degrees"
              style={{ animationDelay: "150ms" }}
            >
              <Icon
                name="rotate-left"
                size={24}
                className={cn(
                  isLightBackground ? "glass-text" : "glass-text-black",
                  "drop-shadow-lg",
                )}
              />
            </Button>
            <Button
              onClick={onRotateRight}
              variant={isLightBackground ? "dark" : "default"}
              className={cn(
                "h-12 w-12 animate-fade-in rounded-full transition-all hover:scale-110 active:scale-95",
                isLightBackground ? "hover:bg-black/30" : "hover:bg-white/30",
              )}
              title="Rotate Right 10 degrees"
              aria-label="Rotate avatar right 10 degrees"
              style={{ animationDelay: "200ms" }}
            >
              <Icon
                name="rotate-right"
                size={24}
                className={cn(
                  isLightBackground ? "glass-text" : "glass-text-black",
                  "drop-shadow-lg",
                )}
              />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ZoomControl;
