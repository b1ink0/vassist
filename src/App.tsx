/**
 * @fileoverview Root application component with setup wizard and context providers.
 */

import CameraService from "./services/CameraService";
import ScreenShareService from "./services/ScreenShareService";
import DemoSite from "./components/DemoSite";
import LoadingIndicator from "./components/common/LoadingIndicator";
import { AppRuntimeProvider } from "./contexts/AppRuntimeContext";
import type { AppStore } from "./stores/createAppStore";
import { SetupProvider, useSetup } from "./contexts/SetupContext";
import {
  normalizeVAssistEmbedConfig,
  type ResolvedVAssistEmbedConfig,
  type VAssistEmbedConfig,
} from "./embed/config";
import { getVAssistThemeRootAttributes } from "./embed/theme";
import {
  setActiveEmbedHostId,
  setResolvedEmbedConfig,
} from "./embed/runtimeStore";
import { EmbedHostProvider } from "./embed/EmbedHostContext";
import { AnimationProvider } from "./contexts/AnimationContext";
import { useInitializeAppStore } from "./hooks/bootstrap/useInitializeAppStore";
import { useInitializeConfigStore } from "./hooks/bootstrap/useInitializeConfigStore";
import { useRefreshAndroidApi } from "./hooks/useAndroidStore";
import { useRefreshDesktopApi } from "./hooks/useDesktopStore";
import {
  isAndroid,
  isEmbed,
  isInputWindow,
  isScreenPicker,
} from "./utils/PlatformUtils";
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { vassistTestFlags } from "./testing/runtime";

interface AppWithSetupProps {
  mode?: string;
  showDeferredSetup?: boolean;
  onStartSetup?: (() => void) | undefined;
  onMinimizeSetup?: (() => void) | undefined;
  forcePortraitWhileDeferred?: boolean;
  embedConfig: ResolvedVAssistEmbedConfig;
}

interface AppProps {
  mode?: string;
  isWallpaperMode?: boolean;
  embedded?: boolean;
  deferSetupUntilStarted?: boolean;
  embedConfig?: VAssistEmbedConfig;
  onStoreReady?: ((store: AppStore) => void) | undefined;
}

function StoreBootstrap({
  children,
  embedConfig,
  onStoreReady,
}: {
  children: ReactNode;
  embedConfig: ResolvedVAssistEmbedConfig;
  onStoreReady?: ((store: AppStore) => void) | undefined;
}) {
  return (
    <AppRuntimeProvider onStoreReady={onStoreReady}>
      <StoreBootstrapInner embedConfig={embedConfig}>
        {children}
      </StoreBootstrapInner>
    </AppRuntimeProvider>
  );
}

function StoreBootstrapInner({
  children,
  embedConfig,
}: {
  children: ReactNode;
  embedConfig: ResolvedVAssistEmbedConfig;
}) {
  useInitializeConfigStore(embedConfig);
  useInitializeAppStore(embedConfig);

  const refreshDesktopApi = useRefreshDesktopApi();
  const refreshAndroidApi = useRefreshAndroidApi();

  useEffect(() => {
    refreshDesktopApi();
    refreshAndroidApi();
  }, [refreshAndroidApi, refreshDesktopApi]);

  useEffect(() => {
    setResolvedEmbedConfig(embedConfig, embedConfig.mount.hostId);
    setActiveEmbedHostId(embedConfig.mount.hostId);
  }, [embedConfig]);

  const themeRoot = useMemo(
    () => getVAssistThemeRootAttributes(embedConfig),
    [embedConfig],
  );

  return (
    <EmbedHostProvider embedConfig={embedConfig}>
      <div
        className="vassist-theme-root"
        data-vassist-host-id={embedConfig.mount.hostId}
        data-vassist-theme-mode={themeRoot.mode}
        data-vassist-surface-style={themeRoot.surfaceStyle}
        style={themeRoot.style}
        onMouseEnter={() => setActiveEmbedHostId(embedConfig.mount.hostId)}
        onPointerDownCapture={() =>
          setActiveEmbedHostId(embedConfig.mount.hostId)
        }
        onFocusCapture={() => setActiveEmbedHostId(embedConfig.mount.hostId)}
      >
        {children}
      </div>
    </EmbedHostProvider>
  );
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
  showDeferredSetup = false,
  onStartSetup,
  onMinimizeSetup,
  forcePortraitWhileDeferred = false,
  embedConfig,
}: AppWithSetupProps) {
  const { setupCompleted, isLoading } = useSetup();
  const requireSetupOnChatClick = showDeferredSetup && !setupCompleted;
  const appContentProps = onStartSetup ? { onRequireSetup: onStartSetup } : {};

  if (isLoading) {
    return <LoadingIndicator isVisible={true} />;
  }

  if (!setupCompleted) {
    if (showDeferredSetup) {
      return (
        <Suspense fallback={<LoadingIndicator isVisible={true} />}>
          <LazyAppContent
            mode={mode}
            requireSetupOnChatClick={requireSetupOnChatClick}
            {...appContentProps}
            forcePortraitMode={forcePortraitWhileDeferred}
            embedConfig={embedConfig}
          />
        </Suspense>
      );
    }

    return (
      <Suspense fallback={<LoadingIndicator isVisible={true} />}>
        <LazySetupWizard onMinimizeSetup={onMinimizeSetup} />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<LoadingIndicator isVisible={true} />}>
      <LazyAppContent
        mode={mode}
        requireSetupOnChatClick={requireSetupOnChatClick}
        {...appContentProps}
        embedConfig={embedConfig}
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

function isEmbeddedModeEnabled() {
  if (typeof window === "undefined") {
    return false;
  }

  const params = new URLSearchParams(window.location.search);
  const embedParam = params.get("embed");

  if (embedParam === null) {
    return false;
  }

  return !["0", "false", "no", "off"].includes(embedParam.toLowerCase());
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
  embedded = false,
  deferSetupUntilStarted,
  embedConfig,
  onStoreReady,
}: AppProps) {
  const shouldRenderCameraPreview =
    !vassistTestFlags.enabled || !vassistTestFlags.disableCamera;

  const resolvedEmbedConfig = useMemo(
    () =>
      normalizeVAssistEmbedConfig(
        embedConfig ??
          (deferSetupUntilStarted
            ? { shell: { deferSetupUntilStarted } }
            : undefined),
      ),
    [deferSetupUntilStarted, embedConfig],
  );

  // Determine actual mode based on build-time constants and props
  const actualMode = __DESKTOP_MODE__
    ? "desktop"
    : isAndroid
      ? "android"
      : mode;
  const isEmbeddedDevelopmentMode =
    actualMode === "development" &&
    (embedded || isEmbed || isEmbeddedModeEnabled());
  const shouldDeferEmbeddedSetup = isEmbeddedDevelopmentMode
    ? resolvedEmbedConfig.shell.deferSetupUntilStarted
    : false;
  const defaultDeferredSetup =
    actualMode === "development"
      ? isEmbeddedDevelopmentMode
        ? shouldDeferEmbeddedSetup
        : (deferSetupUntilStarted ?? !isEmbeddedDevelopmentMode)
      : false;
  const defaultForcePortraitWhileDeferred =
    actualMode === "development"
      ? isEmbeddedDevelopmentMode
        ? resolvedEmbedConfig.shell.forcePortraitMode
        : !isEmbeddedDevelopmentMode
      : false;
  const developmentContainerClass = isEmbeddedDevelopmentMode
    ? "relative h-full w-full overflow-visible"
    : "relative w-full h-screen overflow-hidden";
  const [showDeferredSetup, setShowDeferredSetup] =
    useState(defaultDeferredSetup);

  useEffect(() => {
    setShowDeferredSetup(defaultDeferredSetup);
  }, [defaultDeferredSetup]);

  if (actualMode === "android") {
    if (
      typeof explicitWallpaperMode === "boolean"
        ? explicitWallpaperMode
        : isWallpaperMode()
    ) {
      return (
        <StoreBootstrap
          embedConfig={resolvedEmbedConfig}
          onStoreReady={onStoreReady}
        >
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
      <StoreBootstrap
        embedConfig={resolvedEmbedConfig}
        onStoreReady={onStoreReady}
      >
        <SetupProvider embedConfig={resolvedEmbedConfig}>
          <AnimationProvider>
            <div className="relative w-full h-screen overflow-hidden">
              <Suspense fallback={null}>
                <LazyAndroidBackground />
              </Suspense>
              <AppWithSetup
                mode="android"
                showDeferredSetup={showDeferredSetup}
                onStartSetup={() => setShowDeferredSetup(false)}
                onMinimizeSetup={() => setShowDeferredSetup(true)}
                embedConfig={resolvedEmbedConfig}
              />
              {shouldRenderCameraPreview && (
                <Suspense fallback={null}>
                  <LazyVideoPreview service={CameraService} type="camera" />
                </Suspense>
              )}
            </div>
          </AnimationProvider>
        </SetupProvider>
      </StoreBootstrap>
    );
  }

  if (actualMode === "desktop") {
    if (isScreenPicker) {
      return (
        <StoreBootstrap
          embedConfig={resolvedEmbedConfig}
          onStoreReady={onStoreReady}
        >
          <Suspense fallback={<LoadingIndicator isVisible={true} />}>
            <LazyDesktopScreenShareDialog />
          </Suspense>
        </StoreBootstrap>
      );
    }

    if (isInputWindow) {
      return (
        <StoreBootstrap
          embedConfig={resolvedEmbedConfig}
          onStoreReady={onStoreReady}
        >
          <Suspense fallback={null}>
            <LazyDesktopWindowInteractivityBridge />
          </Suspense>
          <Suspense fallback={<LoadingIndicator isVisible={true} />}>
            <LazyChatInput
              onSend={() => {}}
              onClose={() => {}}
              onVoiceTranscription={() => {}}
              onVoiceMode={() => {}}
              embedConfig={resolvedEmbedConfig}
            />
          </Suspense>
          <Suspense fallback={null}>
            {shouldRenderCameraPreview && (
              <LazyVideoPreview service={CameraService} type="camera" />
            )}
            <LazyVideoPreview service={ScreenShareService} type="screen" />
          </Suspense>
        </StoreBootstrap>
      );
    }

    return (
      <StoreBootstrap
        embedConfig={resolvedEmbedConfig}
        onStoreReady={onStoreReady}
      >
        <SetupProvider embedConfig={resolvedEmbedConfig}>
          <AnimationProvider>
            <Suspense fallback={null}>
              <LazyDesktopWindowInteractivityBridge />
            </Suspense>
            <Suspense fallback={null}>
              <LazyDesktopWindowControls />
            </Suspense>
            <div className="relative w-full h-screen overflow-hidden">
              <AppWithSetup
                mode="desktop"
                showDeferredSetup={showDeferredSetup}
                onStartSetup={() => setShowDeferredSetup(false)}
                onMinimizeSetup={() => setShowDeferredSetup(true)}
                embedConfig={resolvedEmbedConfig}
              />
              <Suspense fallback={null}>
                {shouldRenderCameraPreview && (
                  <LazyVideoPreview service={CameraService} type="camera" />
                )}
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
    <StoreBootstrap
      embedConfig={resolvedEmbedConfig}
      onStoreReady={onStoreReady}
    >
      <SetupProvider embedConfig={resolvedEmbedConfig}>
        <AnimationProvider>
          {actualMode === "development" ? (
            <div className={developmentContainerClass}>
              {!vassistTestFlags.enabled || !isEmbeddedDevelopmentMode ? (
                <DevelopmentDemoSite
                  onStartSetup={() => setShowDeferredSetup(false)}
                />
              ) : null}
              <AppWithSetup
                mode="development"
                showDeferredSetup={showDeferredSetup}
                onStartSetup={() => setShowDeferredSetup(false)}
                onMinimizeSetup={() => setShowDeferredSetup(true)}
                forcePortraitWhileDeferred={defaultForcePortraitWhileDeferred}
                embedConfig={resolvedEmbedConfig}
              />
              <Suspense fallback={null}>
                {shouldRenderCameraPreview && (
                  <LazyVideoPreview service={CameraService} type="camera" />
                )}
                <LazyVideoPreview service={ScreenShareService} type="screen" />
              </Suspense>
            </div>
          ) : (
            <>
              <AppWithSetup
                mode="extension"
                showDeferredSetup={showDeferredSetup}
                onStartSetup={() => setShowDeferredSetup(false)}
                onMinimizeSetup={() => setShowDeferredSetup(true)}
                embedConfig={resolvedEmbedConfig}
              />
              <Suspense fallback={<LoadingIndicator isVisible={true} />}>
                {shouldRenderCameraPreview && (
                  <LazyVideoPreview service={CameraService} type="camera" />
                )}
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
