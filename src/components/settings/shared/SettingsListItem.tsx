import type { ReactNode } from "react";
import { cn } from "../../../utils/cn";

/** Shared row for an installed asset, downloadable model, or runtime pack. */
export default function SettingsListItem({
  title,
  description,
  actions,
  selected = false,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  selected?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      data-selected={selected}
      className={cn(
        "settings-list-row flex min-w-0 flex-col gap-2",
        selected && "settings-list-row-selected",
      )}
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div
            className="truncate text-sm font-medium"
            title={typeof title === "string" ? title : undefined}
          >
            {title}
          </div>
          {description && (
            <div className="text-xs vassist-text-muted">{description}</div>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-1">{actions}</div>
        )}
      </div>
      {children}
    </div>
  );
}
