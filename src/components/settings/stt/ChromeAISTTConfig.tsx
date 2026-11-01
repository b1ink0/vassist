/**
 * Chrome AI Multimodal STT Configuration Component
 * Shared between Settings and Setup Wizard
 */

import { useEffect, useRef } from "react";
import { Icon } from "../../icons";
import { ChromeAILanguages } from "../../../config/aiConfig";
import StatusMessage from "../../common/StatusMessage";
import Logger from "../../../services/common/LoggerService";
import { Button, Select } from "../../ui";
import SettingsDisclosure from "../shared/SettingsDisclosure";
import SettingsRow from "../../ui/SettingsRow";

interface ChromeAISTTConfigShape {
  outputLanguage?: string;
  language?: string;
}

interface ChromeAiStatusShape {
  checking: boolean;
  state: string | null;
  message: string;
  details: string;
  downloading: boolean;
}

interface ChromeAISTTConfigProps {
  config: ChromeAISTTConfigShape;
  onChange: (updates: ChromeAISTTConfigShape) => void;
  chromeAiStatus: ChromeAiStatusShape;
  onCheckStatus?: () => void;
  onStartDownload?: () => void;
  isLightBackground?: boolean;
  isSetupMode?: boolean;
}

const ChromeAISTTConfig = ({
  config,
  onChange,
  chromeAiStatus,
  onCheckStatus,
  onStartDownload,
  isLightBackground = false,
}: ChromeAISTTConfigProps) => {
  const hasCheckedRef = useRef(false);

  useEffect(() => {
    if (onCheckStatus && !hasCheckedRef.current) {
      Logger.log("ChromeAISTTConfig", "Auto-checking status on mount");
      hasCheckedRef.current = true;
      onCheckStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const languageOptions = [
    { code: ChromeAILanguages.ENGLISH, name: "English" },
    { code: ChromeAILanguages.SPANISH, name: "Spanish" },
    { code: ChromeAILanguages.JAPANESE, name: "Japanese" },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Info Banner */}
      <div className="pt-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
        <div className="flex items-start gap-2">
          <Icon
            name="ai"
            size={18}
            className="text-blue-400 flex-shrink-0 pt-0.5"
          />
          <p className="text-xs text-blue-300">
            <span className="font-semibold">Chrome Built-in AI Multimodal</span>{" "}
            - On-device audio transcription using Gemini Nano. No API key
            needed, works offline!
          </p>
        </div>
      </div>

      {/* Availability Status */}
      <div className="flex flex-col gap-2">
        <label className="block text-sm font-medium vassist-text-primary">
          Status
        </label>
        <div className="settings-section">
          {!chromeAiStatus || chromeAiStatus.checking ? (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
              <span className="text-xs vassist-text-secondary">
                {!chromeAiStatus ? "Checking availability..." : "Rechecking..."}
              </span>
            </div>
          ) : chromeAiStatus.state ? (
            <>
              <StatusMessage
                message={chromeAiStatus.message}
                isLightBackground={isLightBackground}
                className="pb-2"
              />
              <p className="text-xs vassist-text-muted">
                {chromeAiStatus.details}
              </p>

              {/* Download Progress */}
              {chromeAiStatus.downloading && (
                <div className="pt-3 flex flex-col gap-2">
                  <div className="p-2 rounded bg-yellow-500/10 border border-yellow-500/20">
                    <p className="text-xs text-yellow-300">
                      Download in progress. For real-time progress, visit{" "}
                      <a
                        href="chrome://on-device-internals/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-yellow-200"
                      >
                        chrome://on-device-internals/
                      </a>
                    </p>
                  </div>
                </div>
              )}

              {/* Download Button */}
              {(chromeAiStatus.state === "downloadable" ||
                chromeAiStatus.state === "after-download") &&
                !chromeAiStatus.downloading &&
                onStartDownload && (
                  <Button
                    onClick={onStartDownload}
                    variant={isLightBackground ? "dark" : "default"}
                    className="pt-3 text-xs w-full flex items-center justify-center gap-2"
                  >
                    <Icon name="download" size={14} />
                    <span>Start Model Download</span>
                  </Button>
                )}

              {/* Refresh Status Button - always show when status exists */}
              {onCheckStatus && (
                <button
                  onClick={onCheckStatus}
                  disabled={chromeAiStatus.checking}
                  className="pt-2 text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 disabled:opacity-50"
                >
                  <Icon
                    name="refresh"
                    size={12}
                    className={chromeAiStatus.checking ? "animate-spin" : ""}
                  />
                  <span>
                    {chromeAiStatus.checking ? "Checking..." : "Refresh Status"}
                  </span>
                </button>
              )}
            </>
          ) : null}
        </div>
      </div>

      {/* Output Language */}
      <SettingsRow
        label="Output Language"
        description="Language for transcription output. Chrome AI currently supports: English, Spanish, and Japanese."
        layout="stacked"
      >
        <Select
          value={
            config.outputLanguage ||
            config.language ||
            ChromeAILanguages.ENGLISH
          }
          onChange={(e) =>
            onChange({
              ...config,
              outputLanguage: e.target.value,
              language: e.target.value,
            })
          }
          variant={isLightBackground ? "dark" : "default"}
          options={languageOptions.map((lang) => ({
            value: lang.code,
            label: `${lang.name} (${lang.code})`,
          }))}
        />
      </SettingsRow>

      {/* Required Flags */}
      <SettingsDisclosure
        title={
          <>
            <span>Required Chrome Flags</span>
          </>
        }
      >
        <div className="pt-2 flex flex-col gap-2 text-xs settings-section">
          <div className="flex items-center justify-between">
            <code className="vassist-text-secondary">
              optimization-guide-on-device-model
            </code>
            <button
              onClick={() =>
                navigator.clipboard.writeText(
                  "chrome://flags/#optimization-guide-on-device-model",
                )
              }
              className="text-blue-400 hover:text-blue-300 text-xs"
            >
              Copy
            </button>
          </div>
          <div className="flex items-center justify-between">
            <code className="vassist-text-secondary">
              prompt-api-for-gemini-nano-multimodal-input
            </code>
            <button
              onClick={() =>
                navigator.clipboard.writeText(
                  "chrome://flags/#prompt-api-for-gemini-nano-multimodal-input",
                )
              }
              className="text-blue-400 hover:text-blue-300 text-xs"
            >
              Copy
            </button>
          </div>
          <p className="vassist-text-muted pt-2">
            Enable these flags and restart Chrome, then visit{" "}
            <code className="text-blue-300">chrome://components</code> to
            download Gemini Nano
          </p>
        </div>
      </SettingsDisclosure>
    </div>
  );
};

export default ChromeAISTTConfig;
