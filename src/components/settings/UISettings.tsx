/**
 * UI configuration settings.
 *
 * The individual sections are loaded only when their sub-tab is selected so
 * opening Settings does not mount the complete UI configuration tree.
 */

import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  useConfigUIActions,
  useUIConfig,
} from "../../hooks/config/useConfigUI";
import { useDesktopApi } from "../../hooks/useDesktopStore";
import { useSetup } from "../../contexts/SetupContext";
import Logger from "../../services/common/LoggerService";
import { isAndroid, isDesktop, isExtension } from "../../utils/PlatformUtils";
import appDataBackupService, {
  type BackupSelection,
} from "../../services/storage/AppDataBackupService";
import { TabBar } from "../ui";
import Icon from "../icons/Icon";
import DesktopModeSettings from "./DesktopModeSettings";

const DisplayTab = lazy(() =>
  import("./UISettingsTabs").then(({ DisplayTab: Component }) => ({
    default: Component,
  })),
);
const ChatTab = lazy(() =>
  import("./UISettingsTabs").then(({ ChatTab: Component }) => ({
    default: Component,
  })),
);
const ToolsTab = lazy(() =>
  import("./UISettingsTabs").then(({ ToolsTab: Component }) => ({
    default: Component,
  })),
);
const MoreTab = lazy(() =>
  import("./UISettingsTabs").then(({ MoreTab: Component }) => ({
    default: Component,
  })),
);

interface UISettingsProps {
  isLightBackground?: boolean;
  onRequestResetSetupDialog?: (onConfirm: () => Promise<void> | void) => void;
  onRequestSettingsErrorDialog?: (message: string) => void;
}

const DEFAULT_BACKUP_SELECTION: BackupSelection = {
  config: true,
  settings: true,
  data: true,
  chats: true,
  models: true,
  motions: true,
  emotes: true,
  stages: true,
  voices: true,
  backgrounds: true,
  otherFiles: true,
};

type UITab = "display" | "chat" | "mode" | "tools";

const UISettings = ({
  isLightBackground = false,
  onRequestResetSetupDialog,
  onRequestSettingsErrorDialog,
}: UISettingsProps) => {
  const uiConfig = useUIConfig();
  const { updateUIConfig } = useConfigUIActions();
  const desktopAPI = useDesktopApi();
  const { resetSetup } = useSetup();
  const [activeSubTab, setActiveSubTab] = useState<UITab>("display");
  const [isResetting, setIsResetting] = useState(false);
  const [useSelectiveBackup, setUseSelectiveBackup] = useState(false);
  const [backupSelection, setBackupSelection] = useState<BackupSelection>(
    DEFAULT_BACKUP_SELECTION,
  );
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupStatus, setBackupStatus] = useState("");
  const backupImportInputRef = useRef<HTMLInputElement | null>(null);
  const [subTabIndicatorStyle, setSubTabIndicatorStyle] = useState({
    left: 0,
    width: 0,
  });
  const subTabsRef = useRef<Record<UITab, HTMLButtonElement | null>>({
    display: null,
    chat: null,
    mode: null,
    tools: null,
  });

  const allowPositionSelection = !isAndroid && !isDesktop;
  const showModeTab = isDesktop && !!desktopAPI?.window?.setDesktopMode;

  useEffect(() => {
    const updateSubTabIndicator = () => {
      const activeTabElement = subTabsRef.current[activeSubTab];
      if (!activeTabElement) return;

      setSubTabIndicatorStyle({
        left: activeTabElement.offsetLeft,
        width: activeTabElement.offsetWidth,
      });
    };

    updateSubTabIndicator();
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const handleResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(updateSubTabIndicator, 150);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      window.removeEventListener("resize", handleResize);
    };
  }, [activeSubTab]);

  const handleResetSetup = async () => {
    if (isResetting) return;

    try {
      setIsResetting(true);
      await resetSetup();
      window.location.reload();
    } catch (error) {
      Logger.error("other", "Failed to reset setup:", error);
      onRequestSettingsErrorDialog?.(
        "Failed to reset setup. Please try again.",
      );
    } finally {
      setIsResetting(false);
    }
  };

  const updateBackupSelection = (
    key: keyof BackupSelection,
    checked: boolean,
  ): void => {
    setBackupSelection((previous) => ({ ...previous, [key]: checked }));
  };

  const getEffectiveBackupSelection = (): BackupSelection =>
    useSelectiveBackup ? backupSelection : DEFAULT_BACKUP_SELECTION;

  const handleExportBackup = async (): Promise<void> => {
    if (backupBusy) return;

    try {
      setBackupBusy(true);
      setBackupStatus("Preparing backup...");
      const zipBlob = await appDataBackupService.exportToZip(
        getEffectiveBackupSelection(),
      );
      const url = URL.createObjectURL(zipBlob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `vassist-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setBackupStatus("Backup exported successfully.");
    } catch (error) {
      Logger.error("UISettings", "Backup export failed:", error);
      setBackupStatus("Backup export failed. Check logs for details.");
    } finally {
      setBackupBusy(false);
    }
  };

  const handleImportButtonClick = (): void => {
    if (!backupBusy) backupImportInputRef.current?.click();
  };

  const handleImportBackup = async (
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || backupBusy) return;

    try {
      setBackupBusy(true);
      setBackupStatus("Importing backup...");
      await appDataBackupService.importFromZip(
        file,
        getEffectiveBackupSelection(),
      );
      setBackupStatus("Backup imported successfully. Reloading...");
      setTimeout(() => window.location.reload(), 600);
    } catch (error) {
      Logger.error("UISettings", "Backup import failed:", error);
      setBackupStatus(
        "Backup import failed. Ensure this is a valid vassist backup ZIP.",
      );
      setBackupBusy(false);
    }
  };

  const sharedProps = {
    uiConfig,
    updateUIConfig,
    isLightBackground,
    isAndroid,
    isDesktop,
    isExtension,
    allowPositionSelection,
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative">
        <div
          className="absolute bottom-0 z-10 h-0.5 bg-white transition-all duration-300 ease-out"
          style={{
            left: `${subTabIndicatorStyle.left}px`,
            width: `${subTabIndicatorStyle.width}px`,
          }}
        />
        <TabBar
          tabs={[
            { id: "display", label: "Display" },
            { id: "chat", label: "Chat" },
            ...(showModeTab ? [{ id: "mode", label: "Mode" }] : []),
            { id: "tools", label: "Tools" },
          ]}
          activeTab={activeSubTab}
          onTabChange={(tabId) => setActiveSubTab(tabId as UITab)}
          size="compact"
          ariaLabel="UI settings"
          tabsRef={subTabsRef}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto scrollbar-glass px-4 py-3 md:px-6 md:py-4">
          <Suspense
            fallback={
              <div className="flex min-h-[220px] items-center justify-center">
                <Icon
                  name="loading-2"
                  size={28}
                  className="animate-spin text-white/75"
                />
              </div>
            }
          >
            {activeSubTab === "display" && (
              <DisplayTab
                {...sharedProps}
                isResetting={isResetting}
                onResetSetup={() => {
                  if (onRequestResetSetupDialog) {
                    onRequestResetSetupDialog(handleResetSetup);
                  } else {
                    void handleResetSetup();
                  }
                }}
              />
            )}
            {activeSubTab === "chat" && <ChatTab {...sharedProps} />}
            {activeSubTab === "mode" && showModeTab && (
              <DesktopModeSettings isLightBackground={isLightBackground} />
            )}
            {activeSubTab === "tools" && (
              <div className="space-y-6">
                <ToolsTab {...sharedProps} />
                <div className="border-t border-white/10 pt-6">
                  <MoreTab
                    {...sharedProps}
                    setUseSelectiveBackup={(checked) =>
                      setUseSelectiveBackup(checked)
                    }
                    useSelectiveBackup={useSelectiveBackup}
                    backupSelection={backupSelection}
                    updateBackupSelection={updateBackupSelection}
                    backupBusy={backupBusy}
                    backupStatus={backupStatus}
                    backupImportInputRef={backupImportInputRef}
                    onExportBackup={() => void handleExportBackup()}
                    onImportButtonClick={handleImportButtonClick}
                    onImportBackup={handleImportBackup}
                  />
                </div>
              </div>
            )}
          </Suspense>
        </div>
      </div>
    </div>
  );
};

export default UISettings;
