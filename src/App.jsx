/**
 * @fileoverview Root application component with setup wizard and context providers.
 */

import AppContent from './components/AppContent'
import DemoSite from './components/DemoSite'
import SetupWizard from './components/setup/SetupWizard'
import LoadingIndicator from './components/LoadingIndicator'
import DesktopWindowControls from './components/DesktopWindowControls'
import { ConfigProvider } from './contexts/ConfigContext'
import { AppProvider } from './contexts/AppContext'
import { SetupProvider, useSetup } from './contexts/SetupContext'
import { useDesktopClickThrough } from './hooks/useDesktopClickThrough'

/**
 * Application wrapper component that handles setup flow.
 * 
 * @param {Object} props
 * @param {string} props.mode - Application mode ('development'|'extension')
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
 * Root application component.
 * 
 * @param {Object} props
 * @param {string} props.mode - Application mode ('development'|'extension'|'desktop')
 * @returns {JSX.Element}
 */
function App({ mode = 'development' }) {
  // Determine actual mode based on build-time constants and props
  const actualMode = __DESKTOP_MODE__ ? 'desktop' : mode;
  
  // Enable click-through for transparent areas in desktop mode
  useDesktopClickThrough();
  
  return (
    <SetupProvider>
      <ConfigProvider>
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
      </ConfigProvider>
    </SetupProvider>
  )
}

export default App
