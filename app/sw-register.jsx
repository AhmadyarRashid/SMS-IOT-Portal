'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });

    const onMessage = (event) => {
      const url = event.data?.url;
      if (event.data?.type === 'sms-iot-open' && url) {
        window.location.assign(url);
      }
    };
    navigator.serviceWorker.addEventListener?.('message', onMessage);

    return () => {
      navigator.serviceWorker.removeEventListener?.('message', onMessage);
    };
  }, []);

  return null;
}
