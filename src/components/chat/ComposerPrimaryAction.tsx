import { Button } from "../ui";
import { Icon } from "../icons";

const actions = {
  voice: {
    icon: "waveform",
    label: "Start voice conversation",
    testId: "chat-voice-mode-button",
  },
  send: { icon: "arrow-up", label: "Send message", testId: "chat-send-button" },
  stop: { icon: "stop", label: "Stop reply", testId: "chat-stop-button" },
  "finish-recording": {
    icon: "check",
    label: "Finish recording",
    testId: "chat-recording-done-button",
  },
  "end-voice": {
    icon: "phone",
    label: "End voice conversation",
    testId: "chat-voice-close-button",
  },
  processing: {
    icon: "loading",
    label: "Processing audio",
    testId: "chat-audio-processing-button",
  },
} as const;

export type ComposerAction = keyof typeof actions;

export function ComposerPrimaryAction({
  action,
  onClick,
  disabled,
  isLightBackground,
}: {
  action: ComposerAction;
  onClick: () => void;
  disabled?: boolean;
  isLightBackground: boolean;
}) {
  const { icon, label, testId } = actions[action];
  return (
    <Button
      type="button"
      variant={isLightBackground ? "dark" : "default"}
      className="composer-primary h-[54px] w-[54px] shrink-0 rounded-full p-0"
      data-testid={testId}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon
        name={icon}
        size={22}
        className={
          action === "processing"
            ? "animate-spin"
            : action === "end-voice"
              ? "rotate-[135deg]"
              : ""
        }
      />
    </Button>
  );
}
