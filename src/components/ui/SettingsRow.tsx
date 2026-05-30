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
}

/**
 * Shared settings row with label/description and right-side control slot.
 */
const SettingsRow = ({
  label,
  description,
  className,
  children,
  targetId,
}: SettingsRowProps) => {
  const { embedConfig } = useEmbedHost();

  if (targetId && isSettingsTargetHidden(embedConfig, targetId)) {
    return null;
  }

  const isReadOnly =
    targetId !== undefined && isSettingsTargetReadOnly(embedConfig, targetId);

  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <div className="flex-1 min-w-0">
        <span className="text-sm text-white font-medium">{label}</span>
        {description && (
          <p className="text-xs text-white/50 mt-0.5">{description}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className={cn(isReadOnly && "pointer-events-none opacity-70")}>
          {children}
        </div>
        {isReadOnly ? (
          <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-white/60">
            Managed by host
          </span>
        ) : null}
      </div>
    </div>
  );
};

export default SettingsRow;
