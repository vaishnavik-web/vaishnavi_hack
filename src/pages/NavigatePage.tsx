import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Bike,
  Bookmark,
  Bus,
  Car,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleParking,
  Compass,
  Crosshair,
  Flag,
  Footprints,
  Fuel,
  HardDrive,
  Hospital,
  LocateFixed,
  MapPin,
  Mic,
  MicOff,
  Navigation,
  Pause,
  Play,
  RefreshCw,
  Repeat,
  RotateCcw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Square,
  TrafficCone,
  Utensils,
  Volume2,
  VolumeX,
  Wallet,
  X,
} from 'lucide-react';
import { WorkspaceLayout } from '../components/Layout';
import { OfflineMapsModal } from '../components/OfflineMapsManager';
import { TrafficMap } from '../components/TrafficMap';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  ClientSuggestionItem,
  useGoogleMapsServices,
} from '../hooks/useGoogleMapsServices';
import { useSpeechSearch, useVoiceAssistant } from '../hooks/useVoiceAssistant';
import { incidentsApi, parkingApi, routesApi } from '../services/api';
import {
  GeocodeSuggestionDTO,
  IncidentDTO,
  LocationPointDTO,
  NearbyPlaceCategory,
  NearbyPlaceDTO,
  ParkingLocationDTO,
  RoadNodeDTO,
  RoadSegmentDTO,
  RouteAlternativeDTO,
  RouteAlternativesResultDTO,
  TravelMode,
} from '../shared/types';
import {
  formatNavigationInstruction,
  getNavigationPhrase,
  haversineDistanceMeters,
  minDistanceToRouteMeters,
  parseVoiceSearchQuery,
  VOICE_LANGUAGES,
  VoiceLanguage,
} from '../utils/voiceNavigation';
import {
  cacheRouteResult,
  computeOfflineNavigation,
  listStoredRegions,
  searchOfflineLocations,
  StoredCachedRoute,
} from '../utils/offlineMapStore';

const TRAVEL_MODES: Array<{
  mode: TravelMode;
  label: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { mode: 'DRIVE', label: 'Car', icon: Car },
  { mode: 'TWO_WHEELER', label: 'Motorcycle', icon: Bike },
  { mode: 'BICYCLE', label: 'Bicycle', icon: Bike },
  { mode: 'WALK', label: 'Walking', icon: Footprints },
  { mode: 'TRANSIT', label: 'Transit', icon: Bus },
];

const NEARBY_CATEGORIES: Array<{
  category: NearbyPlaceCategory;
  label: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { category: 'gas_station', label: 'Petrol Pumps', icon: Fuel },
  { category: 'hospital', label: 'Hospitals', icon: Hospital },
  { category: 'parking', label: 'Parking', icon: CircleParking },
  { category: 'restaurant', label: 'Restaurants', icon: Utensils },
  { category: 'bus_station', label: 'Bus Stops', icon: Bus },
  { category: 'atm', label: 'ATMs', icon: Wallet },
];

function formatTrafficBadge(level?: string) {
  switch (level) {
    case 'SEVERE':
      return 'bg-red-100 text-red-700 border-red-300 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/40';
    case 'HIGH':
      return 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-500/20 dark:text-orange-300 dark:border-orange-500/40';
    case 'MODERATE':
      return 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-500/20 dark:text-yellow-300 dark:border-yellow-500/40';
    default:
      return 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40';
  }
}

function formatArrivalClock(minutesFromNow: number): string {
  const arrival = new Date(Date.now() + Math.max(1, minutesFromNow) * 60 * 1000);
  return arrival.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDurationBadge(minutes: number): string {
  const rounded = Math.max(1, Math.round(minutes));
  if (rounded < 60) return `${rounded} min`;
  const hrs = Math.floor(rounded / 60);
  const mins = rounded % 60;
  return mins > 0 ? `${hrs} hr ${mins} min` : `${hrs} hr`;
}

function getManeuverIcon(instruction: string, maneuverHint?: string) {
  const txt = `${maneuverHint || ''} ${instruction}`.toLowerCase();
  if (txt.includes('arrive') || txt.includes('destination')) return Flag;
  if (txt.includes('transit') || txt.includes('board ')) return Bus;
  if (txt.includes('u-turn') || txt.includes('uturn') || txt.includes('roundabout'))
    return RotateCcw;
  if (txt.includes('left')) return ArrowLeft;
  if (txt.includes('right')) return ArrowRight;
  return ArrowUp;
}

export function NavigatePage() {
  const { user, socket } = useAuth();
  const { pushToast } = useToast();
  const [searchParams] = useSearchParams();
  const appliedQueryRef = useRef(false);

  const [nodes, setNodes] = useState<RoadNodeDTO[]>([]);
  const [segments, setSegments] = useState<RoadSegmentDTO[]>([]);
  const [incidents, setIncidents] = useState<IncidentDTO[]>([]);
  const [nearbyParking, setNearbyParking] = useState<ParkingLocationDTO[]>([]);

  // Location selection state
  const [startLocation, setStartLocation] = useState<LocationPointDTO | null>({
    lat: 15.8405,
    lng: 74.492,
    label: 'Tilakwadi First Gate (Tilakwadi)',
    source: 'LOCAL_NODE',
    nodeId: 'node-tilakwadi',
    externalRef: 'N04',
  });
  const [destLocation, setDestLocation] = useState<LocationPointDTO | null>({
    lat: 15.8695,
    lng: 74.5025,
    label: 'KLE Medical Corridor (North Medical)',
    source: 'LOCAL_NODE',
    nodeId: 'node-kle',
    externalRef: 'N07',
  });

  const [startInput, setStartInput] = useState('Tilakwadi First Gate (Tilakwadi)');
  const [destInput, setDestInput] = useState('KLE Medical Corridor (North Medical)');
  const [startSuggestions, setStartSuggestions] = useState<ClientSuggestionItem[]>([]);
  const [destSuggestions, setDestSuggestions] = useState<ClientSuggestionItem[]>([]);
  const [searchingStart, setSearchingStart] = useState(false);
  const [searchingDest, setSearchingDest] = useState(false);
  const [startFocused, setStartFocused] = useState(false);
  const [destFocused, setDestFocused] = useState(false);
  const [locatingGps, setLocatingGps] = useState(false);
  const [pickMode, setPickMode] = useState<'origin' | 'destination' | null>(null);

  // Travel Mode & Traffic Layers
  const [travelMode, setTravelMode] = useState<TravelMode>('DRIVE');
  const [showTrafficLayer, setShowTrafficLayer] = useState(true);
  const [showSimulatedOverlay, setShowSimulatedOverlay] = useState(false);
  const [recenterTrigger, setRecenterTrigger] = useState(0);

  // Nearby Places Explorer
  const [activeNearbyCategory, setActiveNearbyCategory] = useState<NearbyPlaceCategory | null>(
    null
  );
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyPlaceDTO[]>([]);
  const [nearbyNotice, setNearbyNotice] = useState<string | null>(null);
  const [loadingNearby, setLoadingNearby] = useState(false);
  const [selectedNearbyPlaceId, setSelectedNearbyPlaceId] = useState<string | null>(null);

  // Voice Search Confirmation Banner
  const [voiceCandidatePrompt, setVoiceCandidatePrompt] = useState<string | null>(null);

  // Live Turn-by-Turn Navigation State
  const [navState, setNavState] = useState<'idle' | 'navigating' | 'paused' | 'arrived'>('idle');
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [userGpsPos, setUserGpsPos] = useState<{
    lat: number;
    lng: number;
    heading?: number | null;
  } | null>(null);
  const [followUserLocation, setFollowUserLocation] = useState(true);
  const [gpsNavError, setGpsNavError] = useState<string | null>(null);
  const lastRerouteAtRef = useRef<number>(0);
  const watchIdRef = useRef<number | null>(null);
  const spokenStepIdxRef = useRef<number>(-1);

  const {
    language: voiceLang,
    setLanguage: setVoiceLang,
    muted: voiceMuted,
    setMuted: setVoiceMuted,
    voiceNotice,
    speak,
    repeatLast,
    stop: stopVoice,
    resetDedupe,
  } = useVoiceAssistant('en');

  const activeBcp47 =
    VOICE_LANGUAGES.find((v) => v.code === voiceLang)?.bcp47 || 'en-IN';
  const {
    supported: speechSearchSupported,
    listening: listeningVoiceSearch,
    speechError: voiceSearchError,
    startListening: startVoiceSearch,
    stopListening: stopVoiceSearch,
  } = useSpeechSearch(activeBcp47);

  const { isSdkReady, fetchPlaceSuggestions, resolvePlaceSuggestion } =
    useGoogleMapsServices();

  const lastStartQueryRef = useRef<string>('');
  const lastDestQueryRef = useRef<string>('');

  const [routeResult, setRouteResult] = useState<RouteAlternativesResultDTO | null>(null);
  const [selectedCategory, setSelectedCategory] =
    useState<RouteAlternativeDTO['category']>('RECOMMENDED');
  const [fitBoundsKey, setFitBoundsKey] = useState(0);
  const [savedRoutes, setSavedRoutes] = useState<Array<any>>([]);
  const [saveLabel, setSaveLabel] = useState('');

  // Advanced Multi-Factor section collapsed by default for clean Google Maps feel
  const [showAdvancedPanel, setShowAdvancedPanel] = useState(false);
  const [showAllSteps, setShowAllSteps] = useState(false);

  // Configurable multi-factor weights
  const [distanceWeight, setDistanceWeight] = useState(0.18);
  const [timeWeight, setTimeWeight] = useState(0.32);
  const [congestionWeight, setCongestionWeight] = useState(0.22);
  const [incidentWeight, setIncidentWeight] = useState(0.16);

  const [loadingNetwork, setLoadingNetwork] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Offline Maps & IndexedDB Cache state
  const [offlineModalOpen, setOfflineModalOpen] = useState(false);
  const [offlineMapPreview, setOfflineMapPreview] = useState(false);
  const [savedOfflineCount, setSavedOfflineCount] = useState(0);

  useEffect(() => {
    const syncOfflineCount = () => {
      listStoredRegions()
        .then((regs) => setSavedOfflineCount(regs.length))
        .catch(() => setSavedOfflineCount(0));
    };
    syncOfflineCount();
    window.addEventListener('traffix-offline-updated', syncOfflineCount);
    return () => window.removeEventListener('traffix-offline-updated', syncOfflineCount);
  }, []);

  const loadNetworkAndIncidents = useCallback(async () => {
    try {
      const [net, incs] = await Promise.all([
        routesApi.getNetwork(),
        incidentsApi.list({ excludeExpired: true }),
      ]);
      setNodes(net.nodes);
      setSegments(net.segments);
      setIncidents(incs.filter((i) => !['RESOLVED', 'REJECTED'].includes(i.status)));
    } catch (err: any) {
      try {
        const storedRegs = await listStoredRegions();
        if (storedRegs.length > 0) {
          const nMap = new Map<string, RoadNodeDTO>();
          const sMap = new Map<string, RoadSegmentDTO>();
          for (const reg of storedRegs) {
            for (const n of reg.nodes) nMap.set(n.id, n);
            for (const s of reg.segments) sMap.set(s.id, s);
          }
          setNodes(Array.from(nMap.values()));
          setSegments(Array.from(sMap.values()));
          setIncidents([]);
          setError(null);
          return;
        }
      } catch {
        // ignore IndexedDB fallback error
      }
      setError(err.message || 'Failed to load road network');
    } finally {
      setLoadingNetwork(false);
    }
  }, []);

  useEffect(() => {
    if (!destLocation) {
      setNearbyParking([]);
      return;
    }
    parkingApi
      .getNearby(destLocation.lat, destLocation.lng, 4)
      .then(setNearbyParking)
      .catch(() => setNearbyParking([]));
  }, [destLocation]);

  const calculate = useCallback(
    async (
      origin: LocationPointDTO | null = startLocation,
      dest: LocationPointDTO | null = destLocation,
      modeOverride?: TravelMode
    ): Promise<RouteAlternativesResultDTO | null> => {
      const activeMode = modeOverride ?? travelMode;
      if (!origin || !dest) {
        setError('Please enter both a starting location and a destination.');
        return null;
      }
      if (
        Math.abs(origin.lat - dest.lat) < 0.0001 &&
        Math.abs(origin.lng - dest.lng) < 0.0001
      ) {
        setError('Starting location and destination cannot be the same point.');
        return null;
      }

      setCalculating(true);
      setError(null);

      const applyOfflineFallback = async (reason?: string) => {
        const offlineRes = await computeOfflineNavigation(origin, dest, activeMode);
        if (offlineRes.result) {
          setRouteResult(offlineRes.result);
          setSelectedCategory(
            offlineRes.result.alternatives.find((a) => a.isRecommended)?.category ||
              offlineRes.result.alternatives[0]?.category ||
              'RECOMMENDED'
          );
          setFitBoundsKey((k) => k + 1);
          pushToast({
            variant: 'info',
            title:
              offlineRes.source === 'CACHED_ROUTE'
                ? 'Offline Cached Route Loaded'
                : 'Offline Region Navigation',
            message:
              offlineRes.source === 'CACHED_ROUTE'
                ? 'Loaded saved route from IndexedDB cache.'
                : 'Calculated route using downloaded offline road network in IndexedDB.',
          });
          return offlineRes.result;
        }
        setRouteResult(null);
        setError(offlineRes.message || reason || 'Offline route unavailable for this selection.');
        return null;
      };

      try {
        if (!navigator.onLine) {
          return await applyOfflineFallback();
        }

        const res = await routesApi.getAlternatives({
          originLat: origin.lat,
          originLng: origin.lng,
          originLabel: origin.label,
          originNodeId: origin.nodeId,
          destinationLat: dest.lat,
          destinationLng: dest.lng,
          destinationLabel: dest.label,
          destinationNodeId: dest.nodeId,
          travelMode: activeMode,
          distanceWeight,
          timeWeight,
          congestionWeight,
          incidentWeight,
        });

        setRouteResult(res);
        setSelectedCategory(
          res.alternatives.find((a) => a.isRecommended)?.category ||
            res.alternatives[0]?.category ||
            'RECOMMENDED'
        );
        setFitBoundsKey((k) => k + 1);
        void cacheRouteResult(origin, dest, activeMode, res);
        return res;
      } catch (err: any) {
        const isNetworkIssue = !navigator.onLine || (!err?.response && !err?.status);
        if (isNetworkIssue) {
          return await applyOfflineFallback(err?.message);
        }
        setRouteResult(null);
        setError(err.message || 'Unable to compute route options for this travel mode');
        return null;
      } finally {
        setCalculating(false);
      }
    },
    [
      startLocation,
      destLocation,
      travelMode,
      distanceWeight,
      timeWeight,
      congestionWeight,
      incidentWeight,
      pushToast,
    ]
  );

  useEffect(() => {
    loadNetworkAndIncidents();
  }, [loadNetworkAndIncidents]);

  useEffect(() => {
    if (nodes.length === 0) return;

    const qDestLat = searchParams.get('destLat');
    const qDestLng = searchParams.get('destLng');
    const qDestLabel = searchParams.get('destLabel');

    if (!appliedQueryRef.current && qDestLat && qDestLng) {
      const lat = Number(qDestLat);
      const lng = Number(qDestLng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        appliedQueryRef.current = true;
        const dPt: LocationPointDTO = {
          lat,
          lng,
          label: qDestLabel || `Destination (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
          source: 'MAP_CLICK',
        };
        setDestLocation(dPt);
        setDestInput(dPt.label);
        if (startLocation) {
          calculate(startLocation, dPt);
        }
        return;
      }
    }

    const qOriginId = searchParams.get('originNodeId');
    const qDestId = searchParams.get('destinationNodeId');

    if (!appliedQueryRef.current && qOriginId && qDestId && qOriginId !== qDestId) {
      const oNode = nodes.find((n) => n.id === qOriginId);
      const dNode = nodes.find((n) => n.id === qDestId);
      if (oNode && dNode) {
        appliedQueryRef.current = true;
        const oPt: LocationPointDTO = {
          lat: oNode.latitude,
          lng: oNode.longitude,
          label: `${oNode.name} (${oNode.zone})`,
          source: 'LOCAL_NODE',
          nodeId: oNode.id,
          externalRef: oNode.externalRef,
        };
        const dPt: LocationPointDTO = {
          lat: dNode.latitude,
          lng: dNode.longitude,
          label: `${dNode.name} (${dNode.zone})`,
          source: 'LOCAL_NODE',
          nodeId: dNode.id,
          externalRef: dNode.externalRef,
        };
        setStartLocation(oPt);
        setDestLocation(dPt);
        setStartInput(oPt.label);
        setDestInput(dPt.label);
        calculate(oPt, dPt);
        return;
      }
    }

    if (startLocation && destLocation && !routeResult) {
      calculate(startLocation, destLocation);
    }
  }, [nodes.length, searchParams]);

  useEffect(() => {
    if (user) {
      routesApi
        .listSaved()
        .then(setSavedRoutes)
        .catch(() => setSavedRoutes([]));
    } else {
      setSavedRoutes([]);
    }
  }, [user]);

  useEffect(() => {
    if (!socket) return;
    const handleNetworkUpdate = () => {
      loadNetworkAndIncidents();
      if (startLocation && destLocation && navState === 'idle') {
        calculate(startLocation, destLocation);
      }
    };
    socket.on('incident:verified', handleNetworkUpdate);
    socket.on('incident:resolved', handleNetworkUpdate);
    socket.on('road:status-changed', handleNetworkUpdate);
    return () => {
      socket.off('incident:verified', handleNetworkUpdate);
      socket.off('incident:resolved', handleNetworkUpdate);
      socket.off('road:status-changed', handleNetworkUpdate);
    };
  }, [socket, loadNetworkAndIncidents, calculate, startLocation, destLocation, navState]);

  const searchSuggestionsForSlot = useCallback(
    async (trimmed: string, slot: 'origin' | 'destination'): Promise<ClientSuggestionItem[]> => {
      const lower = trimmed.toLowerCase();
      const localMatches: ClientSuggestionItem[] = nodes
        .filter(
          (n) =>
            n.name.toLowerCase().includes(lower) ||
            n.zone.toLowerCase().includes(lower) ||
            n.externalRef.toLowerCase().includes(lower)
        )
        .slice(0, 3)
        .map((n) => ({
          id: n.id,
          name: n.name,
          displayName: `${n.name} (${n.zone} · TRAFFIX Corridor)`,
          latitude: n.latitude,
          longitude: n.longitude,
          source: 'LOCAL_NODE' as const,
          nodeId: n.id,
          externalRef: n.externalRef,
          zone: n.zone,
        }));

      if (!navigator.onLine) {
        const offlineHits = await searchOfflineLocations(trimmed);
        return [...offlineHits, ...localMatches].slice(0, 8);
      }

      const isCoord = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.test(trimmed);
      if (isSdkReady && !isCoord) {
        const gSuggestions = await fetchPlaceSuggestions(trimmed, slot);
        if (gSuggestions && gSuggestions.length > 0) {
          return [...gSuggestions, ...localMatches].slice(0, 8);
        }
      }

      try {
        const res = await routesApi.geocode(trimmed);
        return res.results;
      } catch {
        const offlineHits = await searchOfflineLocations(trimmed);
        return [...offlineHits, ...localMatches].slice(0, 8);
      }
    },
    [nodes, isSdkReady, fetchPlaceSuggestions]
  );

  useEffect(() => {
    const trimmed = startInput.trim();
    if (!startFocused || trimmed.length < 2) return;
    if (startLocation && trimmed === startLocation.label) return;
    if (trimmed === lastStartQueryRef.current) return;
    const timer = setTimeout(async () => {
      setSearchingStart(true);
      try {
        lastStartQueryRef.current = trimmed;
        const results = await searchSuggestionsForSlot(trimmed, 'origin');
        setStartSuggestions(results);
      } catch {
        setStartSuggestions([]);
      } finally {
        setSearchingStart(false);
      }
    }, 320);
    return () => clearTimeout(timer);
  }, [startInput, startFocused, startLocation, searchSuggestionsForSlot]);

  useEffect(() => {
    const trimmed = destInput.trim();
    if (!destFocused || trimmed.length < 2) return;
    if (destLocation && trimmed === destLocation.label) return;
    if (trimmed === lastDestQueryRef.current) return;
    const timer = setTimeout(async () => {
      setSearchingDest(true);
      try {
        lastDestQueryRef.current = trimmed;
        const results = await searchSuggestionsForSlot(trimmed, 'destination');
        setDestSuggestions(results);
      } catch {
        setDestSuggestions([]);
      } finally {
        setSearchingDest(false);
      }
    }, 320);
    return () => clearTimeout(timer);
  }, [destInput, destFocused, destLocation, searchSuggestionsForSlot]);

  const handleManualSearch = async (target: 'origin' | 'destination') => {
    const query = (target === 'origin' ? startInput : destInput).trim();
    if (query.length < 2) {
      pushToast({
        variant: 'info',
        title: 'Enter a place name',
        message: 'Type at least 2 characters or pick a point on the map.',
      });
      return;
    }
    if (target === 'origin') setSearchingStart(true);
    else setSearchingDest(true);
    try {
      const results = await searchSuggestionsForSlot(query, target);
      if (target === 'origin') {
        lastStartQueryRef.current = query;
        setStartSuggestions(results);
        setStartFocused(true);
      } else {
        lastDestQueryRef.current = query;
        setDestSuggestions(results);
        setDestFocused(true);
      }
      if (results.length === 0) {
        pushToast({
          variant: 'info',
          title: 'Location Not Found',
          message: 'No places matched that query. Try a nearby landmark or tap on the map.',
        });
      }
    } catch (err: any) {
      pushToast({ variant: 'error', title: 'Search Failed', message: err.message });
    } finally {
      if (target === 'origin') setSearchingStart(false);
      else setSearchingDest(false);
    }
  };

  const selectSuggestion = async (target: 'origin' | 'destination', s: ClientSuggestionItem) => {
    let resolved: GeocodeSuggestionDTO = s;
    if (s.placePrediction) {
      const fetched = await resolvePlaceSuggestion(s, target);
      if (!fetched) {
        pushToast({
          variant: 'error',
          title: 'Place Details Unavailable',
          message: 'Could not resolve coordinates for that place. Try another suggestion.',
        });
        return;
      }
      resolved = fetched;
    }

    const pt: LocationPointDTO = {
      lat: resolved.latitude,
      lng: resolved.longitude,
      label: resolved.displayName || resolved.name,
      source: resolved.source === 'LOCAL_NODE' ? 'LOCAL_NODE' : 'GOOGLE_PLACES',
      nodeId: resolved.nodeId,
      externalRef: resolved.externalRef,
    };
    if (target === 'origin') {
      setStartLocation(pt);
      setStartInput(pt.label);
      setStartSuggestions([]);
      setStartFocused(false);
      if (destLocation) {
        calculate(pt, destLocation);
      }
    } else {
      setDestLocation(pt);
      setDestInput(pt.label);
      setDestSuggestions([]);
      setDestFocused(false);
      setVoiceCandidatePrompt(null);
      if (startLocation) {
        calculate(startLocation, pt);
      }
    }
    setError(null);
  };

  const handleUseCurrentLocation = useCallback(
    (autoCalculate = false) => {
      if (!navigator.geolocation) {
        pushToast({
          variant: 'error',
          title: 'Geolocation Unsupported',
          message: 'Your browser does not support GPS location access.',
        });
        return;
      }
      setLocatingGps(true);
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = Number(pos.coords.latitude.toFixed(6));
          const lng = Number(pos.coords.longitude.toFixed(6));
          setUserGpsPos({ lat, lng, heading: pos.coords.heading });
          setRecenterTrigger((n) => n + 1);

          let label = `Your location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
          let nodeId: string | undefined;
          try {
            const rev = await routesApi.reverseGeocode(lat, lng);
            label = `Your location · ${rev.label}`;
            nodeId = rev.nearestNodeId;
          } catch {
            // keep coordinate label
          }
          const pt: LocationPointDTO = {
            lat,
            lng,
            label,
            source: 'GEOLOCATION',
            nodeId,
          };
          setStartLocation(pt);
          setStartInput(label);
          setStartSuggestions([]);
          setLocatingGps(false);
          setError(null);
          pushToast({ variant: 'success', title: 'Current Location Set', message: label });
          if (autoCalculate && destLocation) {
            calculate(pt, destLocation);
          }
        },
        (geoErr) => {
          setLocatingGps(false);
          pushToast({
            variant: 'error',
            title: 'Location Permission Denied',
            message:
              geoErr.message ||
              'Allow location access in browser settings or pick your start point on the map.',
          });
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    },
    [destLocation, calculate, pushToast]
  );

  const handleMapClick = async (lat: number, lng: number) => {
    if (!pickMode) return;
    const mode = pickMode;
    setPickMode(null);

    let label = `Map Pin (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
    let nodeId: string | undefined;
    try {
      const rev = await routesApi.reverseGeocode(lat, lng);
      label = rev.label;
      nodeId = rev.nearestNodeId;
    } catch {
      // keep fallback label
    }

    const pt: LocationPointDTO = {
      lat,
      lng,
      label,
      source: 'MAP_CLICK',
      nodeId,
    };

    if (mode === 'origin') {
      setStartLocation(pt);
      setStartInput(label);
      setStartSuggestions([]);
      if (destLocation) calculate(pt, destLocation);
    } else {
      setDestLocation(pt);
      setDestInput(label);
      setDestSuggestions([]);
      if (startLocation) calculate(startLocation, pt);
    }
    setError(null);
  };

  const handleSwapLocations = () => {
    const prevStart = startLocation;
    const prevDest = destLocation;
    const prevStartText = startInput;
    const prevDestText = destInput;

    setStartLocation(prevDest);
    setDestLocation(prevStart);
    setStartInput(prevDestText);
    setDestInput(prevStartText);
    setStartSuggestions([]);
    setDestSuggestions([]);
    setError(null);

    if (prevDest && prevStart) {
      calculate(prevDest, prevStart);
    }
  };

  const handleSelectTravelMode = (nextMode: TravelMode) => {
    setTravelMode(nextMode);
    if (nextMode === 'WALK' || nextMode === 'BICYCLE' || nextMode === 'TRANSIT') {
      setShowTrafficLayer(false);
    } else {
      setShowTrafficLayer(true);
    }
    if (startLocation && destLocation) {
      calculate(startLocation, destLocation, nextMode);
    }
  };

  const handleToggleNearbyCategory = async (category: NearbyPlaceCategory) => {
    if (activeNearbyCategory === category) {
      setActiveNearbyCategory(null);
      setNearbyPlaces([]);
      setNearbyNotice(null);
      setSelectedNearbyPlaceId(null);
      return;
    }
    const anchor = userGpsPos || startLocation || destLocation;
    if (!anchor) {
      pushToast({
        variant: 'info',
        title: 'Location Needed',
        message: 'Set your starting location or enable GPS to search nearby places.',
      });
      return;
    }
    setActiveNearbyCategory(category);
    setLoadingNearby(true);
    setNearbyNotice(null);
    try {
      const res = await routesApi.getNearbyPlaces(anchor.lat, anchor.lng, category, 5000);
      setNearbyPlaces(res.places);
      setNearbyNotice(res.notice);
    } catch (err: any) {
      setNearbyPlaces([]);
      setNearbyNotice(err.message || 'Unable to load nearby places right now.');
    } finally {
      setLoadingNearby(false);
    }
  };

  const handleVoiceSearchTrigger = () => {
    if (listeningVoiceSearch) {
      stopVoiceSearch();
      return;
    }
    startVoiceSearch(async (transcript) => {
      const parsed = parseVoiceSearchQuery(transcript);
      if (parsed.nearbyCategory) {
        const anchor = userGpsPos || startLocation || { lat: 15.853, lng: 74.502 };
        setVoiceCandidatePrompt(
          `Voice detected: "${parsed.rawTranscript}". Showing nearby results below — tap one to set destination.`
        );
        setActiveNearbyCategory(parsed.nearbyCategory);
        setLoadingNearby(true);
        try {
          const res = await routesApi.getNearbyPlaces(
            anchor.lat,
            anchor.lng,
            parsed.nearbyCategory,
            6000
          );
          setNearbyPlaces(res.places);
          setNearbyNotice(res.notice);
        } catch {
          setNearbyPlaces([]);
        } finally {
          setLoadingNearby(false);
        }
        return;
      }

      setDestInput(parsed.cleanQuery);
      setDestLocation(null);
      setVoiceCandidatePrompt(
        `Voice heard: "${parsed.rawTranscript}". Confirm a destination suggestion below before routing.`
      );
      setSearchingDest(true);
      try {
        const suggestions = await searchSuggestionsForSlot(parsed.cleanQuery, 'destination');
        setDestSuggestions(suggestions);
        setDestFocused(true);
      } catch {
        setDestSuggestions([]);
      } finally {
        setSearchingDest(false);
      }
    });
  };

  const handleSetPlaceAsDestination = (place: NearbyPlaceDTO) => {
    const dPt: LocationPointDTO = {
      lat: place.latitude,
      lng: place.longitude,
      label: place.name,
      source: place.source === 'GOOGLE_PLACES_NEW' ? 'GOOGLE_PLACES' : 'LOCAL_NODE',
    };
    setDestLocation(dPt);
    setDestInput(place.name);
    setSelectedNearbyPlaceId(place.placeId);
    setVoiceCandidatePrompt(null);
    if (startLocation) {
      calculate(startLocation, dPt);
    }
  };

  const activeRoute =
    routeResult?.alternatives.find((a) => a.category === selectedCategory) ||
    routeResult?.alternatives[0] ||
    null;

  // Compute cleaner/faster alternative route if active route has incidents or heavy delay
  const suggestedAlternative = useMemo(() => {
    if (!routeResult || !activeRoute || routeResult.alternatives.length < 2) return null;
    const candidates = routeResult.alternatives.filter((a) => a.category !== activeRoute.category);
    const activeIssues =
      (activeRoute.relevantIncidents?.length || 0) + (activeRoute.closureWarnings?.length || 0);
    const cleaner = candidates.find(
      (c) =>
        !c.intersectsClosedRoad &&
        ((c.relevantIncidents?.length || 0) < activeIssues ||
          activeRoute.estimatedTimeMin - c.estimatedTimeMin >= 1.5)
    );
    return cleaner || null;
  }, [routeResult, activeRoute]);

  // Stop geolocation watch cleanly on unmount or stop navigation
  const stopLiveTracking = useCallback(() => {
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopLiveTracking();
      stopVoice();
    };
  }, [stopLiveTracking, stopVoice]);

  const startLiveNavigation = () => {
    if (!activeRoute || !destLocation) return;
    resetDedupe();
    spokenStepIdxRef.current = 0;
    setCurrentStepIndex(0);
    setNavState('navigating');
    setFollowUserLocation(true);
    setGpsNavError(null);

    const startMsg = getNavigationPhrase('start', voiceLang, destLocation.label);
    const firstTurn = activeRoute.importantTurns[0];
    if (firstTurn) {
      const firstLine = formatNavigationInstruction(
        firstTurn.instruction,
        firstTurn.distanceMeters,
        voiceLang,
        firstTurn.maneuver
      );
      speak(`${startMsg} ${firstLine}`, { force: true });
    } else {
      speak(startMsg, { force: true });
    }

    if (!navigator.geolocation) {
      setGpsNavError(
        'Browser geolocation is unavailable. Showing step-by-step instructions manually.'
      );
      return;
    }

    stopLiveTracking();
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserGpsPos({ lat, lng, heading: pos.coords.heading });
        setGpsNavError(null);
      },
      (geoErr) => {
        setGpsNavError(
          geoErr.message || 'Unable to track live GPS location. You can still follow written steps.'
        );
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    );
  };

  const togglePauseNavigation = () => {
    if (navState === 'navigating') {
      setNavState('paused');
      stopVoice();
    } else if (navState === 'paused') {
      setNavState('navigating');
    }
  };

  const endLiveNavigation = () => {
    stopLiveTracking();
    stopVoice();
    setNavState('idle');
    setCurrentStepIndex(0);
    setGpsNavError(null);
    setFitBoundsKey((k) => k + 1);
  };

  // Monitor GPS position during active navigation for step progression, off-route rerouting, and arrival
  useEffect(() => {
    if (navState !== 'navigating' || !userGpsPos || !activeRoute || !destLocation) return;

    const distToDest = haversineDistanceMeters(
      userGpsPos.lat,
      userGpsPos.lng,
      destLocation.lat,
      destLocation.lng
    );
    if (distToDest <= 45) {
      setNavState('arrived');
      stopLiveTracking();
      speak(getNavigationPhrase('arrived', voiceLang, destLocation.label), { force: true });
      return;
    }

    // Check step progression when approaching next turn waypoint
    const turns = activeRoute.importantTurns;
    if (currentStepIndex + 1 < turns.length) {
      const nextTurn = turns[currentStepIndex + 1];
      const distToNext = haversineDistanceMeters(
        userGpsPos.lat,
        userGpsPos.lng,
        nextTurn.latitude,
        nextTurn.longitude
      );
      if (distToNext <= 50) {
        const nextIdx = currentStepIndex + 1;
        setCurrentStepIndex(nextIdx);
        if (spokenStepIdxRef.current !== nextIdx) {
          spokenStepIdxRef.current = nextIdx;
          const localized = formatNavigationInstruction(
            nextTurn.instruction,
            nextTurn.distanceMeters,
            voiceLang,
            nextTurn.maneuver
          );
          speak(localized);
        }
      }
    }

    // Off-route detection with 14s cooldown to avoid excessive Google Routes calls
    const distFromPolyline = minDistanceToRouteMeters(
      userGpsPos.lat,
      userGpsPos.lng,
      activeRoute.geometry
    );
    const now = Date.now();
    if (distFromPolyline > 80 && now - lastRerouteAtRef.current >= 14000) {
      lastRerouteAtRef.current = now;
      speak(getNavigationPhrase('reroute', voiceLang), { force: true });
      const newOrigin: LocationPointDTO = {
        lat: Number(userGpsPos.lat.toFixed(6)),
        lng: Number(userGpsPos.lng.toFixed(6)),
        label: 'Your current location',
        source: 'GEOLOCATION',
      };
      setStartLocation(newOrigin);
      setStartInput(newOrigin.label);
      calculate(newOrigin, destLocation, travelMode).then((res) => {
        if (res && res.alternatives[0]) {
          setCurrentStepIndex(0);
          spokenStepIdxRef.current = 0;
        }
      });
    }
  }, [
    navState,
    userGpsPos,
    activeRoute,
    destLocation,
    currentStepIndex,
    voiceLang,
    travelMode,
    calculate,
    speak,
    stopLiveTracking,
  ]);

  const currentTurn = activeRoute?.importantTurns[currentStepIndex] || null;
  const localizedTurnInstruction = useMemo(() => {
    if (!currentTurn) return '';
    return formatNavigationInstruction(
      currentTurn.instruction,
      currentTurn.distanceMeters,
      voiceLang,
      currentTurn.maneuver
    );
  }, [currentTurn, voiceLang]);

  const remainingStats = useMemo(() => {
    if (!activeRoute) return { distKm: 0, timeMin: 0 };
    if (userGpsPos && destLocation && navState !== 'idle') {
      const straightKm =
        haversineDistanceMeters(
          userGpsPos.lat,
          userGpsPos.lng,
          destLocation.lat,
          destLocation.lng
        ) / 1000;
      const ratio =
        activeRoute.totalDistanceKm > 0
          ? Math.min(1, Math.max(0.05, straightKm / activeRoute.totalDistanceKm))
          : 1;
      return {
        distKm: Number((activeRoute.totalDistanceKm * ratio).toFixed(1)),
        timeMin: Math.max(1, Math.round(activeRoute.estimatedTimeMin * ratio)),
      };
    }
    return {
      distKm: activeRoute.totalDistanceKm,
      timeMin: Math.max(1, Math.round(activeRoute.estimatedTimeMin)),
    };
  }, [activeRoute, userGpsPos, destLocation, navState]);

  const handleSaveRoute = async () => {
    if (!user) {
      pushToast({ variant: 'info', title: 'Sign In Required', message: 'Sign in to save routes.' });
      return;
    }
    if (!activeRoute || !startLocation || !destLocation) return;
    try {
      const label =
        saveLabel.trim() || `${startLocation.label.split(',')[0]} → ${destLocation.label.split(',')[0]}`;
      await routesApi.saveRoute({
        label,
        originNodeId: startLocation.nodeId,
        destinationNodeId: destLocation.nodeId,
        originLat: startLocation.lat,
        originLng: startLocation.lng,
        destinationLat: destLocation.lat,
        destinationLng: destLocation.lng,
        routeType: activeRoute.category,
        summary: {
          distanceKm: activeRoute.totalDistanceKm,
          etaMin: activeRoute.estimatedTimeMin,
          originLat: startLocation.lat,
          originLng: startLocation.lng,
          originLabel: startLocation.label,
          destinationLat: destLocation.lat,
          destinationLng: destLocation.lng,
          destinationLabel: destLocation.label,
        },
      });
      setSaveLabel('');
      const updated = await routesApi.listSaved();
      setSavedRoutes(updated);
      pushToast({ variant: 'success', title: 'Route Saved', message: label });
    } catch (err: any) {
      pushToast({ variant: 'error', title: 'Save Failed', message: err.message });
    }
  };

  const mapOverlays = (routeResult?.alternatives || []).map((alt) => ({
    id: alt.category,
    label: `${alt.routeName || alt.category} (${Math.round(alt.estimatedTimeMin)} min · ${alt.totalDistanceKm} km)`,
    geometry: alt.geometry,
    color:
      alt.category === selectedCategory
        ? '#2563EB'
        : alt.intersectsClosedRoad
        ? '#EF4444'
        : '#64748B',
    dashed: alt.category !== selectedCategory,
    weight: alt.category === selectedCategory ? 7 : 4,
    trafficStatus: alt.trafficSummary || alt.trafficLevel || 'ESTIMATED',
    liveTraffic: Boolean(alt.liveTrafficAvailable),
    speedReadingIntervals:
      alt.category === selectedCategory ? alt.speedReadingIntervals : undefined,
  }));

  const localQuickSuggestions: GeocodeSuggestionDTO[] = nodes.slice(0, 5).map((n) => ({
    id: n.id,
    name: n.name,
    displayName: `${n.name} (${n.zone} · TRAFFIX Corridor)`,
    latitude: n.latitude,
    longitude: n.longitude,
    source: 'LOCAL_NODE',
    nodeId: n.id,
    externalRef: n.externalRef,
    zone: n.zone,
  }));

  const isLiveNavigating = navState !== 'idle';

  return (
    <WorkspaceLayout
      title="Smart Navigation"
      breadcrumb="Maps & Directions"
      actions={
        !isLiveNavigating && (
          <button
            type="button"
            onClick={() => {
              loadNetworkAndIncidents();
              if (startLocation && destLocation) {
                calculate(startLocation, destLocation);
              }
            }}
            disabled={calculating}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1424] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${calculating ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        )
      }
    >
      <div className="space-y-4">
        {/* Top Clean Google Maps-Style Search Bar (Hidden during active live turn-by-turn navigation so map fills screen) */}
        {!isLiveNavigating && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-3.5 sm:p-4 shadow-sm space-y-3">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-start">
              {/* Start Location Input */}
              <div className="relative lg:col-span-5">
                <div className="flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-2.5 py-1.5 focus-within:border-emerald-500">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                  <input
                    type="text"
                    value={startInput}
                    onFocus={() => {
                      setStartFocused(true);
                      if (startSuggestions.length === 0 && startInput.trim().length < 2) {
                        setStartSuggestions(localQuickSuggestions);
                      }
                    }}
                    onBlur={() => setTimeout(() => setStartFocused(false), 180)}
                    onChange={(e) => {
                      setStartInput(e.target.value);
                      if (startLocation && e.target.value !== startLocation.label) {
                        setStartLocation(null);
                      }
                    }}
                    placeholder="Your location"
                    aria-label="Starting location"
                    className="flex-1 min-w-0 bg-transparent text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none py-1"
                  />
                  {startInput && (
                    <button
                      type="button"
                      onClick={() => {
                        setStartInput('');
                        setStartLocation(null);
                        setStartSuggestions([]);
                      }}
                      title="Clear start location"
                      className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleUseCurrentLocation(true)}
                    disabled={locatingGps}
                    title="Use current GPS location"
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25 shrink-0"
                  >
                    <LocateFixed className={`w-3.5 h-3.5 ${locatingGps ? 'animate-pulse' : ''}`} />
                    <span className="hidden sm:inline">GPS</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPickMode(pickMode === 'origin' ? null : 'origin')}
                    title="Pick start on map"
                    className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                      pickMode === 'origin'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Crosshair className="w-3.5 h-3.5" />
                  </button>
                </div>

                {startFocused && (searchingStart || startSuggestions.length > 0) && (
                  <div className="absolute left-0 right-0 z-40 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#090E1A] shadow-xl">
                    {searchingStart ? (
                      <div className="px-3 py-2.5 text-xs text-slate-500">Searching places...</div>
                    ) : (
                      startSuggestions.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectSuggestion('origin', s);
                          }}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-slate-100 dark:hover:bg-slate-800 border-b border-slate-100 dark:border-slate-800 last:border-0"
                        >
                          <div className="font-medium text-slate-900 dark:text-white truncate">
                            {s.name}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {s.displayName}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Swap Button */}
              <div className="flex justify-center lg:col-span-1">
                <button
                  type="button"
                  onClick={handleSwapLocations}
                  title="Swap starting location and destination"
                  aria-label="Swap start and destination"
                  className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <ArrowUpDown className="w-4 h-4" />
                </button>
              </div>

              {/* Destination Input + Voice Search */}
              <div className="relative lg:col-span-5">
                <div className="flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-2.5 py-1.5 focus-within:border-rose-500">
                  <MapPin className="w-4 h-4 text-rose-500 shrink-0" />
                  <input
                    type="text"
                    value={destInput}
                    onFocus={() => {
                      setDestFocused(true);
                      if (destSuggestions.length === 0 && destInput.trim().length < 2) {
                        setDestSuggestions(localQuickSuggestions);
                      }
                    }}
                    onBlur={() => setTimeout(() => setDestFocused(false), 180)}
                    onChange={(e) => {
                      setDestInput(e.target.value);
                      if (destLocation && e.target.value !== destLocation.label) {
                        setDestLocation(null);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleManualSearch('destination');
                    }}
                    placeholder="Where do you want to go?"
                    aria-label="Destination"
                    className="flex-1 min-w-0 bg-transparent text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none py-1"
                  />
                  {destInput && (
                    <button
                      type="button"
                      onClick={() => {
                        setDestInput('');
                        setDestLocation(null);
                        setDestSuggestions([]);
                        setVoiceCandidatePrompt(null);
                      }}
                      title="Clear destination"
                      className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleVoiceSearchTrigger}
                    title={
                      speechSearchSupported
                        ? listeningVoiceSearch
                          ? 'Stop voice search'
                          : 'Voice search destination'
                        : 'Voice search unsupported in this browser'
                    }
                    className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                      listeningVoiceSearch
                        ? 'bg-red-600 text-white animate-pulse'
                        : 'bg-blue-500/15 text-blue-600 dark:text-blue-400 hover:bg-blue-500/25'
                    }`}
                  >
                    {listeningVoiceSearch ? (
                      <MicOff className="w-3.5 h-3.5" />
                    ) : (
                      <Mic className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPickMode(pickMode === 'destination' ? null : 'destination')}
                    title="Pick destination on map"
                    className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                      pickMode === 'destination'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Crosshair className="w-3.5 h-3.5" />
                  </button>
                </div>

                {destFocused && (searchingDest || destSuggestions.length > 0) && (
                  <div className="absolute left-0 right-0 z-40 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#090E1A] shadow-xl">
                    {searchingDest ? (
                      <div className="px-3 py-2.5 text-xs text-slate-500">Searching places...</div>
                    ) : (
                      destSuggestions.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectSuggestion('destination', s);
                          }}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-slate-100 dark:hover:bg-slate-800 border-b border-slate-100 dark:border-slate-800 last:border-0"
                        >
                          <div className="font-medium text-slate-900 dark:text-white truncate">
                            {s.name}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {s.displayName}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Search Button */}
              <div className="lg:col-span-1">
                <button
                  type="button"
                  onClick={() => {
                    if (startLocation && destLocation) {
                      calculate(startLocation, destLocation);
                    } else if (!destLocation && destInput.trim().length >= 2) {
                      handleManualSearch('destination');
                    } else if (!startLocation && startInput.trim().length >= 2) {
                      handleManualSearch('origin');
                    } else {
                      calculate(startLocation, destLocation);
                    }
                  }}
                  disabled={calculating || loadingNetwork}
                  className="w-full h-[38px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 px-3 text-xs font-semibold text-white disabled:opacity-50 transition-colors"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span className="lg:hidden">Search Routes</span>
                </button>
              </div>
            </div>

            {/* Travel Mode Selector */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800/70">
              <div className="flex flex-wrap items-center gap-1.5">
                {TRAVEL_MODES.map((m) => {
                  const Icon = m.icon;
                  const active = travelMode === m.mode;
                  return (
                    <button
                      key={m.mode}
                      type="button"
                      onClick={() => handleSelectTravelMode(m.mode)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                        active
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{m.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Voice Language Quick Selector & Offline Maps Trigger */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <label className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <Volume2 className="w-3.5 h-3.5 text-blue-500" />
                  <span className="hidden sm:inline">Voice:</span>
                  <select
                    value={voiceLang}
                    onChange={(e) => setVoiceLang(e.target.value as VoiceLanguage)}
                    aria-label="Voice guidance language"
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-2 py-1 text-xs text-slate-800 dark:text-slate-100"
                  >
                    {VOICE_LANGUAGES.map((v) => (
                      <option key={v.code} value={v.code}>
                        {v.nativeLabel} ({v.label})
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  onClick={() => setOfflineModalOpen(true)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                    offlineMapPreview
                      ? 'border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-300'
                      : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <HardDrive className="w-3.5 h-3.5 text-blue-500" />
                  <span>
                    {savedOfflineCount > 0 ? `Offline Maps (${savedOfflineCount})` : 'Offline Maps'}
                  </span>
                </button>
              </div>
            </div>

            {voiceCandidatePrompt && (
              <div className="rounded-lg border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-950/30 px-3 py-2 text-xs text-blue-800 dark:text-blue-200 flex items-center justify-between gap-2">
                <span>{voiceCandidatePrompt}</span>
                <button
                  type="button"
                  onClick={() => setVoiceCandidatePrompt(null)}
                  className="text-blue-600 dark:text-blue-300 hover:underline shrink-0"
                >
                  Dismiss
                </button>
              </div>
            )}

            {voiceSearchError && (
              <div className="rounded-lg border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                {voiceSearchError}
              </div>
            )}
          </div>
        )}

        {/* Active Live Navigation Turn Banner */}
        {isLiveNavigating && (
          <div className="rounded-2xl bg-slate-900 dark:bg-[#061A16] border border-emerald-500/50 text-white p-4 shadow-lg space-y-2.5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                {(() => {
                  const TurnIcon =
                    navState === 'arrived'
                      ? Flag
                      : getManeuverIcon(
                          currentTurn?.instruction || '',
                          currentTurn?.maneuver
                        );
                  return (
                    <div className="w-11 h-11 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0">
                      <TurnIcon className="w-6 h-6 text-slate-950" />
                    </div>
                  );
                })()}
                <div className="min-w-0 space-y-0.5">
                  <p className="text-[11px] font-mono uppercase tracking-wider text-emerald-300">
                    {navState === 'arrived'
                      ? 'Arrived'
                      : navState === 'paused'
                      ? 'Navigation Paused'
                      : `Step ${currentStepIndex + 1} of ${
                          activeRoute?.importantTurns.length || 1
                        }`}
                  </p>
                  <h2 className="text-base sm:text-lg font-bold leading-snug">
                    {navState === 'arrived'
                      ? `You have arrived at ${destLocation?.label || 'destination'}`
                      : currentTurn?.instruction || 'Proceed along highlighted route'}
                  </h2>
                  {voiceLang !== 'en' && navState !== 'arrived' && localizedTurnInstruction && (
                    <p className="text-sm text-emerald-200">{localizedTurnInstruction}</p>
                  )}
                </div>
              </div>

              {/* Voice Controls */}
              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <select
                  value={voiceLang}
                  onChange={(e) => setVoiceLang(e.target.value as VoiceLanguage)}
                  aria-label="Voice language"
                  className="rounded-lg border border-emerald-500/40 bg-slate-800 px-2 py-1.5 text-xs text-white"
                >
                  {VOICE_LANGUAGES.map((v) => (
                    <option key={v.code} value={v.code}>
                      {v.nativeLabel}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    if (voiceMuted) {
                      setVoiceMuted(false);
                    } else {
                      setVoiceMuted(true);
                      stopVoice();
                    }
                  }}
                  title={voiceMuted ? 'Unmute voice guidance' : 'Mute voice guidance'}
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 text-xs font-medium"
                >
                  {voiceMuted ? (
                    <VolumeX className="w-4 h-4 text-rose-400" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-emerald-400" />
                  )}
                  <span className="hidden sm:inline">{voiceMuted ? 'Muted' : 'Voice On'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (localizedTurnInstruction) {
                      speak(localizedTurnInstruction, { force: true });
                    } else {
                      repeatLast();
                    }
                  }}
                  title="Repeat current instruction"
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 text-xs font-medium"
                >
                  <Repeat className="w-3.5 h-3.5 text-cyan-300" />
                  <span>Repeat</span>
                </button>
              </div>
            </div>

            {(voiceNotice || gpsNavError) && (
              <p className="text-[11px] text-amber-300 bg-amber-950/50 border border-amber-500/30 rounded-lg px-2.5 py-1.5">
                {gpsNavError || voiceNotice}
              </p>
            )}
            <p className="text-[11px] text-slate-300">
              Foreground browser navigation: keep this tab open for live GPS tracking &amp; off-route rerouting.
            </p>
          </div>
        )}

        {/* Main Split: Map First on Right/Top + Simple Route Options on Left */}
        <div
          className={`grid grid-cols-1 ${
            isLiveNavigating ? 'xl:grid-cols-1' : 'xl:grid-cols-12'
          } gap-5 items-start`}
        >
          {/* Left Panel: Traffic Summary + Route Cards (Hidden when actively navigating) */}
          {!isLiveNavigating && (
            <div className="xl:col-span-4 space-y-3 order-2 xl:order-1">
              {error && (
                <div className="rounded-xl border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-950/30 p-3.5 text-xs text-red-800 dark:text-red-200 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {calculating && (
                <div className="rounded-xl border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-950/25 p-3.5 text-xs text-blue-800 dark:text-blue-200 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Finding {travelMode.toLowerCase().replace('_', ' ')} routes...</span>
                </div>
              )}

              {/* Traffic Status Summary */}
              {routeResult && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] px-3.5 py-2.5 text-xs space-y-1 shadow-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white">
                      <TrafficCone
                        className={`w-3.5 h-3.5 ${
                          routeResult.liveTrafficAvailable
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-amber-500'
                        }`}
                      />
                      {routeResult.liveTrafficAvailable
                        ? 'Live Google Traffic'
                        : 'Estimated Travel Time'}
                    </span>
                    {routeResult.lastUpdated && (
                      <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                        Updated {new Date(routeResult.lastUpdated).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                  <p className="text-slate-700 dark:text-slate-300">
                    {routeResult.trafficSummary || routeResult.provider.notice}
                  </p>
                  {activeRoute?.betaWarning && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-300">
                      {activeRoute.betaWarning}
                    </p>
                  )}
                </div>
              )}

              {/* Route Option Cards */}
              {routeResult?.alternatives.map((alt) => {
                const isSelected = selectedCategory === alt.category;
                const verifiedCount = alt.relevantIncidents.length;
                const unverifiedCount = alt.unverifiedReports?.length || 0;
                return (
                  <div
                    key={alt.category}
                    className={`rounded-xl border transition-colors shadow-xs overflow-hidden ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/30'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedCategory(alt.category)}
                      className="w-full text-left p-3.5 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-base font-bold text-slate-900 dark:text-white tabular-nums">
                              {formatDurationBadge(alt.estimatedTimeMin)}
                            </span>
                            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                              ({alt.totalDistanceKm} km)
                            </span>
                            {alt.isRecommended && (
                              <span className="rounded bg-emerald-100 border border-emerald-300 dark:bg-emerald-500/20 dark:border-emerald-500/40 px-1.5 py-0.5 text-[10px] font-mono text-emerald-700 dark:text-emerald-300">
                                BEST
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate mt-0.5">
                            {alt.routeName || alt.category} · Arrives {formatArrivalClock(alt.estimatedTimeMin)}
                          </p>
                        </div>

                        <span
                          className={`rounded border px-1.5 py-0.5 text-[10px] font-mono shrink-0 ${formatTrafficBadge(
                            alt.trafficLevel
                          )}`}
                        >
                          {alt.trafficLevel || 'CLEAR'}
                        </span>
                      </div>

                      {/* Toll & Transit Badges */}
                      <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        {alt.tollInfo && (
                          <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-mono text-slate-700 dark:text-slate-200">
                            Toll ~ {alt.tollInfo.estimatedPriceText}
                          </span>
                        )}
                        {alt.transitSteps && alt.transitSteps.length > 0 && (
                          <span className="rounded bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-500/30 px-2 py-0.5 text-cyan-800 dark:text-cyan-200">
                            {alt.transitSteps
                              .map((t) => `${t.shortName || t.lineName}`)
                              .join(' → ')}
                          </span>
                        )}
                        {verifiedCount > 0 && (
                          <span className="text-red-600 dark:text-red-300 font-medium">
                            {verifiedCount} verified incident(s)
                          </span>
                        )}
                        {unverifiedCount > 0 && (
                          <span className="text-amber-600 dark:text-amber-300 font-medium">
                            {unverifiedCount} unverified report(s)
                          </span>
                        )}
                      </div>
                    </button>

                    {isSelected && (
                      <div className="px-3.5 pb-3.5 pt-1 flex items-center gap-2 border-t border-blue-200/70 dark:border-blue-500/20">
                        <button
                          type="button"
                          onClick={startLiveNavigation}
                          className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-3 py-2 text-xs font-bold text-white shadow-xs transition-colors"
                        >
                          <Navigation className="w-3.5 h-3.5" />
                          <span>Start Navigation</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowAllSteps((v) => !v)}
                          className="inline-flex items-center gap-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#090E1A] px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          <span>Steps ({alt.importantTurns.length})</span>
                          {showAllSteps ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Incident Warning & Clearer Route Suggestion */}
              {activeRoute &&
                (activeRoute.relevantIncidents.length > 0 ||
                  (activeRoute.unverifiedReports?.length || 0) > 0 ||
                  (activeRoute.closureWarnings?.length || 0) > 0) && (
                  <div className="rounded-xl border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-950/25 p-3.5 text-xs space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                        <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        Incidents Along This Route
                      </span>
                      {suggestedAlternative && (
                        <button
                          type="button"
                          onClick={() => setSelectedCategory(suggestedAlternative.category)}
                          className="rounded-lg bg-amber-600 hover:bg-amber-500 text-white px-2.5 py-1 text-[11px] font-semibold"
                        >
                          Switch to Clearer Route
                        </button>
                      )}
                    </div>
                    {activeRoute.relevantIncidents.map((inc) => (
                      <p key={inc.id} className="text-slate-700 dark:text-slate-300">
                        <span className="font-mono text-emerald-700 dark:text-emerald-300">
                          [VERIFIED]
                        </span>{' '}
                        {inc.type.replace(/_/g, ' ')} — {inc.description}
                      </p>
                    ))}
                    {activeRoute.unverifiedReports?.map((inc) => (
                      <p key={inc.id} className="text-slate-700 dark:text-slate-300">
                        <span className="font-mono text-amber-700 dark:text-amber-300">
                          [UNVERIFIED]
                        </span>{' '}
                        {inc.type.replace(/_/g, ' ')} — {inc.description}
                      </p>
                    ))}
                  </div>
                )}

              {/* Expandable Turn-by-Turn Steps */}
              {activeRoute && showAllSteps && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-3.5 space-y-2 shadow-xs">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
                      Turn-by-Turn Directions
                    </h3>
                    <button
                      type="button"
                      onClick={() => {
                        const first = activeRoute.importantTurns[0];
                        if (first) {
                          speak(
                            formatNavigationInstruction(
                              first.instruction,
                              first.distanceMeters,
                              voiceLang,
                              first.maneuver
                            ),
                            { force: true }
                          );
                        }
                      }}
                      className="inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      <Volume2 className="w-3 h-3" />
                      <span>Preview Voice</span>
                    </button>
                  </div>
                  <ol className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300 max-h-60 overflow-y-auto pr-1">
                    {activeRoute.importantTurns.map((t, idx) => (
                      <li key={`${t.nodeId}-${idx}`} className="flex gap-2">
                        <span className="font-mono text-slate-400 w-5 shrink-0">{idx + 1}.</span>
                        <span>
                          {voiceLang === 'en'
                            ? t.instruction
                            : `${t.instruction} — ${formatNavigationInstruction(
                                t.instruction,
                                t.distanceMeters,
                                voiceLang,
                                t.maneuver
                              )}`}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}

          {/* Right/Main Map Area (Occupies large viewport!) */}
          <div
            className={`${isLiveNavigating ? 'xl:col-span-12' : 'xl:col-span-8'} space-y-3 order-1 xl:order-2`}
          >
            {/* Quick Nearby Places Category Chips (Hidden during active live nav to keep screen super clean) */}
            {!isLiveNavigating && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {NEARBY_CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    const active = activeNearbyCategory === cat.category;
                    return (
                      <button
                        key={cat.category}
                        type="button"
                        onClick={() => handleToggleNearbyCategory(cat.category)}
                        disabled={loadingNearby}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                          active
                            ? 'border-blue-500 bg-blue-600 text-white'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0D1424] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Icon className="w-3 h-3" />
                        <span>{cat.label}</span>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => setShowSimulatedOverlay((v) => !v)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-mono transition-colors ${
                    showSimulatedOverlay
                      ? 'border-cyan-500 bg-cyan-600 text-white'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0D1424] text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <span>TRAFFIX Corridor Layer: {showSimulatedOverlay ? 'ON' : 'OFF'}</span>
                </button>
              </div>
            )}

            <TrafficMap
              nodes={nodes}
              segments={segments}
              incidents={incidents}
              parkingLocations={[]}
              nearbyPlaces={nearbyPlaces}
              selectedNearbyPlaceId={selectedNearbyPlaceId}
              onNearbyPlaceSelect={(p) => setSelectedNearbyPlaceId(p.placeId)}
              onSetDestinationFromPlace={handleSetPlaceAsDestination}
              routes={mapOverlays}
              startPoint={
                startLocation && !isLiveNavigating
                  ? { lat: startLocation.lat, lng: startLocation.lng, label: startLocation.label }
                  : null
              }
              endPoint={
                destLocation
                  ? { lat: destLocation.lat, lng: destLocation.lng, label: destLocation.label }
                  : null
              }
              userLocation={userGpsPos}
              followUserLocation={isLiveNavigating && followUserLocation}
              recenterTrigger={recenterTrigger}
              showTrafficLayer={showTrafficLayer}
              onToggleTrafficLayer={() => setShowTrafficLayer((v) => !v)}
              showNavigationControls={true}
              onMyLocationClick={() => handleUseCurrentLocation(false)}
              locatingUser={locatingGps}
              highlightNodeIds={[
                startLocation?.nodeId || '',
                destLocation?.nodeId || '',
              ].filter(Boolean)}
              activeRouteSegmentIds={activeRoute?.pathSegmentIds || []}
              pickMode={pickMode}
              fitBoundsKey={fitBoundsKey}
              onMapClick={handleMapClick}
              onRouteSelect={(id) =>
                setSelectedCategory(id as RouteAlternativeDTO['category'])
              }
              showRoadOverlay={showSimulatedOverlay}
              showHeatmapDefault={false}
              forceOfflineMap={offlineMapPreview}
              onOpenOfflineManager={() => setOfflineModalOpen(true)}
              heightClass={
                isLiveNavigating
                  ? 'h-[62vh] sm:h-[68vh] min-h-[400px]'
                  : 'h-[360px] sm:h-[520px] xl:h-[560px]'
              }
            />

            {/* Active Navigation Bottom Control Bar */}
            {isLiveNavigating && activeRoute && (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-3.5 sm:p-4 shadow-md flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {remainingStats.timeMin} min
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 font-mono">
                      {remainingStats.distKm} km · ETA {formatArrivalClock(remainingStats.timeMin)}
                    </p>
                  </div>
                  <span
                    className={`rounded-lg border px-2 py-1 text-[11px] font-mono ${formatTrafficBadge(
                      activeRoute.trafficLevel
                    )}`}
                  >
                    {activeRoute.liveTrafficAvailable ? 'LIVE TRAFFIC' : 'ESTIMATED'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (currentStepIndex + 1 < activeRoute.importantTurns.length) {
                        const nextIdx = currentStepIndex + 1;
                        setCurrentStepIndex(nextIdx);
                        const t = activeRoute.importantTurns[nextIdx];
                        speak(
                          formatNavigationInstruction(
                            t.instruction,
                            t.distanceMeters,
                            voiceLang,
                            t.maneuver
                          ),
                          { force: true }
                        );
                      }
                    }}
                    className="rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Next Step
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFollowUserLocation(true);
                      setRecenterTrigger((n) => n + 1);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Compass className="w-3.5 h-3.5 text-blue-500" />
                    <span>Recenter</span>
                  </button>
                  <button
                    type="button"
                    onClick={togglePauseNavigation}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 px-3.5 py-2 text-xs font-bold text-slate-950"
                  >
                    {navState === 'paused' ? (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        <span>Resume</span>
                      </>
                    ) : (
                      <>
                        <Pause className="w-3.5 h-3.5" />
                        <span>Pause</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={endLiveNavigation}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 hover:bg-red-500 px-3.5 py-2 text-xs font-bold text-white"
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>End</span>
                  </button>
                </div>
              </div>
            )}

            {/* Nearby Places Results Strip */}
            {!isLiveNavigating && activeNearbyCategory && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-3.5 space-y-2.5 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
                    Nearby {NEARBY_CATEGORIES.find((c) => c.category === activeNearbyCategory)?.label}
                  </h3>
                  {nearbyNotice && (
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {nearbyNotice}
                    </span>
                  )}
                </div>

                {loadingNearby ? (
                  <p className="text-xs text-slate-500">Searching nearby places...</p>
                ) : nearbyPlaces.length === 0 ? (
                  <p className="text-xs text-slate-500">No nearby places found.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-52 overflow-y-auto">
                    {nearbyPlaces.map((p) => (
                      <div
                        key={`card-${p.placeId}`}
                        className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090E1A] p-2.5 text-xs flex flex-col justify-between gap-1.5"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-1.5">
                            <span className="font-semibold text-slate-900 dark:text-white truncate">
                              {p.name}
                            </span>
                            <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 shrink-0">
                              {p.distanceMeters >= 1000
                                ? `${(p.distanceMeters / 1000).toFixed(1)} km`
                                : `${p.distanceMeters} m`}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {p.address}
                          </p>
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-1">
                          <span className="text-[10px] font-mono text-cyan-700 dark:text-cyan-400">
                            {p.source === 'GOOGLE_PLACES_NEW' ? 'GOOGLE PLACES' : 'SAMPLE'}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleSetPlaceAsDestination(p)}
                            className="rounded bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 text-[11px] font-medium"
                          >
                            Route Here
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Collapsible Advanced TRAFFIX Multi-Factor Weights, Comparison Matrix, Saved Routes & Smart Parking */}
        {!isLiveNavigating && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] shadow-xs overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAdvancedPanel((v) => !v)}
              className="w-full px-4 py-3 flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40"
            >
              <span className="inline-flex items-center gap-2">
                <SlidersHorizontal className="w-3.5 h-3.5 text-blue-500" />
                <span>
                  Advanced Route Preferences, Comparison Matrix, Saved Routes &amp; Parking
                </span>
              </span>
              {showAdvancedPanel ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>

            {showAdvancedPanel && (
              <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-5">
                {/* Multi-Factor Weights */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <label className="space-y-1">
                    <span className="flex justify-between text-slate-700 dark:text-slate-300">
                      <span>Distance Weight</span>
                      <span className="font-mono">{distanceWeight.toFixed(2)}</span>
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="0.6"
                      step="0.02"
                      value={distanceWeight}
                      onChange={(e) => setDistanceWeight(Number(e.target.value))}
                      className="w-full accent-blue-500"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="flex justify-between text-slate-700 dark:text-slate-300">
                      <span>Time Weight</span>
                      <span className="font-mono">{timeWeight.toFixed(2)}</span>
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="0.6"
                      step="0.02"
                      value={timeWeight}
                      onChange={(e) => setTimeWeight(Number(e.target.value))}
                      className="w-full accent-blue-500"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="flex justify-between text-slate-700 dark:text-slate-300">
                      <span>Congestion Weight</span>
                      <span className="font-mono">{congestionWeight.toFixed(2)}</span>
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="0.6"
                      step="0.02"
                      value={congestionWeight}
                      onChange={(e) => setCongestionWeight(Number(e.target.value))}
                      className="w-full accent-blue-500"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="flex justify-between text-slate-700 dark:text-slate-300">
                      <span>Incident Weight</span>
                      <span className="font-mono">{incidentWeight.toFixed(2)}</span>
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="0.6"
                      step="0.02"
                      value={incidentWeight}
                      onChange={(e) => setIncidentWeight(Number(e.target.value))}
                      className="w-full accent-blue-500"
                    />
                  </label>
                </div>

                {/* Comparison Matrix + Score Breakdown */}
                {routeResult && routeResult.alternatives.length > 0 && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-slate-50 dark:bg-[#090E1A] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                          <tr>
                            <th className="px-3 py-2 font-medium">Option</th>
                            <th className="px-3 py-2 font-medium text-right">Dist</th>
                            <th className="px-3 py-2 font-medium text-right">ETA</th>
                            <th className="px-3 py-2 font-medium text-right">Fuel</th>
                            <th className="px-3 py-2 font-medium text-right">Rel</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
                          {routeResult.alternatives.map((alt) => (
                            <tr
                              key={`adv-${alt.category}`}
                              onClick={() => setSelectedCategory(alt.category)}
                              className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40"
                            >
                              <td className="px-3 py-2 font-sans font-medium">{alt.category}</td>
                              <td className="px-3 py-2 text-right">{alt.totalDistanceKm} km</td>
                              <td className="px-3 py-2 text-right">{alt.estimatedTimeMin} min</td>
                              <td className="px-3 py-2 text-right">{alt.estimatedFuelLiters} L</td>
                              <td className="px-3 py-2 text-right">
                                {Math.round(alt.reliabilityScore * 100)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {activeRoute && (
                      <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 text-xs space-y-1.5">
                        <p className="font-semibold text-slate-900 dark:text-white">
                          Score Breakdown ({activeRoute.category})
                        </p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                          <span className="text-slate-500">Distance component</span>
                          <span className="font-mono text-right">
                            +{activeRoute.scoreBreakdown.distanceWeight}
                          </span>
                          <span className="text-slate-500">Time component</span>
                          <span className="font-mono text-right">
                            +{activeRoute.scoreBreakdown.timeWeight}
                          </span>
                          <span className="text-slate-500">Congestion penalty</span>
                          <span className="font-mono text-right">
                            +{activeRoute.scoreBreakdown.congestionPenalty}
                          </span>
                          <span className="text-slate-500">Composite cost</span>
                          <span className="font-mono text-right font-semibold text-cyan-600 dark:text-cyan-400">
                            {activeRoute.scoreBreakdown.totalCompositeScore}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Save Route & Saved Routes */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {user && activeRoute && (
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={saveLabel}
                        onChange={(e) => setSaveLabel(e.target.value)}
                        placeholder="Label to save favourite route..."
                        className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 text-xs text-slate-900 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={handleSaveRoute}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Bookmark className="w-3.5 h-3.5 text-blue-500" />
                        <span>Save</span>
                      </button>
                    </div>
                  )}

                  {savedRoutes.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Saved Commuter Routes
                      </p>
                      {savedRoutes.map((sr) => (
                        <div
                          key={sr.id}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              const summary = sr.summary || {};
                              if (
                                summary.originLat !== undefined &&
                                summary.originLng !== undefined &&
                                summary.destinationLat !== undefined &&
                                summary.destinationLng !== undefined
                              ) {
                                const oPt: LocationPointDTO = {
                                  lat: Number(summary.originLat),
                                  lng: Number(summary.originLng),
                                  label: String(summary.originLabel || sr.originName),
                                  source: 'LOCAL_NODE',
                                  nodeId: sr.originNodeId,
                                };
                                const dPt: LocationPointDTO = {
                                  lat: Number(summary.destinationLat),
                                  lng: Number(summary.destinationLng),
                                  label: String(summary.destinationLabel || sr.destinationName),
                                  source: 'LOCAL_NODE',
                                  nodeId: sr.destinationNodeId,
                                };
                                setStartLocation(oPt);
                                setDestLocation(dPt);
                                setStartInput(oPt.label);
                                setDestInput(dPt.label);
                                calculate(oPt, dPt);
                              }
                            }}
                            className="text-blue-600 dark:text-blue-300 hover:underline truncate"
                          >
                            {sr.label} ({sr.routeType})
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await routesApi.deleteSaved(sr.id);
                              setSavedRoutes(await routesApi.listSaved());
                            }}
                            className="text-slate-500 hover:text-red-500"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recommended Sample Parking Near Destination */}
                {destLocation && nearbyParking.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <CircleParking className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Recommended Smart Parking Near Destination</span>
                      </h4>
                      <span className="font-mono text-[10px] text-amber-700 dark:text-amber-300">
                        SAMPLE AVAILABILITY
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {nearbyParking.map((p) => (
                        <div
                          key={p.id}
                          className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090E1A] p-2.5 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 dark:text-white truncate">
                              {p.parkingName}
                            </p>
                            <p className="text-[11px] text-slate-500 truncate">
                              {p.availableSlots}/{p.totalSlots} free · {p.priceLabel}
                            </p>
                          </div>
                          <Link
                            to={`/parking?selected=${p.id}`}
                            className="rounded border border-slate-300 dark:border-slate-700 px-2 py-1 text-[11px] shrink-0 hover:bg-slate-200 dark:hover:bg-slate-800"
                          >
                            Reserve →
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <OfflineMapsModal
        open={offlineModalOpen}
        onClose={() => setOfflineModalOpen(false)}
        currentCenter={
          userGpsPos ||
          startLocation ||
          destLocation || { lat: 15.853, lng: 74.502 }
        }
        offlineMapPreview={offlineMapPreview}
        onToggleOfflineMapPreview={(next) => setOfflineMapPreview(next)}
        onSelectCachedRoute={(cached: StoredCachedRoute) => {
          const oPt: LocationPointDTO = {
            lat: cached.originLat,
            lng: cached.originLng,
            label: cached.originLabel,
            source: 'LOCAL_NODE',
          };
          const dPt: LocationPointDTO = {
            lat: cached.destinationLat,
            lng: cached.destinationLng,
            label: cached.destinationLabel,
            source: 'LOCAL_NODE',
          };
          setStartLocation(oPt);
          setDestLocation(dPt);
          setStartInput(oPt.label);
          setDestInput(dPt.label);
          setTravelMode(cached.travelMode);
          setRouteResult(cached.result);
          setSelectedCategory(
            cached.result.alternatives.find((a) => a.isRecommended)?.category ||
              cached.result.alternatives[0]?.category ||
              'RECOMMENDED'
          );
          setFitBoundsKey((k) => k + 1);
          setError(null);
          pushToast({
            variant: 'info',
            title: 'Cached Route Loaded',
            message: `${cached.originLabel} → ${cached.destinationLabel}`,
          });
        }}
      />
    </WorkspaceLayout>
  );
}
