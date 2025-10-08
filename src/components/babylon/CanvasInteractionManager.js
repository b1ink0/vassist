import { Vector3, Matrix } from '@babylonjs/core';

/**
 * CanvasInteractionManager - Click-through canvas with selective model interaction
 * 
 * PROBLEM:
 * - Canvas blocks background HTML interaction (text selection, clicks)
 * - But we need to drag the 3D model
 * 
 * SOLUTION (pointer-events:none + dynamic enable):
 * - Canvas has pointer-events:none by default (click-through enabled)
 * - On document mousemove: temporarily enable pointer-events to check if over model
 * - If over model: keep pointer-events:auto and handle drag
 * - If NOT over model: restore pointer-events:none (background interactable)
 * 
 * This approach:
 * ✅ Allows text selection and clicks on background HTML
 * ✅ Enables model dragging when cursor is over model
 * ✅ No interference with rapid clicking or selection
 */
export class CanvasInteractionManager {
  /**
   * @param {Scene} scene - Babylon.js scene
   * @param {HTMLCanvasElement} canvas - Canvas element
   * @param {Mesh} modelMesh - The model mesh (parent)
   */
  constructor(scene, canvas, modelMesh) {
    this.scene = scene;
    this.canvas = canvas;
    this.modelMesh = modelMesh;
    
    // Drag state
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.lastX = 0;
    this.lastY = 0;
    
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
    
    console.log('[CanvasInteractionManager] Initialized with pointer-events switching');
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
    
    // Canvas event listeners (only active when pointer-events:auto)
    this.canvas.addEventListener('pointerdown', this.handleCanvasPointerDown);
    this.canvas.addEventListener('pointermove', this.handleCanvasPointerMove);
    this.canvas.addEventListener('pointerup', this.handleCanvasPointerUp);
    this.canvas.addEventListener('pointercancel', this.handleCanvasPointerUp);
    
    console.log('[CanvasInteractionManager] Initialized - canvas starts as click-through');
  }
  
  /**
   * Handle document mouse move - detect if over model (works even with pointer-events:none)
   */
  handleDocumentMouseMove(event) {
    // Skip if currently dragging (canvas already has pointer-events:auto)
    if (this.isDragging) return;
    
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
   * Handle canvas pointer down - start drag (only called when pointer-events:auto)
   */
  handleCanvasPointerDown(event) {
    // Only left button
    if (event.button !== 0) return;
    
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Double-check we're clicking on model
    const pickResult = this.scene.pick(x, y);
    const clickedOnModel = pickResult.hit && this.isModelMesh(pickResult.pickedMesh);
    
    if (clickedOnModel) {
      // Start drag
      this.isDragging = true;
      this.dragStartX = event.clientX;
      this.dragStartY = event.clientY;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      
      // Update cursor
      this.canvas.style.cursor = 'grabbing';
      
      if (this.onDragStartCallback) {
        this.onDragStartCallback(event.clientX, event.clientY);
      }
      
      console.log('[CanvasInteractionManager] Drag started');
    }
  }
  
  /**
   * Handle canvas pointer move - handle drag movement (only called when pointer-events:auto)
   */
  handleCanvasPointerMove(event) {
    if (!this.isDragging) return;
    
    const deltaX = event.clientX - this.lastX;
    const deltaY = event.clientY - this.lastY;
    
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    
    if (this.onDragCallback) {
      this.onDragCallback(deltaX, deltaY);
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
    
    if (this.onDragEndCallback) {
      this.onDragEndCallback(event.clientX, event.clientY);
    }
    
    console.log('[CanvasInteractionManager] Drag ended');
  }
  
  /**
   * Check if a mesh belongs to the model
   */
  isModelMesh(mesh) {
    if (!mesh) return false;
    
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
    
    console.log('[CanvasInteractionManager] Disposed');
  }
}
