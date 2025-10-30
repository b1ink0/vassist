/**
 * WelcomeStep - First step of setup wizard
 * Quick Start introduction
 */

import { useSetup } from '../../../contexts/SetupContext';
import { Icon } from '../../icons';

const WelcomeStep = () => {
  const { nextStep } = useSetup();

  return (
    <div className="setup-step flex flex-col items-center justify-center min-h-full text-center space-y-4 sm:space-y-6 py-4">
      {/* Logo */}
      <div className="flex items-center justify-center mb-2 sm:mb-4">
        <div className="relative w-24 h-24 sm:w-32 sm:h-32">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-full blur-xl"></div>
          <div className="relative w-full h-full glass-container rounded-full flex items-center justify-center">
            <Icon name="sparkles" size={48} className="text-purple-400" />
          </div>
        </div>
      </div>

      {/* Title */}
      <div className="space-y-2">
        <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
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

      {/* Footer hint */}
      <p className="text-xs text-white/50 mt-6 sm:mt-8">
        Takes less than 2 minutes
      </p>
    </div>
  );
};

export default WelcomeStep;

