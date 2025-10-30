import { useSetup } from '../../../contexts/SetupContext';
import { Icon } from '../../icons';

const CharacterInteractionStep = () => {
  const { markStepComplete, nextStep } = useSetup();

  const handleContinue = () => {
    markStepComplete();
    nextStep();
  };

  return (
    <div className="setup-step character-interaction-step">
      <div className="step-header mb-8">
        <h2 className="text-3xl font-bold text-white mb-3">
          Character Interaction
        </h2>
        <p className="text-white/70 text-lg">
          Interact with your 3D virtual character
        </p>
      </div>

      <div className="glass-container rounded-xl p-12">
        <div className="max-w-3xl mx-auto">
          {/* Placeholder for GIF */}
          <div className="bg-white/5 rounded-xl border-2 border-dashed border-white/20 p-16 mb-8 text-center">
            <Icon name="image" size={64} className="text-white/40 mx-auto mb-4" />
            <p className="text-white/50 text-lg font-medium">GIF Placeholder</p>
            <p className="text-white/30 text-sm mt-2">Character interaction demo will go here</p>
          </div>

          {/* Description */}
          <div className="space-y-4 text-white/80">
            <p className="text-lg">
              This section will show how to interact with your 3D character with animated demonstrations.
            </p>
            <ul className="list-disc list-inside space-y-2 text-white/70">
              <li>Chatting with your character</li>
              <li>Lip-sync animations</li>
              <li>Emotion expressions</li>
              <li>Response animations</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-center mt-8">
        <button
          onClick={handleContinue}
          className="glass-button px-8 py-3 text-white font-semibold rounded-xl hover:bg-white/20 transition-all"
        >
          Continue
          <Icon name="arrow-right" size={20} className="ml-2 inline" />
        </button>
      </div>
    </div>
  );
};

export default CharacterInteractionStep;
