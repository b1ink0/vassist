import type { VAssistSettingsTargetId } from "../../embed/config";
import { useEmbedHost } from "../../embed/EmbedHostContext";
import {
  isSettingsTargetHidden,
  isSettingsTargetReadOnly,
} from "../../embed/settingsPolicy";
import { cn } from "../../utils/cn";

import type { ReactNode } from "react";

interface SettingsRowProps {
  label: ReactNode;
  description?: ReactNode;
  className?: string;
  children: ReactNode;
  targetId?: VAssistSettingsTargetId;
  layout?: "inline" | "stacked";
}

/**
 * Shared settings row with optional inline or stacked control layout.
 */
const SettingsRow = ({
  label,
  description,
  className,
  children,
  targetId,
  layout = "inline",
}: SettingsRowProps) => {
  const { embedConfig } = useEmbedHost();
  const rowAttributes = {
    "data-settings-row": "true",
    "data-settings-label": typeof label === "string" ? label : undefined,
  };

  if (targetId && isSettingsTargetHidden(embedConfig, targetId)) {
    return null;
  }

  const isReadOnly =
    targetId !== undefined && isSettingsTargetReadOnly(embedConfig, targetId);

  const labelContent = (
    <div
      className="flex min-w-0 flex-1 flex-col gap-0.5"
      data-settings-label-content
    >
      <span className="text-sm vassist-text-primary font-medium">{label}</span>
      {description && (
        <p className="text-xs vassist-text-muted">{description}</p>
      )}
    </div>
  );

  const readOnlyBadge = isReadOnly ? (
    <span className="rounded-md border border-current/10 bg-current/5 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.08em] vassist-text-muted">
      Managed by host
    </span>
  ) : null;

  if (layout === "stacked") {
    return (
      <div
        {...rowAttributes}
        data-settings-target={targetId}
        className={cn("flex min-w-0 flex-col gap-2", className)}
      >
        {labelContent}
        <div className="flex flex-col gap-2" data-settings-control-group>
          <div
            data-settings-control
            inert={isReadOnly}
            className={cn(
              "min-w-0",
              isReadOnly && "pointer-events-none opacity-70",
            )}
          >
            {children}
          </div>
          {readOnlyBadge}
        </div>
      </div>
    );
  }

  return (
    <div
      {...rowAttributes}
      data-settings-target={targetId}
      className={cn("flex items-center justify-between gap-3", className)}
    >
      {labelContent}
      <div
        className="flex min-w-0 max-w-[55%] shrink-0 items-center gap-2"
        data-settings-control-group
      >
        <div
          data-settings-control
          inert={isReadOnly}
          className={cn(
            "min-w-0 max-w-full",
            isReadOnly && "pointer-events-none opacity-70",
          )}
        >
          {children}
        </div>
        {readOnlyBadge}
      </div>
    </div>
  );
};

export default SettingsRow;
