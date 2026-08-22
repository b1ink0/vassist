import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { Select as BaseSelect } from "@base-ui/react/select";
import type { SelectHTMLAttributes } from "react";
import { useEmbedHost } from "../../embed/EmbedHostContext";
import { resolveConfiguredPortalContainer } from "../../embed/portalContainers";
import { Icon } from "../icons";
import { cn } from "../../utils/cn";
import { resolvePortalContainer } from "../../utils/resolvePortalContainer";

const selectVariants = cva(
  "glass-input w-full min-h-[36px] pr-11 text-left [font-family:inherit]",
  {
    variants: {
      variant: {
        default: "",
        dark: "glass-input-dark",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

interface SelectGroup {
  label: string;
  options: SelectOption[];
}

type SelectTriggerRender = React.ComponentProps<
  typeof BaseSelect.Trigger
>["render"];
type SelectSide = React.ComponentProps<typeof BaseSelect.Positioner>["side"];
type SelectAlign = React.ComponentProps<typeof BaseSelect.Positioner>["align"];

interface SelectProps
  extends
    Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange">,
    VariantProps<typeof selectVariants> {
  "data-testid"?: string;
  className?: string;
  options?: SelectOption[];
  groups?: SelectGroup[];
  placeholder?: string;
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  trigger?: SelectTriggerRender;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: SelectSide;
  align?: SelectAlign;
  sideOffset?: number;
  positionerClassName?: string;
  popupClassName?: string;
  listClassName?: string;
  portalContainer?: HTMLElement | ShadowRoot | null;
}

const Select = ({
  variant,
  className,
  options,
  groups,
  value,
  defaultValue,
  placeholder,
  disabled,
  name,
  required,
  onChange,
  trigger,
  open,
  defaultOpen,
  onOpenChange,
  side = "bottom",
  align = "center",
  sideOffset = 8,
  positionerClassName,
  popupClassName,
  listClassName,
  portalContainer,
  "data-testid": dataTestId,
}: SelectProps) => {
  const { embedConfig } = useEmbedHost();
  const [portalAnchor, setPortalAnchor] = React.useState<HTMLDivElement | null>(
    null,
  );
  const grouped = Array.isArray(groups) && groups.length > 0;
  const optionItems = React.useMemo(() => {
    if (grouped) {
      return groups.flatMap((group) => group.options);
    }
    return options || [];
  }, [grouped, groups, options]);

  const isControlled = value !== undefined;
  const initialValue = String(
    defaultValue ?? value ?? optionItems[0]?.value ?? "",
  );
  const [internalValue, setInternalValue] = React.useState(initialValue);

  React.useEffect(() => {
    if (!isControlled) {
      return;
    }
    setInternalValue(String(value ?? ""));
  }, [isControlled, value]);

  const selectedValue = isControlled ? String(value ?? "") : internalValue;
  const fallbackPortalContainer = React.useMemo(() => {
    return resolvePortalContainer(portalContainer, portalAnchor);
  }, [portalAnchor, portalContainer]);
  const resolvedPortalContainer = React.useMemo(() => {
    if (portalContainer !== undefined) {
      return fallbackPortalContainer;
    }

    return resolveConfiguredPortalContainer(
      embedConfig,
      "popovers",
      fallbackPortalContainer,
    );
  }, [embedConfig, fallbackPortalContainer, portalContainer]);

  const triggerChange = (nextValue: string | null): void => {
    const resolvedValue = nextValue ?? "";

    if (!isControlled) {
      setInternalValue(resolvedValue);
    }

    if (!onChange) {
      return;
    }

    const syntheticEvent = {
      target: { value: resolvedValue },
      currentTarget: { value: resolvedValue },
    } as unknown as React.ChangeEvent<HTMLSelectElement>;

    onChange(syntheticEvent);
  };

  const textClass =
    variant === "dark"
      ? "vassist-inverse-text-primary"
      : "vassist-text-primary";
  const popupClass =
    variant === "dark"
      ? "vassist-popup-surface-inverse"
      : "vassist-popup-surface";
  const groupLabelClass =
    variant === "dark"
      ? "vassist-select-group-label-inverse"
      : "vassist-select-group-label";
  const itemClass =
    variant === "dark"
      ? "vassist-select-item-inverse group flex cursor-default items-center gap-2 rounded-lg px-2 py-1.5 text-sm outline-none transition-colors"
      : "vassist-select-item group flex cursor-default items-center gap-2 rounded-lg px-2 py-1.5 text-sm outline-none transition-colors";
  const singleItemClass =
    variant === "dark"
      ? "vassist-select-item-single-inverse group flex cursor-default items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm outline-none transition-colors"
      : "vassist-select-item-single group flex cursor-default items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm outline-none transition-colors";
  const indicatorClass =
    variant === "dark"
      ? "vassist-select-indicator-inverse w-4"
      : "vassist-select-indicator w-4";
  const triggerIconClass =
    variant === "dark"
      ? "vassist-inverse-text-secondary"
      : "vassist-text-secondary";
  const triggerClassName = trigger
    ? className
    : cn(selectVariants({ variant }), "relative", className);

  return (
    <div ref={setPortalAnchor} style={{ display: "contents" }}>
      <BaseSelect.Root
        value={selectedValue || undefined}
        onValueChange={triggerChange}
        open={open}
        defaultOpen={defaultOpen}
        onOpenChange={(nextOpen) => onOpenChange?.(nextOpen)}
        disabled={disabled}
        name={name}
        required={required}
      >
        <BaseSelect.Trigger
          className={triggerClassName}
          render={trigger}
          data-testid={dataTestId}
        >
          {!trigger && (
            <>
              <span className={cn("block truncate pr-2", textClass)}>
                {optionItems.find((opt) => String(opt.value) === selectedValue)
                  ?.label ??
                  (placeholder || "Select")}
              </span>
              <BaseSelect.Icon
                className={cn(
                  "pointer-events-none absolute right-3 top-1/2 -translate-y-1/2",
                  triggerIconClass,
                )}
              >
                <Icon name="chevron-down" size={16} />
              </BaseSelect.Icon>
            </>
          )}
        </BaseSelect.Trigger>

        <BaseSelect.Portal container={resolvedPortalContainer}>
          <BaseSelect.Positioner
            side={side}
            sideOffset={sideOffset}
            align={align}
            alignItemWithTrigger={false}
            className={cn(
              "z-[10040] outline-none [font-family:inherit]",
              positionerClassName,
            )}
          >
            <BaseSelect.Popup
              className={cn(
                "rounded-xl border p-1 shadow-xl [font-family:inherit]",
                popupClass,
                popupClassName,
              )}
            >
              <BaseSelect.ScrollUpArrow className="flex h-5 items-center justify-center vassist-text-muted">
                <Icon name="chevron-up" size={16} />
              </BaseSelect.ScrollUpArrow>
              <BaseSelect.List
                className={cn(
                  // Never grow wider than the trigger: long labels truncate
                  "max-h-64 min-w-[var(--anchor-width)] max-w-[calc(var(--anchor-width)+1rem)] overflow-y-auto scrollbar-glass [font-family:inherit]",
                  listClassName,
                )}
              >
                {grouped
                  ? groups.map((group) => (
                      <React.Fragment key={group.label}>
                        <div
                          className={cn(
                            "px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.08em]",
                            groupLabelClass,
                          )}
                        >
                          {group.label}
                        </div>
                        {group.options.map((opt) => (
                          <BaseSelect.Item
                            key={`${group.label}-${opt.value}`}
                            value={String(opt.value)}
                            disabled={opt.disabled}
                            className={itemClass}
                          >
                            <BaseSelect.ItemIndicator
                              className={indicatorClass}
                            >
                              <Icon name="check" size={16} />
                            </BaseSelect.ItemIndicator>
                            <BaseSelect.ItemText className="truncate">
                              {opt.label}
                            </BaseSelect.ItemText>
                          </BaseSelect.Item>
                        ))}
                      </React.Fragment>
                    ))
                  : optionItems.map((opt) => (
                      <BaseSelect.Item
                        key={opt.value}
                        value={String(opt.value)}
                        disabled={opt.disabled}
                        className={singleItemClass}
                      >
                        <BaseSelect.ItemText className="truncate">
                          {opt.label}
                        </BaseSelect.ItemText>
                        <BaseSelect.ItemIndicator className={indicatorClass}>
                          <Icon name="check" size={16} />
                        </BaseSelect.ItemIndicator>
                      </BaseSelect.Item>
                    ))}
              </BaseSelect.List>
            </BaseSelect.Popup>
          </BaseSelect.Positioner>
        </BaseSelect.Portal>
      </BaseSelect.Root>
    </div>
  );
};

export default Select;
