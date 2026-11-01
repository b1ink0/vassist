/**
 * UI configuration settings.
 *
 * The individual sections are loaded only when their sub-tab is selected so
 * opening Settings does not mount the complete UI configuration tree.
 */

import SettingsScrollArea from "./shared/SettingsScrollArea";
import SettingsLoading from "./shared/SettingsLoading";
import { lazy, Suspense, useRef, useState, type ChangeEvent } from "react";
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
const HelpSettings = lazy(() =>
  import("./UISettingsTabs").then(({ HelpSettings }) => ({
    default: HelpSettings,
  })),
);
const MoreTab = lazy(() =>
  import("./UISettingsTabs").then(({ MoreTab: Component }) => ({
    default: Component,
  })),
);

interface UISettingsProps {
  page?: "display" | "chat" | "mode" | "tools" | "data" | undefined;
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

const UISettings = ({
  isLightBackground = false,
  page = "display",
  onRequestResetSetupDialog,
  onRequestSettingsErrorDialog,
}: UISettingsProps) => {
  const uiConfig = useUIConfig();
  const { updateUIConfig } = useConfigUIActions();
  const desktopAPI = useDesktopApi();
  const { resetSetup } = useSetup();
  const activeSubTab = page;
  const [isResetting, setIsResetting] = useState(false);
  const [useSelectiveBackup, setUseSelectiveBackup] = useState(false);
  const [backupSelection, setBackupSelection] = useState<BackupSelection>(
    DEFAULT_BACKUP_SELECTION,
  );
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupStatus, setBackupStatus] = useState("");
  const backupImportInputRef = useRef<HTMLInputElement | null>(null);
  const allowPositionSelection = !isAndroid && !isDesktop;
  const showModeTab = isDesktop && !!desktopAPI?.window?.setDesktopMode;

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
    <div
      className={page ? "flex flex-col gap-5" : "flex h-full min-h-0 flex-col"}
    >
      <div
        className={
          page ? "flex flex-col gap-5" : "min-h-0 flex-1 overflow-hidden"
        }
      >
        <SettingsScrollArea
          className={
            page
              ? "flex flex-col gap-5"
              : "h-full overflow-y-auto scrollbar-glass px-4 py-3 md:px-6 md:py-4"
          }
        >
          <Suspense fallback={<SettingsLoading />}>
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
            {(activeSubTab === "tools" || activeSubTab === "data") && (
              <div className="flex min-w-0 flex-col gap-4">
                {activeSubTab === "tools" && <ToolsTab {...sharedProps} />}
                {(!page || activeSubTab === "data") && (
                  <div className="flex flex-col gap-5">
                    <HelpSettings
                      {...sharedProps}
                      isResetting={isResetting}
                      onResetSetup={() => {
                        if (onRequestResetSetupDialog)
                          onRequestResetSetupDialog(handleResetSetup);
                        else void handleResetSetup();
                      }}
                    />
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
                )}
              </div>
            )}
          </Suspense>
        </SettingsScrollArea>
      </div>
    </div>
  );
};

export default UISettings;
