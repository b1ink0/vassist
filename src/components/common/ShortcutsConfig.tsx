/**
 * @fileoverview Shared Keyboard Shortcuts configuration component.
 * Handles keyboard shortcut recording and management.
 */

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Icon } from "../icons";
import { cn } from "../../utils/cn";
import { Button, SettingsRow } from "../ui";
import Toggle from "./Toggle";
import SettingsGroup from "../settings/shared/SettingsGroup";

type ShortcutKey = "openChat" | "toggleMode" | "toggleVisibility";

interface KeyboardShortcuts {
  enabled: boolean;
  openChat: string;
  toggleMode: string;
  toggleVisibility: string;
}

interface ShortcutInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled: boolean;
  isLightBackground: boolean;
  testId: string;
}

interface ShortcutsConfigProps {
  shortcuts?: Partial<KeyboardShortcuts>;
  onShortcutsChange: (nextShortcuts: KeyboardShortcuts) => void;
  isLightBackground?: boolean;
}

const DEFAULT_SHORTCUTS: KeyboardShortcuts = {
  enabled: false,
  openChat: "",
  toggleMode: "",
  toggleVisibility: "",
};

/**
 * Formats key combination for display.
 *
 * @param {string} combo - Key combination string (e.g., 'Ctrl+Shift+C')
 * @returns {string} Formatted key combination
 */
const formatKeyCombo = (combo: string): string => {
  if (!combo) return "Not set";

  // Standardize separator
  const keys = combo.split("+").map((k) => k.trim());

  // Map to display names
  const displayKeys = keys.map((key) => {
    const lowerKey = key.toLowerCase();
    if (lowerKey === "ctrl" || lowerKey === "control") return "Ctrl";
    if (lowerKey === "alt") return "Alt";
    if (lowerKey === "shift") return "Shift";
    if (lowerKey === "meta" || lowerKey === "cmd" || lowerKey === "command")
      return "Meta";
    return key.toUpperCase();
  });

  return displayKeys.join("+");
};

/**
 * Parses keyboard event into a key combination string.
 *
 * @param {KeyboardEvent} event - Keyboard event
 * @returns {string|null} Key combination string or null if invalid
 */
const parseKeyEvent = (event: KeyboardEvent): string | null => {
  const modifiers = [];
  let mainKey = event.key;

  // Ignore modifier-only presses
  if (["Control", "Alt", "Shift", "Meta"].includes(mainKey)) {
    return null;
  }

  // Collect modifiers
  if (event.ctrlKey) modifiers.push("Ctrl");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  if (event.metaKey) modifiers.push("Meta");

  // Require at least one modifier to avoid conflicts
  if (modifiers.length === 0) {
    return null;
  }

  // Normalize key name
  if (mainKey.length === 1) {
    mainKey = mainKey.toUpperCase();
  }

  return [...modifiers, mainKey].join("+");
};

/**
 * Keyboard shortcut input component.
 *
 * @component
 * @param {Object} props - Component props
 * @param {string} props.value - Current shortcut value
 * @param {Function} props.onChange - Callback when shortcut changes
 * @param {string} props.placeholder - Placeholder text
 * @param {boolean} props.disabled - Whether input is disabled
 * @param {boolean} props.isLightBackground - Whether background is light
 * @returns {JSX.Element} Shortcut input component
 */
const ShortcutInput = ({
  value,
  onChange,
  placeholder,
  disabled,
  isLightBackground,
  testId,
}: ShortcutInputProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const inputRef = useRef<HTMLDivElement | null>(null);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!isRecording) return;

      event.preventDefault();
      event.stopPropagation();

      const combo = parseKeyEvent(event);
      if (combo) {
        onChange(combo);
        setIsRecording(false);
        inputRef.current?.blur();
      }
    },
    [isRecording, onChange],
  );

  useEffect(() => {
    if (isRecording) {
      window.addEventListener("keydown", handleKeyDown, true);
      return () => window.removeEventListener("keydown", handleKeyDown, true);
    }
  }, [isRecording, handleKeyDown]);

  const handleClick = () => {
    if (!disabled) {
      setIsRecording(true);
      inputRef.current?.focus();
    }
  };

  const handleClear = (e: ReactMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onChange("");
    setIsRecording(false);
  };

  return (
    <div className="flex items-center gap-2">
      <div
        ref={inputRef}
        tabIndex={disabled ? -1 : 0}
        onClick={handleClick}
        data-testid={testId}
        className={cn(
          "glass-input",
          isLightBackground && "glass-input-dark",
          "flex-1 cursor-pointer transition-all",
          isRecording && "shadow-[inset_0_0_0_1px_#8886]",
          disabled && "opacity-50 cursor-not-allowed",
        )}
      >
        <span
          className={cn(
            "text-sm",
            isRecording
              ? "vassist-text-primary"
              : value
                ? "vassist-text-primary"
                : "vassist-text-muted",
          )}
        >
          {isRecording ? "Press keys..." : formatKeyCombo(value) || placeholder}
        </span>
      </div>

      {value && !disabled && (
        <Button
          onClick={handleClear}
          data-testid={`${testId}-clear`}
          variant="default"
          className={cn(
            "p-2 transition-colors",
            isLightBackground
              ? "hover:bg-black/20 vassist-text-muted hover:vassist-text-primary"
              : "hover:bg-current/10 vassist-text-muted hover:vassist-text-primary",
          )}
          title="Clear shortcut"
        >
          <Icon name="close" size={16} />
        </Button>
      )}
    </div>
  );
};

/**
 * Keyboard shortcuts configuration component.
 *
 * @component
 * @param {Object} props - Component props
 * @param {Object} props.shortcuts - Shortcuts configuration object with { enabled, openChat, toggleMode, toggleVisibility }
 * @param {Function} props.onShortcutsChange - Callback when shortcuts configuration changes
 * @param {boolean} [props.isLightBackground=false] - Whether background is light themed
 * @returns {JSX.Element} Shortcuts configuration panel
 */
const ShortcutsConfig = ({
  shortcuts = DEFAULT_SHORTCUTS,
  onShortcutsChange,
  isLightBackground = false,
}: ShortcutsConfigProps) => {
  const [localShortcuts, setLocalShortcuts] = useState<KeyboardShortcuts>({
    ...DEFAULT_SHORTCUTS,
    ...shortcuts,
  });
  const [conflict, setConflict] = useState<string | null>(null);

  // Sync with external changes
  useEffect(() => {
    setLocalShortcuts({
      ...DEFAULT_SHORTCUTS,
      ...shortcuts,
    });
  }, [shortcuts]);

  // Check for conflicts
  useEffect(() => {
    const shortcutEntries: Array<[string, string]> = [];
    if (localShortcuts.openChat) {
      shortcutEntries.push(["Open Chat", localShortcuts.openChat]);
    }
    if (localShortcuts.toggleMode) {
      shortcutEntries.push(["Toggle Avatar", localShortcuts.toggleMode]);
    }
    if (localShortcuts.toggleVisibility) {
      shortcutEntries.push([
        "Toggle App Visibility",
        localShortcuts.toggleVisibility,
      ]);
    }

    const seen = new Map<string, string>();
    let nextConflict: string | null = null;
    for (const [name, value] of shortcutEntries) {
      if (seen.has(value)) {
        nextConflict = `${seen.get(value)} and ${name} cannot use the same shortcut`;
        break;
      }
      seen.set(value, name);
    }

    setConflict(nextConflict);
  }, [
    localShortcuts.openChat,
    localShortcuts.toggleMode,
    localShortcuts.toggleVisibility,
  ]);

  const handleToggle = (enabled: boolean) => {
    const updated = { ...localShortcuts, enabled };
    setLocalShortcuts(updated);
    onShortcutsChange(updated);
  };

  const handleShortcutChange = (key: ShortcutKey, value: string) => {
    const updated = { ...localShortcuts, [key]: value };
    setLocalShortcuts(updated);
    onShortcutsChange(updated);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Enable/Disable Toggle */}
      <SettingsRow
        label="Enable Keyboard Shortcuts"
        description={
          localShortcuts.enabled
            ? "Shortcuts are active and will trigger actions"
            : "Shortcuts are disabled"
        }
      >
        <Toggle checked={localShortcuts.enabled} onChange={handleToggle} />
      </SettingsRow>

      {/* Shortcut Inputs */}
      <div className="flex flex-col gap-3">
        <h4 className="settings-group-heading">Shortcut Bindings</h4>

        {/* Open Chat Shortcut */}
        <SettingsRow
          label={
            <span className="flex items-center gap-2">
              <Icon name="message-circle" size={14} className="text-current" />
              Open Chat
            </span>
          }
          description={<>Shortcut to open the chat interface</>}
          layout="stacked"
        >
          <ShortcutInput
            value={localShortcuts.openChat}
            onChange={(value) => handleShortcutChange("openChat", value)}
            placeholder="Click to set shortcut"
            disabled={!localShortcuts.enabled}
            isLightBackground={isLightBackground}
            testId="shortcut-input-open-chat"
          />
        </SettingsRow>

        {/* Toggle Mode Shortcut */}
        <SettingsRow
          label={
            <span className="flex items-center gap-2">
              <Icon name="eye" size={14} className="text-current" />
              Toggle Avatar
            </span>
          }
          description={<>Shortcut to toggle avatar visibility (show/hide)</>}
          layout="stacked"
        >
          <ShortcutInput
            value={localShortcuts.toggleMode}
            onChange={(value) => handleShortcutChange("toggleMode", value)}
            placeholder="Click to set shortcut"
            disabled={!localShortcuts.enabled}
            isLightBackground={isLightBackground}
            testId="shortcut-input-toggle-avatar"
          />
        </SettingsRow>

        {/* Toggle App Visibility Shortcut */}
        <SettingsRow
          label={
            <span className="flex items-center gap-2">
              <Icon name="eye-off" size={14} className="text-current" />
              Toggle App Visibility
            </span>
          }
          description={
            <>
              Fully hide/unhide the desktop app (same intent as tray Show/Hide)
            </>
          }
          layout="stacked"
        >
          <ShortcutInput
            value={localShortcuts.toggleVisibility}
            onChange={(value) =>
              handleShortcutChange("toggleVisibility", value)
            }
            placeholder="Click to set shortcut"
            disabled={!localShortcuts.enabled}
            isLightBackground={isLightBackground}
            testId="shortcut-input-toggle-visibility"
          />
        </SettingsRow>
      </div>

      {/* Conflict Warning */}
      {conflict && (
        <SettingsGroup className="p-3 border-red-500/30 bg-red-900/10 flex items-start gap-2">
          <Icon
            name="alert"
            size={16}
            className="text-red-400 flex-shrink-0 pt-0.5"
          />
          <div>
            <p className="text-sm text-red-100 font-medium">
              Shortcut Conflict
            </p>
            <p className="text-xs text-red-200/80 pt-1">{conflict}</p>
          </div>
        </SettingsGroup>
      )}

      {/* Info Box */}
      <SettingsGroup className="p-3 ">
        <div className="flex items-start gap-2">
          <Icon
            name="idea"
            size={14}
            className="text-current flex-shrink-0 pt-0.5"
          />
          <div className="text-xs vassist-text-muted">
            <p className="font-semibold pb-1">Tips</p>
            <ul className="flex flex-col gap-0.5">
              <li>
                Use modifier keys (Ctrl, Alt, Shift, Meta) to avoid conflicts
              </li>
              <li>Avoid common browser shortcuts (Ctrl+T, Ctrl+W, etc.)</li>
              <li>
                Click the input field and press your desired key combination
              </li>
              <li>Enable shortcuts after setting all bindings</li>
            </ul>
          </div>
        </div>
      </SettingsGroup>
    </div>
  );
};

export default ShortcutsConfig;
