/**
 * Chrome AI Validator Service
 *
 * Validates Chrome Built-in AI availability and provides setup instructions.
 */

import { ChromeAIFlags, ChromeAIAvailability } from "../config/aiConfig";
import Logger from "./LoggerService";

type AvailabilityStatus = {
  available: boolean;
  state: string;
  message: string;
  details: string;
  requiresFlags: boolean;
  flags: Array<{
    flag: string;
    value: string;
    url: string;
    description: string;
  }>;
  progress?: number;
  error?: string;
};

type LanguageModelApi = {
  availability: () => Promise<string>;
  create: (options: Record<string, unknown>) => Promise<{
    destroy: () => void;
    prompt: (input: string) => Promise<string>;
  }>;
  params: () => Promise<{
    defaultTopK: number;
    maxTopK: number;
    defaultTemperature: number;
    maxTemperature: number;
  }>;
};

class ChromeAIValidator {
  private lastCheck: AvailabilityStatus | null;
  private downloadProgress: number;

  constructor() {
    this.lastCheck = null;
    this.downloadProgress = 0;
  }

  private getLanguageModelApi(): LanguageModelApi | null {
    const modelApi = (self as unknown as { LanguageModel?: LanguageModelApi })
      .LanguageModel;
    return modelApi ?? null;
  }

  /**
   * Get Chrome version
   * @returns {number|null} Chrome version number or null if not Chrome
   */
  getChromeVersion(): number | null {
    const userAgent = navigator.userAgent;
    const match = userAgent.match(/Chrome\/(\d+)/);
    return match?.[1] ? parseInt(match[1], 10) : null;
  }

  /**
   * Check if Chrome version meets minimum requirement
   * @returns {boolean} True if Chrome 138+
   */
  hasMinimumChromeVersion(): boolean {
    const version = this.getChromeVersion();
    return version !== null && version >= 138;
  }

  /**
   * Check if Chrome AI (LanguageModel API) is available
   * @returns {boolean} True if LanguageModel exists in global scope
   */
  isSupported(): boolean {
    const supported = !!this.getLanguageModelApi();
    Logger.log("ChromeAIValidator", "LanguageModel API supported:", supported);
    return supported;
  }

  /**
   * Get current availability status
   * @returns {Promise<Object>} Status object
   */
  async checkAvailability(): Promise<AvailabilityStatus> {
    Logger.log("ChromeAIValidator", "Checking availability...");

    if (!this.isSupported()) {
      const status = {
        available: false,
        state: ChromeAIAvailability.UNAVAILABLE,
        message: "Chrome AI not supported",
        details: "Chrome 138+ required with LanguageModel API",
        requiresFlags: true,
        flags: this.getRequiredFlags(),
      };

      this.lastCheck = status;
      return status;
    }

    try {
      const languageModelApi = this.getLanguageModelApi();
      if (!languageModelApi) {
        throw new Error("LanguageModel API unavailable");
      }
      const availability = await languageModelApi.availability();

      Logger.log("ChromeAIValidator", "Availability state:", availability);

      const status: AvailabilityStatus = {
        available: false,
        state: String(availability),
        message: "",
        details: "",
        requiresFlags: false,
        flags: this.getRequiredFlags(),
      };

      switch (availability) {
        case ChromeAIAvailability.UNAVAILABLE:
        case "no":
          status.message = "Chrome AI not available on this device";
          status.details =
            "Hardware requirements: 4GB+ VRAM or 16GB+ RAM with 4+ cores. Check Chrome flags.";
          status.requiresFlags = true;
          break;

        case ChromeAIAvailability.DOWNLOADABLE:
        case "after-download":
        case "downloadable":
          status.message = "Gemini Nano model needs to be downloaded";
          status.details =
            'Click "Start Model Download" below or visit chrome://components';
          status.requiresFlags = false;
          break;

        case ChromeAIAvailability.DOWNLOADING:
        case "downloading":
          status.message = "Gemini Nano model is downloading...";
          status.details = "Download in progress. This may take a while.";
          status.requiresFlags = false;
          status.progress = this.downloadProgress;
          break;

        case ChromeAIAvailability.READILY:
        case ChromeAIAvailability.AVAILABLE:
        case "readily":
        case "available":
          status.available = true;
          status.message = "Chrome AI ready";
          status.details = "Gemini Nano model loaded and ready to use";
          status.requiresFlags = false;
          break;

        default:
          status.message = `Unknown state: ${availability}`;
          status.details =
            "Please check Chrome flags and model download status";
          status.requiresFlags = true;
      }

      this.lastCheck = status;
      return status;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Logger.error("ChromeAIValidator", "Availability check failed:", error);

      const status = {
        available: false,
        state: ChromeAIAvailability.UNAVAILABLE,
        message: "Failed to check Chrome AI availability",
        details: message,
        requiresFlags: true,
        flags: this.getRequiredFlags(),
        error: message,
      };

      this.lastCheck = status;
      return status;
    }
  }

  /**
   * Monitor download progress
   * NOTE: downloadprogress events only fire when LanguageModel.create()
   * actually initiates the download. If download is already in progress
   * (from chrome://components or another call), events won't fire.
   * @param {Function} onProgress - Callback ({ progress: number, details: string }) => void
   * @returns {Promise<void>}
   */
  async monitorDownload(
    onProgress:
      | ((payload: { progress: number; details: string }) => void)
      | undefined,
  ): Promise<{ success: boolean; message: string }> {
    if (!this.isSupported()) {
      throw new Error("Chrome AI not supported");
    }

    Logger.log("ChromeAIValidator", "Starting download monitor...");

    try {
      const validator = this;
      const languageModelApi = this.getLanguageModelApi();
      if (!languageModelApi) {
        throw new Error("LanguageModel API unavailable");
      }

      const session = await languageModelApi.create({
        language: "en",
        monitor(m: {
          ondownloadprogress?: (event: { loaded: number }) => void;
        }) {
          Logger.log("ChromeAIValidator", "Monitor callback called", m);

          m.ondownloadprogress = (e: { loaded: number }) => {
            const progress = e.loaded * 100;
            const details = `Downloading model: ${progress.toFixed(1)}%`;

            Logger.log(
              "ChromeAIValidator",
              `Download progress event: ${progress.toFixed(1)}%`,
              e,
            );

            validator.downloadProgress = progress;

            if (onProgress) {
              onProgress({ progress, details });
            }
          };
        },
      });

      Logger.log(
        "ChromeAIValidator",
        "Session created successfully, destroying...",
        session,
      );
      session.destroy();
      Logger.log("ChromeAIValidator", "Session destroyed");

      // Return success response matching background handler format
      return {
        success: true,
        message:
          "Download initiated successfully. The model is now downloading in the background. Please check chrome://on-device-internals/ to monitor progress, then refresh the status in settings.",
      };
    } catch (error) {
      Logger.error("ChromeAIValidator", "Download monitor error:", error);
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  /**
   * Get required Chrome flags with instructions
   * @param {boolean} includeMultimodal - Include multimodal flag for STT
   * @returns {Array<Object>} Array of flag objects
   */
  getRequiredFlags(
    includeMultimodal = false,
  ): Array<{ flag: string; value: string; url: string; description: string }> {
    const flags = [ChromeAIFlags.OPTIMIZATION_GUIDE, ChromeAIFlags.PROMPT_API];

    if (includeMultimodal) {
      flags.push(ChromeAIFlags.MULTIMODAL_INPUT);
    }

    return flags;
  }

  /**
   * Get setup instructions
   * @param {boolean} includeMultimodal - Include multimodal flag for STT
   * @returns {Object} Setup instructions
   */
  getSetupInstructions(includeMultimodal = false): Record<string, unknown> {
    return {
      title: "Chrome AI Setup Instructions",
      steps: [
        {
          number: 1,
          title: "Enable Chrome Flags",
          description:
            "Navigate to chrome://flags and enable the required flags",
          flags: this.getRequiredFlags(includeMultimodal),
        },
        {
          number: 2,
          title: "Restart Chrome",
          description: "Restart your browser for flags to take effect",
        },
        {
          number: 3,
          title: "Download Model",
          description: "Go to chrome://components",
          details: [
            'Find "Optimization Guide On Device Model"',
            'Click "Check for update"',
            "Wait for download to complete",
            "Monitor progress at chrome://on-device-internals/",
          ],
        },
        {
          number: 4,
          title: "Verify Installation",
          description: "Return to settings and test the connection",
        },
      ],
      requirements: {
        chrome: "Chrome 138 or later",
        hardware: "4GB+ VRAM (GPU) or 16GB+ RAM with 4+ cores (CPU)",
        storage: "free space",
        network: "Unmetered connection recommended for initial download",
      },
      troubleshooting: [
        {
          issue: "Component not appearing",
          solution:
            "Toggle flags off and on, then restart Chrome multiple times",
        },
        {
          issue: "Download fails",
          solution: "Check available disk space and internet connection",
        },
        {
          issue: "Model not loading",
          solution: "Check chrome://on-device-internals/ for error messages",
        },
      ],
    };
  }

  /**
   * Get last check result
   * @returns {Object|null} Last status check
   */
  getLastCheck(): AvailabilityStatus | null {
    return this.lastCheck;
  }

  /**
   * Get model parameters (if available)
   * @returns {Promise<Object|null>} Model parameters or null
   */
  async getModelParams(): Promise<Record<string, number> | null> {
    if (!this.isSupported()) {
      return null;
    }

    try {
      const languageModelApi = this.getLanguageModelApi();
      if (!languageModelApi) {
        throw new Error("LanguageModel API unavailable");
      }
      const params = await languageModelApi.params();

      Logger.log("ChromeAIValidator", "Model params:", params);

      return {
        defaultTopK: params.defaultTopK,
        maxTopK: params.maxTopK,
        defaultTemperature: params.defaultTemperature,
        maxTemperature: params.maxTemperature,
        contextWindow: 1028, // Fixed for Gemini Nano
      };
    } catch (error) {
      Logger.error("ChromeAIValidator", "Failed to get model params:", error);
      return null;
    }
  }

  /**
   * Test if Chrome AI is fully functional
   * @returns {Promise<Object>} Test result
   */
  async testConnection(): Promise<Record<string, unknown>> {
    Logger.log("ChromeAIValidator", "Testing connection...");

    const status = await this.checkAvailability();

    if (!status.available) {
      return {
        success: false,
        message: status.message,
        details: status.details,
        status,
      };
    }

    try {
      const languageModelApi = this.getLanguageModelApi();
      if (!languageModelApi) {
        throw new Error("LanguageModel API unavailable");
      }
      const session = await languageModelApi.create({
        temperature: 1.0,
        topK: 3,
      });

      const response = await session.prompt('Say "OK" if you can hear me.');

      Logger.log("ChromeAIValidator", "Test response:", response);

      session.destroy();

      return {
        success: true,
        message: "Chrome AI connection successful",
        response: response,
        status,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Logger.error("ChromeAIValidator", "Test failed:", error);

      return {
        success: false,
        message: "Chrome AI test failed",
        error: message,
        details: this.getErrorDetails(error),
        status,
      };
    }
  }

  /**
   * Get user-friendly error details
   * @param {Error} error - Error object
   * @returns {string} Error details
   */
  getErrorDetails(error: unknown): string {
    const err = error instanceof Error ? error : new Error(String(error));
    if (err.name === "NotSupportedError") {
      return "Chrome AI not supported on this device. Check hardware requirements.";
    }

    if (err.name === "QuotaExceededError") {
      return "Context window full (1028 tokens). Start a new conversation.";
    }

    if (err.message?.includes("model")) {
      return "Model not downloaded. Visit chrome://components to download.";
    }

    if (err.message?.includes("flag")) {
      return "Required flags not enabled. Visit chrome://flags and enable all required flags.";
    }

    return err.message || "Unknown error occurred";
  }
}

// Export singleton instance
export default new ChromeAIValidator();
