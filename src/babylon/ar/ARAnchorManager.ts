import type { Scene } from "@babylonjs/core";
import { TransformNode, Quaternion } from "@babylonjs/core";
import type { ARProvider } from "./ARProvider";
import type { ARAnchor } from "./ARTypes";

/**
 * Manages AR anchors and their Babylon.js scene representation.
 *
 * ARCore provides anchor poses in its right-handed coordinate system.
 * We convert to Babylon's left-handed system by negating Z position
 * and conjugating the quaternion's Z components.
 *
 * RH → LH quaternion conversion:
 *   q_LH = (-qx, -qy, qz, qw)
 *   Because negating Z flips the rotation plane for X and Y axes.
 */
export class ARAnchorManager {
  private activeAnchor: ARAnchor | null = null;
  public anchorNode: TransformNode;

  constructor(
    scene: Scene,
    private arProvider: ARProvider,
  ) {
    this.anchorNode = new TransformNode("arAnchorNode", scene);

    this.arProvider.onAnchorUpdated((anchor) => {
      if (this.activeAnchor && this.activeAnchor.id === anchor.id) {
        this.applyPose(anchor);
      }
    });
  }

  public setAnchor(anchor: ARAnchor): void {
    this.activeAnchor = anchor;
    this.applyPose(anchor);
  }

  private applyPose(anchor: ARAnchor) {
    // Position: negate Z for RH → LH
    this.anchorNode.position.copyFromFloats(anchor.x, anchor.y, -anchor.z);
    // Quaternion: RH → LH — negate x, y (rotation axes whose planes include Z)
    this.anchorNode.rotationQuaternion = Quaternion.Identity();
    this.anchorNode.computeWorldMatrix(true);
  }

  public clear(): void {
    this.activeAnchor = null;
    this.anchorNode.position.setAll(0);
    this.anchorNode.rotationQuaternion = Quaternion.Identity();
  }
}
