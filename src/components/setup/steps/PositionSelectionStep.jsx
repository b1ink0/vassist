/**
 * PositionSelectionStep - Step 13: Character Position Selection
 * 
 * Choose where the virtual character appears on screen.
 * Visual grid with position options and previews.
 */

import { useState } from 'react';
import { useSetup } from '../../../contexts/SetupContext';
import { Icon } from '../../icons';
import { PositionPresets } from '../../../config/uiConfig';
import VirtualAssistant from '../../VirtualAssistant';

const PositionSelectionStep = () => {
  const { setupData, updateSetupData, markStepComplete, nextStep } = useSetup();
  
  // Get character enabled state and display mode from previous steps
  const characterEnabled = setupData.ui?.characterEnabled ?? true;
  const displayMode = setupData.ui?.displayMode || 'normal';
  const isPortraitMode = displayMode === 'portrait';
  
  // Initialize with saved position or default to bottom-right
  const [selectedPosition, setSelectedPosition] = useState(
    setupData.ui?.position || 'bottom-right'
  );

  const handleContinue = () => {
    // Save selected position
    updateSetupData('ui', {
      ...setupData.ui,
      position: selectedPosition
    });
    
    markStepComplete();
    nextStep();
  };

  // Skip this step if character is disabled
  if (!characterEnabled) {
    // Auto-continue if character is disabled
    if (setupData.ui?.position === undefined) {
      updateSetupData('ui', {
        ...setupData.ui,
        position: 'bottom-right' // Set default even if skipped
      });
      markStepComplete();
      nextStep();
    }
    return null;
  }

  // Define position options with icons and descriptions
  const positions = [
    { 
      key: 'bottom-right', 
      icon: 'arrow-down-right', 
      label: 'Bottom Right',
      description: 'Classic assistant position, out of the way'
    },
    { 
      key: 'bottom-left', 
      icon: 'arrow-down-left', 
      label: 'Bottom Left',
      description: 'Alternative corner position'
    },
    { 
      key: 'bottom-center', 
      icon: 'arrow-down', 
      label: 'Bottom Center',
      description: 'Centered at bottom of screen'
    },
    { 
      key: 'top-right', 
      icon: 'arrow-up-right', 
      label: 'Top Right',
      description: 'Upper corner position'
    },
    { 
      key: 'top-left', 
      icon: 'arrow-up-left', 
      label: 'Top Left',
      description: 'Upper left corner'
    },
    { 
      key: 'top-center', 
      icon: 'arrow-up', 
      label: 'Top Center',
      description: 'Centered at top of screen'
    },
    { 
      key: 'center', 
      icon: 'maximize', 
      label: 'Center',
      description: 'Large centered view'
    },
    { 
      key: 'last-location', 
      icon: 'map-pin', 
      label: 'Remember Position',
      description: 'Always remember where you drag the character'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold text-white">Character Position</h2>
        <p className="text-white/70 max-w-2xl mx-auto">
          Choose where the virtual character appears on your screen. 
          Don't worry, you can drag it anywhere later!
        </p>
      </div>

      {/* Live Preview at Top */}
      <div className="glass-container rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Icon name="eye" size={20} className="text-purple-400" />
          Live Preview - {PositionPresets[selectedPosition]?.name}
        </h3>
        
        <div className="relative aspect-video bg-gradient-to-br from-indigo-900/40 to-purple-900/40 rounded-lg border border-white/10 overflow-hidden">
          {/* Screen representation with live character */}
          {selectedPosition !== 'last-location' ? (
            <div
              className={`absolute transition-all duration-500 ${
                selectedPosition === 'bottom-right' ? 'bottom-0 right-0' :
                selectedPosition === 'bottom-left' ? 'bottom-0 left-0' :
                selectedPosition === 'bottom-center' ? 'bottom-0 left-1/2 -translate-x-1/2' :
                selectedPosition === 'top-right' ? 'top-0 right-0' :
                selectedPosition === 'top-left' ? 'top-0 left-0' :
                selectedPosition === 'top-center' ? 'top-0 left-1/2 -translate-x-1/2' :
                selectedPosition === 'center' ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' :
                'bottom-0 right-0'
              }`}
              style={{
                width: selectedPosition === 'center' ? '300px' : '200px',
                height: selectedPosition === 'center' ? '450px' : '300px'
              }}
            >
              <VirtualAssistant
                isPreview={true}
                portraitMode={isPortraitMode}
                previewPosition="center"
                previewWidth="100%"
                previewHeight="100%"
                previewClassName="rounded-lg"
              />
            </div>
          ) : (
            /* Special message for last-location */
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center p-6">
                <Icon name="move" size={48} className="text-purple-400 mx-auto mb-3" />
                <p className="text-white/80 text-sm mb-2">
                  Character will remember wherever you drag it
                </p>
                <p className="text-white/60 text-xs">
                  Position is saved automatically when you move the character
                </p>
              </div>
            </div>
          )}

          {/* Corner labels for reference */}
          <div className="absolute top-2 left-2 text-white/30 text-xs">Top Left</div>
          <div className="absolute top-2 right-2 text-white/30 text-xs">Top Right</div>
          <div className="absolute bottom-2 left-2 text-white/30 text-xs">Bottom Left</div>
          <div className="absolute bottom-2 right-2 text-white/30 text-xs">Bottom Right</div>
        </div>
      </div>

      {/* Position Grid - Smaller cards */}
      <div className="glass-container rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Select Position</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {positions.map((position) => {
            const isSelected = selectedPosition === position.key;
            
            return (
              <button
                key={position.key}
                onClick={() => setSelectedPosition(position.key)}
                className={`relative p-3 rounded-lg border-2 transition-all duration-300 text-left ${
                  isSelected
                    ? 'border-purple-400 bg-purple-500/20 shadow-lg shadow-purple-500/30'
                    : 'border-white/10 bg-white/5 hover:border-white/30 hover:bg-white/10'
                }`}
              >
                {/* Selection indicator */}
                {isSelected && (
                  <div className="absolute top-1 right-1">
                    <div className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
                      <Icon name="check" size={12} className="text-white" />
                    </div>
                  </div>
                )}

                {/* Icon */}
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-2 ${
                  isSelected ? 'bg-purple-500/30' : 'bg-white/10'
                }`}>
                  <Icon 
                    name={position.icon} 
                    size={20} 
                    className={isSelected ? 'text-purple-300' : 'text-white/60'} 
                  />
                </div>

                {/* Label */}
                <h3 className="text-xs font-semibold text-white mb-1">
                  {position.label}
                </h3>

                {/* Recommended badge for bottom-right */}
                {position.key === 'bottom-right' && (
                  <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Default
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Additional Info */}
      <div className="glass-container bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Icon name="info" size={20} className="text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-white mb-1">Flexible Positioning</h4>
            <p className="text-xs text-white/80 leading-relaxed">
              This is just the starting position. You can <strong>click and drag</strong> the 
              character anywhere on screen at any time. If you choose "Remember Position", 
              the character will always appear where you last left it.
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-end">
        <button
          onClick={handleContinue}
          className="glass-button px-6 py-3 rounded-lg font-medium text-white bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 transition-all"
        >
          Continue with {PositionPresets[selectedPosition]?.name}
        </button>
      </div>
    </div>
  );
};

export default PositionSelectionStep;
