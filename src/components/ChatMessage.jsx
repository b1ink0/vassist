/**
 * @fileoverview Individual chat message component with editing, TTS, and multimedia attachment support.
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { Icon } from './icons';;
import { TTSServiceProxy } from '../services/proxies';
import AudioPlayer from './AudioPlayer';
import StreamingText from './common/StreamingText';
import MarkdownText from './common/MarkdownText';
import StreamingContainer from './common/StreamingContainer';
import Logger from '../services/LoggerService';

/**
 * Chat message component with editing, streaming, and multimedia features.
 * 
 * @component
 * @param {Object} props - Component props
 * @param {Object} props.message - Message object
 * @param {number} props.messageIndex - Index of message
 * @param {boolean} props.isLightBackground - Whether background is light
 * @param {boolean} props.ttsEnabled - Whether TTS is enabled
 * @param {number} props.playingMessageIndex - Index of currently playing message
 * @param {number} props.loadingMessageIndex - Index of loading message
 * @param {number} props.copiedMessageIndex - Index of copied message
 * @param {Object} props.streamedMessageIdsRef - Ref to streamed message IDs
 * @param {Object} props.completedMessageIdsRef - Ref to completed message IDs
 * @param {boolean} props.shouldForceComplete - Whether to force complete streaming
 * @param {Object} props.currentSessionRef - Ref to current session
 * @param {boolean} props.smoothStreamingAnimation - Whether to use smooth streaming
 * @param {boolean} props.shouldAnimate - Whether message should animate
 * @param {Function} props.onCopyMessage - Callback to copy message
 * @param {Function} props.onPlayTTS - Callback to play TTS
 * @param {Function} props.onEditUserMessage - Callback to edit user message
 * @param {Function} props.onRewriteMessage - Callback to rewrite message
 * @param {Function} props.onPreviousBranch - Callback for previous branch
 * @param {Function} props.onNextBranch - Callback for next branch
 * @param {Function} props.setLoadingMessageIndex - Setter for loading message index
 * @param {Function} props.setPlayingMessageIndex - Setter for playing message index
 * @returns {JSX.Element} Chat message component
 */
const ChatMessage = ({
  message,
  messageIndex,
  isLightBackground,
  ttsEnabled,
  playingMessageIndex,
  loadingMessageIndex,
  copiedMessageIndex,
  streamedMessageIdsRef,
  completedMessageIdsRef,
  shouldForceComplete,
  currentSessionRef,
  smoothStreamingAnimation = false,
  shouldAnimate = false, // Only animate if this is the latest message
  onCopyMessage,
  onPlayTTS,
  onEditUserMessage,
  onRewriteMessage,
  onPreviousBranch,
  onNextBranch,
  setLoadingMessageIndex,
  setPlayingMessageIndex,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editingContent, setEditingContent] = useState('');
  const [editingImages, setEditingImages] = useState([]);
  const [editingAudios, setEditingAudios] = useState([]);
  const editTextareaRef = useRef(null);

  const isUser = message.role === 'user';
  const isError = message.content.toLowerCase().startsWith('error:');
  const isPlaying = playingMessageIndex === messageIndex;
  const isLoading = loadingMessageIndex === messageIndex;
  const hasAudio = isUser && message.audios && message.audios.length > 0;

  const wasStreamedInSession = streamedMessageIdsRef.current.has(message.id);
  
  const hasCompletedStreaming = completedMessageIdsRef.current.has(message.id);
  
  const shouldDisableStreaming = !isUser && !isError && (!wasStreamedInSession || hasCompletedStreaming);
  
  const shouldForceCompleteThis = shouldForceComplete && !isUser && !isError;

  const animationClass = shouldAnimate 
    ? (isUser ? 'animate-slide-right-up' : 'animate-slide-left-up')
    : '';

  /**
   * Handles streaming completion by adding message to permanent completion tracker.
   */
  const handleStreamingComplete = useCallback(() => {
    completedMessageIdsRef.current.add(message.id);
  }, [message.id, completedMessageIdsRef]);

  /**
   * Starts editing this message.
   */
  const handleStartEdit = useCallback(() => {
    if (message?.id && message?.role === 'user') {
      Logger.log('ChatMessage', 'Starting edit for message:', message.id);
      setIsEditing(true);
      setEditingContent(message.content);
      setEditingImages(message.images || []);
      setEditingAudios(message.audios || []);
    }
  }, [message]);

  /**
   * Saves edited message.
   */
  const handleSaveEdit = useCallback(async () => {
    if (!editingContent.trim() && editingImages.length === 0 && editingAudios.length === 0) {
      setIsEditing(false);
      setEditingContent('');
      setEditingImages([]);
      setEditingAudios([]);
      return;
    }

    try {
      Logger.log('ChatMessage', 'Saving edited message:', message.id);
      await onEditUserMessage(message.id, editingContent.trim(), editingImages, editingAudios);
      setIsEditing(false);
      setEditingContent('');
      setEditingImages([]);
      setEditingAudios([]);
    } catch (error) {
      Logger.error('ChatMessage', 'Failed to save edit:', error);
    }
  }, [message.id, editingContent, editingImages, editingAudios, onEditUserMessage]);

  /**
   * Cancels editing mode.
   */
  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditingContent('');
    setEditingImages([]);
    setEditingAudios([]);
  }, []);

  /**
   * Auto-resizes edit textarea based on content.
   */
  const adjustEditTextareaHeight = useCallback(() => {
    const textarea = editTextareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, 300);
      textarea.style.height = `${newHeight}px`;
    }
  }, []);

  /**
   * Handles edit textarea content change.
   * 
   * @param {Event} e - Change event
   */
  const handleEditContentChange = useCallback((e) => {
    setEditingContent(e.target.value);
    setTimeout(() => adjustEditTextareaHeight(), 0);
  }, [adjustEditTextareaHeight]);

  /**
   * Removes image from editing attachments.
   * 
   * @param {number} index - Index of image to remove
   */
  const handleRemoveEditingImage = useCallback((index) => {
    setEditingImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  /**
   * Removes audio from editing attachments.
   * 
   * @param {number} index - Index of audio to remove
   */
  const handleRemoveEditingAudio = useCallback((index) => {
    setEditingAudios(prev => prev.filter((_, i) => i !== index));
  }, []);

  useEffect(() => {
    if (isEditing && editTextareaRef.current) {
      editTextareaRef.current.focus();
      editTextareaRef.current.selectionStart = editTextareaRef.current.value.length;
      adjustEditTextareaHeight();
    }
  }, [isEditing, adjustEditTextareaHeight]);

  return (
    <div className={`flex flex-col gap-3 ${animationClass}`}>
      <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`flex items-start gap-2 ${
          isEditing 
            ? 'w-full' 
            : hasAudio 
            ? 'w-[80%]' 
            : 'max-w-[80%]'
        }`}>
          {/* Message bubble */}
          <div className="flex flex-col gap-1.5" style={{ width: (!isUser || isEditing) ? '100%' : 'auto' }}>
            <div
              className={`${
                isError
                  ? 'glass-error'
                  : isUser
                  ? `glass-message-user ${isLightBackground ? 'glass-message-user-dark' : ''}`
                  : `glass-message ${isLightBackground ? 'glass-message-dark' : ''}`
              } px-4 py-3 ${
                isError
                  ? 'rounded-3xl'
                  : isUser
                  ? 'rounded-[20px] rounded-tr-md'
                  : 'rounded-[20px] rounded-tl-md'
              } ${hasAudio || isEditing ? 'w-full' : ''} break-words`}
              style={{
                minHeight: !isUser && !isError ? 'calc(1.5em + 1.5rem)' : undefined,
              }}
            >
          {isUser && message.images && message.images.length > 0 && !isEditing && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {message.images.map((imgUrl, imgIndex) => (
                    <img 
                      key={imgIndex}
                      src={imgUrl}
                      alt={`Attachment ${imgIndex + 1}`}
                      className="max-w-[200px] max-h-[200px] object-contain rounded-lg border-2 border-white/30 cursor-pointer hover:border-blue-400/50 transition-all"
                      onClick={() => window.open(imgUrl, '_blank')}
                      title="Click to view full size"
                    />
                  ))}
                </div>
              )}
              
              {isUser && message.audios && message.audios.length > 0 && !isEditing && (
                <div className="mb-3 space-y-2">
                  {message.audios.map((audioUrl, audioIndex) => (
                    <div key={audioIndex} className="w-full">
                      <AudioPlayer 
                        audioUrl={audioUrl} 
                        isLightBackground={isLightBackground}
                      />
                    </div>
                  ))}
                </div>
              )}
              
              {isEditing ? (
                <div className="relative space-y-2">
                  {editingImages.length > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                      {editingImages.map((img, imgIndex) => (
                        <div key={imgIndex} className="relative group">
                          <img 
                            src={img} 
                            alt={`Edit ${imgIndex + 1}`}
                            className="w-full rounded-lg max-h-[150px] object-cover"
                          />
                          <button
                            onClick={() => handleRemoveEditingImage(imgIndex)}
                            className="absolute top-1 right-1 glass-button w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Remove image"
                          >
                            <span className="text-[11px]"><Icon name="xmark" size={16} /></span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {editingAudios.length > 0 && (
                    <div className="space-y-2">
                      {editingAudios.map((audioUrl, audioIndex) => (
                        <div key={audioIndex} className="relative group">
                          <AudioPlayer 
                            audioUrl={audioUrl} 
                            isLightBackground={isLightBackground}
                          />
                          <button
                            onClick={() => handleRemoveEditingAudio(audioIndex)}
                            className="absolute top-1 right-1 glass-button w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Remove audio"
                          >
                            <span className="text-[11px]"><Icon name="xmark" size={16} /></span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <textarea
                    ref={editTextareaRef}
                    value={editingContent}
                    onChange={handleEditContentChange}
                    className={`w-full max-h-[300px] overflow-y-auto px-3 py-2.5 rounded-lg resize-none text-[15px] leading-relaxed custom-scrollbar bg-transparent border-none min-h-[24px] ${
                      isLightBackground
                        ? 'text-black placeholder-black/40'
                        : 'text-white placeholder-white/40'
                    } focus:outline-none`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.ctrlKey) {
                        handleSaveEdit();
                      } else if (e.key === 'Escape') {
                        handleCancelEdit();
                      }
                    }}
                  />
                  <div className="flex gap-1 justify-end mt-1">
                    <button
                      onClick={handleCancelEdit}
                      className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} w-5 h-5 rounded flex items-center justify-center flex-shrink-0 opacity-60 hover:opacity-100`}
                      title="Cancel (Esc)"
                    >
                      <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-[11px]`}><Icon name="xmark" size={16} /></span>
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      disabled={!editingContent.trim() && editingImages.length === 0 && editingAudios.length === 0}
                      className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} w-5 h-5 rounded flex items-center justify-center flex-shrink-0 opacity-60 hover:opacity-100 disabled:opacity-30`}
                      title="Save (Ctrl+Enter)"
                    >
                      <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-[11px]`}><Icon name="check" size={16} /></span>
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {!isUser && !isError ? (
                    shouldDisableStreaming ? (
                      <div className="text-[15px] leading-relaxed max-w-full overflow-hidden">
                        <MarkdownText text={message.content} />
                      </div>
                    ) : (
                      <StreamingContainer 
                        autoActivate={true}
                        speed="normal"
                        disabled={false}
                      >
                        {hasCompletedStreaming ? (
                          <div className="text-[15px] leading-relaxed max-w-full overflow-hidden">
                            <MarkdownText text={message.content} />
                          </div>
                        ) : (
                          <div className="text-[15px] leading-relaxed whitespace-pre-wrap break-words max-w-full overflow-hidden">
                            <StreamingText 
                              text={message.content}
                              wordsPerSecond={40}
                              showCursor={false}
                              disabled={false}
                              forceComplete={shouldForceCompleteThis}
                              smoothHeightAnimation={smoothStreamingAnimation}
                              onComplete={handleStreamingComplete}
                            />
                          </div>
                        )}
                      </StreamingContainer>
                    )
                  ) : (
                    <div className="text-[15px] leading-relaxed max-w-full overflow-hidden">
                      <MarkdownText text={message.content} />
                    </div>
                  )}
                </>
              )}
            </div>
            
            <div className={`flex items-center gap-1 ${isUser ? 'justify-end' : 'justify-start'} mt-1`}>
              {!isUser && message.branchInfo && message.branchInfo.totalBranches > 1 && !isEditing && (
                <>
                  <button
                    onClick={() => onPreviousBranch(message)}
                    disabled={!message.branchInfo.canGoBack}
                    className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} w-5 h-5 rounded flex items-center justify-center flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity disabled:opacity-20`}
                    title="Previous variant"
                  >
                    <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-[9px]`}>◀</span>
                  </button>
                  <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-[10px] opacity-70`}>
                    {message.branchInfo.currentIndex}/{message.branchInfo.totalBranches}
                  </span>
                  <button
                    onClick={() => onNextBranch(message)}
                    disabled={!message.branchInfo.canGoForward}
                    className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} w-5 h-5 rounded flex items-center justify-center flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity disabled:opacity-20`}
                    title="Next variant"
                  >
                    <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-[9px]`}><Icon name="play" size={16} /></span>
                  </button>
                </>
              )}
              
              {!isUser && !isError && ttsEnabled && (
                <button
                  onClick={() => {
                    if (isLoading) {
                      TTSServiceProxy.stopPlayback();
                      setLoadingMessageIndex(null);
                      setPlayingMessageIndex(null);
                      currentSessionRef.current = null;
                    } else {
                      // Play or stop TTS
                      onPlayTTS(messageIndex, message.content);
                    }
                  }}
                  className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity`}
                  title={isLoading ? 'Cancel TTS generation' : isPlaying ? 'Stop audio' : 'Play audio'}
                >
                  {isLoading ? (
                    <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-[10px] animate-spin`}><Icon name="hourglass" size={16} /></span>
                  ) : isPlaying ? (
                    <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-[10px]`}><Icon name="pause" size={16} /></span>
                  ) : (
                    <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-[10px]`}><Icon name="speaker" size={16} /></span>
                  )}
                </button>
              )}
              
              {!isEditing && (
                <button
                  onClick={() => onCopyMessage(messageIndex, message.content)}
                  className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity`}
                  title="Copy message"
                >
                  <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-[10px]`}>
                    <Icon name={copiedMessageIndex === messageIndex ? 'check' : 'clipboard'} size={12} />
                  </span>
                </button>
              )}
              
              {isUser && !isError && !isEditing && (
                <button
                  onClick={handleStartEdit}
                  className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity`}
                  title="Edit message"
                >
                  <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-[10px]`}><Icon name="edit" size={16} /></span>
                </button>
              )}
              
              {isUser && message.branchInfo && message.branchInfo.totalBranches > 1 && !isEditing && (
                <>
                  <button
                    onClick={() => onPreviousBranch(message)}
                    disabled={!message.branchInfo.canGoBack}
                    className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} w-5 h-5 rounded flex items-center justify-center flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity disabled:opacity-20`}
                    title="Previous variant"
                  >
                    <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-[9px]`}>◀</span>
                  </button>
                  <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-[10px] opacity-70`}>
                    {message.branchInfo.currentIndex}/{message.branchInfo.totalBranches}
                  </span>
                  <button
                    onClick={() => onNextBranch(message)}
                    disabled={!message.branchInfo.canGoForward}
                    className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} w-5 h-5 rounded flex items-center justify-center flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity disabled:opacity-20`}
                    title="Next variant"
                  >
                    <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-[9px]`}><Icon name="play" size={16} /></span>
                  </button>
                </>
              )}
              
              {!isUser && !isError && !isEditing && (
                <button
                  onClick={() => onRewriteMessage(message)}
                  className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity`}
                  title="Regenerate response"
                >
                  <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-[10px]`}><Icon name="regenerate" size={16} /></span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;
