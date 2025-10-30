import { useState, useRef } from 'react';
import { useSetup } from '../../../contexts/SetupContext';
import { Icon } from '../../icons';
import VirtualAssistant from '../../VirtualAssistant';

const DisplayModeStep = () => {
  const { setupData, updateSetupData, markStepComplete, nextStep } = useSetup();
  
  // Get characterEnabled from previous step
  const characterEnabled = setupData?.characterEnabled ?? true;
  
  // Selected display mode (normal or portrait)
  const [selectedMode, setSelectedMode] = useState(
    setupData?.displayMode || 'normal'
  );
  
  // Loading states for mode switching
  const [isLoadingNormal, setIsLoadingNormal] = useState(false);
  const [isLoadingPortrait, setIsLoadingPortrait] = useState(false);
  
  const normalRef = useRef(null);
  const portraitRef = useRef(null);

  const handleContinue = () => {
    updateSetupData({ displayMode: selectedMode });
    markStepComplete();
    nextStep();
  };

  // If character is disabled, skip this step automatically
  if (!characterEnabled) {
    // Auto-skip to next step
    handleContinue();
    return null;
  }

  const handleModeSelect = (mode) => {
    setSelectedMode(mode);
  };

  return (
    <div className="setup-step display-mode-step">
      <div className="step-header mb-8">
        <h2 className="text-3xl font-bold mb-2 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
          Choose Display Mode
        </h2>
        <p className="text-white/90">
          Select how you want the virtual character to appear on your screen.
        </p>
      </div>

      {/* Mode Comparison */}
      <div className="glass-container rounded-xl p-6 mb-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Normal (Full Body) Mode */}
          <div 
            className={`relative rounded-xl border-2 transition-all duration-300 cursor-pointer ${
              selectedMode === 'normal' 
                ? 'border-purple-400 bg-purple-500/10' 
                : 'border-white/10 bg-white/5 hover:border-white/20'
            }`}
            onClick={() => handleModeSelect('normal')}
          >
            {/* Selection indicator */}
            {selectedMode === 'normal' && (
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
                <h3 className="text-lg font-semibold text-white">Full Body Mode</h3>
              </div>
              
              {/* Preview */}
              <div className="aspect-video rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-white/10 overflow-hidden mb-4 relative">
                <VirtualAssistant
                  ref={normalRef}
                  isPreview={true}
                  portraitMode={false}
                  previewWidth="100%"
                  previewHeight="100%"
                  previewClassName="rounded-lg"
                  onReady={() => setIsLoadingNormal(false)}
                />
                
                {/* Loading overlay */}
                {isLoadingNormal && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-4 border-purple-500/30 border-t-purple-500 mx-auto mb-2"></div>
                      <p className="text-white/70 text-xs">Loading...</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2 text-white/80">
                  <Icon name="check" size={14} className="text-green-400 flex-shrink-0 mt-0.5" />
                  <span>Complete character visible (head to feet)</span>
                </div>
                <div className="flex items-start gap-2 text-white/80">
                  <Icon name="check" size={14} className="text-green-400 flex-shrink-0 mt-0.5" />
                  <span>Full range of animations and expressions</span>
                </div>
                <div className="flex items-start gap-2 text-white/80">
                  <Icon name="check" size={14} className="text-green-400 flex-shrink-0 mt-0.5" />
                  <span>Best for larger screens and immersive experience</span>
                </div>
                <div className="flex items-start gap-2 text-yellow-400/80">
                  <Icon name="alert-triangle" size={14} className="flex-shrink-0 mt-0.5" />
                  <span>Higher GPU usage (recommended for desktop)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Portrait Mode */}
          <div 
            className={`relative rounded-xl border-2 transition-all duration-300 cursor-pointer ${
              selectedMode === 'portrait' 
                ? 'border-blue-400 bg-blue-500/10' 
                : 'border-white/10 bg-white/5 hover:border-white/20'
            }`}
            onClick={() => handleModeSelect('portrait')}
          >
            {/* Selection indicator */}
            {selectedMode === 'portrait' && (
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
                <h3 className="text-lg font-semibold text-white">Portrait Mode</h3>
              </div>
              
              {/* Preview */}
              <div className="aspect-video rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-white/10 overflow-hidden mb-4 relative">
                <VirtualAssistant
                  ref={portraitRef}
                  isPreview={true}
                  portraitMode={true}
                  previewWidth="100%"
                  previewHeight="100%"
                  previewClassName="rounded-lg"
                  onReady={() => setIsLoadingPortrait(false)}
                />
                
                {/* Loading overlay */}
                {isLoadingPortrait && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500/30 border-t-blue-500 mx-auto mb-2"></div>
                      <p className="text-white/70 text-xs">Loading...</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2 text-white/80">
                  <Icon name="check" size={14} className="text-green-400 flex-shrink-0 mt-0.5" />
                  <span>Upper body focus (chest and head)</span>
                </div>
                <div className="flex items-start gap-2 text-white/80">
                  <Icon name="check" size={14} className="text-green-400 flex-shrink-0 mt-0.5" />
                  <span>Better performance and lower GPU usage</span>
                </div>
                <div className="flex items-start gap-2 text-white/80">
                  <Icon name="check" size={14} className="text-green-400 flex-shrink-0 mt-0.5" />
                  <span>Ideal for laptops and smaller screens</span>
                </div>
                <div className="flex items-start gap-2 text-blue-400/80">
                  <Icon name="zap" size={14} className="flex-shrink-0 mt-0.5" />
                  <span>Recommended for better battery life</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Performance Comparison */}
        <div className="glass-container bg-white/5 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Icon name="info" size={16} className="text-blue-400" />
            Performance Comparison
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <p className="text-white/60 mb-1">GPU Usage</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className={`h-full bg-gradient-to-r ${
                    selectedMode === 'normal' 
                      ? 'from-purple-500 to-pink-500 w-3/4' 
                      : 'from-blue-500 to-cyan-500 w-1/2'
                  }`}></div>
                </div>
                <span className="text-white/80 font-medium">
                  {selectedMode === 'normal' ? '75%' : '50%'}
                </span>
              </div>
            </div>
            <div>
              <p className="text-white/60 mb-1">Memory Usage</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className={`h-full bg-gradient-to-r ${
                    selectedMode === 'normal' 
                      ? 'from-purple-500 to-pink-500 w-4/5' 
                      : 'from-blue-500 to-cyan-500 w-3/5'
                  }`}></div>
                </div>
                <span className="text-white/80 font-medium">
                  {selectedMode === 'normal' ? '~200MB' : '~150MB'}
                </span>
              </div>
            </div>
            <div>
              <p className="text-white/60 mb-1">Battery Impact</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className={`h-full bg-gradient-to-r ${
                    selectedMode === 'normal' 
                      ? 'from-purple-500 to-pink-500 w-3/4' 
                      : 'from-blue-500 to-cyan-500 w-1/2'
                  }`}></div>
                </div>
                <span className="text-white/80 font-medium">
                  {selectedMode === 'normal' ? 'Higher' : 'Lower'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Additional Info */}
      <div className="glass-container bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 mb-6">
        <div className="flex items-start gap-3">
          <Icon name="info" size={20} className="text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-white mb-1">You can change this later</h4>
            <p className="text-xs text-white/80">
              Display mode can be toggled anytime in Settings → UI → Portrait Mode. 
              Your selection here just sets the default mode.
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
          Continue with {selectedMode === 'normal' ? 'Full Body' : 'Portrait'} Mode
        </button>
      </div>
    </div>
  );
};

export default DisplayModeStep;
