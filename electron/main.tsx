/**
 * @fileoverview Desktop application entry point.
 * Renders the app in desktop mode (no demo site background, transparent window).
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from '../src/App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App mode="desktop" />
  </StrictMode>,
)
