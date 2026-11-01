import type { HTMLAttributes, Ref } from "react";
import { ScrollArea } from "@base-ui/react/scroll-area";
import { cn } from "../../../utils/cn";

export default function SettingsScrollArea({
  children,
  className,
  contentClassName = "flex flex-col gap-2",
  ref,
  onScroll,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  contentClassName?: string;
  ref?: Ref<HTMLDivElement>;
}) {
  return (
    <ScrollArea.Root
      {...props}
      className={cn(
        "flex min-h-0 min-w-0 max-w-full flex-col",
        className,
        "overflow-hidden",
      )}
    >
      <ScrollArea.Viewport
        ref={ref}
        onScroll={onScroll}
        className="min-h-0 min-w-0 max-w-full flex-1 outline-none"
        style={{ maxHeight: "inherit" }}
      >
        <ScrollArea.Content
          className={contentClassName}
          style={{
            minWidth: 0,
            width: "100%",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {children}
        </ScrollArea.Content>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar className="flex w-1.5 p-px">
        <ScrollArea.Thumb className="w-full rounded-full bg-current/25" />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  );
}
