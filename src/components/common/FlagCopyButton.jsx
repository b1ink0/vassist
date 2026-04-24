import { useState } from 'react';
import { Icon } from '../icons';
import { cn } from '../../utils/cn';

const FlagCopyButton = ({ flagUrl, flagValue }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(flagUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-start gap-2 p-2 bg-white/5 rounded border border-white/10">
      <Icon name="flag" size={14} className="text-white/80 mt-1 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <code className="text-xs text-white/70 break-all block">{flagUrl}</code>
        <p className="text-[10px] text-white/60 mt-1">
          Set to: <span className="text-white/80">{flagValue}</span>
        </p>
      </div>
      <button
        onClick={handleCopy}
        className={cn(
          'flex-shrink-0 px-2 py-1 rounded border border-white/20 transition-colors',
          'bg-white/10 hover:bg-white/20'
        )}
        title="Copy flag URL"
      >
        <Icon
          name={copied ? 'check' : 'copy'}
          size={14}
          className={copied ? 'text-white' : 'text-white/80'}
        />
      </button>
    </div>
  );
};

export default FlagCopyButton;
