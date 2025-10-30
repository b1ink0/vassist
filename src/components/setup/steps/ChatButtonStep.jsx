import { useSetup } from '../../../contexts/SetupContext';
import { Icon } from '../../icons';

const ChatButtonStep = () => {
  const { markStepComplete, nextStep } = useSetup();

  const handleContinue = () => {
    markStepComplete();
    nextStep();
  };

  return (
    <div className="setup-step chat-button-step">
      <div className="step-header mb-8">
        <h2 className="text-3xl font-bold text-white mb-3">
          Chat Button
        </h2>
        <p className="text-white/70 text-lg">
          Your main interaction point in chat-only mode
        </p>
      </div>

      <div className="glass-container rounded-xl p-12">
        <div className="max-w-3xl mx-auto">
          {/* Placeholder for GIF */}
          <div className="bg-white/5 rounded-xl border-2 border-dashed border-white/20 p-16 mb-8 text-center">
            <Icon name="image" size={64} className="text-white/40 mx-auto mb-4" />
            <p className="text-white/50 text-lg font-medium">GIF Placeholder</p>
            <p className="text-white/30 text-sm mt-2">Chat button demo will go here</p>
          </div>

          {/* Description */}
          <div className="space-y-4 text-white/80">
            <p className="text-lg">
              This section will show how to use and position the chat button with animated demonstrations.
            </p>
            <ul className="list-disc list-inside space-y-2 text-white/70">
              <li>Click to open chat interface</li>
              <li>Drag to reposition anywhere</li>
              <li>Position persists across sessions</li>
              <li>Main interaction in chat-only mode</li>
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

export default ChatButtonStep;
