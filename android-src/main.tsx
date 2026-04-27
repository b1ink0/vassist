/**
 * @fileoverview Android entry point for VAssist live wallpaper.
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../src/index.css'
import App from '../src/App.jsx'

const urlParams = new URLSearchParams(window.location.search);
const isWallpaperMode = urlParams.get('mode') === 'wallpaper';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App mode="android" isWallpaperMode={isWallpaperMode} />
  </StrictMode>
)
