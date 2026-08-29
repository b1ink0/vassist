/**
 * ZIP File Extraction Utility
 *
 * Generic utility for extracting ZIP archives.
 * No domain-specific logic - pure ZIP extraction.
 */

import JSZip from "jszip";
import Logger from "../services/LoggerService";

class ZipExtractor {
  /**
   * Extract all files from a ZIP archive
   * @param {File|Blob|ArrayBuffer} zipFile - ZIP file to extract
   * @returns {Promise<Map<string, ArrayBuffer>>} Map of filename -> ArrayBuffer
   */
  async extract(
    zipFile: File | Blob | ArrayBuffer,
  ): Promise<Map<string, ArrayBuffer>> {
    try {
      Logger.log("ZipExtractor", "Extracting ZIP archive...");

      const zip = new JSZip();
      const loadedZip = await zip.loadAsync(zipFile);

      const files = new Map();
      const filePromises: Array<Promise<void>> = [];

      loadedZip.forEach((relativePath, zipEntry) => {
        if (
          zipEntry.dir ||
          relativePath.startsWith("__MACOSX/") ||
          relativePath.startsWith(".")
        ) {
          return;
        }

        const promise = zipEntry
          .async("arraybuffer")
          .then((data: ArrayBuffer) => {
            files.set(relativePath, data);
          });

        filePromises.push(promise);
      });

      await Promise.all(filePromises);

      Logger.log("ZipExtractor", `Extracted ${files.size} files from ZIP`);
      return files;
    } catch (error) {
      const normalized =
        error instanceof Error ? error : new Error(String(error));
      Logger.error("ZipExtractor", "Failed to extract ZIP:", error);
      throw new Error(`ZIP extraction failed: ${normalized.message}`);
    }
  }

  /**
   * Get ZIP file info without full extraction
   * @param {File|Blob|ArrayBuffer} zipFile - ZIP file
   * @returns {Promise<{fileCount: number, fileList: string[], totalSize: number}>}
   */
  async getInfo(
    zipFile: File | Blob | ArrayBuffer,
  ): Promise<{ fileCount: number; fileList: string[]; totalSize: number }> {
    try {
      const zip = new JSZip();
      const loadedZip = await zip.loadAsync(zipFile);

      const fileList: string[] = [];
      let totalSize = 0;

      loadedZip.forEach((relativePath, zipEntry) => {
        if (
          !zipEntry.dir &&
          !relativePath.startsWith("__MACOSX/") &&
          !relativePath.startsWith(".")
        ) {
          fileList.push(relativePath);
          const zipEntryWithData = zipEntry as JSZip.JSZipObject & {
            _data?: { uncompressedSize?: number };
          };
          totalSize += zipEntryWithData._data?.uncompressedSize || 0;
        }
      });

      return {
        fileCount: fileList.length,
        fileList,
        totalSize,
      };
    } catch (error) {
      const normalized =
        error instanceof Error ? error : new Error(String(error));
      Logger.error("ZipExtractor", "Failed to get ZIP info:", error);
      throw new Error(`Failed to read ZIP: ${normalized.message}`);
    }
  }

  /**
   * Validate ZIP file can be opened
   * @param {File|Blob|ArrayBuffer} zipFile - ZIP file
   * @returns {Promise<boolean>} True if valid ZIP
   */
  async isValid(zipFile: File | Blob | ArrayBuffer): Promise<boolean> {
    try {
      const zip = new JSZip();
      await zip.loadAsync(zipFile);
      return true;
    } catch (error) {
      Logger.warn("ZipExtractor", "Invalid ZIP file:", error);
      return false;
    }
  }

  /**
   * Check if a file is a ZIP file based on content
   * @param {ArrayBuffer} data - File data
   * @returns {boolean} True if file appears to be a ZIP
   */
  isZipFile(data: ArrayBuffer): boolean {
    if (!data || data.byteLength < 4) {
      return false;
    }
    // Check ZIP file signature (PK header: 0x50 0x4B 0x03 0x04 or 0x50 0x4B 0x05 0x06)
    const view = new Uint8Array(data);
    return (
      view[0] === 0x50 &&
      view[1] === 0x4b &&
      ((view[2] === 0x03 && view[3] === 0x04) ||
        (view[2] === 0x05 && view[3] === 0x06))
    );
  }
}

// Create singleton instance
export const zipExtractor = new ZipExtractor();

export default zipExtractor;
