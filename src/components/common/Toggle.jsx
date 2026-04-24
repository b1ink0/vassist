import { cn } from '../../utils/cn';

const Toggle = ({ checked, onChange, disabled = false }) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        'relative inline-flex h-4 w-8 items-center rounded-full',
        'transition-all duration-300 ease-in-out border border-white/20',
        'bg-white/10 backdrop-blur-xl',
        disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer hover:bg-white/15'
      )}
    >
      <span
        className={cn(
          'inline-block h-2.5 w-2.5 transform rounded-full',
          'transition-all duration-300 ease-in-out',
          checked ? 'translate-x-[18px] bg-white/80' : 'translate-x-[2px] bg-white/40'
        )}
      />
    </button>
  );
};

export default Toggle;
