import { useEffect, useMemo, useState } from "react";
import { Autocomplete } from "@base-ui/react/autocomplete";
import AIServiceProxy from "../../../services/proxies/AIServiceProxy";
import { cn } from "../../../utils/cn";
import { Icon } from "../../icons";

interface RemoteModelPickerProps {
  value: string;
  onChange: (value: string) => void;
  provider: "openai" | "ollama" | "android-local" | "desktop-local";
  endpoint?: string | undefined;
  apiKey?: string | undefined;
  placeholder?: string;
  isLightBackground?: boolean;
  disabled?: boolean;
}

const RemoteModelPicker = ({
  value,
  onChange,
  provider,
  endpoint,
  apiKey,
  placeholder,
  isLightBackground = false,
  disabled = false,
}: RemoteModelPickerProps) => {
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const connectionKey = useMemo(() => {
    const fallbackEndpoint =
      provider === "android-local"
        ? "http://127.0.0.1:8765"
        : provider === "desktop-local"
          ? "http://127.0.0.1:11438"
          : "http://localhost:11434";
    const resolvedEndpoint =
      provider === "openai"
        ? "https://api.openai.com"
        : (endpoint || fallbackEndpoint).trim() || fallbackEndpoint;
    return [provider, resolvedEndpoint, apiKey?.trim() || ""].join("::");
  }, [apiKey, endpoint, provider]);

  useEffect(() => {
    setModels([]);
    setError("");
    setHasLoaded(false);
  }, [connectionKey]);

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
      const result = await AIServiceProxy.listRemoteModels({
        provider,
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
  }, [apiKey, disabled, endpoint, hasLoaded, open, provider]);

  const popupVisible =
    open && (loading || models.length > 0 || error.length > 0 || hasLoaded);

  return (
    <div className="space-y-1.5">
      <Autocomplete.Root
        items={models}
        value={value}
        open={open}
        openOnInputClick
        autoHighlight="always"
        itemToStringValue={(item) => item}
        onValueChange={(nextValue) => onChange(nextValue)}
        onOpenChange={setOpen}
      >
        <div className="relative">
          <Autocomplete.Input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            disabled={disabled}
            className={cn(
              "glass-input w-full pr-10 text-sm",
              isLightBackground && "glass-input-dark",
            )}
          />
          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/55">
            <Icon
              name={loading ? "loading" : "search"}
              size={14}
              className={
                loading ? "animate-spin text-white/70" : "text-white/55"
              }
            />
          </div>
        </div>

        {popupVisible && (
          <Autocomplete.Portal>
            <Autocomplete.Positioner
              sideOffset={8}
              align="start"
              className="z-[10040] outline-none"
            >
              <Autocomplete.Popup className="glass-container w-[var(--anchor-width)] rounded-xl border border-white/15 p-1 shadow-xl backdrop-blur-[12px]">
                <Autocomplete.List className="max-h-64 overflow-y-auto py-1 scrollbar-glass">
                  {models.map((model, index) => (
                    <Autocomplete.Item
                      key={model}
                      value={model}
                      index={index}
                      className="group flex cursor-default items-center rounded-lg px-3 py-2 text-sm text-white/85 outline-none transition-colors data-[highlighted]:bg-white/10"
                    >
                      {model}
                    </Autocomplete.Item>
                  ))}
                  <Autocomplete.Empty className="py-2 text-[11px] text-white/45">
                    {loading && (
                      <div className="px-3 text-[11px] text-white/55">
                        Loading available models...
                      </div>
                    )}
                    {!loading && error ? (
                      <div className="px-3 text-[11px] text-white/55">
                        Listing unavailable: {error}
                      </div>
                    ) : (
                      <span className="px-3 text-[11px] text-white/45">
                        No models found
                      </span>
                    )}
                  </Autocomplete.Empty>
                </Autocomplete.List>
              </Autocomplete.Popup>
            </Autocomplete.Positioner>
          </Autocomplete.Portal>
        )}
      </Autocomplete.Root>
    </div>
  );
};

export default RemoteModelPicker;
