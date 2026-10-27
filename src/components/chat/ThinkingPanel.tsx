import { useEffect, useRef, useState } from "react";
import { Collapsible } from "@base-ui/react/collapsible";
import { Icon } from "../icons";
import { cn } from "../../utils/cn";

interface ThinkingPanelProps {
  thinking?: string | null;
  messageIndex: number;
  /** True while the assistant message is still streaming */
  isStreamingMessage: boolean;
  /** True once non-thinking content has started arriving */
  hasContent: boolean;
  /** User preference: auto-expand while reasoning streams */
  autoExpand: boolean;
  isLightBackground: boolean;
}

const MAX_CONTENT_HEIGHT = 180; // px — scroll viewport cap (streaming AND done)

/**
 * Collapsible "Thought process" panel built on Base UI's Collapsible.
 */
const ThinkingPanel = ({
  thinking: thinkingRaw,
  messageIndex,
  isStreamingMessage,
  hasContent,
  autoExpand,
  isLightBackground,
}: ThinkingPanelProps) => {
  const thinking = thinkingRaw ?? "";
  const thinkingActive =
    isStreamingMessage && !hasContent && thinking.trim().length > 0;

  const [userExpanded, setUserExpanded] = useState<boolean | null>(null);
  const wasAutoExpanded = useRef(false);
  if (autoExpand && thinkingActive) {
    wasAutoExpanded.current = true;
  }
  const expanded =
    userExpanded ?? (autoExpand && (thinkingActive || wasAutoExpanded.current));

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || !expanded || !thinkingActive) return;
    stickToBottom.current = true;
    scroller.scrollTop = scroller.scrollHeight;
    const onScroll = () => {
      stickToBottom.current =
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 24;
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [expanded, thinkingActive]);

  useEffect(() => {
    if (!expanded || !thinkingActive || !stickToBottom.current) return;
    const scroller = scrollRef.current;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, [thinking, expanded, thinkingActive]);

  // Latest full line for the collapsed ticker
  const trimmedThinking = thinking.trimEnd();
  const currentLine = trimmedThinking.slice(
    trimmedThinking.lastIndexOf("\n") + 1,
  );

  return (
    <Collapsible.Root
      open={expanded}
      onOpenChange={(nextOpen: boolean) => setUserExpanded(nextOpen)}
      className={cn(
        "mb-2 rounded-xl border border-current/10 overflow-hidden [background:color-mix(in_srgb,currentColor_4%,transparent)]",
        isLightBackground ? "glass-text" : "glass-text-black",
      )}
      data-testid={`chat-message-thinking-${messageIndex}`}
    >
      <Collapsible.Trigger
        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-current opacity-75 hover:opacity-100"
        data-testid={`chat-message-thinking-toggle-${messageIndex}`}
      >
        <span className="thinking-chevron inline-flex">
          <Icon name="chevron-right" size={12} />
        </span>
        <span className={thinkingActive ? "thinking-label-pulse" : undefined}>
          {thinkingActive ? "Thinking" : "Thought process"}
        </span>
        {!expanded && thinkingActive && (
          <span
            className="ml-1 flex-1 min-w-0 overflow-hidden text-left font-normal opacity-65"
            aria-hidden={true}
          >
            <span className="whitespace-nowrap overflow-hidden text-ellipsis block">
              {currentLine}
            </span>
          </span>
        )}
      </Collapsible.Trigger>

      <Collapsible.Panel className="thinking-collapse-panel">
        <div
          ref={scrollRef}
          className="px-3 pb-3 pt-1 text-[13px] leading-relaxed whitespace-pre-wrap text-current opacity-75 overflow-y-auto thinking-scroll-area"
          style={{ maxHeight: MAX_CONTENT_HEIGHT }}
        >
          {thinking}
        </div>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
};

export default ThinkingPanel;
