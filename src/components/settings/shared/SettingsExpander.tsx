import type { ReactNode } from "react";
import { Collapsible } from "@base-ui/react/collapsible";

/** Animate an existing row's controlled details without changing its actions. */
export default function SettingsExpander({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  return (
    <Collapsible.Root open={open} className="min-w-0">
      <Collapsible.Panel className="settings-expander-panel">
        {children}
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
