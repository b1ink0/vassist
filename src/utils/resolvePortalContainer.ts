import { VASSIST_REACT_ROOT_ID } from "./VAssistDomIds";

export type PortalContainer = HTMLElement | ShadowRoot | null | undefined;

export function resolvePortalContainer(
  portalContainer: PortalContainer,
  ownerNode: Node | null,
): PortalContainer {
  if (portalContainer !== undefined) {
    return portalContainer;
  }

  if (!ownerNode) {
    return undefined;
  }

  const rootNode = ownerNode.getRootNode();
  if (typeof ShadowRoot === "undefined" || !(rootNode instanceof ShadowRoot)) {
    return undefined;
  }

  return rootNode.getElementById(VASSIST_REACT_ROOT_ID) ?? rootNode;
}
