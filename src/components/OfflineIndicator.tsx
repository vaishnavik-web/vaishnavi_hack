import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      className="bg-amber-600 text-white px-4 py-2 text-xs font-medium flex items-center justify-center gap-2 sticky top-0 z-50 shadow-sm"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>
        Offline mode active — cached screens and emergency numbers (108 / 112 / 101) remain
        accessible; live Google Maps &amp; hospital searches require connectivity.
      </span>
    </div>
  );
}
