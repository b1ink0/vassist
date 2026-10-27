const styles = new WeakMap<
  Document | ShadowRoot,
  { references: number; element: HTMLStyleElement }
>();

/** Reuse the application's hover rules for ray pointers, which cannot set CSS :hover. */
export function installHtmlPanelHoverStyles(host: HTMLElement): () => void {
  const node = host.getRootNode();
  const root = node instanceof ShadowRoot ? node : host.ownerDocument;
  let entry = styles.get(root);
  if (!entry) {
    const copyRules = (rules: CSSRuleList): string =>
      Array.from(rules)
        .map((rule) => {
          if (rule instanceof CSSStyleRule)
            return rule.cssText.includes(":hover")
              ? rule.cssText.replace(/:hover\b/g, "[data-xr-hover]")
              : "";
          if ("cssRules" in rule) {
            const body = copyRules((rule as CSSGroupingRule).cssRules);
            if (body)
              return `${rule.cssText.slice(0, rule.cssText.indexOf("{"))}{${body}}`;
          }
          return "";
        })
        .join("\n");
    const sheets =
      root instanceof ShadowRoot
        ? [
            ...Array.from(
              root.querySelectorAll("style"),
              (style) => style.sheet,
            ).filter((sheet): sheet is CSSStyleSheet => sheet !== null),
            ...root.adoptedStyleSheets,
          ]
        : [...Array.from(root.styleSheets), ...root.adoptedStyleSheets];
    const css = sheets
      .map((sheet) => {
        try {
          return copyRules(sheet.cssRules);
        } catch {
          return "";
        }
      })
      .join("\n");
    const element = host.ownerDocument.createElement("style");
    element.textContent = css;
    if (root instanceof ShadowRoot) root.appendChild(element);
    else root.head.appendChild(element);
    entry = { references: 0, element };
    styles.set(root, entry);
  }
  entry.references++;
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    if (--entry.references === 0) {
      entry.element.remove();
      styles.delete(root);
    }
  };
}
