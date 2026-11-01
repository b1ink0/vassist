import { useEffect, useState, type RefObject } from "react";

export function ScrollEdgeBlur({
  scrollRef,
  fadeItems = false,
  itemSelector,
}: {
  scrollRef: RefObject<HTMLElement | null>;
  fadeItems?: boolean;
  itemSelector?: string;
}) {
  const [edges, setEdges] = useState({ top: false, bottom: false });

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const distanceFromBottom = Math.max(
        0,
        element.scrollHeight - element.clientHeight - element.scrollTop,
      );
      const topStrength = Math.min(1, Math.max(0, element.scrollTop) / 32);
      const bottomStrength = Math.min(1, distanceFromBottom / 32);
      const top = topStrength > 0;
      const bottom = bottomStrength > 0;
      if (fadeItems) {
        const viewport = element.getBoundingClientRect();
        const items = itemSelector
          ? element.querySelectorAll(itemSelector)
          : element.children;
        for (const item of Array.from(items)) {
          if (!(item instanceof HTMLElement)) continue;
          const rect = item.getBoundingClientRect();
          const height = rect.height;
          if (!height) continue;
          const clamp = (value: number) => Math.max(0, Math.min(height, value));
          const topStart = top ? clamp(viewport.top - rect.top) : 0;
          const topEnd = top ? clamp(viewport.top + 32 - rect.top) : 0;
          const bottomStart = bottom
            ? clamp(viewport.bottom - 32 - rect.top)
            : height;
          const bottomEnd = bottom ? clamp(viewport.bottom - rect.top) : height;
          if (topEnd === 0 && bottomStart === height) {
            item.style.removeProperty("--vassist-scroll-item-mask");
            item.removeAttribute("data-vassist-scroll-fade");
          } else {
            item.setAttribute("data-vassist-scroll-fade", "");
            item.style.setProperty(
              "--vassist-scroll-item-mask",
              `linear-gradient(to bottom, rgba(0,0,0,${1 - topStrength}) ${topStart}px, black ${topEnd}px, black ${Math.max(topEnd, bottomStart)}px, rgba(0,0,0,${1 - bottomStrength}) ${Math.max(topEnd, bottomEnd)}px)`,
            );
          }
        }
      }
      setEdges((current) =>
        current.top === top && current.bottom === bottom
          ? current
          : { top, bottom },
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    element.addEventListener("scroll", schedule, { passive: true });
    const resize = new ResizeObserver(schedule);
    resize.observe(element);
    let content: Element | null = null;
    const observeContent = () => {
      if (content === element.firstElementChild) return;
      if (content) resize.unobserve(content);
      content = element.firstElementChild;
      if (content) resize.observe(content);
    };
    observeContent();
    const mutations = new MutationObserver(() => {
      observeContent();
      schedule();
    });
    mutations.observe(element, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    schedule();
    return () => {
      element.removeEventListener("scroll", schedule);
      resize.disconnect();
      mutations.disconnect();
      if (frame) cancelAnimationFrame(frame);
      if (fadeItems)
        for (const item of Array.from(
          itemSelector
            ? element.querySelectorAll(itemSelector)
            : element.children,
        )) {
          if (item instanceof HTMLElement) {
            item.style.removeProperty("--vassist-scroll-item-mask");
            item.removeAttribute("data-vassist-scroll-fade");
          }
        }
    };
  }, [scrollRef, fadeItems, itemSelector]);

  if (fadeItems) return null;

  return (
    <>
      {(["top", "bottom"] as const).map(
        (edge) =>
          edges[edge] && (
            <div
              key={edge}
              aria-hidden="true"
              className={`vassist-progressive-scroll-blur vassist-progressive-scroll-blur-${edge}`}
            >
              <span />
              <span />
              <span />
            </div>
          ),
      )}
    </>
  );
}
