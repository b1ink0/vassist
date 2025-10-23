/**
 * AppContext
 * Centralized application state management
 */

import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import ChatManager from '../managers/ChatManager';
import { AIServiceProxy, TTSServiceProxy, StorageServiceProxy } from '../services/proxies';
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
  // ASSISTANT INITIALIZATION
  // ========================================
  
  // Load general config on mount
  useEffect(() => {
    const loadGeneralConfig = async () => {
      try {
        const generalConfig = await StorageServiceProxy.configLoad('generalConfig', { enableModelLoading: true });
        console.log('[AppContext] Config loaded - model loading enabled:', generalConfig.enableModelLoading);
        setEnableModelLoading(generalConfig.enableModelLoading);
      } catch (error) {
        console.error('[AppContext] Failed to load general config:', error);
        setEnableModelLoading(true);
      }
    };
    
    loadGeneralConfig();
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

  // Poll TTS playback state for non-voice mode
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isVoiceMode) {
        const isPlaying = TTSServiceProxy.isCurrentlyPlaying();
        setIsSpeaking(isPlaying);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isVoiceMode]);

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
    
    // Clear messages
    ChatManager.clearMessages();
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
      
      // Set messages
      ChatManager.setMessages(fullChat.messages);
      setChatMessages(fullChat.messages);
      
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
          messages: chatMessages,
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

    // Chat actions
    toggleChat,
    openChat,
    closeChat,
    clearChat,
    stopGeneration,
    loadChatFromHistory,
    updateChatMessages,

    // Drag actions
    startButtonDrag,
    endButtonDrag,
    startModelDrag,
    endModelDrag,
    updateButtonPosition,

    // Panel actions
    toggleSettingsPanel,
    toggleHistoryPanel,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
