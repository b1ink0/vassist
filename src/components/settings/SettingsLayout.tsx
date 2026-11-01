import { useSceneActions } from "../../hooks/app/useScene";
import { useUIConfig } from "../../hooks/config/useConfigUI";
import { isDesktop } from "../../utils/PlatformUtils";
import { useEffect, useRef, useState, type ReactNode } from "react";
import SettingsScrollArea from "./shared/SettingsScrollArea";
import { ScrollArea } from "@base-ui/react/scroll-area";
import { Button, Input } from "../ui";
import { Icon } from "../icons";
import { cn } from "../../utils/cn";
import { SettingsThemeContext } from "./SettingsThemeContext";
import { useAIConfig } from "../../hooks/config/useConfigAI";
import { AIProviders, getAIProviderSection } from "../../config/aiConfig";
import { useEmbedHost } from "../../embed/EmbedHostContext";
import {
  getAIContextSettingsTarget,
  isSettingsTargetHidden,
} from "../../embed/settingsPolicy";
import {
  settingsSearchFields,
  type SettingsPage,
  type SettingsPageId,
} from "../../config/settingsNavigation";
import type { VAssistSettingsTargetId } from "../../embed/config";
import SettingsDisclosure from "./shared/SettingsDisclosure";

/** Scroll only the content viewport; scrolling ancestors also moves the sliding track. */
function revealSetting(
  viewport: HTMLElement,
  field: HTMLElement,
  center = false,
) {
  const box = field.getBoundingClientRect();
  const frame = viewport.getBoundingClientRect();
  const delta = center
    ? box.top + box.height / 2 - frame.top - frame.height / 2
    : box.top < frame.top
      ? box.top - frame.top
      : box.bottom > frame.bottom
        ? box.bottom - frame.bottom
        : 0;
  if (delta)
    viewport.scrollTo({
      top: Math.max(0, viewport.scrollTop + delta),
      behavior: center ? "smooth" : "auto",
    });
}

interface SettingsLayoutProps {
  title: string;
  pages: readonly SettingsPage[];
  activePage: SettingsPageId;
  onNavigate: (page: SettingsPageId, target?: VAssistSettingsTargetId) => void;
  onClose: () => void;
  isLightBackground: boolean;
  animationClass: string;
  status: {
    type: string;
    message: string | undefined;
    dismissible: boolean;
  } | null;
  onDismissStatus: () => void;
  target?: VAssistSettingsTargetId | undefined;
  targetRevision?: number;
  children: ReactNode;
}

export default function SettingsLayout({
  title,
  pages,
  activePage,
  onNavigate,
  onClose,
  isLightBackground,
  animationClass,
  status,
  onDismissStatus,
  target,
  targetRevision,
  children,
}: SettingsLayoutProps) {
  const [query, setQuery] = useState("");
  const aiConfig = useAIConfig();
  const uiConfig = useUIConfig();
  const { reloadScene } = useSceneActions();
  const { embedConfig } = useEmbedHost();
  const section = getAIProviderSection(aiConfig.provider);
  const connection = aiConfig[section];
  const [showIndex, setShowIndex] = useState(true);
  const [narrow, setNarrow] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, number>());
  const page = pages.find((item) => item.id === activePage);
  useEffect(() => {
    if (target) setShowIndex(false);
  }, [target, targetRevision]);
  const navigate = (id: SettingsPageId, field?: VAssistSettingsTargetId) => {
    if (viewportRef.current)
      positions.current.set(activePage, viewportRef.current.scrollTop);
    onNavigate(id, field);
    setQuery("");
    setShowIndex(false);
  };
  useEffect(() => {
    if (viewportRef.current)
      viewportRef.current.scrollTop = positions.current.get(activePage) ?? 0;
  }, [activePage]);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const revealFocus = () => {
      setNarrow(root.clientWidth <= 620);
      if (viewportRef.current)
        root.style.setProperty(
          "--settings-content-height",
          viewportRef.current.clientHeight + "px",
        );
      const viewport = window.visualViewport;
      if (viewport)
        root.style.maxHeight =
          Math.max(
            160,
            viewport.height +
              viewport.offsetTop -
              root.getBoundingClientRect().top,
          ) + "px";
      const focused = (root.getRootNode() as Document | ShadowRoot)
        .activeElement;
      const contentViewport = viewportRef.current;
      if (
        focused instanceof HTMLElement &&
        contentViewport?.contains(focused) &&
        focused.matches("input,textarea,[contenteditable=true]")
      )
        revealSetting(contentViewport, focused);
    };
    const focus = () => requestAnimationFrame(revealFocus);
    const observer = new ResizeObserver(revealFocus);
    observer.observe(root);
    root.addEventListener("focusin", focus);
    window.visualViewport?.addEventListener("resize", revealFocus);
    return () => {
      observer.disconnect();
      root.removeEventListener("focusin", focus);
      window.visualViewport?.removeEventListener("resize", revealFocus);
    };
  }, []);
  useEffect(() => {
    const root = viewportRef.current;
    if (!root) return;
    root
      .querySelectorAll("[data-settings-highlight]")
      .forEach((field) => field.removeAttribute("data-settings-highlight"));
    if (!target) return;
    let revealTimer: ReturnType<typeof setTimeout> | undefined;
    const reveal = () => {
      const field = Array.from(
        root.querySelectorAll<HTMLElement>("[data-settings-target]"),
      ).find((el) => el.dataset.settingsTarget === target);
      if (!field) return false;
      let expanded = false;
      for (
        let parent = field.parentElement;
        parent && parent !== root;
        parent = parent.parentElement
      )
        if (parent.classList.contains("settings-disclosure")) {
          const trigger = parent.querySelector<HTMLButtonElement>(
            ".settings-disclosure-trigger",
          );
          if (trigger?.getAttribute("aria-expanded") === "false") {
            trigger.click();
            expanded = true;
          }
        }
      revealSetting(root, field, true);
      if (expanded)
        revealTimer = setTimeout(() => revealSetting(root, field, true), 240);
      field.setAttribute("data-settings-highlight", "true");
      return true;
    };
    if (reveal()) return () => clearTimeout(revealTimer);
    const observer = new MutationObserver(() => {
      if (reveal()) observer.disconnect();
    });
    observer.observe(root, { subtree: true, childList: true });
    return () => {
      observer.disconnect();
      clearTimeout(revealTimer);
    };
  }, [activePage, target, targetRevision]);
  const text = query.trim().toLowerCase();
  const results = pages.flatMap((item) => {
    const fields = settingsSearchFields
      .map((field) => {
        const target: VAssistSettingsTargetId | undefined = field.parameter
          ? `llm.${section}.${field.parameter}`
          : field.target;
        return { ...field, target };
      })
      .filter(
        (field) =>
          field.page === item.id &&
          field.label.toLowerCase().includes(text) &&
          (!field.target ||
            !isSettingsTargetHidden(embedConfig, field.target)) &&
          (!field.parameter || aiConfig.provider !== AIProviders.CHROME_AI) &&
          (field.parameter !== "contextSize" ||
            getAIContextSettingsTarget(
              aiConfig.provider,
              "apiFormat" in connection ? connection.apiFormat : undefined,
            ) !== "llm.provider"),
      );
    return fields.length
      ? fields.map((field) => ({
          page: item,
          label: field.label,
          target: field.target,
        }))
      : (item.label + " " + item.keywords).toLowerCase().includes(text)
        ? [{ page: item, label: item.label, target: undefined }]
        : [];
  });
  return (
    <SettingsThemeContext.Provider
      value={
        isLightBackground
          ? "dark"
          : isDesktop && uiConfig.desktopMode.mode === "floating-app"
            ? "opaque-light"
            : "light"
      }
    >
      <div
        ref={rootRef}
        role="dialog"
        aria-label="Settings panel"
        data-testid="settings-panel"
        data-show-index={showIndex}
        data-opaque-light={
          isDesktop &&
          uiConfig.desktopMode.mode === "floating-app" &&
          !isLightBackground
        }
        className={cn(
          "settings-shell flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border",
          isLightBackground ? "settings-dark" : "settings-light",
          animationClass,
        )}
      >
        <header className="flex shrink-0 items-center border-b border-current/10 p-3">
          <h2 className="sr-only">{title}</h2>
          <div className="settings-search-group flex min-w-0 flex-1 items-center rounded-lg bg-current/5 px-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center">
              <Icon name="search" size={15} />
            </span>
            <Input
              type="search"
              disableDebounce
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setShowIndex(true);
              }}
              placeholder="Search settings"
              aria-label="Search settings"
              className="settings-search min-w-0 border-0 bg-transparent px-0 py-2 shadow-none"
            />
            <Button
              variant="unstyled"
              size="icon"
              className="h-7 w-7"
              aria-label="Close settings"
              onClick={onClose}
            >
              <Icon name="close" size={17} />
            </Button>
          </div>
        </header>
        <div className="settings-workspace flex min-h-0 flex-1 overflow-hidden">
          <div className="settings-track flex min-h-0 flex-1">
            <ScrollArea.Root
              inert={narrow && !showIndex}
              aria-hidden={narrow && !showIndex}
              className="settings-index flex min-h-0 shrink-0 flex-col border-r border-current/10"
            >
              <ScrollArea.Viewport className="min-h-0 flex-1 outline-none">
                <ScrollArea.Content className="flex flex-col gap-4 p-3">
                  {text ? (
                    <div
                      className="flex flex-col gap-1"
                      role="list"
                      aria-label="Settings search results"
                    >
                      <span className="px-2 text-xs opacity-50">
                        {results.length} results
                      </span>
                      {results.map((result, index) => (
                        <button
                          key={index}
                          type="button"
                          className="settings-nav-item flex flex-col items-start gap-0.5 rounded-lg px-2 py-2 text-left"
                          onClick={() =>
                            navigate(result.page.id, result.target)
                          }
                        >
                          <span className="text-sm">{result.label}</span>
                          <span className="text-xs opacity-50">
                            {result.page.group} · {result.page.label}
                          </span>
                        </button>
                      ))}
                      {!results.length && (
                        <p className="px-2 py-3 text-sm opacity-60">
                          No matching settings
                        </p>
                      )}
                    </div>
                  ) : (
                    Array.from(new Set(pages.map((item) => item.group))).map(
                      (group) => (
                        <nav
                          key={group}
                          aria-label={group}
                          className="flex flex-col gap-0.5"
                        >
                          <h3 className="px-2 py-1 text-[11px] font-medium opacity-45">
                            {group}
                          </h3>
                          {pages
                            .filter((item) => item.group === group)
                            .map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                aria-current={
                                  activePage === item.id ? "page" : undefined
                                }
                                className="settings-nav-item flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-left text-sm"
                                onClick={() => navigate(item.id)}
                              >
                                <Icon name={item.icon} size={15} />
                                <span className="truncate">{item.label}</span>
                              </button>
                            ))}
                        </nav>
                      ),
                    )
                  )}
                </ScrollArea.Content>
              </ScrollArea.Viewport>
              <ScrollArea.Scrollbar className="flex w-1.5 p-px">
                <ScrollArea.Thumb className="w-full rounded-full bg-current/25" />
              </ScrollArea.Scrollbar>
            </ScrollArea.Root>
            <div
              inert={narrow && showIndex}
              aria-hidden={narrow && showIndex}
              className="settings-main flex min-w-0 flex-1 flex-col"
            >
              <div className="flex shrink-0 flex-col gap-1 px-4 py-2">
                <div className="flex items-center gap-2">
                  <Button
                    variant="unstyled"
                    size="icon"
                    className="settings-back shrink-0"
                    aria-label="Settings categories"
                    onClick={() => setShowIndex(true)}
                  >
                    <Icon name="arrow-left" size={18} />
                  </Button>
                  <h3 className="min-w-0 flex-1 text-sm font-semibold">
                    {page?.label}
                  </h3>
                  {activePage === "character" &&
                    uiConfig.enableModelLoading && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Reload avatar"
                        title="Reload avatar"
                        onClick={reloadScene}
                      >
                        <Icon name="refresh" size={16} />
                      </Button>
                    )}
                </div>
              </div>
              <ScrollArea.Root className="flex min-h-0 flex-1 flex-col">
                <ScrollArea.Viewport
                  ref={viewportRef}
                  className="min-h-0 flex-1 outline-none"
                >
                  <ScrollArea.Content
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      width: "100%",
                      minWidth: 0,
                    }}
                    className="settings-page-content flex min-w-0 flex-col gap-5 px-5 pb-6"
                  >
                    {children}
                  </ScrollArea.Content>
                </ScrollArea.Viewport>
                <ScrollArea.Scrollbar className="flex w-1.5 p-px">
                  <ScrollArea.Thumb className="w-full rounded-full bg-current/25" />
                </ScrollArea.Scrollbar>
              </ScrollArea.Root>
            </div>
          </div>
        </div>
        {status && status.type !== "saved" && (
          <div
            role={status.type === "error" ? "alert" : "status"}
            className="settings-feedback flex shrink-0 items-start gap-2  px-5 py-3 text-sm"
          >
            <Icon
              name={status.type === "testing" ? "loading-2" : "info"}
              size={16}
              className={
                status.type === "testing" ? "shrink-0 animate-spin" : "shrink-0"
              }
            />
            <SettingsDisclosure
              className="min-w-0 flex-1"
              title={
                <>
                  {status.type === "error"
                    ? "Could not complete the action · Details"
                    : status.type === "testing"
                      ? "Testing…"
                      : "Result · Details"}
                </>
              }
            >
              <SettingsScrollArea
                className="max-h-32"
                contentClassName="whitespace-pre-wrap break-words py-2 text-xs"
              >
                {status.message}
              </SettingsScrollArea>
            </SettingsDisclosure>
            {status.dismissible && (
              <Button
                variant="unstyled"
                size="icon"
                aria-label="Dismiss status"
                onClick={onDismissStatus}
              >
                <Icon name="close" size={14} />
              </Button>
            )}
          </div>
        )}
        {status?.type === "saved" && (
          <footer
            className="flex shrink-0 justify-end px-4 py-1 text-xs"
            aria-live="polite"
          >
            {status?.type === "saved" && (
              <span role="status" className="shrink-0 text-xs opacity-50">
                Saved
              </span>
            )}
          </footer>
        )}
      </div>
    </SettingsThemeContext.Provider>
  );
}
