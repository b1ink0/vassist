/**
 * AIToolbar Component
 * 
 * Floating toolbar that appears when user selects text or images on the page.
 * Provides quick actions: Summarize, Translate, Add to Chat.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../contexts/AppContext';
import { useConfig } from '../contexts/ConfigContext';
import BackgroundDetector from '../utils/BackgroundDetector';
import MediaExtractionService from '../services/MediaExtractionService';
import UtilService from '../services/UtilService';
import { SummarizerServiceProxy, TranslatorServiceProxy, TTSServiceProxy, AIServiceProxy } from '../services/proxies';
import { TranslationLanguages } from '../config/aiConfig';

const AIToolbar = () => {
  const { uiConfig, aiConfig, handleAddToChat } = useApp();
  const { ttsConfig } = useConfig();
  
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [selectedText, setSelectedText] = useState('');
  const [selectedImages, setSelectedImages] = useState([]);
  const [selectedAudios, setSelectedAudios] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [action, setAction] = useState(null); // 'summarize', 'translate', 'image-describe', 'image-extract-text', 'image-analyze', or null
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [hoveredButton, setHoveredButton] = useState(null); // 'summarize', 'translate', 'chat', 'image-describe', 'image-extract', 'image-analyze', or null
  const [isLightBackgroundToolbar, setIsLightBackgroundToolbar] = useState(false);
  const [isLightBackgroundPanel, setIsLightBackgroundPanel] = useState(false);
  const [selectedTargetLanguage, setSelectedTargetLanguage] = useState(null); // For translation override
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false); // TTS playback state
  const [currentSessionId, setCurrentSessionId] = useState(null); // TTS session ID
  
  const toolbarRef = useRef(null);
  const resultPanelRef = useRef(null);
  const selectionTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null); // For aborting streaming

  /**
   * Check if toolbar is enabled
   */
  const isEnabled = uiConfig?.enableAIToolbar !== false;

  /**
   * Set up TTS callbacks for speaker icon
   */
  useEffect(() => {
    // Set up TTS playback callbacks
    TTSServiceProxy.setAudioStartCallback((sessionId) => {
      console.log('[AIToolbar] TTS audio started:', sessionId);
      if (sessionId === currentSessionId) {
        setIsSpeaking(true);
      }
    });

    TTSServiceProxy.setAudioEndCallback((sessionId) => {
      console.log('[AIToolbar] TTS audio ended:', sessionId);
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
   * Handle TTS speaker button click
   */
  const onSpeakerClick = async () => {
    if (!result || action !== 'summarize') return;

    // Check if TTS is configured and enabled
    if (!ttsConfig?.enabled) {
      console.warn('[AIToolbar] TTS is not enabled');
      setError('Text-to-Speech is disabled in settings');
      return;
    }

    // Toggle playback
    if (isSpeaking) {
      // Stop playback
      console.log('[AIToolbar] Stopping TTS');
      TTSServiceProxy.stopPlayback();
      setIsSpeaking(false);
      setCurrentSessionId(null);
    } else {
      // Start playback
      try {
        console.log('[AIToolbar] Starting TTS for summary');
        
        // Generate unique session ID
        const sessionId = `toolbar_summary_${Date.now()}`;
        setCurrentSessionId(sessionId);
        setIsSpeaking(true);

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
          console.log('[AIToolbar] TTS generation was stopped');
          setIsSpeaking(false);
          setCurrentSessionId(null);
          return;
        }

        // Play audio sequence
        await TTSServiceProxy.playAudioSequence(audioChunks, sessionId);

        // Playback complete
        setIsSpeaking(false);
        setCurrentSessionId(null);
      } catch (err) {
        console.error('[AIToolbar] TTS failed:', err);
        setError('Text-to-Speech failed: ' + (err.message || 'Unknown error'));
        setIsSpeaking(false);
        setCurrentSessionId(null);
      }
    }
  };

  /**
   * Close result panel
   */
  const closeResult = useCallback(async () => {
    // Clear UI immediately so panel disappears
    setResult('');
    setError('');
    setAction(null);
    setSelectedTargetLanguage(null);
    setCopySuccess(false);
    
    // Cancel ongoing request if loading
    if (isLoading) {
      console.log('[AIToolbar] Aborting ongoing streaming request...');
      
      // Abort streaming via abort controller
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      // Also call service abort methods to stop generation at source
      try {
        if (action === 'summarize') {
          await SummarizerServiceProxy.abort();
        } else if (action === 'translate') {
          await TranslatorServiceProxy.abort();
        } else if (action?.startsWith('image-')) {
          // Use correct method name: abortRequest() not abort()
          await AIServiceProxy.abortRequest();
        }
      } catch (error) {
        console.error('[AIToolbar] Service abort failed:', error);
      }
      
      setIsLoading(false);
      
      // Clear abort controller after a short delay to allow abort to propagate
      setTimeout(() => {
        abortControllerRef.current = null;
      }, 100);
    }
    
    // Stop TTS if playing
    if (isSpeaking && currentSessionId) {
      console.log('[AIToolbar] Stopping TTS playback');
      TTSServiceProxy.stopPlayback();
      setIsSpeaking(false);
      setCurrentSessionId(null);
    }
  }, [isLoading, action, isSpeaking, currentSessionId]);

  /**
   * Get selection and images from the page
   */
  const getSelection = useCallback(() => {
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
    if (!selection || selection.rangeCount === 0) return null;
    
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    
    // Toolbar dimensions (approximate)
    const toolbarWidth = 110; // Compact: 3 icons
    const toolbarHeight = 40; // Slim height
    const offset = 8;
    
    // Use viewport coordinates (getBoundingClientRect already gives us these)
    // Position at selection start (left edge)
    let x = rect.left;
    let y = rect.top - toolbarHeight - offset;
    
    // Adjust if too far left
    if (x < 10) {
      x = 10;
    }
    
    // Adjust if too far right
    if (x + toolbarWidth > window.innerWidth - 10) {
      x = window.innerWidth - toolbarWidth - 10;
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
      
      // Check if selection is inside result panel - if so, ignore
      if (resultPanelRef.current && selection) {
        const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        if (range) {
          const container = range.commonAncestorContainer;
          const containerEl = container.nodeType === 3 ? container.parentElement : container;
          if (containerEl && resultPanelRef.current.contains(containerEl)) {
            // Selection is inside result panel, ignore this change
            return;
          }
        }
      }
      
      // Hide if no text, images, or audios selected
      if (!text && images.length === 0 && audios.length === 0) {
        setIsVisible(false);
        setSelectedText('');
        setSelectedImages([]);
        setSelectedAudios([]);
        setResult('');
        setError('');
        setAction(null);
        setHoveredButton(null); // Reset hover state
        return;
      }
      
      // Calculate position
      const pos = calculatePosition(selection);
      if (!pos) {
        setIsVisible(false);
        return;
      }
      
      // Update state (only reset result/error/action if not already showing results)
      setSelectedText(text);
      setSelectedImages(images);
      setSelectedAudios(audios);
      setPosition(pos);
      setIsVisible(true);
      // Don't clear result/error/action here - they should only be cleared by closeResult or new action
    }, 150);
  }, [isEnabled, getSelection, calculatePosition]);

  /**
   * Handle mouse up (show toolbar after selection)
   */
  const handleMouseUp = useCallback(() => {
    handleSelectionChange();
  }, [handleSelectionChange]);

  /**
   * Handle scroll - update toolbar position instantly to follow selection
   */
  const handleScroll = useCallback(() => {
    if (!isVisible) return;
    
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
  }, [isVisible, calculatePosition]);

  /**
   * Hide toolbar when clicking outside
   * Uses composedPath() to work correctly in shadow DOM (extension mode)
   */
  const handleClickOutside = useCallback((e) => {
    // Get the full event path including shadow DOM elements
    const path = e.composedPath ? e.composedPath() : (e.path || [e.target]);
    
    // Check if any element in the path is our toolbar or result panel
    const clickedInside = path.some(el => 
      el === toolbarRef.current || 
      el === resultPanelRef.current
    );
    
    if (clickedInside) {
      return; // Click is inside our components
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
    
    // Close result panel if open (this will also abort streaming and stop TTS)
    if (result || error || isLoading) {
      closeResult();
    }
    
    setIsVisible(false);
    setHoveredButton(null); // Reset hover state when hiding
  }, [result, error, isLoading, closeResult]);

  /**
   * Set up event listeners
   */
  useEffect(() => {
    if (!isEnabled) {
      setIsVisible(false);
      return;
    }
    
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true); // Use capture to catch all scroll events
    
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
      
      if (selectionTimeoutRef.current) {
        clearTimeout(selectionTimeoutRef.current);
      }
    };
  }, [isEnabled, handleMouseUp, handleSelectionChange, handleClickOutside, handleScroll]);

  /**
   * Detect background brightness for toolbar and result panel
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
      
      // Detect result panel background
      if (panel && (result || error)) {
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
  }, [isVisible, position, result, error]);

  /**
   * Handle Summarize action with streaming
   */
  const onSummarizeClick = async () => {
    if (!selectedText) {
      setError('No text selected');
      return;
    }
    
    setIsLoading(true);
    setAction('summarize');
    setError('');
    setResult(''); // Clear previous result
    
    console.log('[AIToolbar] Summarize clicked (streaming)');
    
    // Create abort controller for this request
    abortControllerRef.current = new AbortController();
    
    try {
      // Check if explicitly disabled
      if (aiConfig?.aiFeatures?.summarizer?.enabled === false) {
        throw new Error('Summarizer is disabled in settings');
      }
      
      const options = {
        type: aiConfig?.aiFeatures?.summarizer?.defaultType || 'tldr',
        format: aiConfig?.aiFeatures?.summarizer?.defaultFormat || 'plain-text',
        length: aiConfig?.aiFeatures?.summarizer?.defaultLength || 'medium',
      };
      
      let fullSummary = '';
      
      // Use streaming API
      for await (const chunk of SummarizerServiceProxy.summarizeStreaming(selectedText, options)) {
        // Check if aborted before processing chunk
        if (abortControllerRef.current?.signal.aborted) {
          console.log('[AIToolbar] Summarize streaming aborted');
          break;
        }
        
        fullSummary += chunk;
        
        // Only update result if not aborted
        if (!abortControllerRef.current?.signal.aborted) {
          setResult(fullSummary);
        }
      }
      
      console.log('[AIToolbar] Summary streaming complete');
    } catch (err) {
      // Don't show error if user aborted
      if (err.name !== 'AbortError' && !abortControllerRef.current?.signal.aborted) {
        console.error('[AIToolbar] Summarize failed:', err);
        setError('Summarization failed: ' + (err.message || 'Unknown error'));
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  /**
   * Handle Translate action with streaming
   */
  const onTranslateClick = async (targetLang = null) => {
    if (!selectedText) {
      setError('No text selected');
      return;
    }
    
    setIsLoading(true);
    setAction('translate');
    setError('');
    setResult(''); // Clear previous result
    
    const targetLanguage = targetLang || selectedTargetLanguage || aiConfig?.aiFeatures?.translator?.defaultTargetLanguage || 'en';
    
    console.log('[AIToolbar] Translate clicked (streaming)');
    
    // Create abort controller for this request
    abortControllerRef.current = new AbortController();
    
    try {
      // Check if explicitly disabled
      if (aiConfig?.aiFeatures?.translator?.enabled === false) {
        throw new Error('Translator is disabled in settings');
      }
      
      // Auto-detect source language
      let sourceLang = null;
      try {
        const { LanguageDetectorServiceProxy } = await import('../services/proxies');
        const detectionResults = await LanguageDetectorServiceProxy.detect(selectedText);
        if (detectionResults && detectionResults.length > 0) {
          sourceLang = detectionResults[0].detectedLanguage;
        }
      } catch (err) {
        console.warn('[AIToolbar] Language detection failed:', err);
        throw new Error('Could not detect source language');
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
          console.log('[AIToolbar] Translate streaming aborted');
          break;
        }
        
        fullTranslation += chunk;
        
        // Only update result if not aborted
        if (!abortControllerRef.current?.signal.aborted) {
          setResult(fullTranslation);
        }
      }
      
      console.log('[AIToolbar] Translation streaming complete');
    } catch (err) {
      // Don't show error if user aborted
      if (err.name !== 'AbortError' && !abortControllerRef.current?.signal.aborted) {
        console.error('[AIToolbar] Translate failed:', err);
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
  const onImageAnalysisClick = async (analysisType) => {
    if (!selectedImages || selectedImages.length === 0) {
      setError('No images selected');
      return;
    }
    
    setIsLoading(true);
    setAction(`image-${analysisType}`);
    setError('');
    setResult(''); // Clear previous result
    
    console.log(`[AIToolbar] Image Analysis clicked (${analysisType}, streaming)`);
    
    // Create abort controller for this request
    abortControllerRef.current = new AbortController();
    
    try {
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
      const processedMedia = await MediaExtractionService.processAndExtract({
        container: containerEl,
        selection: selection
      });
      
      if (!processedMedia.images || processedMedia.images.length === 0) {
        setError('Failed to process images');
        setIsLoading(false);
        return;
      }
      
      // Build prompt based on analysis type
      let prompt;
      switch (analysisType) {
        case 'describe':
          prompt = processedMedia.images.length === 1 
            ? 'Describe this image in detail.'
            : `Describe these ${processedMedia.images.length} images in detail.`;
          break;
        case 'extract-text':
          prompt = processedMedia.images.length === 1
            ? 'Extract all text from this image. If there is no text, say "No text found".'
            : `Extract all text from these ${processedMedia.images.length} images. If there is no text, say "No text found".`;
          break;
        case 'analyze':
          prompt = processedMedia.images.length === 1
            ? 'Analyze this image and provide insights about what you see.'
            : `Analyze these ${processedMedia.images.length} images and provide insights about what you see.`;
          break;
        default:
          prompt = 'Describe this image.';
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
          console.log('[AIToolbar] Image analysis streaming aborted');
          return;
        }
        
        fullResponse += chunk;
        
        // Only update result if not aborted
        if (!abortControllerRef.current?.signal.aborted) {
          setResult(fullResponse);
        }
      });
      
      // Handle final response if not streaming
      if (!abortControllerRef.current?.signal.aborted && response.response) {
        setResult(response.response);
      }
      
      console.log('[AIToolbar] Image analysis streaming complete');
    } catch (err) {
      // Don't show error if user aborted
      if (err.name !== 'AbortError' && !abortControllerRef.current?.signal.aborted) {
        console.error('[AIToolbar] Image analysis failed:', err);
        setError('Image analysis failed: ' + (err.message || 'Unknown error'));
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  /**
   * Handle Regenerate action
   */
  const onRegenerateClick = async () => {
    setIsRegenerating(true);
    
    if (action === 'summarize') {
      await onSummarizeClick();
    } else if (action === 'translate') {
      await onTranslateClick(selectedTargetLanguage);
    } else if (action?.startsWith('image-')) {
      const analysisType = action.replace('image-', '');
      await onImageAnalysisClick(analysisType);
    }
    
    setIsRegenerating(false);
  };

  /**
   * Handle Add to Chat action
   */
  const onAddToChatClick = async () => {
    console.log('[AIToolbar] Add to Chat clicked');
    
    if (!selectedText && selectedImages.length === 0 && selectedAudios.length === 0) {
      setError('Nothing selected');
      return;
    }
    
    // Get selection again to get container
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      setError('Selection lost');
      return;
    }
    
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const containerEl = container.nodeType === 3 ? container.parentElement : container;
    
    // Use single MediaExtractionService method
    const result = await MediaExtractionService.processAndExtract({
      container: containerEl,
      selection: selection
    });
    
    console.log('[AIToolbar] Extracted data:', result);
    
    // Use AppContext method
    handleAddToChat({
      text: result.text || selectedText || '',
      images: result.images,
      audios: result.audios
    });
    
    // Hide toolbar and reset hover state
    setIsVisible(false);
    setHoveredButton(null);
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

  if (!isEnabled || !isVisible) {
    return null;
  }

  return (
    <>
      {!result && !error && (
        <div
          ref={toolbarRef}
          onMouseEnter={() => {
            // Keep hover state while inside toolbar
          }}
          onMouseLeave={() => {
            // Clear hover when leaving entire toolbar
            setHoveredButton(null);
          }}
          className={`
            fixed top-0 left-0 flex items-center gap-0.5 p-1 rounded-[20px] 
            border shadow-[0_4px_20px_rgba(0,0,0,0.25)] backdrop-blur-xl will-change-transform
            glass-container ${isLightBackgroundToolbar ? 'glass-container-dark' : ''}
          `}
          style={{
            transform: `translate(${position.x}px, ${position.y}px)`,
            zIndex: 999999,
          }}
        >
          {/* Toolbar buttons - Expand on hover to show text */}
          <button
            onClick={onSummarizeClick}
            disabled={isLoading || !selectedText}
            onMouseEnter={() => setHoveredButton('summarize')}
            className={`
              min-w-8 h-8 flex items-center justify-center gap-1.5
              rounded-2xl border-none text-base
              whitespace-nowrap overflow-hidden
              transition-all duration-300 ease-in-out
              ${hoveredButton === 'summarize' ? 'bg-blue-500/20 opacity-100' : 'bg-transparent opacity-80'}
              ${isLoading || !selectedText ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
              ${isLightBackgroundToolbar ? 'text-white' : 'text-white'}
            `}
            style={{
              padding: hoveredButton === 'summarize' ? '0 12px 0 8px' : '0',
            }}
            title="Summarize selected text"
          >
            <span className={`inline-block transition-opacity duration-200 ${isLoading && action === 'summarize' ? 'animate-spin' : ''}`}>
              {isLoading && action === 'summarize' ? '⏳' : '📝'}
            </span>
            <span 
              className="text-[13px] font-medium transition-opacity duration-300 delay-100"
              style={{
                opacity: hoveredButton === 'summarize' ? 1 : 0,
                maxWidth: hoveredButton === 'summarize' ? '100px' : '0',
                transition: 'opacity 0.3s ease 0.1s, max-width 0.3s ease',
              }}
            >
              Summarize
            </span>
          </button>          <button
            onClick={() => onTranslateClick()}
            disabled={isLoading || !selectedText}
            onMouseEnter={() => setHoveredButton('translate')}
            className={`
              min-w-8 h-8 flex items-center justify-center gap-1.5
              rounded-2xl border-none text-base
              whitespace-nowrap overflow-hidden
              transition-all duration-300 ease-in-out
              ${hoveredButton === 'translate' ? 'bg-emerald-500/20 opacity-100' : 'bg-transparent opacity-80'}
              ${isLoading || !selectedText ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
              ${isLightBackgroundToolbar ? 'text-white' : 'text-white'}
            `}
            style={{
              padding: hoveredButton === 'translate' ? '0 12px 0 8px' : '0',
            }}
            title="Translate selected text"
          >
            <span className={`inline-block transition-opacity duration-200 ${isLoading && action === 'translate' ? 'animate-spin' : ''}`}>
              {isLoading && action === 'translate' ? '⏳' : '🌐'}
            </span>
            <span 
              className="text-[13px] font-medium transition-opacity duration-300 delay-100"
              style={{
                opacity: hoveredButton === 'translate' ? 1 : 0,
                maxWidth: hoveredButton === 'translate' ? '100px' : '0',
                transition: 'opacity 0.3s ease 0.1s, max-width 0.3s ease',
              }}
            >
              Translate
            </span>
          </button>
          
          {/* Image Analysis buttons - only show when images are selected */}
          {selectedImages.length > 0 && (
            <>
              {/* Visual separator before image buttons */}
              <div className="w-px h-6 bg-white/20 mx-1"></div>
              
              <button
                onClick={() => onImageAnalysisClick('describe')}
                disabled={isLoading}
                onMouseEnter={() => setHoveredButton('image-describe')}
                className={`
                  min-w-8 h-8 flex items-center justify-center gap-1.5
                  rounded-2xl border-none text-base
                  whitespace-nowrap overflow-hidden
                  transition-all duration-300 ease-in-out
                  ${hoveredButton === 'image-describe' ? 'bg-amber-500/20 opacity-100' : 'bg-transparent opacity-80'}
                  ${isLoading ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                  ${isLightBackgroundToolbar ? 'text-white' : 'text-white'}
                `}
                style={{
                  padding: hoveredButton === 'image-describe' ? '0 12px 0 8px' : '0',
                }}
                title="Describe image"
              >
                <span className={`inline-block transition-opacity duration-200 ${isLoading && action === 'image-describe' ? 'animate-spin' : ''}`}>
                  {isLoading && action === 'image-describe' ? '⏳' : '🖼️'}
                </span>
                <span 
                  className="text-[13px] font-medium transition-opacity duration-300 delay-100"
                  style={{
                    opacity: hoveredButton === 'image-describe' ? 1 : 0,
                    maxWidth: hoveredButton === 'image-describe' ? '120px' : '0',
                    transition: 'opacity 0.3s ease 0.1s, max-width 0.3s ease',
                  }}
                >
                  Describe Image
                </span>
              </button>
              
              <button
                onClick={() => onImageAnalysisClick('extract-text')}
                disabled={isLoading}
                onMouseEnter={() => setHoveredButton('image-extract')}
                className={`
                  min-w-8 h-8 flex items-center justify-center gap-1.5
                  rounded-2xl border-none text-base
                  whitespace-nowrap overflow-hidden
                  transition-all duration-300 ease-in-out
                  ${hoveredButton === 'image-extract' ? 'bg-amber-500/20 opacity-100' : 'bg-transparent opacity-80'}
                  ${isLoading ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                  ${isLightBackgroundToolbar ? 'text-white' : 'text-white'}
                `}
                style={{
                  padding: hoveredButton === 'image-extract' ? '0 12px 0 8px' : '0',
                }}
                title="Extract text from image"
              >
                <span className={`inline-block transition-opacity duration-200 ${isLoading && action === 'image-extract-text' ? 'animate-spin' : ''}`}>
                  {isLoading && action === 'image-extract-text' ? '⏳' : '📄'}
                </span>
                <span 
                  className="text-[13px] font-medium transition-opacity duration-300 delay-100"
                  style={{
                    opacity: hoveredButton === 'image-extract' ? 1 : 0,
                    maxWidth: hoveredButton === 'image-extract' ? '100px' : '0',
                    transition: 'opacity 0.3s ease 0.1s, max-width 0.3s ease',
                  }}
                >
                  Extract Text
                </span>
              </button>
              
              <button
                onClick={() => onImageAnalysisClick('analyze')}
                disabled={isLoading}
                onMouseEnter={() => setHoveredButton('image-analyze')}
                className={`
                  min-w-8 h-8 flex items-center justify-center gap-1.5
                  rounded-2xl border-none text-base
                  whitespace-nowrap overflow-hidden
                  transition-all duration-300 ease-in-out
                  ${hoveredButton === 'image-analyze' ? 'bg-amber-500/20 opacity-100' : 'bg-transparent opacity-80'}
                  ${isLoading ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                  ${isLightBackgroundToolbar ? 'text-white' : 'text-white'}
                `}
                style={{
                  padding: hoveredButton === 'image-analyze' ? '0 12px 0 8px' : '0',
                }}
                title="Analyze image content"
              >
                <span className={`inline-block transition-opacity duration-200 ${isLoading && action === 'image-analyze' ? 'animate-spin' : ''}`}>
                  {isLoading && action === 'image-analyze' ? '⏳' : '🔍'}
                </span>
                <span 
                  className="text-[13px] font-medium transition-opacity duration-300 delay-100"
                  style={{
                    opacity: hoveredButton === 'image-analyze' ? 1 : 0,
                    maxWidth: hoveredButton === 'image-analyze' ? '120px' : '0',
                    transition: 'opacity 0.3s ease 0.1s, max-width 0.3s ease',
                  }}
                >
                  Analyze Content
                </span>
              </button>
              
              {/* Visual separator after image buttons */}
              <div className="w-px h-6 bg-white/20 mx-1"></div>
            </>
          )}
          
          <button
            onClick={onAddToChatClick}
            disabled={isLoading}
            onMouseEnter={() => setHoveredButton('chat')}
            className={`
              min-w-8 h-8 flex items-center justify-center gap-1.5
              rounded-2xl border-none text-base
              whitespace-nowrap overflow-hidden
              transition-all duration-300 ease-in-out
              ${hoveredButton === 'chat' ? 'bg-purple-500/20 opacity-100' : 'bg-transparent opacity-80'}
              ${isLoading ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
              ${isLightBackgroundToolbar ? 'text-white' : 'text-white'}
            `}
            style={{
              padding: hoveredButton === 'chat' ? '0 12px 0 8px' : '0',
            }}
            title="Add to chat"
          >
            <span className="transition-opacity duration-200">💬</span>
            <span 
              className="text-[13px] font-medium transition-opacity duration-300 delay-100"
              style={{
                opacity: hoveredButton === 'chat' ? 1 : 0,
                maxWidth: hoveredButton === 'chat' ? '100px' : '0',
                transition: 'opacity 0.3s ease 0.1s, max-width 0.3s ease',
              }}
            >
              Add to Chat
            </span>
          </button>
        </div>
      )}
      
      {/* Result panel (shown below toolbar) - only show after first chunk arrives */}
      {(result || error) && (
        <div
          ref={resultPanelRef}
          data-ai-toolbar-result="true"
          className={`
            fixed top-0 left-0 min-w-[280px] max-w-[400px] p-3 rounded-xl 
            border shadow-[0_4px_20px_rgba(0,0,0,0.25)] backdrop-blur-xl 
            will-change-transform
            glass-container ${isLightBackgroundPanel ? 'glass-container-dark' : ''}
          `}
          style={{
            transform: `translate(${position.x}px, ${position.y + 48}px)`,
            zIndex: 999999,
          }}
        >
          <div className="flex justify-between items-start mb-2">
            <div className="flex items-center gap-2 flex-1">
              <div className={`text-[11px] font-semibold uppercase opacity-70 ${isLightBackgroundPanel ? 'text-white' : 'text-white'}`}>
                {action === 'summarize' ? '📝 Summary' : 
                 action === 'translate' ? '🌐 Translation' : 
                 action === 'image-describe' ? '📸 Image Description' :
                 action === 'image-extract-text' ? '📄 Extracted Text' :
                 action === 'image-analyze' ? '🔍 Image Analysis' :
                 '❓ Result'}
              </div>
              
              {/* Language selector for translation */}
              {action === 'translate' && !isLoading && (
                <select
                  value={selectedTargetLanguage || aiConfig?.aiFeatures?.translator?.defaultTargetLanguage || 'en'}
                  onChange={(e) => {
                    setSelectedTargetLanguage(e.target.value);
                    onTranslateClick(e.target.value);
                  }}
                  className="text-[11px] px-2 py-0.5 rounded bg-white/10 border border-white/20 text-white cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                >
                  {TranslationLanguages.map(lang => (
                    <option key={lang.code} value={lang.code} className="bg-gray-900 text-white">
                      {lang.name}
                    </option>
                  ))}
                </select>
              )}
              
              {/* Regenerate button */}
              {!isLoading && !error && result && (
                <button
                  onClick={onRegenerateClick}
                  disabled={isRegenerating}
                  className={`
                    w-5 h-5 flex items-center justify-center text-xs rounded-lg border-none 
                    bg-transparent opacity-60 cursor-pointer transition-all duration-200 
                    hover:bg-white/10 hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed
                    ${isLightBackgroundPanel ? 'text-white' : 'text-white'}
                  `}
                  title="Regenerate"
                >
                  {isRegenerating ? '⏳' : '🔄'}
                </button>
              )}
              
              {/* Copy button */}
              {!isLoading && !error && result && (
                <button
                  onClick={onCopyClick}
                  className={`
                    w-5 h-5 flex items-center justify-center text-xs rounded-lg border-none 
                    bg-transparent opacity-60 cursor-pointer transition-all duration-200 
                    hover:bg-white/10 hover:opacity-100
                    ${isLightBackgroundPanel ? 'text-white' : 'text-white'}
                  `}
                  title="Copy to clipboard"
                >
                  {copySuccess ? '✓' : '📋'}
                </button>
              )}
              
              {/* Speaker button - for summarizer and image analysis */}
              {!isLoading && !error && result && (action === 'summarize' || action?.startsWith('image-')) && ttsConfig?.enabled && (
                <button
                  onClick={onSpeakerClick}
                  disabled={isLoading}
                  className={`
                    w-5 h-5 flex items-center justify-center text-xs rounded-lg border-none 
                    bg-transparent opacity-60 cursor-pointer transition-all duration-200 
                    hover:bg-white/10 hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed
                    ${isLightBackgroundPanel ? 'text-white' : 'text-white'}
                  `}
                  title={isSpeaking ? 'Pause speaking' : 'Speak summary'}
                >
                  {isSpeaking ? '⏸️' : '🔊'}
                </button>
              )}
            </div>
            
            <button
              onClick={closeResult}
              className={`
                w-5 h-5 flex items-center justify-center text-xs rounded-xl border-none 
                bg-transparent opacity-60 cursor-pointer transition-all duration-200 
                hover:bg-white/10 hover:opacity-100
                ${isLightBackgroundPanel ? 'text-white' : 'text-white'}
              `}
            >
              ✕
            </button>
          </div>
          
          {/* Error display */}
          {error && !isLoading && (
            <div className={`text-[13px] leading-6 text-[#ff6b6b]`}>
              {error}
            </div>
          )}
          
          {/* Show result with streaming indicator */}
          {result && (
            <div>
              <div className={`text-[13px] leading-6 whitespace-pre-wrap opacity-90 ${isLightBackgroundPanel ? 'text-white' : 'text-white'}`}>
                {result}
              </div>
              {/* Show streaming indicator while loading */}
              {isLoading && (
                <div className="flex items-center gap-1 mt-2 text-white/50">
                  <span className="animate-pulse text-xs">●</span>
                  <span className="text-[11px]">streaming...</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default AIToolbar;
