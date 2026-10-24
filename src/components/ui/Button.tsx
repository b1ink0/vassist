import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../../utils/cn";
import { Tooltip, type TooltipVariant } from "./Tooltip";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        default: "glass-button rounded-lg",
        dark: "glass-button glass-button-dark rounded-lg",
        ghost: "rounded-lg vassist-ghost-button",
        unstyled: "",
        error: "glass-error rounded-lg",
        link: "underline-offset-4 hover:underline vassist-link-button",
      },
      size: {
        default: "px-4 py-2 text-sm",
        sm: "px-2 py-1.5 text-xs",
        icon: "w-8 h-8 flex-shrink-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

interface ButtonProps
  extends
    ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  className?: string;
  children?: ReactNode;
  tooltipVariant?: TooltipVariant;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, className, children, title, tooltipVariant, ...props },
  ref,
) {
  const button = (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {children}
    </button>
  );

  return (
    <Tooltip
      content={title}
      variant={tooltipVariant ?? (variant === "dark" ? "dark" : "default")}
    >
      {button}
    </Tooltip>
  );
});

export { Button, buttonVariants };
export default Button;
