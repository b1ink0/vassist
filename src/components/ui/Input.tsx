import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, useEffect, useMemo, useState, type ChangeEvent, type ChangeEventHandler, type FocusEventHandler, type InputHTMLAttributes } from 'react';
import { cn } from '../../utils/cn';
import { createDebouncedFunction } from '../../utils/debounce';

const inputVariants = cva(
  'glass-input w-full',
  {
    variants: {
      variant: {
        default: '',
        dark:    'glass-input-dark',
      },
      size: {
        default: '',
        xs:      'text-xs',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

type NativeInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>;

interface InputProps extends NativeInputProps {
  variant?: VariantProps<typeof inputVariants>['variant'];
  size?: VariantProps<typeof inputVariants>['size'];
  htmlSize?: number;
  debounceMs?: number;
  disableDebounce?: boolean;
  className?: string;
}

const DEBOUNCE_ELIGIBLE_TYPES = new Set(['text', 'search', 'url', 'email', 'password', 'tel']);

const Input = forwardRef<HTMLInputElement, InputProps>(({
  variant,
  size,
  htmlSize,
  className,
  debounceMs = 150,
  disableDebounce = false,
  value,
  defaultValue,
  type = 'text',
  onChange,
  onBlur,
  ...props
}, ref) => {
  const isDebounceEligibleType = DEBOUNCE_ELIGIBLE_TYPES.has(type);
  const isControlled = value !== undefined;
  const shouldDebounce = !disableDebounce && isControlled && isDebounceEligibleType && typeof onChange === 'function';

  const initialValue = value ?? defaultValue ?? '';
  const [localValue, setLocalValue] = useState(String(initialValue));

  useEffect(() => {
    if (!shouldDebounce) {
      return;
    }
    setLocalValue(String(value ?? ''));
  }, [shouldDebounce, value]);

  const debouncedNotifyChange = useMemo(() => createDebouncedFunction((nextValue: string) => {
    if (!onChange) {
      return;
    }

    onChange({
      target: { value: nextValue },
      currentTarget: { value: nextValue },
    } as unknown as ChangeEvent<HTMLInputElement>);
  }, debounceMs), [debounceMs, onChange]);

  useEffect(() => () => debouncedNotifyChange.cancel(), [debouncedNotifyChange]);

  const handleChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    if (!shouldDebounce || !onChange) {
      onChange?.(event);
      return;
    }

    const nextValue = event.target.value;
    setLocalValue(nextValue);
    debouncedNotifyChange(nextValue);
  };

  const handleBlur: FocusEventHandler<HTMLInputElement> = (event) => {
    if (shouldDebounce) {
      debouncedNotifyChange.flush();
    }
    onBlur?.(event);
  };

  return (
    <input
      ref={ref}
      type={type}
      size={htmlSize}
      className={cn(inputVariants({ variant, size }), className)}
      value={shouldDebounce ? localValue : value}
      defaultValue={shouldDebounce ? undefined : defaultValue}
      onChange={handleChange}
      onBlur={handleBlur}
      {...props}
    />
  );
});

Input.displayName = 'Input';

export default Input;
