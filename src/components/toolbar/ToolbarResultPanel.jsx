/**
 * ToolbarResultPanel Component
 * 
 * Result panel for AI Toolbar that displays:
 * - Action results (summary, translation, image analysis)
 * - Error messages
 * - Action controls (regenerate, copy, speak, language selector)
 * - Streaming indicator
 */

import { forwardRef, useRef, useEffect } from 'react'
import { Icon } from '../icons';;
import { TranslationLanguages } from '../../config/aiConfig';
import StreamingText from '../common/StreamingText';
import StreamingContainer from '../common/StreamingContainer';

const ToolbarResultPanel = forwardRef(({
  result,
  error,
  isLoading,
  action,
  position,
  showAbove = false, // Whether to show panel above toolbar
  isLightBackground = false,
  animationClass = '', // Animation class to apply (for fade-in/fade-out)
  detectedLanguageName = null,
  selectedTargetLanguage = null,
  onTargetLanguageChange,
  aiConfig,
  isRegenerating = false,
  onRegenerateClick,
  copySuccess = false,
  onCopyClick,
  isSpeaking = false,
  isTTSGenerating = false,
  onSpeakerClick,
  ttsConfig,
  onClose,
}, ref) => {

  const contentRef = useRef(null);

  useEffect(() => {
    if (contentRef.current && isLoading) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [result, isLoading]);

  const getActionInfo = () => {
    if (action?.startsWith('summarize-')) return { icon: 'note', label: 'Summary' };
    if (action === 'translate') return { icon: 'globe', label: 'Translation' };
    if (action === 'detect-language') return { icon: 'search', label: 'Language Detection' };
    if (action === 'dictation') return { icon: 'microphone', label: 'Dictation' };
    if (action === 'write') return { icon: 'edit', label: 'Writer' };
    if (action?.startsWith('rewrite-')) return { icon: 'refresh', label: 'Rewrite' };
    if (action === 'image-describe') return { icon: 'image', label: 'Description' };
    if (action === 'image-extract-text') return { icon: 'document', label: 'Extracted Text' };
    if (action === 'image-identify-objects') return { icon: 'tag', label: 'Objects' };
    if (action === 'dictionary-define') return { icon: 'book', label: 'Definition' };
    if (action === 'dictionary-synonyms') return { icon: 'refresh', label: 'Synonyms' };
    if (action === 'dictionary-antonyms') return { icon: 'bidirectional', label: 'Antonyms' };
    if (action === 'dictionary-pronunciation') return { icon: 'speaker', label: 'Pronunciation' };
    if (action === 'dictionary-examples') return { icon: 'idea', label: 'Examples' };
    if (action === 'improve-grammar') return { icon: 'check', label: 'Grammar' };
    if (action === 'improve-spelling') return { icon: 'check', label: 'Spelling' };
    if (action === 'improve-professional') return { icon: 'briefcase', label: 'Professional' };
    if (action === 'improve-formal') return { icon: 'formal', label: 'Formal' };
    if (action === 'improve-simplify') return { icon: 'book', label: 'Simplified' };
    if (action === 'improve-expand') return { icon: 'note', label: 'Expanded' };
    if (action === 'improve-concise') return { icon: 'lightning', label: 'Concise' };
    return { icon: 'question', label: 'Result' };
  };

  const actionInfo = getActionInfo();

  return (
    <div
      ref={ref}
      data-ai-toolbar-result="true"
      className={`
        fixed top-0 left-0 w-[380px] p-3 rounded-xl 
        border shadow-[0_4px_20px_rgba(0,0,0,0.25)] backdrop-blur-xl 
        will-change-transform transition-all duration-300 ease-in-out
        glass-container ${isLightBackground ? 'glass-container-dark' : ''}
        ${animationClass}
      `}
      style={{
        transform: showAbove 
          ? `translate(${position.x}px, ${position.y - 310}px)` 
          : `translate(${position.x}px, ${position.y + 48}px)`,
        zIndex: 999999,
      }}
    >
      {/* Header with title and controls */}
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2 flex-1">
          {/* Action title with icon */}
          <div className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase opacity-70 ${isLightBackground ? 'text-white' : 'text-white'}`}>
            <Icon name={actionInfo.icon} size={14} />
            <span>{actionInfo.label}</span>
          </div>
          
          {/* Show detected source language for translation with arrow to target (only when not loading) */}
          {action === 'translate' && detectedLanguageName && !isLoading && (
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-white/90 font-medium">
                {detectedLanguageName}
              </span>
              <span className="text-white/60"><Icon name="arrow-right" size={16} /></span>
            </div>
          )}
          
          {/* Language selector for translation */}
          {action === 'translate' && !isLoading && onTargetLanguageChange && (
            <select
              value={selectedTargetLanguage || aiConfig?.aiFeatures?.translator?.defaultTargetLanguage || 'en'}
              onChange={(e) => onTargetLanguageChange(e.target.value)}
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
          {!isLoading && !error && result && onRegenerateClick && (
            <button
              onClick={onRegenerateClick}
              disabled={isRegenerating}
              className={`
                w-5 h-5 flex items-center justify-center text-xs rounded-lg border-none 
                bg-transparent opacity-60 cursor-pointer transition-all duration-200 
                hover:bg-white/10 hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed
                ${isLightBackground ? 'text-white' : 'text-white'}
              `}
              title="Regenerate"
            >
              <Icon name={isRegenerating ? 'hourglass' : 'refresh'} size={16} />
            </button>
          )}
          
          {/* Copy button */}
          {!isLoading && !error && result && onCopyClick && (
            <button
              onClick={onCopyClick}
              className={`
                w-5 h-5 flex items-center justify-center text-xs rounded-lg border-none 
                bg-transparent opacity-60 cursor-pointer transition-all duration-200 
                hover:bg-white/10 hover:opacity-100
                ${isLightBackground ? 'text-white' : 'text-white'}
              `}
              title="Copy to clipboard"
            >
              <Icon name={copySuccess ? 'check' : 'clipboard'} size={16} />
            </button>
          )}
          
          {/* Speaker button - for summarizer, image analysis, text improvements, dictionary, and dictation */}
          {!isLoading && !error && result && (action?.startsWith('summarize-') || action?.startsWith('image-') || action?.startsWith('improve-') || action?.startsWith('dictionary-') || action === 'dictation') && ttsConfig?.enabled && onSpeakerClick && (
            <button
              onClick={onSpeakerClick}
              disabled={false}
              className={`
                w-5 h-5 flex items-center justify-center text-xs rounded-lg border-none 
                bg-transparent opacity-60 cursor-pointer transition-all duration-200 
                hover:bg-white/10 hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed
                ${isLightBackground ? 'text-white' : 'text-white'}
              `}
              title={isTTSGenerating ? 'Cancel TTS generation' : isSpeaking ? 'Stop speaking' : 'Speak text'}
            >
              <Icon name={isTTSGenerating ? 'hourglass' : isSpeaking ? 'pause' : 'speaker'} size={16} />
            </button>
          )}
        </div>
        
        {/* Close button */}
        <button
          onClick={onClose}
          className={`
            w-5 h-5 flex items-center justify-center text-xs rounded-xl border-none 
            bg-transparent opacity-60 cursor-pointer transition-all duration-200 
            hover:bg-white/10 hover:opacity-100
            ${isLightBackground ? 'text-white' : 'text-white'}
          `}
        ><Icon name="close" size={16} /></button>
      </div>
      
      {/* Error display */}
      {error && !isLoading && (
        <div className={`text-[13px] leading-6 text-[#ff6b6b]`}>
          {error}
        </div>
      )}
      
      {/* Show loading/blinking state when waiting for first chunk */}
      {isLoading && !result && !error && (
        <div className="flex items-center gap-2 py-3">
          <span className="animate-pulse text-white/70 text-xs">●</span>
          <span className={`text-[13px] opacity-70 animate-pulse ${isLightBackground ? 'text-white' : 'text-white'}`}>
            Generating...
          </span>
        </div>
      )}
      
      {/* Show result with streaming indicator */}
      {result && (
        <div 
          ref={contentRef}
          className="custom-scrollbar"
          style={{ 
            maxHeight: '400px', 
            overflowY: 'auto' 
          }}
        >
          <StreamingContainer autoActivate speed="fast">
            <div>
              <div className={`text-[13px] leading-6 whitespace-pre-wrap opacity-90 ${isLightBackground ? 'text-white' : 'text-white'}`}>
                <StreamingText 
                  text={result}
                  wordsPerSecond={40}
                  showCursor={false}
                  disabled={false}
                />
              </div>
              {/* Show streaming indicator while loading */}
              {isLoading && (
                <div className="flex items-center gap-1 mt-2 text-white/50">
                  <span className="animate-pulse text-xs">●</span>
                  <span className="text-[11px]">streaming...</span>
                </div>
              )}
            </div>
          </StreamingContainer>
        </div>
      )}
    </div>
  );
});

ToolbarResultPanel.displayName = 'ToolbarResultPanel';

export default ToolbarResultPanel;
