import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import { type ComponentProps, type ReactElement, type ReactNode } from "react";
import { cn } from "../../utils/cn";

export type TooltipVariant = "default" | "dark";
export type TooltipSide = ComponentProps<typeof BaseTooltip.Positioner>["side"];

interface TooltipProps {
  content?: ReactNode;
  children: ReactElement;
  variant?: TooltipVariant;
  side?: TooltipSide;
  sideOffset?: number;
  delay?: number;
  closeDelay?: number;
}

/**
 * The shared application tooltip. It intentionally renders through Base UI so
 * every button gets the same positioning, collision handling, keyboard focus,
 * theme surface, and arrow treatment.
 */
export function Tooltip({
  content,
  children,
  variant = "default",
  side = "top",
  sideOffset = 8,
  delay = 500,
  closeDelay = 80,
}: TooltipProps) {
  if (!content) {
    return children;
  }

  const inverse = variant === "dark";

  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger
        render={children}
        delay={delay}
        closeDelay={closeDelay}
      />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner
          side={side}
          sideOffset={sideOffset}
          className="z-[10050]"
        >
          <BaseTooltip.Popup
            className={cn(
              "relative max-w-[min(18rem,calc(100vw-16px))] rounded-md border px-2.5 py-1.5 text-xs font-medium leading-tight shadow-lg outline-none",
              inverse
                ? "vassist-popup-surface-inverse"
                : "vassist-popup-surface",
            )}
          >
            <BaseTooltip.Arrow
              className={cn(
                "pointer-events-none relative block h-1.5 w-3 overflow-clip",
                "data-[side=bottom]:top-[-6px]",
                "data-[side=left]:right-[-9px] data-[side=left]:rotate-90",
                "data-[side=right]:left-[-9px] data-[side=right]:-rotate-90",
                "data-[side=top]:bottom-[-6px] data-[side=top]:rotate-180",
                "before:absolute before:bottom-0 before:left-1/2 before:block",
                "before:box-border before:h-[calc(6px*sqrt(2))] before:w-[calc(6px*sqrt(2))]",
                "before:translate-x-[-50%] before:translate-y-[50%] before:rotate-45",
                "before:border before:border-solid",
                inverse
                  ? "before:bg-[var(--vassist-inverse-surface-elevated)] before:border-[var(--vassist-inverse-border-strong-color)]"
                  : "before:bg-[var(--vassist-surface-elevated)] before:border-[var(--vassist-border-strong-color)]",
              )}
            />
            {content}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
