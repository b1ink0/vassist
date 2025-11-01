/**
 * DocumentInteractionService - Intelligent page context extraction
 * 
 * Analyzes user queries and automatically extracts relevant context from the page
 * to enhance AI responses without user intervention.
 * Works with ANY AI provider (Chrome AI, OpenAI, Ollama, etc.)
 */

import Logger from './Logger';
import { PromptConfig } from '../config/promptConfig';

class DocumentInteractionService {
  constructor() {
    this.lastAnalysis = null;
    this.cachedContext = new Map(); // Cache extracted contexts
  }

  /**
   * Analyze user query to determine what context is needed
   * Uses the configured AIService (works with any provider)
   * @param {string} userQuery - The user's message
   * @param {Function} aiServiceSendMessage - AIService.sendMessage function
   * @returns {Promise<Object|null>} Analysis result or null
   */
  async analyzeQuery(userQuery, aiServiceSendMessage) {
    const logPrefix = '[DocumentInteractionService]';
    
    try {
      Logger.log('other', `${logPrefix} Analyzing query:`, userQuery.substring(0, 50));

      const messages = [
        { role: 'system', content: PromptConfig.documentInteraction.analyzerSystemPrompt },
        { role: 'user', content: PromptConfig.documentInteraction.analyzeQuery(userQuery) }
      ];
      
      // Use utility session for analysis (separate from main chat)
      const result = await aiServiceSendMessage(messages, null, { useUtilitySession: true });
      
      if (!result.success || !result.response) {
        Logger.warn('other', `${logPrefix} Analysis failed:`, result.error);
        return null;
      }
      
      const response = result.response;
      
      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = response.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```\n?$/g, '');
      }
      
      const analysis = JSON.parse(jsonStr);
      this.lastAnalysis = analysis;
      
      Logger.log('other', `${logPrefix} Analysis result:`, analysis);
      return analysis;
      
    } catch (error) {
      Logger.error('other', `${logPrefix} Analysis failed:`, error);
      return null;
    }
  }

  /**
   * Extract context from the page based on analysis
   * @param {Object} analysis - Analysis result from analyzeQuery
   * @returns {string|null} Extracted context or null
   */
  extractContext(analysis) {
    const logPrefix = '[DocumentInteractionService]';
    
    if (!analysis || !analysis.needsContext) {
      return null;
    }

    try {
      const { contextType, selector } = analysis;
      Logger.log('other', `${logPrefix} Extracting context: ${contextType}`);

      let context = '';

      switch (contextType) {
        case 'text':
          context = this._extractText(selector);
          break;
        case 'links':
          context = this._extractLinks(selector);
          break;
        case 'all':
          context = this._extractAll();
          break;
        default:
          context = this._extractText(selector || 'body');
      }

      // Limit context size (max 4000 chars)
      if (context.length > 4000) {
        context = context.substring(0, 4000) + '\n... (truncated for brevity)';
      }

      Logger.log('other', `${logPrefix} Extracted ${context.length} characters of context`);
      return context;

    } catch (error) {
      Logger.error('other', `${logPrefix} Context extraction failed:`, error);
      return null;
    }
  }

  /**
   * Main method: Analyze query and extract context if needed
   * @param {string} userQuery - The user's message
   * @param {Function} aiServiceSendMessage - AIService.sendMessage function
   * @returns {Promise<string|null>} Extracted context or null
   */
  async getContextForQuery(userQuery, aiServiceSendMessage) {
    const logPrefix = '[DocumentInteractionService]';
    
    try {
      // Analyze what context is needed
      const analysis = await this.analyzeQuery(userQuery, aiServiceSendMessage);
      
      if (!analysis || !analysis.needsContext) {
        Logger.log('other', `${logPrefix} No context needed for query`);
        return null;
      }

      // Extract the context
      const context = this.extractContext(analysis);
      
      if (context) {
        return `[Page Context - ${analysis.reason}]\n${context}\n\n`;
      }

      return null;
    } catch (error) {
      Logger.error('other', `${logPrefix} Failed to get context:`, error);
      return null;
    }
  }

  /**
   * Extract text content from elements matching selector
   * @private
   */
  _extractText(selector) {
    try {
      const elements = document.querySelectorAll(selector);
      if (elements.length === 0) {
        return 'No matching elements found on the page.';
      }

      const texts = Array.from(elements)
        .map(el => el.textContent.trim())
        .filter(text => text.length > 0)
        .slice(0, 50);

      return `Page Text Content:\n${texts.join('\n\n')}`;
    } catch (error) {
      Logger.error('DocumentInteractionService', 'Text extraction error:', error);
      return '';
    }
  }

  /**
   * Extract links information
   * @private
   */
  _extractLinks(selector) {
    try {
      const links = document.querySelectorAll(selector || 'a[href]');
      if (links.length === 0) {
        return 'No links found on the page.';
      }

      const linkInfo = Array.from(links)
        .slice(0, 30)
        .map((link, i) => {
          const text = link.textContent.trim() || 'No text';
          const href = link.href;
          return `${i + 1}. "${text}" -> ${href}`;
        })
        .join('\n');

      return `Page Links (${links.length} total):\n${linkInfo}`;
    } catch (error) {
      Logger.error('DocumentInteractionService', 'Link extraction error:', error);
      return '';
    }
  }

  /**
   * Extract all available context
   * @private
   */
  _extractAll() {
    const parts = [];
    
    // Page title and URL
    parts.push(`Page: ${document.title}`);
    parts.push(`URL: ${window.location.href}`);
    
    // Main headings
    const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
      .slice(0, 10)
      .map(h => h.textContent.trim())
      .join('\n');
    if (headings) {
      parts.push(`\nMain Headings:\n${headings}`);
    }
    
    // Main content
    const mainContent = document.querySelector('main, article, [role="main"]');
    if (mainContent) {
      const text = mainContent.textContent.trim().substring(0, 2000);
      parts.push(`\nMain Content:\n${text}...`);
    } else {
      // Fallback to body if no main content found
      const text = document.body.textContent.trim().substring(0, 2000);
      parts.push(`\nPage Content:\n${text}...`);
    }
    
    return parts.join('\n');
  }
}

// Export singleton instance
export default new DocumentInteractionService();
