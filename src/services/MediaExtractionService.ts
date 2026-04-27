/**
 * Service for extracting media elements (images, audios) from DOM/HTML
 * Used by both AIToolbar (selection) and DragDropService (HTML drops)
 */
import Logger from './LoggerService';
class MediaExtractionService {
  /**
   * MAIN METHOD: Process and extract media from any input source
   * Handles Files, HTML string, DOM container, or Selection - returns ready-to-use data
   * 
   * @param {Object} input - Input configuration
   * @param {FileList|Array<File>} [input.files] - File objects to process
   * @param {string} [input.htmlString] - HTML string to parse
   * @param {string} [input.textString] - Plain text string
   * @param {HTMLElement|Document} [input.container] - DOM container to search
   * @param {Selection} [input.selection] - Browser selection object
   * @param {Object} [options] - Processing options
   * @param {number} [options.maxImages] - Maximum images to extract
   * @param {number} [options.maxAudios] - Maximum audios to extract
   * @param {number} [options.currentImageCount=0] - Current image count (for limit checking)
   * @param {number} [options.currentAudioCount=0] - Current audio count (for limit checking)
   * @returns {Promise<{text: string, images: Array, audios: Array, errors: Array}>}
   */
  static async processAndExtract(input = {}, options = {}) {
    const result = {
      text: '',
      images: [],
      audios: [],
      errors: []
    };

    const {
      maxImages = Infinity,
      maxAudios = Infinity,
      currentImageCount = 0,
      currentAudioCount = 0
    } = options;

    try {
      // STEP 1: Gather all media items into a unified array
      let mediaItems = []; // Format: {type: 'image'|'audio', name, size, src?, file?}
      
      if (input.files && input.files.length > 0) {
        // From File objects
        mediaItems = Array.from(input.files)
          .filter(file => file.type.startsWith('image/') || file.type.startsWith('audio/'))
          .map(file => ({
            type: file.type.startsWith('image/') ? 'image' : 'audio',
            name: file.name,
            size: file.size,
            file: file // Keep File reference for fileToDataUrl
          }));
      } else if (input.htmlString) {
        // From HTML string
        const parser = new DOMParser();
        const doc = parser.parseFromString(input.htmlString, 'text/html');
        const media = this._extractMediaFromContainer(doc.body, null);
        
        mediaItems = [
          ...media.images.map(img => ({ type: 'image', name: img.name, size: 0, src: img.src })),
          ...media.audios.map(aud => ({ type: 'audio', name: aud.name, size: 0, src: aud.src }))
        ];
        
        // Extract text
        const textContent = doc.body.textContent || doc.body.innerText || '';
        if (textContent.trim()) {
          result.text = textContent.trim();
        }
      } else if (input.container) {
        // From DOM container/selection
        const media = this._extractMediaFromContainer(input.container, input.selection);
        
        mediaItems = [
          ...media.images.map(img => ({ type: 'image', name: img.name, size: 0, src: img.src })),
          ...media.audios.map(aud => ({ type: 'audio', name: aud.name, size: 0, src: aud.src }))
        ];
        
        // Extract text from selection
        if (input.selection) {
          const text = input.selection.toString().trim();
          if (text) {
            result.text = text;
          }
        }
      }
      
      // Process plain text
      if (input.textString && !result.text) {
        result.text = input.textString.trim();
      }
      
      // STEP 2: Process all media items in ONE unified loop
      for (const item of mediaItems) {
        const isImage = item.type === 'image';
        const targetArray = isImage ? result.images : result.audios;
        const currentCount = isImage ? currentImageCount : currentAudioCount;
        const maxCount = isImage ? maxImages : maxAudios;
        
        // Check limit
        if (currentCount + targetArray.length >= maxCount) {
          result.errors.push(`Maximum ${maxCount} ${isImage ? 'images' : 'audio files'} allowed`);
          break;
        }
        
        try {
          // Convert to dataUrl (conditionally choose converter based on source)
          const dataUrl = item.file 
            ? await this.fileToDataUrl(item.file)
            : await this.urlToDataUrl(item.src);
          
          targetArray.push({
            dataUrl,
            name: item.name,
            size: item.size,
            type: item.type
          });
        } catch (error) {
          Logger.error('MediaExtractionService', 'Failed to convert ${item.type}:', error);
          // Silently skip failed items
        }
      }

    } catch (error) {
      Logger.error('MediaExtractionService', 'Error processing input:', error);
      result.errors.push('Failed to process content');
    }

    return result;
  }

  /**
   * Internal: Extract media from a DOM container
   * @private
   */
  static _extractMediaFromContainer(container, selection = null) {
    const images = [];
    const audios = [];
    
    // Extract images
    const imgElements = container?.querySelectorAll('img') || [];
    imgElements.forEach(img => {
      if (selection && !selection.containsNode(img, true)) {
        return;
      }
      
      const src = img.src || img.currentSrc;
      if (src) {
        images.push({
          src,
          name: img.alt || img.title || 'Image',
          type: 'image'
        });
      }
    });
    
    // Extract audios
    const audioElements = container?.querySelectorAll('audio') || [];
    audioElements.forEach(audio => {
      if (selection && !selection.containsNode(audio, true)) {
        return;
      }
      
      const src = audio.src || audio.currentSrc || audio.querySelector('source')?.src;
      if (src) {
        audios.push({
          src,
          name: audio.title || 'Audio',
          type: 'audio'
        });
      }
    });
    
    return { images, audios };
  }

  /**
   * Convert URL to Data URL (fetch and convert to base64)
   * @param {string} url - URL to convert
   * @returns {Promise<string>} Data URL
   */
  static async urlToDataUrl(url) {
    if (url.startsWith('data:')) {
      return url;
    }

    try {
      const response = await fetch(url);
      const blob = await response.blob();
      
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      Logger.error('MediaExtractionService', 'Failed to convert URL to dataURL:', error);
      return url;
    }
  }

  /**
   * Convert File/Blob to Data URL
   * @param {File|Blob} file - File or Blob to convert
   * @returns {Promise<string>} Data URL
   */
  static fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
}

export default MediaExtractionService;
