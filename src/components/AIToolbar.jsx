/**
 * AIToolbar Component
 * 
 * Floating toolbar that appears when user selects text or images on the page.
 * Provides quick actions: Summarize, Translate, Add to Chat.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useApp } from '../contexts/AppContext';
import { useConfig } from '../contexts/ConfigContext';
import BackgroundDetector from '../utils/BackgroundDetector';
import MediaExtractionService from '../services/MediaExtractionService';
import UtilService from '../services/UtilService';
import { SummarizerServiceProxy, TranslatorServiceProxy, TTSServiceProxy, AIServiceProxy, RewriterServiceProxy, WriterServiceProxy } from '../services/proxies';
import VoiceRecordingService from '../services/VoiceRecordingService';
import { TranslationLanguages } from '../config/aiConfig';
import { PromptConfig } from '../config/promptConfig';
import ToolbarButton from './toolbar/ToolbarButton';
import ToolbarSection from './toolbar/ToolbarSection';
import ToolbarResultPanel from './toolbar/ToolbarResultPanel';
import { Icon } from './icons';
import Logger from '../services/Logger';

const AIToolbar = () => {
  const { uiConfig, aiConfig, handleAddToChat } = useApp();
  const { ttsConfig } = useConfig();
  
  const [isVisible, setIsVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState(false); // Local control for render during animation
  const [isClosing, setIsClosing] = useState(false); // Track closing animation
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [lockedPosition, setLockedPosition] = useState(null); // Lock position when result is showing
  const [resultPanelActive, setResultPanelActive] = useState(false); // Track if result panel is showing (prevents toolbar from hiding when selection lost)
  const [shouldRenderResultPanel, setShouldRenderResultPanel] = useState(false); // Control result panel render during animation
  const [isResultPanelClosing, setIsResultPanelClosing] = useState(false); // Track result panel closing animation
  const [selectedText, setSelectedText] = useState('');
  const [selectedImages, setSelectedImages] = useState([]);
  const [selectedAudios, setSelectedAudios] = useState([]);
  const [hoveredImageElement, setHoveredImageElement] = useState(null);
  const savedCursorPositionRef = useRef(null); // Save cursor position before toolbar interaction // Store hovered image element for later extraction
  const [isLoading, setIsLoading] = useState(false);
  const [action, setAction] = useState(null); // 'summarize-*', 'translate', 'image-*', 'dictionary-*', 'rewrite-*', 'write-*', or null
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [isLightBackgroundToolbar, setIsLightBackgroundToolbar] = useState(false);
  const [isLightBackgroundPanel, setIsLightBackgroundPanel] = useState(false);
  const [selectedTargetLanguage, setSelectedTargetLanguage] = useState(null); // For translation override
  const [detectedLanguageName, setDetectedLanguageName] = useState(null); // Full language name for display
  const [copySuccess, setCopySuccess] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false); // TTS playback state
  const [isTTSGenerating, setIsTTSGenerating] = useState(false); // TTS generation state (before playback)
  const [currentSessionId, setCurrentSessionId] = useState(null); // TTS session ID
  
  // Writer state
  const [writerPrompt, setWriterPrompt] = useState(''); // User prompt for writer
  const [showWriterInput, setShowWriterInput] = useState(false); // Show writer input panel
  
  // Dictation (STT) state
  const [isRecording, setIsRecording] = useState(false); // STT recording state
  const [recordingDuration, setRecordingDuration] = useState(0); // Recording duration in seconds
  const [dictationMode, setDictationMode] = useState(null); // 'manual' (with selection) or 'auto-insert' (no selection)
  const [accumulatedTranscription, setAccumulatedTranscription] = useState(''); // Accumulated transcription for continuous dictation
  const recordingIntervalRef = useRef(null); // Timer interval for recording duration
  const isProcessingRef = useRef(false); // Prevent multiple simultaneous processings
  
  const [isEditableContent, setIsEditableContent] = useState(false); // Is selection in editable element
  const [editableElement, setEditableElement] = useState(null); // Reference to editable element
  const [originalContent, setOriginalContent] = useState(null); // Original content for undo
  const [editableType, setEditableType] = useState(null); // 'input', 'textarea', or 'contenteditable'
  const [editableSelectionStart, setEditableSelectionStart] = useState(0); // Selection start position
  const [editableSelectionEnd, setEditableSelectionEnd] = useState(0); // Selection end position
  const [hasInserted, setHasInserted] = useState(false); // Track if content was inserted (for undo/redo toggle)
  const [improvedContent, setImprovedContent] = useState(null); // Store improved content for redo
  
  const toolbarRef = useRef(null);
  const resultPanelRef = useRef(null);
  const selectionTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null); // For aborting streaming
  const hasInsertedRef = useRef(false); // Ref to track insert state for callbacks
  const showingFromInputFocusRef = useRef(false); // Track if toolbar was shown by input focus (prevent immediate hide)
  const showingFromImageHoverRef = useRef(false); // Track if toolbar was shown by image hover (prevent immediate hide)
  const pendingResultRef = useRef(null); // Pending result for batched update
  const resultUpdateRafRef = useRef(null); // RAF ID for batched updates
  const resultPanelCloseTimeoutRef = useRef(null); // Timeout for result panel close animation
  
  // Refs for result, error, isLoading to prevent handleSelectionChange recreation
  const resultRef = useRef('');
  const errorRef = useRef('');
  const isLoadingRef = useRef(false);
  const lockedPositionRef = useRef(null);
  const isVisibleRef = useRef(false);
  const showWriterInputRef = useRef(false); // Ref for showWriterInput to use in handleSelectionChange
  
  /**
   * Throttled setResult to prevent excessive re-renders during streaming
   * Batches rapid updates using requestAnimationFrame
   */
  const setResultThrottled = useCallback((newResult) => {
    // Store the latest result
    pendingResultRef.current = newResult;
    
    // If update is already scheduled, don't schedule another
    if (resultUpdateRafRef.current !== null) {
      return;
    }
    
    // Schedule update on next animation frame (60fps max)
    resultUpdateRafRef.current = requestAnimationFrame(() => {
      if (pendingResultRef.current !== null) {
        setResult(pendingResultRef.current);
        pendingResultRef.current = null;
      }
      resultUpdateRafRef.current = null;
    });
  }, []);

  /**
   * Sync refs with state values to prevent callback recreations
   */
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
      Logger.log('AIToolbar', 'Toolbar became invisible, clearing writer input panel');
      setShowWriterInput(false);
      setWriterPrompt('');
    }
  }, [isVisible, showWriterInput]);

  /**
   * Sync shouldRender with isVisible, but delay when closing for animation
   */
  useEffect(() => {
    if (isVisible) {
      // Opening - render immediately
      setShouldRender(true);
      setIsClosing(false);
    } else if (shouldRender) {
      // Closing - set closing state and delay unmount
      setIsClosing(true);
      const timeout = setTimeout(() => {
        setShouldRender(false);
        setIsClosing(false);
      }, 300); // 300ms to match fade-in duration
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
    const flag = (hasResult || hasError || isLoading || (showWriterInput && (action === 'write-input' || action === 'rewrite-custom'))) && isVisible;
    return flag;
  }, [hasResult, hasError, isLoading, showWriterInput, action, isVisible]);

  /**
   * Calculate if result panel should be above or below toolbar based on available space
   */
  const shouldShowPanelAbove = useMemo(() => {
    const toolbarHeight = 50; // Approximate toolbar height
    const estimatedPanelHeight = 300; // Estimated result panel height
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - (position.y + toolbarHeight);
    const spaceAbove = position.y;
    
    // If not enough space below but more space above, show above
    return spaceBelow < estimatedPanelHeight && spaceAbove > spaceBelow;
  }, [position.y]);

  /**
   * Sync shouldRenderResultPanel with result/error state, delay when closing for animation
   */
  useEffect(() => {
    if (hasResultFlag && !shouldRenderResultPanel) {
      // Result appeared and panel not showing - render immediately
      // Clear any pending close animation
      if (resultPanelCloseTimeoutRef.current) {
        clearTimeout(resultPanelCloseTimeoutRef.current);
        resultPanelCloseTimeoutRef.current = null;
      }
      setShouldRenderResultPanel(true);
      setIsResultPanelClosing(false);
    } else if (!hasResultFlag && shouldRenderResultPanel) {
      // Result disappeared and panel is showing - start closing animation
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

  /**
   * Determine selection type based on word count
   * - Single word: 1-2 words (show dictionary features)
   * - Short phrase: 3-10 words (show both dictionary and summarize)
   * - Passage: >10 words (show only summarize)
   */
  const getSelectionType = useCallback((text) => {
    if (!text || !text.trim()) {
      return { isSingleWord: false, wordCount: 0 };
    }
    
    // Count words (split by whitespace and filter empty strings)
    const words = text.trim().split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;
    
    return {
      isSingleWord: wordCount <= 2, // 1-2 words
      wordCount,
    };
  }, []);

  /**
   * Check if selection is inside editable content
   * Returns: { isEditable, element, originalContent, selectionStart, selectionEnd }
   */
  const checkEditableContent = useCallback(() => {
    // First check if active element is input/textarea with selection
    const activeElement = document.activeElement;
    const isInputOrTextarea = 
      activeElement && 
      (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA');
    
    if (isInputOrTextarea) {
      const element = activeElement;
      
      // Check if input type is excluded
      if (element.tagName === 'INPUT') {
        const type = element.type.toLowerCase();
        const excludedTypes = ['password', 'email', 'number', 'date', 'time', 'datetime-local', 
                               'month', 'week', 'tel', 'url', 'search', 'hidden', 'checkbox', 
                               'radio', 'file', 'submit', 'button', 'reset', 'image'];
        if (excludedTypes.includes(type)) {
          return { isEditable: false, element: null, originalContent: null, selectionStart: 0, selectionEnd: 0, editableType: null };
        }
      }
      
      // Check if there's a selection
      const start = element.selectionStart;
      const end = element.selectionEnd;
      
      if (start !== undefined && end !== undefined && start !== end) {
        return {
          isEditable: true,
          element: element,
          originalContent: element.value,
          selectionStart: start,
          selectionEnd: end,
          editableType: element.tagName.toLowerCase(),
        };
      }
      
      return { isEditable: false, element: null, originalContent: null, selectionStart: 0, selectionEnd: 0, editableType: null };
    }
    
    // For contenteditable and other elements, use window.getSelection()
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return { isEditable: false, element: null, originalContent: null, selectionStart: 0, selectionEnd: 0, editableType: null };
    }

    const range = selection.getRangeAt(0);
    const startContainer = range.startContainer;
    const endContainer = range.endContainer;

    // Get the parent elements for both start and end of selection
    const startElement = startContainer.nodeType === 3 ? startContainer.parentElement : startContainer;
    const endElement = endContainer.nodeType === 3 ? endContainer.parentElement : endContainer;

    // Helper to check if element is contenteditable
    const findContentEditableAncestor = (element) => {
      let current = element;
      while (current && current !== document.body) {
        // Check for standard contenteditable
        if (current.isContentEditable || current.getAttribute('contenteditable') === 'true') {
          return current;
        }
        // Check for Gmail's g_editable attribute
        if (current.getAttribute('g_editable') === 'true') {
          return current;
        }
        current = current.parentElement;
      }
      return null;
    };

    const startEditable = findContentEditableAncestor(startElement);
    const endEditable = findContentEditableAncestor(endElement);

    // Both start and end must be in the same contenteditable element
    if (!startEditable || !endEditable || startEditable !== endEditable) {
      return { isEditable: false, element: null, originalContent: null, selectionStart: 0, selectionEnd: 0, editableType: null };
    }

    return {
      isEditable: true,
      element: startEditable,
      originalContent: startEditable.innerHTML,
      selectionStart: range.startOffset,
      selectionEnd: range.endOffset,
      editableType: 'contenteditable',
    };
  }, []);

  /**
   * Set up TTS callbacks for speaker icon
   */
  useEffect(() => {
    // Set up TTS playback callbacks
    TTSServiceProxy.setAudioStartCallback((sessionId) => {
      Logger.log('AIToolbar', 'TTS audio started:', sessionId);
      if (sessionId === currentSessionId) {
        setIsSpeaking(true);
      }
    });

    TTSServiceProxy.setAudioEndCallback((sessionId) => {
      Logger.log('AIToolbar', 'TTS audio ended:', sessionId);
      if (sessionId === currentSessionId) {
        setIsSpeaking(false);
      }
    });

    return () => {
      // Cleanup callbacks
      TTSServiceProxy.setAudioStartCallback(null);
      TTSServiceProxy.setAudioEndCallback(null);
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
    if (!result || !(action?.startsWith('summarize-') || action?.startsWith('image-') || action?.startsWith('rewrite-') || action?.startsWith('write-') || action?.startsWith('dictionary-') || action === 'dictation' || action === 'translate')) return;

    // Check if TTS is configured and enabled
    if (!ttsConfig?.enabled) {
      Logger.warn('AIToolbar', 'TTS is not enabled');
      setError('Text-to-Speech is disabled in settings');
      return;
    }

    // If generating or playing, stop everything
    if (isTTSGenerating || isSpeaking) {
      Logger.log('AIToolbar', 'Cancelling TTS (generating:', isTTSGenerating, ', speaking:', isSpeaking, ')');
      TTSServiceProxy.stopPlayback();
      setIsTTSGenerating(false);
      setIsSpeaking(false);
      setCurrentSessionId(null);
      return;
    }

    // Start playback
    try {
      Logger.log('AIToolbar', 'Starting TTS');
      
      // Generate unique session ID
      const sessionId = `toolbar_${Date.now()}`;
      setCurrentSessionId(sessionId);
      setIsTTSGenerating(true); // Mark as generating

      // Generate and play audio chunks
      const audioChunks = await TTSServiceProxy.generateChunkedSpeech(
        result,
        null, // onChunkReady callback
        500,  // maxChunkSize
        100,  // minChunkSize
        sessionId
      );

      // Check if generation was stopped
      if (audioChunks.length === 0) {
        Logger.log('AIToolbar', 'TTS generation was stopped');
        setIsTTSGenerating(false);
        setIsSpeaking(false);
        setCurrentSessionId(null);
        return;
      }

      // Generation complete, now playing
      setIsTTSGenerating(false);
      setIsSpeaking(true);

      // Play audio sequence
      await TTSServiceProxy.playAudioSequence(audioChunks, sessionId);

      // Playback complete
      setIsSpeaking(false);
      setCurrentSessionId(null);
    } catch (err) {
      Logger.error('AIToolbar', 'TTS failed:', err);
      setError('Text-to-Speech failed: ' + (err.message || 'Unknown error'));
      setIsTTSGenerating(false);
      setIsSpeaking(false);
      setCurrentSessionId(null);
    }
  };

  /**
   * Close result panel
   */
  const closeResult = useCallback(async () => {
    // Cancel ongoing request if loading
    if (isLoading) {
      Logger.log('AIToolbar', 'Aborting ongoing streaming request...');
      
      // Abort streaming via abort controller
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      // Also call service abort methods to stop generation at source
      try {
        if (action?.startsWith('summarize-')) {
          await SummarizerServiceProxy.abort();
        } else if (action === 'translate' || action === 'detect-language') {
          await TranslatorServiceProxy.abort();
        } else if (action?.startsWith('image-')) {
          // Use correct method name: abortRequest() not abort()
          await AIServiceProxy.abortRequest();
        }
      } catch (error) {
        Logger.error('AIToolbar', 'Service abort failed:', error);
      }
      
      setIsLoading(false);
      
      // Clear abort controller after a short delay to allow abort to propagate
      setTimeout(() => {
        abortControllerRef.current = null;
      }, 100);
    }
    
    // Stop TTS if playing
    if (isSpeaking && currentSessionId) {
      Logger.log('AIToolbar', 'Stopping TTS playback');
      TTSServiceProxy.stopPlayback();
      setIsSpeaking(false);
      setCurrentSessionId(null);
    }
    
    // Delay clearing states UNTIL AFTER fade-out animation completes (500ms to be safe)
    setTimeout(() => {
      setResult('');
      setError('');
      setAction(null);
      setSelectedTargetLanguage(null);
      setCopySuccess(false);
      setHasInserted(false);
      hasInsertedRef.current = false;
      setLockedPosition(null);
    }, 500);
  }, [isLoading, action, isSpeaking, currentSessionId]);

  /**
   * Get selection and images from the page
   */
  const getSelection = useCallback(() => {
    // Check if the active element is an input or textarea
    const activeElement = document.activeElement;
    const isInputOrTextarea = 
      activeElement && 
      (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA');
    
    // Handle input/textarea selection separately
    if (isInputOrTextarea) {
      const element = activeElement;
      const start = element.selectionStart;
      const end = element.selectionEnd;
      
      if (start !== undefined && end !== undefined && start !== end) {
        const text = element.value.substring(start, end).trim();
        return { 
          text, 
          images: [], 
          audios: [], 
          selection: window.getSelection() 
        };
      }
      
      return { text: '', images: [], audios: [], selection: window.getSelection() };
    }
    
    // Handle regular selection (for contenteditable and other elements)
    const selection = window.getSelection();
    
    if (!selection || selection.rangeCount === 0) {
      return { text: '', images: [], audios: [], selection };
    }
    
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    
    // Find container element
    const containerEl = container.nodeType === 3 ? container.parentElement : container;
    
    // Use MediaExtractionService single method - synchronous extraction only
    const media = MediaExtractionService._extractMediaFromContainer(containerEl, selection);
    
    return { 
      text: selection.toString().trim(), 
      images: media.images, 
      audios: media.audios, 
      selection 
    };
  }, []);

  /**
   * Calculate optimal position for toolbar at selection start
   */
  const calculatePosition = useCallback((selection) => {
    // Check if the active element is an input or textarea
    const activeElement = document.activeElement;
    const isInputOrTextarea = 
      activeElement && 
      (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA');
    
    let rect;
    
    if (isInputOrTextarea) {
      // For input/textarea, calculate approximate cursor position
      const element = activeElement;
      const start = element.selectionStart || 0;
      
      // Create a temporary span to measure text width
      const tempSpan = document.createElement('span');
      tempSpan.style.font = window.getComputedStyle(element).font;
      tempSpan.style.visibility = 'hidden';
      tempSpan.style.position = 'absolute';
      tempSpan.style.whiteSpace = 'pre';
      tempSpan.textContent = element.value.substring(0, start);
      document.body.appendChild(tempSpan);
      
      const textWidth = tempSpan.offsetWidth;
      document.body.removeChild(tempSpan);
      
      // Get element position
      const elemRect = element.getBoundingClientRect();
      
      // Calculate cursor X position (approximate)
      // Account for padding and scrollLeft
      const computedStyle = window.getComputedStyle(element);
      const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
      const scrollLeft = element.scrollLeft || 0;
      
      const cursorX = elemRect.left + paddingLeft + textWidth - scrollLeft;
      
      // Create a rect-like object for cursor position
      rect = {
        left: cursorX,
        top: elemRect.top,
        bottom: elemRect.bottom,
        width: 1,
        height: elemRect.height
      };
    } else {
      // For regular selection
      if (!selection || selection.rangeCount === 0) return null;
      
      const range = selection.getRangeAt(0);
      rect = range.getBoundingClientRect();
    }
    
    if (!rect || rect.height === 0) return null;
    
    // Toolbar dimensions - use actual toolbar width if available, otherwise estimate
    const toolbarWidth = toolbarRef.current ? toolbarRef.current.offsetWidth : 400; // More conservative estimate
    const toolbarHeight = toolbarRef.current ? toolbarRef.current.offsetHeight : 50;
    const offset = 8;
    
    // Use viewport coordinates (getBoundingClientRect already gives us these)
    // Position at selection start (left edge)
    let x = rect.left;
    let y = rect.top - toolbarHeight - offset;
    
    // Ensure toolbar never goes off-screen horizontally
    const viewportWidth = window.innerWidth;
    
    // Check if would go off-screen on the right
    if (x + toolbarWidth > viewportWidth - 10) {
      x = viewportWidth - toolbarWidth - 10;
    }
    
    // Check if would go off-screen on the left
    if (x < 10) {
      x = 10;
    }
    
    // Adjust if too close to top (show below instead)
    if (y < 10) {
      y = rect.bottom + offset;
    }
    
    return { x, y };
  }, []);

  /**
   * Handle selection change
   */
  const handleSelectionChange = useCallback(() => {
    if (!isEnabled) return;
    
    // Clear existing timeout
    if (selectionTimeoutRef.current) {
      clearTimeout(selectionTimeoutRef.current);
    }
    
    // Debounce selection change
    selectionTimeoutRef.current = setTimeout(() => {
      const { text, images, audios, selection } = getSelection();
      
      // Check if active element is inside our toolbar or panels - if so, ignore completely
      const activeElement = document.activeElement;
      if (activeElement && (resultPanelRef.current || toolbarRef.current)) {
        if (
          (resultPanelRef.current && resultPanelRef.current.contains(activeElement)) ||
          (toolbarRef.current && toolbarRef.current.contains(activeElement))
        ) {
          // Focus is inside our UI, ignore this change completely
          Logger.log('AIToolbar', 'Focus inside toolbar/panel (element:', activeElement.tagName, '), ignoring selection change');
          return;
        }
      }
      
      // Also check if selection is inside result panel OR toolbar
      if ((resultPanelRef.current || toolbarRef.current) && selection) {
        const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        if (range) {
          const container = range.commonAncestorContainer;
          const containerEl = container.nodeType === 3 ? container.parentElement : container;
          if (containerEl) {
            // Check if selection is inside toolbar or result panel
            if (
              (resultPanelRef.current && resultPanelRef.current.contains(containerEl)) ||
              (toolbarRef.current && toolbarRef.current.contains(containerEl))
            ) {
              // Selection is inside our UI, ignore this change completely
              Logger.log('AIToolbar', 'Selection inside toolbar/panel, ignoring');
              return;
            }
          }
        }
      }
      
      // If no selection but result panel is active, keep toolbar visible
      // This prevents toolbar from closing when selection is lost (scroll, click result panel, etc.)
      if (!text && images.length === 0 && audios.length === 0) {
        Logger.log('AIToolbar', 'No selection detected, checking if should hide toolbar...');
        Logger.log('AIToolbar', '- showingFromInputFocusRef:', showingFromInputFocusRef.current);
        Logger.log('AIToolbar', '- showingFromImageHoverRef:', showingFromImageHoverRef.current);
        Logger.log('AIToolbar', '- showWriterInputRef:', showWriterInputRef.current);
        Logger.log('AIToolbar', '- resultPanelActive:', resultPanelActive);
        
        // ALSO: Don't hide if toolbar was just shown by input focus or image hover
        if (showingFromInputFocusRef.current || showingFromImageHoverRef.current) {
          Logger.log('AIToolbar', 'No selection but showing from input focus or image hover, keeping toolbar visible');
          return;
        }
        
        // ALSO: Don't hide if writer input panel is showing
        if (showWriterInputRef.current) {
          Logger.log('AIToolbar', 'No selection but writer input panel is showing, keeping toolbar visible');
          return;
        }
        
        // Only hide if result panel is not active
        if (!resultPanelActive) {
          Logger.log('AIToolbar', 'No selection and result panel not active, HIDING TOOLBAR');
          setIsVisible(false);
          setSelectedText('');
          setSelectedImages([]);
          setSelectedAudios([]);
          setResult('');
          setError('');
          setAction(null);
          setIsEditableContent(false);
          setEditableElement(null);
          setOriginalContent(null);
          setEditableType(null);
          setEditableSelectionStart(0);
          setEditableSelectionEnd(0);
          setHasInserted(false);
          hasInsertedRef.current = false; // Clear ref
          setImprovedContent(null); // Clear improved content
        } else {
          Logger.log('AIToolbar', 'No selection but result panel active, keeping toolbar visible');
        }
        return;
      }
      
      // Calculate position
      const pos = calculatePosition(selection);
      if (!pos) {
        // No valid position but we have content - keep visible at current position
        if (resultRef.current || errorRef.current || isLoadingRef.current) {
          Logger.log('AIToolbar', 'No position but result active, keeping toolbar at current position');
          return;
        }
        setIsVisible(false);
        return;
      }
      
      // Check if selection is in editable content
      const editableInfo = checkEditableContent();
      
      // Don't update editable state if we just inserted (preserve original for undo)
      if (!hasInsertedRef.current) {
        setIsEditableContent(editableInfo.isEditable);
        setEditableElement(editableInfo.element);
        setOriginalContent(editableInfo.originalContent);
        setEditableType(editableInfo.editableType);
        setEditableSelectionStart(editableInfo.selectionStart || 0);
        setEditableSelectionEnd(editableInfo.selectionEnd || 0);
      }
      
      // Update state (only reset result/error/action if not already showing results)
      setSelectedText(text);
      setSelectedImages(images);
      setSelectedAudios(audios);
      
      // Clear hoveredImageElement if we have a new selection (user selected something else)
      if ((text || images.length > 0 || audios.length > 0) && !showingFromImageHoverRef.current) {
        setHoveredImageElement(null);
      }
      
      // Lock position when result/error/loading is active to prevent drift
      if (!resultRef.current && !errorRef.current && !isLoadingRef.current) {
        setPosition(pos);
        setLockedPosition(null); // Clear lock when no result
      } else if (!lockedPositionRef.current) {
        // First time showing result - lock position
        setPosition(pos);
        setLockedPosition(pos);
      }
      // If lockedPosition exists, keep using it (don't update position)
      
      setIsVisible(true);
      // Don't clear result/error/action here - they should only be cleared by closeResult or new action
    }, 150);
  }, [isEnabled, getSelection, calculatePosition, checkEditableContent, resultPanelActive]);

  /**
   * Handle mouse up (show toolbar after selection)
   */
  const handleMouseUp = useCallback(() => {
    handleSelectionChange();
  }, [handleSelectionChange]);

  /**
   * Handle scroll - update toolbar position instantly to follow selection
   * BUT: Don't update if result/error/loading is showing (locked position)
   */
  const handleScroll = useCallback(() => {
    if (!isVisibleRef.current) return;
    
    // If position is locked (result showing), don't update position on scroll
    if (lockedPositionRef.current) {
      return;
    }
    
    // If toolbar is shown from image hover, hide it on scroll
    // (because the image position changes and toolbar would be misaligned)
    if (showingFromImageHoverRef.current) {
      setIsVisible(false);
      setHoveredImageElement(null);
      showingFromImageHoverRef.current = false;
      return;
    }
    
    // Update position instantly - no delay, no RAF
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const pos = calculatePosition(selection);
      if (pos) {
        setPosition(pos);
      } else {
        // Selection no longer visible, hide toolbar
        setIsVisible(false);
      }
    }
  }, [calculatePosition]);

  /**
   * Hide toolbar when clicking outside
   * Uses composedPath() to work correctly in shadow DOM (extension mode)
   */
  const handleClickOutside = useCallback((e) => {
    // Get the full event path including shadow DOM elements
    const path = e.composedPath ? e.composedPath() : (e.path || [e.target]);
    
    // Check if any element in the path is our toolbar, result panel, or any dropdown/popup elements
    const clickedInside = path.some(el => {
      if (el === toolbarRef.current || el === resultPanelRef.current) {
        return true;
      }
      // Check for common popup/dropdown classes that might be portaled
      if (el.nodeType === 1) { // Element node
        const classList = el.classList || [];
        const classStr = Array.from(classList).join(' ');
        // Check for dropdown menus, select options, portals, etc.
        if (
          classStr.includes('dropdown') ||
          classStr.includes('menu') ||
          classStr.includes('popover') ||
          classStr.includes('portal') ||
          classStr.includes('select') ||
          el.tagName === 'OPTION' ||
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
      return; // Click is inside our components or related UI
    }
    
    // Don't hide if user is clicking on selected text
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;
      const containerEl = container.nodeType === 3 ? container.parentElement : container;
      
      if (containerEl && path.includes(containerEl)) {
        return; // User clicked on selection, keep toolbar visible
      }
    }
    
    // Stop dictation if running
    if (isRecording) {
      Logger.log('AIToolbar', 'Stopping dictation on click outside');
      VoiceRecordingService.stop();
      setIsRecording(false);
    }
    
    // Hide toolbar immediately AND close result panel
    setIsVisible(false);
    setResultPanelActive(false); // Deactivate result panel
    
    // Clear input focus and image hover flags
    showingFromInputFocusRef.current = false;
    showingFromImageHoverRef.current = false;
    
    // Close result panel if open (this will also abort streaming and stop TTS)
    if (result || error || isLoading) {
      closeResult();
    }
  }, [result, error, isLoading, closeResult, isRecording]);

  /**
   * Handle input focus - show toolbar with dictation
   */
  const handleInputFocus = useCallback((e) => {
    Logger.log('AIToolbar', 'handleInputFocus triggered', {
      enabled: uiConfig?.aiToolbar?.showOnInputFocus,
      target: e.target,
      tagName: e.target.tagName,
      isContentEditable: e.target.isContentEditable,
      uiConfig: uiConfig
    });
    
    // Default to true if not explicitly set to false
    if (uiConfig?.aiToolbar?.showOnInputFocus === false) {
      Logger.log('AIToolbar', 'Input focus disabled in settings');
      return;
    }
    
    const target = e.target;
    
    // Ignore if focus is inside our own toolbar or result panel
    if (toolbarRef.current?.contains(target) || resultPanelRef.current?.contains(target)) {
      Logger.log('AIToolbar', 'Focus inside toolbar/panel, ignoring');
      return;
    }
    
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
    const isContentEditable = target.isContentEditable;
    
    Logger.log('AIToolbar', 'Input check', { isInput, isContentEditable });
    
    if (isInput || isContentEditable) {
      Logger.log('AIToolbar', 'Input focused, showing toolbar with dictation');
      
      // CRITICAL: Save cursor position BEFORE showing toolbar (clicking toolbar will remove focus)
      if (isInput) {
        savedCursorPositionRef.current = {
          element: target,
          start: target.selectionStart,
          end: target.selectionEnd
        };
        Logger.log('AIToolbar', 'Saved cursor position:', savedCursorPositionRef.current);
      } else {
        // For contenteditable, save selection
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
          savedCursorPositionRef.current = {
            element: target,
            range: selection.getRangeAt(0).cloneRange()
          };
        }
      }
      
      // Calculate position at cursor or caret
      const rect = target.getBoundingClientRect();
      const toolbarHeight = 50;
      const toolbarWidth = 150;
      
      // Use viewport coordinates directly (no scrollX/Y) because toolbar uses fixed positioning
      let x = rect.left;
      let y = rect.top - toolbarHeight - 10; // 10px above input
      
      // Smart positioning - check if would go off-screen
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      // Adjust horizontal position if would go off-screen
      if (x + toolbarWidth > viewportWidth) {
        x = viewportWidth - toolbarWidth - 10;
      }
      if (x < 0) {
        x = 10;
      }
      
      // Adjust vertical position if would go off-screen at top
      if (y < 0) {
        // Position below input instead
        y = rect.bottom + 10;
      }
      
      Logger.log('AIToolbar', 'Setting position', { x, y, rect, viewport: { width: viewportWidth, height: viewportHeight } });
      
      // Clear hoveredImageElement since we're showing toolbar for input focus
      setHoveredImageElement(null);
      
      setPosition({ x, y });
      setIsVisible(true);
      setAction('dictation'); // Pre-select dictation action
      setIsEditableContent(true);
      setEditableElement(target);
      setEditableType(isContentEditable ? 'contenteditable' : 'input');
      
      // Save initial selection for dictation
      if (!isContentEditable) {
        setEditableSelectionStart(target.selectionStart);
        setEditableSelectionEnd(target.selectionEnd);
      }
      
      // Set flag to prevent handleSelectionChange from immediately hiding toolbar
      showingFromInputFocusRef.current = true;
      
      // DON'T clear the flag automatically - let user interaction clear it
      Logger.log('AIToolbar', 'Set showingFromInputFocusRef to true, will clear on hide');
    } else {
      Logger.log('AIToolbar', 'Not an input element, ignoring');
    }
  }, [uiConfig]);

  /**
   * Handle image hover - show toolbar with image actions
   */
  const handleImageHover = useCallback((e) => {
    Logger.log('AIToolbar', 'handleImageHover triggered', {
      enabled: uiConfig?.aiToolbar?.showOnImageHover,
      target: e.target.tagName,
      src: e.target.src
    });
    
    // Default to true if not explicitly set to false
    if (uiConfig?.aiToolbar?.showOnImageHover === false) return;
    
    const target = e.target;
    if (target.tagName === 'IMG') {
      Logger.log('AIToolbar', 'Image hovered, showing toolbar (will extract on button click)');
      
      // If hovering a different image, clear previous results
      if (hoveredImageElement && hoveredImageElement !== target) {
        Logger.log('AIToolbar', 'Different image hovered, clearing previous results');
        setResult('');
        setError('');
        setAction(null);
        setResultPanelActive(false);
      }
      
      // Clear input focus flag when showing toolbar for image
      // This ensures we show image buttons (not dictation button)
      showingFromInputFocusRef.current = false;
      
      // Clear editable content state to hide dictation button
      setIsEditableContent(false);
      setEditableElement(null);
      setEditableType(null);
      
      // Calculate smart position - check if toolbar would go off-screen
      const rect = target.getBoundingClientRect();
      const toolbarWidth = 400; // Approximate toolbar width
      const toolbarHeight = 50; // Approximate toolbar height
      const viewportWidth = window.innerWidth;
      
      let x, y;
      
      // Use viewport coordinates directly (no scrollX/Y) because toolbar uses fixed positioning
      // Horizontal positioning - prefer right side, but flip to left if would go off-screen
      if (rect.right + toolbarWidth - 120 > viewportWidth) {
        // Would go off-screen on right, position on left side
        x = rect.left;
      } else {
        // Position on right side
        x = rect.right - 120;
      }
      
      // Vertical positioning - prefer top, but flip to bottom if would go off-screen
      const topY = rect.top - toolbarHeight - 10;
      const bottomY = rect.bottom + 10;
      
      if (topY < 0) {
        // Top would be off-screen, use bottom
        y = bottomY;
      } else {
        // Use top
        y = topY;
      }
      
      Logger.log('AIToolbar', 'Image toolbar position', { x, y, rect });
      
      setPosition({ x, y });
      setIsVisible(true);
      
      // Store the hovered image element for extraction when user clicks button
      setHoveredImageElement(target);
      setSelectedImages([]); // Clear selection-based images
      setSelectedText(''); // Clear text selection
      setSelectedAudios([]);
      
      // Set flag to prevent handleSelectionChange from hiding toolbar
      showingFromImageHoverRef.current = true;
      
      // DON'T clear the flag automatically - let user interaction clear it
      Logger.log('AIToolbar', 'Set showingFromImageHoverRef to true, will clear on hide');
    }
  }, [uiConfig, hoveredImageElement]);

  /**
   * Handle image leave - only hide if result panel not active
   */
  const handleImageLeave = useCallback((e) => {
    Logger.log('AIToolbar', 'handleImageLeave triggered', {
      enabled: uiConfig?.aiToolbar?.showOnImageHover,
      resultPanelActive: resultPanelActive
    });
    
    // Default to true if not explicitly set to false
    if (uiConfig?.aiToolbar?.showOnImageHover === false) return;
    
    const target = e.target;
    if (target.tagName === 'IMG') {
      // Don't hide - let handleClickOutside or user action close it
      // This prevents flickering when moving from image to toolbar
      Logger.log('AIToolbar', 'Image unhovered, but keeping toolbar visible');
    }
  }, [uiConfig, resultPanelActive]);

  /**
   * Set up event listeners
   */
  useEffect(() => {
    // Default to true if not explicitly set to false
    const showOnInputFocus = uiConfig?.aiToolbar?.showOnInputFocus !== false;
    const showOnImageHover = uiConfig?.aiToolbar?.showOnImageHover !== false;
    
    if (!isEnabled) {
      setIsVisible(false);
      return;
    }
    
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true); // Use capture to catch all scroll events
    
    // Input focus listener
    if (showOnInputFocus) {
      document.addEventListener('focusin', handleInputFocus);
    }
    
    // Image hover listeners + MutationObserver
    let observer;
    if (showOnImageHover) {
      // Add event listeners to all existing images
      const images = document.querySelectorAll('img');
      images.forEach(img => {
        img.addEventListener('mouseenter', handleImageHover);
        img.addEventListener('mouseleave', handleImageLeave);
      });
      
      // Use MutationObserver to handle dynamically added images
      observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.tagName === 'IMG') {
              node.addEventListener('mouseenter', handleImageHover);
              node.addEventListener('mouseleave', handleImageLeave);
            } else if (node.querySelectorAll) {
              const imgs = node.querySelectorAll('img');
              imgs.forEach(img => {
                img.addEventListener('mouseenter', handleImageHover);
                img.addEventListener('mouseleave', handleImageLeave);
              });
            }
          });
        });
      });
      
      observer.observe(document.body, { childList: true, subtree: true });
    }
    
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
      
      if (showOnInputFocus) {
        document.removeEventListener('focusin', handleInputFocus);
      }
      
      if (showOnImageHover) {
        const images = document.querySelectorAll('img');
        images.forEach(img => {
          img.removeEventListener('mouseenter', handleImageHover);
          img.removeEventListener('mouseleave', handleImageLeave);
        });
        
        // Disconnect MutationObserver
        if (observer) {
          observer.disconnect();
        }
      }
      
      if (selectionTimeoutRef.current) {
        clearTimeout(selectionTimeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEnabled, uiConfig?.aiToolbar?.showOnInputFocus, uiConfig?.aiToolbar?.showOnImageHover]);

  /**
   * Clear flags and stop dictation when toolbar becomes invisible
   */
  useEffect(() => {
    if (!isVisible) {
      // Clear all flags when toolbar is hidden
      showingFromInputFocusRef.current = false;
      showingFromImageHoverRef.current = false;
      savedCursorPositionRef.current = null;
      
      if (isRecording) {
        Logger.log('AIToolbar', 'Toolbar hidden, stopping dictation');
        VoiceRecordingService.stop();
        setIsRecording(false);
        setAccumulatedTranscription('');
      }
      
      // Clear the recording timer interval to prevent timer glitch
      if (recordingIntervalRef.current) {
        Logger.log('AIToolbar', 'Clearing recording timer interval');
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
        setRecordingDuration(0);
      }
    }
  }, [isVisible, isRecording]);

  /**
   * Track cursor position changes in editable element
   * Update savedCursorPositionRef whenever user clicks or moves cursor
   */
  useEffect(() => {
    if (!editableElement || !isEditableContent) return;
    
    const updateCursorPosition = () => {
      if (editableType === 'contenteditable') {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
          savedCursorPositionRef.current = {
            element: editableElement,
            range: selection.getRangeAt(0).cloneRange()
          };
          Logger.log('AIToolbar', 'Updated cursor position (contenteditable)');
        }
      } else {
        // Input/textarea
        savedCursorPositionRef.current = {
          element: editableElement,
          start: editableElement.selectionStart,
          end: editableElement.selectionEnd
        };
        Logger.log('AIToolbar', 'Updated cursor position:', {
          start: editableElement.selectionStart,
          end: editableElement.selectionEnd
        });
      }
    };
    
    // Listen for click, keyup, and select events to track cursor changes
    editableElement.addEventListener('click', updateCursorPosition);
    editableElement.addEventListener('keyup', updateCursorPosition);
    editableElement.addEventListener('select', updateCursorPosition);
    
    return () => {
      editableElement.removeEventListener('click', updateCursorPosition);
      editableElement.removeEventListener('keyup', updateCursorPosition);
      editableElement.removeEventListener('select', updateCursorPosition);
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
   * Detect background brightness for toolbar and result panel
   * Only re-detect when panel visibility or position changes, NOT when result content changes
   */
  useEffect(() => {
    if (!isVisible) return;
    
    const detectBackgrounds = () => {
      const canvas = document.getElementById('vassist-babylon-canvas');
      const toolbar = toolbarRef.current;
      const panel = resultPanelRef.current;
      
      // Detect toolbar background
      if (toolbar) {
        const elementsToDisable = [canvas, toolbar].filter(Boolean);
        const toolbarResult = BackgroundDetector.withDisabledPointerEvents(elementsToDisable, () => {
          return BackgroundDetector.detectBrightness({
            sampleArea: {
              type: 'grid',
              x: position.x,
              y: position.y,
              width: 110,
              height: 40,
              padding: 20,
            },
            elementsToIgnore: [canvas, toolbar],
            logPrefix: '[AIToolbar-Toolbar]',
          });
        });
        
        setIsLightBackgroundToolbar(toolbarResult.isLight);
      }
      
      // Detect result panel background (only if panel should be visible)
      if (panel && shouldRenderResultPanel) {
        const elementsToDisable = [canvas, panel].filter(Boolean);
        const panelResult = BackgroundDetector.withDisabledPointerEvents(elementsToDisable, () => {
          return BackgroundDetector.detectBrightness({
            sampleArea: {
              type: 'grid',
              x: position.x,
              y: position.y + 48,
              width: 400,
              height: 200,
              padding: 30,
            },
            elementsToIgnore: [canvas, panel],
            logPrefix: '[AIToolbar-Panel]',
          });
        });
        
        setIsLightBackgroundPanel(panelResult.isLight);
      }
    };
    
    // Initial detection
    detectBackgrounds();
    
    // Re-detect on position change (debounced)
    const timeoutId = setTimeout(detectBackgrounds, 400);
    
    return () => clearTimeout(timeoutId);
  }, [isVisible, position, shouldRenderResultPanel]); // Only depend on visibility and position, NOT result content

  /**
   * Handle Summarize action with streaming
   * @param {string} summaryType - 'tldr', 'headline', 'key-points', 'teaser'
   * @param {boolean} skipClearResult - Don't clear result (for regenerate)
   */
  const onSummarizeClick = async (summaryType = 'tldr', skipClearResult = false) => {
    Logger.log('AIToolbar', 'onSummarizeClick START', { summaryType, skipClearResult, currentResult: result, currentError: error, currentIsLoading: isLoading });
    
    if (!selectedText) {
      setError('No text selected');
      return;
    }
    
    // Cancel any ongoing request first
    if (isLoading && abortControllerRef.current) {
      abortControllerRef.current.abort();
      await abortPreviousRequest();
    }
    
    setIsLoading(true);
    const type = summaryType || 'tldr';
    setAction(`summarize-${type}`);
    setError('');
    // Don't clear result if regenerating (keep panel visible)
    if (!skipClearResult) {
      setResult('');
    }
    
    // Create abort controller for this request
    abortControllerRef.current = new AbortController();
    
    try {
      // Check if explicitly disabled
      if (aiConfig?.aiFeatures?.summarizer?.enabled === false) {
        throw new Error('Summarizer is disabled in settings');
      }
      
      const options = {
        type: type,
        format: aiConfig?.aiFeatures?.summarizer?.defaultFormat || 'plain-text',
        length: aiConfig?.aiFeatures?.summarizer?.defaultLength || 'medium',
      };
      
      let fullSummary = '';
      
      // Use streaming API
      for await (const chunk of SummarizerServiceProxy.summarizeStreaming(selectedText, options)) {
        // Check if aborted before processing chunk
        if (abortControllerRef.current?.signal.aborted) {
          Logger.log('AIToolbar', 'Summarize streaming aborted');
          break;
        }
        
        fullSummary += chunk;
        
        // Only update result if not aborted - use throttled update to prevent max depth exceeded
        if (!abortControllerRef.current?.signal.aborted) {
          setResultThrottled(fullSummary);
        }
      }
      
      // Ensure final result is set
      if (!abortControllerRef.current?.signal.aborted && fullSummary) {
        setResult(fullSummary);
      }
      
      Logger.log('AIToolbar', 'Summary streaming complete');
    } catch (err) {
      // Don't show error if user aborted
      if (err.name !== 'AbortError' && !abortControllerRef.current?.signal.aborted) {
        Logger.error('AIToolbar', 'Summarize failed:', err);
        setError('Summarization failed: ' + (err.message || 'Unknown error'));
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
      setError('No text selected');
      return;
    }
    
    // Cancel any ongoing request first
    if (isLoading && abortControllerRef.current) {
      abortControllerRef.current.abort();
      await abortPreviousRequest();
    }
    
    setIsLoading(true);
    setAction('detect-language');
    setError('');
    if (!skipClearResult) {
      setResult('');
    }
    
    try {
      const { LanguageDetectorServiceProxy } = await import('../services/proxies');
      const detectionResults = await LanguageDetectorServiceProxy.detect(selectedText);
      
      if (detectionResults && detectionResults.length > 0) {
        const detected = detectionResults[0];
        const langInfo = TranslationLanguages.find(l => l.code === detected.detectedLanguage);
        const languageName = langInfo ? langInfo.name : detected.detectedLanguage.toUpperCase();
        
        setDetectedLanguageName(languageName);
        
        // Show result
        const confidencePercent = detected.confidence ? (detected.confidence * 100).toFixed(1) : 'N/A';
        setResult(`Language: ${languageName}\nConfidence: ${confidencePercent}%`);
      } else {
        throw new Error('Could not detect language');
      }
    } catch (err) {
      Logger.error('AIToolbar', 'Language detection failed:', err);
      setError(err.message || 'Failed to detect language');
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
  const onTranslateClick = async (targetLang = null, useAutoDetect = true, skipClearResult = false) => {
    Logger.log('AIToolbar', 'onTranslateClick START', { targetLang, useAutoDetect, skipClearResult, currentResult: result, currentError: error, currentIsLoading: isLoading });
    
    if (!selectedText) {
      setError('No text selected');
      return;
    }
    
    // Cancel any ongoing request first
    if (isLoading && abortControllerRef.current) {
      abortControllerRef.current.abort();
      await abortPreviousRequest();
    }
    
    // Reset undo/redo state when translate is clicked
    // (This prevents showing undo button after translate when previously using rewrite)
    setHasInserted(false);
    hasInsertedRef.current = false;
    setOriginalContent(null);
    setImprovedContent(null);
    
    setIsLoading(true);
    setAction('translate');
    setError('');
    // Don't clear result if regenerating (keep panel visible)
    if (!skipClearResult) {
      setResult('');
    }
    
    const targetLanguage = targetLang || selectedTargetLanguage || aiConfig?.aiFeatures?.translator?.defaultTargetLanguage || 'en';
    
    // Create abort controller for this request
    abortControllerRef.current = new AbortController();
    
    try {
      // Check if explicitly disabled
      if (aiConfig?.aiFeatures?.translator?.enabled === false) {
        throw new Error('Translator is disabled in settings');
      }
      
      // Auto-detect source language if enabled
      let sourceLang = null;
      if (useAutoDetect) {
        try {
          const { LanguageDetectorServiceProxy } = await import('../services/proxies');
          const detectionResults = await LanguageDetectorServiceProxy.detect(selectedText);
          if (detectionResults && detectionResults.length > 0) {
            sourceLang = detectionResults[0].detectedLanguage;
            
            // Find and store full language name for display
            const langInfo = TranslationLanguages.find(l => l.code === sourceLang);
            setDetectedLanguageName(langInfo ? langInfo.name : sourceLang.toUpperCase());
          }
        } catch (err) {
          Logger.warn('AIToolbar', 'Language detection failed:', err);
          throw new Error('Could not detect source language');
        }
      }
      
      // Don't translate if source and target are the same
      if (sourceLang === targetLanguage) {
        setResult(selectedText);
        setIsLoading(false);
        return;
      }
      
      let fullTranslation = '';
      
      // Use streaming API
      for await (const chunk of TranslatorServiceProxy.translateStreaming(selectedText, sourceLang, targetLanguage)) {
        // Check if aborted before processing chunk
        if (abortControllerRef.current?.signal.aborted) {
          Logger.log('AIToolbar', 'Translate streaming aborted');
          break;
        }
        
        fullTranslation += chunk;
        
        // Only update result if not aborted - use throttled update to prevent max depth exceeded
        if (!abortControllerRef.current?.signal.aborted) {
          setResultThrottled(fullTranslation);
        }
      }
      
      // Ensure final result is set
      if (!abortControllerRef.current?.signal.aborted && fullTranslation) {
        setResult(fullTranslation);
      }
      
      Logger.log('AIToolbar', 'Translation streaming complete');
    } catch (err) {
      // Don't show error if user aborted
      if (err.name !== 'AbortError' && !abortControllerRef.current?.signal.aborted) {
        Logger.error('AIToolbar', 'Translate failed:', err);
        setError('Translation failed: ' + (err.message || 'Unknown error'));
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
  const onImageAnalysisClick = async (analysisType, skipClearResult = false) => {
    // Check if we have any image source (hoveredImageElement OR selectedImages)
    if (!hoveredImageElement && (!selectedImages || selectedImages.length === 0)) {
      setError('No images selected');
      return;
    }
    
    // Cancel any ongoing request first
    if (isLoading && abortControllerRef.current) {
      abortControllerRef.current.abort();
      await abortPreviousRequest();
    }
    
    setIsLoading(true);
    setAction(`image-${analysisType}`);
    setError('');
    // Don't clear result if regenerating (keep panel visible)
    if (!skipClearResult) {
      setResult('');
    }
    
    Logger.log('AIToolbar', `Image Analysis clicked (${analysisType}, streaming)`);
    
    // Create abort controller for this request
    abortControllerRef.current = new AbortController();
    
    try {
      let processedMedia = null;
      
      // Check if we have hoveredImageElement from image hover feature
      if (hoveredImageElement) {
        // Extract the hovered image using MediaExtractionService
        Logger.log('AIToolbar', 'Extracting hovered image for analysis');
        
        // If hoveredImageElement is an IMG element itself, we need to pass its parent
        // and create a fake selection that contains only this image
        const containerToUse = hoveredImageElement.parentElement || hoveredImageElement;
        
        // Create a fake selection that contains only the hovered image
        const fakeSelection = {
          containsNode: (node) => node === hoveredImageElement,
          toString: () => ''
        };
        
        processedMedia = await MediaExtractionService.processAndExtract({
          container: containerToUse,
          selection: fakeSelection
        });
      } else {
        // Extract from selection
        // Use existing getSelection method to get container and selection
        const { selection } = getSelection();
        
        if (!selection || selection.rangeCount === 0) {
          setError('No selection available');
          setIsLoading(false);
          return;
        }
        
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const containerEl = container.nodeType === 3 ? container.parentElement : container;
        
        // Convert image URLs to data URLs using MediaExtractionService
        processedMedia = await MediaExtractionService.processAndExtract({
          container: containerEl,
          selection: selection
        });
      }
      
      if (!processedMedia.images || processedMedia.images.length === 0) {
        setError('Failed to process images');
        setIsLoading(false);
        return;
      }
      
      // Build prompt based on analysis type using PromptConfig
      let prompt;
      const imageCount = processedMedia.images.length;
      switch (analysisType) {
        case 'describe':
          prompt = PromptConfig.image.describe(imageCount);
          break;
        case 'extract-text':
          prompt = PromptConfig.image.extractText(imageCount);
          break;
        case 'identify-objects':
          prompt = PromptConfig.image.identifyObjects(imageCount);
          break;
        default:
          prompt = PromptConfig.image.describe(1);
      }

      // Format message with images for AIService
      // Use simple format that AIService will convert based on provider
      const messages = [
        {
          role: 'user',
          content: prompt,
          images: processedMedia.images.map(img => img.dataUrl) // Array of data URLs
        }
      ];
      
      let fullResponse = '';
      
      // Use AIServiceProxy sendMessage with streaming callback
      const response = await AIServiceProxy.sendMessage(messages, (chunk) => {
        // Check if aborted before processing chunk
        if (abortControllerRef.current?.signal.aborted) {
          Logger.log('AIToolbar', 'Image analysis streaming aborted');
          return;
        }
        
        fullResponse += chunk;
        
        // Only update result if not aborted - use throttled update to prevent max depth exceeded
        if (!abortControllerRef.current?.signal.aborted) {
          setResultThrottled(fullResponse);
        }
      });
      
      // Handle final response if not streaming - ensure final result is always set
      if (!abortControllerRef.current?.signal.aborted) {
        if (response.response) {
          setResult(response.response);
        } else if (fullResponse) {
          setResult(fullResponse);
        }
      }
      
      Logger.log('AIToolbar', 'Image analysis streaming complete');
    } catch (err) {
      // Don't show error if user aborted
      if (err.name !== 'AbortError' && !abortControllerRef.current?.signal.aborted) {
        Logger.error('AIToolbar', 'Image analysis failed:', err);
        setError('Image analysis failed: ' + (err.message || 'Unknown error'));
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
  const handleDictionaryAction = async (actionType, actionName, promptBuilder, skipClearResult = false) => {
    if (!selectedText) {
      setError('No word selected');
      return;
    }
    
    // Cancel any ongoing request first
    if (isLoading && abortControllerRef.current) {
      abortControllerRef.current.abort();
      await abortPreviousRequest();
    }
    
    setIsLoading(true);
    setAction(`dictionary-${actionType}`);
    setError('');
    // Don't clear result if regenerating (keep panel visible)
    if (!skipClearResult) {
      setResult('');
    }
    
    Logger.log('AIToolbar', `${actionName} clicked (streaming)`);
    
    abortControllerRef.current = new AbortController();
    
    try {
      const word = selectedText.trim();
      const prompt = promptBuilder(word);
      const messages = [{ role: 'user', content: prompt }];
      let fullResponse = '';
      
      Logger.log('AIToolbar', 'Sending ${actionName} request with messages:', messages);
      
      const response = await AIServiceProxy.sendMessage(messages, (chunk) => {
        if (abortControllerRef.current?.signal.aborted) {
          Logger.log('AIToolbar', `${actionName} streaming aborted`);
          return;
        }
        Logger.log('AIToolbar', '${actionName} chunk received:', chunk);
        fullResponse += chunk;
        if (!abortControllerRef.current?.signal.aborted) {
          setResultThrottled(fullResponse);
        }
      });
      
      Logger.log('AIToolbar', '${actionName} response object:', response);
      Logger.log('AIToolbar', '${actionName} fullResponse:', fullResponse);
      
      // Check if request was cancelled
      if (response?.cancelled) {
        Logger.log('AIToolbar', `${actionName} request was cancelled`);
        return;
      }
      
      // Check for errors
      if (!response?.success) {
        const errorMsg = response?.error?.message || 'AI request failed';
        Logger.error('AIToolbar', '${actionName} request failed:', response?.error);
        setError(errorMsg);
        return;
      }
      
      // Handle non-streaming response - ensure final result is always set
      if (response?.response) {
        Logger.log('AIToolbar', 'Using non-streaming response');
        setResult(response.response);
      } else if (fullResponse) {
        setResult(fullResponse);
      }
      
      // If we still have no result, show error
      if (!fullResponse && !response?.response) {
        Logger.error('AIToolbar', 'No response received from AI');
        setError('No response received from AI service');
      }
      
      Logger.log('AIToolbar', `${actionName} streaming complete`);
    } catch (err) {
      if (err.name !== 'AbortError' && !abortControllerRef.current?.signal.aborted) {
        Logger.error('AIToolbar', '${actionName} failed:', err);
        setError(`${actionName} lookup failed: ` + (err.message || 'Unknown error'));
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
    await handleDictionaryAction('define', 'Dictionary', (word) => PromptConfig.dictionary.define(word), skipClearResult);
  };

  /**
   * Handle Synonyms action
   */
  const onSynonymsClick = async (skipClearResult = false) => {
    await handleDictionaryAction('synonyms', 'Synonyms', (word) => PromptConfig.dictionary.synonyms(word), skipClearResult);
  };

  /**
   * Handle Antonyms action
   */
  const onAntonymsClick = async (skipClearResult = false) => {
    await handleDictionaryAction('antonyms', 'Antonyms', (word) => PromptConfig.dictionary.antonyms(word), skipClearResult);
  };

  /**
   * Handle Pronunciation action
   */
  const onPronunciationClick = async (skipClearResult = false) => {
    await handleDictionaryAction('pronunciation', 'Pronunciation', (word) => PromptConfig.dictionary.pronunciation(word), skipClearResult);
  };

  /**
   * Handle Examples action
   */
  const onExamplesClick = async (skipClearResult = false) => {
    await handleDictionaryAction('examples', 'Examples', (word) => PromptConfig.dictionary.examples(word), skipClearResult);
  };

  /**
   * Generic rewriter handler using Chrome AI Rewriter API
   * @param {string} actionType - Type of rewrite ('grammar', 'moreFormal', 'shorter', etc.)
   * @param {string} actionName - Display name for action
   * @param {Object} rewriteOptions - RewriterService options (tone, format, length)
   */
  const handleRewrite = async (actionType, actionName, rewriteOptions = {}, skipClearResult = false) => {
    // Close writer input if open
    if (showWriterInput) {
      setShowWriterInput(false);
    }
    
    if (!selectedText) {
      setError('No text selected');
      return;
    }
    
    if (isLoading && abortControllerRef.current) {
      abortControllerRef.current.abort();
      await abortPreviousRequest();
    }
    
    setIsLoading(true);
    setAction(`rewrite-${actionType}`);
    setError('');
    // Don't clear result if regenerating (keep panel visible)
    if (!skipClearResult) {
      setResult('');
    }
    setHasInserted(false); // Reset insert state for new rewrite
    hasInsertedRef.current = false; // Reset ref for new rewrite
    setImprovedContent(null); // Clear improved content on new rewrite
    
    Logger.log('AIToolbar', `${actionName} clicked (streaming)`);
    
    abortControllerRef.current = new AbortController();
    
    try {
      // Check if explicitly disabled
      if (aiConfig?.aiFeatures?.rewriter?.enabled === false) {
        throw new Error('Rewriter is disabled in settings');
      }
      
      const text = selectedText.trim();
      let fullRewrite = '';
      
      // Use RewriterServiceProxy streaming API
      for await (const chunk of RewriterServiceProxy.rewriteStreaming(text, rewriteOptions)) {
        // Check if aborted before processing chunk
        if (abortControllerRef.current?.signal.aborted) {
          Logger.log('AIToolbar', 'Rewrite streaming aborted');
          break;
        }
        
        fullRewrite += chunk;
        
        // Only update result if not aborted - use throttled update to prevent max depth exceeded
        if (!abortControllerRef.current?.signal.aborted) {
          setResultThrottled(fullRewrite);
        }
      }
      
      // Ensure final result is set
      if (!abortControllerRef.current?.signal.aborted && fullRewrite) {
        setResult(fullRewrite);
      }
      
      Logger.log('AIToolbar', `${actionName} streaming complete`);
    } catch (err) {
      // Don't show error if user aborted
      if (err.name !== 'AbortError' && !abortControllerRef.current?.signal.aborted) {
        Logger.error('AIToolbar', '${actionName} failed:', err);
        setError(`${actionName} failed: ` + (err.message || 'Unknown error'));
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
    await handleRewrite('grammar', 'Fix Grammar', {
      tone: 'as-is',
      format: 'as-is',
      length: 'as-is',
      context: 'Fix any grammar errors while maintaining the original tone and style.'
    }, skipClearResult);
  };

  /**
   * Fix Spelling - More formal tone
   */
  const onFixSpellingClick = async (skipClearResult = false) => {
    await handleRewrite('spelling', 'Fix Spelling', {
      tone: 'as-is',
      format: 'as-is',
      length: 'as-is',
      context: 'Fix any spelling errors while maintaining the original tone and style.'
    }, skipClearResult);
  };

  /**
   * Make More Formal
   */
  const onMakeFormalClick = async (skipClearResult = false) => {
    await handleRewrite('moreFormal', 'Make Formal', {
      tone: 'more-formal',
      format: 'as-is',
      length: 'as-is'
    }, skipClearResult);
  };

  /**
   * Make More Casual
   */
  const onMakeCasualClick = async (skipClearResult = false) => {
    await handleRewrite('moreCasual', 'Make Casual', {
      tone: 'more-casual',
      format: 'as-is',
      length: 'as-is'
    }, skipClearResult);
  };

  /**
   * Make Shorter
   */
  const onMakeShorterClick = async (skipClearResult = false) => {
    await handleRewrite('shorter', 'Make Shorter', {
      tone: 'as-is',
      format: 'as-is',
      length: 'shorter'
    }, skipClearResult);
  };

  /**
   * Make Longer/Expand
   */
  const onExpandClick = async (skipClearResult = false) => {
    await handleRewrite('longer', 'Expand', {
      tone: 'as-is',
      format: 'as-is',
      length: 'longer'
    }, skipClearResult);
  };

  /**
   * Professional Tone (combination: more formal + maintain length)
   */
  const onMakeProfessionalClick = async (skipClearResult = false) => {
    await handleRewrite('professional', 'Make Professional', {
      tone: 'more-formal',
      format: 'as-is',
      length: 'as-is',
      context: 'Rewrite in a professional, business-appropriate tone.'
    }, skipClearResult);
  };

  /**
   * Simplify (combination: casual tone + shorter length)
   */
  const onSimplifyClick = async (skipClearResult = false) => {
    await handleRewrite('simplify', 'Simplify', {
      tone: 'more-casual',
      format: 'plain-text',
      length: 'shorter',
      context: 'Simplify the text using simpler words and shorter sentences.'
    }, skipClearResult);
  };

  /**
   * Improve Clarity (rewrite maintaining tone but improving structure)
   */
  const onImproveClarityClick = async (skipClearResult = false) => {
    await handleRewrite('clarity', 'Improve Clarity', {
      tone: 'as-is',
      format: 'as-is',
      length: 'as-is',
      context: 'Improve clarity and readability while maintaining the original tone and length.'
    }, skipClearResult);
  };

  /**
   * Make Concise (shorter)
   */
  const onMakeConciseClick = async (skipClearResult = false) => {
    await handleRewrite('concise', 'Make Concise', {
      tone: 'as-is',
      format: 'as-is',
      length: 'shorter',
      context: 'Make more concise while preserving key information.'
    }, skipClearResult);
  };

  /**
   * Custom Rewrite - Show input panel for custom instructions
   */
  const onCustomRewriteClick = () => {
    Logger.log('AIToolbar', 'Custom Rewrite clicked - showing input panel');
    setShowWriterInput(!showWriterInput); // Toggle
    setAction('rewrite-custom');
    setResult('');
    setError('');
  };

  /**
   * Handle Custom Rewrite - Rewrite selected text with custom instructions
   */
  const handleCustomRewrite = async (customInstructions, skipClearResult = false) => {
    if (!customInstructions || !selectedText) {
      Logger.error('AIToolbar', 'No instructions or selected text for custom rewrite');
      return;
    }

    Logger.log('AIToolbar', 'Custom rewrite with instructions:', customInstructions);
    
    // Hide input panel when starting rewrite
    setShowWriterInput(false);
    
    await handleRewrite('custom', 'Custom Rewrite', {
      tone: 'as-is',
      format: 'as-is',
      length: 'as-is',
      context: customInstructions // Use user's custom instructions as context
    }, skipClearResult);
    
    // Clear the input after successful rewrite
    setWriterPrompt('');
  };

  /**
   * Write - Generate content using Writer API
   */
  const handleWrite = async (writerOptions, skipClearResult = false) => {
    if (!skipClearResult) {
      setResult('');
    }
    setError('');
    // Don't hide input yet - wait until streaming starts
    setAction('write');
    setIsLoading(true);
    setResultPanelActive(true); // Keep toolbar visible during write operation
    
    Logger.log('AIToolbar', 'Write clicked (streaming)');
    
    abortControllerRef.current = new AbortController();
    
    try {
      // Check if explicitly disabled
      if (aiConfig?.aiFeatures?.writer?.enabled === false) {
        throw new Error('Writer is disabled in settings');
      }
      
      // Check if user provided a prompt
      if (!writerPrompt || writerPrompt.trim().length === 0) {
        throw new Error('Please enter what you want to write');
      }
      
      // Use writer prompt as shared context
      const sharedContext = writerPrompt.trim();
      let fullWritten = '';
      let isFirstChunk = true;
      
      // Use WriterServiceProxy streaming API
      for await (const chunk of WriterServiceProxy.writeStreaming(sharedContext, writerOptions)) {
        // Hide input panel on first chunk
        if (isFirstChunk) {
          setShowWriterInput(false);
          isFirstChunk = false;
        }
        
        // Check if aborted before processing chunk
        if (abortControllerRef.current?.signal.aborted) {
          Logger.log('AIToolbar', 'Write streaming aborted');
          break;
        }
        
        fullWritten += chunk;
        
        // Only update result if not aborted - use throttled update to prevent max depth exceeded
        if (!abortControllerRef.current?.signal.aborted) {
          setResultThrottled(fullWritten);
        }
      }
      
      // Ensure final result is set
      if (!abortControllerRef.current?.signal.aborted && fullWritten) {
        setResult(fullWritten);
        setWriterPrompt(''); // Clear prompt after successful generation
      }
      
      Logger.log('AIToolbar', 'Write streaming complete');
    } catch (err) {
      // Don't show error if user aborted
      if (err.name !== 'AbortError' && !abortControllerRef.current?.signal.aborted) {
        Logger.error('AIToolbar', 'Write failed:', err);
        setError('Write failed: ' + (err.message || 'Unknown error'));
        setShowWriterInput(true); // Show input again on error
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
    Logger.log('AIToolbar', 'Write clicked - showing input panel');
    setShowWriterInput(!showWriterInput); // Toggle
    setAction('write-input');
    setResult('');
    setError('');
  };

  /**
   * Helper to abort previous request
   */
  const abortPreviousRequest = async () => {
    try {
      if (action?.startsWith('summarize-')) {
        await SummarizerServiceProxy.abort();
      } else if (action === 'translate' || action === 'detect-language') {
        await TranslatorServiceProxy.abort();
      } else if (action?.startsWith('rewrite-')) {
        await RewriterServiceProxy.abort();
      } else if (action?.startsWith('write-')) {
        await WriterServiceProxy.abort();
      } else if (action?.startsWith('image-') || action?.startsWith('dictionary-')) {
        await AIServiceProxy.abortRequest();
      }
    } catch (err) {
      Logger.error('AIToolbar', 'Service abort failed:', err);
    }
  };

  /**
   * Handle Regenerate action
   */
  const onRegenerateClick = async () => {
    if (action?.startsWith('summarize-')) {
      const summaryType = action.replace('summarize-', '');
      await onSummarizeClick(summaryType, true);
    } else if (action === 'translate') {
      await onTranslateClick(selectedTargetLanguage, true, true);
    } else if (action === 'detect-language') {
      await onDetectLanguageClick();
    } else if (action?.startsWith('image-')) {
      const analysisType = action.replace('image-', '');
      await onImageAnalysisClick(analysisType, true);
    } else if (action?.startsWith('dictionary-')) {
      const dictAction = action.replace('dictionary-', '');
      switch (dictAction) {
        case 'define':
          await onDictionaryClick(true);
          break;
        case 'synonyms':
          await onSynonymsClick(true);
          break;
        case 'antonyms':
          await onAntonymsClick(true);
          break;
        case 'pronunciation':
          await onPronunciationClick(true);
          break;
        case 'examples':
          await onExamplesClick(true);
          break;
      }
    } else if (action?.startsWith('rewrite-')) {
      const rewriteAction = action.replace('rewrite-', '');
      switch (rewriteAction) {
        case 'grammar':
          await onFixGrammarClick(true);
          break;
        case 'spelling':
          await onFixSpellingClick(true);
          break;
        case 'moreFormal':
          await onMakeFormalClick(true);
          break;
        case 'moreCasual':
          await onMakeCasualClick(true);
          break;
        case 'professional':
          await onMakeProfessionalClick(true);
          break;
        case 'simplify':
          await onSimplifyClick(true);
          break;
        case 'longer':
          await onExpandClick(true);
          break;
        case 'concise':
          await onMakeConciseClick(true);
          break;
        case 'shorter':
          await onMakeShorterClick(true);
          break;
        case 'clarity':
          await onImproveClarityClick(true);
          break;
      }
    } else if (action === 'write') {
      // Regenerate write action
      await handleWrite(aiConfig?.aiFeatures?.writer || { tone: 'neutral', format: 'plain-text', length: 'medium' });
    }
  };

  /**
   * Handle Add to Chat action
   */
  const onAddToChatClick = async () => {
    Logger.log('AIToolbar', 'Add to Chat clicked');
    
    // Check if we have hoveredImageElement or selection
    if (!hoveredImageElement && !selectedText && selectedImages.length === 0 && selectedAudios.length === 0) {
      setError('Nothing selected');
      return;
    }
    
    // Get selection again to get container (only if not using hoveredImageElement)
    let result;
    
    if (hoveredImageElement) {
      Logger.log('AIToolbar', 'Extracting hovered image for Add to Chat');
      
      // If hoveredImageElement is an IMG element itself, we need to pass its parent
      // and create a fake selection that contains only this image
      const containerToUse = hoveredImageElement.parentElement || hoveredImageElement;
      
      // Create a fake selection that contains only the hovered image
      const fakeSelection = {
        containsNode: (node) => node === hoveredImageElement,
        toString: () => ''
      };
      
      result = await MediaExtractionService.processAndExtract({
        container: containerToUse,
        selection: fakeSelection
      });
    } else {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        setError('Selection lost');
        return;
      }
      
      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;
      const containerEl = container.nodeType === 3 ? container.parentElement : container;
      
      // Use single MediaExtractionService method
      result = await MediaExtractionService.processAndExtract({
        container: containerEl,
        selection: selection
      });
    }
    
    Logger.log('AIToolbar', 'Extracted data:', result);
    
    // Use AppContext method
    handleAddToChat({
      text: result.text || selectedText || '',
      images: result.images,
      audios: result.audios
    });
    
    // Hide toolbar
    setIsVisible(false);
  };

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
  const handleContentManipulation = async (operation) => {
    if (!editableElement || !isEditableContent) return;
    
    let newContent = '';
    let restoreSelection = false;
    let selectionStart = 0;
    let selectionEnd = 0;
    
    // Determine the operation specifics
    if (operation === 'insert') {
      if (!result) return;
      newContent = result;
      // Insert will select the new content
    } else if (operation === 'toggle') {
      // Toggle between original and improved content
      if (hasInserted) {
        // Currently showing improved - switch to original
        if (!originalContent) return;
        newContent = originalContent;
        restoreSelection = true;
        selectionStart = editableSelectionStart;
        selectionEnd = editableSelectionEnd;
      } else {
        // Currently showing original - switch to improved
        if (!improvedContent) return;
        newContent = improvedContent;
      }
    } else {
      return;
    }
    
    Logger.log('AIToolbar', `${operation.charAt(0).toUpperCase() + operation.slice(1)} operation started`);
    
    try {
      if (editableType === 'input' || editableType === 'textarea') {
        // Update the value based on operation
        if (operation === 'insert') {
          // For insert, replace only the selected portion
          const currentValue = editableElement.value;
          const start = editableSelectionStart;
          const end = editableSelectionEnd;
          const improvedValue = currentValue.substring(0, start) + newContent + currentValue.substring(end);
          
          // Store improved content for toggling
          setImprovedContent(improvedValue);
          
          editableElement.value = improvedValue;
          selectionStart = start;
          selectionEnd = start + newContent.length;
        } else {
          // For toggle, replace entire value
          editableElement.value = newContent;
          if (!hasInserted) {
            // Switching to improved - select the improved portion
            selectionStart = editableSelectionStart;
            selectionEnd = editableSelectionStart + (improvedContent.length - originalContent.length + (editableSelectionEnd - editableSelectionStart));
          }
        }
        
        // Trigger events
        editableElement.dispatchEvent(new Event('input', { bubbles: true }));
        editableElement.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Handle selection
        editableElement.focus();
        editableElement.setSelectionRange(selectionStart, selectionEnd);
        
      } else if (editableType === 'contenteditable') {
        if (operation === 'insert') {
          // For insert, work with current selection
          const selection = window.getSelection();
          if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            range.deleteContents();
            
            // Insert the new text (convert newlines to <br>)
            const fragment = document.createDocumentFragment();
            const lines = newContent.split('\n');
            lines.forEach((line, index) => {
              fragment.appendChild(document.createTextNode(line));
              if (index < lines.length - 1) {
                fragment.appendChild(document.createElement('br'));
              }
            });
            
            const firstNode = fragment.firstChild;
            const lastNode = fragment.lastChild;
            range.insertNode(fragment);
            
            // Store improved content for toggling
            setImprovedContent(editableElement.innerHTML);
            
            // Trigger input event
            editableElement.dispatchEvent(new Event('input', { bubbles: true }));
            
            // Select the inserted text
            if (firstNode && lastNode) {
              range.setStartBefore(firstNode);
              range.setEndAfter(lastNode);
              selection.removeAllRanges();
              selection.addRange(range);
            }
          }
        } else {
          // For toggle, replace innerHTML
          editableElement.innerHTML = newContent;
          editableElement.dispatchEvent(new Event('input', { bubbles: true }));
          editableElement.focus();
          
          // Handle selection based on toggle direction
          try {
            const selection = window.getSelection();
            const range = document.createRange();
            
            if (hasInserted && restoreSelection && selectedText) {
              // Switching to original - try to restore original selection
              const textNodes = [];
              const walk = document.createTreeWalker(editableElement, NodeFilter.SHOW_TEXT, null);
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
                  const nodeLength = textNode.textContent.length;
                  
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
                  range.setStart(startNode, Math.min(startOffset, startNode.textContent.length));
                  range.setEnd(endNode, Math.min(endOffset, endNode.textContent.length));
                  selection.removeAllRanges();
                  selection.addRange(range);
                }
              }
            } else {
              // Switching to improved - select all content
              range.selectNodeContents(editableElement);
              selection.removeAllRanges();
              selection.addRange(range);
            }
          } catch (selectionErr) {
            Logger.warn('AIToolbar', 'Could not restore selection for toggle:', selectionErr);
          }
        }
      }
      
      // Update state based on operation
      if (operation === 'insert') {
        setHasInserted(true);
        hasInsertedRef.current = true;
        setResult('');
        setError('');
        Logger.log('AIToolbar', 'Text inserted successfully and selected, panel closed');
      } else if (operation === 'toggle') {
        setHasInserted(!hasInserted); // Toggle state
        hasInsertedRef.current = !hasInsertedRef.current;
        Logger.log('AIToolbar', `Toggled to ${hasInserted ? 'original' : 'improved'} content`);
      }
      
    } catch (err) {
      Logger.error('AIToolbar', 'Failed to ${operation}:', err);
      setError(`Failed to ${operation}: ` + (err.message || 'Unknown error'));
    }
  };

  /**
   * Handle Insert - insert improved text
   */
  const onInsertClick = async () => {
    // Stop dictation recording if active
    if (action === 'dictation' && isRecording) {
      Logger.log('AIToolbar', 'Stopping dictation on Insert click');
      VoiceRecordingService.stop();
      setIsRecording(false);
    }
    
    await handleContentManipulation('insert');
  };

  /**
   * Handle Undo - Restore original content
   */
  const onUndoClick = async () => {
    if (!hasInserted || !originalContent || !editableElement) return;
    
    // Restore original content
    if (editableType === 'contenteditable') {
      editableElement.innerHTML = originalContent;
      editableElement.dispatchEvent(new Event('input', { bubbles: true }));
      editableElement.focus();
      
      // Restore selection for contenteditable
      try {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editableElement);
        selection.removeAllRanges();
        selection.addRange(range);
        
        // Update selected text state to keep toolbar visible
        setSelectedText(editableElement.textContent || editableElement.innerText);
      } catch (err) {
        Logger.warn('AIToolbar', 'Could not restore selection after undo:', err);
      }
    } else {
      editableElement.value = originalContent;
      editableElement.dispatchEvent(new Event('input', { bubbles: true }));
      editableElement.focus();
      
      // Restore selection for input/textarea
      editableElement.setSelectionRange(0, originalContent.length);
      
      // Update selected text state to keep toolbar visible
      setSelectedText(originalContent);
    }
    
    setHasInserted(false);
    hasInsertedRef.current = false;
    setResultPanelActive(true); // Keep result panel active to prevent toolbar from disappearing
    Logger.log('AIToolbar', 'Undo: Restored original content with selection');
  };

  /**
   * Handle Redo - Restore improved content
   */
  const onRedoClick = async () => {
    if (hasInserted || !improvedContent || !editableElement) return;
    
    // Restore improved content
    if (editableType === 'contenteditable') {
      editableElement.innerHTML = improvedContent;
      editableElement.dispatchEvent(new Event('input', { bubbles: true }));
      editableElement.focus();
      
      // Restore selection for contenteditable
      try {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editableElement);
        selection.removeAllRanges();
        selection.addRange(range);
        
        // Update selected text state to keep toolbar visible
        setSelectedText(editableElement.textContent || editableElement.innerText);
      } catch (err) {
        Logger.warn('AIToolbar', 'Could not restore selection after redo:', err);
      }
    } else {
      editableElement.value = improvedContent;
      editableElement.dispatchEvent(new Event('input', { bubbles: true }));
      editableElement.focus();
      
      // Restore selection for input/textarea
      editableElement.setSelectionRange(0, improvedContent.length);
      
      // Update selected text state to keep toolbar visible
      setSelectedText(improvedContent);
    }
    
    setHasInserted(true);
    hasInsertedRef.current = true;
    setResultPanelActive(true); // Keep result panel active to prevent toolbar from disappearing
    Logger.log('AIToolbar', 'Redo: Restored improved content with selection');
  };

  /**
   * Handle dictation button click
   * Continuous dictation mode with VAD (Voice Activity Detection):
   * - Manual mode: User clicks Insert to insert all accumulated text
   * - Auto mode: Text already inserted sentence-by-sentence, cursor at end
   */
  const onDictationClick = async () => {
    try {
      if (!isRecording) {
        const hasSelection = selectedText && selectedText.trim().length > 0;
        const mode = hasSelection ? 'manual' : 'auto-insert';
        setDictationMode(mode);
        setIsRecording(true);
        setRecordingDuration(0);
        setAccumulatedTranscription(''); // Clear previous transcription
        setAction('dictation'); // Set action to show result panel
        setResult(''); // Clear previous result
        setError('');
        isProcessingRef.current = false;
        
        Logger.log('AIToolbar', `Starting dictation session in ${mode} mode with VAD`);
        
        // Start duration timer
        const startTime = Date.now();
        recordingIntervalRef.current = setInterval(() => {
          setRecordingDuration(Math.floor((Date.now() - startTime) / 1000));
        }, 100);
        
        // Start VoiceRecordingService with VAD
        // VAD will auto-detect speech and silence, transcribing each sentence
        await VoiceRecordingService.start({
          onTranscription: (transcription) => {
            Logger.log('AIToolbar', `VAD transcription received: "${transcription}"`);
            
            if (mode === 'auto-insert') {
              // ========== AUTO-INSERT MODE ==========
              // Insert each sentence at cursor as it's transcribed
              if (editableElement && isEditableContent) {
                const separator = accumulatedTranscription ? ' ' : ''; // Add space between sentences
                
                // Restore focus to input if lost
                if (document.activeElement !== editableElement) {
                  editableElement.focus();
                }
                
                if (editableType === 'contenteditable') {
                  // ContentEditable handling
                  let range;
                  if (savedCursorPositionRef.current?.range) {
                    // Use saved cursor position
                    range = savedCursorPositionRef.current.range;
                  } else {
                    const selection = window.getSelection();
                    if (selection.rangeCount > 0) {
                      range = selection.getRangeAt(0);
                    }
                  }
                  
                  if (range) {
                    range.deleteContents();
                    range.insertNode(document.createTextNode(separator + transcription));
                    range.collapse(false);
                    // Update saved position for next insertion
                    savedCursorPositionRef.current = { element: editableElement, range: range.cloneRange() };
                  }
                } else {
                  // Input/textarea handling - use saved cursor position or current position
                  const currentValue = editableElement.value;
                  const cursorPos = savedCursorPositionRef.current?.start ?? editableElement.selectionStart ?? editableSelectionStart;
                  const newValue = 
                    currentValue.slice(0, cursorPos) + 
                    separator + transcription + 
                    currentValue.slice(cursorPos);
                  editableElement.value = newValue;
                  const newCursorPos = cursorPos + separator.length + transcription.length;
                  editableElement.setSelectionRange(newCursorPos, newCursorPos);
                  // Trigger input event for React
                  editableElement.dispatchEvent(new Event('input', { bubbles: true }));
                  
                  // Update cursor position for next insertion
                  setEditableSelectionStart(newCursorPos);
                  setEditableSelectionEnd(newCursorPos);
                  // Update saved position
                  savedCursorPositionRef.current = { element: editableElement, start: newCursorPos, end: newCursorPos };
                }
                
                // Update accumulated transcription (for display/tracking)
                setAccumulatedTranscription(prev => prev + separator + transcription);
                Logger.log('AIToolbar', `Auto-inserted sentence: "${transcription}" at cursor position`);
              }
            } else {
              // Accumulate each sentence in result panel for later insert
              setAccumulatedTranscription(prev => {
                const separator = prev ? ' ' : '';
                const newText = prev + separator + transcription;
                setResult(newText); // Update result panel with all accumulated text
                Logger.log('AIToolbar', `Added sentence to result panel. Total: "${newText}"`);
                return newText;
              });
            }
          },
          onError: (errorMsg) => {
            Logger.error('AIToolbar', 'Dictation error:', errorMsg);
            setError(errorMsg.message || errorMsg.toString());
            setIsRecording(false);
            if (recordingIntervalRef.current) {
              clearInterval(recordingIntervalRef.current);
              recordingIntervalRef.current = null;
            }
          },
          onRecordingStart: () => {
            Logger.log('AIToolbar', 'VAD detected speech - recording started');
            // Visual feedback could be added here (pulsing mic icon)
          },
          onRecordingStop: () => {
            Logger.log('AIToolbar', 'VAD detected silence - recording stopped, processing transcription...');
            // Each pause triggers transcription, which calls onTranscription above
            // No need to change isRecording state - VAD will continue monitoring
          },
          onVolumeChange: (volume) => {
            // Could use for visual feedback (volume meter)
            // Logger.log('other', `Volume: ${volume}`);
          }
        });
        
      } else {
        Logger.log('AIToolbar', 'Stopping dictation session (VAD will stop monitoring)');
        VoiceRecordingService.stop();
        setIsRecording(false);
        if (recordingIntervalRef.current) {
          clearInterval(recordingIntervalRef.current);
          recordingIntervalRef.current = null;
        }
        // IMPORTANT: Toolbar stays open with accumulated transcription
        Logger.log('AIToolbar', 'Dictation session ended, toolbar remains open');
      }
    } catch (error) {
      Logger.error('AIToolbar', 'Dictation error:', error);
      setError(error.message || 'Failed to start dictation');
      setIsRecording(false);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
    }
  };

  // Cleanup recording timer on unmount
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

  // Determine selection type for conditional rendering
  const { isSingleWord } = getSelectionType(selectedText);
  
  // Check if we have text selection (not just images)
  const hasTextSelection = selectedText && selectedText.trim().length > 0;

  return (
    <>
      {shouldRender && (
        <div
          ref={toolbarRef}
          onMouseEnter={() => {
            // Toolbar is visible, no need for timeout cleanup
          }}
          className={`
            fixed top-0 left-0 flex items-center gap-0.5 p-1 rounded-[20px] 
            border shadow-[0_4px_20px_rgba(0,0,0,0.25)] backdrop-blur-xl will-change-transform
            glass-container ${isLightBackgroundToolbar ? 'glass-container-dark' : ''}
            ${isClosing ? 'animate-fade-out' : 'animate-fade-in'}
          `}
          style={{
            transform: `translate(${position.x}px, ${position.y}px)`,
            zIndex: 999999,
          }}
        >
          {/* Toolbar buttons with labels - Expand sub-options on hover */}
          
          {/* Dictionary Group - Only show for single words/short selections with text */}
          {hasTextSelection && isSingleWord && (
            <ToolbarSection
              isLoading={isLoading}
              isLightBackground={isLightBackgroundToolbar}
              mainButton={{
                icon: 'book',
                label: 'Dictionary',
                onClick: () => onDictionaryClick(resultPanelActive),
                disabled: !selectedText,
                isLoading: isLoading && action === 'dictionary-define',
                actionType: 'dictionary-define',
                title: 'Get word definition',
                maxLabelWidth: '100px',
              }}
              subButtons={[
                {
                  icon: 'refresh',
                  label: 'Synonyms',
                  onClick: () => onSynonymsClick(resultPanelActive),
                  disabled: !selectedText,
                  isLoading: isLoading && action === 'dictionary-synonyms',
                  actionType: 'dictionary-synonyms',
                  title: 'Find similar words',
                  maxLabelWidth: '100px',
                },
                {
                  icon: 'bidirectional',
                  label: 'Antonyms',
                  onClick: () => onAntonymsClick(resultPanelActive),
                  disabled: !selectedText,
                  isLoading: isLoading && action === 'dictionary-antonyms',
                  actionType: 'dictionary-antonyms',
                  title: 'Find opposite words',
                  maxLabelWidth: '100px',
                },
                {
                  icon: 'speaker',
                  label: 'Pronunciation',
                  onClick: () => onPronunciationClick(resultPanelActive),
                  disabled: !selectedText,
                  isLoading: isLoading && action === 'dictionary-pronunciation',
                  actionType: 'dictionary-pronunciation',
                  title: 'Get pronunciation guide',
                  maxLabelWidth: '120px',
                },
                {
                  icon: 'idea',
                  label: 'Examples',
                  onClick: () => onExamplesClick(resultPanelActive),
                  disabled: !selectedText,
                  isLoading: isLoading && action === 'dictionary-examples',
                  actionType: 'dictionary-examples',
                  title: 'See usage examples',
                  maxLabelWidth: '100px',
                },
              ]}
            />
          )}
          
          {/* Rewrite Text Group - Only show for editable content */}
          {hasTextSelection && isEditableContent && (
            <ToolbarSection
              isLoading={isLoading}
              isLightBackground={isLightBackgroundToolbar}
              mainButton={{
                icon: 'write',
                label: 'Rewrite',
                onClick: () => onFixGrammarClick(resultPanelActive),
                disabled: !selectedText,
                isLoading: isLoading && action === 'rewrite-grammar',
                actionType: 'rewrite-grammar',
                title: 'Fix grammar (default)',
                maxLabelWidth: '100px',
              }}
              subButtons={[
                {
                  icon: 'check',
                  label: 'Spelling',
                  onClick: () => onFixSpellingClick(resultPanelActive),
                  disabled: !selectedText,
                  isLoading: isLoading && action === 'rewrite-spelling',
                  actionType: 'rewrite-spelling',
                  title: 'Fix spelling',
                  maxLabelWidth: '100px',
                },
                {
                  icon: 'formal',
                  label: 'Formal',
                  onClick: () => onMakeFormalClick(resultPanelActive),
                  disabled: !selectedText,
                  isLoading: isLoading && action === 'rewrite-moreFormal',
                  actionType: 'rewrite-moreFormal',
                  title: 'Make formal',
                  maxLabelWidth: '100px',
                },
                {
                  icon: 'casual',
                  label: 'Casual',
                  onClick: () => onMakeCasualClick(resultPanelActive),
                  disabled: !selectedText,
                  isLoading: isLoading && action === 'rewrite-moreCasual',
                  actionType: 'rewrite-moreCasual',
                  title: 'Make casual',
                  maxLabelWidth: '100px',
                },
                {
                  icon: 'briefcase',
                  label: 'Professional',
                  onClick: () => onMakeProfessionalClick(resultPanelActive),
                  disabled: !selectedText,
                  isLoading: isLoading && action === 'rewrite-professional',
                  actionType: 'rewrite-professional',
                  title: 'Make professional',
                  maxLabelWidth: '110px',
                },
                {
                  icon: 'compress',
                  label: 'Shorter',
                  onClick: () => onMakeShorterClick(resultPanelActive),
                  disabled: !selectedText,
                  isLoading: isLoading && action === 'rewrite-shorter',
                  actionType: 'rewrite-shorter',
                  title: 'Make shorter',
                  maxLabelWidth: '100px',
                },
                {
                  icon: 'note',
                  label: 'Expand',
                  onClick: () => onExpandClick(resultPanelActive),
                  disabled: !selectedText,
                  isLoading: isLoading && action === 'rewrite-longer',
                  actionType: 'rewrite-longer',
                  title: 'Expand text',
                  maxLabelWidth: '100px',
                },
                {
                  icon: 'book',
                  label: 'Simplify',
                  onClick: () => onSimplifyClick(resultPanelActive),
                  disabled: !selectedText,
                  isLoading: isLoading && action === 'rewrite-simplify',
                  actionType: 'rewrite-simplify',
                  title: 'Simplify text',
                  maxLabelWidth: '100px',
                },
                {
                  icon: 'lightning',
                  label: 'Concise',
                  onClick: () => onMakeConciseClick(resultPanelActive),
                  disabled: !selectedText,
                  isLoading: isLoading && action === 'rewrite-concise',
                  actionType: 'rewrite-concise',
                  title: 'Make concise',
                  maxLabelWidth: '100px',
                },
                {
                  icon: 'clarity',
                  label: 'Clarity',
                  onClick: () => onImproveClarityClick(resultPanelActive),
                  disabled: !selectedText,
                  isLoading: isLoading && action === 'rewrite-clarity',
                  actionType: 'rewrite-clarity',
                  title: 'Improve clarity',
                  maxLabelWidth: '100px',
                },
                {
                  icon: 'edit',
                  label: 'Custom',
                  onClick: () => onCustomRewriteClick(),
                  disabled: !selectedText,
                  isLoading: false,
                  actionType: 'rewrite-custom',
                  title: 'Custom rewrite with instructions',
                  maxLabelWidth: '100px',
                },
              ]}
            />
          )}
          
          {/* Write Button - Only show for editable content */}
          {isEditableContent && (
            <ToolbarButton
              icon='edit'
              label="Write"
              onClick={onWriteClick}
              disabled={false}
              isLoading={isLoading && action === 'write'}
              actionType="write"
              title="Generate text with AI"
              maxLabelWidth="80px"
              isLightBackground={isLightBackgroundToolbar}
            />
          )}
          
          {/* Dictation Button - Only show for editable content */}
          {isEditableContent && (
            <ToolbarButton
              icon={isRecording ? 'stop' : 'microphone'}
              label={isRecording ? `${recordingDuration}s` : "Dictate"}
              onClick={onDictationClick}
              disabled={false}
              isLoading={isRecording}
              actionType="dictation"
              title={
                isRecording 
                  ? "Click to stop recording" 
                  : (selectedText && selectedText.trim().length > 0)
                    ? "Record and insert via button"
                    : "Record and auto-insert at cursor"
              }
              maxLabelWidth="80px"
              isLightBackground={isLightBackgroundToolbar}
            />
          )}
          
          {/* Summarize Group - Only show when text is selected and not a single word */}
          {hasTextSelection && !isSingleWord && (
            <ToolbarSection
            isLoading={isLoading}
            isLightBackground={isLightBackgroundToolbar}
            mainButton={{
              icon: 'note',
              label: 'Summarize',
              onClick: () => onSummarizeClick('tldr', resultPanelActive),
              disabled: !selectedText,
              isLoading: isLoading && action === 'summarize-tldr',
              actionType: 'summarize-tldr',
              title: 'Summarize (TL;DR)',
              maxLabelWidth: '100px',
            }}
            subButtons={[
              {
                icon: 'article',
                label: 'Headline',
                onClick: () => onSummarizeClick('headline', resultPanelActive),
                disabled: !selectedText,
                isLoading: isLoading && action === 'summarize-headline',
                actionType: 'summarize-headline',
                title: 'Generate headline',
                maxLabelWidth: '100px',
              },
              {
                icon: 'key',
                label: 'Key Points',
                onClick: () => onSummarizeClick('key-points', resultPanelActive),
                disabled: !selectedText,
                isLoading: isLoading && action === 'summarize-key-points',
                actionType: 'summarize-key-points',
                title: 'Extract key points',
                maxLabelWidth: '100px',
              },
              {
                icon: 'magic',
                label: 'Teaser',
                onClick: () => onSummarizeClick('teaser', resultPanelActive),
                disabled: !selectedText,
                isLoading: isLoading && action === 'summarize-teaser',
                actionType: 'summarize-teaser',
                title: 'Create teaser',
                maxLabelWidth: '100px',
              },
            ]}
          />
          )}
          
          {/* Translate Group - Only show when text is selected */}
          {hasTextSelection && (
            <ToolbarSection
              isLoading={isLoading}
              isLightBackground={isLightBackgroundToolbar}
              mainButton={{
                icon: 'globe',
                label: 'Translate',
                onClick: () => onTranslateClick(null, true, resultPanelActive),
                disabled: !selectedText,
                isLoading: isLoading && action === 'translate',
                actionType: 'translate',
                title: 'Translate',
                maxLabelWidth: '100px',
              }}
              subButtons={[
                {
                icon: 'search',
                label: 'Detect Lang',
                onClick: () => onDetectLanguageClick(resultPanelActive),
                disabled: !selectedText,
                isLoading: isLoading && action === 'detect-language',
                actionType: 'detect-language',
                title: 'Detect language',
                maxLabelWidth: '90px',
              },
            ]}
          />
          )}
          
          {/* Image Analysis Group - show when images are selected OR when hovered image exists */}
          {(selectedImages.length > 0 || hoveredImageElement) && (
            <ToolbarSection
                isLoading={isLoading}
                isLightBackground={isLightBackgroundToolbar}
                mainButton={{
                  icon: 'image',
                  label: 'Describe',
                  onClick: () => onImageAnalysisClick('describe', resultPanelActive),
                  disabled: false,
                  isLoading: isLoading && action === 'image-describe',
                  actionType: 'image-describe',
                  title: 'Describe image',
                  maxLabelWidth: '100px',
                }}
                subButtons={[
                  {
                    icon: 'document',
                    label: 'Extract Text',
                    onClick: () => onImageAnalysisClick('extract-text', resultPanelActive),
                    disabled: false,
                    isLoading: isLoading && action === 'image-extract-text',
                    actionType: 'image-extract-text',
                    title: 'Extract text',
                    maxLabelWidth: '100px',
                  },
                  {
                    icon: 'tag',
                    label: 'Identify Objects',
                    onClick: () => onImageAnalysisClick('identify-objects', resultPanelActive),
                    disabled: false,
                    isLoading: isLoading && action === 'image-identify-objects',
                    actionType: 'image-identify-objects',
                    title: 'Identify objects',
                    maxLabelWidth: '150px',
                  },
                ]}
              />
          )}
          
          {/* Add to Chat button - hide when showing toolbar from input focus (dictation mode) */}
          {!showingFromInputFocusRef.current && (
            <ToolbarButton
              icon='ai'
              label="Add to Chat"
              onClick={onAddToChatClick}
              disabled={false}
              isLoading={false}
              actionType="chat"
              title="Add to chat"
              maxLabelWidth="100px"
              isLightBackground={isLightBackgroundToolbar}
            />
          )}
          
          {/* Insert button - Only show when result is ready for editable content */}
          {result && !hasInserted && isEditableContent && (action?.startsWith('rewrite-') || action?.startsWith('write-') || action === 'write' || action === 'dictation' || action === 'translate') && (
            <ToolbarButton
              icon='download'
              label="Insert"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onInsertClick();
              }}
              disabled={false}
              isLoading={false}
              actionType="insert"
              title="Insert generated text"
              maxLabelWidth="80px"
              isLightBackground={isLightBackgroundToolbar}
            />
          )}
          
          {/* Undo button - Restore original text after insert */}
          {hasInserted && isEditableContent && originalContent && (
            <ToolbarButton
              icon='undo'
              label=""
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onUndoClick();
              }}
              disabled={false}
              isLoading={false}
              actionType="undo"
              title="Restore original text"
              maxLabelWidth="0px"
              isLightBackground={isLightBackgroundToolbar}
            />
          )}
          
          {/* Redo button - Restore generated text after undo */}
          {!hasInserted && isEditableContent && improvedContent && (
            <ToolbarButton
              icon='redo'
              label=""
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRedoClick();
              }}
              disabled={false}
              isLoading={false}
              actionType="redo"
              title="Restore generated text"
              maxLabelWidth="0px"
              isLightBackground={isLightBackgroundToolbar}
            />
          )}
        </div>
      )}
      
      {/* Writer Input Panel or Result Panel - shown BELOW toolbar, toolbar stays visible */}
      {shouldRenderResultPanel && (
        showWriterInput && (action === 'write-input' || action === 'rewrite-custom') ? (
          <div
            ref={resultPanelRef}
            className={`
              ${isResultPanelClosing ? 'animate-fade-out' : 'animate-fade-in'}
            `}
            style={{
              position: 'fixed',
              top: shouldShowPanelAbove ? `${position.y - 60}px` : `${position.y + 50}px`,
              left: `${position.x}px`,
              zIndex: 999998,
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {/* Writer input field */}
            <input
              type="text"
              value={writerPrompt}
              onChange={(e) => setWriterPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  if (writerPrompt.trim()) {
                    if (action === 'rewrite-custom') {
                      handleCustomRewrite(writerPrompt.trim());
                    } else {
                      handleWrite(aiConfig?.aiFeatures?.writer || { tone: 'neutral', format: 'plain-text', length: 'medium' });
                    }
                  }
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowWriterInput(false);
                  setWriterPrompt('');
                }
              }}
              placeholder={action === 'rewrite-custom' ? "How should I rewrite the selected text?" : "What would you like to write?"}
              className={`
                glass-container ${isLightBackgroundPanel ? 'glass-container-dark' : ''}
              `}
              style={{
                minWidth: '320px',
                maxWidth: '480px',
                height: '44px',
                padding: '0 12px',
                fontSize: '14px',
                fontFamily: 'inherit',
                color: 'rgba(255, 255, 255, 0.95)',
                border: 'none',
                borderRadius: '16px',
                outline: 'none',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.37)',
                transition: 'all 0.2s ease'
              }}
            />
            
            {/* Action buttons */}
            <div style={{ 
              display: 'flex',
              gap: '6px'
            }}>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (writerPrompt.trim()) {
                    if (action === 'rewrite-custom') {
                      handleCustomRewrite(writerPrompt.trim());
                    } else {
                      handleWrite(aiConfig?.aiFeatures?.writer || { tone: 'neutral', format: 'plain-text', length: 'medium' });
                    }
                  }
                }}
                disabled={!writerPrompt.trim()}
                className={`glass-container ${isLightBackgroundPanel ? 'glass-container-dark' : ''}`}
                title="Generate (Enter)"
                style={{
                  width: '44px',
                  height: '44px',
                  padding: '0',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: writerPrompt.trim() ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  color: writerPrompt.trim() 
                    ? (isLightBackgroundPanel ? '#1a1a1a' : 'rgba(255, 255, 255, 0.9)') 
                    : (isLightBackgroundPanel ? '#999' : 'rgba(255, 255, 255, 0.5)'),
                  opacity: writerPrompt.trim() ? 1 : 0.5,
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)'
                }}
                onMouseEnter={(e) => {
                  if (writerPrompt.trim()) {
                    e.currentTarget.style.transform = 'scale(1.05)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (writerPrompt.trim()) {
                    e.currentTarget.style.transform = 'scale(1)';
                  }
                }}
              >
                <Icon name="send" size={16} />
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowWriterInput(false);
                  setWriterPrompt('');
                }}
                className={`glass-container ${isLightBackgroundPanel ? 'glass-container-dark' : ''}`}
                title="Cancel (Esc)"
                style={{
                  width: '44px',
                  height: '44px',
                  padding: '0',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  color: isLightBackgroundPanel ? '#666' : 'rgba(255, 255, 255, 0.7)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.05)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
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
            animationClass={isResultPanelClosing ? 'animate-fade-out' : 'animate-fade-in'}
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
        )
      )}
    </>
  );
};

export default AIToolbar;
