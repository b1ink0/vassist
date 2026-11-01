import { useEffect, useState, type ReactNode } from "react";
import { Accordion } from "@base-ui/react/accordion";
import { Icon } from "../../icons";
import { cn } from "../../../utils/cn";

export default function SettingsDisclosure({
  title,
  children,
  defaultOpen = false,
  open,
  onOpenChange,
  className,
}: {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(defaultOpen);
  useEffect(() => {
    if (defaultOpen) setExpanded(true);
  }, [defaultOpen]);
  return (
    <Accordion.Root
      value={(open ?? expanded) ? ["section"] : []}
      onValueChange={(value) => {
        setExpanded(value.length > 0);
        onOpenChange?.(value.length > 0);
      }}
      className={cn(
        "settings-disclosure settings-control-group min-w-0",
        className,
      )}
    >
      <Accordion.Item value="section">
        <Accordion.Header>
          <Accordion.Trigger className="settings-disclosure-trigger flex w-full min-w-0 items-center justify-between gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium">
            <span className="min-w-0">{title}</span>
            <Icon
              name="chevron-down"
              size={14}
              className="settings-disclosure-chevron shrink-0 text-current"
            />
          </Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Panel keepMounted className="settings-disclosure-panel">
          <div className="flex min-w-0 flex-col gap-3 px-3 pb-3">
            {children}
          </div>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion.Root>
  );
}
