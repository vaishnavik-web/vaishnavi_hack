import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Compass, Download, HardDrive, LocateFixed, Minus, Plus, WifiOff } from 'lucide-react';
import {
  BusStopDTO,
  IncidentDTO,
  ParkingLocationDTO,
  RoadNodeDTO,
  RoadSegmentDTO,
} from '../shared/types';
import {
  getStoredTileBlob,
  listStoredRegions,
  StoredOfflineRegion,
} from '../utils/offlineMapStore';
import { latLngToWorldPixel, worldPixelToLatLng } from '../utils/offlineTileMath';
import type { MapEndpointMarker, OverlayRoute } from './TrafficMap';

interface OfflineTileMapProps {
  center?: { lat: number; lng: number };
  routes?: OverlayRoute[];
  startPoint?: MapEndpointMarker | null;
  endPoint?: MapEndpointMarker | null;
  userLocation?: { lat: number; lng: number; heading?: number | null } | null;
  nodes?: RoadNodeDTO[];
  segments?: RoadSegmentDTO[];
  incidents?: IncidentDTO[];
  parkingLocations?: ParkingLocationDTO[];
  busStops?: BusStopDTO[];
  pickMode?: 'origin' | 'destination' | null;
  heightClass?: string;
  fitBoundsKey?: string | number;
  onMapClick?: (lat: number, lng: number) => void;
  onMyLocationClick?: () => void;
  onOpenOfflineManager?: () => void;
  onRouteSelect?: (routeId: string) => void;
  isOfflineNetwork?: boolean;
}

export const OfflineTileMap: React.FC<OfflineTileMapProps> = ({
  center: initialCenter,
  routes = [],
  startPoint,
  endPoint,
  userLocation,
  nodes = [],
  segments = [],
  incidents = [],
  parkingLocations = [],
  busStops = [],
  pickMode,
  heightClass = 'h-[480px]',
  fitBoundsKey,
  onMapClick,
  onMyLocationClick,
  onOpenOfflineManager,
  onRouteSelect,
  isOfflineNetwork = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 800, height: 480 });
  const [storedRegions, setStoredRegions] = useState<StoredOfflineRegion[]>([]);
  const [zoom, setZoom] = useState(13);
  const [viewCenter, setViewCenter] = useState<{ lat: number; lng: number }>(() => {
    if (startPoint) return { lat: startPoint.lat, lng: startPoint.lng };
    if (initialCenter) return initialCenter;
    return { lat: 15.853, lng: 74.502 };
  });

  // Object URL cache for tile blobs loaded from IndexedDB
  const tileUrlCacheRef = useRef<Map<string, string>>(new Map());
  const [tileTick, setTileTick] = useState(0);
  const loadingKeysRef = useRef<Set<string>>(new Set());

  const dragRef = useRef<{
    active: boolean;
    moved: boolean;
    startX: number;
    startY: number;
    startCenterPx: { px: number; py: number };
  } | null>(null);

  const loadRegionsFromIdb = useCallback(async () => {
    const regs = await listStoredRegions();
    setStoredRegions(regs);
  }, []);

  useEffect(() => {
    loadRegionsFromIdb();
    const onUpdated = () => {
      // Clear cached tile URLs so refreshed tiles re-render
      tileUrlCacheRef.current.forEach((url) => {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
      });
      tileUrlCacheRef.current.clear();
      loadingKeysRef.current.clear();
      loadRegionsFromIdb();
      setTileTick((t) => t + 1);
    };
    window.addEventListener('traffix-offline-updated', onUpdated);
    return () => {
      window.removeEventListener('traffix-offline-updated', onUpdated);
    };
  }, [loadRegionsFromIdb]);

  useEffect(() => {
    return () => {
      tileUrlCacheRef.current.forEach((url) => {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
      });
      tileUrlCacheRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      setSize({
        width: Math.max(240, el.clientWidth || 800),
        height: Math.max(240, el.clientHeight || 480),
      });
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Re-center when routes or fitBoundsKey changes
  useEffect(() => {
    const pts: Array<[number, number]> = [];
    for (const r of routes) {
      for (const p of r.geometry) pts.push(p);
    }
    if (startPoint) pts.push([startPoint.lat, startPoint.lng]);
    if (endPoint) pts.push([endPoint.lat, endPoint.lng]);
    if (pts.length >= 2) {
      const lats = pts.map((p) => p[0]);
      const lngs = pts.map((p) => p[1]);
      const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
      const midLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
      setViewCenter({ lat: midLat, lng: midLng });
      const span = Math.max(
        Math.max(...lats) - Math.min(...lats),
        Math.max(...lngs) - Math.min(...lngs)
      );
      if (span < 0.012) setZoom(15);
      else if (span < 0.03) setZoom(14);
      else setZoom(13);
    }
  }, [fitBoundsKey]);

  const centerWorldPx = useMemo(
    () => latLngToWorldPixel(viewCenter.lat, viewCenter.lng, zoom, 256),
    [viewCenter.lat, viewCenter.lng, zoom]
  );

  const visibleTiles = useMemo(() => {
    const minPxX = centerWorldPx.px - size.width / 2;
    const maxPxX = centerWorldPx.px + size.width / 2;
    const minPxY = centerWorldPx.py - size.height / 2;
    const maxPxY = centerWorldPx.py + size.height / 2;
    const maxIdx = Math.pow(2, zoom) - 1;

    const startTx = Math.max(0, Math.floor(minPxX / 256));
    const endTx = Math.min(maxIdx, Math.floor(maxPxX / 256));
    const startTy = Math.max(0, Math.floor(minPxY / 256));
    const endTy = Math.min(maxIdx, Math.floor(maxPxY / 256));

    const list: Array<{ z: number; x: number; y: number; key: string; left: number; top: number }> =
      [];
    for (let tx = startTx; tx <= endTx; tx++) {
      for (let ty = startTy; ty <= endTy; ty++) {
        list.push({
          z: zoom,
          x: tx,
          y: ty,
          key: `${zoom}/${tx}/${ty}`,
          left: tx * 256 - minPxX,
          top: ty * 256 - minPxY,
        });
      }
    }
    return list;
  }, [centerWorldPx, size.width, size.height, zoom]);

  // Load missing visible tile blobs from IndexedDB (with fallback to parent zoom tile if available)
  useEffect(() => {
    let cancelled = false;
    const fetchVisibleTiles = async () => {
      let updated = false;
      for (const t of visibleTiles) {
        if (tileUrlCacheRef.current.has(t.key) || loadingKeysRef.current.has(t.key)) continue;
        loadingKeysRef.current.add(t.key);
        const blob = await getStoredTileBlob(t.z, t.x, t.y);
        if (cancelled) return;
        if (blob && blob.size > 0) {
          tileUrlCacheRef.current.set(t.key, URL.createObjectURL(blob));
          updated = true;
        } else {
          tileUrlCacheRef.current.set(t.key, '');
        }
        loadingKeysRef.current.delete(t.key);
      }
      if (updated && !cancelled) {
        setTileTick((n) => n + 1);
      }
    };
    fetchVisibleTiles();
    return () => {
      cancelled = true;
    };
  }, [visibleTiles]);

  const toScreen = useCallback(
    (lat: number, lng: number) => {
      const p = latLngToWorldPixel(lat, lng, zoom, 256);
      return {
        x: size.width / 2 + (p.px - centerWorldPx.px),
        y: size.height / 2 + (p.py - centerWorldPx.py),
      };
    },
    [zoom, size.width, size.height, centerWorldPx]
  );

  // Merge stored offline nodes/segments with passed props so overlays render cleanly
  const displayNodes = useMemo(() => {
    if (nodes.length > 0) return nodes;
    const m = new Map<string, RoadNodeDTO>();
    for (const r of storedRegions) {
      for (const n of r.nodes) m.set(n.id, n);
    }
    return Array.from(m.values());
  }, [nodes, storedRegions]);

  const displaySegments = useMemo(() => {
    if (segments.length > 0) return segments;
    const m = new Map<string, RoadSegmentDTO>();
    for (const r of storedRegions) {
      for (const s of r.segments) m.set(s.id, s);
    }
    return Array.from(m.values());
  }, [segments, storedRegions]);

  const hasAnyTiles = storedRegions.some((r) => r.tileCount > 0);
  const cachedTilesVisibleCount = useMemo(() => {
    void tileTick;
    return visibleTiles.filter((t) => Boolean(tileUrlCacheRef.current.get(t.key))).length;
  }, [visibleTiles, tileTick]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      startCenterPx: { ...centerWorldPx },
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current?.active) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      dragRef.current.moved = true;
    }
    const nextLatLng = worldPixelToLatLng(
      dragRef.current.startCenterPx.px - dx,
      dragRef.current.startCenterPx.py - dy,
      zoom,
      256
    );
    setViewCenter(nextLatLng);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current?.active) return;
    const moved = dragRef.current.moved;
    dragRef.current = null;
    if (!moved && onMapClick && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const offsetX = e.clientX - rect.left - size.width / 2;
      const offsetY = e.clientY - rect.top - size.height / 2;
      const clicked = worldPixelToLatLng(
        centerWorldPx.px + offsetX,
        centerWorldPx.py + offsetY,
        zoom,
        256
      );
      onMapClick(Number(clicked.lat.toFixed(5)), Number(clicked.lng.toFixed(5)));
    }
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={(e) => {
        e.preventDefault();
        setZoom((z) => (e.deltaY < 0 ? Math.min(16, z + 1) : Math.max(11, z - 1)));
      }}
      className={`relative w-full ${heightClass} overflow-hidden select-none bg-[#E6ECF2] dark:bg-[#0D1526] ${
        pickMode ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'
      }`}
    >
      {/* Cached 256x256 PNG Tiles from IndexedDB */}
      <div className="absolute inset-0 pointer-events-none">
        {visibleTiles.map((t) => {
          const blobUrl = tileUrlCacheRef.current.get(t.key);
          if (!blobUrl) {
            return (
              <div
                key={t.key}
                style={{
                  position: 'absolute',
                  left: t.left,
                  top: t.top,
                  width: 256,
                  height: 256,
                }}
                className="border border-slate-300/40 dark:border-slate-800/60 bg-slate-100/70 dark:bg-[#0B1220]/90"
              />
            );
          }
          return (
            <img
              key={t.key}
              src={blobUrl}
              alt=""
              draggable={false}
              style={{
                position: 'absolute',
                left: t.left,
                top: t.top,
                width: 256,
                height: 256,
              }}
            />
          );
        })}
      </div>

      {/* Vector Overlays: Region Bounds, Roads, Routes, Pins, GPS */}
      <svg
        width={size.width}
        height={size.height}
        className="absolute inset-0 pointer-events-none"
      >
        {/* Downloaded Region Boundaries */}
        {storedRegions.map((reg) => {
          const nw = toScreen(reg.region.bounds.north, reg.region.bounds.west);
          const se = toScreen(reg.region.bounds.south, reg.region.bounds.east);
          return (
            <rect
              key={`bound-${reg.id}`}
              x={nw.x}
              y={nw.y}
              width={Math.max(4, se.x - nw.x)}
              height={Math.max(4, se.y - nw.y)}
              fill="rgba(59, 130, 246, 0.04)"
              stroke="#3B82F6"
              strokeWidth={1.5}
              strokeDasharray="6 4"
            />
          );
        })}

        {/* Fallback vector roads if current zoom tiles aren't cached */}
        {cachedTilesVisibleCount === 0 &&
          displaySegments.map((seg) => {
            if (!seg.geometry || seg.geometry.length < 2) return null;
            const d = seg.geometry
              .map(([lat, lng], idx) => {
                const p = toScreen(lat, lng);
                return `${idx === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
              })
              .join(' ');
            return (
              <path
                key={`off-seg-${seg.id}`}
                d={d}
                fill="none"
                stroke={seg.effectiveClosureStatus === 'CLOSED' ? '#EF4444' : '#64748B'}
                strokeWidth={3}
                strokeOpacity={0.55}
              />
            );
          })}

        {/* Routes */}
        {routes.map((rt, idx) => {
          if (!rt.geometry || rt.geometry.length < 2) return null;
          const d = rt.geometry
            .map(([lat, lng], i) => {
              const p = toScreen(lat, lng);
              return `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
            })
            .join(' ');
          const isPrimary = idx === 0;
          return (
            <g
              key={rt.id}
              style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
              onClick={() => onRouteSelect?.(rt.id)}
            >
              {isPrimary && (
                <path
                  d={d}
                  fill="none"
                  stroke="#0F172A"
                  strokeWidth={(rt.weight || 6) + 4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeOpacity={0.45}
                />
              )}
              <path
                d={d}
                fill="none"
                stroke={rt.color || '#2563EB'}
                strokeWidth={rt.weight || (isPrimary ? 6 : 4)}
                strokeDasharray={rt.dashed ? '8 6' : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeOpacity={isPrimary ? 0.96 : 0.68}
              />
            </g>
          );
        })}

        {/* Offline Road Nodes (when tile cache empty) */}
        {cachedTilesVisibleCount === 0 &&
          displayNodes.map((n) => {
            const p = toScreen(n.latitude, n.longitude);
            return (
              <g key={`off-node-${n.id}`}>
                <circle cx={p.x} cy={p.y} r={4} fill="#2563EB" stroke="#FFFFFF" strokeWidth={1.5} />
                <text
                  x={p.x}
                  y={p.y - 8}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="600"
                  fill="#1E293B"
                >
                  {n.name}
                </text>
              </g>
            );
          })}

        {/* Incidents */}
        {incidents.slice(0, 30).map((inc) => {
          const p = toScreen(inc.latitude, inc.longitude);
          return (
            <circle
              key={`off-inc-${inc.id}`}
              cx={p.x}
              cy={p.y}
              r={5}
              fill={inc.status === 'VERIFIED' ? '#EF4444' : '#F97316'}
              stroke="#FFFFFF"
              strokeWidth={1.5}
            />
          );
        })}

        {/* Parking & Bus Stops */}
        {parkingLocations.map((pk) => {
          const p = toScreen(pk.latitude, pk.longitude);
          return (
            <g key={`off-pk-${pk.id}`}>
              <rect
                x={p.x - 7}
                y={p.y - 7}
                width={14}
                height={14}
                rx={3}
                fill="#16A34A"
                stroke="#FFFFFF"
                strokeWidth={1.5}
              />
              <text
                x={p.x}
                y={p.y + 3.5}
                textAnchor="middle"
                fontSize="9"
                fontWeight="800"
                fill="#FFFFFF"
              >
                P
              </text>
            </g>
          );
        })}

        {busStops.map((bs) => {
          const p = toScreen(bs.latitude, bs.longitude);
          return (
            <g key={`off-bs-${bs.id}`}>
              <rect
                x={p.x - 7}
                y={p.y - 7}
                width={14}
                height={14}
                rx={3}
                fill="#0284C7"
                stroke="#FFFFFF"
                strokeWidth={1.5}
              />
              <text
                x={p.x}
                y={p.y + 3.5}
                textAnchor="middle"
                fontSize="9"
                fontWeight="800"
                fill="#FFFFFF"
              >
                B
              </text>
            </g>
          );
        })}

        {/* Start & Destination Markers */}
        {startPoint && (() => {
          const p = toScreen(startPoint.lat, startPoint.lng);
          return (
            <g transform={`translate(${p.x}, ${p.y})`}>
              <rect x={-22} y={-24} width={44} height={18} rx={5} fill="#16A34A" stroke="#BBF7D0" strokeWidth={1.5} />
              <text x={0} y={-12} textAnchor="middle" fontSize="9" fontWeight="800" fill="#FFFFFF">
                START
              </text>
              <circle cx={0} cy={0} r={4} fill="#16A34A" stroke="#FFFFFF" strokeWidth={1.5} />
            </g>
          );
        })()}

        {endPoint && (() => {
          const p = toScreen(endPoint.lat, endPoint.lng);
          return (
            <g transform={`translate(${p.x}, ${p.y})`}>
              <rect x={-20} y={-24} width={40} height={18} rx={5} fill="#DC2626" stroke="#FECACA" strokeWidth={1.5} />
              <text x={0} y={-12} textAnchor="middle" fontSize="9" fontWeight="800" fill="#FFFFFF">
                DEST
              </text>
              <circle cx={0} cy={0} r={4} fill="#DC2626" stroke="#FFFFFF" strokeWidth={1.5} />
            </g>
          );
        })()}

        {/* Live GPS Dot */}
        {userLocation && (() => {
          const p = toScreen(userLocation.lat, userLocation.lng);
          return (
            <g transform={`translate(${p.x}, ${p.y})`}>
              <circle cx={0} cy={0} r={12} fill="rgba(37, 99, 235, 0.22)" />
              <circle cx={0} cy={0} r={6} fill="#2563EB" stroke="#FFFFFF" strokeWidth={2} />
            </g>
          );
        })()}
      </svg>

      {/* Top Left Offline Status Badge */}
      <div className="absolute top-3 left-3 z-[510] flex flex-wrap items-center gap-2 max-w-[calc(100%-6rem)]">
        <div className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/40 bg-white/95 dark:bg-[#090E1A]/90 px-2.5 py-1.5 text-[11px] font-semibold text-slate-800 dark:text-slate-100 shadow-md backdrop-blur-sm">
          {isOfflineNetwork ? (
            <WifiOff className="w-3.5 h-3.5 text-amber-500" />
          ) : (
            <HardDrive className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          )}
          <span>
            Offline Map ({cachedTilesVisibleCount > 0 ? `${cachedTilesVisibleCount} IDB tiles · ` : ''}z{zoom})
          </span>
        </div>

        {!hasAnyTiles && onOpenOfflineManager && (
          <button
            type="button"
            onClick={onOpenOfflineManager}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-1.5 text-[11px] font-semibold text-white shadow-md"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Region</span>
          </button>
        )}
      </div>

      {/* Map Floating Controls */}
      <div className="absolute bottom-4 right-3 z-[510] flex flex-col gap-1.5">
        {onMyLocationClick && (
          <button
            type="button"
            onClick={onMyLocationClick}
            title="Center on My GPS Location"
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white/95 dark:bg-[#090E1A]/90 text-blue-600 dark:text-blue-400 shadow-lg hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <LocateFixed className="w-4 h-4" />
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            if (userLocation) {
              setViewCenter({ lat: userLocation.lat, lng: userLocation.lng });
              setZoom(15);
            } else if (startPoint) {
              setViewCenter({ lat: startPoint.lat, lng: startPoint.lng });
              setZoom(14);
            } else if (storedRegions[0]) {
              setViewCenter(storedRegions[0].region.center);
              setZoom(13);
            }
          }}
          title="Recenter Offline Map"
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white/95 dark:bg-[#090E1A]/90 text-slate-700 dark:text-slate-200 shadow-lg hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <Compass className="w-4 h-4" />
        </button>

        <div className="flex flex-col rounded-lg border border-slate-300 dark:border-slate-700 bg-white/95 dark:bg-[#090E1A]/90 shadow-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(16, z + 1))}
            title="Zoom In"
            className="w-9 h-9 inline-flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border-b border-slate-200 dark:border-slate-800"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(11, z - 1))}
            title="Zoom Out"
            className="w-9 h-9 inline-flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Minus className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
