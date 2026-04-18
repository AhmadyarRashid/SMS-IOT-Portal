import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register the service worker. The SW powers rich OS notifications
// (action buttons + click-to-focus) via reg.showNotification(). It bypasses
// /api/*, /auth/*, /websocket/*, and any Vite-managed paths so HMR is
// unaffected in development.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* ignore */ });
  });

  // When the SW dispatches an "open" message (e.g. after a notification click
  // in a browser without client.navigate support), route the active app there.
  navigator.serviceWorker.addEventListener?.('message', (event) => {
    const url = event.data?.url;
    if (event.data?.type === 'sms-iot-open' && url) {
      window.location.assign(url);
    }
  });
}
