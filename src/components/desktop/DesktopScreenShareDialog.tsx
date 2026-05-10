import { useState, useEffect } from "react";
import { Button } from "../ui";
import { cn } from "../../utils/cn";
import { useDesktop } from "../../contexts/DesktopContext";

interface DesktopShareSource {
  id: string;
  name: string;
  thumbnail: string;
  appIcon?: string;
}

const DesktopScreenShareDialog = () => {
  const { api } = useDesktop();
  const [sources, setSources] = useState<DesktopShareSource[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    console.log("DesktopScreenShareDialog mounted, api:", api);

    if (api?.window?.setIgnoreMouseEvents) {
      void api.window.setIgnoreMouseEvents(false);
    }

    // Listen for sources from main process
    if (api?.ipc) {
      const unsubscribe = api.ipc.on(
        "picker:sources",
        (sourcesData: unknown) => {
          console.log("Received sources:", sourcesData);
          if (Array.isArray(sourcesData)) {
            setSources(sourcesData as DesktopShareSource[]);
            return;
          }
          setSources([]);
        },
      );

      // Request sources
      console.log("Sending picker:ready");
      api.ipc.send("picker:ready");

      return () => {
        unsubscribe();
      };
    }
  }, [api]);

  const handleSelect = () => {
    if (selectedId && api?.ipc) {
      console.log("Sending picker:select with sourceId:", selectedId);
      api.ipc.send("picker:select", selectedId);
    }
  };

  const handleCancel = () => {
    if (api?.ipc) {
      console.log("Sending picker:cancel");
      api.ipc.send("picker:cancel");
    }
  };

  const screens = sources.filter((s) => s.id.startsWith("screen:"));
  const windows = sources.filter((s) => s.id.startsWith("window:"));

  return (
    <div className="relative min-h-screen overflow-hidden bg-transparent text-white">
      <div className="relative mx-auto flex min-h-screen max-w-6xl items-center justify-center p-6">
        <div className="flex max-h-[min(88vh,760px)] w-full flex-col overflow-hidden rounded-[28px] border border-white/14 bg-black/30 shadow-[0_24px_80px_rgba(0,0,0,0.38)] backdrop-blur-2xl">
          <div className="border-b border-white/10 px-6 py-5 md:px-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/50">
                  Desktop Capture
                </p>
                <h1 className="mt-2 text-2xl font-semibold text-white/95">
                  Choose what to share
                </h1>
                <p className="mt-1 text-sm text-white/65">
                  Pick a screen or app window.
                </p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-6 md:px-8 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {screens.length > 0 && (
              <div className="mb-8">
                <div className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-white/45">
                  Screens
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {screens.map((source) => (
                    <button
                      key={source.id}
                      type="button"
                      className={cn(
                        "group overflow-hidden rounded-2xl border border-white/10 bg-black/20 p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-white/25 hover:bg-black/28",
                        selectedId === source.id &&
                          "border-white/35 bg-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.2)]",
                      )}
                      onClick={() => setSelectedId(source.id)}
                    >
                      <div className="overflow-hidden rounded-xl border border-white/8 bg-black/25">
                        <img
                          src={source.thumbnail}
                          alt={source.name}
                          className="h-40 w-full object-contain transition-transform duration-200 group-hover:scale-[1.01]"
                        />
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        {source.appIcon && (
                          <img
                            src={source.appIcon}
                            alt=""
                            className="h-6 w-6 flex-shrink-0 rounded object-contain"
                          />
                        )}
                        <div className="min-w-0 flex-1 truncate text-sm font-medium text-white/92">
                          {source.name}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {windows.length > 0 && (
              <div className="mb-4">
                <div className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-white/45">
                  Windows
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {windows.map((source) => (
                    <button
                      key={source.id}
                      type="button"
                      className={cn(
                        "group overflow-hidden rounded-2xl border border-white/10 bg-black/20 p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-white/25 hover:bg-black/28",
                        selectedId === source.id &&
                          "border-white/35 bg-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.2)]",
                      )}
                      onClick={() => setSelectedId(source.id)}
                    >
                      <div className="overflow-hidden rounded-xl border border-white/8 bg-black/25">
                        <img
                          src={source.thumbnail}
                          alt={source.name}
                          className="h-40 w-full object-contain transition-transform duration-200 group-hover:scale-[1.01]"
                        />
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        {source.appIcon && (
                          <img
                            src={source.appIcon}
                            alt=""
                            className="h-6 w-6 flex-shrink-0 rounded object-contain"
                          />
                        )}
                        <div className="min-w-0 flex-1 truncate text-sm font-medium text-white/92">
                          {source.name}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {sources.length === 0 && (
              <div className="flex min-h-[260px] items-center justify-center rounded-2xl border border-dashed border-white/14 bg-black/20 text-center text-white/55">
                No screens or windows available to share
              </div>
            )}
          </div>

          <div className="sticky bottom-0 flex justify-end gap-3 border-t border-white/10 bg-black/24 px-6 py-4 backdrop-blur-xl md:px-8">
            <Button
              variant="default"
              className="rounded-xl border border-white/12 px-6 py-2.5 text-sm font-medium hover:bg-white/14"
              onClick={handleCancel}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              className="rounded-xl border border-white/16 bg-white/10 px-6 py-2.5 text-sm font-medium hover:bg-white/16"
              onClick={handleSelect}
              disabled={!selectedId}
            >
              Share
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DesktopScreenShareDialog;
