import { cva } from 'class-variance-authority';
import { cn } from '../../utils/cn';

const cardVariants = cva(
  'rounded-lg border',
  {
    variants: {
      variant: {
        default:  'bg-white/5 border-white/10',
        elevated: 'bg-white/10 border-white/20',
      },
      padding: {
        default: 'p-3',
        md:      'p-4',
        none:    '',
      },
    },
    defaultVariants: { variant: 'default', padding: 'default' },
  }
);

const Card = ({ variant, padding, className, children, ...props }) => (
  <div className={cn(cardVariants({ variant, padding }), className)} {...props}>
    {children}
  </div>
);

export default Card;
