/**
 * DragDropService
 * 
 * Centralized service for handling ALL drag and drop operations.
 * Manages state, event handlers, parsing, validation, and callbacks.
 * Components ONLY need to pass element ref and simple action callbacks.
 */

class DragDropService {
  constructor(options = {}) {
    this.element = null;
    this.isDragOver = false;
    this.enabled = true;
    
    // Simple action callbacks (what component should DO with the data)
    this.onAddText = null;
    this.onAddImages = null;
    this.onAddAudios = null;
    this.onShowError = null;
    this.onSetDragOver = null;
    this.checkVoiceMode = null;
    this.getCurrentCounts = null;
    
    // Options
    this.maxImages = options.maxImages || 3;
    this.maxAudios = options.maxAudios || 1;
    
    // Bound handlers
    this._handleDragEnter = this._handleDragEnter.bind(this);
    this._handleDragOver = this._handleDragOver.bind(this);
    this._handleDragLeave = this._handleDragLeave.bind(this);
    this._handleDrop = this._handleDrop.bind(this);
    
    console.log('[DragDropService] Instance created');
  }

  /**
   * Attach to a DOM element with simple callbacks
   */
  attach(element, callbacks = {}) {
    if (this.element) {
      this.detach();
    }
    
    this.element = element;
    
    // Store simple action callbacks
    this.onAddText = callbacks.onAddText || null;
    this.onAddImages = callbacks.onAddImages || null;
    this.onAddAudios = callbacks.onAddAudios || null;
    this.onShowError = callbacks.onShowError || null;
    this.onSetDragOver = callbacks.onSetDragOver || null;
    this.checkVoiceMode = callbacks.checkVoiceMode || null;
    this.getCurrentCounts = callbacks.getCurrentCounts || (() => ({ images: 0, audios: 0 }));
    
    // Attach element-specific event listeners
    this.element.addEventListener('dragenter', this._handleDragEnter);
    this.element.addEventListener('dragover', this._handleDragOver);
    this.element.addEventListener('dragleave', this._handleDragLeave);
    this.element.addEventListener('drop', this._handleDrop);
    
    console.log('[DragDropService] Attached to element');
  }

  /**
   * Detach from current element
   */
  detach() {
    if (this.element) {
      this.element.removeEventListener('dragenter', this._handleDragEnter);
      this.element.removeEventListener('dragover', this._handleDragOver);
      this.element.removeEventListener('dragleave', this._handleDragLeave);
      this.element.removeEventListener('drop', this._handleDrop);
      
      this.element = null;
      console.log('[DragDropService] Detached from element');
    }
  }

  /**
   * Update options
   */
  setOptions(options) {
    if (options.maxImages !== undefined) this.maxImages = options.maxImages;
    if (options.maxAudios !== undefined) this.maxAudios = options.maxAudios;
    if (options.checkVoiceMode) this.checkVoiceMode = options.checkVoiceMode;
    if (options.getCurrentCounts) this.getCurrentCounts = options.getCurrentCounts;
  }

  /**
   * Private event handlers
   */
  _handleDragEnter(e) {
    e.preventDefault();
    e.stopPropagation();
    this._setDragState(true);
  }

  _handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  _handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    
    // Only set to false if leaving the container entirely
    if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget)) {
      this._setDragState(false);
    }
  }

  async _handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    this._setDragState(false);

    // Check voice mode
    if (this.checkVoiceMode && this.checkVoiceMode()) {
      this._showError('Cannot attach files in voice mode');
      return;
    }

    console.log('[DragDropService] Drop event received');

    // Get current counts
    const counts = this.getCurrentCounts();

    // Parse the drop
    const result = await this._parseDrop(e, counts);

    // Show errors
    if (result.errors.length > 0) {
      this._showError(result.errors[0]);
    }

    // Execute callbacks with parsed data
    if (result.text && this.onAddText) {
      this.onAddText(result.text);
    }

    if (result.images.length > 0 && this.onAddImages) {
      this.onAddImages(result.images);
    }

    if (result.audios.length > 0 && this.onAddAudios) {
      this.onAddAudios(result.audios);
    }
  }

  /**
   * Set drag state and notify component
   */
  _setDragState(isDragOver) {
    if (this.isDragOver !== isDragOver) {
      this.isDragOver = isDragOver;
      if (this.onSetDragOver) {
        this.onSetDragOver(isDragOver);
      }
    }
  }

  /**
   * Show error to component
   */
  _showError(message) {
    if (this.onShowError) {
      this.onShowError(message);
    }
  }

  /**
   * Parse dropped data from drag event
   */
  async _parseDrop(e, currentCounts = { images: 0, audios: 0 }) {
    const result = {
      text: '',
      images: [],
      audios: [],
      errors: []
    };

    try {
      // Handle files from dataTransfer
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        console.log('[DragDropService] Processing dropped files:', e.dataTransfer.files.length);
        
        for (const file of e.dataTransfer.files) {
          if (file.type.startsWith('image/')) {
            // Check image limit
            if (currentCounts.images + result.images.length >= this.maxImages) {
              result.errors.push(`Maximum ${this.maxImages} images allowed`);
              break;
            }
            
            try {
              const dataUrl = await this._fileToDataUrl(file);
              result.images.push({
                dataUrl: dataUrl,
                name: file.name,
                size: file.size,
                type: 'image'
              });
              console.log('[DragDropService] Added image:', file.name);
            } catch (error) {
              console.error('[DragDropService] Failed to read image:', error);
              result.errors.push('Failed to read image file');
            }
          } else if (file.type.startsWith('audio/')) {
            // Check audio limit
            if (currentCounts.audios + result.audios.length >= this.maxAudios) {
              result.errors.push(`Maximum ${this.maxAudios} audio file allowed`);
              break;
            }
            
            try {
              const dataUrl = await this._fileToDataUrl(file);
              result.audios.push({
                dataUrl: dataUrl,
                name: file.name,
                size: file.size,
                type: 'audio'
              });
              console.log('[DragDropService] Added audio:', file.name);
            } catch (error) {
              console.error('[DragDropService] Failed to read audio:', error);
              result.errors.push('Failed to read audio file');
            }
          }
        }
      }

      // Handle text/html from dataTransfer
      const htmlData = e.dataTransfer.getData('text/html');
      const textData = e.dataTransfer.getData('text/plain');

      if (htmlData) {
        console.log('[DragDropService] Processing HTML data');
        
        // Parse HTML to extract images and text
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlData, 'text/html');
        
        // Extract images from HTML
        const imgElements = doc.querySelectorAll('img');
        for (const img of imgElements) {
          // Check image limit
          if (currentCounts.images + result.images.length >= this.maxImages) {
            result.errors.push(`Maximum ${this.maxImages} images allowed`);
            break;
          }
          
          const src = img.src;
          if (src && (src.startsWith('data:') || src.startsWith('http'))) {
            try {
              // Convert to data URL if it's a regular URL
              let dataUrl = src;
              if (src.startsWith('http')) {
                dataUrl = await this._urlToDataUrl(src);
              }
              
              // Extract filename from src or generate one
              let filename = 'dropped-image.png';
              if (src.startsWith('http')) {
                const urlPath = new URL(src).pathname;
                filename = urlPath.split('/').pop() || 'dropped-image.png';
              } else if (img.alt) {
                filename = img.alt + '.png';
              }
              
              result.images.push({
                dataUrl: dataUrl,
                name: filename,
                size: 0,
                type: 'image'
              });
              console.log('[DragDropService] Added image from HTML');
            } catch (error) {
              console.error('[DragDropService] Failed to fetch image:', error);
            }
          }
        }
        
        // Extract text content
        const textContent = doc.body.textContent || doc.body.innerText || '';
        if (textContent.trim()) {
          result.text = textContent.trim();
        }
      } else if (textData) {
        console.log('[DragDropService] Processing text data');
        result.text = textData.trim();
      }

    } catch (error) {
      console.error('[DragDropService] Error parsing drop:', error);
      result.errors.push('Failed to process dropped content');
    }

    console.log('[DragDropService] Parse result:', {
      textLength: result.text.length,
      imageCount: result.images.length,
      audioCount: result.audios.length,
      errorCount: result.errors.length
    });

    return result;
  }

  /**
   * Convert File to Data URL
   */
  _fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * Convert URL to Data URL (fetch and convert)
   */
  async _urlToDataUrl(url) {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return await this._fileToDataUrl(blob);
    } catch (error) {
      console.error('[DragDropService] Failed to fetch URL:', error);
      throw error;
    }
  }
}

export default DragDropService;
