/**
 * ChatManager - Conversation management
 * 
 * Manages the current chat conversation in memory.
 * Handles message history, context window limits, and formatting for AI APIs.
 */

class ChatManager {
  constructor() {
    // In-memory conversation history
    this.messages = [];
    
    // Context window limits
    this.maxMessages = 20; // Keep last 20 messages for context
    this.systemMessageCount = 0; // Track how many system messages we have
    
    console.log('[ChatManager] Initialized');
  }

  /**
   * Add a message to the conversation
   * @param {string} role - Message role: 'system', 'user', or 'assistant'
   * @param {string} content - Message content
   */
  addMessage(role, content) {
    const message = {
      role,
      content,
      timestamp: Date.now(),
    };
    
    this.messages.push(message);
    
    if (role === 'system') {
      this.systemMessageCount++;
    }
    
    // Trim old messages if needed (but keep system messages)
    this.trimMessages();
    
    if (role === 'user') {
      console.log(`[ChatManager] Added ${role} message (${this.messages.length} total)`);
    }
  }

  /**
   * Get all messages in the conversation
   * @returns {Array} Array of message objects
   */
  getMessages() {
    return this.messages;
  }

  /**
   * Get message count
   * @returns {number} Number of messages
   */
  getMessageCount() {
    return this.messages.length;
  }

  /**
   * Clear all messages
   */
  clearMessages() {
    const count = this.messages.length;
    this.messages = [];
    this.systemMessageCount = 0;
    console.log(`[ChatManager] Cleared ${count} messages`);
  }

  /**
   * Trim old messages to stay within context window
   * Keeps all system messages + last N user/assistant messages
   */
  trimMessages() {
    // If we're under the limit, don't trim
    if (this.messages.length <= this.maxMessages) {
      return;
    }

    // Separate system messages from conversation messages
    const systemMessages = this.messages.filter(m => m.role === 'system');
    const conversationMessages = this.messages.filter(m => m.role !== 'system');

    // Keep only the last (maxMessages - systemCount) conversation messages
    const maxConversationMessages = this.maxMessages - systemMessages.length;
    const trimmedConversation = conversationMessages.slice(-maxConversationMessages);

    // Rebuild messages array: system messages first, then recent conversation
    this.messages = [...systemMessages, ...trimmedConversation];

    console.log(`[ChatManager] Trimmed to ${this.messages.length} messages (${systemMessages.length} system + ${trimmedConversation.length} conversation)`);
  }

  /**
   * Format messages for OpenAI API
   * @param {string} systemPrompt - System prompt to use (if no system message exists)
   * @returns {Array} Array of formatted messages for API
   */
  getFormattedMessages(systemPrompt) {
    const formatted = [];

    // Add system prompt if no system message exists yet
    if (this.systemMessageCount === 0 && systemPrompt) {
      formatted.push({
        role: 'system',
        content: systemPrompt,
      });
    }

    // Add all conversation messages (formatted for API)
    formatted.push(...this.messages.map(m => ({
      role: m.role,
      content: m.content,
    })));

    return formatted;
  }

  /**
   * Get the last message
   * @returns {Object|null} Last message or null if empty
   */
  getLastMessage() {
    return this.messages.length > 0 ? this.messages[this.messages.length - 1] : null;
  }

  /**
   * Get the last user message
   * @returns {Object|null} Last user message or null
   */
  getLastUserMessage() {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].role === 'user') {
        return this.messages[i];
      }
    }
    return null;
  }

  /**
   * Get the last assistant message
   * @returns {Object|null} Last assistant message or null
   */
  getLastAssistantMessage() {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].role === 'assistant') {
        return this.messages[i];
      }
    }
    return null;
  }

  /**
   * Check if conversation is empty
   * @returns {boolean} True if no messages (excluding system)
   */
  isEmpty() {
    return this.messages.filter(m => m.role !== 'system').length === 0;
  }
}

// Export singleton instance
export default new ChatManager();
