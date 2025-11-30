/**
 * @fileoverview Root application component with setup wizard and context providers.
 */

import AppContent from './components/AppContent'
import AndroidContent from '../android-src/AndroidContent'
import AndroidBackground from './components/AndroidBackground'
import DemoSite from './components/DemoSite'
import SetupWizard from './components/setup/SetupWizard'
import LoadingIndicator from './components/LoadingIndicator'
import DesktopWindowControls from './components/DesktopWindowControls'
import { ConfigProvider } from './contexts/ConfigContext'
import { AppProvider } from './contexts/AppContext'
import { SetupProvider, useSetup } from './contexts/SetupContext'
import { useDesktopClickThrough } from './hooks/useDesktopClickThrough'
import { AnimationProvider } from './contexts/AnimationContext'
import { isAndroid } from './utils/PlatformUtils'

/**
 * Application wrapper component that handles setup flow.
 * 
 * @param {Object} props
 * @param {string} props.mode - Application mode ('development'|'extension'|'android')
 * @returns {JSX.Element}
 */
function AppWithSetup({ mode = 'development' }) {
  const { setupCompleted, isLoading } = useSetup();
  
  if (isLoading) {
    return <LoadingIndicator isVisible={true} />;
  }
  
  if (!setupCompleted) {
    return <SetupWizard />;
  }
  
  return <AppContent mode={mode} />;
}

/**
 * Android wrapper component - only loads the 3D model for wallpaper.
 * 
 * @returns {JSX.Element}
 */
function AndroidWrapper() {
  return <AndroidContent />;
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

/**
 * Root application component.
 * 
 * @param {Object} props
 * @param {string} props.mode - Application mode ('development'|'extension'|'desktop'|'android')
 * @returns {JSX.Element}
 */
function App({ mode = 'development' }) {
  // Determine actual mode based on build-time constants and props
  const actualMode = __DESKTOP_MODE__ ? 'desktop' : isAndroid ? 'android' : mode;
  
  // Enable click-through for transparent areas in desktop mode
  useDesktopClickThrough();
  
  if (actualMode === 'android') {
    if (isWallpaperMode()) {
      return (
        <ConfigProvider>
          <AnimationProvider>
            <AppProvider>
              <div className="relative w-full h-screen overflow-hidden bg-transparent">
                <AndroidBackground />
                <AndroidWrapper />
              </div>
            </AppProvider>
          </AnimationProvider>
        </ConfigProvider>
      );
    }
    
    return (
      <SetupProvider>
        <ConfigProvider>
          <AnimationProvider>
            <AppProvider>
              <div className="relative w-full h-screen overflow-hidden">
                <AndroidBackground />
                <AppWithSetup mode="android" />
              </div>
            </AppProvider>
          </AnimationProvider>
        </ConfigProvider>
      </SetupProvider>
    );
  }
  
  return (
    <SetupProvider>
      <ConfigProvider>
        <AnimationProvider>
          <AppProvider>
            {actualMode === 'desktop' && <DesktopWindowControls />}
            {actualMode === 'development' ? (
              <div className="relative w-full h-screen overflow-hidden">
                <DemoSite />
                <AppWithSetup mode="development" />
              </div>
            ) : actualMode === 'desktop' ? (
              <div className="relative w-full h-screen overflow-hidden">
                <AppWithSetup mode="desktop" />
              </div>
            ) : (
              <AppWithSetup mode="extension" />
            )}
          </AppProvider>
        </AnimationProvider>
      </ConfigProvider>
    </SetupProvider>
  )
}

export default App
