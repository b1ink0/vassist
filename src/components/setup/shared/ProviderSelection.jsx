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
const ProviderSelection = ({ 
  providers, 
  selectedProvider, 
  onProviderSelect,
  isLightBackground = false,
  compact = false,
  showProsCons = false
}) => {
  const textColor = isLightBackground ? 'text-gray-900' : 'text-white';
  const mutedColor = isLightBackground ? 'text-gray-700' : 'text-white/90';
  const subtleColor = isLightBackground ? 'text-gray-600' : 'text-white/80';

  const isEmojiIcon = (icon) => {
    return icon && icon.length <= 2;
  };

  return (
    <div className={compact ? "space-y-2" : "space-y-4"}>
      {providers.map((provider) => {
        const available = provider.available !== undefined ? provider.available : true;
        
        return (
          <div
            key={provider.id}
            onClick={() => available && onProviderSelect(provider.id)}
            className={`
              rounded-lg transition-all duration-300
              ${compact ? 'p-2 sm:p-3' : 'p-6'}
              ${available ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'}
              ${selectedProvider === provider.id ? 'border-2 border-purple-400 shadow-lg shadow-purple-500/20' : 'border-2 border-white/10'}
              ${available ? 'hover:border-purple-400/50' : ''}
            `}
          >
            <div className={`flex items-start ${compact ? 'gap-2' : 'gap-4'}`}>
              {/* Icon */}
              <div className={`flex-shrink-0 ${compact ? 'text-xl sm:text-2xl' : 'text-4xl'}`}>
                {isEmojiIcon(provider.icon) ? (
                  <span>{provider.icon}</span>
                ) : (
                  <Icon name={provider.icon} size={compact ? 20 : 40} className={mutedColor} />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Header with badges */}
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className={`${compact ? 'text-sm sm:text-base' : 'text-xl'} font-semibold ${textColor}`}>
                    {provider.name}
                  </h3>
                  {provider.recommended && (
                    <span className={`${compact ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'} bg-green-500/20 text-green-300 rounded-full`}>
                      Recommended
                    </span>
                  )}
                  {selectedProvider === provider.id && (
                    <span className={`${compact ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'} bg-purple-500/20 text-purple-300 rounded-full`}>
                      Selected
                    </span>
                  )}
                  {!available && (
                    <span className={`${compact ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'} bg-yellow-500/20 text-yellow-300 rounded-full`}>
                      Unavailable
                    </span>
                  )}
                </div>

                {/* Description */}
                <p className={`${compact ? 'text-xs hidden sm:block' : 'text-base'} ${mutedColor} ${compact ? 'mb-1' : 'mb-3'}`}>
                  {provider.description}
                </p>

                {/* Requirements */}
                {provider.requirements && (
                  <p className={`${compact ? 'text-[10px] sm:text-xs' : 'text-sm'} ${subtleColor} ${compact ? 'mb-1' : 'mb-3'}`}>
                    <strong>Requirements:</strong> {provider.requirements}
                  </p>
                )}

                {/* Pros and Cons (only if showProsCons is true) */}
                {showProsCons && (
                  <div className={`grid grid-cols-1 md:grid-cols-2 ${compact ? 'gap-2' : 'gap-4'}`}>
                    {/* Pros */}
                    {provider.pros && provider.pros.length > 0 && (
                      <div>
                        <p className={`${compact ? 'text-[10px] sm:text-xs' : 'text-sm'} font-semibold text-green-400 mb-1`}>Pros:</p>
                        <ul className={`${compact ? 'text-[10px]' : 'text-xs'} ${subtleColor} space-y-1`}>
                          {provider.pros.map((pro, idx) => (
                            <li key={idx}>✓ {pro}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Cons */}
                    {provider.cons && provider.cons.length > 0 && (
                      <div>
                        <p className={`${compact ? 'text-[10px] sm:text-xs' : 'text-sm'} font-semibold text-yellow-400 mb-1`}>Cons:</p>
                        <ul className={`${compact ? 'text-[10px]' : 'text-xs'} ${subtleColor} space-y-1`}>
                          {provider.cons.map((con, idx) => (
                            <li key={idx}>⚠ {con}</li>
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
