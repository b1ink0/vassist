import { useState, useRef } from "react";
import { cn } from "../../../utils/cn";
import { Card, SettingsRow } from "../../ui";
import { useSetup } from "../../../contexts/SetupContext";
import { Icon } from "../../icons";
import Toggle from "../../common/Toggle";
import VirtualAssistant from "../../assistant/VirtualAssistant";
import { PositionPresets } from "../../../config/uiConfig";
import { isAndroid, isDesktop } from "../../../utils/PlatformUtils";
import type { AssistantHandle } from "../../../types/assistant";

interface CharacterIntroStepProps {
  isLightBackground?: boolean;
}

const CharacterIntroStep = ({
  isLightBackground: _isLightBackground = false,
}: CharacterIntroStepProps) => {
  const { setupData, updateSetupData } = useSetup();
  const normalRef = useRef<AssistantHandle | null>(null);
  const portraitRef = useRef<AssistantHandle | null>(null);
  const allowPositionSelection = !isAndroid && !isDesktop;

  // Character enabled state (on by default)
  const [characterEnabled, setCharacterEnabled] = useState(
    setupData?.ui?.enableModelLoading ?? true,
  );

  // Display mode (normal or portrait)
  const [displayMode, setDisplayMode] = useState(
    setupData?.ui?.enablePortraitMode ? "portrait" : "normal",
  );

  // Position selection
  const [selectedPosition, setSelectedPosition] = useState(
    setupData?.ui?.position || "bottom-right",
  );

  // Auto-save to setup data whenever values change
  const handleCharacterToggle = (enabled: boolean) => {
    setCharacterEnabled(enabled);
    const uiConfig = {
      enableModelLoading: enabled,
      enablePortraitMode: displayMode === "portrait",
      position: selectedPosition,
      enableAIToolbar: setupData?.ui?.enableAIToolbar ?? true,
    };
    updateSetupData({ ui: uiConfig });
  };

  const handleDisplayModeChange = (mode: "normal" | "portrait") => {
    setDisplayMode(mode);
    const uiConfig = {
      enableModelLoading: characterEnabled,
      enablePortraitMode: mode === "portrait",
      position: selectedPosition,
      enableAIToolbar: setupData?.ui?.enableAIToolbar ?? true,
    };
    updateSetupData({ ui: uiConfig });
  };

  const handlePositionChange = (position: string) => {
    setSelectedPosition(position);
    const uiConfig = {
      enableModelLoading: characterEnabled,
      enablePortraitMode: displayMode === "portrait",
      position: position,
      enableAIToolbar: setupData?.ui?.enableAIToolbar ?? true,
    };
    updateSetupData({ ui: uiConfig });
  };

  // Position options
  const positions = [
    {
      key: "bottom-right",
      icon: "arrow-down-right",
      label: "Bottom Right",
      description: "Classic assistant position",
    },
    {
      key: "bottom-left",
      icon: "arrow-down-left",
      label: "Bottom Left",
      description: "Alternative corner",
    },
    {
      key: "bottom-center",
      icon: "arrow-down",
      label: "Bottom Center",
      description: "Centered at bottom",
    },
    {
      key: "top-right",
      icon: "arrow-up-right",
      label: "Top Right",
      description: "Upper corner",
    },
    {
      key: "top-left",
      icon: "arrow-up-left",
      label: "Top Left",
      description: "Upper left",
    },
    {
      key: "top-center",
      icon: "arrow-up",
      label: "Top Center",
      description: "Centered at top",
    },
    {
      key: "center",
      icon: "maximize",
      label: "Center",
      description: "Large centered view",
    },
    {
      key: "last-location",
      icon: "map-pin",
      label: "Remember Position",
      description: "Remember dragged position",
    },
  ];

  return (
    <div className="setup-step character-intro-step">
      <div className="step-header mb-8">
        <h2 className="text-3xl font-bold mb-2 bg-gradient-to-r from-white/90 to-white/70 bg-clip-text text-transparent">
          Live Assistant
        </h2>
        <p className="text-white/90">
          Choose how you want to interact with your on-screen AI assistant
        </p>
      </div>

      {/* Single Combined Panel */}
      <Card padding="none" className="rounded-xl p-6 mb-6">
        {/* Enable/Disable Toggle at Top */}
        <Card
          padding="none"
          className="p-5 rounded-xl border-2 border-white/10 mb-6"
        >
          <SettingsRow
            label="Enable Avatar"
            description="Display an animated avatar alongside your chat"
            className="items-start mb-4"
          >
            <Toggle
              checked={characterEnabled}
              data-testid="setup-toggle-enable-avatar"
              onChange={handleCharacterToggle}
            />
          </SettingsRow>
        </Card>

        {characterEnabled ? (
          /* Character ENABLED - Show Display Mode + Position */
          <>
            {/* Display Mode Selection */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white mb-4">
                Display Mode
              </h3>
              <div className="grid grid-cols-1 gap-4">
                {/* Standard Mode */}
                <div
                  className={cn(
                    "relative rounded-xl border-2 transition-all duration-300 cursor-pointer",
                    displayMode === "normal"
                      ? "border-white/30 bg-white/10"
                      : "border-white/10 bg-white/5 hover:border-white/20",
                  )}
                  onClick={() => handleDisplayModeChange("normal")}
                  data-testid="setup-display-mode-normal"
                >
                  {displayMode === "normal" && (
                    <div className="absolute top-3 right-3 z-10">
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/20 border border-white/30">
                        <Icon name="check" size={14} className="text-white" />
                        <span className="text-xs text-white font-medium">
                          Selected
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="p-2 md:p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Icon
                        name="maximize"
                        size={20}
                        className="text-white/80"
                      />
                      <h3 className="text-base font-semibold text-white">
                        Standard Mode
                      </h3>
                    </div>

                    {/* Preview */}
                    <div className="aspect-video rounded-lg bg-gradient-to-br from-white/20 to-white/10 border border-white/10 overflow-hidden mb-3 relative">
                      <VirtualAssistant
                        ref={normalRef}
                        isPreview={true}
                        portraitMode={false}
                        previewWidth="100%"
                        previewHeight="100%"
                        previewClassName="rounded-lg"
                      />
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex items-start gap-2 text-white/80">
                        <Icon
                          name="check"
                          size={12}
                          className="text-white/80 flex-shrink-0 mt-0.5"
                        />
                        <span>Complete character visible</span>
                      </div>
                      <div className="flex items-start gap-2 text-white/80">
                        <Icon
                          name="check"
                          size={12}
                          className="text-white/80 flex-shrink-0 mt-0.5"
                        />
                        <span>Full range of animations</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Portrait Mode */}
                <div
                  className={cn(
                    "relative rounded-xl border-2 transition-all duration-300 cursor-pointer",
                    displayMode === "portrait"
                      ? "border-white/30 bg-white/10"
                      : "border-white/10 bg-white/5 hover:border-white/20",
                  )}
                  onClick={() => handleDisplayModeChange("portrait")}
                  data-testid="setup-display-mode-portrait"
                >
                  {displayMode === "portrait" && (
                    <div className="absolute top-3 right-3 z-10">
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/20 border border-white/30">
                        <Icon name="check" size={14} className="text-white" />
                        <span className="text-xs text-white font-medium">
                          Selected
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="p-2 md:p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Icon name="user" size={20} className="text-white/80" />
                      <h3 className="text-base font-semibold text-white">
                        Portrait Mode
                      </h3>
                    </div>

                    {/* Preview */}
                    <div className="aspect-video rounded-lg bg-gradient-to-br from-white/20 to-white/10 border border-white/10 overflow-hidden mb-3 relative">
                      <VirtualAssistant
                        ref={portraitRef}
                        isPreview={true}
                        portraitMode={true}
                        previewWidth="100%"
                        previewHeight="100%"
                        previewClassName="rounded-lg"
                      />
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex items-start gap-2 text-white/80">
                        <Icon
                          name="check"
                          size={12}
                          className="text-white/80 flex-shrink-0 mt-0.5"
                        />
                        <span>Upper body focus</span>
                      </div>
                      <div className="flex items-start gap-2 text-white/80">
                        <Icon
                          name="check"
                          size={12}
                          className="text-white/80 flex-shrink-0 mt-0.5"
                        />
                        <span>Compact and space-efficient</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {allowPositionSelection && (
              <div>
                <h3 className="text-lg font-semibold text-white mb-4">
                  Screen Position
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {positions.map((position) => {
                    const isSelected = selectedPosition === position.key;

                    return (
                      <button
                        key={position.key}
                        onClick={() => handlePositionChange(position.key)}
                        data-testid={`setup-position-${position.key}`}
                        className={cn(
                          "relative p-3 rounded-lg border-2 transition-all duration-300 text-left",
                          isSelected
                            ? "border-white/30 bg-white/10 shadow-lg shadow-white/20"
                            : "border-white/10 bg-white/5 hover:border-white/30 hover:bg-white/10",
                        )}
                      >
                        {isSelected && (
                          <div className="absolute top-1 right-1">
                            <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
                              <Icon
                                name="check"
                                size={12}
                                className="text-white"
                              />
                            </div>
                          </div>
                        )}

                        <div
                          className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center mb-2",
                            isSelected ? "bg-white/20" : "bg-white/10",
                          )}
                        >
                          <Icon
                            name={position.icon}
                            size={20}
                            className={
                              isSelected ? "text-white/70" : "text-white/60"
                            }
                          />
                        </div>

                        <h4 className="text-xs font-semibold text-white mb-1">
                          {position.label}
                        </h4>
                        <p className="text-[10px] text-white/60">
                          {position.description}
                        </p>

                        {position.key === "bottom-right" && (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-medium bg-white/10 text-white/80 border border-white/20 mt-1">
                            Default
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-white/60 mt-3 flex items-center gap-1.5">
                  <Icon name="idea" size={14} className="text-white/80" />
                  You can drag the character anywhere on screen later
                </p>
              </div>
            )}
          </>
        ) : (
          /* Character DISABLED - Show Chat-Only Benefits */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Preview */}
            <div className="space-y-4">
              <div className="aspect-video rounded-lg bg-gradient-to-br from-white/20 to-white/10 border border-white/10 overflow-hidden relative flex items-center justify-center">
                <div className="text-center p-6">
                  <Icon
                    name="message-circle"
                    size={64}
                    className="text-white/80 mx-auto mb-3 opacity-50"
                  />
                  <p className="text-white/60 text-sm">Chat-Only Mode</p>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Icon name="sparkles" size={16} className="text-white/80" />
                  Chat-Only Benefits
                </h3>
                <ul className="space-y-2 text-xs text-white/70">
                  <li className="flex items-start gap-2">
                    <Icon
                      name="check"
                      size={14}
                      className="text-white/80 flex-shrink-0 mt-0.5"
                    />
                    <span>Lightweight and minimal interface</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Icon
                      name="check"
                      size={14}
                      className="text-white/80 flex-shrink-0 mt-0.5"
                    />
                    <span>Clean, distraction-free experience</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Icon
                      name="check"
                      size={14}
                      className="text-white/80 flex-shrink-0 mt-0.5"
                    />
                    <span>Full AI capabilities remain available</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Icon
                      name="check"
                      size={14}
                      className="text-white/80 flex-shrink-0 mt-0.5"
                    />
                    <span>Simple floating chat button interface</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Right: Description */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-white mb-3">
                  About Chat-Only Mode
                </h3>
                <p className="text-sm text-white/80 leading-relaxed mb-4">
                  In chat-only mode, you'll interact with your AI assistant
                  through a clean, minimal chat interface without the 3D
                  character. Perfect for those who prefer a distraction-free,
                  text-focused experience.
                </p>
              </div>

              <div className="p-2 md:p-4 rounded-lg bg-white/10 border border-white/20">
                <div className="flex items-start gap-2">
                  <Icon
                    name="info"
                    size={16}
                    className="text-white/70 flex-shrink-0 mt-0.5"
                  />
                  <p className="text-xs text-white/70">
                    <strong>
                      You can always enable the 3D character later
                    </strong>{" "}
                    from settings. This just sets your initial preference.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Additional Info */}
      <Card
        variant="elevated"
        padding="none"
        className="rounded-xl p-2 md:p-4 mb-6"
      >
        <div className="flex items-start gap-3">
          <Icon
            name="info"
            size={20}
            className="text-white/80 flex-shrink-0 mt-0.5"
          />
          <div>
            <h4 className="text-sm font-semibold text-white mb-1">
              You can change this later
            </h4>
            <p className="text-xs text-white/80">
              All these settings can be modified anytime in Settings → UI. Your
              selection here just sets the initial configuration.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default CharacterIntroStep;
