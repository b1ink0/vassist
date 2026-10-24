import { useEffect, useRef, useState } from "react";
import { Collapsible } from "@base-ui/react/collapsible";
import { Icon } from "../icons";

interface ThinkingPanelProps {
  thinking?: string | null;
  messageIndex: number;
  /** True while the assistant message is still streaming */
  isStreamingMessage: boolean;
  /** True once non-thinking content has started arriving */
  hasContent: boolean;
  /** User preference: auto-expand while reasoning streams */
  autoExpand: boolean;
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
  const lines = thinking.split("\n").filter((l) => l.trim().length > 0);
  const currentLine = lines[lines.length - 1] ?? "";

  return (
    <Collapsible.Root
      open={expanded}
      onOpenChange={(nextOpen: boolean) => setUserExpanded(nextOpen)}
      className="mb-2 rounded-lg border overflow-hidden border-white/10 bg-white/[0.04]"
      data-testid={`chat-message-thinking-${messageIndex}`}
    >
      <Collapsible.Trigger
        className="glass-text flex w-full items-center gap-1.5 px-3 py-1.5 text-xs font-medium opacity-60 hover:opacity-90"
        data-testid={`chat-message-thinking-toggle-${messageIndex}`}
      >
        <span className="thinking-chevron inline-flex">
          <Icon name="chevron-right" size={12} />
        </span>
        <span className={thinkingActive ? "thinking-label-pulse" : undefined}>
          {thinkingActive ? "Thinking..." : "Thought process"}
        </span>
        {!expanded && thinkingActive && (
          <span
            className="ml-1 flex-1 min-w-0 relative h-[14px] overflow-hidden text-left font-normal opacity-70"
            aria-hidden={true}
          >
            <span
              key={currentLine}
              className="absolute inset-x-0 bottom-0 whitespace-nowrap overflow-hidden text-ellipsis block animate-thinking-ticker-line"
            >
              {currentLine}
            </span>
          </span>
        )}
      </Collapsible.Trigger>

      <Collapsible.Panel className="thinking-collapse-panel">
        <div
          ref={scrollRef}
          className="glass-text px-3 pb-2 pt-0.5 text-[13px] leading-relaxed whitespace-pre-wrap opacity-60 overflow-y-auto thinking-scroll-area"
          style={{ maxHeight: MAX_CONTENT_HEIGHT }}
        >
          {thinking}
        </div>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
};

export default ThinkingPanel;
