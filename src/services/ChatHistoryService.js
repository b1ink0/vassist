/**
 * Chat History Service
 * 
 * Manages persistent chat history storage and retrieval.
 * Works seamlessly in both dev and extension modes via StorageServiceProxy.
 * 
 * Features:
 * - Save and load chats with message tree structure
 * - Store associated media (images, audio files)
 * - Generate meaningful chat titles using LLM
 * - Search and filter chats
 * - Support for temporary chats (not saved)
 * - Paginated retrieval for infinite scroll
 */

import storageServiceProxy from './proxies/StorageServiceProxy.js';
import AIServiceProxy from './proxies/AIServiceProxy.js';
import ChatService from './ChatService.js';
import Logger from './LoggerService';

class ChatHistoryService {
  constructor() {
    this.cache = {
      chats: new Map(), // Cache for loaded chats
      titles: new Map(), // Cache for generated titles
    };
    this.storageProxy = storageServiceProxy;
    // Use proxy in extension mode, direct service in dev mode
    this.aiService = AIServiceProxy;
    this.MAX_TITLE_CACHE = 100;
  }

  /**
   * Generate a unique chat ID
   */
  generateChatId() {
    return `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Save a chat with all associated data
   * @param {Object} chatData - { chatId, chatService?, messages?, title?, isTemp?, metadata? }
   * @returns {Promise<string>} chatId
   */
  async saveChat(chatData) {
    try {
      const {
        chatId = this.generateChatId(),
        chatService = null,
        messages = [],
        title,
        isTemp = false,
        metadata = {},
      } = chatData;

      // Don't save temporary chats
      if (isTemp) {
        Logger.log('ChatHistoryService', 'Skipping save for temporary chat:', chatId);
        return chatId;
      }

      let finalMessages = [];
      let treeData = null;

      // Handle tree structure
      if (chatService) {
        Logger.log('ChatHistoryService', 'Saving chat with tree structure');
        treeData = chatService.exportTree();
        finalMessages = chatService.getMessages(); // For title generation and backward compatibility
      } else {
        // Backward compatibility: flat array
        Logger.log('ChatHistoryService', 'Saving chat with flat messages (backward compatibility)');
        finalMessages = messages;
      }

      // Generate title if not provided or is default
      let finalTitle = title;
      if (!finalTitle || finalTitle === 'Untitled Chat') {
        Logger.log('ChatHistoryService', 'Generating title for chat:', chatId);
        finalTitle = await this._generateTitleFromMessages(finalMessages);
      }

      // Process and save media files (works with both tree nodes and flat messages)
      const processedTree = treeData ? await this._processTreeForSave(treeData) : null;
      const processedMessages = !treeData ? await this._processMessagesForSave(finalMessages) : [];

      // Prepare chat data for storage
      const chatRecord = {
        chatId,
        title: finalTitle,
        chatService: processedTree, // NEW: Store tree structure
        messages: processedMessages, // DEPRECATED: For backward compatibility
        messageCount: finalMessages.length,
        metadata: {
          ...metadata,
          charCount: finalMessages.reduce((sum, msg) => sum + (msg.content?.length || 0), 0),
          hasTree: !!processedTree,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Save to storage via proxy (works in both modes)
      await this.storageProxy.chatSave(chatId, chatRecord);

      // Cache it
      this.cache.chats.set(chatId, chatRecord);

      Logger.log('ChatHistoryService', 'Chat saved:', chatId, 'with title:', finalTitle, 'Tree:', !!processedTree);
      return chatId;
    } catch (error) {
      Logger.error('ChatHistoryService', 'Failed to save chat:', error);
      throw error;
    }
  }

  /**
   * Process message tree and save associated media files
   * @private
   */
  async _processTreeForSave(treeData) {
    if (!treeData || !treeData.tree) return null;

    const processed = {
      ...treeData,
      tree: await this._processNodeForSave(treeData.tree),
    };

    return processed;
  }

  /**
   * Recursively process tree nodes and save media
   * @private
   */
  async _processNodeForSave(node) {
    const processedNode = { ...node };

    // Save images if present
    if (node.images && node.images.length > 0) {
      processedNode.imageFileIds = [];
      for (let i = 0; i < node.images.length; i++) {
        try {
          const fileId = await this._saveMediaFile(
            node.images[i],
            'image',
            `${node.id}_img_${i}`
          );
          processedNode.imageFileIds.push(fileId);
        } catch (error) {
          Logger.error('ChatHistoryService', 'Failed to save image:', error);
        }
      }
      delete processedNode.images;
    }

    // Save audios if present
    if (node.audios && node.audios.length > 0) {
      processedNode.audioFileIds = [];
      for (let i = 0; i < node.audios.length; i++) {
        try {
          const fileId = await this._saveMediaFile(
            node.audios[i],
            'audio',
            `${node.id}_audio_${i}`
          );
          processedNode.audioFileIds.push(fileId);
        } catch (error) {
          Logger.error('ChatHistoryService', 'Failed to save audio:', error);
        }
      }
      delete processedNode.audios;
    }

    // Recursively process branches
    if (node.branches && node.branches.length > 0) {
      processedNode.branches = [];
      for (const branch of node.branches) {
        processedNode.branches.push(await this._processNodeForSave(branch));
      }
    }

    return processedNode;
  }

  /**
   * Process messages and save associated media files
   * Extracts images and audios, stores them separately, and references via fileIds
   * @private
   */
  async _processMessagesForSave(messages) {
    const processed = [];

    for (const msg of messages) {
      const processedMsg = { ...msg };

      // Save images if present
      if (msg.images && msg.images.length > 0) {
        processedMsg.imageFileIds = [];
        for (let i = 0; i < msg.images.length; i++) {
          try {
            const fileId = await this._saveMediaFile(
              msg.images[i],
              'image',
              `${msg.id || 'unknown'}_img_${i}`
            );
            processedMsg.imageFileIds.push(fileId);
          } catch (error) {
            Logger.error('ChatHistoryService', 'Failed to save image:', error);
          }
        }
        // Remove image data from message to save space
        delete processedMsg.images;
      }

      // Save audios if present
      if (msg.audios && msg.audios.length > 0) {
        processedMsg.audioFileIds = [];
        for (let i = 0; i < msg.audios.length; i++) {
          try {
            const fileId = await this._saveMediaFile(
              msg.audios[i],
              'audio',
              `${msg.id || 'unknown'}_audio_${i}`
            );
            processedMsg.audioFileIds.push(fileId);
          } catch (error) {
            Logger.error('ChatHistoryService', 'Failed to save audio:', error);
          }
        }
        // Remove audio data from message
        delete processedMsg.audios;
      }

      processed.push(processedMsg);
    }

    return processed;
  }

  /**
   * Save a media file (image or audio) to storage
   * @private
   */
  async _saveMediaFile(dataUrl, type, fileId) {
    try {
      // Convert data URL to blob if needed
      let data = dataUrl;
      if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
        data = await this._dataUrlToBlob(dataUrl);
      }

      // Save to files storage with metadata via proxy
      const fullFileId = `${type}_${fileId}_${Date.now()}`;
      await this.storageProxy.fileSave(
        fullFileId,
        {
          data,
          type,
          size: typeof data === 'string' ? data.length : data.size,
          savedAt: new Date().toISOString(),
        },
        type // category
      );

      Logger.log('ChatHistoryService', 'Media file saved:', fullFileId);
      return fullFileId;
    } catch (error) {
      Logger.error('ChatHistoryService', 'Failed to save media file:', error);
      throw error;
    }
  }

  /**
   * Convert data URL to Blob
   * @private
   */
  async _dataUrlToBlob(dataUrl) {
    const response = await fetch(dataUrl);
    return await response.blob();
  }

  /**
   * Load a chat by ID
   * @param {string} chatId
   * @returns {Promise<Object>} chat data with tree/messages and media restored
   */
  async loadChat(chatId) {
    try {
      // Check cache first
      if (this.cache.chats.has(chatId)) {
        const cached = this.cache.chats.get(chatId);
        return await this._restoreMediaInChat(cached);
      }

      // Load from storage via proxy
      const chatData = await this.storageProxy.chatLoad(chatId);
      if (!chatData) {
        throw new Error(`Chat not found: ${chatId}`);
      }

      // Restore media files (works with both tree and flat messages)
      const restoredChat = await this._restoreMediaInChat(chatData);

      // Cache it
      this.cache.chats.set(chatId, chatData);

      Logger.log('ChatHistoryService', 'Chat loaded:', chatId, 'Has tree:', !!chatData.chatService);
      return restoredChat;
    } catch (error) {
      Logger.error('ChatHistoryService', 'Failed to load chat:', error);
      throw error;
    }
  }

  /**
   * Restore media files in chat (supports both tree and flat messages)
   * @private
   */
  async _restoreMediaInChat(chatData) {
    const restored = { ...chatData };

    // Restore tree structure if present
    if (restored.chatService) {
      restored.chatService = {
        ...restored.chatService,
        tree: await this._restoreNodeMedia(restored.chatService.tree),
      };

      // Import tree into ChatService
      ChatService.importTree(restored.chatService);
      restored.chatServiceData = restored.chatService;
      
      Logger.log('ChatHistoryService', 'Restored chat service tree');
    } else if (restored.messageTree) {
      // Backward compatibility: old format
      restored.chatService = {
        ...restored.messageTree,
        tree: await this._restoreNodeMedia(restored.messageTree.tree),
      };
      
      ChatService.importTree(restored.chatService);
      restored.chatServiceData = restored.chatService;
      
      Logger.log('ChatHistoryService', 'Restored message tree (backward compatibility)');
    }

    // Restore flat messages (backward compatibility)
    if (restored.messages && restored.messages.length > 0) {
      restored.messages = await this._restoreMessagesMedia(restored.messages);
      Logger.log('ChatHistoryService', 'Restored flat messages');
    }

    return restored;
  }

  /**
   * Recursively restore media in tree nodes
   * @private
   */
  async _restoreNodeMedia(node) {
    const restored = { ...node };

    // Restore images
    if (node.imageFileIds && node.imageFileIds.length > 0) {
      restored.images = [];
      for (const fileId of node.imageFileIds) {
        try {
          const fileData = await this.storageProxy.fileLoad(fileId);
          if (fileData && fileData.data) {
            const imageUrl = fileData.data instanceof Blob 
              ? await this._blobToDataUrl(fileData.data)
              : fileData.data;
            restored.images.push(imageUrl);
          }
        } catch (error) {
          Logger.warn('ChatHistoryService', 'Failed to restore image:', fileId, error);
        }
      }
      delete restored.imageFileIds;
    }

    // Restore audios
    if (node.audioFileIds && node.audioFileIds.length > 0) {
      restored.audios = [];
      for (const fileId of node.audioFileIds) {
        try {
          const fileData = await this.storageProxy.fileLoad(fileId);
          if (fileData && fileData.data) {
            const audioUrl = fileData.data instanceof Blob 
              ? await this._blobToDataUrl(fileData.data)
              : fileData.data;
            restored.audios.push(audioUrl);
          }
        } catch (error) {
          Logger.warn('ChatHistoryService', 'Failed to restore audio:', fileId, error);
        }
      }
      delete restored.audioFileIds;
    }

    // Recursively process branches
    if (node.branches && node.branches.length > 0) {
      restored.branches = [];
      for (const branch of node.branches) {
        restored.branches.push(await this._restoreNodeMedia(branch));
      }
    }

    return restored;
  }

  /**
   * Restore media files in flat messages array
   * @private
   */
  async _restoreMessagesMedia(messages) {
    const restored = [];

    for (const msg of messages) {
      const restoredMsg = { ...msg };

      // Restore images
      if (msg.imageFileIds && msg.imageFileIds.length > 0) {
        restoredMsg.images = [];
        for (const fileId of msg.imageFileIds) {
          try {
            const fileData = await this.storageProxy.fileLoad(fileId);
            if (fileData && fileData.data) {
              const imageUrl = fileData.data instanceof Blob 
                ? await this._blobToDataUrl(fileData.data)
                : fileData.data;
              restoredMsg.images.push(imageUrl);
            }
          } catch (error) {
            Logger.warn('ChatHistoryService', 'Failed to restore image:', fileId, error);
          }
        }
        delete restoredMsg.imageFileIds;
      }

      // Restore audios
      if (msg.audioFileIds && msg.audioFileIds.length > 0) {
        restoredMsg.audios = [];
        for (const fileId of msg.audioFileIds) {
          try {
            const fileData = await this.storageProxy.fileLoad(fileId);
            if (fileData && fileData.data) {
              const audioUrl = fileData.data instanceof Blob 
                ? await this._blobToDataUrl(fileData.data)
                : fileData.data;
              restoredMsg.audios.push(audioUrl);
            }
          } catch (error) {
            Logger.warn('ChatHistoryService', 'Failed to restore audio:', fileId, error);
          }
        }
        delete restoredMsg.audioFileIds;
      }

      restored.push(restoredMsg);
    }

    return restored;
  }

  /**
   * Update a chat's title
   * @param {string} chatId - Chat ID to update
   * @param {string} newTitle - New title for the chat
   * @returns {Promise<void>}
   */
  async updateChatTitle(chatId, newTitle) {
    try {
      // Load existing chat
      const chatData = await this.storageProxy.chatLoad(chatId);
      if (!chatData) {
        throw new Error(`Chat not found: ${chatId}`);
      }

      // Update title
      chatData.title = newTitle.trim().substring(0, 100); // Limit to 100 chars
      chatData.updatedAt = new Date().toISOString();

      // Save back to storage
      await this.storageProxy.chatSave(chatId, chatData);

      // Update cache
      if (this.cache.chats.has(chatId)) {
        const cached = this.cache.chats.get(chatId);
        cached.title = chatData.title;
        cached.updatedAt = chatData.updatedAt;
      }

      Logger.log('ChatHistoryService', 'Chat title updated:', chatId, newTitle);
    } catch (error) {
      Logger.error('ChatHistoryService', 'Failed to update chat title:', error);
      throw error;
    }
  }

  /**
   * Convert Blob to Data URL
   * @private
   */
  async _blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Delete a chat and all associated media files
   * @param {string} chatId
   */
  async deleteChat(chatId) {
    try {
      // Load chat to get file references via proxy
      const chatData = await this.storageProxy.chatLoad(chatId);

      if (chatData && chatData.messages) {
        // Delete all associated media files
        for (const msg of chatData.messages) {
          if (msg.imageFileIds) {
            for (const fileId of msg.imageFileIds) {
              try {
                await this.storageProxy.fileRemove(fileId);
              } catch {
                Logger.warn('ChatHistoryService', 'Failed to delete image file:', fileId);
              }
            }
          }
          if (msg.audioFileIds) {
            for (const fileId of msg.audioFileIds) {
              try {
                await this.storageProxy.fileRemove(fileId);
              } catch {
                Logger.warn('ChatHistoryService', 'Failed to delete audio file:', fileId);
              }
            }
          }
        }
      }

      // Delete chat record via proxy
      await this.storageProxy.chatRemove(chatId);

      // Remove from cache
      this.cache.chats.delete(chatId);
      this.cache.titles.delete(chatId);

      Logger.log('ChatHistoryService', 'Chat deleted:', chatId);
    } catch (error) {
      Logger.error('ChatHistoryService', 'Failed to delete chat:', error);
      throw error;
    }
  }

  /**
   * Get all chats with pagination
   * @param {number} limit - max items per page
   * @param {number} offset - items to skip
   * @returns {Promise<Array>} sorted by updatedAt (newest first)
   */
  async getAllChats(limit = 20, offset = 0) {
    try {
      const allChats = await this.storageProxy.chatGetAll();

      // Convert to array and sort by updatedAt (newest first)
      const chatsArray = Object.values(allChats)
        .sort((a, b) => {
          const timeA = new Date(a.updatedAt || a.createdAt).getTime();
          const timeB = new Date(b.updatedAt || b.createdAt).getTime();
          return timeB - timeA; // Descending order
        });

      // Apply pagination
      const paginated = chatsArray.slice(offset, offset + limit);

      Logger.log('ChatHistoryService', `Retrieved ${paginated.length} chats (limit: ${limit}, offset: ${offset})`);
      return paginated;
    } catch (error) {
      Logger.error('ChatHistoryService', 'Failed to get all chats:', error);
      throw error;
    }
  }

  /**
   * Search chats by title or message content
   * @param {string} query - search term
   * @returns {Promise<Array>} matching chats sorted by relevance
   */
  async searchChats(query) {
    try {
      if (!query || query.trim() === '') {
        return await this.getAllChats(100);
      }

      const lowerQuery = query.toLowerCase();
      const allChats = await this.storageProxy.chatGetAll();

      const results = Object.values(allChats)
        .filter(chat => {
          // Search in title
          if (chat.title?.toLowerCase().includes(lowerQuery)) {
            return true;
          }

          // Search in message content
          if (chat.messages?.some(msg => 
            msg.content?.toLowerCase().includes(lowerQuery)
          )) {
            return true;
          }

          return false;
        })
        .sort((a, b) => {
          const timeA = new Date(a.updatedAt || a.createdAt).getTime();
          const timeB = new Date(b.updatedAt || b.createdAt).getTime();
          return timeB - timeA;
        });

      Logger.log('ChatHistoryService', `Found ${results.length} chats matching: "${query}"`);
      return results;
    } catch (error) {
      Logger.error('ChatHistoryService', 'Search failed:', error);
      throw error;
    }
  }

  /**
   * Check if a chat is temporary
   * @param {string} chatId
   * @returns {Promise<boolean>}
   */
  async isTempChat(chatId) {
    try {
      const tempChats = await this.storageProxy.dataGetByCategory('tempChats');
      return tempChats && tempChats[chatId] === true;
    } catch (error) {
      Logger.error('ChatHistoryService', 'Failed to check temp chat status:', error);
      return false;
    }
  }

  /**
   * Mark a chat as temporary (won't be saved)
   * @param {string} chatId
   * @param {boolean} isTemp
   */
  async markAsTempChat(chatId, isTemp = true) {
    try {
      if (isTemp) {
        await this.storageProxy.dataSave(chatId, true, 'tempChats');
        Logger.log('ChatHistoryService', 'Chat marked as temporary:', chatId);
      } else {
        await this.storageProxy.dataRemove(chatId);
        Logger.log('ChatHistoryService', 'Chat unmarked as temporary:', chatId);
      }
    } catch (error) {
      Logger.error('ChatHistoryService', 'Failed to mark temp chat:', error);
      throw error;
    }
  }

  /**
   * Generate a meaningful chat title from messages
   * Uses LLM to create a short, descriptive title
   * Fallback to truncated first message if generation fails
   * @private
   */
  async _generateTitleFromMessages(messages) {
    try {
      if (!messages || messages.length === 0) {
        return 'New Chat';
      }

      // Find first user message
      const firstUserMsg = messages.find(msg => msg.role === 'user');
      if (!firstUserMsg) {
        return 'New Chat';
      }

      // Try to generate title using LLM
      try {
        // Use a timeout to avoid hanging
        const titlePromise = (async () => {
          const prompt = `Generate a very short title (max 50 characters) for this chat based on the first user message. Only return the title, nothing else.\n\nUser message: "${firstUserMsg.content}"`;
          
          Logger.log('ChatHistoryService', 'Sending prompt to AIService for title generation');
          const response = await this.aiService.sendMessage([
            { role: 'user', content: prompt }
          ]);
          Logger.log('ChatHistoryService', 'AIService response:', response);
          return response;
        })();

        // Wait with a 5 second timeout
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Title generation timeout')), 5000)
        );

        const response = await Promise.race([titlePromise, timeoutPromise]);

        if (response?.success && response?.response) {
          const title = response.response.trim().substring(0, 50);
          Logger.log('ChatHistoryService', 'Generated title:', title);
          this.cache.titles.set(firstUserMsg.content, title);
          return title;
        } else {
          Logger.warn('ChatHistoryService', 'LLM returned no text:', response);
        }
      } catch (error) {
        Logger.warn('ChatHistoryService', 'LLM title generation failed, using fallback:', error.message);
      }

      // Fallback: use truncated first message
      const fallbackTitle = firstUserMsg.content.substring(0, 50).trim();
      Logger.log('ChatHistoryService', 'Using fallback title:', fallbackTitle);
      return fallbackTitle || 'New Chat';
    } catch (error) {
      Logger.error('ChatHistoryService', 'Failed to generate title:', error);
      return 'New Chat';
    }
  }

  /**
   * Get chat count
   * @returns {Promise<number>}
   */
  async getChatCount() {
    try {
      const allChats = await this.storageProxy.chatGetAll();
      return Object.keys(allChats).length;
    } catch (error) {
      Logger.error('ChatHistoryService', 'Failed to get chat count:', error);
      return 0;
    }
  }

  /**
   * Clear all chats and media files
   * Warning: This is destructive and cannot be undone
   */
  async clearAll() {
    try {
      Logger.warn('ChatHistoryService', 'Clearing all chats and media files...');
      await this.storageProxy.chatClear();
      await this.storageProxy.filesClear();
      this.cache.chats.clear();
      this.cache.titles.clear();
      Logger.log('ChatHistoryService', 'All chats cleared');
    } catch (error) {
      Logger.error('ChatHistoryService', 'Failed to clear all chats:', error);
      throw error;
    }
  }

  /**
   * Clear cache (for memory management)
   */
  clearCache() {
    this.cache.chats.clear();
    if (this.cache.titles.size > this.MAX_TITLE_CACHE) {
      // Keep only recent titles
      const titles = Array.from(this.cache.titles.entries())
        .slice(-this.MAX_TITLE_CACHE);
      this.cache.titles.clear();
      titles.forEach(([key, value]) => this.cache.titles.set(key, value));
    }
  }
}

// Create singleton instance
export const chatHistoryService = new ChatHistoryService();

export default chatHistoryService;
