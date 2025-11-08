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
   * @param {AbortSignal} abortSignal - Abort signal to cancel analysis
   * @param {number} retryCount - Number of retries attempted (internal)
   * @returns {Promise<Object|null>} Analysis result or null
   */
  async analyzeQuery(userQuery, aiServiceSendMessage, abortSignal = null, retryCount = 0) {
    const logPrefix = '[DocumentInteractionService]';
    const maxRetries = 2; // Allow up to 2 retries
    
    if (abortSignal?.aborted) {
      Logger.log('other', `${logPrefix} Analysis aborted before starting`);
      return null;
    }
    
    try {
      Logger.log('other', `${logPrefix} Analyzing query:`, userQuery.substring(0, 50));

      const messages = [
        { role: 'system', content: PromptConfig.documentInteraction.analyzerSystemPrompt },
        { role: 'user', content: PromptConfig.documentInteraction.analyzeQuery(userQuery) }
      ];
      
      // Use utility session for analysis (separate from main chat)
      const result = await aiServiceSendMessage(messages, null, { useUtilitySession: true });
      
      if (abortSignal?.aborted) {
        Logger.log('other', `${logPrefix} Analysis aborted after AI call`);
        return null;
      }
      
      if (!result.success || !result.response) {
        if (result.cancelled) {
          Logger.log('other', `${logPrefix} Analysis cancelled by abort`);
          return null;
        }
        
        // Don't log as error if it's just not configured (normal during initialization)
        if (result.error?.message?.includes('not configured')) {
          Logger.log('other', `${logPrefix} AI not configured yet, skipping analysis`);
        } else {
          Logger.warn('other', `${logPrefix} Analysis failed:`, result.error);
        }
        return null;
      }
      
      // Parse the JSON response with error handling
      const analysis = this._parseAnalysisResponse(result.response);
      
      if (abortSignal?.aborted) {
        Logger.log('other', `${logPrefix} Analysis aborted after parsing`);
        return null;
      }
      
      if (!analysis) {
        // Parsing failed - retry if we haven't exhausted retries
        if (retryCount < maxRetries) {
          Logger.warn('other', `${logPrefix} Parsing failed, retrying (${retryCount + 1}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, 500)); // Brief delay before retry
          return this.analyzeQuery(userQuery, aiServiceSendMessage, abortSignal, retryCount + 1);
        }
        
        Logger.error('other', `${logPrefix} Failed to parse analysis after ${maxRetries} retries`);
        return null;
      }
      
      this.lastAnalysis = analysis;
      Logger.log('other', `${logPrefix} Analysis result:`, analysis);
      return analysis;
      
    } catch (error) {
      if (abortSignal?.aborted) {
        Logger.log('other', `${logPrefix} Analysis aborted (caught in exception)`);
        return null;
      }
      
      // On error, retry if we haven't exhausted retries
      if (retryCount < maxRetries) {
        Logger.warn('other', `${logPrefix} Analysis error, retrying (${retryCount + 1}/${maxRetries}):`, error.message);
        await new Promise(resolve => setTimeout(resolve, 500));
        return this.analyzeQuery(userQuery, aiServiceSendMessage, abortSignal, retryCount + 1);
      }
      
      Logger.error('other', `${logPrefix} Analysis failed after ${maxRetries} retries:`, error);
      return null;
    }
  }

  /**
   * Parse and validate the analysis response from AI
   * Handles various JSON formats and validates structure
   * @private
   * @param {string} response - Raw AI response
   * @returns {Object|null} Parsed analysis or null if invalid
   */
  _parseAnalysisResponse(response) {
    const logPrefix = '[DocumentInteractionService]';
    
    try {
      // Trim whitespace and remove excessive newlines
      let jsonStr = response.trim().replace(/\n\s*\n/g, '\n');
      
      // Remove markdown code blocks if present
      if (jsonStr.includes('```')) {
        jsonStr = jsonStr.replace(/```json?\n?/gi, '').replace(/```\n?$/g, '');
        jsonStr = jsonStr.trim();
      }
      
      // Remove any leading/trailing text before/after JSON object
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }
      
      // Try to fix common JSON issues
      jsonStr = this._sanitizeJSON(jsonStr);
      
      // Parse JSON
      const analysis = JSON.parse(jsonStr);
      
      // Validate structure
      if (!this._validateAnalysis(analysis)) {
        Logger.error('other', `${logPrefix} Invalid analysis structure:`, analysis);
        return null;
      }
      
      return analysis;
      
    } catch (error) {
      Logger.error('other', `${logPrefix} JSON parsing failed:`, error.message);
      Logger.error('other', `${logPrefix} Raw response:`, response.substring(0, 200));
      return null;
    }
  }

  /**
   * Sanitize JSON string to fix common issues
   * @private
   */
  _sanitizeJSON(jsonStr) {
    // Remove control characters (eslint-disable-next-line)
    // eslint-disable-next-line no-control-regex
    jsonStr = jsonStr.replace(/[\x00-\x1F\x7F]/g, '');
    
    // Fix unescaped quotes in strings (basic attempt)
    // This is tricky and not perfect, but helps with common cases
    
    // Remove trailing commas before closing braces/brackets
    jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
    
    return jsonStr;
  }

  /**
   * Validate analysis object structure
   * @private
   */
  _validateAnalysis(analysis) {
    if (!analysis || typeof analysis !== 'object') {
      return false;
    }
    
    // Required fields
    if (typeof analysis.needsContext !== 'boolean') {
      return false;
    }
    
    // contextType must be one of the valid values
    const validTypes = ['text', 'links', 'forms', 'images', 'tables', 'code', 'all', 'none'];
    if (!validTypes.includes(analysis.contextType)) {
      return false;
    }
    
    // selector must be a string (can be empty)
    if (typeof analysis.selector !== 'string') {
      return false;
    }
    
    // reason must be a string
    if (typeof analysis.reason !== 'string') {
      return false;
    }
    
    return true;
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
        case 'forms':
          context = this._extractForms(selector);
          break;
        case 'images':
          context = this._extractImages(selector);
          break;
        case 'tables':
          context = this._extractTables(selector);
          break;
        case 'code':
          context = this._extractCode(selector);
          break;
        case 'all':
          context = this._extractAll();
          break;
        default:
          context = this._extractText(selector || 'main, article, body');
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
   * @param {AbortSignal} abortSignal - Abort signal to cancel the operation
   * @returns {Promise<string|null>} Extracted context or null
   */
  async getContextForQuery(userQuery, aiServiceSendMessage, abortSignal = null) {
    const logPrefix = '[DocumentInteractionService]';
    
    if (abortSignal?.aborted) {
      Logger.log('other', `${logPrefix} getContextForQuery aborted before starting`);
      return null;
    }
    
    try {
      // Analyze what context is needed
      const analysis = await this.analyzeQuery(userQuery, aiServiceSendMessage, abortSignal);
      
      if (abortSignal?.aborted) {
        Logger.log('other', `${logPrefix} getContextForQuery aborted after analysis`);
        return null;
      }
      
      if (!analysis || !analysis.needsContext) {
        Logger.log('other', `${logPrefix} No context needed for query`);
        return null;
      }

      // Extract the context
      const context = this.extractContext(analysis);
      
      if (abortSignal?.aborted) {
        Logger.log('other', `${logPrefix} getContextForQuery aborted after extraction`);
        return null;
      }
      
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
      // Try the provided selector first
      let elements = selector ? document.querySelectorAll(selector) : [];
      
      // Comprehensive fallback chain if selector doesn't match
      if (elements.length === 0) {
        const fallbacks = [
          'main',
          'article',
          '[role="main"]',
          '.content',
          '.main-content',
          '.post-content',
          '.article-content',
          '#content',
          '#main',
          'body'
        ];
        
        for (const fallback of fallbacks) {
          elements = document.querySelectorAll(fallback);
          if (elements.length > 0) {
            Logger.log('other', `[DocumentInteractionService] Fallback to ${fallback} selector`);
            break;
          }
        }
      }
      
      if (elements.length === 0) {
        return 'No text content found on the page.';
      }

      const texts = Array.from(elements)
        .map(el => el.textContent.trim())
        .filter(text => text.length > 0)
        .slice(0, 50);

      return `Page Text Content:\n${texts.join('\n\n')}`;
    } catch (error) {
      Logger.error('DocumentInteractionService', 'Text extraction error:', error);
      return 'Error extracting text content.';
    }
  }

  /**
   * Extract links information
   * @private
   */
  _extractLinks(selector) {
    try {
      let links = selector ? document.querySelectorAll(selector) : [];
      
      // Fallback to common link selectors
      if (links.length === 0) {
        const fallbacks = ['a[href]', 'nav a', 'header a', '.navigation a', '.menu a', 'a'];
        for (const fallback of fallbacks) {
          links = document.querySelectorAll(fallback);
          if (links.length > 0) {
            Logger.log('other', `[DocumentInteractionService] Fallback to ${fallback} selector`);
            break;
          }
        }
      }
      
      if (links.length === 0) {
        return 'No links found on the page.';
      }

      const linkInfo = Array.from(links)
        .filter(link => link.href) // Only links with href
        .slice(0, 50)
        .map((link, i) => {
          const text = link.textContent.trim() || 'No text';
          const href = link.href;
          const title = link.title ? ` (${link.title})` : '';
          return `${i + 1}. "${text}"${title} -> ${href}`;
        })
        .join('\n');

      return `Page Links (${links.length} total):\n${linkInfo}`;
    } catch (error) {
      Logger.error('DocumentInteractionService', 'Link extraction error:', error);
      return 'Error extracting links.';
    }
  }

  /**
   * Extract form information
   * @private
   */
  _extractForms(selector) {
    try {
      let elements = selector ? document.querySelectorAll(selector) : [];
      
      // Fallback to common form selectors
      if (elements.length === 0) {
        elements = document.querySelectorAll('form, input, textarea, select, button[type="submit"]');
      }
      
      if (elements.length === 0) {
        return 'No forms or input fields found on the page.';
      }

      const formInfo = [];
      const forms = document.querySelectorAll('form');
      
      forms.forEach((form, i) => {
        const inputs = form.querySelectorAll('input, textarea, select');
        const buttons = form.querySelectorAll('button, input[type="submit"]');
        
        formInfo.push(`Form ${i + 1}:`);
        
        inputs.forEach(input => {
          const type = input.type || input.tagName.toLowerCase();
          const name = input.name || input.id || 'unnamed';
          const label = input.labels?.[0]?.textContent?.trim() || input.placeholder || '';
          formInfo.push(`  - ${type}: "${name}" ${label ? `(${label})` : ''}`);
        });
        
        buttons.forEach(btn => {
          formInfo.push(`  - Button: "${btn.textContent.trim() || btn.value || 'Submit'}"`);
        });
      });

      // Also list standalone inputs not in forms
      const standaloneInputs = document.querySelectorAll('input:not(form input), textarea:not(form textarea), select:not(form select)');
      if (standaloneInputs.length > 0) {
        formInfo.push('\nStandalone Input Fields:');
        Array.from(standaloneInputs).slice(0, 20).forEach(input => {
          const type = input.type || input.tagName.toLowerCase();
          const name = input.name || input.id || 'unnamed';
          const label = input.labels?.[0]?.textContent?.trim() || input.placeholder || '';
          formInfo.push(`  - ${type}: "${name}" ${label ? `(${label})` : ''}`);
        });
      }

      return `Page Forms and Input Fields:\n${formInfo.join('\n')}`;
    } catch (error) {
      Logger.error('DocumentInteractionService', 'Form extraction error:', error);
      return 'Error extracting form information.';
    }
  }

  /**
   * Extract image information
   * @private
   */
  _extractImages(selector) {
    try {
      let images = selector ? document.querySelectorAll(selector) : [];
      
      // Fallback to common image selectors
      if (images.length === 0) {
        images = document.querySelectorAll('img[src], picture img, figure img, img');
      }
      
      if (images.length === 0) {
        return 'No images found on the page.';
      }

      const imageInfo = Array.from(images)
        .filter(img => img.src)
        .slice(0, 30)
        .map((img, i) => {
          const alt = img.alt || 'No alt text';
          const src = img.src;
          const title = img.title ? ` (${img.title})` : '';
          const dimensions = img.naturalWidth && img.naturalHeight ? ` [${img.naturalWidth}x${img.naturalHeight}]` : '';
          return `${i + 1}. "${alt}"${title}${dimensions}\n   URL: ${src}`;
        })
        .join('\n');

      return `Page Images (${images.length} total):\n${imageInfo}`;
    } catch (error) {
      Logger.error('DocumentInteractionService', 'Image extraction error:', error);
      return 'Error extracting image information.';
    }
  }

  /**
   * Extract table data
   * @private
   */
  _extractTables(selector) {
    try {
      let tables = selector ? document.querySelectorAll(selector) : document.querySelectorAll('table');
      
      if (tables.length === 0) {
        return 'No tables found on the page.';
      }

      const tableInfo = [];
      
      Array.from(tables).slice(0, 5).forEach((table, i) => {
        tableInfo.push(`\nTable ${i + 1}:`);
        
        // Extract headers
        const headers = Array.from(table.querySelectorAll('th'))
          .map(th => th.textContent.trim())
          .filter(text => text.length > 0);
        
        if (headers.length > 0) {
          tableInfo.push(`Headers: ${headers.join(' | ')}`);
        }
        
        // Extract first few rows
        const rows = Array.from(table.querySelectorAll('tr')).slice(0, 10);
        rows.forEach((row, ri) => {
          const cells = Array.from(row.querySelectorAll('td'))
            .map(td => td.textContent.trim())
            .filter(text => text.length > 0);
          
          if (cells.length > 0) {
            tableInfo.push(`Row ${ri + 1}: ${cells.join(' | ')}`);
          }
        });
        
        if (table.querySelectorAll('tr').length > 10) {
          tableInfo.push(`... (${table.querySelectorAll('tr').length - 10} more rows)`);
        }
      });

      if (tables.length > 5) {
        tableInfo.push(`\n... (${tables.length - 5} more tables not shown)`);
      }

      return `Page Tables:\n${tableInfo.join('\n')}`;
    } catch (error) {
      Logger.error('DocumentInteractionService', 'Table extraction error:', error);
      return 'Error extracting table data.';
    }
  }

  /**
   * Extract code blocks
   * @private
   */
  _extractCode(selector) {
    try {
      let codeBlocks = selector ? document.querySelectorAll(selector) : [];
      
      // Fallback to common code selectors
      if (codeBlocks.length === 0) {
        codeBlocks = document.querySelectorAll('pre code, .code-block, .highlight, pre, code');
      }
      
      if (codeBlocks.length === 0) {
        return 'No code blocks found on the page.';
      }

      const codeInfo = [];
      
      Array.from(codeBlocks).slice(0, 20).forEach((block, i) => {
        const code = block.textContent.trim();
        const language = block.className.match(/language-(\w+)/)?.[1] || 
                        block.className.match(/lang-(\w+)/)?.[1] || 
                        'unknown';
        
        if (code.length > 0) {
          const preview = code.length > 200 ? code.substring(0, 200) + '...' : code;
          codeInfo.push(`\nCode Block ${i + 1} (${language}):\n${preview}`);
        }
      });

      if (codeBlocks.length > 20) {
        codeInfo.push(`\n... (${codeBlocks.length - 20} more code blocks not shown)`);
      }

      return `Page Code Blocks (${codeBlocks.length} total):${codeInfo.join('\n')}`;
    } catch (error) {
      Logger.error('DocumentInteractionService', 'Code extraction error:', error);
      return 'Error extracting code blocks.';
    }
  }

  /**
   * Extract all available context - comprehensive page analysis
   * @private
   */
  _extractAll() {
    const parts = [];
    
    // Basic page info
    parts.push(`=== PAGE INFORMATION ===`);
    parts.push(`Title: ${document.title}`);
    parts.push(`URL: ${window.location.href}`);
    
    // Main headings
    const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
      .slice(0, 15)
      .map(h => `${h.tagName}: ${h.textContent.trim()}`)
      .join('\n');
    if (headings) {
      parts.push(`\n=== HEADINGS ===\n${headings}`);
    }
    
    // Main content (prioritize semantic elements)
    const contentSelectors = ['main', 'article', '[role="main"]', '.content', '.main-content'];
    let mainContent = null;
    
    for (const sel of contentSelectors) {
      const element = document.querySelector(sel);
      if (element) {
        mainContent = element.textContent.trim().substring(0, 1500);
        parts.push(`\n=== MAIN CONTENT ===\n${mainContent}...`);
        break;
      }
    }
    
    // Navigation links
    const navLinks = Array.from(document.querySelectorAll('nav a, header a, .navigation a'))
      .slice(0, 15)
      .map(a => `- ${a.textContent.trim()} (${a.href})`)
      .join('\n');
    if (navLinks) {
      parts.push(`\n=== NAVIGATION ===\n${navLinks}`);
    }
    
    // Forms
    const forms = document.querySelectorAll('form');
    if (forms.length > 0) {
      parts.push(`\n=== FORMS ===\nFound ${forms.length} form(s) on the page`);
      Array.from(forms).slice(0, 3).forEach((form, i) => {
        const inputs = form.querySelectorAll('input, textarea, select');
        const inputList = Array.from(inputs).slice(0, 5).map(inp => 
          `${inp.type || inp.tagName.toLowerCase()}: ${inp.name || inp.id || 'unnamed'}`
        ).join(', ');
        if (inputList) {
          parts.push(`Form ${i + 1}: ${inputList}`);
        }
      });
    }
    
    // Images
    const images = document.querySelectorAll('img[src]');
    if (images.length > 0) {
      parts.push(`\n=== IMAGES ===\nFound ${images.length} image(s)`);
      const imageList = Array.from(images).slice(0, 10).map((img, i) => 
        `${i + 1}. ${img.alt || 'No alt'}`
      ).join('\n');
      if (imageList) {
        parts.push(imageList);
      }
    }
    
    // Tables
    const tables = document.querySelectorAll('table');
    if (tables.length > 0) {
      parts.push(`\n=== TABLES ===\nFound ${tables.length} table(s) on the page`);
    }
    
    // Code blocks
    const codeBlocks = document.querySelectorAll('pre code, .code-block, pre');
    if (codeBlocks.length > 0) {
      parts.push(`\n=== CODE BLOCKS ===\nFound ${codeBlocks.length} code block(s)`);
    }
    
    return parts.join('\n');
  }
}

// Export singleton instance
export default new DocumentInteractionService();
