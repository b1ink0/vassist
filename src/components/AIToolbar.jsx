/**
 * AIToolbar Component
 * 
 * Floating toolbar that appears when user selects text or images on the page.
 * Provides quick actions: Summarize, Translate, Add to Chat.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../contexts/AppContext';
import BackgroundDetector from '../utils/BackgroundDetector';
import MediaExtractionService from '../services/MediaExtractionService';
import UtilService from '../services/UtilService';
import { SummarizerServiceProxy, TranslatorServiceProxy } from '../services/proxies';
import { TranslationLanguages } from '../config/aiConfig';

const AIToolbar = () => {
  const { uiConfig, aiConfig, handleSummarize, handleTranslate, handleAddToChat } = useApp();
  
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [selectedText, setSelectedText] = useState('');
  const [selectedImages, setSelectedImages] = useState([]);
  const [selectedAudios, setSelectedAudios] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [action, setAction] = useState(null); // 'summarize', 'translate', or null
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [hoveredButton, setHoveredButton] = useState(null); // 'summarize', 'translate', 'chat', or null
  const [isLightBackgroundToolbar, setIsLightBackgroundToolbar] = useState(false);
  const [isLightBackgroundPanel, setIsLightBackgroundPanel] = useState(false);
  const [selectedTargetLanguage, setSelectedTargetLanguage] = useState(null); // For translation override
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  
  const toolbarRef = useRef(null);
  const resultPanelRef = useRef(null);
  const selectionTimeoutRef = useRef(null);

  /**
   * Check if toolbar is enabled
   */
  const isEnabled = uiConfig?.enableAIToolbar !== false;

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
    
    setIsVisible(false);
    setHoveredButton(null); // Reset hover state when hiding
  }, []);

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
   * Handle Summarize action
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
    
    console.log('[AIToolbar] Summarize clicked, action set to:', 'summarize');
    
    try {
      const summary = await handleSummarize(selectedText);
      setResult(summary);
      console.log('[AIToolbar] Summary received, action is:', action);
    } catch (err) {
      console.error('[AIToolbar] Summarize failed:', err);
      setError('Summarization failed: ' + (err.message || 'Unknown error'));
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle Translate action
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
    
    const targetLanguage = targetLang || selectedTargetLanguage;
    
    try {
      const translation = await handleTranslate(selectedText, null, targetLanguage);
      setResult(translation);
    } catch (err) {
      console.error('[AIToolbar] Translate failed:', err);
      setError('Translation failed: ' + (err.message || 'Unknown error'));
    } finally {
      setIsLoading(false);
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

  /**
   * Close result panel
   */
  const closeResult = () => {
    // Cancel ongoing request if loading
    if (isLoading) {
      console.log('[AIToolbar] Aborting ongoing request...');
      
      if (action === 'summarize') {
        SummarizerServiceProxy.abort();
      } else if (action === 'translate') {
        TranslatorServiceProxy.abort();
      }
    }
    
    setResult('');
    setError('');
    setAction(null);
    setIsLoading(false);
    setSelectedTargetLanguage(null);
    setCopySuccess(false);
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
          </button>
          
          <button
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
      
      {/* Result panel (shown below toolbar) */}
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
                {action === 'summarize' ? '📝 Summary' : (action === 'translate' ? '🌐 Translation' : '❓ Result')}
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
          
          {/* Loading indicator */}
          {isLoading && (
            <div className="flex items-center gap-2 py-4">
              <span className="animate-spin text-lg">⏳</span>
              <span className="text-[13px] text-white/70">
                {action === 'summarize' ? 'Summarizing...' : 'Translating...'}
              </span>
            </div>
          )}
          
          {error && !isLoading && (
            <div className={`text-[13px] leading-6 text-[#ff6b6b]`}>
              {error}
            </div>
          )}
          
          {result && !isLoading && (
            <div className={`text-[13px] leading-6 whitespace-pre-wrap opacity-90 ${isLightBackgroundPanel ? 'text-white' : 'text-white'}`}>
              {result}
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default AIToolbar;
