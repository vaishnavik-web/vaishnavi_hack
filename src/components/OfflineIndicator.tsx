import React, { useEffect, useState } from 'react';
import { HardDrive, WifiOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { getOfflineStorageStats, OfflineStorageStats } from '../utils/offlineMapStore';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  const [stats, setStats] = useState<OfflineStorageStats | null>(null);

  useEffect(() => {
    if (isOnline) return;
    let active = true;
    const sync = () => {
      getOfflineStorageStats()
        .then((s) => {
          if (active) setStats(s);
        })
        .catch(() => {});
    };
    sync();
    window.addEventListener('traffix-offline-updated', sync);
    return () => {
      active = false;
      window.removeEventListener('traffix-offline-updated', sync);
    };
  }, [isOnline]);

  if (isOnline) return null;

  const hasOffline = Boolean(stats && (stats.regionCount > 0 || stats.cachedRouteCount > 0));

  return (
    <div
      role="status"
      className="bg-amber-600 text-white px-4 py-2 text-xs font-medium flex flex-wrap items-center justify-center gap-x-3 gap-y-1 sticky top-0 z-50 shadow-sm"
    >
      <div className="flex items-center gap-2">
        <WifiOff className="w-3.5 h-3.5 shrink-0" />
        <span>
          {hasOffline
            ? `Offline mode active — ${stats!.regionCount} downloaded map region(s) and ${stats!.cachedRouteCount} cached route(s) available in IndexedDB. Emergency SOS (108 / 112 / 101) remains accessible.`
            : 'Offline mode active — emergency numbers (108 / 112 / 101) and cached screens remain accessible. Download an offline map region while online for offline routing.'}
        </span>
      </div>
      <Link
        to="/navigate"
        className="inline-flex items-center gap-1 rounded bg-white/20 hover:bg-white/30 px-2 py-0.5 text-[11px] font-semibold transition-colors"
      >
        <HardDrive className="w-3 h-3" />
        <span>Open Offline Navigation</span>
      </Link>
    </div>
  );
}
