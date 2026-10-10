/**
 * Thinking-content utilities
 *
 * Streaming-safe parser that separates <think>...</think> reasoning from
 * regular content. Used by ChatController to render thinking in a distinct
 * collapsible panel, by TTS to avoid speaking reasoning, and as the
 * normalization layer for remote providers that emit inline think tags.
 */

export interface ThinkDelta {
  content: string;
  thinking: string;
}

const OPEN_TAG = "<think>";
const CLOSE_TAG = "</think>";

/**
 * Strip all think blocks from a complete text. Handles an unclosed trailing
 * block (model hit token limit mid-think). Used when toggle is OFF.
 */
export function stripThinking(text: string): string {
  let out = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  const openIdx = out.indexOf(OPEN_TAG);
  if (openIdx !== -1 && out.indexOf(CLOSE_TAG, openIdx) === -1) {
    out = out.slice(0, openIdx); // unclosed block swallows the rest
  }
  return out.replace(/^\s+/, "");
}

/**
 * Split a COMPLETE text into { thinking, content }.
 */
export function splitThinking(text: string): {
  thinking: string;
  content: string;
} {
  let thinking = "";
  let content = "";
  let rest = text;
  for (;;) {
    const open = rest.indexOf(OPEN_TAG);
    if (open === -1) {
      content += rest;
      break;
    }
    content += rest.slice(0, open);
    const closeStart = rest.indexOf(CLOSE_TAG, open + OPEN_TAG.length);
    if (closeStart === -1) {
      thinking += rest.slice(open + OPEN_TAG.length);
      break;
    }
    thinking += rest.slice(open + OPEN_TAG.length, closeStart);
    rest = rest.slice(closeStart + CLOSE_TAG.length);
  }
  return {
    thinking: thinking.trim(),
    content: content.trim(),
  };
}

/**
 * Streaming splitter. Feed raw chunks via push(); it buffers any trailing
 * partial tag (e.g. "<thi") so false positives never leak to display.
 * finish() flushes remaining buffer.
 */
export class ThinkStreamSplitter {
  private buffer = "";
  private insideThink = false;

  /** Feed one raw chunk; returns deltas safe to display/speak. */
  push(chunk: string): ThinkDelta {
    this.buffer += chunk;
    return this.process(false);
  }

  /** Flush at end of stream; call once after last push(). */
  finish(): ThinkDelta {
    return this.process(true);
  }

  private process(final: boolean): ThinkDelta {
    let contentOut = "";
    let thinkingOut = "";

    for (;;) {
      if (this.insideThink) {
        const close = this.buffer.indexOf(CLOSE_TAG);
        if (close !== -1) {
          thinkingOut += this.buffer.slice(0, close);
          this.buffer = this.buffer.slice(close + CLOSE_TAG.length);
          this.insideThink = false;
          continue;
        }
        // Emit what we can; hold back possible partial close tag
        if (final) {
          thinkingOut += this.buffer;
          this.buffer = "";
        } else {
          const keep = partialSuffixLength(this.buffer, CLOSE_TAG);
          const emit = this.buffer.slice(0, this.buffer.length - keep);
          thinkingOut += emit;
          this.buffer = this.buffer.slice(emit.length);
        }
        break;
      } else {
        const open = this.buffer.indexOf(OPEN_TAG);
        if (open !== -1) {
          contentOut += this.buffer.slice(0, open);
          this.buffer = this.buffer.slice(open + OPEN_TAG.length);
          this.insideThink = true;
          continue;
        }
        if (final) {
          contentOut += this.buffer;
          this.buffer = "";
        } else {
          const keep = partialSuffixLength(this.buffer, OPEN_TAG);
          const emit = this.buffer.slice(0, this.buffer.length - keep);
          if (emit.length > 0) {
            contentOut += emit;
            this.buffer = this.buffer.slice(emit.length);
          }
        }
        break;
      }
    }

    return { content: contentOut, thinking: thinkingOut };
  }
}

/** Length of the longest suffix of `text` that is a prefix of `tag`. */
function partialSuffixLength(text: string, tag: string): number {
  const max = Math.min(text.length, tag.length - 1);
  for (let len = max; len > 0; len--) {
    if (text.endsWith(tag.slice(0, len))) return len;
  }
  return 0;
}
