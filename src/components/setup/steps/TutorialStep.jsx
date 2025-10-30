/**
 * TutorialStep - Interactive tutorial with feature demonstrations
 * Shows scrollable gallery of GIFs demonstrating all features
 */

import { Icon } from '../../icons';

const TutorialStep = () => {
  const tutorials = [
    {
      title: 'Chat Interface',
      description: 'Ask questions and have natural conversations with your AI assistant',
      gifPath: '/tutorials/chat.gif', // Placeholder - replace with actual GIF
      icon: 'message-circle'
    },
    {
      title: 'Voice Input',
      description: 'Use speech-to-text to communicate hands-free with your assistant',
      gifPath: '/tutorials/voice.gif',
      icon: 'mic'
    },
    {
      title: 'Virtual Character',
      description: 'Interact with your animated character companion in real-time',
      gifPath: '/tutorials/character.gif',
      icon: 'user'
    },
    {
      title: 'Model Dragging',
      description: 'Reposition your character anywhere on the screen by dragging',
      gifPath: '/tutorials/drag.gif',
      icon: 'move'
    },
    {
      title: 'AI Toolbar',
      description: 'Access quick AI actions: translate, summarize, rewrite, and more',
      gifPath: '/tutorials/toolbar.gif',
      icon: 'sparkles'
    },
    {
      title: 'Settings Panel',
      description: 'Customize everything: AI models, voices, appearance, and behavior',
      gifPath: '/tutorials/settings.gif',
      icon: 'settings'
    }
  ];

  return (
    <div className="setup-step">
      <div className="mb-4">
        <h2 className="text-xl sm:text-2xl font-bold mb-1 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
          Quick Tutorial
        </h2>
        <p className="text-xs sm:text-sm text-white/90">
          Learn the key features of your Virtual Assistant
        </p>
      </div>

      {/* Scrollable Tutorial Gallery */}
      <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255, 255, 255, 0.3) rgba(255, 255, 255, 0.1)' }}>
        {tutorials.map((tutorial, index) => (
          <div
            key={index}
            className="rounded-lg border border-white/10 overflow-hidden hover:border-white/20 transition-all"
          >
            {/* Tutorial Header */}
            <div className="p-3 bg-white/5">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-6 h-6 rounded bg-white/10 flex items-center justify-center">
                  <Icon name={tutorial.icon} size={14} className="text-white" />
                </div>
                <h3 className="text-sm font-semibold text-white">{tutorial.title}</h3>
              </div>
              <p className="text-xs text-white/70">{tutorial.description}</p>
            </div>

            {/* GIF/Video Placeholder */}
            <div className="relative bg-black/20 aspect-video flex items-center justify-center">
              {/* Placeholder - replace with actual GIF when available */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <Icon name={tutorial.icon} size={48} className="text-white/30 mb-2 mx-auto" />
                  <p className="text-xs text-white/50">Tutorial GIF Coming Soon</p>
                </div>
              </div>
              {/* Uncomment when GIFs are ready:
              <img 
                src={tutorial.gifPath} 
                alt={tutorial.title}
                className="w-full h-full object-cover"
              />
              */}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom Info */}
      <div className="mt-4 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
        <div className="flex items-start gap-2">
          <Icon name="info" size={16} className="text-purple-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-purple-300">
            <span className="font-semibold">Pro Tip:</span> All these features are accessible anytime! Look for the chat button, character controls, and settings icon once you complete setup.
          </p>
        </div>
      </div>
    </div>
  );
};

export default TutorialStep;
