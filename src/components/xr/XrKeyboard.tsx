import { useState } from "react";
import { LuArrowBigUp, LuDelete, LuCornerDownLeft, LuX } from "react-icons/lu";
import { Button } from "../ui";
import { setHtmlInputValue } from "../../babylon/xr/HtmlPanelInput";

export function XrKeyboard({
  input,
  onClose,
}: {
  input: HTMLInputElement | HTMLTextAreaElement;
  onClose: () => void;
}) {
  const [shift, setShift] = useState(false);
  const [symbols, setSymbols] = useState(false);
  const insert = (text: string, backspace = false) => {
    if (!input.isConnected || input.disabled || input.readOnly) return;
    const supportsSelection =
      input instanceof HTMLTextAreaElement ||
      ["text", "search", "url", "email", "password"].includes(input.type);
    const start = supportsSelection
      ? (input.selectionStart ?? input.value.length)
      : input.value.length;
    const end = supportsSelection ? (input.selectionEnd ?? start) : start;
    const from =
      backspace && start === end
        ? start - (Array.from(input.value.slice(0, start)).pop()?.length ?? 0)
        : start;
    setHtmlInputValue(
      input,
      input.value.slice(0, from) + text + input.value.slice(end),
    );
    input.focus({ preventScroll: true });
    if (supportsSelection)
      input.setSelectionRange(from + text.length, from + text.length);
    if (text && shift) setShift(false);
  };
  const rows = symbols
    ? ["1234567890", "@#$%&*()-+", "!?/\\:;\"'", "_=[]{}<>"]
    : ["1234567890", "qwertyuiop", "asdfghjkl", "zxcvbnm"];
  const keyClass =
    "glass-button h-14 min-w-0 flex-1 rounded-xl text-lg font-medium";
  return (
    <div
      aria-label="VR keyboard"
      className="glass-container absolute inset-2 rounded-3xl p-4 text-[var(--vassist-text-primary)]"
    >
      <div className="mb-3 flex h-8 items-center justify-between pr-12 text-sm text-[var(--vassist-text-secondary)]">
        <span>Keyboard</span>
        <Button
          variant="ghost"
          className="h-8 w-8 rounded-full"
          onClick={onClose}
          aria-label="Close keyboard"
        >
          <LuX size={18} />
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        {rows.map((row) => (
          <div key={row} className="flex justify-center gap-2">
            {Array.from(row, (key) => (
              <Button
                key={key}
                variant="unstyled"
                className={keyClass}
                onClick={() => insert(shift ? key.toUpperCase() : key)}
              >
                {shift ? key.toUpperCase() : key}
              </Button>
            ))}
          </div>
        ))}
        <div className="flex gap-2">
          <Button
            variant="unstyled"
            className={`${keyClass} max-w-20`}
            onClick={() => setSymbols(!symbols)}
            aria-label="Switch symbols"
          >
            {symbols ? "ABC" : "?123"}
          </Button>
          <Button
            variant="unstyled"
            className={`${keyClass} max-w-20`}
            onClick={() => setShift(!shift)}
            aria-label="Shift"
            aria-pressed={shift}
          >
            <LuArrowBigUp size={21} />
          </Button>
          <Button
            variant="unstyled"
            className={`${keyClass} max-w-16`}
            onClick={() => insert(",")}
          >
            ,
          </Button>
          <Button
            variant="unstyled"
            className={`${keyClass} flex-[4]`}
            onClick={() => insert(" ")}
          >
            Space
          </Button>
          <Button
            variant="unstyled"
            className={`${keyClass} max-w-16`}
            onClick={() => insert(".")}
          >
            .
          </Button>
          <Button
            variant="unstyled"
            className={`${keyClass} max-w-20`}
            onClick={() => insert("", true)}
            aria-label="Backspace"
          >
            <LuDelete size={21} />
          </Button>
          <Button
            variant="unstyled"
            className={`${keyClass} max-w-20`}
            onClick={() =>
              input instanceof HTMLTextAreaElement ? insert("\n") : onClose()
            }
            aria-label={
              input instanceof HTMLTextAreaElement ? "New line" : "Done"
            }
          >
            <LuCornerDownLeft size={21} />
          </Button>
        </div>
      </div>
    </div>
  );
}
