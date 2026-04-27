import { cn } from '../../utils/cn';

const SettingsRow = ({ label, description, className, children }) => (
  <div className={cn('flex items-center justify-between gap-3', className)}>
    <div className="flex-1 min-w-0">
      <span className="text-sm text-white font-medium">{label}</span>
      {description && (
        <p className="text-xs text-white/50 mt-0.5">{description}</p>
      )}
    </div>
    {children}
  </div>
);

export default SettingsRow;
