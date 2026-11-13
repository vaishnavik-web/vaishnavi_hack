import { OfflineRegionBounds } from '../shared/types';

export interface SlippyTileCoord {
  z: number;
  x: number;
  y: number;
  key: string;
}

export function clampLat(lat: number): number {
  return Math.max(-85.05112878, Math.min(85.05112878, lat));
}

export function normalizeLng(lng: number): number {
  let v = lng;
  while (v > 180) v -= 360;
  while (v < -180) v += 360;
  return v;
}

export function latLngToTile(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const clampedLat = clampLat(lat);
  const latRad = (clampedLat * Math.PI) / 180;
  const x = Math.floor(((normalizeLng(lng) + 180) / 360) * n);
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return {
    x: Math.max(0, Math.min(n - 1, x)),
    y: Math.max(0, Math.min(n - 1, y)),
  };
}

export function tileToLatLng(x: number, y: number, zoom: number): { lat: number; lng: number } {
  const n = Math.pow(2, zoom);
  const lng = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const lat = (latRad * 180) / Math.PI;
  return { lat, lng };
}

export function tileToLatLngBounds(z: number, x: number, y: number): OfflineRegionBounds {
  const nw = tileToLatLng(x, y, z);
  const se = tileToLatLng(x + 1, y + 1, z);
  return {
    north: nw.lat,
    west: nw.lng,
    south: se.lat,
    east: se.lng,
  };
}

export function latLngToWorldPixel(
  lat: number,
  lng: number,
  zoom: number,
  tileSize = 256
): { px: number; py: number } {
  const scale = tileSize * Math.pow(2, zoom);
  const clamped = clampLat(lat);
  const sinLat = Math.sin((clamped * Math.PI) / 180);
  const px = ((normalizeLng(lng) + 180) / 360) * scale;
  const py = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { px, py };
}

export function worldPixelToLatLng(
  px: number,
  py: number,
  zoom: number,
  tileSize = 256
): { lat: number; lng: number } {
  const scale = tileSize * Math.pow(2, zoom);
  const lng = (px / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * py) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lng };
}

export function isPointInBounds(
  lat: number,
  lng: number,
  bounds: OfflineRegionBounds,
  padDeg = 0
): boolean {
  return (
    lat <= bounds.north + padDeg &&
    lat >= bounds.south - padDeg &&
    lng <= bounds.east + padDeg &&
    lng >= bounds.west - padDeg
  );
}

export function boundsAroundCenter(
  centerLat: number,
  centerLng: number,
  radiusKm: number
): OfflineRegionBounds {
  const latDelta = radiusKm / 111.32;
  const cosLat = Math.max(0.2, Math.cos((centerLat * Math.PI) / 180));
  const lngDelta = radiusKm / (111.32 * cosLat);
  return {
    north: Number((centerLat + latDelta).toFixed(5)),
    south: Number((centerLat - latDelta).toFixed(5)),
    east: Number((centerLng + lngDelta).toFixed(5)),
    west: Number((centerLng - lngDelta).toFixed(5)),
  };
}

export function enumerateRegionTiles(
  bounds: OfflineRegionBounds,
  minZoom: number,
  maxZoom: number,
  maxTiles = 160
): SlippyTileCoord[] {
  const tiles: SlippyTileCoord[] = [];
  const safeMin = Math.max(9, Math.min(16, Math.floor(minZoom)));
  const safeMax = Math.max(safeMin, Math.min(16, Math.floor(maxZoom)));

  for (let z = safeMin; z <= safeMax; z++) {
    const nw = latLngToTile(bounds.north, bounds.west, z);
    const se = latLngToTile(bounds.south, bounds.east, z);
    const minX = Math.min(nw.x, se.x);
    const maxX = Math.max(nw.x, se.x);
    const minY = Math.min(nw.y, se.y);
    const maxY = Math.max(nw.y, se.y);

    const levelTiles: SlippyTileCoord[] = [];
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        levelTiles.push({ z, x, y, key: `${z}/${x}/${y}` });
      }
    }

    if (tiles.length + levelTiles.length > maxTiles && tiles.length > 0) {
      break;
    }
    if (tiles.length + levelTiles.length > maxTiles) {
      tiles.push(...levelTiles.slice(0, maxTiles - tiles.length));
      break;
    }
    tiles.push(...levelTiles);
  }
  return tiles;
}
