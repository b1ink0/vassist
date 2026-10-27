/**
 * @fileoverview Shared streaming-aware markdown renderer built on Streamdown.
 */

import { useEffect, useRef, useState } from "react";
import "streamdown/styles.css";
import { Streamdown, type StreamdownProps } from "streamdown";
import { cn } from "../../utils/cn";

interface StreamdownMarkdownProps {
  text?: string;
  className?: string;
  isStreaming?: boolean;
  emitProgressEvents?: boolean;
  animated?: StreamdownProps["animated"];
  smoothReveal?: boolean;
  onRevealStateChange?: (active: boolean) => void;
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
  smoothReveal = false,
  onRevealStateChange,
  controls = DEFAULT_MARKDOWN_CONTROLS,
}: StreamdownMarkdownProps) => {
  const initialText = smoothReveal && isStreaming ? "" : text;
  const [displayedText, setDisplayedText] = useState(initialText);
  const [reducedMotion, setReducedMotion] = useState(false);
  const displayedRef = useRef(initialText);
  const targetRef = useRef(text);
  const frameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);
  const revealCreditRef = useRef(0);
  const wasStreamingRef = useRef(isStreaming);
  const streamingRef = useRef(isStreaming);
  const revealEnabled = smoothReveal && !reducedMotion;
  const renderedText = revealEnabled ? displayedText : text;
  const renderingStream =
    isStreaming || (revealEnabled && displayedText !== text);
  const previousLengthRef = useRef(renderedText.length);

  useEffect(() => {
    onRevealStateChange?.(renderingStream);
    return () => onRevealStateChange?.(false);
  }, [onRevealStateChange, renderingStream]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    targetRef.current = text;
    streamingRef.current = isStreaming;
    if (isStreaming) wasStreamingRef.current = true;
    if (
      !revealEnabled ||
      (!isStreaming && !wasStreamingRef.current) ||
      !text.startsWith(displayedRef.current)
    ) {
      displayedRef.current = text;
      setDisplayedText(text);
      return;
    }
    if (frameRef.current !== null) return;
    if (displayedRef.current.length >= text.length) {
      if (!isStreaming) wasStreamingRef.current = false;
      return;
    }

    const reveal = (time: number) => {
      frameRef.current = null;
      const target = targetRef.current;
      const current = displayedRef.current;
      if (!target.startsWith(current)) {
        displayedRef.current = target;
        setDisplayedText(target);
        return;
      }
      const remaining = target.length - current.length;
      if (remaining <= 0) {
        if (!streamingRef.current) wasStreamingRef.current = false;
        return;
      }
      const elapsed =
        lastFrameTimeRef.current === null
          ? 16
          : Math.min(80, Math.max(0, time - lastFrameTimeRef.current));
      lastFrameTimeRef.current = time;
      const charactersPerSecond = Math.min(1200, 120 + remaining * 0.12);
      revealCreditRef.current += (charactersPerSecond * elapsed) / 1000;
      const count = Math.floor(revealCreditRef.current);
      if (count < Math.min(4, remaining)) {
        frameRef.current = window.requestAnimationFrame(reveal);
        return;
      }
      revealCreditRef.current -= count;
      let end = Math.min(target.length, current.length + count);
      if (end < target.length && /[\uD800-\uDBFF]/.test(target[end - 1] ?? ""))
        end += 1;
      displayedRef.current = target.slice(0, end);
      setDisplayedText(displayedRef.current);
      if (end < target.length)
        frameRef.current = window.requestAnimationFrame(reveal);
      else {
        lastFrameTimeRef.current = null;
        revealCreditRef.current = 0;
        if (!streamingRef.current) wasStreamingRef.current = false;
      }
    };
    frameRef.current = window.requestAnimationFrame(reveal);
  }, [text, revealEnabled, isStreaming]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    const previousLength = previousLengthRef.current;
    previousLengthRef.current = renderedText.length;

    if (
      typeof window === "undefined" ||
      !emitProgressEvents ||
      !renderingStream ||
      renderedText.length <= previousLength
    ) {
      return;
    }

    window.dispatchEvent(new CustomEvent("streamingWordAdded"));
  }, [renderedText, emitProgressEvents, renderingStream]);

  if (!renderedText) {
    return null;
  }

  return (
    <Streamdown
      animated={revealEnabled ? animated : false}
      className={cn(
        "vassist-markdown markdown-content max-w-full overflow-hidden",
        className,
      )}
      controls={controls}
      dir="auto"
      isAnimating={renderingStream}
      lineNumbers={false}
      linkSafety={{ enabled: false }}
      mode={renderingStream ? "streaming" : "static"}
    >
      {renderedText}
    </Streamdown>
  );
};

export default StreamdownMarkdown;
