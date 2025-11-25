/**
 * ZIP File Extraction Utility
 * 
 * Generic utility for extracting ZIP archives.
 * No domain-specific logic - pure ZIP extraction.
 */

import JSZip from 'jszip';
import Logger from '../services/LoggerService';

class ZipExtractor {
  /**
   * Extract all files from a ZIP archive
   * @param {File|Blob|ArrayBuffer} zipFile - ZIP file to extract
   * @returns {Promise<Map<string, ArrayBuffer>>} Map of filename -> ArrayBuffer
   */
  async extract(zipFile) {
    try {
      Logger.log('ZipExtractor', 'Extracting ZIP archive...');
      
      const zip = new JSZip();
      const loadedZip = await zip.loadAsync(zipFile);
      
      const files = new Map();
      const filePromises = [];
      
      loadedZip.forEach((relativePath, zipEntry) => {
        if (zipEntry.dir || relativePath.startsWith('__MACOSX/') || relativePath.startsWith('.')) {
          return;
        }
        
        const promise = zipEntry.async('arraybuffer').then(data => {
          files.set(relativePath, data);
        });
        
        filePromises.push(promise);
      });
      
      await Promise.all(filePromises);
      
      Logger.log('ZipExtractor', `Extracted ${files.size} files from ZIP`);
      return files;
      
    } catch (error) {
      Logger.error('ZipExtractor', 'Failed to extract ZIP:', error);
      throw new Error(`ZIP extraction failed: ${error.message}`);
    }
  }

  /**
   * Get ZIP file info without full extraction
   * @param {File|Blob|ArrayBuffer} zipFile - ZIP file
   * @returns {Promise<{fileCount: number, fileList: string[], totalSize: number}>}
   */
  async getInfo(zipFile) {
    try {
      const zip = new JSZip();
      const loadedZip = await zip.loadAsync(zipFile);
      
      const fileList = [];
      let totalSize = 0;
      
      loadedZip.forEach((relativePath, zipEntry) => {
        if (!zipEntry.dir && !relativePath.startsWith('__MACOSX/') && !relativePath.startsWith('.')) {
          fileList.push(relativePath);
          totalSize += zipEntry._data?.uncompressedSize || 0;
        }
      });
      
      return {
        fileCount: fileList.length,
        fileList,
        totalSize
      };
      
    } catch (error) {
      Logger.error('ZipExtractor', 'Failed to get ZIP info:', error);
      throw new Error(`Failed to read ZIP: ${error.message}`);
    }
  }

  /**
   * Validate ZIP file can be opened
   * @param {File|Blob|ArrayBuffer} zipFile - ZIP file
   * @returns {Promise<boolean>} True if valid ZIP
   */
  async isValid(zipFile) {
    try {
      const zip = new JSZip();
      await zip.loadAsync(zipFile);
      return true;
    } catch (error) {
      Logger.warn('ZipExtractor', 'Invalid ZIP file:', error);
      return false;
    }
  }
}

// Create singleton instance
export const zipExtractor = new ZipExtractor();

export default zipExtractor;
