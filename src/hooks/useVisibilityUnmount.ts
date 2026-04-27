/**
 * useVisibilityUnmount Hook
 * Automatically unmounts/remounts content when tab is hidden for extended period
 */

import { useState, useEffect, useRef } from 'react';
import Logger from '../services/LoggerService';

const UNMOUNT_DELAY_MS = 15000; // 15 seconds

export const useVisibilityUnmount = (enabled = true) => {
  const [shouldMount, setShouldMount] = useState(true);
  const unmountTimeoutRef = useRef(null);
  const hiddenTimeRef = useRef(null);
  
  useEffect(() => {
    if (!enabled) {
      return;
    }
    
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab just became hidden - start timer
        hiddenTimeRef.current = Date.now();
        Logger.log('useVisibilityUnmount', 'Tab hidden, starting 15s unmount timer...');
        
        unmountTimeoutRef.current = setTimeout(() => {
          Logger.log('useVisibilityUnmount', 'Tab hidden for 15s, unmounting to free resources...');
          setShouldMount(false);
        }, UNMOUNT_DELAY_MS);
      } else {
        // Tab became visible again
        const wasHiddenFor = hiddenTimeRef.current ? Date.now() - hiddenTimeRef.current : 0;
        Logger.log('useVisibilityUnmount', `Tab visible again (was hidden for ${Math.round(wasHiddenFor / 1000)}s)`);
        
        // Clear the unmount timer if it hasn't fired yet
        if (unmountTimeoutRef.current) {
          clearTimeout(unmountTimeoutRef.current);
          unmountTimeoutRef.current = null;
          Logger.log('useVisibilityUnmount', 'Cancelled unmount timer');
        }
        
        // If we unmounted while hidden, remount now
        if (!shouldMount) {
          Logger.log('useVisibilityUnmount', 'Remounting after being unmounted...');
          setShouldMount(true);
        }
        
        hiddenTimeRef.current = null;
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (unmountTimeoutRef.current) {
        clearTimeout(unmountTimeoutRef.current);
      }
    };
  }, [enabled, shouldMount]);
  
  return shouldMount;
};
