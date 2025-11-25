/**
 * @fileoverview Root application component with setup wizard and context providers.
 */

import AppContent from './components/AppContent'
import DemoSite from './components/DemoSite'
import SetupWizard from './components/setup/SetupWizard'
import LoadingIndicator from './components/LoadingIndicator'
import { ConfigProvider } from './contexts/ConfigContext'
import { AppProvider } from './contexts/AppContext'
import { SetupProvider, useSetup } from './contexts/SetupContext'
import { AnimationProvider } from './contexts/AnimationContext'

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
 * @param {string} props.mode - Application mode ('development'|'extension')
 * @returns {JSX.Element}
 */
function App({ mode = 'development' }) {
  return (
    <SetupProvider>
      <ConfigProvider>
        <AnimationProvider>
          <AppProvider>
            {mode === 'development' ? (
              <div className="relative w-full h-screen overflow-hidden">
                <DemoSite />
                <AppWithSetup mode="development" />
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
