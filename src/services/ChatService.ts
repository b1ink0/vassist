/**
 * ChatService - chat conversation management
 */

import Logger from './LoggerService';

export type ChatRole = 'system' | 'user' | 'assistant';
export type ChatAttachment = string | Blob | File;

export interface ChatNode {
  id: string;
  parentId: string | null;
  content: string | null;
  role: ChatRole;
  branches: ChatNode[];
  currentBranchIndex: number;
  timestamp: number;
  images?: ChatAttachment[];
  audios?: ChatAttachment[];
  imageFileIds?: string[];
  audioFileIds?: string[];
  isEdit?: boolean;
  originalId?: string;
}

interface BranchInfo {
  currentIndex: number;
  totalBranches: number;
  parentId: string;
  canGoBack: boolean;
  canGoForward: boolean;
}

export interface FlatChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  images: ChatAttachment[];
  audios: ChatAttachment[];
  imageFileIds: string[];
  audioFileIds: string[];
  timestamp: number;
  parentId: string | null;
  branchInfo: BranchInfo | null;
}

export interface ExportedChatTree {
  tree: ChatNode;
  activePath: string[];
  version: number;
}

export type ChatMessageInput = {
  role: ChatRole;
  content: string;
  images?: ChatAttachment[];
  audios?: ChatAttachment[];
};

type ImportTreeData = {
  tree?: ChatNode | object;
  activePath?: string[];
  version?: number;
  [key: string]: unknown;
};

class ChatService {
  private tree: ChatNode;
  private activePath: string[];
  private maxMessages: number;

  constructor() {
    // Tree structure
    this.tree = this._createRoot();
    this.activePath = ['root']; // IDs of messages in current conversation
    
    // Context limits
    this.maxMessages = 20;
  }

  /**
   * Create root node
   * @private
   */
  _createRoot(): ChatNode {
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
  _generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Find node by ID
   * @private
   */
  _findNode(nodeId: string, currentNode: ChatNode = this.tree): ChatNode | null {
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
  addMessage(role: ChatRole, content: string, images: ChatAttachment[] | null = null, audios: ChatAttachment[] | null = null): string {
    const parentId = this.activePath[this.activePath.length - 1] ?? 'root';
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
    Logger.log('ChatService', `Added ${role} message${imageInfo}${audioInfo}`);

    return newMessage.id;
  }

  /**
   * Get active conversation as flat array (ChatManager compatible)
   * @returns {Array} Array of message objects
   */
  getMessages(): FlatChatMessage[] {
    const messages: FlatChatMessage[] = [];

    for (let i = 1; i < this.activePath.length; i++) {
      const nodeId = this.activePath[i];
      if (!nodeId) {
        continue;
      }
      const node = this._findNode(nodeId);
      if (node && node.role !== 'system') {
        messages.push({
          id: node.id,
          role: node.role,
          content: node.content ?? '',
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
  updateLastMessage(content: string): void {
    if (this.activePath.length < 2) {
      Logger.warn('ChatService', 'No messages to update');
      return;
    }

    const lastId = this.activePath[this.activePath.length - 1];
    if (!lastId) {
      return;
    }
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
  setMessages(messages: ChatMessageInput[]): void {
    this.clear();
    
    for (const msg of messages) {
      this.addMessage(
        msg.role,
        msg.content,
        msg.images,
        msg.audios
      );
    }
    
    Logger.log('ChatService', `Set ${messages.length} messages from flat array`);
  }

  /**
   * Get message count
   * @returns {number}
   */
  getMessageCount(): number {
    return this.activePath.length - 1; // Exclude root
  }

  /**
   * Clear all messages
   */
  clearMessages(): void {
    this.clear();
  }

  /**
   * Get formatted messages for AI (ChatManager compatible)
   * @param {string} systemPrompt - System prompt to inject
   * @returns {Array}
   */
  getFormattedMessages(systemPrompt?: string): Array<{ role: ChatRole; content: string; images?: ChatAttachment[]; audios?: ChatAttachment[] }> {
    const formatted: Array<{ role: ChatRole; content: string; images?: ChatAttachment[]; audios?: ChatAttachment[] }> = [];

    // Add system prompt if provided
    if (systemPrompt) {
      formatted.push({
        role: 'system',
        content: systemPrompt,
      });
    }

    // Add active conversation messages
    const messages = this.getMessages();
    formatted.push(...messages.map((m) => {
      const payload: { role: ChatRole; content: string; images?: ChatAttachment[]; audios?: ChatAttachment[] } = {
        role: m.role,
        content: m.content,
      };
      if (m.images.length > 0) {
        payload.images = m.images;
      }
      if (m.audios.length > 0) {
        payload.audios = m.audios;
      }
      return payload;
    }));

    return formatted;
  }

  /**
   * Get last message
   * @returns {Object|null}
   */
  getLastMessage(): FlatChatMessage | null {
    const messages = this.getMessages();
    const last = messages[messages.length - 1];
    return last ?? null;
  }

  /**
   * Get last user message
   * @returns {Object|null}
   */
  getLastUserMessage(): FlatChatMessage | null {
    const messages = this.getMessages();
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message && message.role === 'user') {
        return message;
      }
    }
    return null;
  }

  /**
   * Get last assistant message
   * @returns {Object|null}
   */
  getLastAssistantMessage(): FlatChatMessage | null {
    const messages = this.getMessages();
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message && message.role === 'assistant') {
        return message;
      }
    }
    return null;
  }

  /**
   * Check if conversation is empty
   * @returns {boolean}
   */
  isEmpty(): boolean {
    return this.activePath.length <= 1; // Only root
  }

  /**
   * Trim old messages (not implemented for tree - would be complex)
   * Keeping for ChatManager compatibility
   */
  trimMessages(): void {
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
  editMessage(messageId: string, newContent: string, newImages: ChatAttachment[] | null = null, newAudios: ChatAttachment[] | null = null): string {
    const node = this._findNode(messageId);
    if (!node || node.role !== 'user') {
      throw new Error('Can only edit user messages');
    }

    if (!node.parentId) {
      throw new Error('Cannot edit root/system node');
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

    Logger.log('ChatService', 'Edited message:', messageId, '→', newMessage.id);
    return newMessage.id;
  }

  /**
   * Create regeneration point (removes AI message and everything after)
   * @param {string} messageId - ID of AI message to regenerate
   * @returns {string} Parent message ID
   */
  createRegenerationBranch(messageId: string): string {
    const node = this._findNode(messageId);
    if (!node || node.role !== 'assistant') {
      throw new Error('Can only regenerate assistant messages');
    }

    // Remove this AI message and everything after from active path
    const messageIndex = this.activePath.indexOf(messageId);
    if (messageIndex !== -1) {
      this.activePath = this.activePath.slice(0, messageIndex);
    }

    Logger.log('ChatService', 'Created regeneration point at:', node.parentId);
    return node.parentId ?? 'root';
  }

  /**
   * Switch to a different branch
   * @param {string} nodeId - Parent node ID
   * @param {number} branchIndex - Index of branch to switch to
   */
  switchBranch(nodeId: string, branchIndex: number): void {
    const node = this._findNode(nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }

    if (branchIndex < 0 || branchIndex >= node.branches.length) {
      throw new Error(`Invalid branch index ${branchIndex}`);
    }

    node.currentBranchIndex = branchIndex;
    const newBranch = node.branches[branchIndex];
    if (!newBranch) {
      throw new Error(`Branch ${branchIndex} not found for node ${nodeId}`);
    }

    // Rebuild active path from root to this branch
    const nodeIndex = this.activePath.indexOf(nodeId);
    if (nodeIndex !== -1) {
      this.activePath = this.activePath.slice(0, nodeIndex + 1);
      this.activePath.push(newBranch.id);

      // Continue with first branch of children recursively
      let current = newBranch;
      while (current.branches.length > 0) {
        const next = current.branches[current.currentBranchIndex];
        if (!next) {
          break;
        }
        current = next;
        this.activePath.push(current.id);
      }
    }

    Logger.log('ChatService', 'Switched to branch', branchIndex, 'at node', nodeId);
  }

  /**
   * Navigate to previous branch
   * @param {string} messageId - Current message ID
   */
  previousBranch(messageId: string): void {
    const node = this._findNode(messageId);
    if (!node) return;

    if (!node.parentId) return;

    const parent = this._findNode(node.parentId);
    if (!parent) return;

    const currentIndex = parent.branches.findIndex((b: ChatNode) => b.id === messageId);
    if (currentIndex > 0) {
      this.switchBranch(parent.id, currentIndex - 1);
    }
  }

  /**
   * Navigate to next branch
   * @param {string} messageId - Current message ID
   */
  nextBranch(messageId: string): void {
    const node = this._findNode(messageId);
    if (!node) return;

    if (!node.parentId) return;

    const parent = this._findNode(node.parentId);
    if (!parent) return;

    const currentIndex = parent.branches.findIndex((b: ChatNode) => b.id === messageId);
    if (currentIndex < parent.branches.length - 1) {
      this.switchBranch(parent.id, currentIndex + 1);
    }
  }

  /**
   * Get branch information for a message
   * @private
   */
  _getBranchInfo(node: ChatNode): BranchInfo | null {
    if (!node.parentId) {
      return null;
    }

    const parent = this._findNode(node.parentId);
    if (!parent || parent.branches.length <= 1) {
      return null;
    }

    const currentIndex = parent.branches.findIndex((b: ChatNode) => b.id === node.id);
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
  exportTree(): ExportedChatTree {
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
  importTree(data: Partial<ExportedChatTree> | ImportTreeData | null | undefined): void {
    const typed = data;
    if (!typed || !typed.tree || !typed.activePath) {
      throw new Error('Invalid tree data');
    }

    if (!Array.isArray(typed.activePath)) {
      throw new Error('Invalid activePath data');
    }

    this.tree = typed.tree as ChatNode;
    this.activePath = typed.activePath;
    Logger.log('ChatService', 'Imported tree with', this.activePath.length - 1, 'messages');
  }

  /**
   * Clear the tree
   */
  clear(): void {
    this.tree = this._createRoot();
    this.activePath = ['root'];
    Logger.log('ChatService', 'Cleared');
  }

  /**
   * Get tree statistics
   */
  getStats(): { totalNodes: number; totalBranches: number; maxDepth: number; activePathLength: number } {
    let totalNodes = 0;
    let totalBranches = 0;
    let maxDepth = 0;

    const traverse = (node: ChatNode, depth = 0): void => {
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
