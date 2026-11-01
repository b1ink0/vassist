import { useEmbedHost } from "../../embed/EmbedHostContext";
import { resolveConfiguredPortalContainer } from "../../embed/portalContainers";
import { resolvePortalContainer } from "../../utils/resolvePortalContainer";
import { useState, type ReactNode } from "react";
import { Popover } from "@base-ui/react/popover";
import { ScrollArea } from "@base-ui/react/scroll-area";
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
  triggerContent,
  triggerLabel = "More options",
  triggerClassName = "composer-icon shrink-0",
  side = "top",
  align = "start",
  triggerTestId = "chat-more-options",
  compact = false,
  popupClassName,
  openOnHover = false,
}: {
  items: ComposerMenuItem[];
  children?: ReactNode;
  isLightBackground: boolean;
  disabled?: boolean;
  onOpenChange?: (open: boolean) => void;
  triggerIcon?: string;
  triggerContent?: ReactNode;
  triggerLabel?: string;
  triggerClassName?: string;
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
  openOnHover?: boolean;
  triggerTestId?: string;
  compact?: boolean;
  popupClassName?: string;
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
        openOnHover={openOnHover}
        ref={setAnchor}
        render={<Button variant="unstyled" type="button" />}
        disabled={disabled}
        aria-label={triggerLabel}
        data-testid={triggerTestId}
        className={triggerClassName}
      >
        {triggerContent ?? (
          <Icon
            name={triggerIcon}
            size={22}
            className={cn(
              "transition-transform duration-200",
              open && triggerIcon === "plus" && "rotate-45",
            )}
          />
        )}
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
              "composer-menu flex max-h-[var(--available-height)] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-2xl border p-1.5 shadow-xl outline-none",
              compact ? "flex min-w-40 flex-col" : "w-64",
              isLightBackground
                ? "vassist-popup-surface-inverse"
                : "vassist-popup-surface",
              popupClassName,
            )}
          >
            <ScrollArea.Root className="flex min-h-0 flex-col">
              <ScrollArea.Viewport className="min-h-0 max-h-[calc(var(--available-height)-0.75rem)] outline-none">
                <ScrollArea.Content className="flex min-w-0 flex-col gap-0.5">
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
                  {children && (
                    <div className="flex flex-col gap-0.5">{children}</div>
                  )}
                </ScrollArea.Content>
              </ScrollArea.Viewport>
              <ScrollArea.Scrollbar
                orientation="vertical"
                className="flex w-1.5 rounded-full p-px opacity-0 transition-opacity duration-200 data-[hovering]:opacity-100 data-[scrolling]:opacity-100 motion-reduce:transition-none"
              >
                <ScrollArea.Thumb className="w-full rounded-full bg-current/30" />
              </ScrollArea.Scrollbar>
            </ScrollArea.Root>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
