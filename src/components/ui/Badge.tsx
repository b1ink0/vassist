import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

const badgeVariants = cva("text-[10px] px-1.5 py-0.5 rounded-full", {
  variants: {
    variant: {
      recommended: "bg-white/10 text-white/80",
      selected: "bg-white/10 text-white/70",
      unavailable: "bg-white/5  text-white/50",
      neutral: "bg-white/10 text-white/70",
    },
  },
  defaultVariants: { variant: "neutral" },
});

interface BadgeProps extends VariantProps<typeof badgeVariants> {
  className?: string | undefined;
  children: ReactNode;
}

const Badge = ({ variant, className, children }: BadgeProps) => (
  <span className={cn(badgeVariants({ variant }), className)}>{children}</span>
);

export default Badge;
