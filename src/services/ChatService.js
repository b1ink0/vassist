/**
 * ChatService - chat conversation management
 */

class ChatService {
  constructor() {
    // Tree structure
    this.tree = this._createRoot();
    this.activePath = ['root']; // IDs of messages in current conversation
    
    // Context limits
    this.maxMessages = 20;
    
    console.log('[ChatService] Initialized');
  }

  /**
   * Create root node
   * @private
   */
  _createRoot() {
    return {
      id: 'root',
      parentId: null,
      content: null,
      role: 'system',
      branches: [],
      currentBranchIndex: 0,
      timestamp: Date.now(),
    };
  }

  /**
   * Generate unique message ID
   * @private
   */
  _generateId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Find node by ID
   * @private
   */
  _findNode(nodeId, currentNode = this.tree) {
    if (currentNode.id === nodeId) {
      return currentNode;
    }

    for (const branch of currentNode.branches) {
      const found = this._findNode(nodeId, branch);
      if (found) return found;
    }

    return null;
  }

  // ========================================
  // CHATMANAGER-COMPATIBLE METHODS
  // ========================================

  /**
   * Add a message to the active conversation
   * @param {string} role - 'user' or 'assistant'
   * @param {string} content - Message content
   * @param {Array} images - Optional image attachments
   * @param {Array} audios - Optional audio attachments
   * @returns {string} New message ID
   */
  addMessage(role, content, images = null, audios = null) {
    const parentId = this.activePath[this.activePath.length - 1];
    const parent = this._findNode(parentId);

    if (!parent) {
      throw new Error(`Parent node ${parentId} not found`);
    }

    const newMessage = {
      id: this._generateId(),
      parentId,
      role,
      content,
      images: images || [],
      audios: audios || [],
      imageFileIds: [],
      audioFileIds: [],
      branches: [],
      currentBranchIndex: 0,
      timestamp: Date.now(),
    };

    parent.branches.push(newMessage);
    parent.currentBranchIndex = parent.branches.length - 1;
    this.activePath.push(newMessage.id);

    const imageInfo = images && images.length > 0 ? ` with ${images.length} image(s)` : '';
    const audioInfo = audios && audios.length > 0 ? ` with ${audios.length} audio(s)` : '';
    console.log(`[ChatService] Added ${role} message${imageInfo}${audioInfo}`);

    return newMessage.id;
  }

  /**
   * Get active conversation as flat array (ChatManager compatible)
   * @returns {Array} Array of message objects
   */
  getMessages() {
    const messages = [];

    for (let i = 1; i < this.activePath.length; i++) {
      const node = this._findNode(this.activePath[i]);
      if (node && node.role !== 'system') {
        messages.push({
          id: node.id,
          role: node.role,
          content: node.content,
          images: node.images || [],
          audios: node.audios || [],
          imageFileIds: node.imageFileIds || [],
          audioFileIds: node.audioFileIds || [],
          timestamp: node.timestamp,
          parentId: node.parentId,
          branchInfo: this._getBranchInfo(node),
        });
      }
    }

    return messages;
  }

  /**
   * Update the content of the last message in the active path (for streaming)
   * @param {string} content - New content for the last message
   */
  updateLastMessage(content) {
    if (this.activePath.length < 2) {
      console.warn('[ChatService] No messages to update');
      return;
    }

    const lastId = this.activePath[this.activePath.length - 1];
    const node = this._findNode(lastId);
    
    if (node) {
      node.content = content;
      node.timestamp = Date.now();
    }
  }

  /**
   * Set messages from flat array (for loading from history)
   * @param {Array} messages - Flat array of messages
   */
  setMessages(messages) {
    this.clear();
    
    for (const msg of messages) {
      this.addMessage(
        msg.role,
        msg.content,
        msg.images,
        msg.audios
      );
    }
    
    console.log(`[ChatService] Set ${messages.length} messages from flat array`);
  }

  /**
   * Get message count
   * @returns {number}
   */
  getMessageCount() {
    return this.activePath.length - 1; // Exclude root
  }

  /**
   * Clear all messages
   */
  clearMessages() {
    this.clear();
  }

  /**
   * Get formatted messages for AI (ChatManager compatible)
   * @param {string} systemPrompt - System prompt to inject
   * @returns {Array}
   */
  getFormattedMessages(systemPrompt) {
    const formatted = [];

    // Add system prompt if provided
    if (systemPrompt) {
      formatted.push({
        role: 'system',
        content: systemPrompt,
      });
    }

    // Add active conversation messages
    const messages = this.getMessages();
    formatted.push(...messages.map(m => ({
      role: m.role,
      content: m.content,
      images: m.images && m.images.length > 0 ? m.images : undefined,
      audios: m.audios && m.audios.length > 0 ? m.audios : undefined,
    })));

    return formatted;
  }

  /**
   * Get last message
   * @returns {Object|null}
   */
  getLastMessage() {
    const messages = this.getMessages();
    return messages.length > 0 ? messages[messages.length - 1] : null;
  }

  /**
   * Get last user message
   * @returns {Object|null}
   */
  getLastUserMessage() {
    const messages = this.getMessages();
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        return messages[i];
      }
    }
    return null;
  }

  /**
   * Get last assistant message
   * @returns {Object|null}
   */
  getLastAssistantMessage() {
    const messages = this.getMessages();
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        return messages[i];
      }
    }
    return null;
  }

  /**
   * Check if conversation is empty
   * @returns {boolean}
   */
  isEmpty() {
    return this.activePath.length <= 1; // Only root
  }

  /**
   * Trim old messages (not implemented for tree - would be complex)
   * Keeping for ChatManager compatibility
   */
  trimMessages() {
    // Tree trimming would require removing old branches
    // For now, keep all history (branching needs it)
    // Could implement later if needed
  }

  // ========================================
  // BRANCHING METHODS (MessageTreeService)
  // ========================================

  /**
   * Edit a user message (creates new branch)
   * @param {string} messageId - ID of message to edit
   * @param {string} newContent - New content
   * @param {Array} newImages - Optional new images array
   * @param {Array} newAudios - Optional new audios array
   * @returns {string} New message ID
   */
  editMessage(messageId, newContent, newImages = null, newAudios = null) {
    const node = this._findNode(messageId);
    if (!node || node.role !== 'user') {
      throw new Error('Can only edit user messages');
    }

    const parent = this._findNode(node.parentId);
    if (!parent) {
      throw new Error('Parent node not found');
    }

    // Create new branch with edited content
    const newMessage = {
      id: this._generateId(),
      parentId: node.parentId,
      role: node.role,
      content: newContent,
      images: newImages !== null ? newImages : (node.images || []),
      audios: newAudios !== null ? newAudios : (node.audios || []),
      imageFileIds: node.imageFileIds || [],
      audioFileIds: node.audioFileIds || [],
      branches: [],
      currentBranchIndex: 0,
      timestamp: Date.now(),
      isEdit: true,
      originalId: messageId,
    };

    parent.branches.push(newMessage);
    parent.currentBranchIndex = parent.branches.length - 1;

    // Update active path from this point forward
    const messageIndex = this.activePath.indexOf(messageId);
    if (messageIndex !== -1) {
      this.activePath = this.activePath.slice(0, messageIndex);
      this.activePath.push(newMessage.id);
    }

    console.log('[ChatService] Edited message:', messageId, '→', newMessage.id);
    return newMessage.id;
  }

  /**
   * Create regeneration point (removes AI message and everything after)
   * @param {string} messageId - ID of AI message to regenerate
   * @returns {string} Parent message ID
   */
  createRegenerationBranch(messageId) {
    const node = this._findNode(messageId);
    if (!node || node.role !== 'assistant') {
      throw new Error('Can only regenerate assistant messages');
    }

    // Remove this AI message and everything after from active path
    const messageIndex = this.activePath.indexOf(messageId);
    if (messageIndex !== -1) {
      this.activePath = this.activePath.slice(0, messageIndex);
    }

    console.log('[ChatService] Created regeneration point at:', node.parentId);
    return node.parentId;
  }

  /**
   * Switch to a different branch
   * @param {string} nodeId - Parent node ID
   * @param {number} branchIndex - Index of branch to switch to
   */
  switchBranch(nodeId, branchIndex) {
    const node = this._findNode(nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }

    if (branchIndex < 0 || branchIndex >= node.branches.length) {
      throw new Error(`Invalid branch index ${branchIndex}`);
    }

    node.currentBranchIndex = branchIndex;
    const newBranch = node.branches[branchIndex];

    // Rebuild active path from root to this branch
    const nodeIndex = this.activePath.indexOf(nodeId);
    if (nodeIndex !== -1) {
      this.activePath = this.activePath.slice(0, nodeIndex + 1);
      this.activePath.push(newBranch.id);

      // Continue with first branch of children recursively
      let current = newBranch;
      while (current.branches.length > 0) {
        current = current.branches[current.currentBranchIndex];
        this.activePath.push(current.id);
      }
    }

    console.log('[ChatService] Switched to branch', branchIndex, 'at node', nodeId);
  }

  /**
   * Navigate to previous branch
   * @param {string} messageId - Current message ID
   */
  previousBranch(messageId) {
    const node = this._findNode(messageId);
    if (!node) return;

    const parent = this._findNode(node.parentId);
    if (!parent) return;

    const currentIndex = parent.branches.findIndex(b => b.id === messageId);
    if (currentIndex > 0) {
      this.switchBranch(parent.id, currentIndex - 1);
    }
  }

  /**
   * Navigate to next branch
   * @param {string} messageId - Current message ID
   */
  nextBranch(messageId) {
    const node = this._findNode(messageId);
    if (!node) return;

    const parent = this._findNode(node.parentId);
    if (!parent) return;

    const currentIndex = parent.branches.findIndex(b => b.id === messageId);
    if (currentIndex < parent.branches.length - 1) {
      this.switchBranch(parent.id, currentIndex + 1);
    }
  }

  /**
   * Get branch information for a message
   * @private
   */
  _getBranchInfo(node) {
    const parent = this._findNode(node.parentId);
    if (!parent || parent.branches.length <= 1) {
      return null;
    }

    const currentIndex = parent.branches.findIndex(b => b.id === node.id);
    return {
      currentIndex: currentIndex + 1,
      totalBranches: parent.branches.length,
      parentId: parent.id,
      canGoBack: currentIndex > 0,
      canGoForward: currentIndex < parent.branches.length - 1,
    };
  }

  // ========================================
  // PERSISTENCE METHODS
  // ========================================

  /**
   * Export tree for persistence
   * @returns {Object}
   */
  exportTree() {
    return {
      tree: this.tree,
      activePath: this.activePath,
      version: 1,
    };
  }

  /**
   * Import tree from persistence
   * @param {Object} data
   */
  importTree(data) {
    if (!data || !data.tree || !data.activePath) {
      throw new Error('Invalid tree data');
    }

    this.tree = data.tree;
    this.activePath = data.activePath;
    console.log('[ChatService] Imported tree with', this.activePath.length - 1, 'messages');
  }

  /**
   * Clear the tree
   */
  clear() {
    this.tree = this._createRoot();
    this.activePath = ['root'];
    console.log('[ChatService] Cleared');
  }

  /**
   * Get tree statistics
   */
  getStats() {
    let totalNodes = 0;
    let totalBranches = 0;
    let maxDepth = 0;

    const traverse = (node, depth = 0) => {
      totalNodes++;
      if (node.branches.length > 1) {
        totalBranches += node.branches.length;
      }
      maxDepth = Math.max(maxDepth, depth);

      for (const branch of node.branches) {
        traverse(branch, depth + 1);
      }
    };

    traverse(this.tree);

    return {
      totalNodes,
      totalBranches,
      maxDepth,
      activePathLength: this.activePath.length - 1,
    };
  }
}

// Export singleton instance
export default new ChatService();
