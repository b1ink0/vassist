import type { ReactNode } from "react";

interface SettingsSubTabContentProps {
  render: () => ReactNode;
}

/**
 * Deferred mount point for settings sub-tabs.
 *
 * The render callback is intentionally evaluated inside this component so a
 * parent can keep inactive, expensive settings panels completely unmounted.
 */
const SettingsSubTabContent = ({ render }: SettingsSubTabContentProps) =>
  render();

export default SettingsSubTabContent;
