import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// ── Service Worker Registration (PWA + Offline support) ──────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then((reg) => {
        console.log('✅ Service Worker registered:', reg.scope);

        // בדוק עדכון כל 60 שניות
        setInterval(() => reg.update(), 60000);

        // עדכון אוטומטי כשמגיע גרסה חדשה
        reg.onupdatefound = () => {
          const newWorker = reg.installing;
          newWorker.onstatechange = () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('🔄 New version available — reloading...');
              window.location.reload();
            }
          };
        };
      })
      .catch((err) => console.warn('Service Worker registration failed:', err));
  });
}
