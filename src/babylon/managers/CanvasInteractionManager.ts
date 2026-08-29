import Logger from "../../services/LoggerService";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Node } from "@babylonjs/core/node";
import type { SceneWithMetadata, DesktopApiLike } from "../types";

type DragStartCallback = (x: number, y: number) => void;
type DragMoveCallback = (deltaX: number, deltaY: number) => void;
type DragEndCallback = (x: number, y: number) => void;

/**
 * CanvasInteractionManager - Click-through canvas with selective model interaction
 */
export class CanvasInteractionManager {
  private readonly scene: SceneWithMetadata;
  private readonly canvas: HTMLCanvasElement;
  private readonly modelMesh: Mesh | AbstractMesh | null;
  private readonly isDesktop: boolean;
  private readonly desktopAPI: DesktopApiLike | null;

  private isDragging: boolean;
  private dragStartX: number;
  private dragStartY: number;
  private lastX: number;
  private lastY: number;

  private windowX: number;
  private windowY: number;

  private isOverModel: boolean;

  private onDragStartCallback: DragStartCallback | null;
  private onDragCallback: DragMoveCallback | null;
  private onDragEndCallback: DragEndCallback | null;

  /**
   * @param {Scene} scene - Babylon.js scene
   * @param {HTMLCanvasElement} canvas - Canvas element
   * @param {Mesh} modelMesh - The model mesh (parent)
   * @param {boolean} isDesktop - Whether running in Electron desktop mode
   * @param {Object} desktopAPI - Electron API from DesktopContext (desktop mode only)
   */
  constructor(
    scene: SceneWithMetadata,
    canvas: HTMLCanvasElement,
    modelMesh: Mesh | AbstractMesh | null,
    isDesktop = false,
    desktopAPI: DesktopApiLike | null = null,
  ) {
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

    Logger.log(
      "CanvasInteractionManager",
      `Initialized (${isDesktop ? "Desktop" : "Web"} mode)`,
    );
  }

  /**
   * Initialize the interaction manager
   */
  initialize(): void {
    // Start with canvas as click-through (pointer-events: none)
    this.canvas.style.pointerEvents = "none";

    // Listen to document mouse move to detect when over model
    // This works even when canvas has pointer-events:none
    document.addEventListener("mousemove", this.handleDocumentMouseMove);

    // Canvas event listeners
    this.canvas.addEventListener("pointerdown", this.handleCanvasPointerDown);
    this.canvas.addEventListener("pointermove", this.handleCanvasPointerMove);
    this.canvas.addEventListener("pointerup", this.handleCanvasPointerUp);
    this.canvas.addEventListener("pointercancel", this.handleCanvasPointerUp);

    Logger.log("CanvasInteractionManager", "Initialized");
  }

  private isCameraLocked(): boolean {
    const cameraLockedGetter = this.scene.metadata?.isCameraLocked;
    if (typeof cameraLockedGetter === "function") {
      return cameraLockedGetter();
    }
    return true;
  }

  private updateInteractiveState(clientX: number, clientY: number): boolean {
    if (this.isDragging) {
      this.canvas.style.pointerEvents = "auto";
      return true;
    }

    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    if (x < 0 || x > rect.width || y < 0 || y > rect.height) {
      this.canvas.style.pointerEvents = "none";
      this.canvas.style.cursor = "default";
      this.isOverModel = false;
      return false;
    }

    if (!this.isCameraLocked()) {
      this.canvas.style.pointerEvents = "auto";
      this.canvas.style.cursor = "default";
      this.isOverModel = false;
      return true;
    }

    const pickResult = this.scene.pick(x, y);
    const overModel =
      Boolean(pickResult?.hit) &&
      this.isModelMesh((pickResult?.pickedMesh as AbstractMesh | null) ?? null);

    if (overModel) {
      this.isOverModel = true;
      this.canvas.style.pointerEvents = "auto";
      this.canvas.style.cursor = "grab";
      return true;
    }

    this.canvas.style.cursor = "default";
    this.isOverModel = false;

    this.canvas.style.pointerEvents = "none";

    return false;
  }

  /**
   * Handle document mouse move - detect if over model
   */
  handleDocumentMouseMove(event: MouseEvent): void {
    this.updateInteractiveState(event.clientX, event.clientY);
  }

  isInteractiveAtPoint(clientX: number, clientY: number): boolean {
    return this.updateInteractiveState(clientX, clientY);
  }

  /**
   * Handle canvas pointer down - start drag
   */
  async handleCanvasPointerDown(event: PointerEvent): Promise<void> {
    // Only left button
    if (event.button !== 0) return;

    if (!this.isCameraLocked()) return;

    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Check if clicking on model
    const pickResult = this.scene.pick(x, y);
    const clickedOnModel =
      Boolean(pickResult?.hit) &&
      this.isModelMesh((pickResult?.pickedMesh as AbstractMesh | null) ?? null);

    if (clickedOnModel) {
      // Get initial window position for desktop mode
      if (this.isDesktop && this.desktopAPI?.window?.getPosition) {
        try {
          const pos = await this.desktopAPI.window.getPosition();
          this.windowX = pos.x;
          this.windowY = pos.y;
        } catch (error) {
          Logger.error(
            "CanvasInteractionManager",
            "Failed to get window position:",
            error,
          );
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
      this.canvas.style.cursor = "grabbing";

      // Emit drag start event
      window.dispatchEvent(new CustomEvent("modelDragStart"));

      if (this.onDragStartCallback) {
        this.onDragStartCallback(event.clientX, event.clientY);
      }

      Logger.log(
        "CanvasInteractionManager",
        `Drag started (${this.isDesktop ? "window" : "model"} drag)`,
      );
    }
  }

  /**
   * Handle canvas pointer move - handle drag movement
   */
  handleCanvasPointerMove(event: PointerEvent): void {
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
        this.desktopAPI.window
          .setPosition(Math.floor(this.windowX), Math.floor(this.windowY))
          .catch((error) => {
            Logger.error(
              "CanvasInteractionManager",
              "Failed to move window:",
              error,
            );
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
  handleCanvasPointerUp(event: PointerEvent): void {
    if (!this.isDragging) return;

    this.isDragging = false;

    // Restore cursor
    this.canvas.style.cursor = this.isOverModel ? "grab" : "default";

    // Emit drag end event for UI components to hide drag visual
    window.dispatchEvent(new CustomEvent("modelDragEnd"));

    if (this.onDragEndCallback) {
      this.onDragEndCallback(event.clientX, event.clientY);
    }

    Logger.log("CanvasInteractionManager", "Drag ended");
  }

  /**
   * Check if a mesh belongs to the model or is the picking box
   * In Portrait Mode, ONLY the picking box should be draggable (not the invisible clipped body)
   */
  isModelMesh(mesh: AbstractMesh | null): boolean {
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
    let parent: Node | null = mesh.parent;
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
  setDragCallbacks(
    onStart: DragStartCallback,
    onDrag: DragMoveCallback,
    onEnd: DragEndCallback,
  ): void {
    this.onDragStartCallback = onStart;
    this.onDragCallback = onDrag;
    this.onDragEndCallback = onEnd;
  }

  /**
   * Enable/disable interaction
   */
  setEnabled(enabled: boolean): void {
    if (this.isDesktop) {
      // Desktop mode: canvas always has pointer-events:auto
      return;
    }

    if (enabled) {
      document.addEventListener("mousemove", this.handleDocumentMouseMove);
    } else {
      document.removeEventListener("mousemove", this.handleDocumentMouseMove);
      this.canvas.style.pointerEvents = "none";
    }
  }

  /**
   * Clean up
   */
  dispose(): void {
    // Remove event listeners
    document.removeEventListener("mousemove", this.handleDocumentMouseMove);
    this.canvas.removeEventListener(
      "pointerdown",
      this.handleCanvasPointerDown,
    );
    this.canvas.removeEventListener(
      "pointermove",
      this.handleCanvasPointerMove,
    );
    this.canvas.removeEventListener("pointerup", this.handleCanvasPointerUp);
    this.canvas.removeEventListener(
      "pointercancel",
      this.handleCanvasPointerUp,
    );

    // Reset canvas style
    this.canvas.style.pointerEvents = "none";
    this.canvas.style.cursor = "default";

    Logger.log("CanvasInteractionManager", "Disposed");
  }
}
