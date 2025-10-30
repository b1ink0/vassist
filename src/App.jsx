import AppContent from './components/AppContent'
import DemoSite from './components/DemoSite'
import { ConfigProvider } from './contexts/ConfigContext'
import { AppProvider } from './contexts/AppContext'
import { SetupProvider } from './contexts/SetupContext'

function App({ mode = 'development' }) {
  return (
    <SetupProvider>
      <ConfigProvider>
        <AppProvider>
          {mode === 'development' ? (
            <div className="relative w-full h-screen overflow-hidden">
              <DemoSite />
              <AppContent mode="development" />
            </div>
          ) : (
            <AppContent mode="extension" />
          )}
        </AppProvider>
      </ConfigProvider>
    </SetupProvider>
  )
}

export default App
