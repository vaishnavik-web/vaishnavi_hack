import {
  BusStopDTO,
  GeocodeSuggestionDTO,
  LocationPointDTO,
  OfflineRegionBounds,
  OfflineRegionBundleDTO,
  OfflineRegionPresetDTO,
  ParkingLocationDTO,
  RoadNodeDTO,
  RoadSegmentDTO,
  RouteAlternativeDTO,
  RouteAlternativesResultDTO,
  RouteStepDTO,
  TravelMode,
} from '../shared/types';
import { haversineDistanceMeters } from './voiceNavigation';
import {
  enumerateRegionTiles,
  isPointInBounds,
  latLngToWorldPixel,
  SlippyTileCoord,
} from './offlineTileMath';

const DB_NAME = 'traffix-offline-db';
const DB_VERSION = 1;
const STORE_REGIONS = 'regions';
const STORE_TILES = 'map_tiles';
const STORE_ROUTES = 'route_cache';

const MAX_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days (Maps ToS geospatial caching limit)

export interface StoredOfflineRegion {
  id: string;
  region: OfflineRegionPresetDTO;
  nodes: RoadNodeDTO[];
  segments: RoadSegmentDTO[];
  parkingLocations: ParkingLocationDTO[];
  busStops: BusStopDTO[];
  tileCount: number;
  tileBytes: number;
  downloadedAt: string;
  expiresAt: string;
}

export interface StoredMapTile {
  key: string; // `${z}/${x}/${y}`
  z: number;
  x: number;
  y: number;
  blob: Blob;
  bytes: number;
  regionIds: string[];
  cachedAt: number;
}

export interface StoredCachedRoute {
  cacheKey: string;
  originLat: number;
  originLng: number;
  originLabel: string;
  destinationLat: number;
  destinationLng: number;
  destinationLabel: string;
  travelMode: TravelMode;
  result: RouteAlternativesResultDTO;
  source: 'ONLINE_CACHED' | 'REGION_PREFETCH';
  regionId?: string;
  cachedAt: string;
  expiresAt: string;
}

export interface OfflineStorageStats {
  regionCount: number;
  tileCount: number;
  totalTileBytes: number;
  cachedRouteCount: number;
  browserUsageBytes: number | null;
  browserQuotaBytes: number | null;
}

function notifyOfflineStoreChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('traffix-offline-updated'));
  }
}

export function isIndexedDbSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDbSupported()) {
      reject(new Error('IndexedDB is not available in this environment.'));
      return;
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_REGIONS)) {
        db.createObjectStore(STORE_REGIONS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_TILES)) {
        const tileStore = db.createObjectStore(STORE_TILES, { keyPath: 'key' });
        tileStore.createIndex('by_region', 'regionIds', { multiEntry: true });
      }
      if (!db.objectStoreNames.contains(STORE_ROUTES)) {
        const routeStore = db.createObjectStore(STORE_ROUTES, { keyPath: 'cacheKey' });
        routeStore.createIndex('by_expiresAt', 'expiresAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'));
  });
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB request failed'));
  });
}

function idbTransactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
  });
}

async function renderVectorRoadTileBlob(
  tile: SlippyTileCoord,
  bundle: OfflineRegionBundleDTO
): Promise<Blob> {
  const size = 256;
  const originPxX = tile.x * size;
  const originPxY = tile.y * size;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return new Blob([`offline-tile-${tile.key}`], { type: 'text/plain' });
  }

  // Subtle light cartographic base
  ctx.fillStyle = '#EEF2F6';
  ctx.fillRect(0, 0, size, size);

  // Urban block grid texture
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1;
  for (let g = 0; g <= size; g += 64) {
    ctx.beginPath();
    ctx.moveTo(g + 0.5, 0);
    ctx.lineTo(g + 0.5, size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, g + 0.5);
    ctx.lineTo(size, g + 0.5);
    ctx.stroke();
  }

  // Highlight region boundary inside the tile
  const nwPx = latLngToWorldPixel(bundle.region.bounds.north, bundle.region.bounds.west, tile.z, size);
  const sePx = latLngToWorldPixel(bundle.region.bounds.south, bundle.region.bounds.east, tile.z, size);
  const rx = nwPx.px - originPxX;
  const ry = nwPx.py - originPxY;
  const rw = sePx.px - nwPx.px;
  const rh = sePx.py - nwPx.py;

  if (rx < size && ry < size && rx + rw > 0 && ry + rh > 0) {
    ctx.fillStyle = 'rgba(248, 250, 252, 0.72)';
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.setLineDash([]);
  }

  // Render region road segments projected into this 256x256 tile
  const drawSegments = (pass: 'casing' | 'fill') => {
    for (const seg of bundle.segments) {
      const pts =
        seg.geometry && seg.geometry.length >= 2
          ? seg.geometry
          : null;
      if (!pts) continue;

      const localPts = pts.map(([lat, lng]) => {
        const p = latLngToWorldPixel(lat, lng, tile.z, size);
        return { x: p.px - originPxX, y: p.py - originPxY };
      });

      const minX = Math.min(...localPts.map((p) => p.x));
      const maxX = Math.max(...localPts.map((p) => p.x));
      const minY = Math.min(...localPts.map((p) => p.y));
      const maxY = Math.max(...localPts.map((p) => p.y));
      if (maxX < -24 || minX > size + 24 || maxY < -24 || minY > size + 24) {
        continue;
      }

      const isMajor = seg.lanes >= 3 || seg.speedLimitKmh >= 45;
      const baseWidth = tile.z >= 14 ? (isMajor ? 7 : 4.5) : isMajor ? 5 : 3;

      ctx.beginPath();
      localPts.forEach((p, idx) => {
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (pass === 'casing') {
        ctx.strokeStyle = isMajor ? '#D97706' : '#94A3B8';
        ctx.lineWidth = baseWidth + 2.4;
      } else {
        ctx.strokeStyle = isMajor ? '#FDE68A' : '#FFFFFF';
        ctx.lineWidth = baseWidth;
      }
      ctx.stroke();
    }
  };

  drawSegments('casing');
  drawSegments('fill');

  // Render road name labels at higher zoom levels
  if (tile.z >= 13) {
    ctx.font = '600 10px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const seg of bundle.segments) {
      if (!seg.geometry || seg.geometry.length < 2) continue;
      const mid = seg.geometry[Math.floor(seg.geometry.length / 2)];
      const p = latLngToWorldPixel(mid[0], mid[1], tile.z, size);
      const x = p.px - originPxX;
      const y = p.py - originPxY;
      if (x < 16 || x > size - 16 || y < 12 || y > size - 12) continue;
      const shortName = seg.name.split('(')[0].trim().slice(0, 22);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.92)';
      ctx.strokeText(shortName, x, y);
      ctx.fillStyle = '#334155';
      ctx.fillText(shortName, x, y);
    }
  }

  // Render junctions & landmarks
  for (const node of bundle.nodes) {
    const p = latLngToWorldPixel(node.latitude, node.longitude, tile.z, size);
    const x = p.px - originPxX;
    const y = p.py - originPxY;
    if (x < -12 || x > size + 12 || y < -12 || y > size + 12) continue;

    ctx.beginPath();
    ctx.arc(x, y, node.isJunction ? 4 : 2.8, 0, Math.PI * 2);
    ctx.fillStyle = node.isJunction ? '#2563EB' : '#64748B';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();

    if (tile.z >= 13) {
      ctx.font = '700 10px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.strokeText(node.name, x, y - 9);
      ctx.fillStyle = '#0F172A';
      ctx.fillText(node.name, x, y - 9);
    }
  }

  // Subtle tile watermark for transparency
  ctx.font = '500 8px ui-monospace, monospace';
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(71, 85, 105, 0.55)';
  ctx.fillText(`TRAFFIX OFFLINE z${tile.z}`, size - 5, size - 5);

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        resolve(blob || new Blob([], { type: 'image/png' }));
      },
      'image/png',
      0.92
    );
  });
}

export async function downloadAndStoreRegion(
  bundle: OfflineRegionBundleDTO,
  onProgress?: (progress: { completed: number; total: number; bytes: number; stage: string }) => void
): Promise<StoredOfflineRegion> {
  const db = await openOfflineDb();
  const tiles = enumerateRegionTiles(
    bundle.region.bounds,
    bundle.region.minZoom,
    bundle.region.maxZoom,
    160
  );

  let totalBytes = 0;
  onProgress?.({
    completed: 0,
    total: tiles.length,
    bytes: 0,
    stage: 'Rendering & storing map tiles in IndexedDB...',
  });

  // Render tiles in small batches to keep UI responsive
  const preparedTiles: Array<{ tile: SlippyTileCoord; blob: Blob }> = [];
  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    const blob = await renderVectorRoadTileBlob(tile, bundle);
    totalBytes += blob.size;
    preparedTiles.push({ tile, blob });
    if ((i + 1) % 6 === 0 || i === tiles.length - 1) {
      onProgress?.({
        completed: i + 1,
        total: tiles.length,
        bytes: totalBytes,
        stage: `Caching map tile ${i + 1} of ${tiles.length}...`,
      });
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // Persist tiles, precomputed routes, and region metadata atomically
  const tx = db.transaction([STORE_TILES, STORE_ROUTES, STORE_REGIONS], 'readwrite');
  const tileStore = tx.objectStore(STORE_TILES);
  const routeStore = tx.objectStore(STORE_ROUTES);
  const regionStore = tx.objectStore(STORE_REGIONS);

  for (const { tile, blob } of preparedTiles) {
    const existing = (await idbRequest(tileStore.get(tile.key))) as StoredMapTile | undefined;
    const regionIds = Array.from(
      new Set([...(existing?.regionIds || []), bundle.region.id])
    );
    const record: StoredMapTile = {
      key: tile.key,
      z: tile.z,
      x: tile.x,
      y: tile.y,
      blob,
      bytes: blob.size,
      regionIds,
      cachedAt: Date.now(),
    };
    tileStore.put(record);
  }

  const nowIso = bundle.downloadedAt || new Date().toISOString();
  const expIso =
    bundle.expiresAt || new Date(Date.now() + MAX_CACHE_TTL_MS).toISOString();

  for (const pre of bundle.precomputedRoutes) {
    const routeRecord: StoredCachedRoute = {
      cacheKey: `prefetch:${bundle.region.id}:${pre.cacheKey}`,
      originLat: pre.originLat,
      originLng: pre.originLng,
      originLabel: pre.originLabel,
      destinationLat: pre.destinationLat,
      destinationLng: pre.destinationLng,
      destinationLabel: pre.destinationLabel,
      travelMode: pre.travelMode,
      result: pre.result,
      source: 'REGION_PREFETCH',
      regionId: bundle.region.id,
      cachedAt: nowIso,
      expiresAt: expIso,
    };
    routeStore.put(routeRecord);
  }

  const regionRecord: StoredOfflineRegion = {
    id: bundle.region.id,
    region: bundle.region,
    nodes: bundle.nodes,
    segments: bundle.segments,
    parkingLocations: bundle.parkingLocations,
    busStops: bundle.busStops,
    tileCount: preparedTiles.length,
    tileBytes: totalBytes,
    downloadedAt: nowIso,
    expiresAt: expIso,
  };
  regionStore.put(regionRecord);

  await idbTransactionDone(tx);
  notifyOfflineStoreChanged();
  return regionRecord;
}

export async function listStoredRegions(): Promise<StoredOfflineRegion[]> {
  if (!isIndexedDbSupported()) return [];
  try {
    const db = await openOfflineDb();
    const tx = db.transaction(STORE_REGIONS, 'readonly');
    const all = (await idbRequest(tx.objectStore(STORE_REGIONS).getAll())) as StoredOfflineRegion[];
    const now = Date.now();
    return (all || []).filter((r) => new Date(r.expiresAt).getTime() > now);
  } catch {
    return [];
  }
}

export async function deleteStoredRegion(regionId: string): Promise<void> {
  if (!isIndexedDbSupported()) return;
  const db = await openOfflineDb();
  const tx = db.transaction([STORE_REGIONS, STORE_TILES, STORE_ROUTES], 'readwrite');
  const regionStore = tx.objectStore(STORE_REGIONS);
  const tileStore = tx.objectStore(STORE_TILES);
  const routeStore = tx.objectStore(STORE_ROUTES);

  regionStore.delete(regionId);

  const matchingTiles = (await idbRequest(
    tileStore.index('by_region').getAll(regionId)
  )) as StoredMapTile[];

  for (const tile of matchingTiles || []) {
    const remaining = tile.regionIds.filter((id) => id !== regionId);
    if (remaining.length === 0) {
      tileStore.delete(tile.key);
    } else {
      tileStore.put({ ...tile, regionIds: remaining });
    }
  }

  const allRoutes = (await idbRequest(routeStore.getAll())) as StoredCachedRoute[];
  for (const rt of allRoutes || []) {
    if (rt.regionId === regionId && rt.source === 'REGION_PREFETCH') {
      routeStore.delete(rt.cacheKey);
    }
  }

  await idbTransactionDone(tx);
  notifyOfflineStoreChanged();
}

export async function getStoredTileBlob(z: number, x: number, y: number): Promise<Blob | null> {
  if (!isIndexedDbSupported()) return null;
  try {
    const db = await openOfflineDb();
    const tx = db.transaction(STORE_TILES, 'readonly');
    const rec = (await idbRequest(
      tx.objectStore(STORE_TILES).get(`${z}/${x}/${y}`)
    )) as StoredMapTile | undefined;
    return rec?.blob || null;
  } catch {
    return null;
  }
}

export function buildRouteCacheKey(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  travelMode: TravelMode
): string {
  return `online:${travelMode}|${origin.lat.toFixed(4)},${origin.lng.toFixed(
    4
  )}->${destination.lat.toFixed(4)},${destination.lng.toFixed(4)}`;
}

export async function cacheRouteResult(
  origin: LocationPointDTO,
  destination: LocationPointDTO,
  travelMode: TravelMode,
  result: RouteAlternativesResultDTO
): Promise<void> {
  if (!isIndexedDbSupported()) return;
  try {
    const db = await openOfflineDb();
    const tx = db.transaction(STORE_ROUTES, 'readwrite');
    const store = tx.objectStore(STORE_ROUTES);
    const now = Date.now();
    const record: StoredCachedRoute = {
      cacheKey: buildRouteCacheKey(origin, destination, travelMode),
      originLat: origin.lat,
      originLng: origin.lng,
      originLabel: origin.label,
      destinationLat: destination.lat,
      destinationLng: destination.lng,
      destinationLabel: destination.label,
      travelMode,
      result,
      source: 'ONLINE_CACHED',
      cachedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + MAX_CACHE_TTL_MS).toISOString(),
    };
    store.put(record);
    await idbTransactionDone(tx);
    notifyOfflineStoreChanged();
  } catch {
    // non-fatal caching error
  }
}

export async function listCachedRoutes(): Promise<StoredCachedRoute[]> {
  if (!isIndexedDbSupported()) return [];
  try {
    const db = await openOfflineDb();
    const tx = db.transaction(STORE_ROUTES, 'readonly');
    const all = (await idbRequest(tx.objectStore(STORE_ROUTES).getAll())) as StoredCachedRoute[];
    const now = Date.now();
    return (all || [])
      .filter((r) => new Date(r.expiresAt).getTime() > now)
      .sort((a, b) => new Date(b.cachedAt).getTime() - new Date(a.cachedAt).getTime());
  } catch {
    return [];
  }
}

export async function clearRouteCache(): Promise<void> {
  if (!isIndexedDbSupported()) return;
  const db = await openOfflineDb();
  const tx = db.transaction(STORE_ROUTES, 'readwrite');
  tx.objectStore(STORE_ROUTES).clear();
  await idbTransactionDone(tx);
  notifyOfflineStoreChanged();
}

export async function findCachedRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  travelMode: TravelMode,
  toleranceMeters = 350
): Promise<StoredCachedRoute | null> {
  const routes = await listCachedRoutes();
  let best: StoredCachedRoute | null = null;
  let bestScore = Infinity;

  for (const r of routes) {
    if (r.travelMode !== travelMode) continue;
    const dO = haversineDistanceMeters(origin.lat, origin.lng, r.originLat, r.originLng);
    const dD = haversineDistanceMeters(
      destination.lat,
      destination.lng,
      r.destinationLat,
      r.destinationLng
    );
    if (dO <= toleranceMeters && dD <= toleranceMeters) {
      const score = dO + dD;
      if (score < bestScore) {
        bestScore = score;
        best = r;
      }
    }
  }
  return best;
}

export async function getOfflineStorageStats(): Promise<OfflineStorageStats> {
  const regions = await listStoredRegions();
  const routes = await listCachedRoutes();
  let tileCount = 0;
  let totalTileBytes = 0;

  if (isIndexedDbSupported()) {
    try {
      const db = await openOfflineDb();
      const tx = db.transaction(STORE_TILES, 'readonly');
      const tiles = (await idbRequest(tx.objectStore(STORE_TILES).getAll())) as StoredMapTile[];
      tileCount = tiles?.length || 0;
      totalTileBytes = (tiles || []).reduce((sum, t) => sum + (t.bytes || 0), 0);
    } catch {
      // ignore
    }
  }

  let browserUsageBytes: number | null = null;
  let browserQuotaBytes: number | null = null;
  if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
    try {
      const est = await navigator.storage.estimate();
      browserUsageBytes = est.usage ?? null;
      browserQuotaBytes = est.quota ?? null;
    } catch {
      // ignore
    }
  }

  return {
    regionCount: regions.length,
    tileCount,
    totalTileBytes,
    cachedRouteCount: routes.length,
    browserUsageBytes,
    browserQuotaBytes,
  };
}

export function isLocationCoveredByRegions(
  lat: number,
  lng: number,
  regions: StoredOfflineRegion[]
): StoredOfflineRegion | null {
  for (const reg of regions) {
    if (isPointInBounds(lat, lng, reg.region.bounds, 0.004)) {
      return reg;
    }
  }
  return null;
}

// Pure client-side Dijkstra routing over downloaded IndexedDB road graph
export function computeGraphOfflineAlternatives(
  nodes: RoadNodeDTO[],
  segments: RoadSegmentDTO[],
  origin: LocationPointDTO,
  destination: LocationPointDTO,
  travelMode: TravelMode
): RouteAlternativesResultDTO | null {
  if (nodes.length === 0 || segments.length === 0) return null;

  const findNearest = (lat: number, lng: number) => {
    let best: RoadNodeDTO | null = null;
    let bestDist = Infinity;
    for (const n of nodes) {
      const d = haversineDistanceMeters(lat, lng, n.latitude, n.longitude);
      if (d < bestDist) {
        bestDist = d;
        best = n;
      }
    }
    return best ? { node: best, distanceMeters: bestDist } : null;
  };

  const nearO = findNearest(origin.lat, origin.lng);
  const nearD = findNearest(destination.lat, destination.lng);
  if (!nearO || !nearD || nearO.distanceMeters > 4500 || nearD.distanceMeters > 4500) {
    return null;
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const adj = new Map<string, Array<{ to: string; seg: RoadSegmentDTO; reversed: boolean }>>();
  for (const n of nodes) adj.set(n.id, []);

  for (const seg of segments) {
    if (seg.effectiveClosureStatus === 'CLOSED') continue;
    adj.get(seg.startNodeId)?.push({ to: seg.endNodeId, seg, reversed: false });
    if (seg.isOneWay !== true) {
      adj.get(seg.endNodeId)?.push({ to: seg.startNodeId, seg, reversed: true });
    }
  }

  const speedMultiplier =
    travelMode === 'WALK'
      ? 5.0
      : travelMode === 'BICYCLE'
      ? 14.0
      : travelMode === 'TWO_WHEELER'
      ? 36.0
      : travelMode === 'TRANSIT'
      ? 22.0
      : 32.0;

  const runPath = (mode: 'fastest' | 'shortest') => {
    const dist = new Map<string, number>();
    const prev = new Map<
      string,
      { from: string; seg: RoadSegmentDTO; reversed: boolean } | null
    >();
    const visited = new Set<string>();
    for (const n of nodes) dist.set(n.id, Infinity);
    dist.set(nearO.node.id, 0);

    while (true) {
      let u: string | null = null;
      let best = Infinity;
      for (const [id, d] of dist.entries()) {
        if (!visited.has(id) && d < best) {
          best = d;
          u = id;
        }
      }
      if (!u || u === nearD.node.id || best === Infinity) break;
      visited.add(u);

      for (const edge of adj.get(u) || []) {
        if (visited.has(edge.to)) continue;
        const effectiveSpeed =
          travelMode === 'WALK' || travelMode === 'BICYCLE'
            ? speedMultiplier
            : Math.max(10, edge.seg.speedLimitKmh * (1 - edge.seg.currentCongestion * 0.45));
        const cost =
          mode === 'shortest'
            ? edge.seg.lengthMeters
            : (edge.seg.lengthMeters / 1000 / effectiveSpeed) * 60;
        const alt = best + cost;
        if (alt < (dist.get(edge.to) ?? Infinity)) {
          dist.set(edge.to, alt);
          prev.set(edge.to, { from: u, seg: edge.seg, reversed: edge.reversed });
        }
      }
    }

    if ((dist.get(nearD.node.id) ?? Infinity) === Infinity) return null;

    const pathEdges: Array<{ seg: RoadSegmentDTO; reversed: boolean; toNode: RoadNodeDTO }> = [];
    const pathNodeIds: string[] = [nearD.node.id];
    let cur = nearD.node.id;
    while (cur !== nearO.node.id) {
      const p = prev.get(cur);
      if (!p) break;
      const toNode = nodeMap.get(cur)!;
      pathEdges.unshift({ seg: p.seg, reversed: p.reversed, toNode });
      pathNodeIds.unshift(p.from);
      cur = p.from;
    }
    return { pathEdges, pathNodeIds };
  };

  const fastest = runPath('fastest');
  if (!fastest) return null;
  const shortest = runPath('shortest');

  const buildAlt = (
    path: NonNullable<typeof fastest>,
    category: RouteAlternativeDTO['category'],
    routeName: string,
    isRecommended: boolean
  ): RouteAlternativeDTO => {
    const geometry: Array<[number, number]> = [[origin.lat, origin.lng]];
    const steps: RouteStepDTO[] = [];
    let totalMeters = nearO.distanceMeters + nearD.distanceMeters;

    if (nearO.distanceMeters > 35) {
      steps.push({
        instruction: `Proceed to ${nearO.node.name}`,
        roadName: nearO.node.name,
        distanceMeters: Math.round(nearO.distanceMeters),
        durationMin: Number(((nearO.distanceMeters / 1000 / speedMultiplier) * 60).toFixed(1)),
        latitude: origin.lat,
        longitude: origin.lng,
      });
    }

    for (const edge of path.pathEdges) {
      totalMeters += edge.seg.lengthMeters;
      const segPts =
        edge.seg.geometry && edge.seg.geometry.length >= 2
          ? edge.reversed
            ? [...edge.seg.geometry].reverse()
            : edge.seg.geometry
          : [[edge.toNode.latitude, edge.toNode.longitude] as [number, number]];
      for (const pt of segPts) {
        geometry.push(pt);
      }
      const stepSpeed =
        travelMode === 'WALK' || travelMode === 'BICYCLE'
          ? speedMultiplier
          : Math.max(10, edge.seg.speedLimitKmh * (1 - edge.seg.currentCongestion * 0.4));
      steps.push({
        instruction: `Continue on ${edge.seg.name} toward ${edge.toNode.name}`,
        roadName: edge.seg.name,
        distanceMeters: Math.round(edge.seg.lengthMeters),
        durationMin: Number(((edge.seg.lengthMeters / 1000 / stepSpeed) * 60).toFixed(1)),
        latitude: segPts[0][0],
        longitude: segPts[0][1],
      });
    }

    geometry.push([destination.lat, destination.lng]);
    steps.push({
      instruction: `Arrive at ${destination.label.split(',')[0]}`,
      roadName: destination.label,
      distanceMeters: Math.round(nearD.distanceMeters),
      durationMin: Number(((nearD.distanceMeters / 1000 / speedMultiplier) * 60).toFixed(1)),
      latitude: destination.lat,
      longitude: destination.lng,
    });

    const totalKm = Number((totalMeters / 1000).toFixed(2));
    const totalMin = Number(
      Math.max(
        1,
        steps.reduce((s, st) => s + st.durationMin, 0)
      ).toFixed(1)
    );

    return {
      category,
      routeName,
      algorithm: 'OFFLINE_LOCAL_GRAPH' as any,
      isRecommended,
      travelMode,
      pathNodeIds: path.pathNodeIds,
      pathSegmentIds: path.pathEdges.map((e) => e.seg.id),
      geometry,
      totalDistanceKm: totalKm,
      estimatedTimeMin: totalMin,
      avgCongestion: 0.25,
      trafficLevel: 'CLEAR',
      liveTrafficAvailable: false,
      trafficSummary: 'Offline downloaded region route (no live traffic feed).',
      incidentCount: 0,
      closureWarnings: [],
      intersectsClosedRoad: false,
      estimatedFuelLiters: travelMode === 'DRIVE' ? Number((totalKm * 0.08).toFixed(2)) : 0,
      reliabilityScore: 0.85,
      importantTurns: steps.length,
      relevantIncidents: [],
      explanation: `Computed offline from downloaded IndexedDB region road network (${path.pathEdges.length} segments).`,
      scoreBreakdown: {
        distanceWeight: Number((totalKm * 0.18).toFixed(2)),
        timeWeight: Number((totalMin * 0.32).toFixed(2)),
        congestionPenalty: 0,
        incidentPenalty: 0,
        closurePenalty: 0,
        reliabilityBonus: 0,
        totalCompositeScore: Number((totalKm * 0.18 + totalMin * 0.32).toFixed(2)),
      },
      steps,
    };
  };

  const alternatives: RouteAlternativeDTO[] = [
    buildAlt(fastest, 'RECOMMENDED', 'Offline Downloaded Corridor Route', true),
  ];
  if (
    shortest &&
    shortest.pathEdges.map((e) => e.seg.id).join(',') !==
      fastest.pathEdges.map((e) => e.seg.id).join(',')
  ) {
    alternatives.push(buildAlt(shortest, 'SHORTEST', 'Offline Shortest Path', false));
  }

  return {
    origin: {
      ...nearO.node,
      label: origin.label,
    },
    destination: {
      ...nearD.node,
      label: destination.label,
    },
    travelMode,
    liveTrafficAvailable: false,
    trafficSummary: 'Offline mode — computed from downloaded IndexedDB map & road pack.',
    lastUpdated: new Date().toISOString(),
    alternatives,
    recalculatedDueToNetworkEvent: false,
    activeClosuresCount: 0,
    activeSimulationsCount: 0,
    provider: {
      name: 'IndexedDB Offline Region Engine',
      mode: 'SIMULATED_GRAPH',
      isSimulated: true,
      lastUpdated: new Date().toISOString(),
      notice:
        'OFFLINE NAVIGATION: Using downloaded IndexedDB region data and local road graph.',
    },
  };
}

export async function computeOfflineNavigation(
  origin: LocationPointDTO,
  destination: LocationPointDTO,
  travelMode: TravelMode
): Promise<{
  result: RouteAlternativesResultDTO | null;
  source: 'CACHED_ROUTE' | 'REGION_GRAPH' | 'UNAVAILABLE';
  message?: string;
}> {
  // 1. Exact cached route hit from IndexedDB route_cache
  const cached = await findCachedRoute(origin, destination, travelMode);
  if (cached) {
    return {
      source: 'CACHED_ROUTE',
      result: {
        ...cached.result,
        liveTrafficAvailable: false,
        trafficSummary: `Offline cached route (saved ${new Date(cached.cachedAt).toLocaleDateString()}). Live traffic unavailable.`,
        provider: {
          ...cached.result.provider,
          notice: `OFFLINE ROUTE CACHE: Loaded saved ${travelMode.toLowerCase()} route from IndexedDB.`,
        },
      },
    };
  }

  // 2. Merge downloaded offline regions & run client-side Dijkstra
  const regions = await listStoredRegions();
  if (regions.length === 0) {
    return {
      source: 'UNAVAILABLE',
      result: null,
      message:
        'No offline map regions or cached routes found in IndexedDB. Download a region while online to navigate offline.',
    };
  }

  const nodeMap = new Map<string, RoadNodeDTO>();
  const segMap = new Map<string, RoadSegmentDTO>();
  for (const r of regions) {
    for (const n of r.nodes) nodeMap.set(n.id, n);
    for (const s of r.segments) segMap.set(s.id, s);
  }

  const graphRoute = computeGraphOfflineAlternatives(
    Array.from(nodeMap.values()),
    Array.from(segMap.values()),
    origin,
    destination,
    travelMode
  );
  if (graphRoute) {
    return { source: 'REGION_GRAPH', result: graphRoute };
  }

  return {
    source: 'UNAVAILABLE',
    result: null,
    message:
      'Selected origin/destination is outside your downloaded offline regions and not in route cache.',
  };
}

export async function searchOfflineLocations(query: string): Promise<GeocodeSuggestionDTO[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const coordMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (coordMatch) {
    const lat = Number(coordMatch[1]);
    const lng = Number(coordMatch[2]);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return [
        {
          id: `offline-coord-${lat.toFixed(4)}-${lng.toFixed(4)}`,
          name: `Coordinates (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
          displayName: `Offline Coordinates: ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
          latitude: lat,
          longitude: lng,
          source: 'COORDINATE',
        },
      ];
    }
  }

  const lower = trimmed.toLowerCase();
  const suggestions: GeocodeSuggestionDTO[] = [];
  const seen = new Set<string>();

  const [regions, routes] = await Promise.all([listStoredRegions(), listCachedRoutes()]);

  for (const reg of regions) {
    for (const n of reg.nodes) {
      if (
        n.name.toLowerCase().includes(lower) ||
        n.zone.toLowerCase().includes(lower) ||
        n.externalRef.toLowerCase().includes(lower)
      ) {
        if (seen.has(n.id)) continue;
        seen.add(n.id);
        suggestions.push({
          id: n.id,
          name: n.name,
          displayName: `${n.name} (${n.zone} · Offline Region)`,
          latitude: n.latitude,
          longitude: n.longitude,
          source: 'LOCAL_NODE',
          nodeId: n.id,
          externalRef: n.externalRef,
          zone: n.zone,
        });
      }
    }
    for (const p of reg.parkingLocations) {
      if (p.parkingName.toLowerCase().includes(lower) || p.address.toLowerCase().includes(lower)) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        suggestions.push({
          id: p.id,
          name: p.parkingName,
          displayName: `${p.parkingName} (Offline Parking)`,
          latitude: p.latitude,
          longitude: p.longitude,
          source: 'LOCAL_NODE',
        });
      }
    }
    for (const s of reg.busStops) {
      if (s.stopName.toLowerCase().includes(lower) || s.address.toLowerCase().includes(lower)) {
        if (seen.has(s.id)) continue;
        seen.add(s.id);
        suggestions.push({
          id: s.id,
          name: s.stopName,
          displayName: `${s.stopName} (Offline Bus Stop)`,
          latitude: s.latitude,
          longitude: s.longitude,
          source: 'LOCAL_NODE',
        });
      }
    }
  }

  for (const rt of routes) {
    if (rt.destinationLabel.toLowerCase().includes(lower)) {
      const key = `dest-${rt.destinationLat.toFixed(4)}-${rt.destinationLng.toFixed(4)}`;
      if (!seen.has(key)) {
        seen.add(key);
        suggestions.push({
          id: key,
          name: rt.destinationLabel,
          displayName: `${rt.destinationLabel} (Cached Route)`,
          latitude: rt.destinationLat,
          longitude: rt.destinationLng,
          source: 'LOCAL_NODE',
        });
      }
    }
  }

  return suggestions.slice(0, 8);
}

export function boundsCoveragePercent(
  bounds: OfflineRegionBounds,
  regions: StoredOfflineRegion[]
): boolean {
  const centerLat = (bounds.north + bounds.south) / 2;
  const centerLng = (bounds.east + bounds.west) / 2;
  return Boolean(isLocationCoveredByRegions(centerLat, centerLng, regions));
}
