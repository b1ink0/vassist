import { cva, type VariantProps } from "class-variance-authority";
import type { MutableRefObject } from "react";
import { cn } from "../../utils/cn";

const tabButtonVariants = cva(
  "flex-1 font-medium transition-all duration-300 ease-out",
  {
    variants: {
      size: {
        default: "py-2 md:py-3 text-sm",
        compact: "py-1.5 md:py-2 text-xs",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

interface TabItem {
  id: string;
  label: string;
}

type TabRefs = Record<string, HTMLButtonElement | null>;

interface TabBarProps {
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  tabsRef?: MutableRefObject<TabRefs>;
  size?: VariantProps<typeof tabButtonVariants>["size"];
}

const TabBar = ({
  tabs,
  activeTab,
  onTabChange,
  tabsRef,
  size = "default",
}: TabBarProps) => (
  <div className="flex border-b border-white/20 relative">
    {tabs.map(({ id, label }) => (
      <button
        key={id}
        ref={
          tabsRef
            ? (el) => {
                const target = tabsRef.current;
                if (target) {
                  target[id] = el;
                }
              }
            : undefined
        }
        className={cn(
          tabButtonVariants({ size }),
          activeTab === id ? "text-white" : "text-white/60 hover:text-white/90",
        )}
        type="button"
        onClick={() => onTabChange(id)}
      >
        {label}
      </button>
    ))}
  </div>
);

export default TabBar;
