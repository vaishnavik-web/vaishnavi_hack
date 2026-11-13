import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  HardDrive,
  MapPin,
  RefreshCw,
  Route,
  Trash2,
  WifiOff,
  X,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { offlineApi } from '../services/api';
import { OfflineRegionPresetDTO } from '../shared/types';
import {
  clearRouteCache,
  deleteStoredRegion,
  downloadAndStoreRegion,
  getOfflineStorageStats,
  listCachedRoutes,
  listStoredRegions,
  OfflineStorageStats,
  StoredCachedRoute,
  StoredOfflineRegion,
} from '../utils/offlineMapStore';
import { boundsAroundCenter } from '../utils/offlineTileMath';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

interface OfflineMapsManagerProps {
  currentCenter?: { lat: number; lng: number } | null;
  offlineMapPreview?: boolean;
  onToggleOfflineMapPreview?: (next: boolean) => void;
  onSelectCachedRoute?: (cached: StoredCachedRoute) => void;
  compact?: boolean;
}

export const OfflineMapsManager: React.FC<OfflineMapsManagerProps> = ({
  currentCenter,
  offlineMapPreview,
  onToggleOfflineMapPreview,
  onSelectCachedRoute,
  compact = false,
}) => {
  const isOnline = useOnlineStatus();
  const { pushToast } = useToast();

  const [presets, setPresets] = useState<OfflineRegionPresetDTO[]>([]);
  const [storedRegions, setStoredRegions] = useState<StoredOfflineRegion[]>([]);
  const [cachedRoutes, setCachedRoutes] = useState<StoredCachedRoute[]>([]);
  const [stats, setStats] = useState<OfflineStorageStats>({
    regionCount: 0,
    tileCount: 0,
    totalTileBytes: 0,
    cachedRouteCount: 0,
    browserUsageBytes: null,
    browserQuotaBytes: null,
  });
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    completed: number;
    total: number;
    bytes: number;
    stage: string;
  } | null>(null);
  const [customAreaName, setCustomAreaName] = useState('Current Map Area (5 km)');
  const [customRadiusKm, setCustomRadiusKm] = useState<number>(4);

  const refreshState = useCallback(async () => {
    setLoading(true);
    try {
      const [regionsList, routesList, s] = await Promise.all([
        listStoredRegions(),
        listCachedRoutes(),
        getOfflineStorageStats(),
      ]);
      setStoredRegions(regionsList);
      setCachedRoutes(routesList);
      setStats(s);

      if (navigator.onLine) {
        try {
          const remotePresets = await offlineApi.listRegions();
          setPresets(remotePresets);
        } catch {
          // If offline/unreachable, fall back to already-stored region metadata
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshState();
    const onChanged = () => {
      listStoredRegions().then(setStoredRegions);
      listCachedRoutes().then(setCachedRoutes);
      getOfflineStorageStats().then(setStats);
    };
    window.addEventListener('traffix-offline-updated', onChanged);
    return () => window.removeEventListener('traffix-offline-updated', onChanged);
  }, [refreshState]);

  const handleDownloadPreset = async (presetId: string, label: string) => {
    if (!isOnline) {
      pushToast({
        variant: 'error',
        title: 'Internet Required',
        message: 'Connect to the internet to download a new offline region pack.',
      });
      return;
    }
    setDownloadingId(presetId);
    setProgress({ completed: 0, total: 1, bytes: 0, stage: `Fetching ${label} bundle...` });
    try {
      const bundle = await offlineApi.getRegionBundle(presetId);
      const saved = await downloadAndStoreRegion(bundle, (p) => setProgress(p));
      pushToast({
        variant: 'success',
        title: 'Offline Region Saved',
        message: `${saved.region.name}: ${saved.tileCount} map tiles (${formatBytes(
          saved.tileBytes
        )}) & ${bundle.precomputedRoutes.length} routes stored in IndexedDB.`,
      });
      await refreshState();
    } catch (err: any) {
      pushToast({
        variant: 'error',
        title: 'Download Failed',
        message: err?.message || 'Unable to download offline map region.',
      });
    } finally {
      setDownloadingId(null);
      setProgress(null);
    }
  };

  const handleDownloadCustomArea = async () => {
    if (!isOnline) {
      pushToast({
        variant: 'error',
        title: 'Internet Required',
        message: 'Connect to the internet to download a custom map area.',
      });
      return;
    }
    const anchor = currentCenter || { lat: 15.853, lng: 74.502 };
    const bounds = boundsAroundCenter(anchor.lat, anchor.lng, customRadiusKm);
    setDownloadingId('custom-area');
    setProgress({
      completed: 0,
      total: 1,
      bytes: 0,
      stage: `Preparing ${customAreaName} bundle...`,
    });
    try {
      const bundle = await offlineApi.getCustomBundle({
        name: customAreaName.trim() || 'Custom Offline Area',
        north: bounds.north,
        south: bounds.south,
        east: bounds.east,
        west: bounds.west,
        minZoom: 12,
        maxZoom: 14,
      });
      const saved = await downloadAndStoreRegion(bundle, (p) => setProgress(p));
      pushToast({
        variant: 'success',
        title: 'Custom Area Downloaded',
        message: `Stored ${saved.tileCount} tiles (${formatBytes(
          saved.tileBytes
        )}) in IndexedDB for offline use.`,
      });
      await refreshState();
    } catch (err: any) {
      pushToast({
        variant: 'error',
        title: 'Custom Download Failed',
        message: err?.message || 'Unable to download custom area.',
      });
    } finally {
      setDownloadingId(null);
      setProgress(null);
    }
  };

  const handleDeleteRegion = async (regionId: string, name: string) => {
    await deleteStoredRegion(regionId);
    pushToast({
      variant: 'info',
      title: 'Offline Region Removed',
      message: `Deleted ${name} and freed unshared IndexedDB tiles.`,
    });
    await refreshState();
  };

  const storedMap = new Map(storedRegions.map((r) => [r.id, r]));

  return (
    <div className="space-y-4">
      {/* Storage Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090E1A] p-3">
          <p className="text-[11px] text-slate-500">Regions Saved</p>
          <p className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-0.5">
            {stats.regionCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090E1A] p-3">
          <p className="text-[11px] text-slate-500">IndexedDB Tiles</p>
          <p className="text-lg font-bold font-mono text-blue-600 dark:text-blue-400 mt-0.5">
            {stats.tileCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090E1A] p-3">
          <p className="text-[11px] text-slate-500">Cached Routes</p>
          <p className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
            {stats.cachedRouteCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090E1A] p-3">
          <p className="text-[11px] text-slate-500">Tile Cache Size</p>
          <p className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-0.5">
            {formatBytes(stats.totalTileBytes)}
          </p>
        </div>
      </div>

      {/* Optional Offline Map Preview Switch */}
      {onToggleOfflineMapPreview && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-200 dark:border-blue-500/30 bg-blue-50/70 dark:bg-blue-950/20 px-3.5 py-2.5 text-xs">
          <div className="flex items-center gap-2 text-blue-900 dark:text-blue-100">
            <HardDrive className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span>
              {offlineMapPreview
                ? 'Showing IndexedDB Offline Tile Map right now.'
                : 'Preview your downloaded IndexedDB map tiles without disconnecting Wi-Fi.'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onToggleOfflineMapPreview(!offlineMapPreview)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              offlineMapPreview
                ? 'bg-blue-600 text-white hover:bg-blue-500'
                : 'border border-blue-300 dark:border-blue-500/40 bg-white dark:bg-[#090E1A] text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950/50'
            }`}
          >
            {offlineMapPreview ? 'Switch to Live Google Map' : 'Preview Offline Map'}
          </button>
        </div>
      )}

      {/* Active Download Progress */}
      {progress && (
        <div className="rounded-xl border border-blue-300 dark:border-blue-500/40 bg-blue-50 dark:bg-blue-950/30 p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-blue-900 dark:text-blue-100">
            <span>{progress.stage}</span>
            <span className="font-mono">
              {progress.completed}/{progress.total} · {formatBytes(progress.bytes)}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-blue-200 dark:bg-blue-900 overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all duration-150"
              style={{
                width: `${Math.min(100, Math.round((progress.completed / Math.max(1, progress.total)) * 100))}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Custom Area Around Current Map / GPS */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-blue-500" />
            <span>Download Area Around Current Location</span>
          </h4>
          <span className="font-mono text-[10px] text-slate-500">
            {(currentCenter?.lat ?? 15.853).toFixed(4)}, {(currentCenter?.lng ?? 74.502).toFixed(4)}
          </span>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={customAreaName}
            onChange={(e) => setCustomAreaName(e.target.value)}
            placeholder="Region label..."
            className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 text-xs text-slate-900 dark:text-white"
          />
          <select
            value={customRadiusKm}
            onChange={(e) => setCustomRadiusKm(Number(e.target.value))}
            aria-label="Offline area radius"
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-2.5 py-2 text-xs text-slate-900 dark:text-white"
          >
            <option value={2}>2 km radius</option>
            <option value={4}>4 km radius</option>
            <option value={7}>7 km radius</option>
          </select>
          <button
            type="button"
            disabled={Boolean(downloadingId) || !isOnline}
            onClick={handleDownloadCustomArea}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-3.5 py-2 text-xs font-semibold text-white whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Area</span>
          </button>
        </div>
      </div>

      {/* Curated Downloadable Regions */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-slate-900 dark:text-white">
            Available &amp; Downloaded Regions
          </h4>
          {!isOnline && (
            <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-300">
              <WifiOff className="w-3 h-3" /> Offline — showing saved regions
            </span>
          )}
        </div>

        {loading && presets.length === 0 && storedRegions.length === 0 ? (
          <p className="text-xs text-slate-500 py-3">Loading offline regions...</p>
        ) : (
          <div className="space-y-2">
            {(presets.length > 0 ? presets : storedRegions.map((s) => s.region)).map((preset) => {
              const saved = storedMap.get(preset.id);
              const isDownloading = downloadingId === preset.id;
              return (
                <div
                  key={preset.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">
                        {preset.name}
                      </span>
                      {saved && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-semibold">
                          <CheckCircle2 className="w-3 h-3" />
                          Downloaded
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {preset.subtitle}
                    </p>
                    <p className="text-[11px] font-mono text-slate-500">
                      {saved
                        ? `${saved.tileCount} tiles · ${formatBytes(saved.tileBytes)} · ${saved.nodes.length} junctions · Expires ${new Date(
                            saved.expiresAt
                          ).toLocaleDateString()}`
                        : `Zoom ${preset.minZoom}–${preset.maxZoom} · ~${preset.estimatedTiles} tiles (~${preset.estimatedSizeKb} KB)`}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {saved ? (
                      <>
                        <button
                          type="button"
                          disabled={Boolean(downloadingId) || !isOnline}
                          onClick={() => handleDownloadPreset(preset.id, preset.name)}
                          title="Refresh offline pack"
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isDownloading ? 'animate-spin' : ''}`} />
                          <span>Update</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRegion(preset.id, preset.name)}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-300 dark:border-red-500/30 px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={Boolean(downloadingId) || !isOnline}
                        onClick={() => handleDownloadPreset(preset.id, preset.name)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{isDownloading ? 'Downloading...' : 'Download'}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Also show any custom downloaded regions not in preset list */}
            {storedRegions
              .filter((r) => !presets.some((p) => p.id === r.id))
              .map((saved) => (
                <div
                  key={saved.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">
                        {saved.region.name}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-semibold">
                        <CheckCircle2 className="w-3 h-3" />
                        Custom Saved
                      </span>
                    </div>
                    <p className="text-[11px] font-mono text-slate-500">
                      {saved.tileCount} tiles · {formatBytes(saved.tileBytes)} · Downloaded{' '}
                      {new Date(saved.downloadedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteRegion(saved.id, saved.region.name)}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-300 dark:border-red-500/30 px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 self-start sm:self-center"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Cached Routes in IndexedDB */}
      {!compact && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Route className="w-3.5 h-3.5 text-emerald-500" />
              <span>Cached Routes in IndexedDB ({cachedRoutes.length})</span>
            </h4>
            {cachedRoutes.length > 0 && (
              <button
                type="button"
                onClick={async () => {
                  await clearRouteCache();
                  pushToast({
                    variant: 'info',
                    title: 'Route Cache Cleared',
                    message: 'Cleared cached routes from browser IndexedDB.',
                  });
                }}
                className="text-[11px] text-red-600 dark:text-red-400 hover:underline"
              >
                Clear route cache
              </button>
            )}
          </div>

          {cachedRoutes.length === 0 ? (
            <p className="text-xs text-slate-500 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-3">
              Routes you view online and pre-cached region routes are automatically stored here for up to 30 days.
            </p>
          ) : (
            <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
              {cachedRoutes.slice(0, 12).map((rt) => {
                const primary = rt.result.alternatives[0];
                return (
                  <div
                    key={rt.cacheKey}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 dark:text-white truncate">
                        {rt.originLabel.split('(')[0].trim()} →{' '}
                        {rt.destinationLabel.split('(')[0].trim()}
                      </p>
                      <p className="text-[11px] font-mono text-slate-500">
                        {rt.travelMode} · {primary ? `${Math.round(primary.estimatedTimeMin)} min (${primary.totalDistanceKm} km)` : 'Saved'} ·{' '}
                        {rt.source === 'REGION_PREFETCH' ? 'Region pack' : 'Auto-cached'}
                      </p>
                    </div>
                    {onSelectCachedRoute && (
                      <button
                        type="button"
                        onClick={() => onSelectCachedRoute(rt)}
                        className="rounded-md bg-blue-600 hover:bg-blue-500 px-2.5 py-1 text-[11px] font-semibold text-white shrink-0"
                      >
                        Load
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        Offline map tiles and corridor networks are stored locally in browser IndexedDB (auto-expiring after 30 days). Live traffic, real-time Google Places search, and voice recognition require internet connectivity.
      </p>
    </div>
  );
};

export const OfflineMapsModal: React.FC<{
  open: boolean;
  onClose: () => void;
  currentCenter?: { lat: number; lng: number } | null;
  offlineMapPreview?: boolean;
  onToggleOfflineMapPreview?: (next: boolean) => void;
  onSelectCachedRoute?: (cached: StoredCachedRoute) => void;
}> = ({
  open,
  onClose,
  currentCenter,
  offlineMapPreview,
  onToggleOfflineMapPreview,
  onSelectCachedRoute,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Offline Maps and Route Cache Manager"
    >
      <div className="w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0D1424]/95 backdrop-blur-sm px-5 py-3.5">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Offline Maps &amp; Route Cache (IndexedDB)
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close offline maps manager"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">
          <OfflineMapsManager
            currentCenter={currentCenter}
            offlineMapPreview={offlineMapPreview}
            onToggleOfflineMapPreview={onToggleOfflineMapPreview}
            onSelectCachedRoute={(rt) => {
              onSelectCachedRoute?.(rt);
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
};
