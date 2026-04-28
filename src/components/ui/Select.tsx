import { cva, type VariantProps } from 'class-variance-authority';
import type { SelectHTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

const selectVariants = cva('glass-input w-full', {
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

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement>, VariantProps<typeof selectVariants> {
  className?: string;
  options?: SelectOption[];
  groups?: SelectGroup[];
}

const Select = ({ variant, className, options, groups, ...props }: SelectProps) => (
  <select className={cn(selectVariants({ variant }), className)} {...props}>
    {groups
      ? groups.map((group) => (
          <optgroup key={group.label} label={group.label} className="bg-gray-800">
            {group.options.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled} className="bg-gray-900">
                {opt.label}
              </option>
            ))}
          </optgroup>
        ))
      : (options || []).map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled} className="bg-gray-900">
            {opt.label}
          </option>
        ))}
  </select>
);

export default Select;
