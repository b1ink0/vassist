import AppContent from './components/AppContent'
import { ConfigProvider } from './contexts/ConfigContext'

function App() {
  return (
    <ConfigProvider>
      <div className="relative w-full h-screen overflow-hidden">
        {/* Background HTML content */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-600 flex flex-col items-center justify-center p-5 z-0">
          <h1 className="text-white text-5xl mb-4 text-center">
            Virtual Assistant
          </h1>
          <p className="text-white/90 text-xl max-w-2xl text-center">
            Orthographic 3D model rendered on transparent background
          </p>
        </div>

        {/* App Content - shared with extension mode */}
        <AppContent mode="development" />
      </div>
    </ConfigProvider>
  )
}

export default App
