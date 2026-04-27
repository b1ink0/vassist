import { cva } from 'class-variance-authority';
import { cn } from '../../utils/cn';

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

const Input = ({ variant, size, className, ...props }) => (
  <input className={cn(inputVariants({ variant, size }), className)} {...props} />
);

export default Input;
