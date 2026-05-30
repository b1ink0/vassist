import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../utils/cn";

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
}

const Button = ({
  variant,
  size,
  className,
  children,
  ...props
}: ButtonProps) => (
  <button
    className={cn(buttonVariants({ variant, size }), className)}
    {...props}
  >
    {children}
  </button>
);

export { Button, buttonVariants };
export default Button;
