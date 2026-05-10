import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../utils/cn";

const cardVariants = cva("rounded-lg border", {
  variants: {
    variant: {
      default: "bg-white/5 border-white/10",
      elevated: "bg-white/10 border-white/20",
      none: "bg-transparent border-transparent",
    },
    padding: {
      default: "p-3",
      md: "p-4",
      none: "",
    },
  },
  defaultVariants: { variant: "default", padding: "default" },
});

interface CardProps
  extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {
  className?: string;
  children?: ReactNode;
}

const Card = ({
  variant,
  padding,
  className,
  children,
  ...props
}: CardProps) => (
  <div className={cn(cardVariants({ variant, padding }), className)} {...props}>
    {children}
  </div>
);

export default Card;
