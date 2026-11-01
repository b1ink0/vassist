import { cn } from "../../utils/cn";
import type { ButtonHTMLAttributes } from "react";
import { Tooltip } from "../ui/Tooltip";

interface ToggleProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onChange"
> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "default" | "lg" | string;
  isLightBackground?: boolean;
}

const Toggle = ({
  checked,
  onChange,
  disabled = false,
  size: _size,
  isLightBackground: _isLightBackground,
  title,
  className,
  ...props
}: ToggleProps) => {
  return (
    <Tooltip content={title} variant={_isLightBackground ? "dark" : "default"}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        {...props}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          "relative inline-flex h-4 w-8 items-center rounded-full shrink-0",
          "transition-all duration-300 ease-in-out border border-current/20",
          checked ? "bg-current/20" : "bg-current/5",
          disabled
            ? "opacity-30 cursor-not-allowed"
            : "cursor-pointer hover:bg-current/15",
          className,
        )}
      >
        <span
          className={cn(
            "inline-block h-2.5 w-2.5 transform rounded-full",
            "transition-all duration-300 ease-in-out",
            checked
              ? "translate-x-[18px] bg-current"
              : "translate-x-[2px] bg-current opacity-45",
          )}
        />
      </button>
    </Tooltip>
  );
};

export default Toggle;
