/**
 * AppContext
 * Centralized application state management
 */

import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import ChatService from '../services/ChatService';
import { 
  AIServiceProxy, 
  TTSServiceProxy, 
  StorageServiceProxy, 
  SummarizerServiceProxy, 
  TranslatorServiceProxy, 
  LanguageDetectorServiceProxy 
} from '../services/proxies';
import VoiceConversationService, { ConversationStates } from '../services/VoiceConversationService';
import chatHistoryService from '../services/ChatHistoryService';

const AppContext = createContext(null);

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
};

export const AppProvider = ({ children }) => {
  // ========================================
  // ASSISTANT STATE
  // ========================================
  const [isAssistantReady, setIsAssistantReady] = useState(false);
  const [isChatUIReady, setIsChatUIReady] = useState(false);
  const [enableModelLoading, setEnableModelLoading] = useState(null);
  const assistantRef = useRef(null);
  const sceneRef = useRef(null);
  const positionManagerRef = useRef(null);

  // ========================================
  // CONFIG STATE
  // ========================================
  const [uiConfig, setUIConfig] = useState(null);
  const [aiConfig, setAIConfig] = useState(null);

  // ========================================
  // CHAT UI STATE
  // ========================================
  const [isChatInputVisible, setIsChatInputVisible] = useState(false);
  const [isChatContainerVisible, setIsChatContainerVisible] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [isTempChat, setIsTempChat] = useState(false);
  const [pendingDropData, setPendingDropData] = useState(null);

  // ========================================
  // VOICE & TTS STATE
  // ========================================
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // ========================================
  // PANEL STATE
  // ========================================
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [isHistoryPanelOpen, setIsHistoryPanelOpen] = useState(false);

  // ========================================
  // MESSAGE PLAYBACK STATE
  // ========================================
  const [playingMessageIndex, setPlayingMessageIndex] = useState(null);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(null);

  // ========================================
  // DRAG STATE
  // ========================================
  const [isDraggingButton, setIsDraggingButton] = useState(false);
  const [isDraggingModel, setIsDraggingModel] = useState(false);
  const [isDragOverChat, setIsDragOverChat] = useState(false);

  // ========================================
  // POSITION STATE (for chat-only mode)
  // ========================================
  const [buttonPosition, setButtonPosition] = useState({ x: -100, y: -100 });
  
  // ========================================
  // MODEL OVERLAY STATE
  // ========================================
  const [modelOverlayPos, setModelOverlayPos] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [showModelLoadingOverlay, setShowModelLoadingOverlay] = useState(false);
  
  // ========================================
  // SAVED MODEL POSITION (for tab visibility unmount/remount)
  // ========================================
  const [savedModelPosition, setSavedModelPosition] = useState(null);

  // ========================================
  // ASSISTANT INITIALIZATION
  // ========================================
  
  // Load configs on mount
  useEffect(() => {
    const loadConfigs = async () => {
      try {
        // Load UI config
        const loadedUIConfig = await StorageServiceProxy.configLoad('uiConfig', { enableModelLoading: true, enableAIToolbar: true });
        console.log('[AppContext] UI Config loaded:', loadedUIConfig);
        setUIConfig(loadedUIConfig);
        setEnableModelLoading(loadedUIConfig.enableModelLoading);
        
        // Load AI config
        const loadedAIConfig = await StorageServiceProxy.configLoad('aiConfig', {});
        console.log('[AppContext] AI Config loaded:', loadedAIConfig);
        setAIConfig(loadedAIConfig);
        
        // Configure services (only if provider is set)
        try {
          if (loadedAIConfig.provider) {
            await AIServiceProxy.configure(loadedAIConfig);
            console.log('[AppContext] AI Service configured');
          } else {
            console.log('[AppContext] Skipping AI Service configuration - no provider set');
          }
          
          // Configure AI Features services if enabled (only if we have a provider)
          if (loadedAIConfig.provider) {
            if (loadedAIConfig.aiFeatures?.translator?.enabled !== false) {
              await TranslatorServiceProxy.configure(loadedAIConfig);
              console.log('[AppContext] Translator Service configured');
            }
            if (loadedAIConfig.aiFeatures?.languageDetector?.enabled !== false) {
              await LanguageDetectorServiceProxy.configure(loadedAIConfig);
              console.log('[AppContext] Language Detector Service configured');
            }
            if (loadedAIConfig.aiFeatures?.summarizer?.enabled !== false) {
              await SummarizerServiceProxy.configure(loadedAIConfig);
              console.log('[AppContext] Summarizer Service configured');
            }
          }
        } catch (error) {
          console.warn('[AppContext] Failed to configure services:', error);
        }
      } catch (error) {
        console.error('[AppContext] Failed to load configs:', error);
        setEnableModelLoading(true);
      }
    };
    
    loadConfigs();
    
    // Listen for config changes (when saved in ConfigContext)
    const handleConfigChange = async (event) => {
      if (event.detail?.type === 'aiConfig') {
        const updatedConfig = event.detail.config;
        console.log('[AppContext] AI Config updated from settings:', updatedConfig);
        setAIConfig(updatedConfig);
      } else if (event.detail?.type === 'uiConfig') {
        const updatedConfig = event.detail.config;
        console.log('[AppContext] UI Config updated from settings:', updatedConfig);
        setUIConfig(updatedConfig);
        setEnableModelLoading(updatedConfig.enableModelLoading);
      }
    };
    
    window.addEventListener('vassist-config-updated', handleConfigChange);
    
    return () => {
      window.removeEventListener('vassist-config-updated', handleConfigChange);
    };
  }, []);

  // Set assistant ready if model is disabled
  useEffect(() => {
    if (enableModelLoading === false) {
      const timer = setTimeout(() => {
        setIsAssistantReady(true);
        setIsChatUIReady(true);
        console.log('[AppContext] Running in chat-only mode (no 3D model)');
      }, 800);
      
      return () => clearTimeout(timer);
    }
  }, [enableModelLoading]);

  /**
   * Handle assistant ready callback
   */
  // eslint-disable-next-line no-unused-vars
  const handleAssistantReady = useCallback(({ animationManager, positionManager, scene }) => {
    console.log('[AppContext] VirtualAssistant ready!');
    setIsAssistantReady(true);
    setIsChatUIReady(true);
    
    positionManagerRef.current = positionManager;
    sceneRef.current = scene;
    
    console.log('[AppContext] Position manager ref set, ready for position tracking');
  }, []);

  // ========================================
  // VOICE & TTS TRACKING
  // ========================================

  // Track voice conversation state
  useEffect(() => {
    const handleStateChange = (state) => {
      setIsSpeaking(state === ConversationStates.SPEAKING);
    };

    VoiceConversationService.setStateChangeCallback(handleStateChange);

    return () => {
      VoiceConversationService.setStateChangeCallback(null);
    };
  }, []);

  // Register TTS callbacks for centralized playback state
  useEffect(() => {
    // Only poll when NOT in voice mode
    if (isVoiceMode) return;
    
    const interval = setInterval(() => {
      const isPlaying = TTSServiceProxy.isCurrentlyPlaying();
      setIsSpeaking(prev => {
        // Only update state if value actually changed to prevent unnecessary re-renders
        if (prev !== isPlaying) {
          return isPlaying;
        }
        return prev;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isVoiceMode]);

  // ========================================
  // AI TOOLBAR ACTIONS
  // ========================================

  /**
   * Summarize text using configured AI service
   */
  const handleSummarize = useCallback(async (text) => {
    // Check if explicitly disabled (undefined/null means enabled by default)
    if (aiConfig?.aiFeatures?.summarizer?.enabled === false) {
      throw new Error('Summarizer is disabled in settings');
    }
    
    const options = {
      type: aiConfig?.aiFeatures?.summarizer?.defaultType || 'tldr',
      format: aiConfig?.aiFeatures?.summarizer?.defaultFormat || 'plain-text',
      length: aiConfig?.aiFeatures?.summarizer?.defaultLength || 'medium',
    };
    
    return await SummarizerServiceProxy.summarize(text, options);
  }, [aiConfig]);

  /**
   * Translate text using configured AI service
   */
  const handleTranslate = useCallback(async (text, sourceLanguage, targetLanguageOverride) => {
    // Check if explicitly disabled (undefined/null means enabled by default)
    if (aiConfig?.aiFeatures?.translator?.enabled === false) {
      throw new Error('Translator is disabled in settings');
    }
    
    const targetLanguage = targetLanguageOverride || aiConfig?.aiFeatures?.translator?.defaultTargetLanguage || 'en';
    
    // Auto-detect source language if not provided
    let sourceLang = sourceLanguage;
    if (!sourceLang) {
      try {
        const detectionResults = await LanguageDetectorServiceProxy.detect(text);
        if (detectionResults && detectionResults.length > 0) {
          sourceLang = detectionResults[0].detectedLanguage;
        }
      } catch (err) {
        console.warn('[AppContext] Language detection failed:', err);
        throw new Error('Could not detect source language');
      }
    }
    
    // Don't translate if source and target are the same
    if (sourceLang === targetLanguage) {
      return text;
    }
    
    return await TranslatorServiceProxy.translate(text, sourceLang, targetLanguage);
  }, [aiConfig]);

  /**
   * Add content to chat (using existing drag-drop flow)
   */
  const handleAddToChat = useCallback((data) => {
    console.log('[AppContext] Add to chat:', data);
    
    // Open chat if closed
    if (!isChatContainerVisible || !isChatInputVisible) {
      setPendingDropData(data);
      setIsChatInputVisible(true);
      setIsChatContainerVisible(true);
    } else {
      // Dispatch event for ChatInput to handle
      const event = new CustomEvent('chatDragDrop', { 
        detail: data,
        bubbles: true,
        composed: true,
      });
      window.dispatchEvent(event);
    }
  }, [isChatContainerVisible, isChatInputVisible]);

  // ========================================
  // CHAT ACTIONS
  // ========================================

  /**
   * Toggle chat visibility
   */
  const toggleChat = useCallback(() => {
    console.log('[AppContext] Toggle chat');
    
    if (isChatContainerVisible || isChatInputVisible) {
      setIsChatInputVisible(false);
      setIsChatContainerVisible(false);
      TTSServiceProxy.stopPlayback();
    } else {
      setIsChatInputVisible(true);
      setIsChatContainerVisible(true);
    }
  }, [isChatContainerVisible, isChatInputVisible]);

  /**
   * Open chat (without toggle)
   */
  const openChat = useCallback(() => {
    console.log('[AppContext] Open chat');
    setIsChatInputVisible(true);
    setIsChatContainerVisible(true);
  }, []);

  /**
   * Close chat
   */
  const closeChat = useCallback(() => {
    console.log('[AppContext] Close chat');
    setIsChatInputVisible(false);
    setIsChatContainerVisible(false);
    TTSServiceProxy.stopPlayback();
  }, []);

  /**
   * Clear chat
   */
  const clearChat = useCallback(async () => {
    console.log('[AppContext] Clear chat');
    
    // If temp, delete from history
    if (isTempChat && currentChatId) {
      try {
        await chatHistoryService.deleteChat(currentChatId);
        console.log('[AppContext] Temp chat deleted:', currentChatId);
      } catch (error) {
        console.error('[AppContext] Failed to delete temp chat:', error);
      }
    }
    
    // Stop AI generation
    AIServiceProxy.abortRequest();
    
    // Stop TTS
    TTSServiceProxy.stopPlayback();
    
    // Return assistant to idle
    if (assistantRef.current?.isReady()) {
      assistantRef.current.idle();
    }
    
    // Clear messages and tree
    ChatService.clearMessages();
    setChatMessages([]);
    
    // Reset state
    setIsProcessing(false);
    setCurrentChatId(null);
    setIsTempChat(false);
  }, [isTempChat, currentChatId]);

  /**
   * Stop generation/TTS
   */
  const stopGeneration = useCallback(() => {
    console.log('[AppContext] Stop generation');
    
    AIServiceProxy.abortRequest();
    TTSServiceProxy.stopPlayback();
    
    if (isVoiceMode) {
      VoiceConversationService.interrupt();
    }
    
    if (assistantRef.current?.isReady()) {
      assistantRef.current.idle();
    }
    
    setIsProcessing(false);
  }, [isVoiceMode]);

  /**
   * Load chat from history
   */
  const loadChatFromHistory = useCallback(async (chatData) => {
    console.log('[AppContext] Loading chat from history:', chatData.chatId);
    
    try {
      // Stop ongoing operations
      AIServiceProxy.abortRequest();
      TTSServiceProxy.stopPlayback();
      
      // Load full chat
      const fullChat = await chatHistoryService.loadChat(chatData.chatId);
      
      // Load tree if available, otherwise set flat messages
      if (fullChat.chatServiceData) {
        ChatService.importTree(fullChat.chatServiceData);
        const messages = ChatService.getMessages();
        setChatMessages(messages);
        console.log('[AppContext] Loaded chat with tree structure');
      } else if (fullChat.messages) {
        // Backward compatibility: set flat messages
        ChatService.setMessages(fullChat.messages);
        setChatMessages(fullChat.messages);
        console.log('[AppContext] Loaded flat messages');
      }
      
      // Set current chat ID
      setCurrentChatId(fullChat.chatId);
      setIsTempChat(false);
      
      // Mark as not temp
      await chatHistoryService.markAsTempChat(fullChat.chatId, false);
      
      // Make sure chat UI is visible
      if (!isChatContainerVisible) {
        setIsChatContainerVisible(true);
        setIsChatInputVisible(true);
      }
      
      // Reset processing state
      setIsProcessing(false);
      
      console.log('[AppContext] Chat loaded successfully');
    } catch (error) {
      console.error('[AppContext] Failed to load chat:', error);
    }
  }, [isChatContainerVisible]);

  /**
   * Update chat messages (typically called by ChatController)
   */
  const updateChatMessages = useCallback((messages) => {
    setChatMessages(messages);
  }, []);

  // Callback refs for streaming regeneration (populated by ChatController)
  const regenerateWithStreamingRef = useRef(null);
  const editWithStreamingRef = useRef(null);

  /**
   * Edit a user message (creates new branch, regenerates AI response with streaming)
   */
  const editUserMessage = useCallback(async (messageId, newContent, newImages = null, newAudios = null) => {
    console.log('[AppContext] Editing user message:', messageId);
    
    try {
      // Edit in tree (creates new branch)
      const newMessageId = ChatService.editMessage(messageId, newContent, newImages, newAudios);
      
      // Update UI with new active path (without AI response yet)
      const updatedMessages = ChatService.getMessages();
      setChatMessages(updatedMessages);
      
      // Use streaming regeneration if available
      if (editWithStreamingRef.current) {
        await editWithStreamingRef.current(newMessageId);
      } else {
        console.warn('[AppContext] Streaming handler not available, using fallback');
        // Fallback to non-streaming
        const conversationContext = updatedMessages.slice(0, updatedMessages.findIndex(m => m.id === newMessageId) + 1);
        const aiResponse = await AIServiceProxy.sendMessage(conversationContext);
        
        if (aiResponse?.success && aiResponse?.response) {
          ChatService.addMessage('assistant', aiResponse.response, null, null);
          setChatMessages(ChatService.getMessages());
        }
      }
      
      return newMessageId;
    } catch (error) {
      console.error('[AppContext] Failed to edit message:', error);
      setIsProcessing(false);
      throw error;
    }
  }, []);

  /**
   * Regenerate AI response
   */
  const regenerateAIMessage = useCallback(async (messageId) => {
    console.log('[AppContext] Regenerating AI message:', messageId);
    
    try {
      // Create regeneration point (removes this AI message and everything after)
      ChatService.createRegenerationBranch(messageId);
      
      // Update UI (show conversation up to parent)
      const updatedMessages = ChatService.getMessages();
      setChatMessages(updatedMessages);
      
      // Use streaming regeneration if available
      if (regenerateWithStreamingRef.current) {
        await regenerateWithStreamingRef.current();
      } else {
        console.warn('[AppContext] Streaming handler not available, using fallback');
        // Fallback to non-streaming
        setIsProcessing(true);
        const aiResponse = await AIServiceProxy.sendMessage(updatedMessages);
        
        if (aiResponse?.success && aiResponse?.response) {
          ChatService.addMessage('assistant', aiResponse.response, null, null);
          setChatMessages(ChatService.getMessages());
        }
        setIsProcessing(false);
      }
    } catch (error) {
      console.error('[AppContext] Failed to regenerate message:', error);
      setIsProcessing(false);
      throw error;
    }
  }, []);

  /**
   * Switch to a different branch
   */
  const switchToBranch = useCallback((parentId, branchIndex) => {
    console.log('[AppContext] Switching to branch:', branchIndex, 'at parent:', parentId);
    
    try {
      ChatService.switchBranch(parentId, branchIndex);
      
      // Update UI
      const updatedMessages = ChatService.getMessages();
      setChatMessages(updatedMessages);
      
      console.log('[AppContext] Branch switched successfully');
    } catch (error) {
      console.error('[AppContext] Failed to switch branch:', error);
      throw error;
    }
  }, []);

  /**
   * Navigate to previous branch
   */
  const previousBranch = useCallback((messageId) => {
    console.log('[AppContext] Navigating to previous branch');
    
    try {
      ChatService.previousBranch(messageId);
      
      // Update UI
      const updatedMessages = ChatService.getMessages();
      setChatMessages(updatedMessages);
    } catch (error) {
      console.error('[AppContext] Failed to navigate to previous branch:', error);
    }
  }, []);

  /**
   * Navigate to next branch
   */
  const nextBranch = useCallback((messageId) => {
    console.log('[AppContext] Navigating to next branch');
    
    try {
      ChatService.nextBranch(messageId);
      
      // Update UI
      const updatedMessages = ChatService.getMessages();
      setChatMessages(updatedMessages);
    } catch (error) {
      console.error('[AppContext] Failed to navigate to next branch:', error);
    }
  }, []);

  // ========================================
  // DRAG ACTIONS
  // ========================================

  /**
   * Handle button drag start
   */
  const startButtonDrag = useCallback(() => {
    setIsDraggingButton(true);
  }, []);

  /**
   * Handle button drag end
   */
  const endButtonDrag = useCallback(() => {
    setIsDraggingButton(false);
  }, []);

  /**
   * Handle model drag start
   */
  const startModelDrag = useCallback(() => {
    setIsDraggingModel(true);
  }, []);

  /**
   * Handle model drag end
   */
  const endModelDrag = useCallback(() => {
    setIsDraggingModel(false);
  }, []);

  /**
   * Update button position
   */
  const updateButtonPosition = useCallback((pos) => {
    setButtonPosition(pos);
  }, []);

  // ========================================
  // PANEL ACTIONS
  // ========================================

  /**
   * Toggle settings panel
   */
  const toggleSettingsPanel = useCallback(() => {
    setIsSettingsPanelOpen(prev => !prev);
  }, []);

  /**
   * Toggle history panel
   */
  const toggleHistoryPanel = useCallback(() => {
    setIsHistoryPanelOpen(prev => !prev);
  }, []);

  // ========================================
  // AUTO-SAVE CHAT
  // ========================================

  useEffect(() => {
    if (chatMessages.length === 0 || isTempChat || isProcessing) {
      return;
    }

    const autoSaveTimer = setTimeout(async () => {
      try {
        if (isTempChat) {
          console.log('[AppContext] Skipping save - temp mode enabled');
          return;
        }

        let chatId = currentChatId;
        if (!chatId) {
          chatId = chatHistoryService.generateChatId();
          setCurrentChatId(chatId);
          console.log('[AppContext] New chat created for auto-save:', chatId);
        }

        const sourceUrl = window.location.href;

        await chatHistoryService.saveChat({
          chatId,
          chatService: ChatService, // NEW: Save tree
          messages: chatMessages, // DEPRECATED: Backward compatibility
          isTemp: false,
          metadata: {
            sourceUrl,
          },
        });

        console.log('[AppContext] Chat auto-saved (debounced):', chatId);
      } catch (error) {
        console.error('[AppContext] Failed to auto-save chat (debounced):', error);
      }
    }, 2000);

    return () => clearTimeout(autoSaveTimer);
  }, [chatMessages, currentChatId, isTempChat, isProcessing]);

  // ========================================
  // CONTEXT VALUE
  // ========================================

  const value = {
    // Assistant state
    isAssistantReady,
    isChatUIReady,
    enableModelLoading,
    assistantRef,
    sceneRef,
    positionManagerRef,
    handleAssistantReady,
    setIsAssistantReady,
    setIsChatUIReady,

    // Chat UI state
    isChatInputVisible,
    isChatContainerVisible,
    chatMessages,
    isProcessing,
    currentChatId,
    isTempChat,
    pendingDropData,
    
    // Chat UI setters
    setIsChatInputVisible,
    setIsChatContainerVisible,
    setChatMessages,
    setIsProcessing,
    setCurrentChatId,
    setIsTempChat,
    setPendingDropData,

    // Voice & TTS state
    isVoiceMode,
    isSpeaking,
    setIsVoiceMode,
    setIsSpeaking,

    // Panel state
    isSettingsPanelOpen,
    isHistoryPanelOpen,
    setIsSettingsPanelOpen,
    setIsHistoryPanelOpen,

    // Message playback state
    playingMessageIndex,
    loadingMessageIndex,
    setPlayingMessageIndex,
    setLoadingMessageIndex,

    // Drag state
    isDraggingButton,
    isDraggingModel,
    isDragOverChat,
    setIsDraggingButton,
    setIsDraggingModel,
    setIsDragOverChat,

    // Position state
    buttonPosition,
    setButtonPosition,

    // Model overlay state
    modelOverlayPos,
    setModelOverlayPos,
    showModelLoadingOverlay,
    setShowModelLoadingOverlay,
    
    // Saved model position (persists across unmount/remount)
    savedModelPosition,
    setSavedModelPosition,

    // Chat actions
    toggleChat,
    openChat,
    closeChat,
    clearChat,
    stopGeneration,
    loadChatFromHistory,
    updateChatMessages,

    // Message branching actions
    editUserMessage,
    regenerateAIMessage,
    switchToBranch,
    previousBranch,
    nextBranch,
    
    // Branching callback refs (for ChatController to populate)
    regenerateWithStreamingRef,
    editWithStreamingRef,

    // Drag actions
    startButtonDrag,
    endButtonDrag,
    startModelDrag,
    endModelDrag,
    updateButtonPosition,

    // Panel actions
    toggleSettingsPanel,
    toggleHistoryPanel,

    // AI Toolbar actions
    handleSummarize,
    handleTranslate,
    handleAddToChat,

    // Config state
    uiConfig,
    aiConfig,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
