import { useId } from "react";
import { thinkingEffortOptions } from "../../config/aiConfig";

const options = [
  { value: "off", label: "Off" },
  ...thinkingEffortOptions.map((option) => ({
    ...option,
    value: option.value || "auto",
  })),
];

export default function ThinkingControl({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const name = useId();
  return (
    <fieldset className="flex min-w-0 flex-col gap-2 py-2">
      <legend className="sr-only">Thinking effort</legend>
      <div className="flex items-center justify-between px-1 text-xs">
        <span className="font-medium">Thinking</span>
        <span className="opacity-50">
          {value === "off" ? "Direct response" : "More depth"}
        </span>
      </div>
      <div className="flex min-w-0 items-center gap-0.5 rounded-xl bg-current/5 p-0.5">
        {options.map((option) => (
          <label
            key={option.value}
            className="min-w-0 flex-1 cursor-pointer text-center"
          >
            <input
              type="radio"
              name={name}
              aria-label={
                option.value === "off"
                  ? "Thinking off"
                  : option.value === "auto"
                    ? "Thinking auto"
                    : option.label + " thinking effort"
              }
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span className="block rounded-lg py-1.5 text-[10px] font-medium opacity-55 transition-colors hover:bg-current/10 peer-checked:bg-current/15 peer-checked:opacity-100 peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-offset-2">
              {option.label === "Medium" ? "Med" : option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
