import type { HTMLAttributes } from "react";
import { cn } from "../../../utils/cn";

/** The same inset group surface used by Quick Access. */
export default function SettingsGroup({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn(
        "settings-control-group settings-group flex min-w-0 flex-col",
        className,
      )}
    >
      {children}
    </div>
  );
}
