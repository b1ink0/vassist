import AppContent from './components/AppContent'
import DemoSite from './components/DemoSite'
import SetupWizard from './components/setup/SetupWizard'
import LoadingIndicator from './components/LoadingIndicator'
import { ConfigProvider } from './contexts/ConfigContext'
import { AppProvider } from './contexts/AppContext'
import { SetupProvider, useSetup } from './contexts/SetupContext'

function AppWithSetup({ mode = 'development' }) {
  const { setupCompleted, isLoading } = useSetup();
  
  // Show loading indicator while checking setup status
  if (isLoading) {
    return <LoadingIndicator isVisible={true} />;
  }
  
  // Show setup wizard if setup not completed
  if (!setupCompleted) {
    return <SetupWizard />;
  }
  
  // Setup completed, show normal app
  return <AppContent mode={mode} />;
}

function App({ mode = 'development' }) {
  return (
    <SetupProvider>
      <ConfigProvider>
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
      </ConfigProvider>
    </SetupProvider>
  )
}

export default App
