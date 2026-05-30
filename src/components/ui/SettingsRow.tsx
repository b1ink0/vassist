import type { VAssistSettingsTargetId } from "../../embed/config";
import { useEmbedHost } from "../../embed/EmbedHostContext";
import {
  isSettingsTargetHidden,
  isSettingsTargetReadOnly,
} from "../../embed/settingsPolicy";
import { cn } from "../../utils/cn";

import type { ReactNode } from "react";

interface SettingsRowProps {
  label: string;
  description?: string;
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

  if (targetId && isSettingsTargetHidden(embedConfig, targetId)) {
    return null;
  }

  const isReadOnly =
    targetId !== undefined && isSettingsTargetReadOnly(embedConfig, targetId);

  const labelContent = (
    <div className="flex-1 min-w-0">
      <span className="text-sm text-white font-medium">{label}</span>
      {description && (
        <p className="text-xs text-white/50 mt-0.5">{description}</p>
      )}
    </div>
  );

  const readOnlyBadge = isReadOnly ? (
    <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-white/60">
      Managed by host
    </span>
  ) : null;

  if (layout === "stacked") {
    return (
      <div className={cn("space-y-2", className)}>
        {labelContent}
        <div className="space-y-2">
          <div
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
    <div className={cn("flex items-center justify-between gap-3", className)}>
      {labelContent}
      <div className="flex items-center gap-2">
        <div className={cn(isReadOnly && "pointer-events-none opacity-70")}>
          {children}
        </div>
        {readOnlyBadge}
      </div>
    </div>
  );
};

export default SettingsRow;
