import { useRef } from "react";
import { Menu } from "@base-ui/react/menu";
import { Button } from "../ui";
import { Icon } from "../icons";
import { cn } from "../../utils/cn";

export default function ChatHistoryActions({
  chatId,
  title,
  details,
  sourceUrl,
  portalContainer,
  isLightBackground,
  onRename,
  onDelete,
}: {
  chatId: string;
  title: string;
  details: string;
  sourceUrl?: string | undefined;
  portalContainer: HTMLElement | ShadowRoot | null | undefined;
  isLightBackground: boolean;
  onRename: () => void;
  onDelete: () => void;
}) {
  const actionSelected = useRef(false);
  const selectAction = (action: () => void) => {
    actionSelected.current = true;
    action();
  };
  return (
    <Menu.Root
      onOpenChange={(open) => {
        if (open) actionSelected.current = false;
      }}
    >
      <Menu.Trigger
        render={<Button variant="ghost" size="icon" />}
        aria-label={`Options for ${title}`}
        data-testid={`chat-history-options-${chatId}`}
        className="h-8 w-8 shrink-0"
      >
        <Icon name="more-horizontal" size={18} />
      </Menu.Trigger>
      <Menu.Portal container={portalContainer}>
        <Menu.Positioner
          side="bottom"
          align="end"
          sideOffset={4}
          collisionPadding={8}
          className="z-[10040]"
        >
          <Menu.Popup
            finalFocus={() => !actionSelected.current}
            data-electron-interactive="true"
            style={{
              background: isLightBackground
                ? undefined
                : "color-mix(in srgb, var(--vassist-surface-elevated) 40%, var(--vassist-inverse-surface-elevated))",
              backdropFilter: "blur(max(16px, var(--vassist-backdrop-blur)))",
              WebkitBackdropFilter:
                "blur(max(16px, var(--vassist-backdrop-blur)))",
            }}
            className={cn(
              "composer-menu w-52 max-w-[calc(100vw-24px)] rounded-xl border p-1 shadow-xl outline-none",
              isLightBackground
                ? "vassist-popup-surface-inverse"
                : "vassist-popup-surface",
            )}
          >
            <div className="px-3 py-2 text-xs text-white/50">
              <div>{details}</div>
              {sourceUrl && <div className="mt-1 truncate">{sourceUrl}</div>}
            </div>
            <Menu.Item
              onClick={() => selectAction(onRename)}
              data-testid={`chat-history-edit-${chatId}`}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-white outline-none data-[highlighted]:bg-white/10"
            >
              <Icon name="pencil" size={16} /> Rename
            </Menu.Item>
            <Menu.Item
              onClick={() => selectAction(onDelete)}
              data-testid={`chat-history-delete-${chatId}`}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-white outline-none data-[highlighted]:bg-white/10"
            >
              <Icon name="delete" size={16} /> Delete
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
