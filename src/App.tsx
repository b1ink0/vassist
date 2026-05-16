/**
 * @fileoverview Root application component with setup wizard and context providers.
 */

import CameraService from "./services/CameraService";
import ScreenShareService from "./services/ScreenShareService";
import DemoSite from "./components/DemoSite";
import LoadingIndicator from "./components/common/LoadingIndicator";
import { SetupProvider, useSetup } from "./contexts/SetupContext";
import { AnimationProvider } from "./contexts/AnimationContext";
import { useInitializeAppStore } from "./hooks/bootstrap/useInitializeAppStore";
import { useInitializeConfigStore } from "./hooks/bootstrap/useInitializeConfigStore";
import { useRefreshAndroidApi } from "./hooks/useAndroidStore";
import { useRefreshDesktopApi } from "./hooks/useDesktopStore";
import {
  isAndroid,
  isInputWindow,
  isScreenPicker,
} from "./utils/PlatformUtils";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";

interface AppWithSetupProps {
  mode?: string;
  deferSetupUntilStarted?: boolean;
  setupStarted?: boolean;
  onStartSetup?: () => void;
}

interface AppProps {
  mode?: string;
  isWallpaperMode?: boolean;
}

function StoreBootstrap({ children }: { children: ReactNode }) {
  useInitializeConfigStore();
  useInitializeAppStore();

  const refreshDesktopApi = useRefreshDesktopApi();
  const refreshAndroidApi = useRefreshAndroidApi();

  useEffect(() => {
    refreshDesktopApi();
    refreshAndroidApi();
  }, [refreshAndroidApi, refreshDesktopApi]);

  return <>{children}</>;
}

const LazyAppContent = lazy(() => import("./components/AppContent"));
const LazySetupWizard = lazy(() => import("./components/setup/SetupWizard"));
const LazyChatInput = lazy(() => import("./components/chat/ChatInput"));
const LazyVideoPreview = lazy(
  () => import("./components/desktop/VideoPreview"),
);
const LazyDesktopWindowControls = lazy(
  () => import("./components/desktop/DesktopWindowControls"),
);
const LazyDesktopWindowInteractivityBridge = lazy(
  () => import("./components/desktop/DesktopWindowInteractivityBridge"),
);
const LazyDesktopScreenShareDialog = lazy(
  () => import("./components/desktop/DesktopScreenShareDialog"),
);
const LazyAndroidContent = lazy(() => import("../android-src/AndroidContent"));
const LazyAndroidBackground = lazy(
  () => import("./components/android/AndroidBackground"),
);

/**
 * Application wrapper component that handles setup flow.
 *
 * @param {Object} props
 * @param {string} props.mode - Application mode ('development'|'extension'|'android')
 * @returns {JSX.Element}
 */
function AppWithSetup({
  mode = "development",
  deferSetupUntilStarted = false,
  setupStarted = true,
  onStartSetup,
}: AppWithSetupProps) {
  const { setupCompleted, isLoading } = useSetup();
  const requireSetupOnChatClick =
    deferSetupUntilStarted && !setupStarted && !setupCompleted;
  const appContentProps = onStartSetup ? { onRequireSetup: onStartSetup } : {};

  if (isLoading) {
    return <LoadingIndicator isVisible={true} />;
  }

  if (!setupCompleted) {
    if (deferSetupUntilStarted && !setupStarted) {
      return (
        <Suspense fallback={<LoadingIndicator isVisible={true} />}>
          <LazyAppContent
            mode={mode}
            requireSetupOnChatClick={requireSetupOnChatClick}
            {...appContentProps}
            forcePortraitMode={true}
          />
        </Suspense>
      );
    }

    return (
      <Suspense fallback={<LoadingIndicator isVisible={true} />}>
        <LazySetupWizard />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<LoadingIndicator isVisible={true} />}>
      <LazyAppContent
        mode={mode}
        requireSetupOnChatClick={requireSetupOnChatClick}
        {...appContentProps}
      />
    </Suspense>
  );
}

/**
 * Android wrapper component - only loads the 3D model for wallpaper.
 *
 * @returns {JSX.Element}
 */
function AndroidWrapper() {
  return (
    <Suspense fallback={<LoadingIndicator isVisible={true} />}>
      <LazyAndroidContent />
    </Suspense>
  );
}

/**
 * Check if running in Android wallpaper mode
 */
function isWallpaperMode() {
  if (typeof window === "undefined") return true;
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");
  return mode !== "app";
}

function DevelopmentDemoSite({ onStartSetup }: { onStartSetup: () => void }) {
  const { setupCompleted, isLoading } = useSetup();
  const launchHandler =
    !isLoading && !setupCompleted ? onStartSetup : undefined;
  const demoSiteProps = launchHandler
    ? { onLaunchAssistant: launchHandler }
    : {};

  return <DemoSite {...demoSiteProps} />;
}

/**
 * Root application component.
 *
 * @param {Object} props
 * @param {string} props.mode - Application mode ('development'|'extension'|'desktop'|'android')
 * @returns {JSX.Element}
 */
function App({
  mode = "development",
  isWallpaperMode: explicitWallpaperMode,
}: AppProps) {
  const [devSetupStarted, setDevSetupStarted] = useState(false);

  // Determine actual mode based on build-time constants and props
  const actualMode = __DESKTOP_MODE__
    ? "desktop"
    : isAndroid
      ? "android"
      : mode;

  if (actualMode === "android") {
    if (
      typeof explicitWallpaperMode === "boolean"
        ? explicitWallpaperMode
        : isWallpaperMode()
    ) {
      return (
        <StoreBootstrap>
          <AnimationProvider>
            <div className="relative w-full h-screen overflow-hidden bg-transparent">
              <Suspense fallback={null}>
                <LazyAndroidBackground />
              </Suspense>
              <AndroidWrapper />
            </div>
          </AnimationProvider>
        </StoreBootstrap>
      );
    }

    return (
      <StoreBootstrap>
        <SetupProvider>
          <AnimationProvider>
            <div className="relative w-full h-screen overflow-hidden">
              <Suspense fallback={null}>
                <LazyAndroidBackground />
              </Suspense>
              <AppWithSetup mode="android" />
              <Suspense fallback={null}>
                <LazyVideoPreview service={CameraService} type="camera" />
              </Suspense>
            </div>
          </AnimationProvider>
        </SetupProvider>
      </StoreBootstrap>
    );
  }

  if (actualMode === "desktop") {
    if (isScreenPicker) {
      return (
        <StoreBootstrap>
          <Suspense fallback={<LoadingIndicator isVisible={true} />}>
            <LazyDesktopScreenShareDialog />
          </Suspense>
        </StoreBootstrap>
      );
    }

    if (isInputWindow) {
      return (
        <StoreBootstrap>
          <Suspense fallback={null}>
            <LazyDesktopWindowInteractivityBridge />
          </Suspense>
          <Suspense fallback={<LoadingIndicator isVisible={true} />}>
            <LazyChatInput
              onSend={() => {}}
              onClose={() => {}}
              onVoiceTranscription={() => {}}
              onVoiceMode={() => {}}
            />
          </Suspense>
          <Suspense fallback={null}>
            <LazyVideoPreview service={CameraService} type="camera" />
            <LazyVideoPreview service={ScreenShareService} type="screen" />
          </Suspense>
        </StoreBootstrap>
      );
    }

    return (
      <StoreBootstrap>
        <SetupProvider>
          <AnimationProvider>
            <Suspense fallback={null}>
              <LazyDesktopWindowInteractivityBridge />
            </Suspense>
            <Suspense fallback={null}>
              <LazyDesktopWindowControls />
            </Suspense>
            <div className="relative w-full h-screen overflow-hidden">
              <AppWithSetup mode="desktop" />
              <Suspense fallback={null}>
                <LazyVideoPreview service={CameraService} type="camera" />
                <LazyVideoPreview service={ScreenShareService} type="screen" />
              </Suspense>
            </div>
          </AnimationProvider>
        </SetupProvider>
      </StoreBootstrap>
    );
  }

  // Development and Extension modes
  return (
    <StoreBootstrap>
      <SetupProvider>
        <AnimationProvider>
          {actualMode === "development" ? (
            <div className="relative w-full h-screen overflow-hidden">
              <DevelopmentDemoSite
                onStartSetup={() => setDevSetupStarted(true)}
              />
              <AppWithSetup
                mode="development"
                deferSetupUntilStarted={true}
                setupStarted={devSetupStarted}
                onStartSetup={() => setDevSetupStarted(true)}
              />
              <Suspense fallback={null}>
                <LazyVideoPreview service={CameraService} type="camera" />
                <LazyVideoPreview service={ScreenShareService} type="screen" />
              </Suspense>
            </div>
          ) : (
            <>
              <AppWithSetup mode="extension" />
              <Suspense fallback={<LoadingIndicator isVisible={true} />}>
                <LazyVideoPreview service={CameraService} type="camera" />
                <LazyVideoPreview service={ScreenShareService} type="screen" />
              </Suspense>
            </>
          )}
        </AnimationProvider>
      </SetupProvider>
    </StoreBootstrap>
  );
}

export default App;
