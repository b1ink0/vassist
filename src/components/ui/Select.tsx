import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { Select as BaseSelect } from '@base-ui/react/select';
import type { SelectHTMLAttributes } from 'react';
import { Icon } from '../icons';
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

type SelectTriggerRender = React.ComponentProps<typeof BaseSelect.Trigger>['render'];
type SelectSide = React.ComponentProps<typeof BaseSelect.Positioner>['side'];
type SelectAlign = React.ComponentProps<typeof BaseSelect.Positioner>['align'];

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'>, VariantProps<typeof selectVariants> {
  className?: string;
  options?: SelectOption[];
  groups?: SelectGroup[];
  placeholder?: string;
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  trigger?: SelectTriggerRender;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: SelectSide;
  align?: SelectAlign;
  sideOffset?: number;
  positionerClassName?: string;
  popupClassName?: string;
  listClassName?: string;
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
  trigger,
  open,
  defaultOpen,
  onOpenChange,
  side = 'bottom',
  align = 'center',
  sideOffset = 8,
  positionerClassName,
  popupClassName,
  listClassName,
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
  const triggerClassName = trigger ? className : cn(selectVariants({ variant }), 'relative', className);

  return (
    <BaseSelect.Root
      value={selectedValue || undefined}
      onValueChange={triggerChange}
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={(nextOpen) => onOpenChange?.(nextOpen)}
      disabled={disabled}
      name={name}
      required={required}
    >
      <BaseSelect.Trigger className={triggerClassName} render={trigger}>
        {!trigger && (
          <>
            <BaseSelect.Value
              className={cn('block truncate pr-2', textClass)}
              placeholder={placeholder || 'Select'}
            />
            <BaseSelect.Icon className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/70">
              <Icon name="chevron-down" size={16} />
            </BaseSelect.Icon>
          </>
        )}
      </BaseSelect.Trigger>

      <BaseSelect.Portal>
        <BaseSelect.Positioner side={side} sideOffset={sideOffset} align={align} alignItemWithTrigger={false} className={cn('z-[10040] outline-none', positionerClassName)}>
          <BaseSelect.Popup className={cn('glass-container rounded-xl border border-white/15 p-1 shadow-xl backdrop-blur-[12px]', popupClassName)}>
            <BaseSelect.ScrollUpArrow className="flex h-5 items-center justify-center text-white/50">
              <Icon name="chevron-up" size={16} />
            </BaseSelect.ScrollUpArrow>
            <BaseSelect.List className={cn('max-h-64 min-w-[var(--anchor-width)] overflow-y-auto scrollbar-glass', listClassName)}>
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
                            <Icon name="check" size={16} />
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
                      className="group flex cursor-default items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm text-white/85 outline-none transition-colors data-[highlighted]:bg-white/10 data-[disabled]:opacity-40"
                      >
                      <BaseSelect.ItemText className="truncate">{opt.label}</BaseSelect.ItemText>
                      <BaseSelect.ItemIndicator className="w-4 text-white/75">
                        <Icon name="check" size={16} />
                      </BaseSelect.ItemIndicator>
                    </BaseSelect.Item>
                  ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
};

export default Select;
