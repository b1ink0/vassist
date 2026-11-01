import type { ContextUsage } from "../../types/contextUsage";
import { ComposerMenu } from "./ComposerMenu";
import { Popover } from "@base-ui/react/popover";
import { Button } from "../ui";
import { Icon } from "../icons";

const tokenCount = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function ContextUsageIndicator({
  usage,
  contextLimit,
  isLightBackground,
  onOpenSettings,
}: {
  usage?: ContextUsage | undefined;
  contextLimit?: number | undefined;
  isLightBackground: boolean;
  onOpenSettings?: (() => void) | undefined;
}) {
  const used = usage?.usedTokens;
  const limit = usage?.contextLimit ?? contextLimit;
  const percent =
    limit && used !== undefined ? Math.round((used / limit) * 100) : undefined;
  const label =
    percent === undefined
      ? used === undefined
        ? limit
          ? limit.toLocaleString() + " token context · usage unavailable"
          : "Context usage not reported"
        : "Context capacity not reported"
      : percent + "% of context used";
  return (
    <ComposerMenu
      items={[]}
      isLightBackground={isLightBackground}
      triggerLabel={"Context window: " + label}
      triggerTestId="chat-context-usage"
      triggerClassName="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg p-0 text-current transition-colors hover:bg-current/10"
      triggerContent={
        <svg
          width="15"
          height="15"
          viewBox="0 0 20 20"
          aria-hidden="true"
          className="shrink-0 -rotate-90"
        >
          <circle
            cx="10"
            cy="10"
            r="7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            opacity=".18"
          />
          <circle
            cx="10"
            cy="10"
            r="7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            pathLength="100"
            strokeDasharray={
              percent === undefined ? "3 8" : Math.min(100, percent) + " 100"
            }
            strokeLinecap="round"
            className="transition-all duration-300 motion-reduce:transition-none"
          />
        </svg>
      }
      openOnHover
      compact
      align="center"
      popupClassName="w-auto"
    >
      <div className="flex flex-col items-center gap-0.5 text-center text-xs">
        <div className="flex items-center justify-center gap-1">
          <p className="opacity-60">Context window</p>
          {onOpenSettings && (
            <Popover.Close
              render={<Button variant="unstyled" size="icon" />}
              className="flex h-5 w-5 items-center justify-center rounded p-0 opacity-60 hover:bg-current/10 hover:opacity-100"
              aria-label="Context settings"
              onClick={onOpenSettings}
            >
              <Icon name="settings" size={12} />
            </Popover.Close>
          )}
        </div>
        <p className="font-medium">
          {percent === undefined
            ? used === undefined
              ? "Usage unavailable"
              : "Capacity unavailable"
            : `${percent}% used (${Math.max(0, 100 - percent)}% left)`}
        </p>
        <p>
          {used === undefined ? "—" : tokenCount.format(used)}
          {limit ? ` / ${tokenCount.format(limit)}` : ""} tokens used
        </p>
      </div>
    </ComposerMenu>
  );
}
