/**
 * ToolbarResultPanel Component
 * 
 * Result panel for AI Toolbar that displays:
 * - Action results (summary, translation, image analysis)
 * - Error messages
 * - Action controls (regenerate, copy, speak, language selector)
 * - Streaming indicator
 */

import { forwardRef } from 'react';
import { TranslationLanguages } from '../../config/aiConfig';

const ToolbarResultPanel = forwardRef(({
  result,
  error,
  isLoading,
  action,
  position,
  isLightBackground = false,
  detectedLanguageName = null,
  selectedTargetLanguage = null,
  onTargetLanguageChange,
  aiConfig,
  isRegenerating = false,
  onRegenerateClick,
  copySuccess = false,
  onCopyClick,
  isSpeaking = false,
  onSpeakerClick,
  ttsConfig,
  onClose,
}, ref) => {

  // Get action title with icon
  const getActionTitle = () => {
    if (action?.startsWith('summarize-')) return '📝 Summary';
    if (action === 'translate') return '🌐 Translation';
    if (action === 'detect-language') return '🔍 Language Detection';
    if (action === 'dictation') return '🎤 Dictation';
    if (action === 'image-describe') return '🖼️ Description';
    if (action === 'image-extract-text') return '📄 Extracted Text';
    if (action === 'image-identify-objects') return '🏷️ Objects';
    if (action === 'dictionary-define') return '📖 Definition';
    if (action === 'dictionary-synonyms') return '🔄 Synonyms';
    if (action === 'dictionary-antonyms') return '↔️ Antonyms';
    if (action === 'dictionary-pronunciation') return '🔊 Pronunciation';
    if (action === 'dictionary-examples') return '💡 Examples';
    if (action === 'improve-grammar') return '✓ Grammar';
    if (action === 'improve-spelling') return '✓ Spelling';
    if (action === 'improve-professional') return '💼 Professional';
    if (action === 'improve-formal') return '🎩 Formal';
    if (action === 'improve-simplify') return '📖 Simplified';
    if (action === 'improve-expand') return '📝 Expanded';
    if (action === 'improve-concise') return '⚡ Concise';
    return '❓ Result';
  };

  return (
    <div
      ref={ref}
      data-ai-toolbar-result="true"
      className={`
        fixed top-0 left-0 w-[380px] p-3 rounded-xl 
        border shadow-[0_4px_20px_rgba(0,0,0,0.25)] backdrop-blur-xl 
        will-change-transform transition-all duration-300 ease-in-out
        glass-container ${isLightBackground ? 'glass-container-dark' : ''}
      `}
      style={{
        transform: `translate(${position.x}px, ${position.y + 48}px)`,
        zIndex: 999999,
      }}
    >
      {/* Header with title and controls */}
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2 flex-1">
          {/* Action title */}
          <div className={`text-[11px] font-semibold uppercase opacity-70 ${isLightBackground ? 'text-white' : 'text-white'}`}>
            {getActionTitle()}
          </div>
          
          {/* Show detected source language for translation with arrow to target (only when not loading) */}
          {action === 'translate' && detectedLanguageName && !isLoading && (
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-white/90 font-medium">
                {detectedLanguageName}
              </span>
              <span className="text-white/60">→</span>
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
              {isRegenerating ? '⏳' : '🔄'}
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
              {copySuccess ? '✓' : '📋'}
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
              title={isSpeaking ? 'Pause speaking' : 'Speak text'}
            >
              {isSpeaking ? '⏸️' : '🔊'}
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
          <div className={`text-[13px] leading-6 whitespace-pre-wrap opacity-90 ${isLightBackground ? 'text-white' : 'text-white'}`}>
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
  );
});

ToolbarResultPanel.displayName = 'ToolbarResultPanel';

export default ToolbarResultPanel;
