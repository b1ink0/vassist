/**
 * Placeholder step components
 * These will be implemented one by one in subsequent tasks
 */

import { useSetup } from '../../../contexts/SetupContext';

// Import implemented steps
import WelcomeStep from './WelcomeStep';
import SystemRequirementsStep from './SystemRequirementsStep';
import ChromeAISetupStep from './ChromeAISetupStep';
import LLMProviderStep from './LLMProviderStep';
import MultimodalFeaturesStep from './MultimodalFeaturesStep';
import TTSProviderStep from './TTSProviderStep';
import KokoroTTSSetupStep from './KokoroTTSSetupStep';
import STTProviderStep from './STTProviderStep';
import STTConfigStep from './STTConfigStep';
import VoiceTestStep from './VoiceTestStep';
import AIFeaturesStep from './AIFeaturesStep';
import CharacterIntroStep from './CharacterIntroStep';
import PositionSelectionStep from './PositionSelectionStep';
import ChatFeaturesStep from './ChatFeaturesStep';
import AIToolbarStep from './AIToolbarStep';
import CharacterInteractionStep from './CharacterInteractionStep';
import ModelDraggingStep from './ModelDraggingStep';
import ChatButtonStep from './ChatButtonStep';
import SettingsOverviewStep from './SettingsOverviewStep';
import QuickReferenceStep from './QuickReferenceStep';

// Placeholder wrapper component for steps not yet implemented
const StepWrapper = ({ title, description, children }) => {
  const { markStepComplete, nextStep } = useSetup();
  
  const handleContinue = () => {
    markStepComplete();
    nextStep();
  };
  
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold text-white">{title}</h2>
        {description && <p className="text-white/70 max-w-2xl mx-auto">{description}</p>}
      </div>
      <div className="mt-8">{children}</div>
      <div className="flex justify-end mt-8">
        <button
          onClick={handleContinue}
          className="glass-button rounded-xl px-8 py-3 text-lg font-semibold"
        >
          Continue →
        </button>
      </div>
    </div>
  );
};

export { 
  WelcomeStep, 
  SystemRequirementsStep, 
  ChromeAISetupStep, 
  LLMProviderStep, 
  MultimodalFeaturesStep, 
  TTSProviderStep, 
  STTProviderStep, 
  STTConfigStep, 
  VoiceTestStep, 
  AIFeaturesStep, 
  CharacterIntroStep, 
  PositionSelectionStep, 
  ChatFeaturesStep,
  AIToolbarStep,
  CharacterInteractionStep,
  ModelDraggingStep,
  ChatButtonStep,
  SettingsOverviewStep,
  QuickReferenceStep
};

// Step 3 is now ChromeAISetupStep (combines detection, flags, download, and skip)
export const ChromeAIDetectionStep = ChromeAISetupStep;

// Step 7: Kokoro TTS detailed configuration
export const KokoroTTSStep = KokoroTTSSetupStep;

// Note: DisplayModesStep has been merged into CharacterIntroStep (Step 12)

// Note: ChatTutorialStep and ChatContainerStep are merged into ChatFeaturesStep (Step 13)

export const SetupCompleteStep = () => {
  const { completeSetup } = useSetup();
  
  return (
    <StepWrapper title="Setup Complete! 🎉" description="You're all set">
      <div className="text-center text-white/80 space-y-6">
        <p>Setup completion summary will be implemented here</p>
        <button
          onClick={completeSetup}
          className="glass-button px-8 py-4 rounded-xl text-white font-semibold text-lg transition-all duration-300 transform hover:scale-105"
        >
          Complete Setup & Launch
        </button>
      </div>
    </StepWrapper>
  );
};
