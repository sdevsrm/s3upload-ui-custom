import React, { useState, useEffect } from 'react';

/**
 * Monitors navigator.onLine and shows a banner when offline.
 * Pure HTML/CSS — no UI library dependency.
 */
const NetworkStatus = ({ onOnline, onOffline }) => {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => { setOnline(true); onOnline?.(); };
    const handleOffline = () => { setOnline(false); onOffline?.(); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [onOnline, onOffline]);

  if (online) return null;

  return (
    <div style={{
      background: '#d13212', color: 'white', padding: '12px 24px',
      fontWeight: 600, textAlign: 'center'
    }}>
      ⚠️ You are offline — uploads are paused and will resume when your connection is restored.
    </div>
  );
};

export default NetworkStatus;
