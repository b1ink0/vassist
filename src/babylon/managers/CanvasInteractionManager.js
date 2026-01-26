import { Vector3, Matrix } from '@babylonjs/core';
import Logger from '../../services/LoggerService';

/**
 * CanvasInteractionManager - Click-through canvas with selective model interaction
 */
export class CanvasInteractionManager {
  /**
   * @param {Scene} scene - Babylon.js scene
   * @param {HTMLCanvasElement} canvas - Canvas element
   * @param {Mesh} modelMesh - The model mesh (parent)
   * @param {boolean} isDesktop - Whether running in Electron desktop mode
   * @param {Object} desktopAPI - Electron API from DesktopContext (desktop mode only)
   */
  constructor(scene, canvas, modelMesh, isDesktop = false, desktopAPI = null) {
    this.scene = scene;
    this.canvas = canvas;
    this.modelMesh = modelMesh;
    this.isDesktop = isDesktop;
    this.desktopAPI = desktopAPI;
    
    // Drag state
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.lastX = 0;
    this.lastY = 0;
    
    // Desktop mode
    this.windowX = 0;
    this.windowY = 0;
    
    // Model detection
    this.isOverModel = false;
    
    // Callbacks
    this.onDragStartCallback = null;
    this.onDragCallback = null;
    this.onDragEndCallback = null;
    
    // Event handlers (bound to this instance)
    this.handleDocumentMouseMove = this.handleDocumentMouseMove.bind(this);
    this.handleCanvasPointerDown = this.handleCanvasPointerDown.bind(this);
    this.handleCanvasPointerMove = this.handleCanvasPointerMove.bind(this);
    this.handleCanvasPointerUp = this.handleCanvasPointerUp.bind(this);
    
    Logger.log('CanvasInteractionManager', `Initialized (${isDesktop ? 'Desktop' : 'Web'} mode)`);
  }
  
  /**
   * Initialize the interaction manager
   */
  initialize() {
    // Start with canvas as click-through (pointer-events: none)
    this.canvas.style.pointerEvents = 'none';
    
    // Listen to document mouse move to detect when over model
    // This works even when canvas has pointer-events:none
    document.addEventListener('mousemove', this.handleDocumentMouseMove);
    
    // Canvas event listeners
    this.canvas.addEventListener('pointerdown', this.handleCanvasPointerDown);
    this.canvas.addEventListener('pointermove', this.handleCanvasPointerMove);
    this.canvas.addEventListener('pointerup', this.handleCanvasPointerUp);
    this.canvas.addEventListener('pointercancel', this.handleCanvasPointerUp);
    
    Logger.log('CanvasInteractionManager', 'Initialized');
  }
  
  /**
   * Handle document mouse move - detect if over model
   */
  handleDocumentMouseMove(event) {
    // Skip if currently dragging (canvas already has pointer-events:auto)
    if (this.isDragging) return;
    if (this.scene.metadata?.isCameraLocked && !this.scene.metadata.isCameraLocked()) {
      // Camera is unlocked, don't interfere with pointer events
      return;
    }
    
    // Get canvas position
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Check if mouse is even over the canvas bounds
    if (x < 0 || x > rect.width || y < 0 || y > rect.height) {
      // Mouse is outside canvas - ensure click-through
      if (this.canvas.style.pointerEvents !== 'none') {
        this.canvas.style.pointerEvents = 'none';
        this.canvas.style.cursor = 'default';
      }
      this.isOverModel = false;
      return;
    }
    
    // Temporarily enable pointer events to do picking
    this.canvas.style.pointerEvents = 'auto';
    const pickResult = this.scene.pick(x, y);
    
    // Check if over model
    const overModel = pickResult.hit && this.isModelMesh(pickResult.pickedMesh);
    
    if (overModel) {
      // Over model - keep pointer-events:auto and show grab cursor
      this.isOverModel = true;
      this.canvas.style.cursor = 'grab';
    } else {
      // Not over model - restore click-through
      this.canvas.style.pointerEvents = 'none';
      this.canvas.style.cursor = 'default';
      this.isOverModel = false;
    }
  }
  
  /**
   * Handle canvas pointer down - start drag
   */
  async handleCanvasPointerDown(event) {
    // Only left button
    if (event.button !== 0) return;
    
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Check if clicking on model
    const pickResult = this.scene.pick(x, y);
    const clickedOnModel = pickResult.hit && this.isModelMesh(pickResult.pickedMesh);
    
    if (clickedOnModel) {
      // Get initial window position for desktop mode
      if (this.isDesktop && this.desktopAPI?.window?.getPosition) {
        try {
          const pos = await this.desktopAPI.window.getPosition();
          this.windowX = pos.x;
          this.windowY = pos.y;
        } catch (error) {
          Logger.error('CanvasInteractionManager', 'Failed to get window position:', error);
        }
      }
      
      // Start drag
      this.isDragging = true;
      // For desktop mode, use screen coordinates (absolute) instead of client (window-relative)
      this.dragStartX = this.isDesktop ? event.screenX : event.clientX;
      this.dragStartY = this.isDesktop ? event.screenY : event.clientY;
      this.lastX = this.isDesktop ? event.screenX : event.clientX;
      this.lastY = this.isDesktop ? event.screenY : event.clientY;
      
      // Update cursor
      this.canvas.style.cursor = 'grabbing';
      
      // Emit drag start event
      window.dispatchEvent(new CustomEvent('modelDragStart'));
      
      if (this.onDragStartCallback) {
        this.onDragStartCallback(event.clientX, event.clientY);
      }
      
      Logger.log('CanvasInteractionManager', `Drag started (${this.isDesktop ? 'window' : 'model'} drag)`);
    }
  }
  
  /**
   * Handle canvas pointer move - handle drag movement
   */
  handleCanvasPointerMove(event) {
    if (!this.isDragging) return;
    
    const currentX = this.isDesktop ? event.screenX : event.clientX;
    const currentY = this.isDesktop ? event.screenY : event.clientY;
    
    const deltaX = currentX - this.lastX;
    const deltaY = currentY - this.lastY;
    
    this.lastX = currentX;
    this.lastY = currentY;
    
    if (this.isDesktop) {
      this.windowX += deltaX;
      this.windowY += deltaY;
      
      if (this.desktopAPI?.window?.setPosition) {
        this.desktopAPI.window.setPosition(Math.floor(this.windowX), Math.floor(this.windowY)).catch(error => {
          Logger.error('CanvasInteractionManager', 'Failed to move window:', error);
        });
      }
    } else {
      if (this.onDragCallback) {
        this.onDragCallback(deltaX, deltaY);
      }
    }
  }
  
  /**
   * Handle canvas pointer up - end drag
   */
  handleCanvasPointerUp(event) {
    if (!this.isDragging) return;
    
    this.isDragging = false;
    
    // Restore cursor
    this.canvas.style.cursor = this.isOverModel ? 'grab' : 'default';
    
    // Emit drag end event for UI components to hide drag visual
    window.dispatchEvent(new CustomEvent('modelDragEnd'));
    
    if (this.onDragEndCallback) {
      this.onDragEndCallback(event.clientX, event.clientY);
    }
    
    Logger.log('CanvasInteractionManager', 'Drag ended');
  }
  
  /**
   * Check if a mesh belongs to the model or is the picking box
   * In Portrait Mode, ONLY the picking box should be draggable (not the invisible clipped body)
   */
  isModelMesh(mesh) {
    if (!mesh) return false;
    
    // Check if it's the picking box
    if (mesh.metadata && mesh.metadata.isPickingBox) return true;
    
    // In Portrait Mode, ONLY the picking box is draggable
    const isPortraitMode = this.scene.metadata?.isPortraitMode || false;
    if (isPortraitMode) {
      return false;
    }
    
    // Check if it's the model itself
    if (mesh === this.modelMesh) return true;
    
    // Check if it's a child of the model
    let parent = mesh.parent;
    while (parent) {
      if (parent === this.modelMesh) return true;
      parent = parent.parent;
    }
    
    return false;
  }
  
  /**
   * Set drag callbacks
   * @param {Function} onStart - Called when drag starts (x, y)
   * @param {Function} onDrag - Called during drag (deltaX, deltaY)
   * @param {Function} onEnd - Called when drag ends (x, y)
   */
  setDragCallbacks(onStart, onDrag, onEnd) {
    this.onDragStartCallback = onStart;
    this.onDragCallback = onDrag;
    this.onDragEndCallback = onEnd;
  }
  
  /**
   * Enable/disable interaction
   */
  setEnabled(enabled) {
    if (this.isDesktop) {
      // Desktop mode: canvas always has pointer-events:auto
      return;
    }
    
    if (enabled) {
      document.addEventListener('mousemove', this.handleDocumentMouseMove);
    } else {
      document.removeEventListener('mousemove', this.handleDocumentMouseMove);
      this.canvas.style.pointerEvents = 'none';
    }
  }
  
  /**
   * Clean up
   */
  dispose() {
    // Remove event listeners
    document.removeEventListener('mousemove', this.handleDocumentMouseMove);
    this.canvas.removeEventListener('pointerdown', this.handleCanvasPointerDown);
    this.canvas.removeEventListener('pointermove', this.handleCanvasPointerMove);
    this.canvas.removeEventListener('pointerup', this.handleCanvasPointerUp);
    this.canvas.removeEventListener('pointercancel', this.handleCanvasPointerUp);
    
    // Reset canvas style
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.cursor = 'default';
    
    Logger.log('CanvasInteractionManager', 'Disposed');
  }
}
