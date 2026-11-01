/**
 * @fileoverview Unified dialog component for confirmations and inputs.
 * Handles delete confirmations (chat, model, motion) and edit operations.
 */

import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { cn } from "../../utils/cn";
import { Button, Input } from "../ui";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { Icon } from "../icons";
import { useEmbedHost } from "../../embed/EmbedHostContext";
import { resolveConfiguredPortalContainer } from "../../embed/portalContainers";
import { resolvePortalContainer } from "../../utils/resolvePortalContainer";
import { useSpatialHtmlPanelHost } from "../xr/SpatialHtmlPanelContext";
import { useSettingsTheme } from "../settings/SettingsThemeContext";
import SettingsScrollArea from "../settings/shared/SettingsScrollArea";
import { useUIConfig } from "../../hooks/config/useConfigUI";
import { isDesktop } from "../../utils/PlatformUtils";

type DialogType = "delete" | "edit" | "confirm" | "input";

interface DialogProps {
  type?: DialogType;
  title: string;
  message?: string;
  itemId?: string;
  initialValue?: string;
  inputPlaceholder?: string;
  inputMaxLength?: number;
  isLightBackground?: boolean;
  animationClass?: string;
  confirmLabel?: string;
  confirmStyle?: "primary" | "error";
  cancelLabel?: string;
  onConfirm: (itemId?: string, value?: string) => Promise<void> | void;
  onCancel: () => void;
  /** Clear caller-owned dialog state after the successful exit animation. */
  onConfirmComplete?: () => void;
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return "An error occurred";
};

/**
 * Unified dialog component for various modal interactions.
 *
 * @component
 * @param {Object} props - Component props
 * @param {'delete'|'edit'|'confirm'|'input'} props.type - Type of dialog
 * @param {string} props.title - Dialog title
 * @param {string} props.message - Dialog message/description
 * @param {string} [props.itemId] - ID of item being operated on
 * @param {string} [props.initialValue] - Initial value for edit/input dialogs
 * @param {string} [props.inputPlaceholder] - Placeholder for input field
 * @param {number} [props.inputMaxLength] - Max length for input field
 * @param {boolean} [props.isLightBackground=false] - Whether background is light
 * @param {string} [props.animationClass=''] - CSS animation class
 * @param {string} [props.confirmLabel='Confirm'] - Label for confirm button
 * @param {string} [props.confirmStyle='primary'] - Style for confirm button ('primary'|'error')
 * @param {string} [props.cancelLabel='Cancel'] - Label for cancel button
 * @param {Function} props.onConfirm - Callback when confirmed (receives itemId and value for edit/input)
 * @param {Function} props.onCancel - Callback when cancelled
 * @returns {JSX.Element} Dialog component
 */
const Dialog = ({
  type = "confirm",
  title,
  message,
  itemId,
  initialValue = "",
  inputPlaceholder = "",
  inputMaxLength = 100,
  isLightBackground = false,
  animationClass = "",
  confirmLabel = "Confirm",
  confirmStyle = "primary",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  onConfirmComplete,
}: DialogProps) => {
  const { embedConfig } = useEmbedHost();
  const spatialHost = useSpatialHtmlPanelHost();
  const settingsTheme = useSettingsTheme();
  const uiConfig = useUIConfig();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const portalContainer =
    spatialHost ??
    resolveConfiguredPortalContainer(
      embedConfig,
      "popovers",
      resolvePortalContainer(undefined, anchor),
    );
  const [inputValue, setInputValue] = useState(initialValue);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [open, setOpen] = useState(true);
  const cancelled = useRef(false);
  useEffect(() => {
    if (animationClass.includes("animate-fade-out")) setOpen(false);
  }, [animationClass]);

  /**
   * Handles confirm button click.
   */
  const handleConfirm = async () => {
    // Validate input for edit/input types
    if ((type === "edit" || type === "input") && !inputValue.trim()) {
      return;
    }

    setIsProcessing(true);
    setErrorMessage("");
    try {
      if (type === "edit" || type === "input") {
        await onConfirm(itemId, inputValue);
      } else {
        await onConfirm(itemId);
      }
      setIsProcessing(false);
      if (onConfirmComplete) setOpen(false);
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
      setIsProcessing(false);
    }
  };

  const inputDialog = type === "edit" || type === "input";
  const theme =
    settingsTheme ??
    (isLightBackground
      ? "dark"
      : isDesktop && uiConfig.desktopMode.mode === "floating-app"
        ? "opaque-light"
        : "light");
  return (
    <BaseDialog.Root
      open={open}
      disablePointerDismissal={isProcessing}
      onOpenChange={(open, event) => {
        if (!open) {
          if (isProcessing) event.cancel();
          else {
            cancelled.current = true;
            setOpen(false);
          }
        }
      }}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) {
          if (cancelled.current) onCancel();
          else onConfirmComplete?.();
        }
      }}
    >
      <span ref={setAnchor} />
      <BaseDialog.Portal container={portalContainer}>
        <BaseDialog.Backdrop
          className={cn(
            "settings-dialog-backdrop fixed inset-0 z-[10100] bg-black/45 backdrop-blur-sm",
          )}
        />
        <BaseDialog.Viewport className="fixed inset-0 z-[10101] flex items-center justify-center overflow-hidden p-4">
          <BaseDialog.Popup
            initialFocus={inputDialog ? inputRef : cancelRef}
            className={cn(
              "settings-dialog settings-control-popup flex max-h-full w-full max-w-sm flex-col overflow-hidden rounded-2xl border shadow-xl outline-none",
              "settings-" + theme,
            )}
          >
            <SettingsScrollArea
              className="max-h-[min(36rem,calc(100dvh-2rem))]"
              contentClassName="flex flex-col gap-4 p-5"
            >
              <div className="flex items-center gap-3">
                <Icon
                  name={
                    type === "delete" ? "trash" : inputDialog ? "edit" : "info"
                  }
                  size={18}
                  className="text-current"
                />
                <BaseDialog.Title className="min-w-0 flex-1 text-base font-semibold">
                  {title}
                </BaseDialog.Title>
              </div>
              {message && (
                <BaseDialog.Description className="text-sm opacity-65">
                  {message}
                </BaseDialog.Description>
              )}
              {errorMessage && (
                <p
                  role="alert"
                  className="rounded-lg border border-current/15 bg-current/5 p-3 text-sm"
                >
                  {errorMessage}
                </p>
              )}
              {inputDialog && (
                <Input
                  ref={inputRef}
                  disableDebounce
                  value={inputValue}
                  onChange={(event) => setInputValue(event.target.value)}
                  placeholder={inputPlaceholder}
                  aria-label={inputPlaceholder || title}
                  maxLength={inputMaxLength}
                  disabled={isProcessing}
                  onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleConfirm();
                    }
                  }}
                />
              )}
              <div className="flex justify-end gap-2">
                <BaseDialog.Close
                  render={<Button variant="ghost" ref={cancelRef} />}
                  disabled={isProcessing}
                >
                  {cancelLabel}
                </BaseDialog.Close>
                <Button
                  onClick={() => void handleConfirm()}
                  disabled={isProcessing || (inputDialog && !inputValue.trim())}
                  variant={
                    confirmStyle === "error" || type === "delete"
                      ? "error"
                      : "ghost"
                  }
                >
                  {isProcessing ? (
                    <>
                      <Icon
                        name="loading-2"
                        size={14}
                        className="animate-spin"
                      />
                      Processing…
                    </>
                  ) : (
                    confirmLabel
                  )}
                </Button>
              </div>
            </SettingsScrollArea>
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
};
export default Dialog;
