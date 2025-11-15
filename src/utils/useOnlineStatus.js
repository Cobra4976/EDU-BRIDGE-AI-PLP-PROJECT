// src/utils/useOnlineStatus.js

import { useState, useEffect } from 'react';

/**
 * Custom hook to detect online/offline status
 * Returns current online status and provides event listeners
 */
export const useOnlineStatus = () => {
  // Initialize with current browser online status
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    // Handler for when connection is established
    const handleOnline = () => {
      console.log('🌐 Connection restored - Now ONLINE');
      setIsOnline(true);
    };

    // Handler for when connection is lost
    const handleOffline = () => {
      console.log('📴 Connection lost - Now OFFLINE');
      setIsOnline(false);
    };

    // Add event listeners
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Log initial status
    console.log(`Initial connection status: ${navigator.onLine ? 'ONLINE' : 'OFFLINE'}`);

    // Cleanup: remove event listeners on unmount
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
};

/**
 * Advanced hook with connection quality check
 * Attempts to ping a reliable endpoint to verify actual connectivity
 */
export const useOnlineStatusWithCheck = (checkInterval = 30000) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isChecking, setIsChecking] = useState(false);

  // Function to verify actual internet connectivity
  const checkConnectivity = async () => {
    if (!navigator.onLine) {
      setIsOnline(false);
      return false;
    }

    setIsChecking(true);
    
    try {
      // Try to fetch a small resource from a reliable CDN
      // Using a timestamp to avoid cache
      const response = await fetch('https://www.google.com/favicon.ico?t=' + Date.now(), {
        method: 'HEAD',
        cache: 'no-cache',
        mode: 'no-cors'
      });
      
      setIsOnline(true);
      setIsChecking(false);
      return true;
    } catch (error) {
      console.warn('Connectivity check failed:', error);
      setIsOnline(false);
      setIsChecking(false);
      return false;
    }
  };

  useEffect(() => {
    const handleOnline = () => {
      console.log('🌐 Browser reports ONLINE');
      checkConnectivity();
    };

    const handleOffline = () => {
      console.log('📴 Browser reports OFFLINE');
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodic connectivity check
    const intervalId = setInterval(checkConnectivity, checkInterval);

    // Initial check
    checkConnectivity();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(intervalId);
    };
  }, [checkInterval]);

  return { isOnline, isChecking, checkConnectivity };
};

/**
 * Hook that provides online status with last sync time
 * Useful for showing when data was last synchronized
 */
export const useOnlineStatusWithSync = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastOnlineTime, setLastOnlineTime] = useState(new Date());
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      console.log('🌐 Back online at:', new Date().toLocaleTimeString());
      setIsOnline(true);
      setLastOnlineTime(new Date());
      
      // Flag that we just came back online (useful for triggering sync)
      if (!isOnline) {
        setWasOffline(true);
        // Reset flag after a short delay
        setTimeout(() => setWasOffline(false), 1000);
      }
    };

    const handleOffline = () => {
      console.log('📴 Went offline at:', new Date().toLocaleTimeString());
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [isOnline]);

  return { 
    isOnline, 
    lastOnlineTime, 
    wasOffline // True briefly after coming back online
  };
};