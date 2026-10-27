import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import { installHtmlPanelHoverStyles } from "./HtmlPanelHover";

export function setHtmlInputValue(
  input: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  const prototype =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Complements Babylon's UV pointer forwarding with native form and scroll behavior. */
export class HtmlPanelInput {
  private hovered: Element;
  private readonly hoverTargets = new Map<number, Element>();
  private range: HTMLInputElement | null = null;
  private pressed: {
    element: Element;
    pointerId: number;
    clientX: number;
    clientY: number;
  } | null = null;
  private readonly remove: () => void;

  constructor(
    scene: Scene,
    mesh: AbstractMesh,
    private readonly host: HTMLElement,
    onTextInput: (input: HTMLInputElement | HTMLTextAreaElement) => void,
  ) {
    this.hovered = host;
    const removeHoverStyles = installHtmlPanelHoverStyles(host);
    // Focus must work, while actual screen pointers continue to reach the canvas.
    host.removeAttribute("inert");
    host.style.pointerEvents = "none";
    const move = (event: PointerEvent) => {
      if (event.target instanceof Element) {
        this.hovered = event.target;
        this.setHover(event.pointerId, event.target);
      }
      if (this.range) this.changeRange(this.range, event.clientX);
    };
    const down = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element)
        this.pressed = {
          element: target,
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
        };
      if (target instanceof HTMLInputElement && target.type === "range") {
        this.range = target;
        this.changeRange(target, event.clientX);
      } else if (
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLInputElement &&
          ["text", "search", "url", "email", "password", "number"].includes(
            target.type,
          ))
      ) {
        target.focus({ preventScroll: true });
        onTextInput(target);
      }
    };
    const up = () => {
      this.range = null;
      this.pressed = null;
    };
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerdown", down);
    host.addEventListener("pointerup", up);
    const observer = scene.onPointerObservable.add((info) => {
      if (
        info.type === PointerEventTypes.POINTERMOVE &&
        info.pickInfo?.pickedMesh !== mesh
      )
        this.setHover((info.event as PointerEvent).pointerId, null);
      if (
        info.type === PointerEventTypes.POINTERUP &&
        this.pressed &&
        (info.event as PointerEvent).pointerId === this.pressed.pointerId
      ) {
        const held = this.pressed;
        up();
        held.element.dispatchEvent(
          new PointerEvent("pointerup", {
            bubbles: true,
            cancelable: true,
            pointerId: held.pointerId,
            clientX: held.clientX,
            clientY: held.clientY,
          }),
        );
      }
      if (
        info.type === PointerEventTypes.POINTERWHEEL &&
        info.pickInfo?.pickedMesh === mesh
      )
        this.scroll((info.event as WheelEvent).deltaY);
    });
    this.remove = () => {
      scene.onPointerObservable.remove(observer);
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerdown", down);
      host.removeEventListener("pointerup", up);
      host.style.pointerEvents = "";
      for (const id of this.hoverTargets.keys()) this.setHover(id, null);
      removeHoverStyles();
    };
  }

  private setHover(pointerId: number, target: Element | null): void {
    const previous = this.hoverTargets.get(pointerId);
    if (previous === target) return;
    if (target) this.hoverTargets.set(pointerId, target);
    else this.hoverTargets.delete(pointerId);
    for (const element of Array.from(
      this.host.querySelectorAll("[data-xr-hover]"),
    ))
      if (
        ![...this.hoverTargets.values()].some((item) => element.contains(item))
      )
        element.removeAttribute("data-xr-hover");
    const init = {
      bubbles: true,
      pointerId,
      pointerType: "xr",
      relatedTarget: target,
    };
    previous?.dispatchEvent(new PointerEvent("pointerout", init));
    previous?.dispatchEvent(new MouseEvent("mouseout", init));
    if (target) {
      for (
        let element: Element | null = target;
        element && this.host.contains(element);
        element = element.parentElement
      )
        element.setAttribute("data-xr-hover", "");
      target.dispatchEvent(
        new PointerEvent("pointerover", {
          ...init,
          relatedTarget: previous ?? null,
        }),
      );
      target.dispatchEvent(
        new MouseEvent("mouseover", {
          ...init,
          relatedTarget: previous ?? null,
        }),
      );
    }
  }

  private changeRange(input: HTMLInputElement, clientX: number): void {
    if (input.disabled) return;
    const rect = input.getBoundingClientRect();
    if (rect.width <= 0) return;
    const min = Number(input.min || 0),
      max = Number(input.max || 100);
    const step = input.step === "any" ? 0 : Number(input.step || 1);
    let value =
      min +
      Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) *
        (max - min);
    if (step > 0) value = min + Math.round((value - min) / step) * step;
    setHtmlInputValue(input, String(Math.max(min, Math.min(max, value))));
  }

  scroll(deltaY: number): void {
    if (!Number.isFinite(deltaY)) return;
    if (
      !this.hovered.dispatchEvent(
        new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY }),
      )
    )
      return;
    let element: Element | null = this.hovered;
    while (element && this.host.contains(element)) {
      const style = getComputedStyle(element);
      if (
        /(auto|scroll)/.test(style.overflowY) &&
        element.scrollHeight > element.clientHeight
      ) {
        element.scrollTop += deltaY;
        return;
      }
      element = element.parentElement;
    }
  }
  dispose(): void {
    this.remove();
  }
}
