/**
 * UtilService
 * 
 * Singleton utility service for common operations across the app.
 */

import Logger from './Logger';
class UtilService {
  constructor() {
    if (UtilService.instance) {
      return UtilService.instance;
    }
    UtilService.instance = this;
  }

  /**
   * Copy text to clipboard using modern API with fallback
   * @param {string} text - Text to copy
   * @returns {Promise<boolean>} - Success status
   */
  async copyToClipboard(text) {
    try {
      // Modern Clipboard API (preferred)
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        Logger.log('UtilService', 'Text copied using Clipboard API');
        return true;
      }
      
      // Fallback for older browsers or insecure contexts
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      try {
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        
        if (successful) {
          Logger.log('UtilService', 'Text copied using execCommand fallback');
          return true;
        } else {
          Logger.error('UtilService', 'execCommand copy failed');
          return false;
        }
      } catch (err) {
        document.body.removeChild(textArea);
        Logger.error('UtilService', 'Fallback copy failed:', err);
        return false;
      }
    } catch (error) {
      Logger.error('UtilService', 'Copy to clipboard failed:', error);
      return false;
    }
  }
}

// Create and export singleton instance
const instance = new UtilService();

export default instance;
