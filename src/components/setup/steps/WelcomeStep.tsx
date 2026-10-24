/**
 * WelcomeStep - First step of setup wizard
 * Quick Start introduction
 */

import { useSetup } from "../../../contexts/SetupContext";
import { Icon } from "../../icons";
import logo from "../../../assets/VA.svg";
import { isAndroid, isDesktop } from "../../../utils/PlatformUtils";
import FlagCopyButton from "../../common/FlagCopyButton";
import { Button } from "../../ui";

const WelcomeStep = ({ isLightBackground: _isLightBackground = false }) => {
  const { nextStep } = useSetup();
  const showChromeAIHelp = !isAndroid && !isDesktop;

  return (
    <div className="setup-step flex flex-col items-center justify-center min-h-full text-center space-y-4 sm:space-y-6 py-2 md:py-4">
      {/* Logo */}
      <div className="flex items-center justify-center mb-2 sm:mb-4">
        <div className="relative w-24 h-24 sm:w-32 sm:h-32">
          <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-white/10 rounded-full blur-xl"></div>
          <div className="relative w-full h-full glass-container rounded-full flex items-center justify-center overflow-hidden">
            <img
              src={logo}
              alt="VAssist Logo"
              className="w-full h-full object-contain"
            />
          </div>
        </div>
      </div>

      {/* Title */}
      <div className="space-y-2">
        <h1 className="text-3xl sm:text-4xl font-bold text-white">
          Quick Start
        </h1>
        <p className="text-sm sm:text-base text-white/90 max-w-md mx-auto px-2 md:px-4">
          Welcome to your AI Assistant
        </p>
      </div>

      {/* Start Button */}
      <Button
        onClick={nextStep}
        className="px-8 sm:px-10 py-2 md:py-3 sm:py-4 text-base sm:text-lg font-semibold mt-2 md:mt-4 sm:mt-8"
      >
        Get Started →
      </Button>

      {/* Documentation Link */}
      <div className="mt-2 md:mt-4 text-sm text-white/80">
        <a
          href="https://b1ink0.github.io/vassist/intro"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-2 md:px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all"
        >
          <Icon name="book" size={16} />
          <span>View Full Documentation</span>
          <Icon name="arrow-top-right" size={14} className="opacity-60" />
        </a>
      </div>

      {showChromeAIHelp && (
        <div className="mt-6 sm:mt-8 max-w-2xl mx-auto px-2 md:px-4">
          <details className="group text-left">
            <summary className="cursor-pointer text-sm font-medium text-white/90 flex items-center justify-center gap-2 hover:text-white transition-colors">
              <Icon name="info" size={16} />
              <span>Using Chrome Built-in AI? Click here first</span>
              <Icon
                name="arrow-down"
                size={14}
                className="group-open:rotate-180 transition-transform"
              />
            </summary>
            <div className="mt-4 p-2 md:p-4 rounded-lg bg-white/10 border border-white/20 space-y-3">
              <p className="text-xs text-white/70 mb-3">
                If you plan to use Chrome's built-in AI features (free,
                on-device), you'll need to enable these flags{" "}
                <strong>before</strong> starting setup:
              </p>

              <div className="space-y-2 text-xs">
                <FlagCopyButton
                  flagUrl="chrome://flags/#optimization-guide-on-device-model"
                  flagValue="Enabled BypassPerfRequirement"
                />

                <FlagCopyButton
                  flagUrl="chrome://flags/#prompt-api-for-gemini-nano"
                  flagValue="Enabled"
                />

                <FlagCopyButton
                  flagUrl="chrome://flags/#prompt-api-for-gemini-nano-multimodal-input"
                  flagValue="Enabled (for voice input)"
                />

                <FlagCopyButton
                  flagUrl="chrome://flags/#writer-api-for-gemini-nano"
                  flagValue="Enabled (optional - for content generation)"
                />

                <FlagCopyButton
                  flagUrl="chrome://flags/#rewriter-api-for-gemini-nano"
                  flagValue="Enabled (optional - for text rewriting)"
                />
              </div>

              <div className="pt-3 border-t border-white/10">
                <p className="text-[11px] text-white/70 flex items-start gap-1.5">
                  <Icon
                    name="warning"
                    size={12}
                    className="flex-shrink-0 mt-0.5"
                  />
                  <span>
                    After enabling flags,{" "}
                    <strong>restart Chrome completely</strong> before continuing
                    with setup.
                  </span>
                </p>
              </div>
            </div>
          </details>
        </div>
      )}

      {/* Footer hint */}
      <p className="text-xs text-white/50 mt-6 sm:mt-8">
        Takes less than 2 minutes
      </p>
    </div>
  );
};

export default WelcomeStep;
