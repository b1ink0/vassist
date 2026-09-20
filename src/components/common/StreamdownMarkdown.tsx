/**
 * @fileoverview Shared streaming-aware markdown renderer built on Streamdown.
 */

import { useEffect, useRef } from "react";
import "streamdown/styles.css";
import { Streamdown, type StreamdownProps } from "streamdown";
import { cn } from "../../utils/cn";

interface StreamdownMarkdownProps {
  text?: string;
  className?: string;
  isStreaming?: boolean;
  emitProgressEvents?: boolean;
  animated?: StreamdownProps["animated"];
  controls?: StreamdownProps["controls"];
}

const DEFAULT_MARKDOWN_CONTROLS: NonNullable<StreamdownProps["controls"]> = {
  code: {
    copy: true,
    download: false,
  },
  table: {
    copy: true,
    download: false,
    fullscreen: true,
  },
  mermaid: {
    copy: true,
    download: false,
    fullscreen: true,
    panZoom: true,
  },
};

const StreamdownMarkdown = ({
  text = "",
  className = "",
  isStreaming = false,
  emitProgressEvents = false,
  animated = false,
  controls = DEFAULT_MARKDOWN_CONTROLS,
}: StreamdownMarkdownProps) => {
  const previousLengthRef = useRef(text.length);

  useEffect(() => {
    const previousLength = previousLengthRef.current;
    previousLengthRef.current = text.length;

    if (
      typeof window === "undefined" ||
      !emitProgressEvents ||
      !isStreaming ||
      text.length <= previousLength
    ) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent("streamingWordAdded"));
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [text, emitProgressEvents, isStreaming]);

  if (!text) {
    return null;
  }

  return (
    <Streamdown
      animated={animated}
      className={cn(
        "vassist-markdown markdown-content max-w-full overflow-hidden",
        className,
      )}
      controls={controls}
      dir="auto"
      isAnimating={isStreaming}
      lineNumbers={false}
      linkSafety={{ enabled: false }}
      mode={isStreaming ? "streaming" : "static"}
    >
      {text}
    </Streamdown>
  );
};

export default StreamdownMarkdown;
