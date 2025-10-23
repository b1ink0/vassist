import AppContent from './components/AppContent'
import { ConfigProvider } from './contexts/ConfigContext'
import { AppProvider } from './contexts/AppContext'

function App({ mode = 'development' }) {
  return (
    <ConfigProvider>
      <AppProvider>
        {mode === 'development' ? (
          <div className="relative w-full h-screen overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-600 flex flex-col items-center justify-center p-5 z-0">
              <h1 className="text-white text-5xl mb-4 text-center">
                Virtual Assistant
              </h1>
              <p className="text-white/90 text-xl max-w-2xl text-center">
                Orthographic 3D model rendered on transparent background
              </p>
            </div>

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
