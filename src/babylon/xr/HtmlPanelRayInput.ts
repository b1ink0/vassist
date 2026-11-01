import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";

// HTML textures are hosted under the canvas, where native hit testing cannot
// identify their children. Resolve the painted subtree, including popovers.
export class HtmlPanelRayInput {
  private readonly disposeObserver: () => void;

  constructor(scene: Scene, mesh: AbstractMesh, host: HTMLElement) {
    const pressed = new Map<number, Element>();
    const contain = (event: Event) => event.stopPropagation();
    const contained = [
      "pointerdown",
      "pointerup",
      "pointermove",
      "mousedown",
      "mouseup",
      "mousemove",
      "click",
    ];
    for (const type of contained) host.addEventListener(type, contain);

    const resolve = (x: number, y: number): Element => {
      const previous = host.style.pointerEvents;
      host.style.pointerEvents = "auto";
      const visit = (parent: Element): Element | null => {
        const style = getComputedStyle(parent);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          parent.hasAttribute("inert")
        )
          return null;
        const rect = parent.getBoundingClientRect();
        const inside =
          x >= rect.left &&
          x <= rect.right &&
          y >= rect.top &&
          y <= rect.bottom;
        if (
          !inside &&
          style.display !== "contents" &&
          /(hidden|clip|scroll|auto)/.test(
            `${style.overflowX} ${style.overflowY}`,
          )
        )
          return null;
        const children = Array.from(parent.children)
          .map((child, index) => ({
            child,
            index,
            z: Number.parseInt(getComputedStyle(child).zIndex, 10) || 0,
          }))
          .sort((a, b) => b.z - a.z || b.index - a.index);
        for (const { child } of children) {
          const found = visit(child);
          if (found) return found;
        }
        return inside && style.pointerEvents !== "none" ? parent : null;
      };
      try {
        return visit(host) ?? host;
      } finally {
        host.style.pointerEvents = previous;
      }
    };
    const observer = scene.onPointerObservable.add((info) => {
      const name =
        info.type === PointerEventTypes.POINTERMOVE
          ? "pointermove"
          : info.type === PointerEventTypes.POINTERDOWN
            ? "pointerdown"
            : info.type === PointerEventTypes.POINTERUP
              ? "pointerup"
              : null;
      if (!name) return;
      const source = info.event as PointerEvent;
      const pointerId = source.pointerId ?? 1;
      if (info.pickInfo?.pickedMesh !== mesh || !info.pickInfo.hit) {
        if (name === "pointerup") pressed.delete(pointerId);
        return;
      }
      const uv = info.pickInfo.getTextureCoordinates();
      if (!uv) return;
      const rect = host.getBoundingClientRect();
      const x = rect.left + uv.x * rect.width;
      const y = rect.top + (1 - uv.y) * rect.height;
      const target = resolve(x, y);
      const init = {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        pointerId,
        pointerType: source.pointerType || "mouse",
        button: 0,
        buttons:
          name === "pointerup"
            ? 0
            : name === "pointerdown"
              ? 1
              : (source.buttons ?? 0),
      };
      target.dispatchEvent(new PointerEvent(name, init));
      const mouse =
        name === "pointerdown"
          ? "mousedown"
          : name === "pointerup"
            ? "mouseup"
            : "mousemove";
      target.dispatchEvent(new MouseEvent(mouse, init));
      if (name === "pointerdown") pressed.set(pointerId, target);
      if (name === "pointerup") {
        const down = pressed.get(pointerId);
        pressed.delete(pointerId);
        if (down === target)
          target.dispatchEvent(new MouseEvent("click", init));
      }
    });
    this.disposeObserver = () => {
      scene.onPointerObservable.remove(observer);
      for (const type of contained) host.removeEventListener(type, contain);
      pressed.clear();
    };
  }

  dispose(): void {
    this.disposeObserver();
  }
}
