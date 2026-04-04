/**
 * @fileoverview Root application component with setup wizard and context providers.
 */

import CameraService from './services/CameraService'
import ScreenShareService from './services/ScreenShareService'
import DemoSite from './components/DemoSite'
import LoadingIndicator from './components/LoadingIndicator'
import { ConfigProvider } from './contexts/ConfigContext'
import { AppProvider } from './contexts/AppContext'
import { SetupProvider, useSetup } from './contexts/SetupContext'
import { AnimationProvider } from './contexts/AnimationContext'
import { DesktopProvider } from './contexts/DesktopContext'
import { AndroidProvider } from './contexts/AndroidContext'
import { isAndroid, isInputWindow, isScreenPicker } from './utils/PlatformUtils'
import { lazy, Suspense, useState } from 'react'

const LazyAppContent = lazy(() => import('./components/AppContent'))
const LazySetupWizard = lazy(() => import('./components/setup/SetupWizard'))
const LazyChatInput = lazy(() => import('./components/ChatInput'))
const LazyVideoPreview = lazy(() => import('./components/VideoPreview'))
const LazyDesktopWindowControls = lazy(() => import('./components/DesktopWindowControls'))
const LazyDesktopScreenShareDialog = lazy(() => import('./components/DesktopScreenShareDialog'))
const LazyAndroidContent = lazy(() => import('../android-src/AndroidContent'))
const LazyAndroidBackground = lazy(() => import('./components/AndroidBackground'))

/**
 * Application wrapper component that handles setup flow.
 * 
 * @param {Object} props
 * @param {string} props.mode - Application mode ('development'|'extension'|'android')
 * @returns {JSX.Element}
 */
function AppWithSetup({ mode = 'development', deferSetupUntilStarted = false, setupStarted = true, onStartSetup }) {
  const { setupCompleted, isLoading } = useSetup();
  const requireSetupOnChatClick = deferSetupUntilStarted && !setupStarted && !setupCompleted;
  
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
            onRequireSetup={onStartSetup}
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
        onRequireSetup={onStartSetup}
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
  if (typeof window === 'undefined') return true;
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');
  return mode !== 'app';
}

function DevelopmentDemoSite({ onStartSetup }) {
  const { setupCompleted, isLoading } = useSetup();
  const launchHandler = !isLoading && !setupCompleted ? onStartSetup : undefined;

  return <DemoSite onLaunchAssistant={launchHandler} />;
}

/**
 * Root application component.
 * 
 * @param {Object} props
 * @param {string} props.mode - Application mode ('development'|'extension'|'desktop'|'android')
 * @returns {JSX.Element}
 */
function App({ mode = 'development' }) {
  const [devSetupStarted, setDevSetupStarted] = useState(false);

  // Determine actual mode based on build-time constants and props
  const actualMode = __DESKTOP_MODE__ ? 'desktop' : isAndroid ? 'android' : mode;
  
  if (actualMode === 'android') {
    if (isWallpaperMode()) {
      return (
        <AndroidProvider>
          <ConfigProvider>
            <AnimationProvider>
              <AppProvider>
                <div className="relative w-full h-screen overflow-hidden bg-transparent">
                  <Suspense fallback={null}>
                    <LazyAndroidBackground />
                  </Suspense>
                  <AndroidWrapper />
                </div>
              </AppProvider>
            </AnimationProvider>
          </ConfigProvider>
        </AndroidProvider>
      );
    }
    
    return (
      <AndroidProvider>
        <SetupProvider>
          <ConfigProvider>
            <AnimationProvider>
              <AppProvider>
                <div className="relative w-full h-screen overflow-hidden">
                  <Suspense fallback={null}>
                    <LazyAndroidBackground />
                  </Suspense>
                  <AppWithSetup mode="android" />
                  <Suspense fallback={null}>
                    <LazyVideoPreview service={CameraService} type="camera" />
                  </Suspense>
                </div>
              </AppProvider>
            </AnimationProvider>
          </ConfigProvider>
        </SetupProvider>
      </AndroidProvider>
    );
  }
  
  if (actualMode === 'desktop') {
    if (isScreenPicker) {
      return (
        <DesktopProvider>
          <Suspense fallback={<LoadingIndicator isVisible={true} />}>
            <LazyDesktopScreenShareDialog />
          </Suspense>
        </DesktopProvider>
      );
    }
    
    if (isInputWindow) {
      return (
        <DesktopProvider>
          <ConfigProvider>
            <AppProvider>
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
            </AppProvider>
          </ConfigProvider>
        </DesktopProvider>
      );
    }
    
    return (
      <DesktopProvider>
        <SetupProvider>
          <ConfigProvider>
            <AnimationProvider>
              <AppProvider>
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
              </AppProvider>
            </AnimationProvider>
          </ConfigProvider>
        </SetupProvider>
      </DesktopProvider>
    );
  }
  
  // Development and Extension modes
  return (
    <SetupProvider>
      <ConfigProvider>
        <AnimationProvider>
          <AppProvider>
            {actualMode === 'development' ? (
              <div className="relative w-full h-screen overflow-hidden">
                <DevelopmentDemoSite onStartSetup={() => setDevSetupStarted(true)} />
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
                <Suspense fallback={null}>
                  <LazyVideoPreview service={CameraService} type="camera" />
                  <LazyVideoPreview service={ScreenShareService} type="screen" />
                </Suspense>
              </>
            )}
          </AppProvider>
        </AnimationProvider>
      </ConfigProvider>
    </SetupProvider>
  )
}

export default App
