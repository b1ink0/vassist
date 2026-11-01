import { Icon } from "../../icons";

/** Fill the available settings viewport while its lazy page loads. */
export default function SettingsLoading() {
  return (
    <div
      className="settings-loading flex w-full items-center justify-center"
      style={{ minHeight: "var(--settings-content-height, 12rem)" }}
      role="status"
      aria-label="Loading settings"
    >
      <Icon name="loading-2" size={24} className="animate-spin opacity-60" />
    </div>
  );
}
