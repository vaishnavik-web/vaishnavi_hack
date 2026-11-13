import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  APILoadingStatus,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  useMap,
} from '@vis.gl/react-google-maps';
import { AlertCircle, Flame, Network, SlidersHorizontal } from 'lucide-react';
import { useMapsStatus } from '../context/MapsContext';
import { useTheme } from '../context/ThemeContext';
import {
  BusStopDTO,
  IncidentDTO,
  JunctionDTO,
  NearbyHospitalDTO,
  ParkingLocationDTO,
  RoadNodeDTO,
  RoadSegmentDTO,
  TrafficPredictionDTO,
  TransitJourneyLegDTO,
} from '../shared/types';
import {
  countMatchingSegments,
  DEFAULT_HEATMAP_CONFIG,
  HEATMAP_GRADIENT_PRESETS,
  HeatmapConfig,
  loadHeatmapConfig,
  saveHeatmapConfig,
} from '../utils/heatmapUtils';
import { CongestionHeatmapOverlay } from './CongestionHeatmapOverlay';
import { D3RoadGraphOverlay, GraphPopupTarget } from './D3RoadGraphOverlay';
import { HeatmapSettingsPanel } from './HeatmapSettingsPanel';

export interface OverlayRoute {
  id: string;
  label: string;
  geometry: Array<[number, number]>;
  color: string;
  dashed?: boolean;
  weight?: number;
  trafficStatus?: string;
}

export interface MapEndpointMarker {
  lat: number;
  lng: number;
  label: string;
}

interface TrafficMapProps {
  nodes: RoadNodeDTO[];
  segments: RoadSegmentDTO[];
  incidents?: IncidentDTO[];
  junctions?: JunctionDTO[];
  predictions?: TrafficPredictionDTO[];
  predictionMode?: boolean;
  routes?: OverlayRoute[];
  parkingLocations?: ParkingLocationDTO[];
  selectedParkingId?: string | null;
  busStops?: BusStopDTO[];
  selectedBusStopId?: string | null;
  hospitals?: NearbyHospitalDTO[];
  selectedHospitalId?: string | null;
  transitLegs?: TransitJourneyLegDTO[];
  startPoint?: MapEndpointMarker | null;
  endPoint?: MapEndpointMarker | null;
  selectedPin?: { lat: number; lng: number } | null;
  highlightNodeIds?: string[];
  activeRouteSegmentIds?: string[];
  selectedSegmentId?: string;
  pickMode?: 'origin' | 'destination' | null;
  fitBoundsKey?: string | number;
  onMapClick?: (lat: number, lng: number) => void;
  onNodeSelect?: (node: RoadNodeDTO) => void;
  onSegmentSelect?: (
    segment: RoadSegmentDTO,
    latLng?: { lat: number; lng: number }
  ) => void;
  onRouteSelect?: (routeId: string) => void;
  onIncidentSelect?: (incident: IncidentDTO) => void;
  onParkingSelect?: (parking: ParkingLocationDTO) => void;
  onBusStopSelect?: (stop: BusStopDTO) => void;
  onHospitalSelect?: (hospital: NearbyHospitalDTO) => void;
  showHeatmapDefault?: boolean;
  showRoadOverlay?: boolean;
  heightClass?: string;
}

export function getIncidentMarkerColor(inc: IncidentDTO): string {
  if (inc.status === 'RESOLVED') return '#22C55E';
  if (inc.type === 'WRONG_WAY_DRIVING' || inc.severity === 'CRITICAL') return '#EF4444';
  if (inc.type === 'ILLEGAL_PARKING' || inc.type === 'NO_PARKING_ZONE') return '#F97316';
  if (inc.type === 'ROAD_OBSTRUCTION' || inc.type === 'BLOCKING_ROAD') return '#EAB308';
  if (inc.status === 'VERIFIED') return '#EF4444';
  return '#F59E0B';
}

export function getParkingMarkerColor(p: ParkingLocationDTO): string {
  if (p.status === 'TEMPORARILY_CLOSED') return '#64748B';
  if (p.status === 'FULL' || p.availableSlots <= 0) return '#EF4444';
  if (p.status === 'LIMITED') return '#F97316';
  return '#22C55E';
}

function getSegmentColor(
  seg: RoadSegmentDTO,
  pred?: TrafficPredictionDTO,
  predictionMode?: boolean
): string {
  if (seg.effectiveClosureStatus === 'CLOSED') return '#6B7280';
  if (seg.effectiveClosureStatus === 'LANE_RESTRICTED') return '#F97316';

  const density = predictionMode && pred ? pred.predictedDensity : seg.currentCongestion;
  if (density >= 0.78) return '#EF4444';
  if (density >= 0.58) return '#F97316';
  if (density >= 0.35) return '#EAB308';
  return '#22C55E';
}

function getTrafficLabel(
  seg: RoadSegmentDTO,
  pred?: TrafficPredictionDTO,
  predictionMode?: boolean
): string {
  if (seg.effectiveClosureStatus === 'CLOSED') return 'CLOSED ROAD';
  if (seg.effectiveClosureStatus === 'LANE_RESTRICTED') return 'LANE RESTRICTED (HEAVY)';
  const density = predictionMode && pred ? pred.predictedDensity : seg.currentCongestion;
  if (density >= 0.78) return 'SEVERE TRAFFIC';
  if (density >= 0.58) return 'HEAVY TRAFFIC';
  if (density >= 0.35) return 'MODERATE TRAFFIC';
  return 'LOW TRAFFIC';
}

function MapPolylinesManager({
  mapId,
  segments,
  predictions,
  predictionMode,
  routes,
  transitLegs,
  showGraphLayer,
  showRoadOverlay,
  onSegmentSelect,
  onRouteSelect,
  onOpenPopup,
}: {
  mapId: string;
  segments: RoadSegmentDTO[];
  predictions: TrafficPredictionDTO[];
  predictionMode: boolean;
  routes: OverlayRoute[];
  transitLegs: TransitJourneyLegDTO[];
  showGraphLayer: boolean;
  showRoadOverlay: boolean;
  onSegmentSelect?: (segment: RoadSegmentDTO, latLng?: { lat: number; lng: number }) => void;
  onRouteSelect?: (routeId: string) => void;
  onOpenPopup: (popup: GraphPopupTarget) => void;
}) {
  const map = useMap(mapId);
  const onSegmentSelectRef = useRef(onSegmentSelect);
  onSegmentSelectRef.current = onSegmentSelect;
  const onRouteSelectRef = useRef(onRouteSelect);
  onRouteSelectRef.current = onRouteSelect;
  const onOpenPopupRef = useRef(onOpenPopup);
  onOpenPopupRef.current = onOpenPopup;

  useEffect(() => {
    if (!map) return;

    const polylines: google.maps.Polyline[] = [];
    const predBySegment = new globalThis.Map(predictions.map((p) => [p.segmentId, p]));

    if (showRoadOverlay && !showGraphLayer) {
      for (const seg of segments) {
        if (!seg.geometry || seg.geometry.length < 2) continue;
        const pred = predBySegment.get(seg.id);
        const color = getSegmentColor(seg, pred, predictionMode);
        const isClosed = seg.effectiveClosureStatus === 'CLOSED';
        const isRestricted = seg.effectiveClosureStatus === 'LANE_RESTRICTED';
        const isDashed = isClosed || isRestricted;
        const path = seg.geometry.map(([lat, lng]) => ({ lat, lng }));

        const line = new google.maps.Polyline({
          map,
          path,
          geodesic: true,
          strokeColor: color,
          strokeWeight: routes.length > 0 ? 4 : 6,
          strokeOpacity: isDashed ? 0 : routes.length > 0 ? 0.5 : 0.88,
          zIndex: 10,
          icons: isDashed
            ? [
                {
                  icon: {
                    path: 'M 0,-1 0,1',
                    strokeOpacity: 0.92,
                    strokeColor: color,
                    scale: routes.length > 0 ? 2.5 : 3.2,
                  },
                  offset: '0',
                  repeat: isClosed ? '12px' : '16px',
                },
              ]
            : undefined,
        });

        const statusText = getTrafficLabel(seg, pred, predictionMode);
        line.addListener('click', (e: google.maps.MapMouseEvent) => {
          const latLng = e.latLng
            ? { lat: e.latLng.lat(), lng: e.latLng.lng() }
            : path[Math.floor(path.length / 2)];
          const lines: GraphPopupTarget['lines'] = [
            { label: 'Condition', text: statusText },
            {
              label: 'Load',
              text: `${Math.round(seg.currentCongestion * 100)}% · Limit ${seg.speedLimitKmh} km/h`,
            },
          ];
          if (pred) {
            lines.push({
              label: `Forecast (+${pred.horizonMinutes}m)`,
              text: `${Math.round(pred.predictedDensity * 100)}% load · Risk ${pred.riskScore}/100`,
              tone: 'cyan',
            });
          }
          lines.push({
            text: `SIMULATED TRAFFIC DATA${seg.simulatedBlocked ? ' · ACTIVE SIMULATION' : ''}`,
            tone: 'cyan',
          });
          onOpenPopupRef.current({
            position: latLng,
            title: seg.name,
            lines,
          });
          if (onSegmentSelectRef.current) {
            onSegmentSelectRef.current(seg, latLng);
          }
        });

        polylines.push(line);
      }
    }

    const sortedRoutes = [...routes].sort((a, b) => (a.weight || 4) - (b.weight || 4));
    for (let idx = 0; idx < sortedRoutes.length; idx++) {
      const rt = sortedRoutes[idx];
      if (!rt.geometry || rt.geometry.length < 2) continue;
      const path = rt.geometry.map(([lat, lng]) => ({ lat, lng }));
      const weight = rt.weight || 6;

      if (!rt.dashed) {
        const halo = new google.maps.Polyline({
          map,
          path,
          geodesic: true,
          strokeColor: '#0F172A',
          strokeWeight: weight + 4,
          strokeOpacity: 0.45,
          clickable: false,
          zIndex: 40 + idx,
        });
        polylines.push(halo);
      }

      const routeLine = new google.maps.Polyline({
        map,
        path,
        geodesic: true,
        strokeColor: rt.color,
        strokeWeight: weight,
        strokeOpacity: rt.dashed ? 0 : 0.96,
        zIndex: 50 + idx,
        icons: rt.dashed
          ? [
              {
                icon: {
                  path: 'M 0,-1 0,1',
                  strokeOpacity: 0.85,
                  strokeColor: rt.color,
                  scale: 2.5,
                },
                offset: '0',
                repeat: '14px',
              },
            ]
          : undefined,
      });

      routeLine.addListener('click', (e: google.maps.MapMouseEvent) => {
        const pos = e.latLng
          ? { lat: e.latLng.lat(), lng: e.latLng.lng() }
          : path[Math.floor(path.length / 2)];
        const lines: GraphPopupTarget['lines'] = [];
        if (rt.trafficStatus) {
          lines.push({ label: 'Traffic Status', text: rt.trafficStatus });
        }
        lines.push({ text: 'SIMULATED TRAFFIC DATA', tone: 'cyan' });
        onOpenPopupRef.current({
          position: pos,
          title: rt.label,
          lines,
        });
        if (onRouteSelectRef.current) {
          onRouteSelectRef.current(rt.id);
        }
      });

      polylines.push(routeLine);
    }

    // Transit Journey Legs
    for (let idx = 0; idx < transitLegs.length; idx++) {
      const leg = transitLegs[idx];
      if (!leg.geometry || leg.geometry.length < 2) continue;
      const path = leg.geometry.map(([lat, lng]) => ({ lat, lng }));
      const isWalk = leg.mode === 'WALK';
      const line = new google.maps.Polyline({
        map,
        path,
        geodesic: true,
        strokeColor: isWalk ? '#94A3B8' : '#0EA5E9',
        strokeWeight: isWalk ? 4 : 6,
        strokeOpacity: isWalk ? 0 : 0.95,
        zIndex: 65 + idx,
        icons: isWalk
          ? [
              {
                icon: {
                  path: 'M 0,-1 0,1',
                  strokeOpacity: 0.9,
                  strokeColor: '#94A3B8',
                  scale: 2.3,
                },
                offset: '0',
                repeat: '12px',
              },
            ]
          : undefined,
      });
      polylines.push(line);
    }

    return () => {
      for (const p of polylines) {
        google.maps.event.clearInstanceListeners(p);
        p.setMap(null);
      }
    };
  }, [map, segments, predictions, predictionMode, routes, transitLegs, showGraphLayer, showRoadOverlay]);

  return null;
}

function FitBoundsController({
  mapId,
  fitBoundsKey,
  routes,
  transitLegs,
  hospitals = [],
  startPoint,
  endPoint,
}: {
  mapId: string;
  fitBoundsKey?: string | number;
  routes: OverlayRoute[];
  transitLegs: TransitJourneyLegDTO[];
  hospitals?: NearbyHospitalDTO[];
  startPoint: MapEndpointMarker | null;
  endPoint: MapEndpointMarker | null;
}) {
  const map = useMap(mapId);

  useEffect(() => {
    if (!map || fitBoundsKey === undefined) return;

    const coords: Array<{ lat: number; lng: number }> = [];
    for (const rt of routes) {
      for (const [lat, lng] of rt.geometry) {
        coords.push({ lat, lng });
      }
    }
    for (const leg of transitLegs) {
      for (const [lat, lng] of leg.geometry) {
        coords.push({ lat, lng });
      }
    }
    for (const h of hospitals) {
      coords.push({ lat: h.latitude, lng: h.longitude });
    }
    if (startPoint) coords.push({ lat: startPoint.lat, lng: startPoint.lng });
    if (endPoint) coords.push({ lat: endPoint.lat, lng: endPoint.lng });

    if (coords.length >= 2) {
      const bounds = new google.maps.LatLngBounds();
      for (const c of coords) {
        bounds.extend(c);
      }
      map.fitBounds(bounds, 52);
      const listener = google.maps.event.addListenerOnce(map, 'idle', () => {
        const z = map.getZoom();
        if (z !== undefined && z > 16) {
          map.setZoom(16);
        }
      });
      return () => {
        listener.remove();
      };
    } else if (coords.length === 1) {
      map.panTo(coords[0]);
      const z = map.getZoom() ?? 13;
      if (z < 14) map.setZoom(14);
    }
  }, [map, fitBoundsKey]);

  return null;
}

export const TrafficMap: React.FC<TrafficMapProps> = ({
  nodes,
  segments,
  incidents = [],
  junctions = [],
  predictions = [],
  predictionMode = false,
  routes = [],
  parkingLocations = [],
  selectedParkingId = null,
  busStops = [],
  selectedBusStopId = null,
  hospitals = [],
  selectedHospitalId = null,
  transitLegs = [],
  startPoint = null,
  endPoint = null,
  selectedPin = null,
  highlightNodeIds = [],
  activeRouteSegmentIds = [],
  selectedSegmentId,
  pickMode = null,
  fitBoundsKey,
  onMapClick,
  onNodeSelect,
  onSegmentSelect,
  onRouteSelect,
  onIncidentSelect,
  onParkingSelect,
  onBusStopSelect,
  onHospitalSelect,
  showHeatmapDefault = true,
  showRoadOverlay = true,
  heightClass = 'h-[480px]',
}) => {
  const mapId = useId();
  const map = useMap(mapId);
  const { hasApiKey, authFailureMessage, loadingStatus } = useMapsStatus();
  const { isDark } = useTheme();

  const [showGraphLayer, setShowGraphLayer] = useState(showRoadOverlay);
  const [showHeatmap, setShowHeatmap] = useState(showHeatmapDefault);
  const [showHeatmapSettings, setShowHeatmapSettings] = useState(false);
  const [heatmapConfig, setHeatmapConfig] = useState<HeatmapConfig>(() => loadHeatmapConfig());
  const [heatmapAvailable, setHeatmapAvailable] = useState(true);
  const [heatmapUnavailableReason, setHeatmapUnavailableReason] = useState<string | null>(null);
  const [activePopup, setActivePopup] = useState<GraphPopupTarget | null>(null);

  const handleHeatmapConfigChange = (
    updater: HeatmapConfig | ((prev: HeatmapConfig) => HeatmapConfig)
  ) => {
    setHeatmapConfig((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveHeatmapConfig(next);
      return next;
    });
  };

  const handleResetHeatmapConfig = () => {
    const reset = { ...DEFAULT_HEATMAP_CONFIG };
    setHeatmapConfig(reset);
    saveHeatmapConfig(reset);
  };

  const matchingSegmentsCount = useMemo(
    () => countMatchingSegments(segments, predictions, predictionMode, heatmapConfig),
    [segments, predictions, predictionMode, heatmapConfig]
  );

  const activeGradientBarClass = useMemo(() => {
    if (heatmapConfig.gradientPreset === 'CUSTOM') {
      return 'bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-500';
    }
    return (
      HEATMAP_GRADIENT_PRESETS.find((p) => p.id === heatmapConfig.gradientPreset)?.barClass ||
      'bg-gradient-to-r from-[#22C55E] via-[#EAB308] to-[#EF4444]'
    );
  }, [heatmapConfig.gradientPreset]);

  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

  useEffect(() => {
    if (!map) return;
    map.setOptions({
      draggableCursor: pickMode ? 'crosshair' : undefined,
    });
  }, [map, pickMode]);

  const closedCount = segments.filter((s) => s.effectiveClosureStatus === 'CLOSED').length;

  const mapsUnavailable =
    !hasApiKey ||
    Boolean(authFailureMessage) ||
    loadingStatus === APILoadingStatus.AUTH_FAILURE ||
    loadingStatus === APILoadingStatus.FAILED;

  return (
    <div className="relative rounded-xl border border-slate-200 dark:border-slate-800/80 overflow-hidden bg-white dark:bg-[#0B1220] shadow-sm dark:shadow-none">
      {/* Layer Controls */}
      {!mapsUnavailable && showRoadOverlay && (
        <div className="absolute top-3 right-14 z-[510] flex flex-wrap items-center justify-end gap-2 max-w-[calc(100%-5rem)]">
          <button
            type="button"
            onClick={() => {
              if (!heatmapAvailable) return;
              setShowHeatmap((v) => !v);
            }}
            disabled={!heatmapAvailable}
            title={
              heatmapAvailable
                ? 'Toggle simulated congestion density heatmap'
                : heatmapUnavailableReason || 'WebGL2 unavailable in this browser'
            }
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 min-h-[38px] sm:min-h-[32px] py-1.5 text-[11px] font-medium shadow-lg backdrop-blur-sm transition-colors ${
              !heatmapAvailable
                ? 'border-slate-300 dark:border-slate-700/80 bg-white/90 dark:bg-[#090E1A]/85 text-slate-400 cursor-not-allowed'
                : showHeatmap
                ? 'border-orange-400/60 bg-white/95 dark:bg-[#090E1A]/90 text-orange-700 dark:text-orange-200 hover:bg-slate-50 dark:hover:bg-[#0F172A]'
                : 'border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-[#090E1A]/85 text-slate-700 dark:text-slate-300'
            }`}
          >
            <Flame
              className={`w-3.5 h-3.5 ${
                !heatmapAvailable
                  ? 'text-slate-400'
                  : showHeatmap
                  ? 'text-orange-500 dark:text-orange-400'
                  : 'text-slate-400'
              }`}
            />
            <span>Heatmap: {!heatmapAvailable ? 'N/A' : showHeatmap ? 'ON' : 'OFF'}</span>
          </button>

          {heatmapAvailable && (
            <button
              type="button"
              onClick={() => setShowHeatmapSettings((v) => !v)}
              aria-label="Configure heatmap settings"
              aria-expanded={showHeatmapSettings}
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 min-h-[38px] sm:min-h-[32px] py-1.5 text-[11px] font-medium shadow-lg backdrop-blur-sm transition-colors ${
                showHeatmapSettings
                  ? 'border-orange-400/70 bg-orange-50 dark:bg-orange-950/80 text-orange-800 dark:text-orange-100'
                  : 'border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-[#090E1A]/85 text-slate-700 dark:text-slate-300'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-orange-500 dark:text-orange-400" />
              <span className="hidden sm:inline">Settings</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowGraphLayer((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 min-h-[38px] sm:min-h-[32px] py-1.5 text-[11px] font-medium shadow-lg backdrop-blur-sm transition-colors ${
              showGraphLayer
                ? 'border-cyan-500/60 bg-white/95 dark:bg-[#090E1A]/90 text-cyan-700 dark:text-cyan-200'
                : 'border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-[#090E1A]/85 text-slate-700 dark:text-slate-300'
            }`}
          >
            <Network className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
            <span>Graph: {showGraphLayer ? 'ON' : 'OFF'}</span>
            <span className="hidden sm:inline font-mono text-[10px] text-slate-500 dark:text-slate-400 border-l border-slate-300 dark:border-slate-700 pl-1.5">
              {nodes.length}N · {segments.length}E{closedCount > 0 ? ` · ${closedCount}X` : ''}
            </span>
          </button>
        </div>
      )}

      {!mapsUnavailable && showHeatmapSettings && heatmapAvailable && (
        <HeatmapSettingsPanel
          config={heatmapConfig}
          onChange={handleHeatmapConfigChange}
          onReset={handleResetHeatmapConfig}
          onClose={() => setShowHeatmapSettings(false)}
          matchingSegmentsCount={matchingSegmentsCount}
          totalSegmentsCount={segments.length}
          heatmapEnabled={showHeatmap}
          onEnableHeatmap={() => setShowHeatmap(true)}
        />
      )}

      {pickMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[520] rounded-lg border border-blue-500/60 bg-white/95 dark:bg-[#090E1A]/95 px-3.5 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-200 shadow-lg pointer-events-none text-center max-w-[90%]">
          {pickMode === 'origin'
            ? 'Tap anywhere on Google Map to set STARTING LOCATION'
            : 'Tap anywhere on Google Map to set DESTINATION'}
        </div>
      )}

      <div className={`relative w-full ${heightClass}`}>
        {mapsUnavailable ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-slate-100 dark:bg-[#0B1220]">
            <AlertCircle className="w-8 h-8 text-amber-500 mb-3" />
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              Google Maps Platform Unavailable
            </p>
            <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 max-w-md">
              {authFailureMessage ||
                'Google Maps JavaScript API key is missing or failed authorization. TRAFFIX uses Google Maps exclusively.'}
            </p>
          </div>
        ) : (
          <>
            <GoogleMap
              id={mapId}
              mapId="DEMO_MAP_ID"
              colorScheme={isDark ? 'DARK' : 'LIGHT'}
              defaultCenter={
                startPoint
                  ? { lat: startPoint.lat, lng: startPoint.lng }
                  : hospitals.length > 0
                  ? { lat: hospitals[0].latitude, lng: hospitals[0].longitude }
                  : { lat: 15.853, lng: 74.502 }
              }
              defaultZoom={13}
              gestureHandling="greedy"
              mapTypeControl={false}
              streetViewControl={false}
              fullscreenControl={true}
              zoomControl={true}
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              onClick={(ev) => {
                setActivePopup(null);
                if (ev.detail.latLng && onMapClickRef.current) {
                  onMapClickRef.current(
                    Number(ev.detail.latLng.lat.toFixed(5)),
                    Number(ev.detail.latLng.lng.toFixed(5))
                  );
                }
              }}
              className="w-full h-full"
            >
              <FitBoundsController
                mapId={mapId}
                fitBoundsKey={fitBoundsKey}
                routes={routes}
                transitLegs={transitLegs}
                hospitals={hospitals}
                startPoint={startPoint}
                endPoint={endPoint}
              />

              {showRoadOverlay && (
                <CongestionHeatmapOverlay
                  mapId={mapId}
                  segments={segments}
                  incidents={incidents}
                  predictions={predictions}
                  predictionMode={predictionMode}
                  visible={showHeatmap}
                  config={heatmapConfig}
                  onAvailabilityChange={(available, reason) => {
                    setHeatmapAvailable(available);
                    setHeatmapUnavailableReason(reason || null);
                  }}
                />
              )}

              <MapPolylinesManager
                mapId={mapId}
                segments={segments}
                predictions={predictions}
                predictionMode={predictionMode}
                routes={routes}
                transitLegs={transitLegs}
                showGraphLayer={showGraphLayer}
                showRoadOverlay={showRoadOverlay}
                onSegmentSelect={onSegmentSelect}
                onRouteSelect={onRouteSelect}
                onOpenPopup={setActivePopup}
              />

              {showRoadOverlay &&
                !showGraphLayer &&
                nodes.map((n) => {
                  const isHighlighted = highlightNodeIds.includes(n.id);
                  const size = isHighlighted ? 14 : n.isJunction ? 11 : 8;
                  const fill = isHighlighted ? '#0284C7' : n.isJunction ? '#2563EB' : '#64748B';
                  const border = isHighlighted ? '#0F172A' : '#1E293B';
                  return (
                    <AdvancedMarker
                      key={`node-${n.id}`}
                      position={{ lat: n.latitude, lng: n.longitude }}
                      title={`${n.name} (${n.externalRef})`}
                      zIndex={20}
                      onClick={() => {
                        setActivePopup({
                          position: { lat: n.latitude, lng: n.longitude },
                          title: n.name,
                          lines: [
                            { text: `Zone: ${n.zone} · Ref: ${n.externalRef}` },
                            { text: 'SIMULATED TRAFFIC DATA', tone: 'cyan' },
                          ],
                        });
                        if (onNodeSelect) onNodeSelect(n);
                      }}
                    >
                      <div
                        style={{
                          width: size,
                          height: size,
                          borderRadius: '9999px',
                          backgroundColor: fill,
                          border: `${isHighlighted ? 2.5 : 1.5}px solid ${border}`,
                          cursor: 'pointer',
                          transform: 'translate(0, 50%)',
                        }}
                      />
                    </AdvancedMarker>
                  );
                })}

              {junctions.map((j) => (
                <AdvancedMarker
                  key={`junc-${j.id}`}
                  position={{ lat: j.latitude, lng: j.longitude }}
                  title={j.name}
                  zIndex={35}
                  onClick={() =>
                    setActivePopup({
                      position: { lat: j.latitude, lng: j.longitude },
                      title: j.name,
                      lines: [
                        {
                          text: `Density: ${Math.round(j.latestDensity * 100)}% · Queue: ${
                            j.latestQueueLength
                          } veh`,
                        },
                        { text: 'SIMULATED TRAFFIC DATA', tone: 'cyan' },
                      ],
                    })
                  }
                >
                  <div
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: '9999px',
                      backgroundColor: '#06B6D4',
                      border: '2px solid #0E7490',
                      opacity: 0.85,
                      cursor: 'pointer',
                      transform: 'translate(0, 50%)',
                    }}
                  />
                </AdvancedMarker>
              ))}

              {/* Incident & Violation Markers */}
              {incidents
                .filter((inc) => inc.status !== 'REJECTED')
                .map((inc) => {
                  const incColor = getIncidentMarkerColor(inc);
                  return (
                    <AdvancedMarker
                      key={`inc-${inc.id}`}
                      position={{ lat: inc.latitude, lng: inc.longitude }}
                      title={`${inc.type} · ${inc.severity}`}
                      zIndex={60}
                      onClick={() => {
                        setActivePopup({
                          position: { lat: inc.latitude, lng: inc.longitude },
                          title: `${inc.type.replace(/_/g, ' ')} · ${inc.severity}`,
                          subtitle: inc.roadName || inc.roadSegmentName || undefined,
                          lines: [
                            { text: inc.description },
                            {
                              label: 'Reported',
                              text: new Date(inc.occurredAt || inc.createdAt).toLocaleString(),
                            },
                            {
                              label: 'Status',
                              text: `${inc.status}${inc.isExpired ? ' (EXPIRED)' : ''}${
                                inc.possibleDuplicate ? ' · Possible Duplicate' : ''
                              }`,
                            },
                            { text: `Confirmations: ${inc.stillPresentCount ?? 1}`, tone: 'cyan' },
                          ],
                        });
                        onIncidentSelect?.(inc);
                      }}
                    >
                      <div
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: '9999px',
                          backgroundColor: incColor,
                          border: '2px solid #FFFFFF',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.45)',
                          cursor: 'pointer',
                          transform: 'translate(0, 50%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#FFFFFF',
                          fontSize: '9px',
                          fontWeight: 800,
                        }}
                      >
                        !
                      </div>
                    </AdvancedMarker>
                  );
                })}

              {/* Smart Parking Markers */}
              {parkingLocations.map((p) => {
                const color = getParkingMarkerColor(p);
                const isSelected = p.id === selectedParkingId;
                return (
                  <AdvancedMarker
                    key={`park-${p.id}`}
                    position={{ lat: p.latitude, lng: p.longitude }}
                    title={`${p.parkingName} (${p.availableSlots}/${p.totalSlots})`}
                    zIndex={70}
                    onClick={() => {
                      setActivePopup({
                        position: { lat: p.latitude, lng: p.longitude },
                        title: p.parkingName,
                        subtitle: p.address,
                        lines: [
                          {
                            label: 'Availability',
                            text: `${p.availableSlots} / ${p.totalSlots} (${p.status})`,
                            tone: p.availableSlots > 0 ? 'emerald' : 'rose',
                          },
                          { label: 'Charges', text: `${p.parkingType} · ${p.priceLabel}` },
                          { text: 'SAMPLE / MANUALLY UPDATED AVAILABILITY', tone: 'cyan' },
                        ],
                      });
                      onParkingSelect?.(p);
                    }}
                  >
                    <div
                      style={{
                        backgroundColor: color,
                        color: '#FFFFFF',
                        border: isSelected ? '2.5px solid #38BDF8' : '2px solid #FFFFFF',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: '7px',
                        boxShadow: '0 3px 10px rgba(0,0,0,0.4)',
                        cursor: 'pointer',
                      }}
                    >
                      P {p.status === 'TEMPORARILY_CLOSED' ? 'X' : p.availableSlots}
                    </div>
                  </AdvancedMarker>
                );
              })}

              {/* Nearby Hospital Markers (Google Places API New) */}
              {hospitals.map((h) => {
                const isSelected = h.placeId === selectedHospitalId;
                return (
                  <AdvancedMarker
                    key={`hosp-${h.placeId}`}
                    position={{ lat: h.latitude, lng: h.longitude }}
                    title={`${h.name} (${(h.distanceMeters / 1000).toFixed(2)} km)`}
                    zIndex={85}
                    onClick={() => {
                      setActivePopup({
                        position: { lat: h.latitude, lng: h.longitude },
                        title: h.name,
                        subtitle: h.address,
                        lines: [
                          {
                            label: 'Distance',
                            text:
                              h.distanceMeters >= 1000
                                ? `${(h.distanceMeters / 1000).toFixed(2)} km`
                                : `${h.distanceMeters} m`,
                            tone: 'emerald',
                          },
                          ...(h.phone ? [{ label: 'Phone', text: h.phone }] : []),
                          ...(h.openNow !== null
                            ? [
                                {
                                  label: 'Hours',
                                  text: h.openNow ? 'Open now' : 'Currently closed',
                                  tone: (h.openNow ? 'emerald' : 'amber') as 'emerald' | 'amber',
                                },
                              ]
                            : []),
                          { text: 'GOOGLE PLACES API (NEW)', tone: 'cyan' },
                        ],
                      });
                      onHospitalSelect?.(h);
                    }}
                  >
                    <div
                      style={{
                        width: isSelected ? 30 : 26,
                        height: isSelected ? 30 : 26,
                        borderRadius: '8px',
                        backgroundColor: '#DC2626',
                        color: '#FFFFFF',
                        border: isSelected ? '2.5px solid #FDE047' : '2px solid #FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '13px',
                        fontWeight: 800,
                        boxShadow: '0 3px 10px rgba(0,0,0,0.45)',
                        cursor: 'pointer',
                      }}
                    >
                      +
                    </div>
                  </AdvancedMarker>
                );
              })}

              {/* Bus Stop Markers */}
              {busStops.map((st) => {
                const isSelected = st.id === selectedBusStopId;
                return (
                  <AdvancedMarker
                    key={`stop-${st.id}`}
                    position={{ lat: st.latitude, lng: st.longitude }}
                    title={st.stopName}
                    zIndex={72}
                    onClick={() => {
                      setActivePopup({
                        position: { lat: st.latitude, lng: st.longitude },
                        title: st.stopName,
                        subtitle: st.address,
                        lines: [
                          ...(st.landmark ? [{ label: 'Landmark', text: st.landmark }] : []),
                          {
                            label: 'Routes',
                            text: st.routes.map((r) => r.routeNumber).join(', ') || 'None',
                          },
                          { text: 'SCHEDULED SAMPLE TIMETABLE', tone: 'cyan' },
                        ],
                      });
                      onBusStopSelect?.(st);
                    }}
                  >
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '7px',
                        backgroundColor: isSelected ? '#0284C7' : '#0EA5E9',
                        color: '#FFFFFF',
                        border: isSelected ? '2.5px solid #FDE047' : '2px solid #FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        fontWeight: 800,
                        boxShadow: '0 3px 10px rgba(0,0,0,0.4)',
                        cursor: 'pointer',
                      }}
                    >
                      B
                    </div>
                  </AdvancedMarker>
                );
              })}

              {selectedPin && (
                <AdvancedMarker
                  position={{ lat: selectedPin.lat, lng: selectedPin.lng }}
                  title="Selected Report Location"
                  zIndex={80}
                >
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '9999px',
                      backgroundColor: '#2563EB',
                      border: '3px solid #FFFFFF',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                      transform: 'translate(0, 50%)',
                    }}
                  />
                </AdvancedMarker>
              )}

              {startPoint && (
                <AdvancedMarker
                  position={{ lat: startPoint.lat, lng: startPoint.lng }}
                  title={`START: ${startPoint.label}`}
                  zIndex={900}
                  onClick={() =>
                    setActivePopup({
                      position: { lat: startPoint.lat, lng: startPoint.lng },
                      title: 'START LOCATION',
                      lines: [
                        { text: startPoint.label, tone: 'emerald' },
                        { text: `${startPoint.lat.toFixed(5)}, ${startPoint.lng.toFixed(5)}` },
                      ],
                    })
                  }
                >
                  <div className="flex flex-col items-center cursor-pointer">
                    <span
                      style={{
                        background: '#16A34A',
                        color: '#FFFFFF',
                        border: '2px solid #BBF7D0',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: '6px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.45)',
                        letterSpacing: '0.04em',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      START
                    </span>
                  </div>
                </AdvancedMarker>
              )}

              {endPoint && (
                <AdvancedMarker
                  position={{ lat: endPoint.lat, lng: endPoint.lng }}
                  title={`DEST: ${endPoint.label}`}
                  zIndex={950}
                  onClick={() =>
                    setActivePopup({
                      position: { lat: endPoint.lat, lng: endPoint.lng },
                      title: 'DESTINATION',
                      lines: [
                        { text: endPoint.label, tone: 'rose' },
                        { text: `${endPoint.lat.toFixed(5)}, ${endPoint.lng.toFixed(5)}` },
                      ],
                    })
                  }
                >
                  <div className="flex flex-col items-center cursor-pointer">
                    <span
                      style={{
                        background: '#DC2626',
                        color: '#FFFFFF',
                        border: '2px solid #FECACA',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: '6px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.45)',
                        letterSpacing: '0.04em',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      DEST
                    </span>
                  </div>
                </AdvancedMarker>
              )}

              {activePopup && (
                <InfoWindow
                  position={activePopup.position}
                  onCloseClick={() => setActivePopup(null)}
                >
                  <div className="text-xs space-y-1 min-w-[190px] max-w-[260px] text-slate-800 dark:text-slate-100">
                    <div className="font-semibold text-slate-900 dark:text-white">
                      {activePopup.title}
                    </div>
                    {activePopup.subtitle && (
                      <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        {activePopup.subtitle}
                      </div>
                    )}
                    {activePopup.lines.map((line, i) => (
                      <div
                        key={i}
                        className={
                          line.tone === 'cyan'
                            ? 'text-[11px] text-cyan-600 dark:text-cyan-300 font-mono'
                            : line.tone === 'emerald'
                            ? 'text-emerald-600 dark:text-emerald-300 font-medium'
                            : line.tone === 'rose'
                            ? 'text-rose-600 dark:text-rose-300 font-medium'
                            : line.tone === 'amber'
                            ? 'text-amber-600 dark:text-amber-300'
                            : 'text-slate-700 dark:text-slate-200'
                        }
                      >
                        {line.label ? (
                          <>
                            <span className="text-slate-500 dark:text-slate-400">
                              {line.label}:{' '}
                            </span>
                            <span className="font-mono font-semibold">{line.text}</span>
                          </>
                        ) : (
                          line.text
                        )}
                      </div>
                    ))}
                  </div>
                </InfoWindow>
              )}
            </GoogleMap>

            {showRoadOverlay && (
              <D3RoadGraphOverlay
                map={map}
                nodes={nodes}
                segments={segments}
                predictions={predictions}
                predictionMode={predictionMode}
                highlightNodeIds={highlightNodeIds}
                activeRouteSegmentIds={activeRouteSegmentIds}
                selectedSegmentId={selectedSegmentId}
                visible={showGraphLayer}
                interactive={!pickMode}
                onNodeSelect={onNodeSelect}
                onSegmentSelect={onSegmentSelect}
                onOpenPopup={setActivePopup}
              />
            )}
          </>
        )}
      </div>

      {/* Footer Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-[#0C1322] px-4 py-2.5 text-[11px] text-slate-600 dark:text-slate-300">
        <div className="flex flex-wrap items-center gap-4">
          {showRoadOverlay && (
            <>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#22C55E]" /> Low traffic
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#EAB308]" /> Moderate
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#F97316]" /> Heavy
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#EF4444]" /> Severe
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#6B7280]" /> Closed
              </span>
            </>
          )}
          {incidents.length > 0 && (
            <span className="flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#EF4444]" /> Wrong-way
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#F97316]" /> Illegal parking
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#EAB308]" /> Obstruction
            </span>
          )}
          {parkingLocations.length > 0 && (
            <span className="flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded bg-[#22C55E]" /> Parking Open
              <span className="inline-block w-2.5 h-2.5 rounded bg-[#F97316]" /> Limited
              <span className="inline-block w-2.5 h-2.5 rounded bg-[#EF4444]" /> Full
            </span>
          )}
          {busStops.length > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded bg-[#0EA5E9]" /> Bus Stop
            </span>
          )}
          {hospitals.length > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="inline-flex items-center justify-center w-3 h-3 rounded bg-[#DC2626] text-white text-[9px] font-bold">
                +
              </span>{' '}
              Hospital (Google Places)
            </span>
          )}
          {!mapsUnavailable && showHeatmap && heatmapAvailable && showRoadOverlay && (
            <span className="flex items-center gap-1.5 text-orange-600 dark:text-orange-200">
              <span className={`inline-block w-8 h-2.5 rounded-sm ${activeGradientBarClass}`} />
              <span>Heatmap (Simulated)</span>
            </span>
          )}
        </div>
        <span className="font-mono text-cyan-700 dark:text-cyan-400">
          GOOGLE MAPS · {predictionMode ? 'SIMULATED TRAFFIC · FORECAST' : 'SIMULATED / SAMPLE DATA'}
        </span>
      </div>
    </div>
  );
};
