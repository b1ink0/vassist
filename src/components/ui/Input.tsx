import { cva, type VariantProps } from 'class-variance-authority';
import type { InputHTMLAttributes } from 'react';
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

type NativeInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>;

interface InputProps extends NativeInputProps {
  variant?: VariantProps<typeof inputVariants>['variant'];
  size?: VariantProps<typeof inputVariants>['size'];
  htmlSize?: number;
  className?: string;
}

const Input = ({ variant, size, htmlSize, className, ...props }: InputProps) => (
  <input size={htmlSize} className={cn(inputVariants({ variant, size }), className)} {...props} />
);

export default Input;
