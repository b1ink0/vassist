import type { HTMLAttributes, FocusEventHandler } from "react";
import { Slider } from "@base-ui/react/slider";
import { cn } from "../../utils/cn";

interface RangeSliderProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "defaultValue" | "onChange" | "onBlur" | "onFocus"
> {
  value?: number;
  defaultValue?: number;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  name?: string;
  disabled?: boolean;
  onValueChange: (value: number) => void;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  onFocus?: FocusEventHandler<HTMLInputElement>;
}

/** Shared visual and keyboard behavior for settings ranges. */
export default function RangeSlider({
  value,
  defaultValue,
  min = 0,
  max = 100,
  step = 1,
  onValueChange,
  onBlur,
  onFocus,
  className,
  "aria-label": label,
  "aria-labelledby": labelledBy,
  tabIndex,
  ...props
}: RangeSliderProps) {
  return (
    <Slider.Root
      {...props}
      min={Number(min)}
      max={Number(max)}
      step={Number(step)}
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      className={cn("settings-range min-w-0 w-full", className)}
    >
      <Slider.Control className="flex h-9 w-full touch-none items-center px-2">
        <Slider.Track className="h-1.5 w-full rounded-full bg-current/10">
          <Slider.Indicator className="h-full rounded-full bg-current/45" />
          <Slider.Thumb
            onBlur={onBlur}
            onFocus={onFocus}
            tabIndex={tabIndex}
            aria-label={label}
            aria-labelledby={labelledBy}
            className="size-4 rounded-full border border-current/20 bg-current shadow-sm outline-none transition-shadow hover:shadow-[0_0_0_4px_#8882] focus-visible:shadow-[0_0_0_4px_#8883]"
          />
        </Slider.Track>
      </Slider.Control>
    </Slider.Root>
  );
}
