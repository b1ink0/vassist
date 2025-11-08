/**
 * DragDropService
 * 
 * Centralized service for handling ALL drag and drop operations.
 * Manages state, event handlers, parsing, validation, and callbacks.
 * Components ONLY need to pass element ref and simple action callbacks.
 */

import MediaExtractionService from './MediaExtractionService';
import Logger from './LoggerService';

class DragDropService {
  constructor(options = {}) {
    this.element = null;
    this.isDragOver = false;
    this.enabled = true;
    
    // Single callback that receives all data at once
    this.onProcessData = null; // Receives {text, images, audios, errors}
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
    
    Logger.log('DragDropService', 'Instance created');
  }

  /**
   * Attach to a DOM element with simple callbacks
   */
  attach(element, callbacks = {}) {
    if (this.element) {
      this.detach();
    }
    
    this.element = element;
    
    // Store callbacks - single onProcessData callback receives all data
    this.onProcessData = callbacks.onProcessData || null;
    this.onShowError = callbacks.onShowError || null;
    this.onSetDragOver = callbacks.onSetDragOver || null;
    this.checkVoiceMode = callbacks.checkVoiceMode || null;
    this.getCurrentCounts = callbacks.getCurrentCounts || (() => ({ images: 0, audios: 0 }));
    
    // Attach element-specific event listeners
    this.element.addEventListener('dragenter', this._handleDragEnter);
    this.element.addEventListener('dragover', this._handleDragOver);
    this.element.addEventListener('dragleave', this._handleDragLeave);
    this.element.addEventListener('drop', this._handleDrop);
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
      Logger.log('DragDropService', 'Detached from element');
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
    Logger.log('DragDropService', 'Drag enter');
    this._setDragState(true);
  }

  _handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    // Set dropEffect to indicate this is a valid drop target
    e.dataTransfer.dropEffect = 'copy';
  }

  _handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    
    // Only set to false if leaving the container entirely
    // Check if relatedTarget is null (left the window) or not contained in our element
    const isLeavingContainer = !e.relatedTarget || !this.element.contains(e.relatedTarget);
    
    if (isLeavingContainer) {
      Logger.log('DragDropService', 'Drag leave (exiting container)');
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

    Logger.log('DragDropService', 'Drop event received');

    // Get current counts
    const counts = this.getCurrentCounts();

    // Parse the drop
    const result = await this._parseDrop(e, counts);

    // Show errors
    if (result.errors.length > 0) {
      this._showError(result.errors[0]);
    }

    // Execute single callback with ALL data at once
    if (this.onProcessData) {
      this.onProcessData(result);
    }
  }

  /**
   * Set drag state and notify component
   */
  _setDragState(isDragOver) {
    if (this.isDragOver !== isDragOver) {
      this.isDragOver = isDragOver;
      Logger.log('DragDropService', 'Drag state changed:', isDragOver);
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
    Logger.log('DragDropService', 'Processing drop event');

    // Prepare input for MediaExtractionService
    const input = {};
    
    // Add files if present
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      input.files = e.dataTransfer.files;
      Logger.log('DragDropService', 'Drop contains files:', e.dataTransfer.files.length);
    }
    
    // Add HTML if present
    const htmlData = e.dataTransfer.getData('text/html');
    if (htmlData) {
      input.htmlString = htmlData;
      Logger.log('DragDropService', 'Drop contains HTML');
    }
    
    // Add text if present (and no HTML)
    const textData = e.dataTransfer.getData('text/plain');
    if (textData && !htmlData) {
      input.textString = textData;
      Logger.log('DragDropService', 'Drop contains text');
    }

    // Call single extraction method with limits
    const result = await MediaExtractionService.processAndExtract(input, {
      maxImages: this.maxImages,
      maxAudios: this.maxAudios,
      currentImageCount: currentCounts.images,
      currentAudioCount: currentCounts.audios
    });

    Logger.log('DragDropService', 'Parse result:', {
      textLength: result.text.length,
      imageCount: result.images.length,
      audioCount: result.audios.length,
      errorCount: result.errors.length
    });

    return result;
  }
}

export default DragDropService;
