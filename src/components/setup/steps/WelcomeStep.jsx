/**
 * WelcomeStep - First step of setup wizard
 * Quick Start introduction
 */

import { useSetup } from '../../../contexts/SetupContext';
import { Icon } from '../../icons';
import logo from '../../../assets/VA.svg';

const WelcomeStep = ({ isLightBackground = false }) => { // eslint-disable-line no-unused-vars
  const { nextStep } = useSetup();

  return (
    <div className="setup-step flex flex-col items-center justify-center min-h-full text-center space-y-4 sm:space-y-6 py-4">
      {/* Logo */}
      <div className="flex items-center justify-center mb-2 sm:mb-4">
        <div className="relative w-24 h-24 sm:w-32 sm:h-32">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-full blur-xl"></div>
          <div className="relative w-full h-full glass-container rounded-full flex items-center justify-center overflow-hidden">
            <img src={logo} alt="VAssist Logo" className="w-full h-full object-contain" />
          </div>
        </div>
      </div>

      {/* Title */}
      <div className="space-y-2">
        <h1 className="text-3xl sm:text-4xl font-bold text-white">
          Quick Start
        </h1>
        <p className="text-sm sm:text-base text-white/90 max-w-md mx-auto px-4">
          Welcome to your AI Virtual Companion
        </p>
      </div>

      {/* Start Button */}
      <button
        onClick={nextStep}
        className="glass-button rounded-lg px-8 py-3 sm:px-10 sm:py-4 text-base sm:text-lg font-semibold mt-4 sm:mt-8"
      >
        Get Started →
      </button>

      {/* Chrome AI Requirements */}
      <div className="mt-6 sm:mt-8 max-w-2xl mx-auto px-4">
        <details className="group text-left">
          <summary className="cursor-pointer text-sm font-medium text-white/90 flex items-center justify-center gap-2 hover:text-white transition-colors">
            <Icon name="info" size={16} />
            <span>Using Chrome Built-in AI? Click here first</span>
            <Icon name="arrow-down" size={14} className="group-open:rotate-180 transition-transform" />
          </summary>
          <div className="mt-4 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 space-y-3">
            <p className="text-xs text-blue-200 mb-3">
              If you plan to use Chrome's built-in AI features (free, on-device), you'll need to enable these flags <strong>before</strong> starting setup:
            </p>
            
            <div className="space-y-2 text-xs">
              <div className="flex items-start gap-2">
                <Icon name="check" size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <code className="text-blue-300 text-[11px]">chrome://flags/#optimization-guide-on-device-model</code>
                  <p className="text-white/60 text-[10px] mt-0.5">Set to: Enabled BypassPerfRequirement</p>
                </div>
              </div>
              
              <div className="flex items-start gap-2">
                <Icon name="check" size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <code className="text-blue-300 text-[11px]">chrome://flags/#prompt-api-for-gemini-nano</code>
                  <p className="text-white/60 text-[10px] mt-0.5">Set to: Enabled</p>
                </div>
              </div>
              
              <div className="flex items-start gap-2">
                <Icon name="check" size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <code className="text-blue-300 text-[11px]">chrome://flags/#prompt-api-for-gemini-nano-multimodal-input</code>
                  <p className="text-white/60 text-[10px] mt-0.5">Set to: Enabled (for voice input)</p>
                </div>
              </div>
              
              <div className="flex items-start gap-2">
                <Icon name="check" size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <code className="text-blue-300 text-[11px]">chrome://flags/#writer-api-for-gemini-nano</code>
                  <p className="text-white/60 text-[10px] mt-0.5">Set to: Enabled (optional - for content generation)</p>
                </div>
              </div>
              
              <div className="flex items-start gap-2">
                <Icon name="check" size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <code className="text-blue-300 text-[11px]">chrome://flags/#rewriter-api-for-gemini-nano</code>
                  <p className="text-white/60 text-[10px] mt-0.5">Set to: Enabled (optional - for text rewriting)</p>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-white/10">
              <p className="text-[11px] text-white/70">
                <Icon name="alert-circle" size={12} className="inline mr-1" />
                After enabling flags, <strong>restart Chrome completely</strong> before continuing with setup.
              </p>
            </div>
          </div>
        </details>
      </div>

      {/* Footer hint */}
      <p className="text-xs text-white/50 mt-6 sm:mt-8">
        Takes less than 2 minutes
      </p>
    </div>
  );
};

export default WelcomeStep;

