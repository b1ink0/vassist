import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { Select as BaseSelect } from '@base-ui/react/select';
import type { SelectHTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

const selectVariants = cva('glass-input w-full min-h-[36px] pr-11 text-left', {
  variants: {
    variant: {
      default: '',
      dark:    'glass-input-dark',
    },
  },
  defaultVariants: { variant: 'default' },
});

interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

interface SelectGroup {
  label: string;
  options: SelectOption[];
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'>, VariantProps<typeof selectVariants> {
  className?: string;
  options?: SelectOption[];
  groups?: SelectGroup[];
  placeholder?: string;
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
}

const Select = ({
  variant,
  className,
  options,
  groups,
  value,
  defaultValue,
  placeholder,
  disabled,
  name,
  required,
  onChange,
}: SelectProps) => {
  const grouped = Array.isArray(groups) && groups.length > 0;
  const optionItems = React.useMemo(() => {
    if (grouped) {
      return groups.flatMap((group) => group.options);
    }
    return options || [];
  }, [grouped, groups, options]);

  const isControlled = value !== undefined;
  const initialValue = String(defaultValue ?? value ?? optionItems[0]?.value ?? '');
  const [internalValue, setInternalValue] = React.useState(initialValue);

  React.useEffect(() => {
    if (!isControlled) {
      return;
    }
    setInternalValue(String(value ?? ''));
  }, [isControlled, value]);

  const selectedValue = isControlled ? String(value ?? '') : internalValue;

  const triggerChange = (nextValue: string | null): void => {
    const resolvedValue = nextValue ?? '';

    if (!isControlled) {
      setInternalValue(resolvedValue);
    }

    if (!onChange) {
      return;
    }

    const syntheticEvent = {
      target: { value: resolvedValue },
      currentTarget: { value: resolvedValue },
    } as unknown as React.ChangeEvent<HTMLSelectElement>;

    onChange(syntheticEvent);
  };

  const textClass = variant === 'dark' ? 'glass-text' : 'glass-text-black';

  return (
    <BaseSelect.Root
      value={selectedValue || undefined}
      onValueChange={triggerChange}
      disabled={disabled}
      name={name}
      required={required}
    >
      <BaseSelect.Trigger className={cn(selectVariants({ variant }), 'relative', className)}>
        <BaseSelect.Value
          className={cn('block truncate pr-2', textClass)}
          placeholder={placeholder || 'Select'}
        />
        <BaseSelect.Icon className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/70">
          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
            <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </BaseSelect.Icon>
      </BaseSelect.Trigger>

      <BaseSelect.Portal>
        <BaseSelect.Positioner sideOffset={8} align="center" alignItemWithTrigger={false} className="z-[10040] outline-none">
          <BaseSelect.Popup className="glass-container rounded-xl border border-white/15 p-1 shadow-xl backdrop-blur-[12px]">
            <BaseSelect.ScrollUpArrow className="flex h-5 items-center justify-center text-white/50">
              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
                <path d="M6 12l4-4 4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </BaseSelect.ScrollUpArrow>
            <BaseSelect.List className="max-h-64 min-w-[var(--anchor-width)] overflow-y-auto py-1 scrollbar-glass">
              {grouped
                ? groups.map((group) => (
                    <React.Fragment key={group.label}>
                      <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/45">
                        {group.label}
                      </div>
                      {group.options.map((opt) => (
                        <BaseSelect.Item
                          key={`${group.label}-${opt.value}`}
                          value={String(opt.value)}
                          disabled={opt.disabled}
                          className="group flex cursor-default items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-white/85 outline-none transition-colors data-[highlighted]:bg-white/10 data-[disabled]:opacity-40"
                        >
                          <BaseSelect.ItemIndicator className="w-4 text-white/75">
                            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
                              <path d="M5 10l3 3 7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </BaseSelect.ItemIndicator>
                          <BaseSelect.ItemText className="truncate">{opt.label}</BaseSelect.ItemText>
                        </BaseSelect.Item>
                      ))}
                    </React.Fragment>
                  ))
                : optionItems.map((opt) => (
                    <BaseSelect.Item
                      key={opt.value}
                      value={String(opt.value)}
                      disabled={opt.disabled}
                      className="group flex cursor-default items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-white/85 outline-none transition-colors data-[highlighted]:bg-white/10 data-[disabled]:opacity-40"
                    >
                      <BaseSelect.ItemIndicator className="w-4 text-white/75">
                        <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
                          <path d="M5 10l3 3 7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </BaseSelect.ItemIndicator>
                      <BaseSelect.ItemText className="truncate">{opt.label}</BaseSelect.ItemText>
                    </BaseSelect.Item>
                  ))}
            </BaseSelect.List>
            <BaseSelect.ScrollDownArrow className="flex h-5 items-center justify-center text-white/50">
              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
                <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </BaseSelect.ScrollDownArrow>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
};

export default Select;
