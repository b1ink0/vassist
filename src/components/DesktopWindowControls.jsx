/**
 * @fileoverview Desktop window controls component for Electron app.
 * Provides minimize, maximize, and close buttons for frameless window.
 */

import { MinusIcon, XMarkIcon, Square2StackIcon } from '@heroicons/react/24/outline';
import { useEffect, useState } from 'react';

/**
 * Window controls for Electron desktop app
 * Only rendered when __DESKTOP_MODE__ is true
 */
export default function DesktopWindowControls() {
  const [electronAvailable, setElectronAvailable] = useState(false);

  useEffect(() => {
    // Check if electron API is available
    if (window.electron) {
      console.log('Electron API is available:', window.electron);
      setElectronAvailable(true);
    } else {
      console.warn('Electron API not available');
    }
  }, []);

  // Only render in desktop mode
  if (!__DESKTOP_MODE__) {
    return null;
  }

  const handleMinimize = () => {
    console.log('Minimize clicked, electron available:', !!window.electron);
    if (window.electron?.window?.minimize) {
      console.log('Calling minimize...');
      window.electron.window.minimize();
    } else {
      console.error('Minimize function not available');
    }
  };

  const handleMaximize = () => {
    console.log('Maximize clicked, electron available:', !!window.electron);
    if (window.electron?.window?.maximize) {
      console.log('Calling maximize...');
      window.electron.window.maximize();
    } else {
      console.error('Maximize function not available');
    }
  };

  const handleClose = () => {
    console.log('Close clicked, electron available:', !!window.electron);
    if (window.electron?.window?.close) {
      console.log('Calling close...');
      window.electron.window.close();
    } else {
      console.error('Close function not available');
    }
  };

  return (
    <div 
      className="fixed top-2 left-1/2 -translate-x-1/2 z-[99999] flex items-center gap-1 px-2 py-1 bg-black/20 backdrop-blur-sm rounded-full"
    >
      {!electronAvailable && (
        <span className="text-xs text-red-500 mr-2">Electron API not loaded</span>
      )}
      <button
        onClick={handleMinimize}
        className="p-1 rounded-full hover:bg-white/10 transition-colors"
        title="Minimize"
      >
        <MinusIcon className="w-3 h-3 text-white/70" />
      </button>
      <button
        onClick={handleMaximize}
        className="p-1 rounded-full hover:bg-white/10 transition-colors"
        title="Maximize/Restore"
      >
        <Square2StackIcon className="w-3 h-3 text-white/70" />
      </button>
      <button
        onClick={handleClose}
        className="p-1 rounded-full hover:bg-red-500/30 transition-colors"
        title="Close"
      >
        <XMarkIcon className="w-3 h-3 text-white/70" />
      </button>
    </div>
  );
}
