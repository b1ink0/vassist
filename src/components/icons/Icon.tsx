import React from "react";
import { iconMap } from "./iconMap";
import { getIconColor } from "./iconColors";
import { getBrandedIconUrl } from "../../embed/branding";
import { useEmbedHost } from "../../embed/EmbedHostContext";
import { useVAssistReactCustomizations } from "../../embed/reactHostCustomizations";
import { useUIConfig } from "../../hooks/config/useConfigUI";
import Logger from "../../services/LoggerService";

type IconName = keyof typeof iconMap;
type IconContext = "toolbar" | "chat" | "general";

interface IconProps {
  name: string;
  size?: number;
  className?: string;
  context?: IconContext;
  style?: React.CSSProperties;
  [key: string]: unknown;
}

/**
 * Universal Icon Component (Heroicons)
 *
 * Usage:
 * <Icon name="close" size={24} className="text-white" />
 * <Icon name="microphone" size={16} />
 * <Icon name="send" size={16} context="toolbar" />
 *
 * @param {string} name - Icon name from iconMap
 * @param {number} size - Icon size in pixels (default: 16)
 * @param {string} className - Additional CSS classes
 * @param {string} context - Icon context ('toolbar', 'chat', 'general') for conditional coloring
 * @param {object} style - Inline styles
 */
const Icon = ({
  name,
  size = 16,
  className = "",
  context = "general",
  style = {},
  ...props
}: IconProps) => {
  const { embedConfig, hostId } = useEmbedHost();
  const reactCustomizations = useVAssistReactCustomizations(hostId);
  const uiConfig = useUIConfig();

  const enableColored = Boolean(uiConfig?.enableColoredIcons);
  const toolbarOnly = Boolean(uiConfig?.enableColoredIconsToolbarOnly);

  const shouldUseColor =
    enableColored && (!toolbarOnly || context === "toolbar");

  const iconColor = getIconColor(name, shouldUseColor);

  const hasCustomColor = className.includes("text-");
  const finalClassName = hasCustomColor
    ? `icon icon-${name} ${className}`
    : `icon icon-${name} ${iconColor} ${className}`;
  const mergedStyle = {
    width: size,
    height: size,
    display: "block",
    flexShrink: 0,
    ...style,
  };
  const customRenderer = reactCustomizations.iconRenderers?.[name];

  if (customRenderer) {
    return (
      <>
        {customRenderer({
          name,
          size,
          className: finalClassName,
          style: mergedStyle,
        })}
      </>
    );
  }

  const brandedIconUrl = getBrandedIconUrl(embedConfig, name);
  if (brandedIconUrl) {
    return (
      <img
        src={brandedIconUrl}
        alt=""
        aria-hidden="true"
        className={finalClassName}
        style={mergedStyle}
      />
    );
  }

  const IconComponent = iconMap[name as IconName];

  if (!IconComponent) {
    Logger.warn("other", `Icon "${name}" not found in iconMap`);
    return null;
  }

  return (
    <IconComponent className={finalClassName} style={mergedStyle} {...props} />
  );
};

export default Icon;
