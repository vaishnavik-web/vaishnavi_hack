import Database from 'better-sqlite3';
import {
  OfflinePrecomputedRouteDTO,
  OfflineRegionBounds,
  OfflineRegionBundleDTO,
  OfflineRegionPresetDTO,
  RoadNodeDTO,
  RouteAlternativeDTO,
  RouteAlternativesResultDTO,
  TravelMode,
} from '../../shared/types.js';
import { buildEffectiveGraph } from '../algorithms/graph.js';
import { computeRouteAlternatives, DEFAULT_MULTIFACTOR_WEIGHTS } from '../algorithms/pathfinding.js';
import { getRoutingProviderMetadata } from '../providers/routingProvider.js';
import { notFound } from '../utils/errors.js';
import { listParkingLocations } from './parkingService.js';
import { listBusStops } from './transportService.js';
import { enumerateRegionTiles, isPointInBounds } from '../../utils/offlineTileMath.js';

const PRESET_DEFINITIONS: Array<{
  id: string;
  name: string;
  subtitle: string;
  bounds: OfflineRegionBounds;
  minZoom: number;
  maxZoom: number;
}> = [
  {
    id: 'belagavi-core',
    name: 'Belagavi City Center & Fort',
    subtitle: 'CBT, Rani Chennamma Circle, College Rd, Bogarves, Fort Lake & Railway Station',
    bounds: { north: 15.868, south: 15.844, east: 74.518, west: 74.492 },
    minZoom: 13,
    maxZoom: 15,
  },
  {
    id: 'belagavi-north',
    name: 'North Corridor (KLE & Nehru Nagar)',
    subtitle: 'KLE Medical Corridor, Nehru Nagar Bypass, Kanabargi Ring & Hindalga West',
    bounds: { north: 15.882, south: 15.852, east: 74.53, west: 74.474 },
    minZoom: 12,
    maxZoom: 14,
  },
  {
    id: 'belagavi-south',
    name: 'South Hub (Tilakwadi & Udyambag)',
    subtitle: 'Tilakwadi, Congress Rd, Udyambag Industrial Gate, Shahpur & Vadgaon',
    bounds: { north: 15.854, south: 15.826, east: 74.522, west: 74.482 },
    minZoom: 12,
    maxZoom: 14,
  },
  {
    id: 'belagavi-metro',
    name: 'Full Belagavi Metro Corridor',
    subtitle: 'Complete 16-node city road graph, parking plazas, bus stops & key hub routes',
    bounds: { north: 15.884, south: 15.824, east: 74.536, west: 74.47 },
    minZoom: 12,
    maxZoom: 14,
  },
];

function toPresetDTO(def: (typeof PRESET_DEFINITIONS)[number]): OfflineRegionPresetDTO {
  const tiles = enumerateRegionTiles(def.bounds, def.minZoom, def.maxZoom, 160);
  const estimatedSizeKb = Math.max(48, tiles.length * 14 + 36);
  return {
    id: def.id,
    name: def.name,
    subtitle: def.subtitle,
    bounds: def.bounds,
    center: {
      lat: Number(((def.bounds.north + def.bounds.south) / 2).toFixed(5)),
      lng: Number(((def.bounds.east + def.bounds.west) / 2).toFixed(5)),
    },
    minZoom: def.minZoom,
    maxZoom: def.maxZoom,
    estimatedTiles: tiles.length,
    estimatedSizeKb,
  };
}

export function listOfflineRegionPresets(): OfflineRegionPresetDTO[] {
  return PRESET_DEFINITIONS.map(toPresetDTO);
}

function buildRouteForMode(
  graph: ReturnType<typeof buildEffectiveGraph>,
  origin: RoadNodeDTO,
  destination: RoadNodeDTO,
  travelMode: TravelMode
): RouteAlternativesResultDTO | null {
  const computed = computeRouteAlternatives(
    graph,
    origin.id,
    destination.id,
    DEFAULT_MULTIFACTOR_WEIGHTS
  );
  if (computed.length === 0) return null;

  const speedFactor =
    travelMode === 'WALK'
      ? 5.8
      : travelMode === 'BICYCLE'
      ? 2.1
      : travelMode === 'TWO_WHEELER'
      ? 0.88
      : travelMode === 'TRANSIT'
      ? 1.25
      : 1;

  const alternatives: RouteAlternativeDTO[] = computed.map((alt) => {
    const adjustedTime = Number(Math.max(1, alt.estimatedTimeMin * speedFactor).toFixed(1));
    return {
      ...alt,
      estimatedTimeMin: adjustedTime,
      travelMode,
      liveTrafficAvailable: false,
      trafficSummary: `Offline pre-cached ${travelMode.toLowerCase().replace('_', ' ')} route (TRAFFIX region pack)`,
      steps: alt.steps.map((s) => ({
        ...s,
        durationMin: Number(Math.max(0.2, s.durationMin * speedFactor).toFixed(1)),
      })),
    };
  });

  return {
    origin: {
      ...origin,
      label: `${origin.name} (${origin.zone})`,
    },
    destination: {
      ...destination,
      label: `${destination.name} (${destination.zone})`,
    },
    travelMode,
    liveTrafficAvailable: false,
    trafficSummary: 'Offline region pack route — live traffic requires internet connectivity.',
    lastUpdated: new Date().toISOString(),
    alternatives,
    recalculatedDueToNetworkEvent: false,
    activeClosuresCount: graph.activeClosuresCount,
    activeSimulationsCount: graph.activeSimulationsCount,
    provider: getRoutingProviderMetadata(
      'SIMULATED_GRAPH',
      'Offline region pack route computed from TRAFFIX local road graph.'
    ),
  };
}

export function getOfflineRegionBundle(
  db: Database.Database,
  regionId: string
): OfflineRegionBundleDTO {
  const preset = PRESET_DEFINITIONS.find((r) => r.id === regionId);
  if (!preset) {
    throw notFound(`Offline region '${regionId}' not found`);
  }
  return buildBundleForRegion(db, toPresetDTO(preset));
}

export function getCustomOfflineRegionBundle(
  db: Database.Database,
  params: {
    name: string;
    north: number;
    south: number;
    east: number;
    west: number;
    minZoom?: number;
    maxZoom?: number;
  }
): OfflineRegionBundleDTO {
  const minZoom = params.minZoom ?? 12;
  const maxZoom = params.maxZoom ?? 14;
  const bounds: OfflineRegionBounds = {
    north: Math.max(params.north, params.south),
    south: Math.min(params.north, params.south),
    east: Math.max(params.east, params.west),
    west: Math.min(params.east, params.west),
  };
  const tiles = enumerateRegionTiles(bounds, minZoom, maxZoom, 160);
  const customId = `custom-${bounds.south.toFixed(3)}-${bounds.west.toFixed(3)}`;
  const region: OfflineRegionPresetDTO = {
    id: customId,
    name: params.name,
    subtitle: `Custom area (${bounds.south.toFixed(3)}°, ${bounds.west.toFixed(3)}° to ${bounds.north.toFixed(3)}°, ${bounds.east.toFixed(3)}°)`,
    bounds,
    center: {
      lat: Number(((bounds.north + bounds.south) / 2).toFixed(5)),
      lng: Number(((bounds.east + bounds.west) / 2).toFixed(5)),
    },
    minZoom,
    maxZoom,
    estimatedTiles: tiles.length,
    estimatedSizeKb: Math.max(32, tiles.length * 14 + 24),
  };
  return buildBundleForRegion(db, region);
}

function buildBundleForRegion(
  db: Database.Database,
  region: OfflineRegionPresetDTO
): OfflineRegionBundleDTO {
  const graph = buildEffectiveGraph(db);
  const allNodes = Array.from(graph.nodes.values());
  const padDeg = 0.006;

  const nodesInRegion = allNodes.filter((n) =>
    isPointInBounds(n.latitude, n.longitude, region.bounds, padDeg)
  );
  const nodeIds = new Set(nodesInRegion.map((n) => n.id));

  // Include segments touching at least one node in the region so connectivity stays intact
  const segmentsInRegion = graph.segments.filter(
    (seg) => nodeIds.has(seg.startNodeId) || nodeIds.has(seg.endNodeId)
  );
  const connectedNodeIds = new Set<string>(nodeIds);
  for (const seg of segmentsInRegion) {
    connectedNodeIds.add(seg.startNodeId);
    connectedNodeIds.add(seg.endNodeId);
  }
  const finalNodes = allNodes.filter((n) => connectedNodeIds.has(n.id));

  const parkingLocations = listParkingLocations(db).filter((p) =>
    isPointInBounds(p.latitude, p.longitude, region.bounds, padDeg)
  );
  const busStops = listBusStops(db).filter((s) =>
    isPointInBounds(s.latitude, s.longitude, region.bounds, padDeg)
  );

  // Pre-cache up to 4 hub-to-hub routes across DRIVE and WALK modes inside the region
  const precomputedRoutes: OfflinePrecomputedRouteDTO[] = [];
  const junctions = nodesInRegion.filter((n) => n.isJunction);
  const hubs = (junctions.length >= 2 ? junctions : nodesInRegion).slice(0, 4);

  for (let i = 0; i < hubs.length - 1; i++) {
    const o = hubs[i];
    const d = hubs[i + 1];
    if (!o || !d || o.id === d.id) continue;
    for (const mode of ['DRIVE', 'WALK'] as TravelMode[]) {
      const result = buildRouteForMode(graph, o, d, mode);
      if (result) {
        precomputedRoutes.push({
          cacheKey: `${mode}|${o.latitude.toFixed(4)},${o.longitude.toFixed(4)}->${d.latitude.toFixed(4)},${d.longitude.toFixed(4)}`,
          originLabel: `${o.name} (${o.zone})`,
          destinationLabel: `${d.name} (${d.zone})`,
          originLat: o.latitude,
          originLng: o.longitude,
          destinationLat: d.latitude,
          destinationLng: d.longitude,
          travelMode: mode,
          result,
        });
      }
    }
  }

  const now = Date.now();
  return {
    region,
    nodes: finalNodes,
    segments: segmentsInRegion,
    parkingLocations,
    busStops,
    precomputedRoutes,
    downloadedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
}
