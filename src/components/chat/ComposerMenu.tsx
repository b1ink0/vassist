import { useEmbedHost } from "../../embed/EmbedHostContext";
import { resolveConfiguredPortalContainer } from "../../embed/portalContainers";
import { resolvePortalContainer } from "../../utils/resolvePortalContainer";
import { useState, type ReactNode } from "react";
import { Popover } from "@base-ui/react/popover";
import { Button } from "../ui";
import { Icon } from "../icons";
import { cn } from "../../utils/cn";
import { useSpatialHtmlPanelHost } from "../xr/SpatialHtmlPanelContext";

export interface ComposerMenuItem {
  label: string;
  icon: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  testId?: string;
}

export function ComposerMenu({
  items,
  children,
  isLightBackground,
  disabled,
  onOpenChange,
  triggerIcon = "plus",
  triggerLabel = "More options",
  triggerClassName = "composer-icon shrink-0",
  side = "top",
  align = "start",
  triggerTestId = "chat-more-options",
  compact = false,
}: {
  items: ComposerMenuItem[];
  children?: ReactNode;
  isLightBackground: boolean;
  disabled?: boolean;
  onOpenChange?: (open: boolean) => void;
  triggerIcon?: string;
  triggerLabel?: string;
  triggerClassName?: string;
  side?: "top" | "bottom";
  align?: "start" | "end";
  triggerTestId?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const spatialHost = useSpatialHtmlPanelHost();
  const { embedConfig } = useEmbedHost();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const portalContainer =
    spatialHost ??
    resolveConfiguredPortalContainer(
      embedConfig,
      "popovers",
      resolvePortalContainer(undefined, anchor),
    );
  const changeOpen = (nextOpen: boolean) => {
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };
  return (
    <Popover.Root open={open} onOpenChange={changeOpen}>
      <Popover.Trigger
        ref={setAnchor}
        render={<Button variant="unstyled" type="button" />}
        disabled={disabled}
        aria-label={triggerLabel}
        data-testid={triggerTestId}
        className={triggerClassName}
      >
        <Icon
          name={triggerIcon}
          size={22}
          className={cn(
            "transition-transform duration-200",
            open && triggerIcon === "plus" && "rotate-45",
          )}
        />
      </Popover.Trigger>
      <Popover.Portal container={portalContainer}>
        <Popover.Positioner
          side={side}
          align={align}
          sideOffset={12}
          collisionPadding={12}
          collisionBoundary={spatialHost ?? "clipping-ancestors"}
          className="z-[10040] max-w-[calc(100vw-24px)]"
        >
          <Popover.Popup
            finalFocus={(interaction) => interaction === "keyboard"}
            data-electron-interactive="true"
            className={cn(
              "composer-menu max-w-[calc(100vw-24px)] overflow-y-auto rounded-2xl border p-1.5 shadow-xl outline-none",
              compact ? "inline-grid min-w-40" : "w-64",
              isLightBackground
                ? "vassist-popup-surface-inverse"
                : "vassist-popup-surface",
            )}
          >
            {items.map((item) => (
              <Button
                key={item.testId ?? item.label}
                type="button"
                variant="unstyled"
                disabled={item.disabled}
                data-testid={item.testId}
                aria-pressed={
                  item.active === undefined ? undefined : item.active
                }
                onClick={() => {
                  item.onClick();
                  changeOpen(false);
                }}
                className={cn(
                  "composer-menu-item justify-start rounded-xl px-3 py-2.5 text-sm",
                  compact ? "whitespace-nowrap" : "w-full",
                )}
              >
                <Icon name={item.icon} size={19} />
                <span className="flex-1 text-left">{item.label}</span>
                {item.active && <Icon name="check" size={16} />}
              </Button>
            ))}
            {children && <div className="space-y-0.5">{children}</div>}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
