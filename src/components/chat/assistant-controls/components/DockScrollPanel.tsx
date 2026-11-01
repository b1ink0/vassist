import {
  useRef,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { Card } from "../../../ui";
import { ScrollEdgeBlur } from "../../../common/ScrollEdgeBlur";
import { cn } from "../../../../utils/cn";
import { useXrRuntime } from "../../../../contexts/XrRuntimeContext";

interface Props extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  progressive: boolean;
  padding: "none";
  variant: "none";
  style: CSSProperties;
}

export function DockScrollPanel({
  children,
  progressive,
  className,
  style,
  padding,
  variant,
  ...props
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { active } = useXrRuntime();
  if (!progressive || active)
    return (
      <Card
        {...props}
        className={cn(className)}
        style={style}
        padding={padding}
        variant={variant}
      >
        {children}
      </Card>
    );
  return (
    <div {...props} className="fixed w-[135px]" style={style}>
      <div
        ref={scrollRef}
        className={cn(
          "rounded-lg border bg-transparent border-transparent",
          className,
          "relative vassist-progressive-list",
        )}
        style={{ maxHeight: "inherit" }}
      >
        {children}
      </div>
      <ScrollEdgeBlur scrollRef={scrollRef} fadeItems />
    </div>
  );
}
