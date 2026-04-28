/**
 * Shared provider selection component for setup wizard
 * Used in LLMProviderStep, TTSProviderStep, and STTProviderStep
 * 
 * @param {Object} props
 * @param {Array} props.providers - Array of provider objects
 * @param {string} props.selectedProvider - Currently selected provider ID
 * @param {Function} props.onProviderSelect - Callback when provider is selected
 * @param {boolean} props.isLightBackground - Whether the background is light
 * @param {boolean} props.compact - Use compact layout (default: false)
 * @param {boolean} props.showProsCons - Show pros/cons (default: false)
 */
import { Icon } from '../../icons';
import { Badge } from '../../ui';
import { cn } from '../../../utils/cn';

interface ProviderItem {
  id: string;
  name: string;
  description: string;
  iconName?: string;
  icon?: string;
  recommended?: boolean;
  available?: boolean;
  requirements?: string;
  pros?: string[];
  cons?: string[];
}

interface ProviderSelectionProps {
  providers: ProviderItem[];
  selectedProvider: string;
  onProviderSelect: (providerId: string) => void;
  isLightBackground?: boolean;
  compact?: boolean;
  showProsCons?: boolean;
}

const ProviderSelection = ({ 
  providers, 
  selectedProvider, 
  onProviderSelect,
  isLightBackground = false,
  compact = false,
  showProsCons = false
}: ProviderSelectionProps) => {
  const textColor = isLightBackground ? 'text-gray-900' : 'text-white';
  const mutedColor = isLightBackground ? 'text-gray-700' : 'text-white/90';
  const subtleColor = isLightBackground ? 'text-gray-600' : 'text-white/80';

  return (
    <div className={compact ? "space-y-2" : "space-y-4"}>
      {providers.map((provider) => {
        const available = provider.available !== undefined ? provider.available : true;
        
        return (
          <div
            key={provider.id}
            onClick={() => available && onProviderSelect(provider.id)}
            className={cn(
              'rounded-lg transition-all duration-300 border-2',
              compact ? 'p-2 sm:p-3' : 'p-6',
              available ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed',
              selectedProvider === provider.id ? 'border-white/30 shadow-lg shadow-white/20' : 'border-white/10',
              available && 'hover:border-white/30'
            )}
          >
            <div className={cn('flex items-start', compact ? 'gap-2' : 'gap-4')}>
              {/* Icon */}
              <div className="flex-shrink-0">
                {provider.iconName ? (
                  <Icon name={provider.iconName} size={compact ? 20 : 40} className={mutedColor} />
                ) : (
                  <span className={cn(compact ? 'text-xl sm:text-2xl' : 'text-4xl')}>{provider.icon}</span>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Header with badges */}
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className={cn(compact ? 'text-sm sm:text-base' : 'text-xl', 'font-semibold', textColor)}>
                    {provider.name}
                  </h3>
                  {provider.recommended && (
                    <Badge variant="recommended" className={compact ? 'text-[10px] px-1.5 py-0.5' : undefined}>
                      Recommended
                    </Badge>
                  )}
                  {selectedProvider === provider.id && (
                    <Badge variant="selected" className={compact ? 'text-[10px] px-1.5 py-0.5' : undefined}>
                      Selected
                    </Badge>
                  )}
                  {!available && (
                    <Badge variant="unavailable" className={compact ? 'text-[10px] px-1.5 py-0.5' : undefined}>
                      Unavailable
                    </Badge>
                  )}
                </div>

                {/* Description */}
                <p className={cn(compact ? 'text-xs hidden sm:block' : 'text-base', mutedColor, compact ? 'mb-1' : 'mb-3')}>
                  {provider.description}
                </p>

                {/* Requirements */}
                {provider.requirements && (
                  <p className={cn(compact ? 'text-[10px] sm:text-xs' : 'text-sm', subtleColor, compact ? 'mb-1' : 'mb-3')}>
                    <strong>Requirements:</strong> {provider.requirements}
                  </p>
                )}

                {/* Pros and Cons (only if showProsCons is true) */}
                {showProsCons && (
                  <div className={cn('grid grid-cols-1 md:grid-cols-2', compact ? 'gap-2' : 'gap-4')}>
                    {/* Pros */}
                    {provider.pros && provider.pros.length > 0 && (
                      <div>
                        <p className={cn(compact ? 'text-[10px] sm:text-xs' : 'text-sm', 'font-semibold text-white/80 mb-1')}>Pros:</p>
                        <ul className={cn(compact ? 'text-[10px]' : 'text-xs', subtleColor, 'space-y-1')}>
                          {provider.pros.map((pro: string, idx: number) => (
                            <li key={idx} className="flex items-start gap-1.5">
                              <Icon name="check" size={10} className="text-white/80 mt-0.5 flex-shrink-0" />
                              <span>{pro}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Cons */}
                    {provider.cons && provider.cons.length > 0 && (
                      <div>
                        <p className={cn(compact ? 'text-[10px] sm:text-xs' : 'text-sm', 'font-semibold text-white/80 mb-1')}>Cons:</p>
                        <ul className={cn(compact ? 'text-[10px]' : 'text-xs', subtleColor, 'space-y-1')}>
                          {provider.cons.map((con: string, idx: number) => (
                            <li key={idx} className="flex items-start gap-1.5">
                              <Icon name="warning" size={10} className="text-white/80 mt-0.5 flex-shrink-0" />
                              <span>{con}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ProviderSelection;
