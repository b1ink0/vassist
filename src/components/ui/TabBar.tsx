import { cva } from 'class-variance-authority';
import { cn } from '../../utils/cn';

const tabButtonVariants = cva(
  'flex-1 font-medium transition-all duration-300 ease-out',
  {
    variants: {
      size: {
        default: 'py-2 md:py-3 text-sm',
        compact: 'py-1.5 md:py-2 text-xs',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  }
);

const TabBar = ({ tabs, activeTab, onTabChange, tabsRef, size = 'default' }) => (
  <div className="flex border-b border-white/20 relative">
    {tabs.map(({ id, label }) => (
      <button
        key={id}
        ref={tabsRef ? (el) => {
          const target = tabsRef.current ?? tabsRef;
          if (target && typeof target === 'object') {
            target[id] = el;
          }
        } : undefined}
        className={cn(
          tabButtonVariants({ size }),
          activeTab === id ? 'text-white' : 'text-white/60 hover:text-white/90'
        )}
        onClick={() => onTabChange(id)}
      >
        {label}
      </button>
    ))}
  </div>
);

export default TabBar;
