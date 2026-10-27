import { useEffect, useState } from "react";
import {
  BUILT_IN_BACKGROUNDS,
  getBuiltInBackgroundPreviewUrl,
} from "../../config/backgroundCatalog";
import { useDesktopApi } from "../../hooks/useDesktopStore";
import { isDesktop } from "../../utils/PlatformUtils";
import Icon from "../icons/Icon";

interface BuiltInBackgroundGalleryProps {
  selectedIds: string[];
  isLightBackground?: boolean;
  multipleSelection?: boolean;
  onToggle: (id: string) => void;
  onMakeDefault?: (id: string) => void;
}

export default function BuiltInBackgroundGallery({
  selectedIds,
  isLightBackground = false,
  multipleSelection = true,
  onToggle,
  onMakeDefault,
}: BuiltInBackgroundGalleryProps) {
  const desktopApi = useDesktopApi();
  const [desktopPreviews, setDesktopPreviews] = useState<Record<string, string>>(
    {},
  );
  const effectiveSelectedIds = multipleSelection
    ? selectedIds
    : selectedIds.slice(0, 1);
  const selectedSet = new Set(effectiveSelectedIds);
  const buttonTone = isLightBackground
    ? "border-gray-300 bg-white/80 text-gray-800 hover:bg-white"
    : "border-white/15 bg-white/5 text-white/90 hover:bg-white/10";

  useEffect(() => {
    const backgroundApi = desktopApi?.desktopBackground;
    if (
      !isDesktop ||
      typeof backgroundApi?.readBuiltInPreview !== "function"
    ) {
      return;
    }
    let active = true;
    void Promise.all(
      BUILT_IN_BACKGROUNDS.map(async ({ id }) => {
        try {
          const result = await backgroundApi.readBuiltInPreview(id);
          return result.success && result.dataUrl
            ? ([id, result.dataUrl] as const)
            : null;
        } catch {
          return null;
        }
      }),
    ).then((entries) => {
      if (!active) return;
      setDesktopPreviews(
        Object.fromEntries(entries.filter((entry) => entry !== null)),
      );
    });
    return () => {
      active = false;
    };
  }, [desktopApi]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h5 className="text-xs font-semibold text-white/85">
          Included backgrounds ({effectiveSelectedIds.length})
        </h5>
        <span className="text-[11px] text-white/50">
          First selected opens first
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {BUILT_IN_BACKGROUNDS.map((background) => {
          const selected = selectedSet.has(background.id);
          const isDefault = effectiveSelectedIds[0] === background.id;
          const previewUrl = isDesktop
            ? desktopPreviews[background.id]
            : getBuiltInBackgroundPreviewUrl(background.id);
          return (
            <div
              key={background.id}
              className={`group relative flex min-w-[132px] flex-1 basis-[calc(33.333%_-_0.5rem)] overflow-hidden rounded-lg border ${
                selected ? "border-white/45" : "border-white/10"
              }`}
            >
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => onToggle(background.id)}
                className="relative aspect-video w-full overflow-hidden bg-black/20 text-left"
                title={`${selected ? "Remove" : "Include"} ${background.title}`}
              >
                {previewUrl && (
                  <img
                    src={previewUrl}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                )}
                <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 via-black/55 to-transparent px-2 pb-1.5 pt-5 text-left text-[11px] font-medium text-white">
                  {background.title}
                </span>
                {selected && (
                  <span className="absolute right-1.5 top-1.5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                    <Icon name="check" size={16} />
                  </span>
                )}
              </button>
              {multipleSelection && onMakeDefault && selected && !isDefault && (
                <button
                  type="button"
                  onClick={() => onMakeDefault(background.id)}
                  className={`absolute bottom-1 left-1 rounded border px-1.5 py-0.5 text-[10px] opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 ${buttonTone}`}
                  title={`Show ${background.title} first`}
                >
                  Use first
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
