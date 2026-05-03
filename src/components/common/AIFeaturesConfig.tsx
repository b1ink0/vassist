/**
 * @fileoverview Shared AI Features configuration component.
 * Reusable component used in both Settings and Setup Wizard.
 * Handles Translator, Language Detector, Summarizer, Rewriter, and Writer.
 */

import React, { useState } from "react";
import { Icon } from "../icons";
import Toggle from "../common/Toggle";
import StreamingContainer from "./StreamingContainer";
import StreamingText from "./StreamingText";
import { TranslationLanguages } from "../../config/aiConfig";
import { cn } from "../../utils/cn";
import { Button, Card, SettingsRow } from "../ui";

type TestStatus = "idle" | "loading" | "success" | "error";

interface TestResultState {
  status: TestStatus;
  message: string;
}

interface FeatureToggle {
  enabled?: boolean;
}

interface AIFeatureState {
  translator?: FeatureToggle;
  languageDetector?: FeatureToggle;
  summarizer?: FeatureToggle;
  rewriter?: FeatureToggle;
  writer?: FeatureToggle;
}

interface DetectedLanguageResult {
  detectedLanguage: string;
  confidence: number;
}

type TestTranslator = (
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
) => Promise<unknown>;
type TestLanguageDetector = (text: string) => Promise<unknown>;
type TestSummarizer = (
  text: string,
  options: { type: string; format: string; length: string },
) => Promise<unknown>;
type TestRewriter = (
  text: string,
  options: { tone: string },
) => Promise<unknown>;
type TestWriter = (
  prompt: string,
  options: { tone: string; length: string },
) => Promise<unknown>;

interface AIFeaturesConfigProps {
  features?: AIFeatureState;
  onFeatureChange?: (
    featureName: keyof AIFeatureState,
    enabled: boolean,
  ) => void;
  onTargetLanguageChange?: (languageCode: string) => void;
  defaultTargetLanguage?: string;
  testTranslator?: TestTranslator;
  testLanguageDetector?: TestLanguageDetector;
  testSummarizer?: TestSummarizer;
  testRewriter?: TestRewriter;
  testWriter?: TestWriter;
  isChromeAI?: boolean;
  needsFlags?: boolean;
  showTesting?: boolean;
  isLightBackground?: boolean;
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

/**
 * Displays test results with streaming animation.
 *
 * @component
 * @param {Object} props - Component props
 * @param {string} props.status - Test status: 'idle', 'loading', 'success', 'error'
 * @param {string} props.message - Test result message
 * @returns {JSX.Element|null} Test result component
 */
const TestResult = ({ status, message }: TestResultState) => {
  if (!status || status === "idle") return null;

  const bgClass =
    status === "success"
      ? "bg-emerald-900/10"
      : status === "loading"
        ? "bg-amber-900/10"
        : "bg-red-900/10";
  const textClass =
    status === "success"
      ? "text-emerald-100"
      : status === "loading"
        ? "text-amber-100"
        : "text-red-100";

  return (
    <StreamingContainer speed="fast" active={!!message}>
      <div className={cn("mt-2 rounded-lg p-2 text-sm", bgClass)}>
        <span className={textClass} style={{ whiteSpace: "pre-wrap" }}>
          {status === "loading" ? (
            <StreamingText
              text={message}
              wordsPerSecond={5}
              showCursor={true}
            />
          ) : (
            message
          )}
        </span>
      </div>
    </StreamingContainer>
  );
};

/**
 * AI Features configuration panel.
 *
 * @component
 * @param {Object} props - Component props
 * @param {Object} props.features - Feature flags object with translator, languageDetector, summarizer, rewriter properties
 * @param {Function} props.onFeatureChange - Callback when feature toggle changes (featureName, enabled)
 * @param {Function} [props.onTargetLanguageChange] - Optional callback when target language changes
 * @param {string} [props.defaultTargetLanguage='en'] - Default target language code
 * @param {Function} [props.testTranslator] - Optional translator test function
 * @param {Function} [props.testLanguageDetector] - Optional language detector test function
 * @param {Function} [props.testSummarizer] - Optional summarizer test function
 * @param {Function} [props.testRewriter] - Optional rewriter test function
 * @param {Function} [props.testWriter] - Optional writer test function
 * @param {boolean} [props.isChromeAI=false] - Whether Chrome AI is being used
 * @param {Object} [props.needsFlags] - Object indicating which features need Chrome flags enabled
 * @param {boolean} [props.showTesting=true] - Whether to show testing sections
 * @param {boolean} [props.isLightBackground=false] - Whether background is light themed
 * @returns {JSX.Element} AI Features configuration panel
 */
const AIFeaturesConfig = ({
  features = {},
  onFeatureChange,
  onTargetLanguageChange,
  defaultTargetLanguage = "en",
  testTranslator,
  testLanguageDetector,
  testSummarizer,
  testRewriter,
  testWriter,
  isChromeAI = false,
  needsFlags = false,
  showTesting = true,
  isLightBackground = false,
}: AIFeaturesConfigProps) => {
  const [translatorTest, setTranslatorTest] = useState<TestResultState>({
    status: "idle",
    message: "",
  });
  const [targetLanguage, setTargetLanguage] = useState(defaultTargetLanguage);
  const [languageDetectorTest, setLanguageDetectorTest] =
    useState<TestResultState>({ status: "idle", message: "" });
  const [languageDetectorInput, setLanguageDetectorInput] = useState(
    "Bonjour, comment allez-vous?",
  );
  const [summarizerTest, setSummarizerTest] = useState<TestResultState>({
    status: "idle",
    message: "",
  });
  const [rewriterTest, setRewriterTest] = useState<TestResultState>({
    status: "idle",
    message: "",
  });
  const [writerTest, setWriterTest] = useState<TestResultState>({
    status: "idle",
    message: "",
  });

  const handleTargetLanguageChange = (langCode: string) => {
    setTargetLanguage(langCode);
    if (onTargetLanguageChange) {
      onTargetLanguageChange(langCode);
    }
  };

  /**
   * Tests translator functionality.
   */
  const runTranslatorTest = async () => {
    if (!testTranslator) return;
    try {
      setTranslatorTest({ status: "loading", message: "Translating..." });
      const res = await testTranslator(
        "Hello, how are you?",
        "en",
        targetLanguage,
      );
      const msg = typeof res === "string" ? res : JSON.stringify(res);
      setTranslatorTest({
        status: "success",
        message: `Translation: "${msg}"`,
      });
    } catch (err: unknown) {
      setTranslatorTest({ status: "error", message: getErrorMessage(err) });
    }
  };

  /**
   * Tests language detector functionality.
   */
  const runLanguageDetectorTest = async () => {
    if (!testLanguageDetector) return;
    try {
      setLanguageDetectorTest({
        status: "loading",
        message: "Detecting language...",
      });
      const res = await testLanguageDetector(languageDetectorInput);

      if (Array.isArray(res) && res.length > 0) {
        const topResult = res[0] as DetectedLanguageResult;
        const msg = `Detected: ${topResult.detectedLanguage} (${(topResult.confidence * 100).toFixed(1)}% confidence)`;
        setLanguageDetectorTest({ status: "success", message: msg });
      } else {
        const msg = typeof res === "string" ? res : JSON.stringify(res);
        setLanguageDetectorTest({ status: "success", message: msg });
      }
    } catch (err: unknown) {
      setLanguageDetectorTest({
        status: "error",
        message: getErrorMessage(err),
      });
    }
  };

  /**
   * Tests summarizer functionality.
   */
  const runSummarizerTest = async () => {
    if (!testSummarizer) return;
    try {
      setSummarizerTest({ status: "loading", message: "Summarizing..." });
      const res = await testSummarizer(
        "Artificial intelligence (AI) is intelligence demonstrated by machines, in contrast to the natural intelligence displayed by humans. Leading AI textbooks define the field as the study of intelligent agents: any device that perceives its environment and takes actions that maximize its chance of successfully achieving its goals.",
        { type: "tldr", format: "plain-text", length: "medium" },
      );
      const msg = typeof res === "string" ? res : JSON.stringify(res);
      setSummarizerTest({
        status: "success",
        message: `Summary: "${msg.substring(0, 150)}${msg.length > 150 ? "..." : ""}"`,
      });
    } catch (err: unknown) {
      setSummarizerTest({ status: "error", message: getErrorMessage(err) });
    }
  };

  /**
   * Tests rewriter functionality.
   */
  const runRewriterTest = async () => {
    if (!testRewriter) return;
    try {
      setRewriterTest({ status: "loading", message: "Rewriting..." });
      const res = await testRewriter("The weather is nice today.", {
        tone: "more-formal",
      });
      const msg = typeof res === "string" ? res : JSON.stringify(res);
      setRewriterTest({ status: "success", message: `Rewritten: "${msg}"` });
    } catch (err: unknown) {
      setRewriterTest({ status: "error", message: getErrorMessage(err) });
    }
  };

  /**
   * Tests writer functionality.
   */
  const runWriterTest = async () => {
    if (!testWriter) return;
    try {
      setWriterTest({ status: "loading", message: "Writing..." });
      const res = await testWriter(
        "Write a short paragraph about AI benefits",
        { tone: "neutral", length: "short" },
      );
      const msg = typeof res === "string" ? res : JSON.stringify(res);
      setWriterTest({
        status: "success",
        message: `Written: "${msg.substring(0, 150)}${msg.length > 150 ? "..." : ""}"`,
      });
    } catch (err: unknown) {
      setWriterTest({ status: "error", message: getErrorMessage(err) });
    }
  };

  return (
    <div className="space-y-6">
      {/* Chrome AI Flags Warning - Only show for Chrome < 138 */}
      {isChromeAI && needsFlags && (
        <div className="space-y-3 p-2 md:p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <div className="flex items-center gap-2">
            <span className="text-lg">ℹ️</span>
            <h4 className="text-sm font-semibold text-blue-300">
              Chrome AI Additional Flags Required
            </h4>
          </div>
          <p className="text-xs text-blue-200">
            To use AI Features with Chrome AI, you need to enable these
            additional flags:
          </p>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between p-2 rounded bg-blue-500/10">
              <code className="text-blue-200">translation-api</code>
              <button
                onClick={() =>
                  navigator.clipboard.writeText(
                    "chrome://flags/#translation-api",
                  )
                }
                className="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 rounded bg-blue-500/20 hover:bg-blue-500/30"
              >
                Copy Flag URL
              </button>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-blue-500/10">
              <code className="text-blue-200">language-detection-api</code>
              <button
                onClick={() =>
                  navigator.clipboard.writeText(
                    "chrome://flags/#language-detection-api",
                  )
                }
                className="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 rounded bg-blue-500/20 hover:bg-blue-500/30"
              >
                Copy Flag URL
              </button>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-blue-500/10">
              <code className="text-blue-200">
                summarization-api-for-gemini-nano
              </code>
              <button
                onClick={() =>
                  navigator.clipboard.writeText(
                    "chrome://flags/#summarization-api-for-gemini-nano",
                  )
                }
                className="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 rounded bg-blue-500/20 hover:bg-blue-500/30"
              >
                Copy Flag URL
              </button>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-blue-500/10">
              <code className="text-blue-200">rewriter-api</code>
              <button
                onClick={() =>
                  navigator.clipboard.writeText("chrome://flags/#rewriter-api")
                }
                className="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 rounded bg-blue-500/20 hover:bg-blue-500/30"
              >
                Copy Flag URL
              </button>
            </div>
          </div>
          <div className="pt-2 border-t border-blue-500/20">
            <p className="text-xs text-blue-200">
              <span className="font-semibold">Instructions:</span>
            </p>
            <ol className="list-decimal list-inside text-xs text-blue-200 space-y-1 mt-1">
              <li>Click "Copy Flag URL" buttons above to copy each flag URL</li>
              <li>Paste each URL in your Chrome address bar and press Enter</li>
              <li>
                Set each flag to{" "}
                <span className="font-semibold">"Enabled"</span>
              </li>
              <li>Click "Relaunch" button at the bottom of the flags page</li>
              <li>After restart, the AI Features will be available</li>
            </ol>
          </div>
        </div>
      )}

      {/* Translator */}
      <div className="space-y-3">
        <Card variant="default">
          <SettingsRow label="Translator">
            <Toggle
              id="translator-enabled"
              checked={features.translator?.enabled !== false}
              onChange={(checked) => onFeatureChange?.("translator", checked)}
            />
          </SettingsRow>
        </Card>
        {features.translator?.enabled !== false && (
          <div className="ml-7 space-y-3">
            <p className="text-xs text-white/50">
              Translate text between multiple languages
            </p>

            {/* Target Language Selection */}
            <div className="space-y-1.5">
              <label
                htmlFor="translator-target-lang"
                className="block text-xs font-medium text-white/70"
              >
                Default Translation Language
              </label>
              <select
                id="translator-target-lang"
                value={targetLanguage}
                onChange={(e) => handleTargetLanguageChange(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs"
              >
                {TranslationLanguages.map((lang) => (
                  <option
                    key={lang.code}
                    value={lang.code}
                    className="bg-gray-900 text-white"
                  >
                    {lang.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-white/40">
                Text will be translated to this language when testing
              </p>
            </div>

            {showTesting && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={isLightBackground ? "dark" : "default"}
                    size="sm"
                    className="w-full"
                    onClick={runTranslatorTest}
                  >
                    {translatorTest.status === "loading"
                      ? "Testing..."
                      : "Test"}
                  </Button>
                  <Button
                    variant={isLightBackground ? "dark" : "default"}
                    size="sm"
                    className="w-full"
                    onClick={() =>
                      setTranslatorTest({ status: "idle", message: "" })
                    }
                  >
                    Clear
                  </Button>
                </div>

                <TestResult
                  status={translatorTest.status}
                  message={translatorTest.message}
                />
              </>
            )}
          </div>
        )}
      </div>

      {/* Language Detector */}
      <div className="space-y-3">
        <Card variant="default">
          <SettingsRow label="Language Detector">
            <Toggle
              id="language-detector-enabled"
              checked={features.languageDetector?.enabled !== false}
              onChange={(checked) =>
                onFeatureChange?.("languageDetector", checked)
              }
            />
          </SettingsRow>
        </Card>
        {features.languageDetector?.enabled !== false && (
          <div className="ml-7 space-y-2">
            <p className="text-xs text-white/50">
              Automatically detect the language of text with confidence scores
            </p>

            {showTesting && (
              <>
                <div className="space-y-1.5">
                  <label
                    htmlFor="language-detector-input"
                    className="block text-xs font-medium text-white/70"
                  >
                    Test Text
                  </label>
                  <input
                    id="language-detector-input"
                    type="text"
                    value={languageDetectorInput}
                    onChange={(e) => setLanguageDetectorInput(e.target.value)}
                    placeholder="Enter text to detect language..."
                    className="w-full px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={isLightBackground ? "dark" : "default"}
                    size="sm"
                    className="w-full"
                    onClick={runLanguageDetectorTest}
                  >
                    {languageDetectorTest.status === "loading"
                      ? "Detecting..."
                      : "Test"}
                  </Button>
                  <Button
                    variant={isLightBackground ? "dark" : "default"}
                    size="sm"
                    className="w-full"
                    onClick={() =>
                      setLanguageDetectorTest({ status: "idle", message: "" })
                    }
                  >
                    Clear
                  </Button>
                </div>

                <TestResult
                  status={languageDetectorTest.status}
                  message={languageDetectorTest.message}
                />
              </>
            )}
          </div>
        )}
      </div>

      {/* Summarizer */}
      <div className="space-y-3">
        <Card variant="default">
          <SettingsRow label="Summarizer">
            <Toggle
              id="summarizer-enabled"
              checked={features.summarizer?.enabled !== false}
              onChange={(checked) => onFeatureChange?.("summarizer", checked)}
            />
          </SettingsRow>
        </Card>
        {features.summarizer?.enabled !== false && (
          <div className="ml-7 space-y-3">
            <p className="text-xs text-white/50">
              Generate different types of summaries from long text
            </p>

            {showTesting && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={isLightBackground ? "dark" : "default"}
                    size="sm"
                    className="w-full"
                    onClick={runSummarizerTest}
                  >
                    {summarizerTest.status === "loading"
                      ? "Testing..."
                      : "Test"}
                  </Button>
                  <Button
                    variant={isLightBackground ? "dark" : "default"}
                    size="sm"
                    className="w-full"
                    onClick={() =>
                      setSummarizerTest({ status: "idle", message: "" })
                    }
                  >
                    Clear
                  </Button>
                </div>

                <TestResult
                  status={summarizerTest.status}
                  message={summarizerTest.message}
                />
              </>
            )}
          </div>
        )}
      </div>

      {/* Rewriter */}
      <div className="space-y-3">
        <Card variant="default">
          <SettingsRow label="Text Rewriter">
            <Toggle
              id="rewriter-enabled"
              checked={features.rewriter?.enabled !== false}
              onChange={(checked) => onFeatureChange?.("rewriter", checked)}
            />
          </SettingsRow>
        </Card>
        {features.rewriter?.enabled !== false && (
          <div className="ml-7 space-y-3">
            <p className="text-xs text-white/50">
              Rewrite text in different tones and styles
            </p>

            {showTesting && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={isLightBackground ? "dark" : "default"}
                    size="sm"
                    className="w-full"
                    onClick={runRewriterTest}
                  >
                    {rewriterTest.status === "loading" ? "Testing..." : "Test"}
                  </Button>
                  <Button
                    variant={isLightBackground ? "dark" : "default"}
                    size="sm"
                    className="w-full"
                    onClick={() =>
                      setRewriterTest({ status: "idle", message: "" })
                    }
                  >
                    Clear
                  </Button>
                </div>

                <TestResult
                  status={rewriterTest.status}
                  message={rewriterTest.message}
                />
              </>
            )}
          </div>
        )}
      </div>

      {/* Writer */}
      <div className="space-y-3">
        <Card variant="default">
          <SettingsRow label="Content Writer">
            <Toggle
              id="writer-enabled"
              checked={features.writer?.enabled !== false}
              onChange={(checked) => onFeatureChange?.("writer", checked)}
            />
          </SettingsRow>
        </Card>
        {features.writer?.enabled !== false && (
          <div className="ml-7 space-y-3">
            <p className="text-xs text-white/50">
              Generate new content from prompts with different tones and lengths
            </p>

            {showTesting && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={isLightBackground ? "dark" : "default"}
                    size="sm"
                    className="w-full"
                    onClick={runWriterTest}
                  >
                    {writerTest.status === "loading" ? "Testing..." : "Test"}
                  </Button>
                  <Button
                    variant={isLightBackground ? "dark" : "default"}
                    size="sm"
                    className="w-full"
                    onClick={() =>
                      setWriterTest({ status: "idle", message: "" })
                    }
                  >
                    Clear
                  </Button>
                </div>

                <TestResult
                  status={writerTest.status}
                  message={writerTest.message}
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AIFeaturesConfig;
