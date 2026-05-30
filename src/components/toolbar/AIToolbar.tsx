/**
 * @fileoverview Floating AI toolbar for text and image operations.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useEffectEvent,
} from "react";
import { useEmbedHost } from "../../embed/EmbedHostContext";
import {
  getHostCommandEventName,
  type VAssistToolbarActionEventDetail,
} from "../../embed/hostCommands";
import type { VAssistToolbarItemId } from "../../embed/config";
import { useVAssistReactCustomizations } from "../../embed/reactHostCustomizations";
import { cn } from "../../utils/cn";
import { useToolingActions } from "../../hooks/app/useTooling";
import { useAIConfig } from "../../hooks/config/useConfigAI";
import { useTTSConfig } from "../../hooks/config/useConfigTTS";
import { useUIConfig } from "../../hooks/config/useConfigUI";
import BackgroundDetector from "../../utils/BackgroundDetector";
import MediaExtractionService from "../../services/MediaExtractionService";
import UtilService from "../../services/UtilService";
import {
  SummarizerServiceProxy,
  TranslatorServiceProxy,
  TTSServiceProxy,
  AIServiceProxy,
  RewriterServiceProxy,
  WriterServiceProxy,
} from "../../services/proxies";
import VoiceRecordingService from "../../services/VoiceRecordingService";
import { TranslationLanguages } from "../../config/aiConfig";
import { PromptConfig } from "../../config/promptConfig";
import ToolbarButton, { type ToolbarButtonProps } from "./ToolbarButton";
import ToolbarSection from "./ToolbarSection";
import ToolbarResultPanel from "./ToolbarResultPanel";
import { Icon } from "../icons";
import Logger from "../../services/LoggerService";

type ToolbarPosition = { x: number; y: number };
type ToolbarAction = string | null;
type DictationMode = "manual" | "auto-insert" | null;
type EditableType = "input" | "textarea" | "contenteditable" | null;
type EditableElement = (
  | HTMLInputElement
  | HTMLTextAreaElement
  | HTMLElement
) & {
  value?: string;
  selectionStart?: number | null;
  selectionEnd?: number | null;
  setSelectionRange?: (start: number, end: number) => void;
};
type SavedCursorPosition = {
  element: EditableElement;
  start?: number | null;
  end?: number | null;
  range?: Range;
} | null;

type ToolbarRenderableButton = {
  itemId: VAssistToolbarItemId;
  props: Omit<
    ToolbarButtonProps,
    "isLightBackground" | "onMouseEnterButton" | "onMouseLeaveButton" | "style"
  >;
};

interface SelectionSnapshot {
  text: string;
  images: any[];
  audios: any[];
  selection: Selection | null;
}

interface EditableCheckResult {
  isEditable: boolean;
  element: EditableElement | null;
  originalContent: string | null;
  selectionStart: number;
  selectionEnd: number;
  editableType: EditableType;
}

const getExtensionShadowRoot = (): ShadowRoot | null => {
  const extensionContainer = document.getElementById(
    "virtual-assistant-extension-root",
  );

  return extensionContainer?.shadowRoot ?? null;
};

const getFocusedElement = (): HTMLElement | null => {
  const shadowActiveElement = getExtensionShadowRoot()?.activeElement;

  if (shadowActiveElement instanceof HTMLElement) {
    return shadowActiveElement;
  }

  return document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
};

const getInteractionTargets = (): Array<Document | ShadowRoot> => {
  const shadowRoot = getExtensionShadowRoot();
  return shadowRoot ? [document, shadowRoot] : [document];
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return "Unknown error";
};

const AIToolbar = () => {
  const { hostId, embedConfig } = useEmbedHost();
  const reactCustomizations = useVAssistReactCustomizations(hostId);
  const uiConfig = useUIConfig();
  const aiConfig = useAIConfig();
  const ttsConfig = useTTSConfig();
  const { handleAddToChat } = useToolingActions();

  const [isVisible, setIsVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [position, setPosition] = useState<ToolbarPosition>({ x: 0, y: 0 });
  const [lockedPosition, setLockedPosition] = useState<ToolbarPosition | null>(
    null,
  );
  const [resultPanelActive, setResultPanelActive] = useState(false);
  const [shouldRenderResultPanel, setShouldRenderResultPanel] = useState(false);
  const [isResultPanelClosing, setIsResultPanelClosing] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [selectedImages, setSelectedImages] = useState<any[]>([]);
  const [selectedAudios, setSelectedAudios] = useState<any[]>([]);
  const [hoveredImageElement, setHoveredImageElement] =
    useState<HTMLImageElement | null>(null);
  const savedCursorPositionRef = useRef<SavedCursorPosition>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [action, setAction] = useState<ToolbarAction>(null);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [isLightBackgroundToolbar, setIsLightBackgroundToolbar] =
    useState(false);
  const [isLightBackgroundPanel, setIsLightBackgroundPanel] = useState(false);
  const [selectedTargetLanguage, setSelectedTargetLanguage] = useState<
    string | null
  >(null);
  const [detectedLanguageName, setDetectedLanguageName] = useState<
    string | null
  >(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isTTSGenerating, setIsTTSGenerating] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  const [writerPrompt, setWriterPrompt] = useState("");
  const [showWriterInput, setShowWriterInput] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [, setDictationMode] = useState<DictationMode>(null);
  const [accumulatedTranscription, setAccumulatedTranscription] = useState("");
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const isProcessingRef = useRef(false);

  const [isEditableContent, setIsEditableContent] = useState(false);
  const [editableElement, setEditableElement] =
    useState<EditableElement | null>(null);
  const [originalContent, setOriginalContent] = useState<string | null>(null);
  const [editableType, setEditableType] = useState<EditableType>(null);
  const [editableSelectionStart, setEditableSelectionStart] = useState(0);
  const [editableSelectionEnd, setEditableSelectionEnd] = useState(0);
  const [hasInserted, setHasInserted] = useState(false);
  const [improvedContent, setImprovedContent] = useState<string | null>(null);

  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const resultPanelRef = useRef<HTMLDivElement | null>(null);
  const selectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const abortControllerRef = useRef<AbortController | null>(null);
  const hasInsertedRef = useRef(false);
  const showingFromInputFocusRef = useRef(false);
  const showingFromImageHoverRef = useRef(false);
  const pendingResultRef = useRef<string | null>(null);
  const resultUpdateRafRef = useRef<number | null>(null);
  const resultPanelCloseTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const resultRef = useRef("");
  const errorRef = useRef("");
  const isLoadingRef = useRef(false);
  const lockedPositionRef = useRef<ToolbarPosition | null>(null);
  const isVisibleRef = useRef(false);
  const showWriterInputRef = useRef(false);

  const setResultThrottled = useCallback((newResult: string) => {
    pendingResultRef.current = newResult;

    if (resultUpdateRafRef.current !== null) {
      return;
    }

    resultUpdateRafRef.current = requestAnimationFrame(() => {
      if (pendingResultRef.current !== null) {
        setResult(pendingResultRef.current);
        pendingResultRef.current = null;
      }
      resultUpdateRafRef.current = null;
    });
  }, []);

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  useEffect(() => {
    errorRef.current = error;
  }, [error]);

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  useEffect(() => {
    lockedPositionRef.current = lockedPosition;
  }, [lockedPosition]);

  useEffect(() => {
    isVisibleRef.current = isVisible;
  }, [isVisible]);

  useEffect(() => {
    showWriterInputRef.current = showWriterInput;
  }, [showWriterInput]);

  /**
   * Clear writer input panel when toolbar becomes invisible
   */
  useEffect(() => {
    if (!isVisible && showWriterInput) {
      Logger.log(
        "AIToolbar",
        "Toolbar became invisible, clearing writer input panel",
      );
      setShowWriterInput(false);
      setWriterPrompt("");
    }
  }, [isVisible, showWriterInput]);

  /**
   * Sync shouldRender with isVisible, but delay when closing for animation
   */
  useEffect(() => {
    if (isVisible) {
      setShouldRender(true);
      setIsClosing(false);
    } else if (shouldRender) {
      setIsClosing(true);
      const timeout = setTimeout(() => {
        setShouldRender(false);
        setIsClosing(false);
      }, 300);
      return () => clearTimeout(timeout);
    }
  }, [isVisible, shouldRender]);

  /**
   * Track whether we have result/error as booleans to prevent content changes triggering useEffect
   */
  const hasResult = Boolean(result);
  const hasError = Boolean(error);

  /**
   * Memoize hasResultFlag to prevent useEffect from running on every result content change during streaming
   * Panel shows when: has result, has error, is loading (for blinking state), or showing writer input
   */
  const hasResultFlag = useMemo(() => {
    const flag =
      (hasResult ||
        hasError ||
        isLoading ||
        (showWriterInput &&
          (action === "write-input" || action === "rewrite-custom"))) &&
      isVisible;
    return flag;
  }, [hasResult, hasError, isLoading, showWriterInput, action, isVisible]);
  const customToolbarActions = reactCustomizations.renderToolbarActions?.({
    hostId,
  });

  /**
   * Calculate if result panel should be above or below toolbar based on available space
   */
  const shouldShowPanelAbove = useMemo(() => {
    const toolbarHeight = 50;
    const estimatedPanelHeight = 300;
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - (position.y + toolbarHeight);
    const spaceAbove = position.y;

    return spaceBelow < estimatedPanelHeight && spaceAbove > spaceBelow;
  }, [position.y]);

  /**
   * Sync shouldRenderResultPanel with result/error state, delay when closing for animation
   */
  useEffect(() => {
    if (hasResultFlag && !shouldRenderResultPanel) {
      if (resultPanelCloseTimeoutRef.current) {
        clearTimeout(resultPanelCloseTimeoutRef.current);
        resultPanelCloseTimeoutRef.current = null;
      }
      setShouldRenderResultPanel(true);
      setIsResultPanelClosing(false);
    } else if (!hasResultFlag && shouldRenderResultPanel) {
      setIsResultPanelClosing(true);
      resultPanelCloseTimeoutRef.current = setTimeout(() => {
        setShouldRenderResultPanel(false);
        setIsResultPanelClosing(false);
        resultPanelCloseTimeoutRef.current = null;
      }, 300);
      return () => {
        if (resultPanelCloseTimeoutRef.current) {
          clearTimeout(resultPanelCloseTimeoutRef.current);
          resultPanelCloseTimeoutRef.current = null;
        }
      };
    }
  }, [hasResultFlag, shouldRenderResultPanel]);

  /**
   * Check if toolbar is enabled
   */
  const isEnabled = uiConfig?.enableAIToolbar !== false;
  const aiToolbarSettings = uiConfig?.aiToolbar as
    | { showOnInputFocus?: boolean; showOnImageHover?: boolean }
    | undefined;
  const toolbarPolicy = embedConfig.aiToolbar;
  const backgroundMode =
    (
      uiConfig?.backgroundDetection as
        | { mode?: "adaptive" | "light" | "dark" }
        | undefined
    )?.mode || "adaptive";
  const hiddenToolbarItems = useMemo(
    () => new Set(toolbarPolicy.hiddenItems),
    [toolbarPolicy.hiddenItems],
  );
  const visibleToolbarItems = useMemo(
    () =>
      toolbarPolicy.visibleItems ? new Set(toolbarPolicy.visibleItems) : null,
    [toolbarPolicy.visibleItems],
  );
  const toolbarItemOrder = useMemo(() => {
    const nextOrder = new Map<VAssistToolbarItemId, number>();

    toolbarPolicy.itemOrder.forEach((itemId, index) => {
      nextOrder.set(itemId, index);
    });

    return nextOrder;
  }, [toolbarPolicy.itemOrder]);
  const isSummarizerEnabled =
    aiConfig?.aiFeatures?.summarizer?.enabled !== false;
  const isTranslatorEnabled =
    aiConfig?.aiFeatures?.translator?.enabled !== false;
  const isLanguageDetectorEnabled =
    aiConfig?.aiFeatures?.languageDetector?.enabled !== false;
  const isRewriterEnabled = aiConfig?.aiFeatures?.rewriter?.enabled !== false;
  const isWriterEnabled = aiConfig?.aiFeatures?.writer?.enabled !== false;

  const isToolbarItemAllowed = useCallback(
    (itemId: VAssistToolbarItemId) => {
      if (hiddenToolbarItems.has(itemId)) {
        return false;
      }

      if (visibleToolbarItems && !visibleToolbarItems.has(itemId)) {
        return false;
      }

      return true;
    },
    [hiddenToolbarItems, visibleToolbarItems],
  );

  const getToolbarItemOrder = useCallback(
    (itemId: VAssistToolbarItemId) =>
      toolbarItemOrder.get(itemId) ?? Number.MAX_SAFE_INTEGER,
    [toolbarItemOrder],
  );

  const orderToolbarButtons = useCallback(
    (buttons: ToolbarRenderableButton[]) =>
      buttons
        .filter((button) => isToolbarItemAllowed(button.itemId))
        .sort(
          (left, right) =>
            getToolbarItemOrder(left.itemId) -
            getToolbarItemOrder(right.itemId),
        ),
    [getToolbarItemOrder, isToolbarItemAllowed],
  );

  const renderToolbarSection = useCallback(
    (key: string, buttons: ToolbarRenderableButton[]) => {
      const orderedButtons = orderToolbarButtons(buttons);

      const mainButton = orderedButtons[0];

      if (!mainButton) {
        return null;
      }

      const subButtons = orderedButtons.slice(1);

      return (
        <ToolbarSection
          key={key}
          style={{ order: getToolbarItemOrder(mainButton.itemId) }}
          isLoading={isLoading}
          isLightBackground={isLightBackgroundToolbar}
          mainButton={mainButton.props}
          subButtons={subButtons.map((button) => button.props)}
        />
      );
    },
    [
      getToolbarItemOrder,
      isLoading,
      isLightBackgroundToolbar,
      orderToolbarButtons,
    ],
  );

  const renderToolbarButton = useCallback(
    (key: string, button: ToolbarRenderableButton) => {
      if (!isToolbarItemAllowed(button.itemId)) {
        return null;
      }

      return (
        <ToolbarButton
          key={key}
          {...button.props}
          style={{ order: getToolbarItemOrder(button.itemId) }}
          isLightBackground={isLightBackgroundToolbar}
        />
      );
    },
    [getToolbarItemOrder, isLightBackgroundToolbar, isToolbarItemAllowed],
  );

  /**
   * Determine selection type based on word count
   * - Single word: 1-2 words (show dictionary features)
   * - Short phrase: 3-10 words (show both dictionary and summarize)
   * - Passage: >10 words (show only summarize)
   */
  const getSelectionType = useCallback((text: string) => {
    if (!text || !text.trim()) {
      return { isSingleWord: false, wordCount: 0 };
    }

    const words = text
      .trim()
      .split(/\s+/)
      .filter((w: string) => w.length > 0);
    const wordCount = words.length;

    return {
      isSingleWord: wordCount <= 2,
      wordCount,
    };
  }, []);

  const checkEditableContent = useCallback((): EditableCheckResult => {
    const activeElement = getFocusedElement();
    const isInputOrTextarea =
      activeElement &&
      (activeElement.tagName === "INPUT" ||
        activeElement.tagName === "TEXTAREA");

    if (isInputOrTextarea) {
      const element = activeElement as HTMLInputElement | HTMLTextAreaElement;

      if (element.tagName === "INPUT") {
        const type = element.type.toLowerCase();
        const excludedTypes = [
          "password",
          "email",
          "number",
          "date",
          "time",
          "datetime-local",
          "month",
          "week",
          "tel",
          "url",
          "search",
          "hidden",
          "checkbox",
          "radio",
          "file",
          "submit",
          "button",
          "reset",
          "image",
        ];
        if (excludedTypes.includes(type)) {
          return {
            isEditable: false,
            element: null,
            originalContent: null,
            selectionStart: 0,
            selectionEnd: 0,
            editableType: null,
          };
        }
      }

      const start = element.selectionStart;
      const end = element.selectionEnd;

      if (start != null && end != null && start !== end) {
        return {
          isEditable: true,
          element: element,
          originalContent: element.value,
          selectionStart: start,
          selectionEnd: end,
          editableType: element.tagName.toLowerCase() as "input" | "textarea",
        };
      }

      return {
        isEditable: false,
        element: null,
        originalContent: null,
        selectionStart: 0,
        selectionEnd: 0,
        editableType: null,
      };
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return {
        isEditable: false,
        element: null,
        originalContent: null,
        selectionStart: 0,
        selectionEnd: 0,
        editableType: null,
      };
    }

    const range = selection.getRangeAt(0);
    const startContainer = range.startContainer;
    const endContainer = range.endContainer;

    const startElement =
      startContainer.nodeType === 3
        ? startContainer.parentElement
        : startContainer;
    const endElement =
      endContainer.nodeType === 3 ? endContainer.parentElement : endContainer;

    const findContentEditableAncestor = (element: Element | null) => {
      let current = element;
      while (current && current !== document.body) {
        if (
          (current as HTMLElement).isContentEditable ||
          current.getAttribute("contenteditable") === "true"
        ) {
          return current;
        }
        if (current.getAttribute("g_editable") === "true") {
          return current;
        }
        current = current.parentElement;
      }
      return null;
    };

    const startEditable = findContentEditableAncestor(
      startElement as Element | null,
    );
    const endEditable = findContentEditableAncestor(
      endElement as Element | null,
    );

    if (!startEditable || !endEditable || startEditable !== endEditable) {
      return {
        isEditable: false,
        element: null,
        originalContent: null,
        selectionStart: 0,
        selectionEnd: 0,
        editableType: null,
      };
    }

    return {
      isEditable: true,
      element: startEditable as HTMLElement,
      originalContent: startEditable.innerHTML,
      selectionStart: range.startOffset,
      selectionEnd: range.endOffset,
      editableType: "contenteditable",
    };
  }, []);

  /**
   * Set up TTS event listeners for speaker icon
   */
  useEffect(() => {
    const handleAudioStart = (event: any) => {
      const { sessionId } = event.detail;
      Logger.log("AIToolbar", "TTS audio started:", sessionId);
      if (sessionId === currentSessionId) {
        setIsSpeaking(true);
      }
    };

    const handleAudioEnd = (event: any) => {
      const { sessionId } = event.detail;
      Logger.log("AIToolbar", "TTS audio ended:", sessionId);
      // Update speaking state regardless of sessionId match
      // The event only fires when playback truly ends
      setIsSpeaking(false);
      if (sessionId === currentSessionId) {
        setCurrentSessionId(null);
      }
    };

    TTSServiceProxy.addEventListener("audioStart", handleAudioStart);
    TTSServiceProxy.addEventListener("audioEnd", handleAudioEnd);

    return () => {
      TTSServiceProxy.removeEventListener("audioStart", handleAudioStart);
      TTSServiceProxy.removeEventListener("audioEnd", handleAudioEnd);
    };
  }, [currentSessionId]);

  /**
   * Cleanup RAF on unmount
   */
  useEffect(() => {
    return () => {
      if (resultUpdateRafRef.current !== null) {
        cancelAnimationFrame(resultUpdateRafRef.current);
        resultUpdateRafRef.current = null;
      }
    };
  }, []);

  /**
   * Handle TTS speaker button click
   */
  const onSpeakerClick = async () => {
    if (
      !result ||
      !(
        action?.startsWith("summarize-") ||
        action?.startsWith("image-") ||
        action?.startsWith("rewrite-") ||
        action?.startsWith("write-") ||
        action?.startsWith("dictionary-") ||
        action === "dictation" ||
        action === "translate"
      )
    )
      return;

    if (!ttsConfig?.enabled) {
      Logger.warn("AIToolbar", "TTS is not enabled");
      setError("Text-to-Speech is disabled in settings");
      return;
    }

    if (isTTSGenerating || isSpeaking) {
      Logger.log(
        "AIToolbar",
        "Cancelling TTS (generating:",
        isTTSGenerating,
        ", speaking:",
        isSpeaking,
        ")",
      );
      TTSServiceProxy.stopPlayback();
      setIsTTSGenerating(false);
      setIsSpeaking(false);
      setCurrentSessionId(null);
      return;
    }

    try {
      Logger.log("AIToolbar", "Starting TTS");

      const sessionId = `toolbar_${Date.now()}`;
      setCurrentSessionId(sessionId);
      setIsTTSGenerating(true);

      const audioChunks = await TTSServiceProxy.generateChunkedSpeech(
        result,
        null,
        500,
        100,
        sessionId,
      );

      if (audioChunks.length === 0) {
        Logger.log("AIToolbar", "TTS generation was stopped");
        setIsTTSGenerating(false);
        setIsSpeaking(false);
        setCurrentSessionId(null);
        return;
      }

      setIsTTSGenerating(false);
      setIsSpeaking(true);

      await TTSServiceProxy.playAudioSequence(audioChunks, sessionId);

      setIsSpeaking(false);
      setCurrentSessionId(null);
    } catch (err: unknown) {
      Logger.error("AIToolbar", "TTS failed:", err);
      setError("Text-to-Speech failed: " + getErrorMessage(err));
      setIsTTSGenerating(false);
      setIsSpeaking(false);
      setCurrentSessionId(null);
    }
  };

  /**
   * Close result panel
   */
  const closeResult = useCallback(async () => {
    if (isLoading) {
      Logger.log("AIToolbar", "Aborting ongoing streaming request...");

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      try {
        if (action?.startsWith("summarize-")) {
          await SummarizerServiceProxy.abort();
        } else if (action === "translate" || action === "detect-language") {
          await TranslatorServiceProxy.abort();
        } else if (action?.startsWith("image-")) {
          await AIServiceProxy.abortRequest();
        }
      } catch (error: unknown) {
        Logger.error("AIToolbar", "Service abort failed:", error);
      }

      setIsLoading(false);

      setTimeout(() => {
        abortControllerRef.current = null;
      }, 100);
    }

    if (isSpeaking && currentSessionId) {
      Logger.log("AIToolbar", "Stopping TTS playback");
      TTSServiceProxy.stopPlayback();
      setIsSpeaking(false);
      setCurrentSessionId(null);
    }

    setTimeout(() => {
      setResult("");
      setError("");
      setAction(null);
      setSelectedTargetLanguage(null);
      setCopySuccess(false);
      setHasInserted(false);
      hasInsertedRef.current = false;
      setLockedPosition(null);
    }, 500);
  }, [isLoading, action, isSpeaking, currentSessionId]);

  const getSelection = useCallback((): SelectionSnapshot => {
    const activeElement = getFocusedElement();
    const isInputOrTextarea =
      activeElement &&
      (activeElement.tagName === "INPUT" ||
        activeElement.tagName === "TEXTAREA");

    if (isInputOrTextarea) {
      const element = activeElement as HTMLInputElement | HTMLTextAreaElement;
      const start = element.selectionStart;
      const end = element.selectionEnd;

      if (start != null && end != null && start !== end) {
        const text = element.value.substring(start, end).trim();
        return {
          text,
          images: [],
          audios: [],
          selection: window.getSelection(),
        };
      }

      return {
        text: "",
        images: [],
        audios: [],
        selection: window.getSelection(),
      };
    }

    const selection = window.getSelection();

    if (!selection || selection.rangeCount === 0) {
      return { text: "", images: [], audios: [], selection };
    }

    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;

    const containerEl =
      container.nodeType === 3
        ? container.parentElement
        : (container as Element | null);

    const media = MediaExtractionService._extractMediaFromContainer(
      containerEl,
      selection,
    );

    return {
      text: selection.toString().trim(),
      images: media.images,
      audios: media.audios,
      selection,
    };
  }, []);

  /**
   * Calculate optimal position for toolbar at selection start
   */
  const calculatePosition = useCallback(
    (selection: Selection | null): ToolbarPosition | null => {
      const activeElement = getFocusedElement();
      const isInputOrTextarea =
        activeElement &&
        (activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA");

      let rect;

      if (isInputOrTextarea) {
        const element = activeElement as HTMLInputElement | HTMLTextAreaElement;
        const start = element.selectionStart || 0;

        const tempSpan = document.createElement("span");
        tempSpan.style.font = window.getComputedStyle(element).font;
        tempSpan.style.visibility = "hidden";
        tempSpan.style.position = "absolute";
        tempSpan.style.whiteSpace = "pre";
        tempSpan.textContent = element.value.substring(0, start);
        document.body.appendChild(tempSpan);

        const textWidth = tempSpan.offsetWidth;
        document.body.removeChild(tempSpan);

        const elemRect = element.getBoundingClientRect();

        const computedStyle = window.getComputedStyle(element);
        const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
        const scrollLeft = element.scrollLeft || 0;

        const cursorX = elemRect.left + paddingLeft + textWidth - scrollLeft;

        rect = {
          left: cursorX,
          top: elemRect.top,
          bottom: elemRect.bottom,
          width: 1,
          height: elemRect.height,
        };
      } else {
        if (!selection || selection.rangeCount === 0) return null;

        const range = selection.getRangeAt(0);
        rect = range.getBoundingClientRect();
      }

      if (!rect || rect.height === 0) return null;

      const toolbarWidth = toolbarRef.current
        ? toolbarRef.current.offsetWidth
        : 400;
      const toolbarHeight = toolbarRef.current
        ? toolbarRef.current.offsetHeight
        : 50;
      const offset = 8;

      let x = rect.left;
      let y = rect.top - toolbarHeight - offset;

      const viewportWidth = window.innerWidth;

      if (x + toolbarWidth > viewportWidth - 10) {
        x = viewportWidth - toolbarWidth - 10;
      }

      if (x < 10) {
        x = 10;
      }

      if (y < 10) {
        y = rect.bottom + offset;
      }

      return { x, y };
    },
    [],
  );

  /**
   * Handle selection change
   */
  const handleSelectionChange = useCallback(() => {
    if (!isEnabled) return;

    if (selectionTimeoutRef.current) {
      clearTimeout(selectionTimeoutRef.current);
    }

    selectionTimeoutRef.current = setTimeout(() => {
      const { text, images, audios, selection } = getSelection();

      const activeElement = getFocusedElement();
      if (activeElement && (resultPanelRef.current || toolbarRef.current)) {
        if (
          (resultPanelRef.current &&
            resultPanelRef.current.contains(activeElement)) ||
          (toolbarRef.current && toolbarRef.current.contains(activeElement))
        ) {
          Logger.log(
            "AIToolbar",
            "Focus inside toolbar/panel (element:",
            activeElement.tagName,
            "), ignoring selection change",
          );
          return;
        }
      }

      if ((resultPanelRef.current || toolbarRef.current) && selection) {
        const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        if (range) {
          const container = range.commonAncestorContainer;
          const containerEl =
            container.nodeType === 3 ? container.parentElement : container;
          if (containerEl) {
            if (
              (resultPanelRef.current &&
                resultPanelRef.current.contains(containerEl)) ||
              (toolbarRef.current && toolbarRef.current.contains(containerEl))
            ) {
              Logger.log(
                "AIToolbar",
                "Selection inside toolbar/panel, ignoring",
              );
              return;
            }
          }
        }
      }

      if (!text && images.length === 0 && audios.length === 0) {
        Logger.log(
          "AIToolbar",
          "No selection detected, checking if should hide toolbar...",
        );
        Logger.log(
          "AIToolbar",
          "- showingFromInputFocusRef:",
          showingFromInputFocusRef.current,
        );
        Logger.log(
          "AIToolbar",
          "- showingFromImageHoverRef:",
          showingFromImageHoverRef.current,
        );
        Logger.log(
          "AIToolbar",
          "- showWriterInputRef:",
          showWriterInputRef.current,
        );
        Logger.log("AIToolbar", "- resultPanelActive:", resultPanelActive);

        if (
          showingFromInputFocusRef.current ||
          showingFromImageHoverRef.current
        ) {
          Logger.log(
            "AIToolbar",
            "No selection but showing from input focus or image hover, keeping toolbar visible",
          );
          return;
        }

        if (showWriterInputRef.current) {
          Logger.log(
            "AIToolbar",
            "No selection but writer input panel is showing, keeping toolbar visible",
          );
          return;
        }

        if (!resultPanelActive) {
          Logger.log(
            "AIToolbar",
            "No selection and result panel not active, HIDING TOOLBAR",
          );
          setIsVisible(false);
          setSelectedText("");
          setSelectedImages([]);
          setSelectedAudios([]);
          setResult("");
          setError("");
          setAction(null);
          setIsEditableContent(false);
          setEditableElement(null);
          setOriginalContent(null);
          setEditableType(null);
          setEditableSelectionStart(0);
          setEditableSelectionEnd(0);
          setHasInserted(false);
          hasInsertedRef.current = false;
          setImprovedContent(null);
        } else {
          Logger.log(
            "AIToolbar",
            "No selection but result panel active, keeping toolbar visible",
          );
        }
        return;
      }

      const pos = calculatePosition(selection);
      if (!pos) {
        if (resultRef.current || errorRef.current || isLoadingRef.current) {
          Logger.log(
            "AIToolbar",
            "No position but result active, keeping toolbar at current position",
          );
          return;
        }
        setIsVisible(false);
        return;
      }

      const editableInfo = checkEditableContent();

      if (!hasInsertedRef.current) {
        setIsEditableContent(editableInfo.isEditable);
        setEditableElement(editableInfo.element);
        setOriginalContent(editableInfo.originalContent);
        setEditableType(editableInfo.editableType);
        setEditableSelectionStart(editableInfo.selectionStart || 0);
        setEditableSelectionEnd(editableInfo.selectionEnd || 0);
      }

      setSelectedText(text);
      setSelectedImages(images);
      setSelectedAudios(audios);

      if (
        (text || images.length > 0 || audios.length > 0) &&
        !showingFromImageHoverRef.current
      ) {
        setHoveredImageElement(null);
      }

      if (!resultRef.current && !errorRef.current && !isLoadingRef.current) {
        setPosition(pos);
        setLockedPosition(null);
      } else if (!lockedPositionRef.current) {
        setPosition(pos);
        setLockedPosition(pos);
      }

      setIsVisible(true);
    }, 150);
  }, [
    isEnabled,
    getSelection,
    calculatePosition,
    checkEditableContent,
    resultPanelActive,
  ]);

  /**
   * Handle mouse up (show toolbar after selection)
   */
  const handleMouseUp = useCallback(() => {
    handleSelectionChange();
  }, [handleSelectionChange]);

  /**
   * Handles scroll events to update toolbar position or hide it
   */
  const handleScroll = useCallback(() => {
    if (!isVisibleRef.current) return;

    if (lockedPositionRef.current) {
      return;
    }

    // For image hover mode
    if (showingFromImageHoverRef.current) {
      // If showing results/loading, update position to follow the image
      if (resultPanelActive || isLoading || result || error) {
        if (hoveredImageElement) {
          const rect = hoveredImageElement.getBoundingClientRect();
          const toolbarWidth = 400;
          const toolbarHeight = 50;
          const viewportWidth = window.innerWidth;

          let x, y;

          if (rect.right + toolbarWidth - 120 > viewportWidth) {
            x = rect.left;
          } else {
            x = rect.right - 120;
          }

          const topY = rect.top - toolbarHeight - 10;
          const bottomY = rect.bottom + 10;

          if (topY < 0) {
            y = bottomY;
          } else {
            y = topY;
          }

          setPosition({ x, y });
        }
      } else {
        // No results showing, hide toolbar on scroll
        setIsVisible(false);
        setHoveredImageElement(null);
        showingFromImageHoverRef.current = false;
      }
      return;
    }

    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const pos = calculatePosition(selection);
      if (pos) {
        setPosition(pos);
      } else {
        setIsVisible(false);
      }
    }
  }, [
    calculatePosition,
    resultPanelActive,
    isLoading,
    result,
    error,
    hoveredImageElement,
  ]);

  /**
   * Hides toolbar when clicking outside using shadow DOM-compatible event path checking
   */
  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      const path = e.composedPath
        ? e.composedPath()
        : [e.target as EventTarget];

      const clickedInside = path.some((el: EventTarget) => {
        if (el === toolbarRef.current || el === resultPanelRef.current) {
          return true;
        }
        if (el instanceof Element) {
          const classList = el.classList || [];
          const classStr = Array.from(classList).join(" ");
          if (
            classStr.includes("dropdown") ||
            classStr.includes("menu") ||
            classStr.includes("popover") ||
            classStr.includes("portal") ||
            classStr.includes("select") ||
            el.tagName === "OPTION" ||
            el.closest('[role="listbox"]') ||
            el.closest('[role="menu"]') ||
            el.closest('[role="dialog"]')
          ) {
            return true;
          }
        }
        return false;
      });

      if (clickedInside) {
        return;
      }

      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const containerEl =
          container.nodeType === 3 ? container.parentElement : container;

        if (containerEl && path.includes(containerEl)) {
          return;
        }
      }

      if (isRecording) {
        Logger.log("AIToolbar", "Stopping dictation on click outside");
        VoiceRecordingService.stop();
        setIsRecording(false);
      }

      setIsVisible(false);
      setResultPanelActive(false);

      showingFromInputFocusRef.current = false;
      showingFromImageHoverRef.current = false;

      if (result || error || isLoading) {
        closeResult();
      }
    },
    [result, error, isLoading, closeResult, isRecording],
  );

  /**
   * Handles input/textarea focus to show toolbar with dictation action
   */
  const handleInputFocus = useCallback(
    (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      Logger.log("AIToolbar", "handleInputFocus triggered", {
        enabled: aiToolbarSettings?.showOnInputFocus,
        target,
        tagName: target?.tagName,
        isContentEditable: target?.isContentEditable,
        uiConfig: uiConfig,
      });

      if (aiToolbarSettings?.showOnInputFocus === false) {
        Logger.log("AIToolbar", "Input focus disabled in settings");
        return;
      }

      if (
        toolbarRef.current?.contains(target) ||
        resultPanelRef.current?.contains(target)
      ) {
        Logger.log("AIToolbar", "Focus inside toolbar/panel, ignoring");
        return;
      }

      const isInput =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA";
      const isContentEditable = target.isContentEditable;

      Logger.log("AIToolbar", "Input check", { isInput, isContentEditable });

      if (isInput || isContentEditable) {
        Logger.log(
          "AIToolbar",
          "Input focused, showing toolbar with dictation",
        );

        if (isInput) {
          const textTarget = target as HTMLInputElement | HTMLTextAreaElement;
          savedCursorPositionRef.current = {
            element: textTarget,
            start: textTarget.selectionStart,
            end: textTarget.selectionEnd,
          };
          Logger.log(
            "AIToolbar",
            "Saved cursor position:",
            savedCursorPositionRef.current,
          );
        } else {
          const selection = window.getSelection();
          if (selection && selection.rangeCount > 0) {
            savedCursorPositionRef.current = {
              element: target,
              range: selection.getRangeAt(0).cloneRange(),
            };
          }
        }

        const rect = target.getBoundingClientRect();
        const toolbarHeight = 50;
        const toolbarWidth = 150;

        let x = rect.left;
        let y = rect.top - toolbarHeight - 10;

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        if (x + toolbarWidth > viewportWidth) {
          x = viewportWidth - toolbarWidth - 10;
        }
        if (x < 0) {
          x = 10;
        }

        if (y < 0) {
          y = rect.bottom + 10;
        }

        Logger.log("AIToolbar", "Setting position", {
          x,
          y,
          rect,
          viewport: { width: viewportWidth, height: viewportHeight },
        });

        setHoveredImageElement(null);

        setPosition({ x, y });
        setIsVisible(true);
        setAction("dictation");
        setIsEditableContent(true);
        setEditableElement(target);
        setEditableType(isContentEditable ? "contenteditable" : "input");

        if (!isContentEditable) {
          const textTarget = target as HTMLInputElement | HTMLTextAreaElement;
          setEditableSelectionStart(textTarget.selectionStart ?? 0);
          setEditableSelectionEnd(textTarget.selectionEnd ?? 0);
        }

        showingFromInputFocusRef.current = true;

        Logger.log(
          "AIToolbar",
          "Set showingFromInputFocusRef to true, will clear on hide",
        );
      } else {
        Logger.log("AIToolbar", "Not an input element, ignoring");
      }
    },
    [aiToolbarSettings, uiConfig],
  );

  /**
   * Handles image hover to show toolbar with image analysis actions
   */
  const handleImageHover = useCallback(
    (e: MouseEvent) => {
      Logger.log("AIToolbar", "handleImageHover triggered", {
        enabled: aiToolbarSettings?.showOnImageHover,
        target: (e.target as HTMLElement)?.tagName,
        src: (e.target as HTMLImageElement)?.src,
      });

      if (aiToolbarSettings?.showOnImageHover === false) return;

      const target = e.target as HTMLElement;
      if (target.tagName === "IMG") {
        Logger.log(
          "AIToolbar",
          "Image hovered, showing toolbar (will extract on button click)",
        );

        if (hoveredImageElement && hoveredImageElement !== target) {
          Logger.log(
            "AIToolbar",
            "Different image hovered, aborting previous request and clearing results",
          );

          // Abort any ongoing request
          if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
          }

          setResult("");
          setError("");
          setAction(null);
          setIsLoading(false);
        }

        showingFromInputFocusRef.current = false;

        setIsEditableContent(false);
        setEditableElement(null);
        setEditableType(null);

        const rect = target.getBoundingClientRect();
        const toolbarWidth = 400;
        const toolbarHeight = 50;
        const viewportWidth = window.innerWidth;

        let x, y;

        if (rect.right + toolbarWidth - 120 > viewportWidth) {
          x = rect.left;
        } else {
          x = rect.right - 120;
        }

        const topY = rect.top - toolbarHeight - 10;
        const bottomY = rect.bottom + 10;

        if (topY < 0) {
          y = bottomY;
        } else {
          y = topY;
        }

        Logger.log("AIToolbar", "Image toolbar position", { x, y, rect });

        setPosition({ x, y });
        setIsVisible(true);

        setHoveredImageElement(target as HTMLImageElement);
        setSelectedImages([]);
        setSelectedText("");
        setSelectedAudios([]);

        showingFromImageHoverRef.current = true;

        Logger.log(
          "AIToolbar",
          "Set showingFromImageHoverRef to true, will clear on hide",
        );
      }
    },
    [aiToolbarSettings, hoveredImageElement],
  );

  /**
   * Handle image leave - only hide if result panel not active
   */
  /**
   * Handles image mouse leave - keeps toolbar visible to prevent flickering
   */
  const handleImageLeave = useCallback(
    (e: MouseEvent) => {
      Logger.log("AIToolbar", "handleImageLeave triggered", {
        enabled: aiToolbarSettings?.showOnImageHover,
        resultPanelActive: resultPanelActive,
      });

      if (aiToolbarSettings?.showOnImageHover === false) return;

      const target = e.target as HTMLElement;
      if (target.tagName === "IMG") {
        Logger.log("AIToolbar", "Image unhovered, but keeping toolbar visible");
      }
    },
    [aiToolbarSettings, resultPanelActive],
  );

  useEffect(() => {
    const showOnInputFocus = aiToolbarSettings?.showOnInputFocus !== false;
    const showOnImageHover = aiToolbarSettings?.showOnImageHover !== false;
    const eventTargets = getInteractionTargets();
    const mouseDownListener = handleClickOutside as EventListener;
    const focusInListener = handleInputFocus as EventListener;

    if (!isEnabled) {
      setIsVisible(false);
      return;
    }

    eventTargets.forEach((target) => {
      target.addEventListener("mouseup", handleMouseUp);
      target.addEventListener("mousedown", mouseDownListener);
      target.addEventListener("keyup", handleSelectionChange);
    });
    document.addEventListener("selectionchange", handleSelectionChange);
    window.addEventListener("scroll", handleScroll, true);

    if (showOnInputFocus) {
      eventTargets.forEach((target) => {
        target.addEventListener("focusin", focusInListener);
      });
    }

    let observer: MutationObserver | null = null;
    if (showOnImageHover) {
      const images = document.querySelectorAll("img");
      images.forEach((img) => {
        img.addEventListener("mouseenter", handleImageHover);
        img.addEventListener("mouseleave", handleImageLeave);
      });

      observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node instanceof HTMLElement && node.tagName === "IMG") {
              node.addEventListener("mouseenter", handleImageHover);
              node.addEventListener("mouseleave", handleImageLeave);
            } else if (node instanceof Element) {
              const imgs = node.querySelectorAll("img");
              imgs.forEach((img) => {
                img.addEventListener("mouseenter", handleImageHover);
                img.addEventListener("mouseleave", handleImageLeave);
              });
            }
          });
        });
      });

      observer.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      eventTargets.forEach((target) => {
        target.removeEventListener("mouseup", handleMouseUp);
        target.removeEventListener("mousedown", mouseDownListener);
        target.removeEventListener("keyup", handleSelectionChange);
      });
      document.removeEventListener("selectionchange", handleSelectionChange);
      window.removeEventListener("scroll", handleScroll, true);

      if (showOnInputFocus) {
        eventTargets.forEach((target) => {
          target.removeEventListener("focusin", focusInListener);
        });
      }

      if (showOnImageHover) {
        const images = document.querySelectorAll("img");
        images.forEach((img) => {
          img.removeEventListener("mouseenter", handleImageHover);
          img.removeEventListener("mouseleave", handleImageLeave);
        });

        if (observer) {
          observer.disconnect();
        }
      }

      if (selectionTimeoutRef.current) {
        clearTimeout(selectionTimeoutRef.current);
      }
    };
  }, [
    isEnabled,
    aiToolbarSettings?.showOnInputFocus,
    aiToolbarSettings?.showOnImageHover,
    handleMouseUp,
    handleSelectionChange,
    handleClickOutside,
    handleScroll,
    handleInputFocus,
    handleImageHover,
    handleImageLeave,
  ]);

  /**
   * Clears flags and stops dictation when toolbar becomes invisible
   */
  useEffect(() => {
    if (!isVisible) {
      showingFromInputFocusRef.current = false;
      showingFromImageHoverRef.current = false;
      savedCursorPositionRef.current = null;

      if (isRecording) {
        Logger.log("AIToolbar", "Toolbar hidden, stopping dictation");
        VoiceRecordingService.stop();
        setIsRecording(false);
        setAccumulatedTranscription("");
      }

      if (recordingIntervalRef.current) {
        Logger.log("AIToolbar", "Clearing recording timer interval");
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
        setRecordingDuration(0);
      }
    }
  }, [isVisible, isRecording]);

  /**
   * Tracks cursor position changes in editable element
   */
  useEffect(() => {
    if (!editableElement || !isEditableContent) return;

    const updateCursorPosition = () => {
      if (editableType === "contenteditable") {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          savedCursorPositionRef.current = {
            element: editableElement,
            range: selection.getRangeAt(0).cloneRange(),
          };
          Logger.log("AIToolbar", "Updated cursor position (contenteditable)");
        }
      } else {
        const textElement = editableElement as
          | HTMLInputElement
          | HTMLTextAreaElement;
        savedCursorPositionRef.current = {
          element: textElement,
          start: textElement.selectionStart ?? 0,
          end: textElement.selectionEnd ?? 0,
        };
        Logger.log("AIToolbar", "Updated cursor position:", {
          start: textElement.selectionStart,
          end: textElement.selectionEnd,
        });
      }
    };

    editableElement.addEventListener("click", updateCursorPosition);
    editableElement.addEventListener("keyup", updateCursorPosition);
    editableElement.addEventListener("select", updateCursorPosition);

    return () => {
      editableElement.removeEventListener("click", updateCursorPosition);
      editableElement.removeEventListener("keyup", updateCursorPosition);
      editableElement.removeEventListener("select", updateCursorPosition);
    };
  }, [editableElement, isEditableContent, editableType]);

  /**
   * Track result panel active state
   * Activate when result/error/loading appears, deactivate when all are cleared
   */
  useEffect(() => {
    const hasResult = Boolean(result);
    const hasError = Boolean(error);
    const hasLoading = Boolean(isLoading);

    if (hasResult || hasError || hasLoading) {
      setResultPanelActive(true);
    } else {
      setResultPanelActive(false);
    }
  }, [result, error, isLoading]);

  /**
   * Detects background brightness for toolbar and result panel
   */
  useEffect(() => {
    if (!isVisible) return;

    const detectBackgrounds = () => {
      const mode = backgroundMode;

      if (mode !== "adaptive") {
        if (mode === "light") {
          setIsLightBackgroundToolbar(true);
          setIsLightBackgroundPanel(true);
        } else if (mode === "dark") {
          setIsLightBackgroundToolbar(false);
          setIsLightBackgroundPanel(false);
        }
        return;
      }

      const canvas = document.getElementById("vassist-babylon-canvas");
      const toolbar = toolbarRef.current;
      const panel = resultPanelRef.current;

      if (toolbar) {
        const elementsToDisable = [canvas, toolbar].filter(
          (el): el is HTMLElement => Boolean(el),
        );
        const toolbarResult = BackgroundDetector.withDisabledPointerEvents(
          elementsToDisable,
          () => {
            return BackgroundDetector.detectBrightness({
              sampleArea: {
                type: "grid",
                x: position.x,
                y: position.y,
                width: 110,
                height: 40,
                padding: 20,
              },
              elementsToIgnore: [canvas, toolbar].filter(
                (el): el is HTMLElement => Boolean(el),
              ),
              logPrefix: "[AIToolbar-Toolbar]",
            });
          },
        );

        setIsLightBackgroundToolbar(toolbarResult.isLight);
      }

      if (panel && shouldRenderResultPanel) {
        const elementsToDisable = [canvas, panel].filter(
          (el): el is HTMLElement => Boolean(el),
        );
        const panelResult = BackgroundDetector.withDisabledPointerEvents(
          elementsToDisable,
          () => {
            return BackgroundDetector.detectBrightness({
              sampleArea: {
                type: "grid",
                x: position.x,
                y: position.y + 48,
                width: 400,
                height: 200,
                padding: 30,
              },
              elementsToIgnore: [canvas, panel].filter(
                (el): el is HTMLElement => Boolean(el),
              ),
              logPrefix: "[AIToolbar-Panel]",
            });
          },
        );

        setIsLightBackgroundPanel(panelResult.isLight);
      }
    };

    detectBackgrounds();

    const timeoutId = setTimeout(detectBackgrounds, 400);

    return () => clearTimeout(timeoutId);
  }, [isVisible, position, shouldRenderResultPanel, backgroundMode]);

  /**
   * Handle Summarize action with streaming
   * @param {string} summaryType - 'tldr', 'headline', 'key-points', 'teaser'
   * @param {boolean} skipClearResult - Don't clear result (for regenerate)
   */
  const onSummarizeClick = async (
    summaryType = "tldr",
    skipClearResult = false,
  ) => {
    Logger.log("AIToolbar", "onSummarizeClick START", {
      summaryType,
      skipClearResult,
      currentResult: result,
      currentError: error,
      currentIsLoading: isLoading,
    });

    if (!selectedText) {
      setError("No text selected");
      return;
    }

    if (isLoading && abortControllerRef.current) {
      abortControllerRef.current.abort();
      await abortPreviousRequest();
    }

    setIsLoading(true);
    const type = summaryType || "tldr";
    setAction(`summarize-${type}`);
    setError("");
    if (!skipClearResult) {
      setResult("");
    }

    abortControllerRef.current = new AbortController();

    try {
      if (aiConfig?.aiFeatures?.summarizer?.enabled === false) {
        throw new Error("Summarizer is disabled in settings");
      }

      const options = {
        type: type,
        format: aiConfig?.aiFeatures?.summarizer?.defaultFormat || "plain-text",
        length: aiConfig?.aiFeatures?.summarizer?.defaultLength || "medium",
      };

      let fullSummary = "";

      for await (const chunk of SummarizerServiceProxy.summarizeStreaming(
        selectedText,
        options,
      )) {
        if (abortControllerRef.current?.signal.aborted) {
          Logger.log("AIToolbar", "Summarize streaming aborted");
          break;
        }

        fullSummary += chunk;

        if (!abortControllerRef.current?.signal.aborted) {
          setResultThrottled(fullSummary);
        }
      }

      if (!abortControllerRef.current?.signal.aborted && fullSummary) {
        setResult(fullSummary);
      }

      Logger.log("AIToolbar", "Summary streaming complete");
    } catch (err: unknown) {
      if (
        (err as { name?: string }).name !== "AbortError" &&
        !abortControllerRef.current?.signal.aborted
      ) {
        Logger.error("AIToolbar", "Summarize failed:", err);
        setError("Summarization failed: " + getErrorMessage(err));
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  /**
   * Handle Language Detection action
   */
  const onDetectLanguageClick = async (skipClearResult = false) => {
    if (!selectedText) {
      setError("No text selected");
      return;
    }

    if (isLoading && abortControllerRef.current) {
      abortControllerRef.current.abort();
      await abortPreviousRequest();
    }

    setIsLoading(true);
    setAction("detect-language");
    setError("");
    if (!skipClearResult) {
      setResult("");
    }

    try {
      const { LanguageDetectorServiceProxy } =
        await import("../../services/proxies");
      const detectionResults =
        await LanguageDetectorServiceProxy.detect(selectedText);

      if (detectionResults && detectionResults.length > 0) {
        const detected = detectionResults[0];
        if (!detected) {
          throw new Error("Could not detect language");
        }
        const langInfo = TranslationLanguages.find(
          (l) => l.code === detected.detectedLanguage,
        );
        const languageName = langInfo
          ? langInfo.name
          : detected.detectedLanguage.toUpperCase();

        setDetectedLanguageName(languageName);

        const confidencePercent = detected.confidence
          ? (detected.confidence * 100).toFixed(1)
          : "N/A";
        setResult(
          `Language: ${languageName}\nConfidence: ${confidencePercent}%`,
        );
      } else {
        throw new Error("Could not detect language");
      }
    } catch (err: unknown) {
      Logger.error("AIToolbar", "Language detection failed:", err);
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle Translate action with streaming
   * @param {string} targetLang - Target language code (optional)
   * @param {boolean} useAutoDetect - Whether to auto-detect source language (default: true)
   * @param {boolean} skipClearResult - Don't clear result (for regenerate)
   */
  const onTranslateClick = async (
    targetLang: string | null = null,
    useAutoDetect = true,
    skipClearResult = false,
  ) => {
    Logger.log("AIToolbar", "onTranslateClick START", {
      targetLang,
      useAutoDetect,
      skipClearResult,
      currentResult: result,
      currentError: error,
      currentIsLoading: isLoading,
    });

    if (!selectedText) {
      setError("No text selected");
      return;
    }

    if (isLoading && abortControllerRef.current) {
      abortControllerRef.current.abort();
      await abortPreviousRequest();
    }

    setHasInserted(false);
    hasInsertedRef.current = false;
    setOriginalContent(null);
    setImprovedContent(null);

    setIsLoading(true);
    setAction("translate");
    setError("");
    if (!skipClearResult) {
      setResult("");
    }

    const targetLanguage =
      targetLang ||
      selectedTargetLanguage ||
      aiConfig?.aiFeatures?.translator?.defaultTargetLanguage ||
      "en";

    abortControllerRef.current = new AbortController();

    try {
      if (aiConfig?.aiFeatures?.translator?.enabled === false) {
        throw new Error("Translator is disabled in settings");
      }

      let sourceLang: string | null = null;
      if (useAutoDetect) {
        try {
          const { LanguageDetectorServiceProxy } =
            await import("../../services/proxies");
          const detectionResults =
            await LanguageDetectorServiceProxy.detect(selectedText);
          if (detectionResults && detectionResults.length > 0) {
            const detected = detectionResults[0];
            if (!detected) {
              throw new Error("Could not detect source language");
            }
            sourceLang = detected.detectedLanguage;

            const langInfo = TranslationLanguages.find(
              (l) => l.code === sourceLang,
            );
            setDetectedLanguageName(
              langInfo ? langInfo.name : sourceLang.toUpperCase(),
            );
          }
        } catch (err: unknown) {
          Logger.warn("AIToolbar", "Language detection failed:", err);
          throw new Error("Could not detect source language");
        }
      }

      if (sourceLang === targetLanguage) {
        setResult(selectedText);
        setIsLoading(false);
        return;
      }

      const sourceLanguageForTranslate = sourceLang ?? "auto";
      let fullTranslation = "";

      for await (const chunk of TranslatorServiceProxy.translateStreaming(
        selectedText,
        sourceLanguageForTranslate,
        targetLanguage,
      )) {
        if (abortControllerRef.current?.signal.aborted) {
          Logger.log("AIToolbar", "Translate streaming aborted");
          break;
        }

        fullTranslation += chunk;

        if (!abortControllerRef.current?.signal.aborted) {
          setResultThrottled(fullTranslation);
        }
      }

      if (!abortControllerRef.current?.signal.aborted && fullTranslation) {
        setResult(fullTranslation);
      }

      Logger.log("AIToolbar", "Translation streaming complete");
    } catch (err: unknown) {
      if (
        (err as { name?: string }).name !== "AbortError" &&
        !abortControllerRef.current?.signal.aborted
      ) {
        Logger.error("AIToolbar", "Translate failed:", err);
        setError("Translation failed: " + getErrorMessage(err));
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  /**
   * Handle Image Analysis action with streaming
   * @param {string} analysisType - 'describe', 'extract-text', or 'analyze'
   */
  const onImageAnalysisClick = async (
    analysisType: string,
    skipClearResult = false,
  ) => {
    if (
      !hoveredImageElement &&
      (!selectedImages || selectedImages.length === 0)
    ) {
      setError("No images selected");
      return;
    }

    if (isLoading && abortControllerRef.current) {
      abortControllerRef.current.abort();
      await abortPreviousRequest();
    }

    setIsLoading(true);
    setAction(`image-${analysisType}`);
    setError("");
    if (!skipClearResult) {
      setResult("");
    }

    setResultPanelActive(true);
    setIsResultPanelClosing(false);

    Logger.log(
      "AIToolbar",
      `Image Analysis clicked (${analysisType}, streaming)`,
    );

    abortControllerRef.current = new AbortController();

    try {
      let processedMedia = null;

      if (hoveredImageElement) {
        Logger.log("AIToolbar", "Extracting hovered image for analysis");

        const containerToUse =
          hoveredImageElement.parentElement || hoveredImageElement;

        const fakeSelection = {
          containsNode: (node: Node) => node === hoveredImageElement,
          toString: () => "",
        } as unknown as Selection;

        processedMedia = await MediaExtractionService.processAndExtract({
          container: containerToUse,
          selection: fakeSelection,
        });
      } else {
        const { selection } = getSelection();

        if (!selection || selection.rangeCount === 0) {
          setError("No selection available");
          setIsLoading(false);
          return;
        }

        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const containerEl =
          container.nodeType === 3
            ? container.parentElement
            : (container as Element | null);

        processedMedia = await MediaExtractionService.processAndExtract({
          container: containerEl,
          selection: selection,
        });
      }

      if (!processedMedia.images || processedMedia.images.length === 0) {
        setError("Failed to process images");
        setIsLoading(false);
        return;
      }

      let prompt;
      const imageCount = processedMedia.images.length;
      switch (analysisType) {
        case "describe":
          prompt = PromptConfig.image.describe(imageCount);
          break;
        case "extract-text":
          prompt = PromptConfig.image.extractText(imageCount);
          break;
        case "identify-objects":
          prompt = PromptConfig.image.identifyObjects(imageCount);
          break;
        default:
          prompt = PromptConfig.image.describe(1);
      }

      const messages = [
        {
          role: "user",
          content: prompt,
          images: processedMedia.images.map((img) => img.dataUrl),
        },
      ];

      let fullResponse = "";

      const response = await AIServiceProxy.sendMessage(
        messages,
        (chunk) => {
          if (abortControllerRef.current?.signal.aborted) {
            Logger.log("AIToolbar", "Image analysis streaming aborted");
            return;
          }

          fullResponse += chunk;

          if (!abortControllerRef.current?.signal.aborted) {
            setResultThrottled(fullResponse);
          }
        },
        { useUtilitySession: true },
      );

      if (!abortControllerRef.current?.signal.aborted) {
        if (response.response) {
          setResult(response.response);
        } else if (fullResponse) {
          setResult(fullResponse);
        }
      }

      Logger.log("AIToolbar", "Image analysis streaming complete");
    } catch (err: unknown) {
      if (
        (err as { name?: string }).name !== "AbortError" &&
        !abortControllerRef.current?.signal.aborted
      ) {
        Logger.error("AIToolbar", "Image analysis failed:", err);
        setError("Image analysis failed: " + getErrorMessage(err));
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  /**
   * Generic handler for Dictionary actions
   * @param {string} actionType - Action type (e.g., 'define', 'synonyms', 'antonyms', 'pronunciation', 'examples')
   * @param {string} actionName - Display name for logging
   * @param {Function} promptBuilder - Function that takes the word and returns the prompt string
   */
  const handleDictionaryAction = async (
    actionType: string,
    actionName: string,
    promptBuilder: (word: string) => string,
    skipClearResult = false,
  ) => {
    if (!selectedText) {
      setError("No word selected");
      return;
    }

    if (isLoading && abortControllerRef.current) {
      abortControllerRef.current.abort();
      await abortPreviousRequest();
    }

    setIsLoading(true);
    setAction(`dictionary-${actionType}`);
    setError("");
    if (!skipClearResult) {
      setResult("");
    }

    Logger.log("AIToolbar", `${actionName} clicked (streaming)`);

    abortControllerRef.current = new AbortController();

    try {
      const word = selectedText.trim();
      const prompt = promptBuilder(word);
      const messages = [{ role: "user", content: prompt }];
      let fullResponse = "";

      Logger.log(
        "AIToolbar",
        "Sending ${actionName} request with messages:",
        messages,
      );

      const response = await AIServiceProxy.sendMessage(
        messages,
        (chunk) => {
          if (abortControllerRef.current?.signal.aborted) {
            Logger.log("AIToolbar", `${actionName} streaming aborted`);
            return;
          }
          Logger.log("AIToolbar", "${actionName} chunk received:", chunk);
          fullResponse += chunk;
          if (!abortControllerRef.current?.signal.aborted) {
            setResultThrottled(fullResponse);
          }
        },
        { useUtilitySession: true },
      );

      Logger.log("AIToolbar", "${actionName} response object:", response);
      Logger.log("AIToolbar", "${actionName} fullResponse:", fullResponse);

      if (response?.cancelled) {
        Logger.log("AIToolbar", `${actionName} request was cancelled`);
        return;
      }

      if (!response?.success) {
        const errorMsg = response?.error
          ? getErrorMessage(response.error as unknown)
          : "AI request failed";
        Logger.error(
          "AIToolbar",
          "${actionName} request failed:",
          response?.error,
        );
        setError(errorMsg);
        return;
      }

      if (response?.response) {
        Logger.log("AIToolbar", "Using non-streaming response");
        setResult(response.response);
      } else if (fullResponse) {
        setResult(fullResponse);
      }

      if (!fullResponse && !response?.response) {
        Logger.error("AIToolbar", "No response received from AI");
        setError("No response received from AI service");
      }

      Logger.log("AIToolbar", `${actionName} streaming complete`);
    } catch (err: unknown) {
      if (
        (err as { name?: string }).name !== "AbortError" &&
        !abortControllerRef.current?.signal.aborted
      ) {
        Logger.error("AIToolbar", "${actionName} failed:", err);
        setError(`${actionName} lookup failed: ` + getErrorMessage(err));
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  /**
   * Handle Dictionary action - Get word definition
   */
  const onDictionaryClick = async (skipClearResult = false) => {
    await handleDictionaryAction(
      "define",
      "Dictionary",
      (word) => PromptConfig.dictionary.define(word),
      skipClearResult,
    );
  };

  /**
   * Handle Synonyms action
   */
  const onSynonymsClick = async (skipClearResult = false) => {
    await handleDictionaryAction(
      "synonyms",
      "Synonyms",
      (word) => PromptConfig.dictionary.synonyms(word),
      skipClearResult,
    );
  };

  /**
   * Handle Antonyms action
   */
  const onAntonymsClick = async (skipClearResult = false) => {
    await handleDictionaryAction(
      "antonyms",
      "Antonyms",
      (word) => PromptConfig.dictionary.antonyms(word),
      skipClearResult,
    );
  };

  /**
   * Handle Pronunciation action
   */
  const onPronunciationClick = async (skipClearResult = false) => {
    await handleDictionaryAction(
      "pronunciation",
      "Pronunciation",
      (word) => PromptConfig.dictionary.pronunciation(word),
      skipClearResult,
    );
  };

  /**
   * Handle Examples action
   */
  const onExamplesClick = async (skipClearResult = false) => {
    await handleDictionaryAction(
      "examples",
      "Examples",
      (word) => PromptConfig.dictionary.examples(word),
      skipClearResult,
    );
  };

  /**
   * Generic rewriter handler using Chrome AI Rewriter API
   * @param {string} actionType - Type of rewrite ('grammar', 'moreFormal', 'shorter', etc.)
   * @param {string} actionName - Display name for action
   * @param {Object} rewriteOptions - RewriterService options (tone, format, length)
   */
  const handleRewrite = async (
    actionType: string,
    actionName: string,
    rewriteOptions: Record<string, unknown> = {},
    skipClearResult = false,
  ) => {
    if (showWriterInput) {
      setShowWriterInput(false);
    }

    if (!selectedText) {
      setError("No text selected");
      return;
    }

    if (isLoading && abortControllerRef.current) {
      abortControllerRef.current.abort();
      await abortPreviousRequest();
    }

    setIsLoading(true);
    setAction(`rewrite-${actionType}`);
    setError("");
    if (!skipClearResult) {
      setResult("");
    }
    setHasInserted(false);
    hasInsertedRef.current = false;
    setImprovedContent(null);

    Logger.log("AIToolbar", `${actionName} clicked (streaming)`);

    abortControllerRef.current = new AbortController();

    try {
      if (aiConfig?.aiFeatures?.rewriter?.enabled === false) {
        throw new Error("Rewriter is disabled in settings");
      }

      const text = selectedText.trim();
      let fullRewrite = "";

      for await (const chunk of RewriterServiceProxy.rewriteStreaming(
        text,
        rewriteOptions,
      )) {
        if (abortControllerRef.current?.signal.aborted) {
          Logger.log("AIToolbar", "Rewrite streaming aborted");
          break;
        }

        fullRewrite += chunk;

        if (!abortControllerRef.current?.signal.aborted) {
          setResultThrottled(fullRewrite);
        }
      }

      if (!abortControllerRef.current?.signal.aborted && fullRewrite) {
        setResult(fullRewrite);
      }

      Logger.log("AIToolbar", `${actionName} streaming complete`);
    } catch (err: unknown) {
      if (
        (err as { name?: string }).name !== "AbortError" &&
        !abortControllerRef.current?.signal.aborted
      ) {
        Logger.error("AIToolbar", "${actionName} failed:", err);
        setError(`${actionName} failed: ` + getErrorMessage(err));
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  /**
   * Fix Grammar - More formal tone
   */
  const onFixGrammarClick = async (skipClearResult = false) => {
    await handleRewrite(
      "grammar",
      "Fix Grammar",
      {
        tone: "as-is",
        format: "as-is",
        length: "as-is",
        context:
          "Fix any grammar errors while maintaining the original tone and style.",
      },
      skipClearResult,
    );
  };

  /**
   * Fix Spelling - More formal tone
   */
  const onFixSpellingClick = async (skipClearResult = false) => {
    await handleRewrite(
      "spelling",
      "Fix Spelling",
      {
        tone: "as-is",
        format: "as-is",
        length: "as-is",
        context:
          "Fix any spelling errors while maintaining the original tone and style.",
      },
      skipClearResult,
    );
  };

  /**
   * Make More Formal
   */
  const onMakeFormalClick = async (skipClearResult = false) => {
    await handleRewrite(
      "moreFormal",
      "Make Formal",
      {
        tone: "more-formal",
        format: "as-is",
        length: "as-is",
      },
      skipClearResult,
    );
  };

  /**
   * Make More Casual
   */
  const onMakeCasualClick = async (skipClearResult = false) => {
    await handleRewrite(
      "moreCasual",
      "Make Casual",
      {
        tone: "more-casual",
        format: "as-is",
        length: "as-is",
      },
      skipClearResult,
    );
  };

  /**
   * Make Shorter
   */
  const onMakeShorterClick = async (skipClearResult = false) => {
    await handleRewrite(
      "shorter",
      "Make Shorter",
      {
        tone: "as-is",
        format: "as-is",
        length: "shorter",
      },
      skipClearResult,
    );
  };

  /**
   * Make Longer/Expand
   */
  const onExpandClick = async (skipClearResult = false) => {
    await handleRewrite(
      "longer",
      "Expand",
      {
        tone: "as-is",
        format: "as-is",
        length: "longer",
      },
      skipClearResult,
    );
  };

  /**
   * Professional Tone (combination: more formal + maintain length)
   */
  const onMakeProfessionalClick = async (skipClearResult = false) => {
    await handleRewrite(
      "professional",
      "Make Professional",
      {
        tone: "more-formal",
        format: "as-is",
        length: "as-is",
        context: "Rewrite in a professional, business-appropriate tone.",
      },
      skipClearResult,
    );
  };

  /**
   * Simplify (combination: casual tone + shorter length)
   */
  const onSimplifyClick = async (skipClearResult = false) => {
    await handleRewrite(
      "simplify",
      "Simplify",
      {
        tone: "more-casual",
        format: "plain-text",
        length: "shorter",
        context: "Simplify the text using simpler words and shorter sentences.",
      },
      skipClearResult,
    );
  };

  /**
   * Improve Clarity (rewrite maintaining tone but improving structure)
   */
  const onImproveClarityClick = async (skipClearResult = false) => {
    await handleRewrite(
      "clarity",
      "Improve Clarity",
      {
        tone: "as-is",
        format: "as-is",
        length: "as-is",
        context:
          "Improve clarity and readability while maintaining the original tone and length.",
      },
      skipClearResult,
    );
  };

  /**
   * Make Concise (shorter)
   */
  const onMakeConciseClick = async (skipClearResult = false) => {
    await handleRewrite(
      "concise",
      "Make Concise",
      {
        tone: "as-is",
        format: "as-is",
        length: "shorter",
        context: "Make more concise while preserving key information.",
      },
      skipClearResult,
    );
  };

  /**
   * Custom Rewrite - Show input panel for custom instructions
   */
  const onCustomRewriteClick = () => {
    Logger.log("AIToolbar", "Custom Rewrite clicked - showing input panel");
    setShowWriterInput(!showWriterInput); // Toggle
    setAction("rewrite-custom");
    setResult("");
    setError("");
  };

  /**
   * Handle Custom Rewrite - Rewrite selected text with custom instructions
   */
  const handleCustomRewrite = async (
    customInstructions: string,
    skipClearResult = false,
  ) => {
    if (!customInstructions || !selectedText) {
      Logger.error(
        "AIToolbar",
        "No instructions or selected text for custom rewrite",
      );
      return;
    }

    Logger.log(
      "AIToolbar",
      "Custom rewrite with instructions:",
      customInstructions,
    );

    setShowWriterInput(false);

    await handleRewrite(
      "custom",
      "Custom Rewrite",
      {
        tone: "as-is",
        format: "as-is",
        length: "as-is",
        context: customInstructions,
      },
      skipClearResult,
    );

    setWriterPrompt("");
  };

  /**
   * Write - Generate content using Writer API
   */
  const handleWrite = async (
    writerOptions: Record<string, unknown>,
    skipClearResult = false,
  ) => {
    if (!skipClearResult) {
      setResult("");
    }
    setError("");
    setAction("write");
    setIsLoading(true);
    setResultPanelActive(true);

    Logger.log("AIToolbar", "Write clicked (streaming)");

    abortControllerRef.current = new AbortController();

    try {
      if (aiConfig?.aiFeatures?.writer?.enabled === false) {
        throw new Error("Writer is disabled in settings");
      }

      if (!writerPrompt || writerPrompt.trim().length === 0) {
        throw new Error("Please enter what you want to write");
      }

      const sharedContext = writerPrompt.trim();
      let fullWritten = "";
      let isFirstChunk = true;

      for await (const chunk of WriterServiceProxy.writeStreaming(
        sharedContext,
        writerOptions,
      )) {
        if (isFirstChunk) {
          setShowWriterInput(false);
          isFirstChunk = false;
        }

        if (abortControllerRef.current?.signal.aborted) {
          Logger.log("AIToolbar", "Write streaming aborted");
          break;
        }

        fullWritten += chunk;

        if (!abortControllerRef.current?.signal.aborted) {
          setResultThrottled(fullWritten);
        }
      }

      if (!abortControllerRef.current?.signal.aborted && fullWritten) {
        setResult(fullWritten);
        setWriterPrompt("");
      }

      Logger.log("AIToolbar", "Write streaming complete");
    } catch (err: unknown) {
      if (
        (err as { name?: string }).name !== "AbortError" &&
        !abortControllerRef.current?.signal.aborted
      ) {
        Logger.error("AIToolbar", "Write failed:", err);
        setError("Write failed: " + getErrorMessage(err));
        setShowWriterInput(true);
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  /**
   * Show Writer Input Panel
   */
  const onWriteClick = () => {
    Logger.log("AIToolbar", "Write clicked - showing input panel");
    setShowWriterInput(!showWriterInput); // Toggle
    setAction("write-input");
    setResult("");
    setError("");
  };

  /**
   * Helper to abort previous request
   */
  const abortPreviousRequest = async () => {
    try {
      if (action?.startsWith("summarize-")) {
        await SummarizerServiceProxy.abort();
      } else if (action === "translate" || action === "detect-language") {
        await TranslatorServiceProxy.abort();
      } else if (action?.startsWith("rewrite-")) {
        await RewriterServiceProxy.abort();
      } else if (action?.startsWith("write-")) {
        await WriterServiceProxy.abort();
      } else if (
        action?.startsWith("image-") ||
        action?.startsWith("dictionary-")
      ) {
        await AIServiceProxy.abortRequest();
      }
    } catch (err: unknown) {
      Logger.error("AIToolbar", "Service abort failed:", err);
    }
  };

  /**
   * Handle Regenerate action
   */
  const onRegenerateClick = async () => {
    if (action?.startsWith("summarize-")) {
      const summaryType = action.replace("summarize-", "");
      await onSummarizeClick(summaryType, true);
    } else if (action === "translate") {
      await onTranslateClick(selectedTargetLanguage, true, true);
    } else if (action === "detect-language") {
      await onDetectLanguageClick();
    } else if (action?.startsWith("image-")) {
      const analysisType = action.replace("image-", "");
      await onImageAnalysisClick(analysisType, true);
    } else if (action?.startsWith("dictionary-")) {
      const dictAction = action.replace("dictionary-", "");
      switch (dictAction) {
        case "define":
          await onDictionaryClick(true);
          break;
        case "synonyms":
          await onSynonymsClick(true);
          break;
        case "antonyms":
          await onAntonymsClick(true);
          break;
        case "pronunciation":
          await onPronunciationClick(true);
          break;
        case "examples":
          await onExamplesClick(true);
          break;
      }
    } else if (action?.startsWith("rewrite-")) {
      const rewriteAction = action.replace("rewrite-", "");
      switch (rewriteAction) {
        case "grammar":
          await onFixGrammarClick(true);
          break;
        case "spelling":
          await onFixSpellingClick(true);
          break;
        case "moreFormal":
          await onMakeFormalClick(true);
          break;
        case "moreCasual":
          await onMakeCasualClick(true);
          break;
        case "professional":
          await onMakeProfessionalClick(true);
          break;
        case "simplify":
          await onSimplifyClick(true);
          break;
        case "longer":
          await onExpandClick(true);
          break;
        case "concise":
          await onMakeConciseClick(true);
          break;
        case "shorter":
          await onMakeShorterClick(true);
          break;
        case "clarity":
          await onImproveClarityClick(true);
          break;
      }
    } else if (action === "write") {
      await handleWrite(
        aiConfig?.aiFeatures?.writer || {
          tone: "neutral",
          format: "plain-text",
          length: "medium",
        },
      );
    }
  };

  /**
   * Handle Add to Chat action
   */
  const onAddToChatClick = async () => {
    Logger.log("AIToolbar", "Add to Chat clicked");

    if (
      !hoveredImageElement &&
      !selectedText &&
      selectedImages.length === 0 &&
      selectedAudios.length === 0
    ) {
      setError("Nothing selected");
      return;
    }

    let result;

    if (hoveredImageElement) {
      Logger.log("AIToolbar", "Extracting hovered image for Add to Chat");

      const containerToUse =
        hoveredImageElement.parentElement || hoveredImageElement;

      const fakeSelection = {
        containsNode: (node: Node) => node === hoveredImageElement,
        toString: () => "",
      } as unknown as Selection;

      result = await MediaExtractionService.processAndExtract({
        container: containerToUse,
        selection: fakeSelection,
      });
    } else {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        setError("Selection lost");
        return;
      }

      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;
      const containerEl =
        container.nodeType === 3
          ? container.parentElement
          : (container as Element | null);

      result = await MediaExtractionService.processAndExtract({
        container: containerEl,
        selection: selection,
      });
    }

    Logger.log("AIToolbar", "Extracted data:", result);

    handleAddToChat({
      text: result.text || selectedText || "",
      images: result.images as any,
      audios: result.audios as any,
    });

    setIsVisible(false);
  };

  const handleToolbarActionCommand = useEffectEvent(
    (detail: VAssistToolbarActionEventDetail | null) => {
      if (!detail?.action) {
        return;
      }

      setIsVisible(true);
      setIsClosing(false);

      switch (detail.action) {
        case "dictionary-define":
          void onDictionaryClick();
          break;
        case "dictionary-synonyms":
          void onSynonymsClick();
          break;
        case "dictionary-antonyms":
          void onAntonymsClick();
          break;
        case "dictionary-pronunciation":
          void onPronunciationClick();
          break;
        case "dictionary-examples":
          void onExamplesClick();
          break;
        case "rewrite-grammar":
          void onFixGrammarClick();
          break;
        case "rewrite-spelling":
          void onFixSpellingClick();
          break;
        case "rewrite-moreFormal":
          void onMakeFormalClick();
          break;
        case "rewrite-moreCasual":
          void onMakeCasualClick();
          break;
        case "rewrite-professional":
          void onMakeProfessionalClick();
          break;
        case "rewrite-shorter":
          void onMakeShorterClick();
          break;
        case "rewrite-longer":
          void onExpandClick();
          break;
        case "rewrite-simplify":
          void onSimplifyClick();
          break;
        case "rewrite-concise":
          void onMakeConciseClick();
          break;
        case "rewrite-clarity":
          void onImproveClarityClick();
          break;
        case "rewrite-custom":
          onCustomRewriteClick();
          break;
        case "write":
          onWriteClick();
          break;
        case "dictation":
          void onDictationClick();
          break;
        case "summarize-tldr":
          void onSummarizeClick("tldr");
          break;
        case "summarize-headline":
          void onSummarizeClick("headline");
          break;
        case "summarize-key-points":
          void onSummarizeClick("key-points");
          break;
        case "summarize-teaser":
          void onSummarizeClick("teaser");
          break;
        case "translate":
          void onTranslateClick(
            detail.options?.targetLanguage ?? null,
            detail.options?.autoDetectSourceLanguage !== false,
          );
          break;
        case "detect-language":
          void onDetectLanguageClick();
          break;
        case "image-describe":
          void onImageAnalysisClick("describe");
          break;
        case "image-extract-text":
          void onImageAnalysisClick("extract-text");
          break;
        case "image-identify-objects":
          void onImageAnalysisClick("identify-objects");
          break;
        case "add-to-chat":
          void onAddToChatClick();
          break;
      }
    },
  );

  useEffect(() => {
    const handleToolbarActionCommandEvent = (event: Event) => {
      if (!(event instanceof CustomEvent)) {
        return;
      }

      handleToolbarActionCommand(
        event.detail as VAssistToolbarActionEventDetail | null,
      );
    };

    window.addEventListener(
      getHostCommandEventName(hostId, "toolbar-action"),
      handleToolbarActionCommandEvent,
    );

    return () => {
      window.removeEventListener(
        getHostCommandEventName(hostId, "toolbar-action"),
        handleToolbarActionCommandEvent,
      );
    };
  }, [hostId, handleToolbarActionCommand]);

  /**
   * Handle copy result to clipboard
   */
  const onCopyClick = async () => {
    if (!result) return;

    const success = await UtilService.copyToClipboard(result);
    if (success) {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  /**
   * Handle Insert - replace selected text with improved version
   */
  /**
   * Generic handler for content manipulation (Insert, Undo/Redo Toggle)
   * @param {string} operation - 'insert' or 'toggle'
   */
  const handleContentManipulation = async (operation: "insert" | "toggle") => {
    if (!editableElement || !isEditableContent) return;

    let newContent = "";
    let restoreSelection = false;
    let selectionStart = 0;
    let selectionEnd = 0;

    if (operation === "insert") {
      if (!result) return;
      newContent = result;
    } else if (operation === "toggle") {
      if (hasInserted) {
        if (!originalContent) return;
        newContent = originalContent;
        restoreSelection = true;
        selectionStart = editableSelectionStart;
        selectionEnd = editableSelectionEnd;
      } else {
        if (!improvedContent) return;
        newContent = improvedContent;
      }
    } else {
      return;
    }

    Logger.log(
      "AIToolbar",
      `${operation.charAt(0).toUpperCase() + operation.slice(1)} operation started`,
    );

    try {
      if (editableType === "input" || editableType === "textarea") {
        const textElement = editableElement as
          | HTMLInputElement
          | HTMLTextAreaElement;
        if (operation === "insert") {
          const currentValue = textElement.value;
          const start = editableSelectionStart;
          const end = editableSelectionEnd;
          const improvedValue =
            currentValue.substring(0, start) +
            newContent +
            currentValue.substring(end);

          setImprovedContent(improvedValue);

          textElement.value = improvedValue;
          selectionStart = start;
          selectionEnd = start + newContent.length;
        } else {
          textElement.value = newContent;
          if (!hasInserted) {
            selectionStart = editableSelectionStart;
            selectionEnd =
              editableSelectionStart +
              ((improvedContent ?? "").length -
                (originalContent ?? "").length +
                (editableSelectionEnd - editableSelectionStart));
          }
        }

        textElement.dispatchEvent(new Event("input", { bubbles: true }));
        textElement.dispatchEvent(new Event("change", { bubbles: true }));

        textElement.focus();
        textElement.setSelectionRange(selectionStart, selectionEnd);
      } else if (editableType === "contenteditable") {
        if (operation === "insert") {
          const selection = window.getSelection();
          if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            range.deleteContents();

            const fragment = document.createDocumentFragment();
            const lines = newContent.split("\n");
            lines.forEach((line, index) => {
              fragment.appendChild(document.createTextNode(line));
              if (index < lines.length - 1) {
                fragment.appendChild(document.createElement("br"));
              }
            });

            const firstNode = fragment.firstChild;
            const lastNode = fragment.lastChild;
            range.insertNode(fragment);

            setImprovedContent(editableElement.innerHTML);

            editableElement.dispatchEvent(
              new Event("input", { bubbles: true }),
            );

            if (firstNode && lastNode) {
              range.setStartBefore(firstNode);
              range.setEndAfter(lastNode);
              selection.removeAllRanges();
              selection.addRange(range);
            }
          }
        } else {
          editableElement.innerHTML = newContent;
          editableElement.dispatchEvent(new Event("input", { bubbles: true }));
          editableElement.focus();

          try {
            const selection = window.getSelection();
            const range = document.createRange();

            if (hasInserted && restoreSelection && selectedText) {
              const textNodes = [];
              const walk = document.createTreeWalker(
                editableElement,
                NodeFilter.SHOW_TEXT,
                null,
              );
              let node;
              while ((node = walk.nextNode())) {
                textNodes.push(node);
              }

              if (textNodes.length > 0) {
                let charCount = 0;
                let startNode = null;
                let startOffset = 0;
                let endNode = null;
                let endOffset = 0;
                let found = false;

                for (const textNode of textNodes) {
                  const nodeLength = (textNode.textContent ?? "").length;

                  if (!found && charCount + nodeLength >= selectionStart) {
                    startNode = textNode;
                    startOffset = selectionStart - charCount;
                    found = true;
                  }

                  if (found && charCount + nodeLength >= selectionEnd) {
                    endNode = textNode;
                    endOffset = selectionEnd - charCount;
                    break;
                  }

                  charCount += nodeLength;
                }

                if (startNode && endNode) {
                  range.setStart(
                    startNode,
                    Math.min(startOffset, (startNode.textContent ?? "").length),
                  );
                  range.setEnd(
                    endNode,
                    Math.min(endOffset, (endNode.textContent ?? "").length),
                  );
                  if (selection) {
                    selection.removeAllRanges();
                    selection.addRange(range);
                  }
                }
              }
            } else {
              range.selectNodeContents(editableElement);
              if (selection) {
                selection.removeAllRanges();
                selection.addRange(range);
              }
            }
          } catch (selectionErr) {
            Logger.warn(
              "AIToolbar",
              "Could not restore selection for toggle:",
              selectionErr,
            );
          }
        }
      }

      if (operation === "insert") {
        setHasInserted(true);
        hasInsertedRef.current = true;
        setResult("");
        setError("");
        Logger.log(
          "AIToolbar",
          "Text inserted successfully and selected, panel closed",
        );
      } else if (operation === "toggle") {
        setHasInserted(!hasInserted);
        hasInsertedRef.current = !hasInsertedRef.current;
        Logger.log(
          "AIToolbar",
          `Toggled to ${hasInserted ? "original" : "improved"} content`,
        );
      }
    } catch (err: unknown) {
      Logger.error("AIToolbar", "Failed to ${operation}:", err);
      setError(`Failed to ${operation}: ` + getErrorMessage(err));
    }
  };

  /**
   * Handle Insert - insert improved text
   */
  const onInsertClick = async () => {
    if (action === "dictation" && isRecording) {
      Logger.log("AIToolbar", "Stopping dictation on Insert click");
      VoiceRecordingService.stop();
      setIsRecording(false);
    }

    await handleContentManipulation("insert");
  };

  /**
   * Handle Undo - Restore original content
   */
  const onUndoClick = async () => {
    if (!hasInserted || !originalContent || !editableElement) return;

    if (editableType === "contenteditable") {
      editableElement.innerHTML = originalContent;
      editableElement.dispatchEvent(new Event("input", { bubbles: true }));
      editableElement.focus();

      try {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editableElement);
        if (selection) {
          selection.removeAllRanges();
          selection.addRange(range);
        }

        setSelectedText(
          editableElement.textContent || editableElement.innerText,
        );
      } catch (err: unknown) {
        Logger.warn(
          "AIToolbar",
          "Could not restore selection after undo:",
          err,
        );
      }
    } else {
      const textElement = editableElement as
        | HTMLInputElement
        | HTMLTextAreaElement;
      textElement.value = originalContent;
      textElement.dispatchEvent(new Event("input", { bubbles: true }));
      textElement.focus();

      textElement.setSelectionRange(0, originalContent.length);

      setSelectedText(originalContent);
    }

    setHasInserted(false);
    hasInsertedRef.current = false;
    setResultPanelActive(true);
    Logger.log("AIToolbar", "Undo: Restored original content with selection");
  };

  /**
   * Handle Redo - Restore improved content
   */
  const onRedoClick = async () => {
    if (hasInserted || !improvedContent || !editableElement) return;

    if (editableType === "contenteditable") {
      editableElement.innerHTML = improvedContent;
      editableElement.dispatchEvent(new Event("input", { bubbles: true }));
      editableElement.focus();

      try {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editableElement);
        if (selection) {
          selection.removeAllRanges();
          selection.addRange(range);
        }

        setSelectedText(
          editableElement.textContent || editableElement.innerText,
        );
      } catch (err: unknown) {
        Logger.warn(
          "AIToolbar",
          "Could not restore selection after redo:",
          err,
        );
      }
    } else {
      const textElement = editableElement as
        | HTMLInputElement
        | HTMLTextAreaElement;
      textElement.value = improvedContent;
      textElement.dispatchEvent(new Event("input", { bubbles: true }));
      textElement.focus();

      textElement.setSelectionRange(0, improvedContent.length);

      setSelectedText(improvedContent);
    }

    setHasInserted(true);
    hasInsertedRef.current = true;
    setResultPanelActive(true);
    Logger.log("AIToolbar", "Redo: Restored improved content with selection");
  };

  /**
   * Handle dictation button click
   * Continuous dictation mode with VAD (Voice Activity Detection):
   * - Manual mode: User clicks Insert to insert all accumulated text
   * - Auto mode: Text already inserted sentence-by-sentence, cursor at end
   */
  async function onDictationClick() {
    try {
      if (!isRecording) {
        const hasSelection = selectedText && selectedText.trim().length > 0;
        const mode = hasSelection ? "manual" : "auto-insert";
        setDictationMode(mode);
        setIsRecording(true);
        setRecordingDuration(0);
        setAccumulatedTranscription("");
        setAction("dictation");
        setResult("");
        setError("");
        isProcessingRef.current = false;

        Logger.log(
          "AIToolbar",
          `Starting dictation session in ${mode} mode with VAD`,
        );

        const startTime = Date.now();
        recordingIntervalRef.current = setInterval(() => {
          setRecordingDuration(Math.floor((Date.now() - startTime) / 1000));
        }, 100);

        await VoiceRecordingService.start({
          onTranscription: (transcription) => {
            Logger.log(
              "AIToolbar",
              `VAD transcription received: "${transcription}"`,
            );

            if (mode === "auto-insert") {
              if (editableElement && isEditableContent) {
                const separator = accumulatedTranscription ? " " : "";

                if (getFocusedElement() !== editableElement) {
                  editableElement.focus();
                }

                if (editableType === "contenteditable") {
                  let range;
                  if (savedCursorPositionRef.current?.range) {
                    range = savedCursorPositionRef.current.range;
                  } else {
                    const selection = window.getSelection();
                    if (selection && selection.rangeCount > 0) {
                      range = selection.getRangeAt(0);
                    }
                  }

                  if (range) {
                    range.deleteContents();
                    range.insertNode(
                      document.createTextNode(separator + transcription),
                    );
                    range.collapse(false);
                    savedCursorPositionRef.current = {
                      element: editableElement,
                      range: range.cloneRange(),
                    };
                  }
                } else {
                  const textElement = editableElement as
                    | HTMLInputElement
                    | HTMLTextAreaElement;
                  const currentValue = textElement.value;
                  const cursorPos =
                    savedCursorPositionRef.current?.start ??
                    textElement.selectionStart ??
                    editableSelectionStart;
                  const newValue =
                    currentValue.slice(0, cursorPos) +
                    separator +
                    transcription +
                    currentValue.slice(cursorPos);
                  textElement.value = newValue;
                  const newCursorPos =
                    cursorPos + separator.length + transcription.length;
                  textElement.setSelectionRange(newCursorPos, newCursorPos);
                  textElement.dispatchEvent(
                    new Event("input", { bubbles: true }),
                  );

                  setEditableSelectionStart(newCursorPos);
                  setEditableSelectionEnd(newCursorPos);
                  savedCursorPositionRef.current = {
                    element: textElement,
                    start: newCursorPos,
                    end: newCursorPos,
                  };
                }

                setAccumulatedTranscription(
                  (prev) => prev + separator + transcription,
                );
                Logger.log(
                  "AIToolbar",
                  `Auto-inserted sentence: "${transcription}" at cursor position`,
                );
              }
            } else {
              setAccumulatedTranscription((prev) => {
                const separator = prev ? " " : "";
                const newText = prev + separator + transcription;
                setResult(newText);
                Logger.log(
                  "AIToolbar",
                  `Added sentence to result panel. Total: "${newText}"`,
                );
                return newText;
              });
            }
          },
          onError: (errorMsg: unknown) => {
            Logger.error("AIToolbar", "Dictation error:", errorMsg);
            setError(getErrorMessage(errorMsg));
            setIsRecording(false);
            if (recordingIntervalRef.current) {
              clearInterval(recordingIntervalRef.current);
              recordingIntervalRef.current = null;
            }
          },
          onRecordingStart: () => {
            Logger.log("AIToolbar", "VAD detected speech - recording started");
          },
          onRecordingStop: () => {
            Logger.log(
              "AIToolbar",
              "VAD detected silence - recording stopped, processing transcription...",
            );
          },
          onVolumeChange: (_volume) => {},
        });
      } else {
        Logger.log(
          "AIToolbar",
          "Stopping dictation session (VAD will stop monitoring)",
        );
        VoiceRecordingService.stop();
        setIsRecording(false);
        if (recordingIntervalRef.current) {
          clearInterval(recordingIntervalRef.current);
          recordingIntervalRef.current = null;
        }
        Logger.log(
          "AIToolbar",
          "Dictation session ended, toolbar remains open",
        );
      }
    } catch (error: unknown) {
      Logger.error("AIToolbar", "Dictation error:", error);
      setError(getErrorMessage(error));
      setIsRecording(false);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
    }
  }

  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    };
  }, []);

  if (!isEnabled || !isVisible) {
    return null;
  }

  const { isSingleWord } = getSelectionType(selectedText);

  const hasTextSelection = selectedText && selectedText.trim().length > 0;

  return (
    <>
      {shouldRender && (
        <div
          ref={toolbarRef}
          data-electron-interactive="true"
          data-testid="ai-toolbar"
          className={cn(
            "fixed top-0 left-0 flex items-center gap-0.5 p-1 rounded-[20px]",
            "border shadow-[0_4px_20px_rgba(0,0,0,0.25)] backdrop-blur-xl will-change-transform",
            "glass-container",
            isLightBackgroundToolbar && "glass-container-dark",
            isClosing ? "animate-fade-out" : "animate-fade-in",
          )}
          style={{
            transform: `translate(${position.x}px, ${position.y}px)`,
            zIndex: 999999,
          }}
        >
          {/* Toolbar buttons with labels - Expand sub-options on hover */}

          {/* Dictionary Group - Only show for single words/short selections with text */}
          {hasTextSelection &&
            isSingleWord &&
            renderToolbarSection("dictionary", [
              {
                itemId: "dictionary-define",
                props: {
                  icon: "book",
                  label: "Dictionary",
                  onClick: () => onDictionaryClick(resultPanelActive),
                  disabled: !selectedText,
                  isLoading: isLoading && action === "dictionary-define",
                  actionType: "dictionary-define",
                  title: "Get word definition",
                  maxLabelWidth: "100px",
                },
              },
              {
                itemId: "dictionary-synonyms",
                props: {
                  icon: "refresh",
                  label: "Synonyms",
                  onClick: () => onSynonymsClick(resultPanelActive),
                  disabled: !selectedText,
                  isLoading: isLoading && action === "dictionary-synonyms",
                  actionType: "dictionary-synonyms",
                  title: "Find similar words",
                  maxLabelWidth: "100px",
                },
              },
              {
                itemId: "dictionary-antonyms",
                props: {
                  icon: "bidirectional",
                  label: "Antonyms",
                  onClick: () => onAntonymsClick(resultPanelActive),
                  disabled: !selectedText,
                  isLoading: isLoading && action === "dictionary-antonyms",
                  actionType: "dictionary-antonyms",
                  title: "Find opposite words",
                  maxLabelWidth: "100px",
                },
              },
              {
                itemId: "dictionary-pronunciation",
                props: {
                  icon: "speaker",
                  label: "Pronunciation",
                  onClick: () => onPronunciationClick(resultPanelActive),
                  disabled: !selectedText,
                  isLoading: isLoading && action === "dictionary-pronunciation",
                  actionType: "dictionary-pronunciation",
                  title: "Get pronunciation guide",
                  maxLabelWidth: "120px",
                },
              },
              {
                itemId: "dictionary-examples",
                props: {
                  icon: "idea",
                  label: "Examples",
                  onClick: () => onExamplesClick(resultPanelActive),
                  disabled: !selectedText,
                  isLoading: isLoading && action === "dictionary-examples",
                  actionType: "dictionary-examples",
                  title: "See usage examples",
                  maxLabelWidth: "100px",
                },
              },
            ])}

          {/* Rewrite Text Group - Only show for editable content */}
          {hasTextSelection &&
            isEditableContent &&
            isRewriterEnabled &&
            renderToolbarSection("rewrite", [
              {
                itemId: "rewrite-grammar",
                props: {
                  icon: "write",
                  label: "Rewrite",
                  onClick: () => onFixGrammarClick(resultPanelActive),
                  disabled: !selectedText,
                  isLoading: isLoading && action === "rewrite-grammar",
                  actionType: "rewrite-grammar",
                  title: "Fix grammar (default)",
                  maxLabelWidth: "100px",
                },
              },
              {
                itemId: "rewrite-spelling",
                props: {
                  icon: "check",
                  label: "Spelling",
                  onClick: () => onFixSpellingClick(resultPanelActive),
                  disabled: !selectedText,
                  isLoading: isLoading && action === "rewrite-spelling",
                  actionType: "rewrite-spelling",
                  title: "Fix spelling",
                  maxLabelWidth: "100px",
                },
              },
              {
                itemId: "rewrite-moreFormal",
                props: {
                  icon: "formal",
                  label: "Formal",
                  onClick: () => onMakeFormalClick(resultPanelActive),
                  disabled: !selectedText,
                  isLoading: isLoading && action === "rewrite-moreFormal",
                  actionType: "rewrite-moreFormal",
                  title: "Make formal",
                  maxLabelWidth: "100px",
                },
              },
              {
                itemId: "rewrite-moreCasual",
                props: {
                  icon: "casual",
                  label: "Casual",
                  onClick: () => onMakeCasualClick(resultPanelActive),
                  disabled: !selectedText,
                  isLoading: isLoading && action === "rewrite-moreCasual",
                  actionType: "rewrite-moreCasual",
                  title: "Make casual",
                  maxLabelWidth: "100px",
                },
              },
              {
                itemId: "rewrite-professional",
                props: {
                  icon: "briefcase",
                  label: "Professional",
                  onClick: () => onMakeProfessionalClick(resultPanelActive),
                  disabled: !selectedText,
                  isLoading: isLoading && action === "rewrite-professional",
                  actionType: "rewrite-professional",
                  title: "Make professional",
                  maxLabelWidth: "110px",
                },
              },
              {
                itemId: "rewrite-shorter",
                props: {
                  icon: "compress",
                  label: "Shorter",
                  onClick: () => onMakeShorterClick(resultPanelActive),
                  disabled: !selectedText,
                  isLoading: isLoading && action === "rewrite-shorter",
                  actionType: "rewrite-shorter",
                  title: "Make shorter",
                  maxLabelWidth: "100px",
                },
              },
              {
                itemId: "rewrite-longer",
                props: {
                  icon: "note",
                  label: "Expand",
                  onClick: () => onExpandClick(resultPanelActive),
                  disabled: !selectedText,
                  isLoading: isLoading && action === "rewrite-longer",
                  actionType: "rewrite-longer",
                  title: "Expand text",
                  maxLabelWidth: "100px",
                },
              },
              {
                itemId: "rewrite-simplify",
                props: {
                  icon: "book",
                  label: "Simplify",
                  onClick: () => onSimplifyClick(resultPanelActive),
                  disabled: !selectedText,
                  isLoading: isLoading && action === "rewrite-simplify",
                  actionType: "rewrite-simplify",
                  title: "Simplify text",
                  maxLabelWidth: "100px",
                },
              },
              {
                itemId: "rewrite-concise",
                props: {
                  icon: "lightning",
                  label: "Concise",
                  onClick: () => onMakeConciseClick(resultPanelActive),
                  disabled: !selectedText,
                  isLoading: isLoading && action === "rewrite-concise",
                  actionType: "rewrite-concise",
                  title: "Make concise",
                  maxLabelWidth: "100px",
                },
              },
              {
                itemId: "rewrite-clarity",
                props: {
                  icon: "clarity",
                  label: "Clarity",
                  onClick: () => onImproveClarityClick(resultPanelActive),
                  disabled: !selectedText,
                  isLoading: isLoading && action === "rewrite-clarity",
                  actionType: "rewrite-clarity",
                  title: "Improve clarity",
                  maxLabelWidth: "100px",
                },
              },
              {
                itemId: "rewrite-custom",
                props: {
                  icon: "edit",
                  label: "Custom",
                  onClick: () => onCustomRewriteClick(),
                  disabled: !selectedText,
                  isLoading: false,
                  actionType: "rewrite-custom",
                  title: "Custom rewrite with instructions",
                  maxLabelWidth: "100px",
                },
              },
            ])}

          {/* Write Button - Only show for editable content */}
          {isEditableContent &&
            isWriterEnabled &&
            renderToolbarButton("write", {
              itemId: "write",
              props: {
                icon: "edit",
                label: "Write",
                onClick: onWriteClick,
                disabled: false,
                isLoading: isLoading && action === "write",
                actionType: "write",
                title: "Generate text with AI",
                maxLabelWidth: "80px",
              },
            })}

          {/* Dictation Button - Only show for editable content */}
          {isEditableContent &&
            renderToolbarButton("dictation", {
              itemId: "dictation",
              props: {
                icon: isRecording ? "stop" : "microphone",
                label: isRecording ? `${recordingDuration}s` : "Dictate",
                onClick: onDictationClick,
                disabled: false,
                isLoading: isRecording,
                actionType: "dictation",
                title: isRecording
                  ? "Click to stop recording"
                  : selectedText && selectedText.trim().length > 0
                    ? "Record and insert via button"
                    : "Record and auto-insert at cursor",
                maxLabelWidth: "80px",
              },
            })}

          {/* Summarize Group - Only show when text is selected and not a single word */}
          {hasTextSelection &&
            !isSingleWord &&
            isSummarizerEnabled &&
            renderToolbarSection("summarize", [
              {
                itemId: "summarize-tldr",
                props: {
                  icon: "note",
                  label: "Summarize",
                  onClick: () => onSummarizeClick("tldr", resultPanelActive),
                  disabled: !selectedText,
                  isLoading: isLoading && action === "summarize-tldr",
                  actionType: "summarize-tldr",
                  title: "Summarize (TL;DR)",
                  maxLabelWidth: "100px",
                },
              },
              {
                itemId: "summarize-headline",
                props: {
                  icon: "article",
                  label: "Headline",
                  onClick: () =>
                    onSummarizeClick("headline", resultPanelActive),
                  disabled: !selectedText,
                  isLoading: isLoading && action === "summarize-headline",
                  actionType: "summarize-headline",
                  title: "Generate headline",
                  maxLabelWidth: "100px",
                },
              },
              {
                itemId: "summarize-key-points",
                props: {
                  icon: "key",
                  label: "Key Points",
                  onClick: () =>
                    onSummarizeClick("key-points", resultPanelActive),
                  disabled: !selectedText,
                  isLoading: isLoading && action === "summarize-key-points",
                  actionType: "summarize-key-points",
                  title: "Extract key points",
                  maxLabelWidth: "100px",
                },
              },
              {
                itemId: "summarize-teaser",
                props: {
                  icon: "magic",
                  label: "Teaser",
                  onClick: () => onSummarizeClick("teaser", resultPanelActive),
                  disabled: !selectedText,
                  isLoading: isLoading && action === "summarize-teaser",
                  actionType: "summarize-teaser",
                  title: "Create teaser",
                  maxLabelWidth: "100px",
                },
              },
            ])}

          {/* Translate Group - Only show when text is selected */}
          {hasTextSelection &&
            renderToolbarSection("translate", [
              ...(isTranslatorEnabled
                ? [
                    {
                      itemId: "translate" as const,
                      props: {
                        icon: "globe",
                        label: "Translate",
                        onClick: () =>
                          onTranslateClick(null, true, resultPanelActive),
                        disabled: !selectedText,
                        isLoading: isLoading && action === "translate",
                        actionType: "translate",
                        title: "Translate",
                        maxLabelWidth: "100px",
                      },
                    },
                  ]
                : []),
              ...(isLanguageDetectorEnabled
                ? [
                    {
                      itemId: "detect-language" as const,
                      props: {
                        icon: "search",
                        label: "Detect Lang",
                        onClick: () => onDetectLanguageClick(resultPanelActive),
                        disabled: !selectedText,
                        isLoading: isLoading && action === "detect-language",
                        actionType: "detect-language",
                        title: "Detect language",
                        maxLabelWidth: "90px",
                      },
                    },
                  ]
                : []),
            ])}

          {/* Image Analysis Group - show when images are selected OR when hovered image exists */}
          {(selectedImages.length > 0 || hoveredImageElement) &&
            renderToolbarSection("image-analysis", [
              {
                itemId: "image-describe",
                props: {
                  icon: "image",
                  label: "Describe",
                  onClick: () =>
                    onImageAnalysisClick("describe", resultPanelActive),
                  disabled: false,
                  isLoading: isLoading && action === "image-describe",
                  actionType: "image-describe",
                  title: "Describe image",
                  maxLabelWidth: "100px",
                },
              },
              {
                itemId: "image-extract-text",
                props: {
                  icon: "document",
                  label: "Extract Text",
                  onClick: () =>
                    onImageAnalysisClick("extract-text", resultPanelActive),
                  disabled: false,
                  isLoading: isLoading && action === "image-extract-text",
                  actionType: "image-extract-text",
                  title: "Extract text",
                  maxLabelWidth: "100px",
                },
              },
              {
                itemId: "image-identify-objects",
                props: {
                  icon: "tag",
                  label: "Identify Objects",
                  onClick: () =>
                    onImageAnalysisClick("identify-objects", resultPanelActive),
                  disabled: false,
                  isLoading: isLoading && action === "image-identify-objects",
                  actionType: "image-identify-objects",
                  title: "Identify objects",
                  maxLabelWidth: "150px",
                },
              },
            ])}

          {/* Add to Chat button - hide when showing toolbar from input focus (dictation mode) */}
          {!showingFromInputFocusRef.current &&
            renderToolbarButton("add-to-chat", {
              itemId: "add-to-chat",
              props: {
                icon: "ai",
                label: "Add to Chat",
                onClick: onAddToChatClick,
                disabled: false,
                isLoading: false,
                actionType: "chat",
                title: "Add to chat",
                maxLabelWidth: "100px",
              },
            })}

          {customToolbarActions ? customToolbarActions : null}

          {/* Insert button - Only show when result is ready for editable content */}
          {result &&
            !hasInserted &&
            isEditableContent &&
            (action?.startsWith("rewrite-") ||
              action?.startsWith("write-") ||
              action === "write" ||
              action === "dictation" ||
              action === "translate") &&
            renderToolbarButton("insert", {
              itemId: "insert",
              props: {
                icon: "download",
                label: "Insert",
                onClick: (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onInsertClick();
                },
                disabled: false,
                isLoading: false,
                actionType: "insert",
                title: "Insert generated text",
                maxLabelWidth: "80px",
              },
            })}

          {/* Undo button - Restore original text after insert */}
          {hasInserted &&
            isEditableContent &&
            originalContent &&
            renderToolbarButton("undo", {
              itemId: "undo",
              props: {
                icon: "undo",
                label: "",
                onClick: (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onUndoClick();
                },
                disabled: false,
                isLoading: false,
                actionType: "undo",
                title: "Restore original text",
                maxLabelWidth: "0px",
              },
            })}

          {/* Redo button - Restore generated text after undo */}
          {!hasInserted &&
            isEditableContent &&
            improvedContent &&
            renderToolbarButton("redo", {
              itemId: "redo",
              props: {
                icon: "redo",
                label: "",
                onClick: (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRedoClick();
                },
                disabled: false,
                isLoading: false,
                actionType: "redo",
                title: "Restore generated text",
                maxLabelWidth: "0px",
              },
            })}
        </div>
      )}

      {/* Writer Input Panel or Result Panel - shown BELOW toolbar, toolbar stays visible */}
      {shouldRenderResultPanel &&
        (showWriterInput &&
        (action === "write-input" || action === "rewrite-custom") ? (
          <div
            ref={resultPanelRef}
            data-electron-interactive="true"
            data-testid="ai-toolbar-writer-panel"
            className={cn(
              isResultPanelClosing ? "animate-fade-out" : "animate-fade-in",
            )}
            style={{
              position: "fixed",
              top: shouldShowPanelAbove
                ? `${position.y - 60}px`
                : `${position.y + 50}px`,
              left: `${position.x}px`,
              zIndex: 999998,
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            {/* Writer input field */}
            <input
              data-testid="ai-toolbar-writer-input"
              type="text"
              value={writerPrompt}
              onChange={(e) => setWriterPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  if (writerPrompt.trim()) {
                    if (action === "rewrite-custom") {
                      handleCustomRewrite(writerPrompt.trim());
                    } else {
                      handleWrite(
                        aiConfig?.aiFeatures?.writer || {
                          tone: "neutral",
                          format: "plain-text",
                          length: "medium",
                        },
                      );
                    }
                  }
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowWriterInput(false);
                  setWriterPrompt("");
                }
              }}
              placeholder={
                action === "rewrite-custom"
                  ? "How should I rewrite the selected text?"
                  : "What would you like to write?"
              }
              className={cn(
                "glass-container",
                isLightBackgroundPanel && "glass-container-dark",
              )}
              style={{
                minWidth: "320px",
                maxWidth: "480px",
                height: "44px",
                padding: "0 12px",
                fontSize: "14px",
                fontFamily: "inherit",
                color: "rgba(255, 255, 255, 0.95)",
                border: "none",
                borderRadius: "16px",
                outline: "none",
                boxShadow: "0 8px 32px rgba(0, 0, 0, 0.37)",
                transition: "all 0.2s ease",
              }}
            />

            {/* Action buttons */}
            <div
              style={{
                display: "flex",
                gap: "6px",
              }}
            >
              <button
                data-testid="ai-toolbar-writer-submit"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (writerPrompt.trim()) {
                    if (action === "rewrite-custom") {
                      handleCustomRewrite(writerPrompt.trim());
                    } else {
                      handleWrite(
                        aiConfig?.aiFeatures?.writer || {
                          tone: "neutral",
                          format: "plain-text",
                          length: "medium",
                        },
                      );
                    }
                  }
                }}
                disabled={!writerPrompt.trim()}
                className={cn(
                  "glass-container",
                  isLightBackgroundPanel && "glass-container-dark",
                )}
                title="Generate (Enter)"
                style={{
                  width: "44px",
                  height: "44px",
                  padding: "0",
                  border: "none",
                  borderRadius: "12px",
                  cursor: writerPrompt.trim() ? "pointer" : "not-allowed",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s ease",
                  color: writerPrompt.trim()
                    ? isLightBackgroundPanel
                      ? "#1a1a1a"
                      : "rgba(255, 255, 255, 0.9)"
                    : isLightBackgroundPanel
                      ? "#999"
                      : "rgba(255, 255, 255, 0.5)",
                  opacity: writerPrompt.trim() ? 1 : 0.5,
                  boxShadow: "0 4px 16px rgba(0, 0, 0, 0.2)",
                }}
                onMouseEnter={(e) => {
                  if (writerPrompt.trim()) {
                    e.currentTarget.style.transform = "scale(1.05)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (writerPrompt.trim()) {
                    e.currentTarget.style.transform = "scale(1)";
                  }
                }}
              >
                <Icon name="send" size={16} />
              </button>
              <button
                data-testid="ai-toolbar-writer-cancel"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowWriterInput(false);
                  setWriterPrompt("");
                }}
                className={cn(
                  "glass-container",
                  isLightBackgroundPanel && "glass-container-dark",
                )}
                title="Cancel (Esc)"
                style={{
                  width: "44px",
                  height: "44px",
                  padding: "0",
                  border: "none",
                  borderRadius: "12px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s ease",
                  color: isLightBackgroundPanel
                    ? "#666"
                    : "rgba(255, 255, 255, 0.7)",
                  boxShadow: "0 4px 16px rgba(0, 0, 0, 0.2)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "scale(1.05)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                }}
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          </div>
        ) : (
          <ToolbarResultPanel
            ref={resultPanelRef}
            result={result}
            error={error}
            isLoading={isLoading}
            action={action}
            position={position}
            showAbove={shouldShowPanelAbove}
            isLightBackground={isLightBackgroundPanel}
            animationClass={
              isResultPanelClosing ? "animate-fade-out" : "animate-fade-in"
            }
            detectedLanguageName={detectedLanguageName}
            selectedTargetLanguage={selectedTargetLanguage}
            onTargetLanguageChange={(lang) => {
              setSelectedTargetLanguage(lang);
              onTranslateClick(lang);
            }}
            aiConfig={aiConfig}
            onRegenerateClick={onRegenerateClick}
            copySuccess={copySuccess}
            onCopyClick={onCopyClick}
            isSpeaking={isSpeaking}
            isTTSGenerating={isTTSGenerating}
            onSpeakerClick={onSpeakerClick}
            ttsConfig={ttsConfig}
            onClose={closeResult}
          />
        ))}
    </>
  );
};

export default AIToolbar;
