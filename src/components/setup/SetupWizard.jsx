/**
 * SetupWizard - First-time setup wizard for Virtual Assistant
 * 
 * Full-screen glassmorphism UI that guides users through initial configuration.
 * Blocks all other content until setup is complete.
 */

import { useSetup } from '../../contexts/SetupContext';
import { Icon } from '../icons';
import { useEffect, useRef, useState } from 'react';
import BackgroundDetector from '../../utils/BackgroundDetector';

// Import step components
import WelcomeStep from './steps/WelcomeStep';
import CharacterIntroStep from './steps/CharacterIntroStep';
import LLMProviderStep from './steps/LLMProviderStep';
import TTSProviderStep from './steps/TTSProviderStep';
import AIFeaturesOverviewStep from './steps/AIFeaturesOverviewStep';
import TutorialStep from './steps/TutorialStep';

const SetupWizard = () => {
  const {
    currentStep,
    totalSteps,
    nextStep,
    previousStep,
    completeSetup,
  } = useSetup();

  // Reference to content area for scrolling
  const contentRef = useRef(null);
  const containerRef = useRef(null);

  // Background detection state
  const [isLightBackground, setIsLightBackground] = useState(false);

  // Detect background brightness
  useEffect(() => {
    const detectBackground = () => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const result = BackgroundDetector.detectBrightness({
        sampleArea: {
          type: 'grid',
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
          padding: 60,
        },
        elementsToIgnore: [containerRef.current],
        logPrefix: '[SetupWizard]',
      });

      setIsLightBackground(result.isLight);
    };

    // Initial detection
    setTimeout(detectBackground, 100);

    // Re-detect on interval
    const interval = setInterval(detectBackground, 4000);

    return () => clearInterval(interval);
  }, [currentStep]);

  // Scroll to top whenever step changes
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentStep]);

  // Map step numbers to components
  const getStepComponent = () => {
    switch (currentStep) {
      case 1: return <WelcomeStep isLightBackground={isLightBackground} />;
      case 2: return <CharacterIntroStep isLightBackground={isLightBackground} />;
      case 3: return <LLMProviderStep isLightBackground={isLightBackground} />;
      case 4: return <TTSProviderStep isLightBackground={isLightBackground} />;
      case 5: return <AIFeaturesOverviewStep isLightBackground={isLightBackground} />;
      case 6: return <TutorialStep isLightBackground={isLightBackground} />;
      default: return <WelcomeStep isLightBackground={isLightBackground} />;
    }
  };

  // Get step title
  const getStepTitle = () => {
    switch (currentStep) {
      case 1: return 'Welcome';
      case 2: return 'Virtual Companion';
      case 3: return 'AI Configuration';
      case 4: return 'Voice';
      case 5: return 'AI+ Features';
      case 6: return 'Tutorial';
      default: return 'Setup';
    }
  };

  const progress = (currentStep / totalSteps) * 100;
  const canGoBack = currentStep > 1;
  const isLastStep = currentStep === totalSteps;

  // Handle Next/Finish button click
  const handleNextClick = () => {
    if (isLastStep) {
      // On last step (Tutorial), complete setup
      completeSetup();
    } else {
      // Regular next step
      nextStep();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden">
      {/* Main setup container */}
      <div ref={containerRef} className="relative w-full max-w-3xl h-[95vh] mx-2 sm:mx-4 flex flex-col">
        {/* Compact Header */}
        <div className={`glass-container ${isLightBackground ? 'glass-dark' : ''} rounded-t-xl p-3 sm:p-4 flex-shrink-0`}>
          {/* Step indicator */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <Icon name="settings" size={16} className='text-white' />
              </div>
              <div>
                <h1 className='text-sm sm:text-base font-bold ${isLightBackground text-white'>Setup</h1>
                <p className='text-xs text-white/70'>
                  {currentStep}/{totalSteps}: {getStepTitle()}
                </p>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className='w-full h-1.5 bg-white/20 rounded-full overflow-hidden backdrop-blur-sm'>
            <div
              className='h-full transition-all duration-500 ease-out bg-gradient-to-r from-white/40 via-white/60 to-white/40 shadow-[0_0_10px_rgba(255,255,255,0.5)]'
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Content area */}
        <div 
          ref={contentRef}
          className={`glass-container ${isLightBackground ? 'glass-dark' : ''} flex-1 overflow-y-auto p-4 sm:p-6`}
          style={{ 
            scrollbarWidth: 'thin', 
            scrollbarColor: isLightBackground 
              ? 'rgba(0, 0, 0, 0.3) rgba(0, 0, 0, 0.1)' 
              : 'rgba(255, 255, 255, 0.3) rgba(255, 255, 255, 0.1)'
          }}
        >
          {getStepComponent()}
        </div>

        {/* Compact Navigation footer */}
        <div className={`glass-container ${isLightBackground ? 'glass-dark' : ''} rounded-b-xl p-3 sm:p-4 flex-shrink-0`}>
          <div className="flex items-center justify-between gap-2">
            {/* Previous button */}
            <button
              onClick={previousStep}
              disabled={!canGoBack}
              className={`glass-button px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1 ${
                canGoBack
                  ? `hover:${isLightBackground ? 'bg-gray-800/20' : 'bg-white/20'} ${isLightBackground ? 'text-gray-800' : 'text-white'}`
                  : `opacity-50 cursor-not-allowed ${isLightBackground ? 'text-gray-800/50' : 'text-white/50'}`
              }`}
            >
              <Icon name="arrow-left" size={16} />
              <span className="hidden sm:inline">Previous</span>
            </button>

            {/* Next button */}
            <button
              onClick={handleNextClick}
              className={`glass-button px-3 sm:px-4 py-2 rounded-lg text-sm font-medium ${
                isLightBackground ? 'bg-gray-800/10 hover:bg-gray-800/20 text-gray-800' : 'bg-white/10 hover:bg-white/20 text-white'
              } transition-all flex items-center gap-1`}
            >
              <span className="hidden sm:inline">{isLastStep ? 'Finish' : 'Next'}</span>
              <span className="sm:hidden">→</span>
              <Icon name="arrow-right" size={16} className="hidden sm:block" />
            </button>
          </div>
        </div>
      </div>

    </div>
  );
};

export default SetupWizard;
