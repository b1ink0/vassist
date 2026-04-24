import { cva } from 'class-variance-authority';
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

/**
 * Select component.
 *
 * Pass options via the `options` prop as an array of `{ value, label, disabled? }`.
 * For grouped options, use the `groups` prop: `[{ label, options: [{value, label}] }]`.
 * Do NOT pass <option> children — define data in the parent and pass it down.
 *
 * @param {Array<{value: string|number, label: string, disabled?: boolean}>} [options]
 * @param {Array<{label: string, options: Array<{value: string|number, label: string, disabled?: boolean}>}>} [groups]
 */
const Select = ({ variant, className, options, groups, ...props }) => (
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
