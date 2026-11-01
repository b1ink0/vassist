import { useEffect, useMemo, useRef, useState } from "react";
import { Autocomplete } from "@base-ui/react/autocomplete";
import { ScrollArea } from "@base-ui/react/scroll-area";
import { useEmbedHost } from "../../../embed/EmbedHostContext";
import { resolveConfiguredPortalContainer } from "../../../embed/portalContainers";
import AIServiceProxy from "../../../services/proxies/AIServiceProxy";
import { cn } from "../../../utils/cn";
import { useSettingsTheme } from "../SettingsThemeContext";
import { resolvePortalContainer } from "../../../utils/resolvePortalContainer";
import { Icon } from "../../icons";
import {
  DefaultAIConfig,
  type AIRemoteProfileProvider,
} from "../../../config/aiConfig";

interface RemoteModelPickerProps {
  variant?: "default" | "ghost";
  value: string;
  onChange: (value: string) => void;
  provider: AIRemoteProfileProvider;
  endpoint?: string | undefined;
  apiKey?: string | undefined;
  customModelsPath?: string | null | undefined;
  placeholder?: string;
  isLightBackground?: boolean;
  disabled?: boolean;
  inputTestId?: string;
  loadModels?:
    | (() => Promise<{ models: string[]; error?: string }>)
    | undefined;
}

const RemoteModelPicker = ({
  variant = "default",
  value,
  onChange,
  provider,
  endpoint,
  apiKey,
  customModelsPath,
  placeholder,
  isLightBackground = false,
  disabled = false,
  inputTestId,
  loadModels: loadModelsOverride,
}: RemoteModelPickerProps) => {
  const { embedConfig } = useEmbedHost();
  const settingsTheme = useSettingsTheme();
  const [portalAnchor, setPortalAnchor] = useState<HTMLDivElement | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [searching, setSearching] = useState(false);
  const editing = useRef(false);
  const commit = (next: string) => {
    editing.current = false;
    setSearching(false);
    const model = next.trim();
    setDraft(model || value);
    if (model && model !== value) onChange(model);
  };
  const [hasLoaded, setHasLoaded] = useState(false);

  const connectionKey = useMemo(() => {
    const fallbackEndpoint = DefaultAIConfig[provider].endpoint;
    const resolvedEndpoint =
      (endpoint || fallbackEndpoint).trim() || fallbackEndpoint;
    return [
      provider,
      resolvedEndpoint,
      apiKey?.trim() || "",
      customModelsPath ?? "",
    ].join("::");
  }, [apiKey, endpoint, provider, customModelsPath]);

  useEffect(() => {
    editing.current = false;
    setSearching(false);
    setModels([]);
    setError("");
    setHasLoaded(false);
  }, [connectionKey, loadModelsOverride]);

  useEffect(() => {
    if (!editing.current) setDraft(value);
  }, [value, connectionKey, loadModelsOverride]);

  useEffect(() => {
    if (!open && error) {
      setHasLoaded(false);
    }
  }, [error, open]);

  useEffect(() => {
    if (!open || disabled || hasLoaded) {
      return;
    }

    let disposed = false;

    const loadModels = async () => {
      setLoading(true);
      const result = loadModelsOverride
        ? await loadModelsOverride()
        : await AIServiceProxy.listRemoteModels({
            provider,
            customModelsPath,
            ...(endpoint ? { endpoint } : {}),
            ...(apiKey ? { apiKey } : {}),
          });
      if (disposed) {
        return;
      }
      setModels(Array.isArray(result.models) ? result.models : []);
      setError(result.error || "");
      setHasLoaded(true);
      setLoading(false);
    };

    loadModels().catch((loadError: unknown) => {
      if (disposed) {
        return;
      }
      setModels([]);
      setError(
        loadError instanceof Error ? loadError.message : String(loadError),
      );
      setHasLoaded(true);
      setLoading(false);
    });

    return () => {
      disposed = true;
    };
  }, [
    apiKey,
    customModelsPath,
    disabled,
    endpoint,
    hasLoaded,
    loadModelsOverride,
    open,
    provider,
  ]);

  const popupVisible =
    open && (loading || models.length > 0 || error.length > 0 || hasLoaded);
  const portalContainer = useMemo(() => {
    return resolveConfiguredPortalContainer(
      embedConfig,
      "popovers",
      resolvePortalContainer(undefined, portalAnchor),
    );
  }, [embedConfig, portalAnchor]);

  return (
    <div className="flex min-w-0 flex-col gap-1.5" ref={setPortalAnchor}>
      <Autocomplete.Root
        items={models}
        value={draft}
        mode={searching ? "list" : "none"}
        open={open}
        openOnInputClick
        autoHighlight="always"
        itemToStringValue={(item) => item}
        onValueChange={(nextValue, details) => {
          if (details.reason === "item-press") commit(nextValue);
        }}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (nextOpen && !open) {
            setSearching(false);
            editing.current = false;
            setDraft(value);
          }
        }}
      >
        <div
          className={cn(
            "remote-model-field flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2",
            variant === "ghost"
              ? "border-current/10 bg-transparent hover:bg-current/5"
              : "glass-input",
            isLightBackground
              ? "vassist-inverse-text-primary"
              : "vassist-text-primary",
            variant !== "ghost" && isLightBackground && "glass-input-dark",
          )}
        >
          <Autocomplete.Input
            data-testid={inputTestId}
            aria-label="Model"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              editing.current = true;
              setSearching(true);
            }}
            onFocus={(event) => {
              setOpen(true);
              setSearching(false);
              event.currentTarget.select();
            }}
            onBlur={() => {
              editing.current = false;
              setSearching(false);
              setDraft(value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                editing.current = false;
                setDraft(value);
                setSearching(false);
              }
              if (
                event.key === "Enter" &&
                searching &&
                !models.some((model) =>
                  model.toLocaleLowerCase().includes(draft.toLocaleLowerCase()),
                )
              ) {
                event.preventDefault();
                commit(draft);
                setOpen(false);
              }
            }}
            placeholder={placeholder || "Search or enter a model"}
            disabled={disabled}
            className="remote-model-input min-w-0 flex-1 bg-transparent text-sm text-current outline-none"
          />
          <Icon
            name={loading ? "loading" : "search"}
            size={14}
            className={
              loading
                ? "shrink-0 animate-spin opacity-60"
                : "shrink-0 opacity-50"
            }
          />
        </div>

        {popupVisible && (
          <Autocomplete.Portal container={portalContainer}>
            <Autocomplete.Positioner
              side="top"
              sideOffset={8}
              collisionPadding={12}
              align="start"
              className="z-[10040] outline-none"
            >
              <Autocomplete.Popup
                data-electron-interactive="true"
                className={cn(
                  "composer-menu flex min-h-0 w-[max(var(--anchor-width),18rem)] max-w-[calc(100vw-24px)] max-h-[var(--available-height)] flex-col rounded-xl border p-1 shadow-xl",
                  isLightBackground
                    ? "vassist-popup-surface-inverse"
                    : "vassist-popup-surface",
                  settingsTheme &&
                    "settings-control-popup settings-" + settingsTheme,
                )}
              >
                <ScrollArea.Root className="flex min-h-0 flex-col overflow-hidden">
                  <Autocomplete.List
                    render={<ScrollArea.Viewport />}
                    className="min-h-0 max-h-[min(16rem,calc(var(--available-height)-0.5rem))] overscroll-contain touch-pan-y outline-none"
                  >
                    <ScrollArea.Content
                      className="flex w-full min-w-0 flex-col py-1"
                      style={{ minWidth: 0 }}
                    >
                      <Autocomplete.Collection>
                        {(model: string, index: number) => (
                          <Autocomplete.Item
                            key={model}
                            value={model}
                            index={index}
                            className={cn(
                              "group flex cursor-default items-center rounded-lg px-2 py-1.5 text-sm outline-none transition-colors",
                              isLightBackground
                                ? "vassist-select-item-single-inverse"
                                : "vassist-select-item-single",
                            )}
                          >
                            <span className="min-w-0 truncate" title={model}>
                              {model}
                            </span>
                          </Autocomplete.Item>
                        )}
                      </Autocomplete.Collection>
                      <Autocomplete.Empty className="py-2 text-[11px] opacity-50">
                        {loading && (
                          <div className="px-3 text-[11px] opacity-60">
                            Loading available models...
                          </div>
                        )}
                        {!loading && error ? (
                          <div className="px-3 text-[11px] opacity-60">
                            Listing unavailable: {error}
                          </div>
                        ) : (
                          !loading && (
                            <span className="px-3 text-[11px] opacity-50">
                              No models found
                            </span>
                          )
                        )}
                      </Autocomplete.Empty>
                    </ScrollArea.Content>
                  </Autocomplete.List>
                  <ScrollArea.Scrollbar
                    orientation="vertical"
                    className="flex w-1.5 rounded-full p-px opacity-0 transition-opacity duration-200 data-[hovering]:opacity-100 data-[scrolling]:opacity-100 motion-reduce:transition-none"
                  >
                    <ScrollArea.Thumb className="w-full rounded-full bg-current/30" />
                  </ScrollArea.Scrollbar>
                </ScrollArea.Root>
              </Autocomplete.Popup>
            </Autocomplete.Positioner>
          </Autocomplete.Portal>
        )}
      </Autocomplete.Root>
    </div>
  );
};

export default RemoteModelPicker;
