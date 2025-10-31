import { useState, useRef } from 'react';
import { useSetup } from '../../../contexts/SetupContext';
import { Icon } from '../../icons';
import Toggle from '../../common/Toggle';
import VirtualAssistant from '../../VirtualAssistant';
import { PositionPresets } from '../../../config/uiConfig';

const CharacterIntroStep = ({ isLightBackground = false }) => { // eslint-disable-line no-unused-vars
  const { setupData, updateSetupData } = useSetup();
  const normalRef = useRef(null);
  const portraitRef = useRef(null);
  
  // Character enabled state (on by default)
  const [characterEnabled, setCharacterEnabled] = useState(
    setupData?.ui?.enableModelLoading ?? true
  );
  
  // Display mode (normal or portrait)
  const [displayMode, setDisplayMode] = useState(
    setupData?.ui?.enablePortraitMode ? 'portrait' : 'normal'
  );
  
  // Position selection
  const [selectedPosition, setSelectedPosition] = useState(
    setupData?.ui?.position || 'bottom-right'
  );

  // Auto-save to setup data whenever values change
  const handleCharacterToggle = (enabled) => {
    setCharacterEnabled(enabled);
    const uiConfig = {
      enableModelLoading: enabled,
      enablePortraitMode: displayMode === 'portrait',
      position: selectedPosition,
      enableAIToolbar: setupData?.ui?.enableAIToolbar ?? true,
    };
    updateSetupData({ ui: uiConfig });
  };

  const handleDisplayModeChange = (mode) => {
    setDisplayMode(mode);
    const uiConfig = {
      enableModelLoading: characterEnabled,
      enablePortraitMode: mode === 'portrait',
      position: selectedPosition,
      enableAIToolbar: setupData?.ui?.enableAIToolbar ?? true,
    };
    updateSetupData({ ui: uiConfig });
  };

  const handlePositionChange = (position) => {
    setSelectedPosition(position);
    const uiConfig = {
      enableModelLoading: characterEnabled,
      enablePortraitMode: displayMode === 'portrait',
      position: position,
      enableAIToolbar: setupData?.ui?.enableAIToolbar ?? true,
    };
    updateSetupData({ ui: uiConfig });
  };

  // Position options
  const positions = [
    { key: 'bottom-right', icon: 'arrow-down-right', label: 'Bottom Right', description: 'Classic assistant position' },
    { key: 'bottom-left', icon: 'arrow-down-left', label: 'Bottom Left', description: 'Alternative corner' },
    { key: 'bottom-center', icon: 'arrow-down', label: 'Bottom Center', description: 'Centered at bottom' },
    { key: 'top-right', icon: 'arrow-up-right', label: 'Top Right', description: 'Upper corner' },
    { key: 'top-left', icon: 'arrow-up-left', label: 'Top Left', description: 'Upper left' },
    { key: 'top-center', icon: 'arrow-up', label: 'Top Center', description: 'Centered at top' },
    { key: 'center', icon: 'maximize', label: 'Center', description: 'Large centered view' },
    { key: 'last-location', icon: 'map-pin', label: 'Remember Position', description: 'Remember dragged position' }
  ];

  return (
    <div className="setup-step character-intro-step">
      <div className="step-header mb-8">
        <h2 className="text-3xl font-bold mb-2 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
          Virtual Companion
        </h2>
        <p className="text-white/90">
          Choose how you want to interact with your AI companion
        </p>
      </div>

      {/* Single Combined Panel */}
      <div className="rounded-xl p-6 mb-6 border border-white/10">
        {/* Enable/Disable Toggle at Top */}
        <div className="p-5 rounded-xl border-2 bg-white/5 border-white/10 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h4 className="text-base font-semibold text-white mb-1">
                Enable Virtual Companion
              </h4>
              <p className="text-xs text-white/60">
                Display an animated companion alongside your chat
              </p>
            </div>
            
            {/* Toggle Switch */}
            <Toggle
              checked={characterEnabled}
              onChange={handleCharacterToggle}
            />
          </div>
        </div>

        {characterEnabled ? (
          /* Character ENABLED - Show Display Mode + Position */
          <>
            {/* Display Mode Selection */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white mb-4">Display Mode</h3>
              <div className="grid grid-cols-1 gap-4">
                {/* Standard Mode */}
                <div 
                  className={`relative rounded-xl border-2 transition-all duration-300 cursor-pointer ${
                    displayMode === 'normal' 
                      ? 'border-purple-400 bg-purple-500/10' 
                      : 'border-white/10 bg-white/5 hover:border-white/20'
                  }`}
                  onClick={() => handleDisplayModeChange('normal')}
                >
                  {displayMode === 'normal' && (
                    <div className="absolute top-3 right-3 z-10">
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-500/90 border border-purple-400">
                        <Icon name="check" size={14} className="text-white" />
                        <span className="text-xs text-white font-medium">Selected</span>
                      </div>
                    </div>
                  )}

                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Icon name="maximize" size={20} className="text-purple-400" />
                      <h3 className="text-base font-semibold text-white">Standard Mode</h3>
                    </div>
                    
                    {/* Preview */}
                    <div className="aspect-video rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-white/10 overflow-hidden mb-3 relative">
                      <VirtualAssistant
                        ref={normalRef}
                        isPreview={true}
                        portraitMode={false}
                        previewWidth="100%"
                        previewHeight="100%"
                        previewClassName="rounded-lg"
                      />
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex items-start gap-2 text-white/80">
                        <Icon name="check" size={12} className="text-green-400 flex-shrink-0 mt-0.5" />
                        <span>Complete character visible</span>
                      </div>
                      <div className="flex items-start gap-2 text-white/80">
                        <Icon name="check" size={12} className="text-green-400 flex-shrink-0 mt-0.5" />
                        <span>Full range of animations</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Portrait Mode */}
                <div 
                  className={`relative rounded-xl border-2 transition-all duration-300 cursor-pointer ${
                    displayMode === 'portrait' 
                      ? 'border-blue-400 bg-blue-500/10' 
                      : 'border-white/10 bg-white/5 hover:border-white/20'
                  }`}
                  onClick={() => handleDisplayModeChange('portrait')}
                >
                  {displayMode === 'portrait' && (
                    <div className="absolute top-3 right-3 z-10">
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/90 border border-blue-400">
                        <Icon name="check" size={14} className="text-white" />
                        <span className="text-xs text-white font-medium">Selected</span>
                      </div>
                    </div>
                  )}

                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Icon name="user" size={20} className="text-blue-400" />
                      <h3 className="text-base font-semibold text-white">Portrait Mode</h3>
                    </div>
                    
                    {/* Preview */}
                    <div className="aspect-video rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-white/10 overflow-hidden mb-3 relative">
                      <VirtualAssistant
                        ref={portraitRef}
                        isPreview={true}
                        portraitMode={true}
                        previewWidth="100%"
                        previewHeight="100%"
                        previewClassName="rounded-lg"
                      />
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex items-start gap-2 text-white/80">
                        <Icon name="check" size={12} className="text-green-400 flex-shrink-0 mt-0.5" />
                        <span>Upper body focus</span>
                      </div>
                      <div className="flex items-start gap-2 text-white/80">
                        <Icon name="check" size={12} className="text-green-400 flex-shrink-0 mt-0.5" />
                        <span>Compact and space-efficient</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Position Selection */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-4">Screen Position</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {positions.map((position) => {
                  const isSelected = selectedPosition === position.key;
                  
                  return (
                    <button
                      key={position.key}
                      onClick={() => handlePositionChange(position.key)}
                      className={`relative p-3 rounded-lg border-2 transition-all duration-300 text-left ${
                        isSelected
                          ? 'border-purple-400 bg-purple-500/20 shadow-lg shadow-purple-500/30'
                          : 'border-white/10 bg-white/5 hover:border-white/30 hover:bg-white/10'
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute top-1 right-1">
                          <div className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
                            <Icon name="check" size={12} className="text-white" />
                          </div>
                        </div>
                      )}

                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-2 ${
                        isSelected ? 'bg-purple-500/30' : 'bg-white/10'
                      }`}>
                        <Icon 
                          name={position.icon} 
                          size={20} 
                          className={isSelected ? 'text-purple-300' : 'text-white/60'} 
                        />
                      </div>

                      <h4 className="text-xs font-semibold text-white mb-1">
                        {position.label}
                      </h4>
                      <p className="text-[10px] text-white/60">
                        {position.description}
                      </p>

                      {position.key === 'bottom-right' && (
                        <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 mt-1">
                          Default
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-white/60 mt-3 flex items-center gap-1.5">
                <Icon name="idea" size={14} className="text-yellow-400" />
                You can drag the character anywhere on screen later
              </p>
            </div>
          </>
        ) : (
          /* Character DISABLED - Show Chat-Only Benefits */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Preview */}
            <div className="space-y-4">
              <div className="aspect-video rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-white/10 overflow-hidden relative flex items-center justify-center">
                <div className="text-center p-6">
                  <Icon name="message-circle" size={64} className="text-purple-400 mx-auto mb-3 opacity-50" />
                  <p className="text-white/60 text-sm">
                    Chat-Only Mode
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Icon name="sparkles" size={16} className="text-blue-400" />
                  Chat-Only Benefits
                </h3>
                <ul className="space-y-2 text-xs text-white/70">
                  <li className="flex items-start gap-2">
                    <Icon name="check" size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
                    <span>Lightweight and minimal interface</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Icon name="check" size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
                    <span>Clean, distraction-free experience</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Icon name="check" size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
                    <span>Full AI capabilities remain available</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Icon name="check" size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
                    <span>Simple floating chat button interface</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Right: Description */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-white mb-3">About Chat-Only Mode</h3>
                <p className="text-sm text-white/80 leading-relaxed mb-4">
                  In chat-only mode, you'll interact with your AI assistant through a clean, 
                  minimal chat interface without the 3D character. Perfect for those who prefer 
                  a distraction-free, text-focused experience.
                </p>
              </div>

              <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
                <div className="flex items-start gap-2">
                  <Icon name="info" size={16} className="text-blue-300 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-200">
                    <strong>You can always enable the 3D character later</strong> from settings. 
                    This just sets your initial preference.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Additional Info */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 mb-6">
        <div className="flex items-start gap-3">
          <Icon name="info" size={20} className="text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-white mb-1">You can change this later</h4>
            <p className="text-xs text-white/80">
              All these settings can be modified anytime in Settings → UI. 
              Your selection here just sets the initial configuration.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CharacterIntroStep;

