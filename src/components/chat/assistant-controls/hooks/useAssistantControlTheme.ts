import { useEffect, useState, type RefObject } from "react";
import Logger from "../../../../services/common/LoggerService";

interface UseAssistantControlThemeOptions {
  buttonRef: RefObject<HTMLElement | null>;
  shouldRender: boolean;
  isDragging: boolean;
  mode: string | undefined;
}

const parseRgb = (value: string): [number, number, number] | null => {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
};

const getBrightness = ([r, g, b]: [number, number, number]): number =>
  (r * 299 + g * 587 + b * 114) / 1000;

export function useAssistantControlTheme({
  buttonRef,
  shouldRender,
  isDragging,
  mode,
}: UseAssistantControlThemeOptions) {
  const [isLightBackground, setIsLightBackground] = useState(false);

  useEffect(() => {
    if (!shouldRender || isDragging) return;

    let detectionTimeout: ReturnType<typeof setTimeout> | null = null;
    let scrollTimeout: ReturnType<typeof setTimeout> | null = null;

    const detectBackgroundColor = () => {
      if (mode === "light") {
        setIsLightBackground(true);
        return;
      }
      if (mode === "dark") {
        setIsLightBackground(false);
        return;
      }

      const element = buttonRef.current;
      if (!element) return;

      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const canvas = document.getElementById(
        "vassist-babylon-canvas",
      ) as HTMLCanvasElement | null;
      const elementBelow = document.elementFromPoint(x, y);

      let backgroundColor = "";
      let current: HTMLElement | null =
        elementBelow instanceof HTMLElement ? elementBelow : null;
      let depth = 0;
      while (current && depth < 10) {
        const computed = window.getComputedStyle(current);
        backgroundColor = computed.backgroundColor;
        if (
          backgroundColor !== "transparent" &&
          backgroundColor !== "rgba(0, 0, 0, 0)"
        ) {
          break;
        }
        current = current.parentElement;
        depth += 1;
      }

      if (canvas && elementBelow === canvas) {
        try {
          const canvasRect = canvas.getBoundingClientRect();
          const context = canvas.getContext("2d", {
            willReadFrequently: true,
          });
          const pixel = context?.getImageData(
            x - canvasRect.left,
            y - canvasRect.top,
            1,
            1,
          ).data;
          const [red = 0, green = 0, blue = 0, alpha = 0] = pixel ?? [];
          if (alpha > 0) {
            backgroundColor = `rgb(${red}, ${green}, ${blue})`;
          }
        } catch (error) {
          Logger.log(
            "AssistantControlDock",
            "Background canvas sampling failed:",
            error instanceof Error ? error.message : String(error),
          );
        }
      }

      const rgb = parseRgb(backgroundColor);
      if (!rgb) return;

      const isLight = getBrightness(rgb) > 128;
      Logger.log("AssistantControlDock", "Background theme resolved", {
        brightness: getBrightness(rgb),
        isLight,
      });
      setIsLightBackground(isLight);
    };

    detectionTimeout = setTimeout(detectBackgroundColor, 500);
    const handleUpdate = () => {
      if (isDragging) return;
      if (scrollTimeout) clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(detectBackgroundColor, 500);
    };

    window.addEventListener("scroll", handleUpdate, true);
    window.addEventListener("modelPositionChange", handleUpdate);

    return () => {
      if (detectionTimeout) clearTimeout(detectionTimeout);
      if (scrollTimeout) clearTimeout(scrollTimeout);
      window.removeEventListener("scroll", handleUpdate, true);
      window.removeEventListener("modelPositionChange", handleUpdate);
    };
  }, [buttonRef, isDragging, mode, shouldRender]);

  return isLightBackground;
}
