// src/utils/serviceWorkerRegistration.js

/**
 * Service Worker Registration
 * Registers the service worker and handles updates
 */

export function register() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      const swUrl = '/service-worker.js';

      navigator.serviceWorker
        .register(swUrl)
        .then((registration) => {
          console.log('✅ Service Worker registered:', registration);

          // Check for updates periodically
          setInterval(() => {
            registration.update();
          }, 60000); // Check every minute

          // Handle updates
          registration.onupdatefound = () => {
            const installingWorker = registration.installing;
            
            if (installingWorker) {
              installingWorker.onstatechange = () => {
                if (installingWorker.state === 'installed') {
                  if (navigator.serviceWorker.controller) {
                    // New content available, notify user
                    console.log('🔄 New content available, please refresh');
                    
                    // You can show a notification to the user here
                    showUpdateNotification(registration);
                  } else {
                    // Content cached for offline use
                    console.log('✅ Content cached for offline use');
                  }
                }
              };
            }
          };
        })
        .catch((error) => {
          console.error('❌ Service Worker registration failed:', error);
        });

      // Listen for messages from service worker
      navigator.serviceWorker.addEventListener('message', (event) => {
        console.log('📨 Message from Service Worker:', event.data);
        
        if (event.data && event.data.type === 'BACKGROUND_SYNC') {
          // Trigger sync in the app
          const syncEvent = new CustomEvent('backgroundSync', {
            detail: event.data
          });
          window.dispatchEvent(syncEvent);
        }
      });
    });
  } else {
    console.warn('⚠️ Service Workers not supported in this browser');
  }
}

/**
 * Show update notification to user
 */
function showUpdateNotification(registration) {
  // Create a custom event that the app can listen to
  const updateEvent = new CustomEvent('serviceWorkerUpdate', {
    detail: { registration }
  });
  window.dispatchEvent(updateEvent);
}

/**
 * Unregister service worker
 * Useful for development or debugging
 */
export function unregister() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.unregister();
        console.log('✅ Service Worker unregistered');
      })
      .catch((error) => {
        console.error('❌ Service Worker unregistration failed:', error);
      });
  }
}

/**
 * Request background sync permission
 */
export async function requestBackgroundSync() {
  if ('serviceWorker' in navigator && 'sync' in registration) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.sync.register('sync-student-data');
      console.log('✅ Background sync registered');
      return true;
    } catch (error) {
      console.error('❌ Background sync registration failed:', error);
      return false;
    }
  }
  return false;
}

/**
 * Clear all caches
 * Useful for troubleshooting
 */
export async function clearAllCaches() {
  if ('caches' in window) {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames.map((cacheName) => caches.delete(cacheName))
    );
    console.log('✅ All caches cleared');
    return true;
  }
  return false;
}