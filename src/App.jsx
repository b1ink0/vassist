import AppContent from './components/AppContent'
import DemoSite from './components/DemoSite'
import { ConfigProvider } from './contexts/ConfigContext'
import { AppProvider } from './contexts/AppContext'

function App({ mode = 'development' }) {
  return (
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
  )
}

export default App
