import { useState } from "react";
import { Button } from "../ui";
import { setHtmlInputValue } from "../../babylon/xr/HtmlPanelInput";

/** Text entry into the original focused HTML control when no system keyboard is available. */
export function XrKeyboard({
  input,
  onClose,
}: {
  input: HTMLInputElement | HTMLTextAreaElement;
  onClose: () => void;
}) {
  const [shift, setShift] = useState(false);
  const insert = (text: string, backspace = false) => {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const from = backspace && start === end ? Math.max(0, start - 1) : start;
    const next = input.value.slice(0, from) + text + input.value.slice(end);
    setHtmlInputValue(input, next);
    input.focus({ preventScroll: true });
    if (
      ["text", "search", "url", "email", "password"].includes(input.type) ||
      input instanceof HTMLTextAreaElement
    )
      input.setSelectionRange(from + text.length, from + text.length);
  };
  return (
    <div
      className="absolute inset-x-2 bottom-2 z-[20000] rounded-xl bg-black/90 p-2 text-white"
      aria-label="VR keyboard"
    >
      {["1234567890", "qwertyuiop", "asdfghjkl", "zxcvbnm,./"].map((row) => (
        <div key={row} className="mb-1 flex justify-center gap-1">
          {[...row].map((key) => (
            <Button
              key={key}
              className="min-h-9 min-w-8 flex-1"
              onClick={() => insert(shift ? key.toUpperCase() : key)}
            >
              {shift ? key.toUpperCase() : key}
            </Button>
          ))}
        </div>
      ))}
      <div className="flex gap-1">
        <Button onClick={() => setShift(!shift)} aria-pressed={shift}>
          Shift
        </Button>
        <Button className="flex-1" onClick={() => insert(" ")}>
          Space
        </Button>
        <Button onClick={() => insert("", true)}>⌫</Button>
        <Button onClick={onClose}>Done</Button>
      </div>
    </div>
  );
}
