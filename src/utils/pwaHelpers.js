// src/utils/pwaHelpers.js

export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/service-worker.js')
        .then(registration => {
          console.log('SW registered: ', registration);
          
          // Check for updates periodically
          setInterval(() => {
            registration.update();
          }, 60000); // Check every minute

          // Listen for updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New service worker available
                if (confirm('New version available! Reload to update?')) {
                  newWorker.postMessage({ type: 'SKIP_WAITING' });
                  window.location.reload();
                }
              }
            });
          });
        })
        .catch(error => {
          console.log('SW registration failed: ', error);
        });
    });

    // Handle controller change (new SW activated)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  }
}

// Cache AI response for offline access
export function cacheAIResponse(key, data) {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'CACHE_AI_RESPONSE',
      key,
      data
    });
  }
  
  // Also save to localStorage as backup
  try {
    const cached = JSON.parse(localStorage.getItem('edubridge_offline_cache') || '{}');
    cached[key] = {
      data,
      timestamp: Date.now()
    };
    localStorage.setItem('edubridge_offline_cache', JSON.stringify(cached));
  } catch (e) {
    console.error('Failed to cache to localStorage:', e);
  }
}

// Retrieve cached AI responses
export function getCachedAIResponses() {
  try {
    const cached = JSON.parse(localStorage.getItem('edubridge_offline_cache') || '{}');
    return Object.entries(cached).map(([key, value]) => ({
      key,
      ...value
    }));
  } catch (e) {
    console.error('Failed to retrieve cached data:', e);
    return [];
  }
}

// Clear old cached responses (older than 7 days)
export function clearOldCache() {
  try {
    const cached = JSON.parse(localStorage.getItem('edubridge_offline_cache') || '{}');
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    Object.keys(cached).forEach(key => {
      if (cached[key].timestamp < sevenDaysAgo) {
        delete cached[key];
      }
    });
    
    localStorage.setItem('edubridge_offline_cache', JSON.stringify(cached));
  } catch (e) {
    console.error('Failed to clear old cache:', e);
  }
}

// Check if app is installable
export function setupInstallPrompt(callback) {
  let deferredPrompt;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    callback(true, deferredPrompt);
  });

  window.addEventListener('appinstalled', () => {
    console.log('PWA installed');
    deferredPrompt = null;
  });

  return deferredPrompt;
}