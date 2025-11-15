import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Render the app first
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// ✅ Service Worker Registration with Auto-Update Detection
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then((registration) => {
        console.log('✅ Service Worker registered:', registration);
        
        // ✅ Check for updates every 30 minutes
        setInterval(() => {
          console.log('🔄 Checking for Service Worker updates...');
          registration.update();
        }, 30 * 60 * 1000);
        
        // ✅ Listen for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          console.log('🆕 New Service Worker found!');
          
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // ✅ New version available!
              console.log('🎉 New version available!');
              
              // Option 1: Auto-reload (recommended for bug fixes)
              console.log('🔄 Auto-reloading to apply updates...');
              window.location.reload();
              
              // Option 2: Show notification (commented out)
              // if (confirm('🆕 New version available! Reload now?')) {
              //   newWorker.postMessage({ type: 'SKIP_WAITING' });
              //   window.location.reload();
              // }
            }
          });
        });
        
        // ✅ Listen for controller change (new SW took over)
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          console.log('🔄 Service Worker controller changed, reloading...');
          window.location.reload();
        });
        
        // ✅ Listen for messages from Service Worker
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data && event.data.type === 'SW_ACTIVATED') {
            console.log('✅ Service Worker activated, version:', event.data.version);
          }
        });
        
        // ✅ Force check for updates on page focus
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden) {
            console.log('🔄 Page visible, checking for updates...');
            registration.update();
          }
        });
      })
      .catch((error) => {
        console.error('❌ Service Worker registration failed:', error);
      });
  });
  
  // ✅ Utility function to manually clear cache (for debugging)
  window.clearServiceWorkerCache = async () => {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.unregister();
        console.log('✅ Service Worker unregistered');
      }
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
      console.log('✅ All caches cleared');
      window.location.reload();
    }
  };
  console.log('💡 Tip: Run clearServiceWorkerCache() in console to force clear cache');
}














// import { StrictMode } from 'react'
// import { createRoot } from 'react-dom/client'
// import './index.css'
// import App from './App.jsx'

// createRoot(document.getElementById('root')).render(
//   <StrictMode>
//     <App />
//   </StrictMode>,
// )
