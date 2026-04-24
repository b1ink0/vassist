import { cn } from '../../utils/cn';

const TabBar = ({ tabs, activeTab, onTabChange, tabsRef }) => (
  <div className="flex border-b border-white/20 relative">
    {tabs.map(({ id, label }) => (
      <button
        key={id}
        ref={tabsRef ? (el) => { tabsRef.current[id] = el; } : undefined}
        className={cn(
          'flex-1 py-2 md:py-3 text-sm font-medium transition-all duration-300 ease-out',
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
