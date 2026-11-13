export type UserRole = 'COMMUTER' | 'ADMIN' | 'SIGNAL_OPERATOR' | 'EMERGENCY_OPERATOR';

export type IncidentType =
  | 'ACCIDENT'
  | 'ROADBLOCK'
  | 'CONGESTION'
  | 'CONSTRUCTION'
  | 'LANE_CLOSURE'
  | 'BREAKDOWN'
  | 'FLOODING'
  | 'WRONG_WAY_DRIVING'
  | 'ILLEGAL_PARKING'
  | 'BLOCKING_ROAD'
  | 'NO_PARKING_ZONE'
  | 'ROAD_OBSTRUCTION'
  | 'OTHER';

export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type IncidentStatus = 'PENDING' | 'UNDER_REVIEW' | 'VERIFIED' | 'REJECTED' | 'RESOLVED';

export type ParkingType = 'CAR' | 'BIKE' | 'BOTH';

export type ParkingStatus = 'AVAILABLE' | 'LIMITED' | 'FULL' | 'TEMPORARILY_CLOSED';

export type ParkingReservationStatus = 'ACTIVE' | 'CANCELLED' | 'COMPLETED';

export type BusServiceStatus = 'ON_SCHEDULE' | 'DELAYED' | 'SUSPENDED';

export type RoadClosureStatus = 'OPEN' | 'LANE_RESTRICTED' | 'CLOSED';

export type CongestionClass = 'CLEAR' | 'MODERATE' | 'HIGH' | 'SEVERE';

export type PredictionRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type RouteCategory = 'SHORTEST' | 'FASTEST' | 'RECOMMENDED';

export type EmergencyPriorityLevel = 'STANDARD' | 'URGENT' | 'CRITICAL_CODE_3';

export type EmergencyTripStatus =
  | 'REQUESTED'
  | 'ACTIVE'
  | 'EN_ROUTE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'BLOCKED';

export interface ApiMeta {
  requestId: string;
  timestamp: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
  meta: ApiMeta;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: ApiMeta;
}

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokensDTO {
  accessToken: string;
  refreshToken: string;
  user: UserDTO;
}

export interface RoadNodeDTO {
  id: string;
  externalRef: string;
  name: string;
  latitude: number;
  longitude: number;
  isJunction: boolean;
  zone: string;
}

export interface RoadSegmentDTO {
  id: string;
  name: string;
  startNodeId: string;
  endNodeId: string;
  geometry: Array<[number, number]>;
  lengthMeters: number;
  capacityVph: number;
  speedLimitKmh: number;
  currentCongestion: number;
  closureStatus: RoadClosureStatus;
  effectiveClosureStatus: RoadClosureStatus;
  weatherFactor: number;
  activeIncidentCount: number;
  simulatedBlocked: boolean;
  congestionClass: CongestionClass;
  isSimulated: boolean;
}

export interface ScoreBreakdown {
  distanceWeight: number;
  timeWeight: number;
  congestionPenalty: number;
  incidentPenalty: number;
  closurePenalty: number;
  fuelEstimatePenalty: number;
  reliabilityBenefit: number;
  totalCompositeScore: number;
  weightsUsed: {
    distance: number;
    time: number;
    congestion: number;
    incident: number;
    fuel: number;
    reliability: number;
  };
}

export interface LocationPointDTO {
  lat: number;
  lng: number;
  label: string;
  source: 'GOOGLE_PLACES' | 'NOMINATIM' | 'LOCAL_NODE' | 'MAP_CLICK' | 'GEOLOCATION';
  nodeId?: string;
  externalRef?: string;
}

export interface GeocodeSuggestionDTO {
  id: string;
  name: string;
  displayName: string;
  latitude: number;
  longitude: number;
  source: 'LOCAL_NODE' | 'GOOGLE_PLACES' | 'NOMINATIM' | 'COORDINATE';
  placeId?: string;
  nodeId?: string;
  externalRef?: string;
  zone?: string;
}

export type TravelMode = 'DRIVE' | 'TWO_WHEELER' | 'BICYCLE' | 'WALK' | 'TRANSIT';

export type TrafficSpeedLevel = 'SPEED_UNSPECIFIED' | 'NORMAL' | 'SLOW' | 'TRAFFIC_JAM';

export interface TrafficSpeedIntervalDTO {
  startPolylinePointIndex: number;
  endPolylinePointIndex: number;
  speed: TrafficSpeedLevel;
}

export interface TollInfoDTO {
  estimatedPriceText: string;
  currencyCode: string;
  amount: number;
}

export interface TransitStepSummaryDTO {
  lineName: string;
  shortName?: string;
  vehicleType?: string;
  headsign?: string;
  departureStop?: string;
  arrivalStop?: string;
  departureTimeText?: string;
  arrivalTimeText?: string;
  numStops?: number;
}

export type NearbyPlaceCategory =
  | 'gas_station'
  | 'hospital'
  | 'parking'
  | 'restaurant'
  | 'bus_station'
  | 'atm';

export interface NearbyPlaceDTO {
  placeId: string;
  category: NearbyPlaceCategory;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  openNow: boolean | null;
  rating: number | null;
  source: 'GOOGLE_PLACES_NEW' | 'TRAFFIX_SAMPLE';
  priceLabel?: string;
}

export interface NearbyPlacesResponseDTO {
  places: NearbyPlaceDTO[];
  source: 'GOOGLE_PLACES_NEW' | 'MIXED' | 'UNAVAILABLE';
  quotaExceeded: boolean;
  notice: string;
  searchedAt: string;
}

export interface RouteAlternativeDTO {
  category: RouteCategory;
  routeName?: string;
  travelMode?: TravelMode;
  algorithm:
    | 'DIJKSTRA_SHORTEST'
    | 'DIJKSTRA_FASTEST'
    | 'ASTAR_MULTIFACTOR'
    | 'GOOGLE_ROUTES_DRIVING'
    | 'GOOGLE_ROUTES_ALTERNATIVE'
    | 'GOOGLE_ROUTES_TWO_WHEELER'
    | 'GOOGLE_ROUTES_BICYCLE'
    | 'GOOGLE_ROUTES_WALK'
    | 'GOOGLE_ROUTES_TRANSIT'
    | 'OSRM_DRIVING'
    | 'OSRM_ALTERNATIVE';
  pathNodeIds: string[];
  pathSegmentIds: string[];
  geometry: Array<[number, number]>;
  totalDistanceKm: number;
  estimatedTimeMin: number;
  staticDurationMin?: number;
  avgCongestion: number;
  trafficLevel?: CongestionClass;
  liveTrafficAvailable?: boolean;
  trafficSummary?: string;
  speedReadingIntervals?: TrafficSpeedIntervalDTO[];
  tollInfo?: TollInfoDTO | null;
  transitSteps?: TransitStepSummaryDTO[];
  betaWarning?: string | null;
  incidentCount?: number;
  closureWarnings?: string[];
  intersectsClosedRoad?: boolean;
  isRecommended?: boolean;
  estimatedFuelLiters: number;
  reliabilityScore: number;
  importantTurns: Array<{
    nodeId: string;
    nodeName: string;
    instruction: string;
    latitude: number;
    longitude: number;
    distanceMeters?: number;
    maneuver?: string;
  }>;
  relevantIncidents: Array<{
    id: string;
    type: IncidentType;
    severity: IncidentSeverity;
    status: IncidentStatus;
    description: string;
    roadName?: string | null;
    landmark?: string | null;
    verified?: boolean;
  }>;
  unverifiedReports?: Array<{
    id: string;
    type: IncidentType;
    severity: IncidentSeverity;
    status: IncidentStatus;
    description: string;
    roadName?: string | null;
    landmark?: string | null;
  }>;
  obstructionWarning?: string | null;
  alternativeRouteSuggested?: boolean;
  explanation: string;
  scoreBreakdown: ScoreBreakdown;
}

export interface RouteAlternativesResultDTO {
  origin: RoadNodeDTO & { label?: string; source?: string };
  destination: RoadNodeDTO & { label?: string; source?: string };
  travelMode?: TravelMode;
  liveTrafficAvailable?: boolean;
  trafficSummary?: string;
  lastUpdated?: string;
  alternatives: RouteAlternativeDTO[];
  recalculatedDueToNetworkEvent: boolean;
  activeClosuresCount: number;
  activeSimulationsCount: number;
  provider: {
    name: string;
    mode:
      | 'SIMULATED_GRAPH'
      | 'LIVE_FALLBACK_SIMULATED'
      | 'LIVE'
      | 'GOOGLE_ROUTES_WITH_SIMULATED_TRAFFIC'
      | 'OSRM_WITH_SIMULATED_TRAFFIC';
    isSimulated: boolean;
    lastUpdated: string;
    notice: string;
  };
}

export interface IncidentDTO {
  id: string;
  reporterId: string;
  reporterName?: string;
  type: IncidentType;
  description: string;
  latitude: number;
  longitude: number;
  roadName: string | null;
  landmark: string | null;
  roadSegmentId: string | null;
  roadSegmentName?: string;
  severity: IncidentSeverity;
  estimatedSeverity: IncidentSeverity;
  severityConfidence: number;
  severityReasons: string[];
  status: IncidentStatus;
  imageUrl: string | null;
  possibleDuplicate: boolean;
  canonicalIncidentId: string | null;
  duplicateScore: number | null;
  duplicateReason: string | null;
  verifiedBy: string | null;
  occurredAt: string;
  expiresAt: string | null;
  isExpired: boolean;
  stillPresentCount: number;
  lastConfirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface IncidentConfirmationDTO {
  id: string;
  incidentId: string;
  userId: string;
  userName?: string;
  stillPresent: boolean;
  note: string | null;
  createdAt: string;
}

export interface NetworkImpactResultDTO {
  incidentId: string;
  directlyAffectedSegment: RoadSegmentDTO;
  downstreamSegments: Array<{
    segmentId: string;
    segmentName: string;
    hopDistance: number;
    estimatedLoadIncreasePct: number;
    projectedCongestion: number;
  }>;
  alternativeDetours: Array<{
    fromNodeName: string;
    toNodeName: string;
    detourDistanceKm: number;
    addedTimeMin: number;
    segmentNames: string[];
  }>;
  estimatedAddedTravelTimeMin: number;
  networkConnectivityIntact: boolean;
  summary: string;
  isSimulated: boolean;
}

export interface SimulationScenarioDTO {
  id: string;
  name: string;
  type: 'FULL_CLOSURE' | 'LANE_BLOCKAGE' | 'CAPACITY_REDUCTION' | 'TRAFFIC_SURGE';
  targetSegmentId: string;
  targetSegmentName?: string;
  parameters: {
    closureMode?: RoadClosureStatus;
    capacityReductionPct?: number;
    densityMultiplier?: number;
    weatherCondition?: string;
    originNodeId?: string;
    destinationNodeId?: string;
  };
  results: {
    affectedSegmentCount: number;
    addedDelayMin: number;
    detourAvailable: boolean;
    detourPathNames: string[];
    baselineEtaMin: number | null;
    simulatedEtaMin: number | null;
    downstreamSegments: Array<{ segmentId: string; segmentName: string; projectedCongestion: number }>;
  };
  createdBy: string;
  status: 'ACTIVE' | 'ENDED';
  createdAt: string;
  endedAt: string | null;
}

export interface TrafficPredictionDTO {
  id: string;
  segmentId: string;
  segmentName: string;
  predictedAt: string;
  horizonMinutes: 15 | 30;
  currentDensity: number;
  currentSpeedKmh: number;
  predictedDensity: number;
  predictedSpeedKmh: number;
  congestionClass: CongestionClass;
  riskScore: number;
  riskLevel: PredictionRiskLevel;
  recommendedAlternative?: {
    originNodeId: string;
    destinationNodeId: string;
    originName: string;
    destinationName: string;
    detourSegmentNames: string[];
    detourDistanceKm: number;
    detourEtaMin: number;
    directSegmentTimeMin: number;
    explanation: string;
  } | null;
  modelVersion: string;
  maeEstimate: number;
  rmseEstimate: number;
  dataSource: string;
  isSimulated: boolean;
  inputSummary: {
    hourOfDay: number;
    dayOfWeek: number;
    weatherCondition: string;
    activeIncidents: number;
    closureStatus: RoadClosureStatus;
  };
}

export interface JunctionDTO {
  id: string;
  nodeId: string;
  name: string;
  latitude: number;
  longitude: number;
  approaches: string[];
  lanesCount: number;
  minGreenSec: number;
  maxGreenSec: number;
  cycleLengthSec: number;
  currentPhases: Array<{
    phaseId: string;
    approach: string;
    greenSec: number;
    amberSec: number;
    redSec: number;
  }>;
  latestDensity: number;
  latestQueueLength: number;
  active: boolean;
  isSimulated: boolean;
}

export interface SignalPlanDTO {
  id: string;
  junctionId: string;
  junctionName: string;
  initiatedBy: string;
  initiatedByName?: string;
  observedDensity: number;
  observedQueue: number;
  currentTimings: Array<{ phaseId: string; approach: string; greenSec: number; amberSec: number; redSec: number }>;
  proposedTimings: Array<{ phaseId: string; approach: string; greenSec: number; amberSec: number; redSec: number }>;
  reason: string;
  beforeMetrics: {
    avgWaitTimeSec: number;
    maxQueueVehicles: number;
    throughputVph: number;
    totalDelaySec: number;
  };
  afterMetrics: {
    avgWaitTimeSec: number;
    maxQueueVehicles: number;
    throughputVph: number;
    totalDelaySec: number;
  };
  status: 'SIMULATED' | 'APPROVED_SIMULATION';
  approvedBy: string | null;
  createdAt: string;
  approvedAt: string | null;
  simulationNotice: string;
}

export interface EmergencyVehicleDTO {
  id: string;
  operatorId: string;
  vehicleType: 'AMBULANCE' | 'FIRE_TRUCK';
  registrationLabel: string;
  available: boolean;
}

export interface EmergencyTripDTO {
  id: string;
  vehicleId: string;
  vehicleLabel?: string;
  vehicleType?: 'AMBULANCE' | 'FIRE_TRUCK';
  operatorId: string;
  originNodeId: string;
  originName?: string;
  destinationNodeId: string;
  destinationName?: string;
  priorityLevel: EmergencyPriorityLevel;
  status: EmergencyTripStatus;
  normalEtaMin: number;
  priorityEtaMin: number;
  timeSavedMin: number;
  route: {
    pathNodeIds: string[];
    pathSegmentIds: string[];
    geometry: Array<[number, number]>;
    totalDistanceKm: number;
    dataUsed: string;
    normalRoute?: {
      pathNodeIds: string[];
      pathSegmentIds: string[];
      geometry: Array<[number, number]>;
      totalDistanceKm: number;
    };
  };
  junctionActions: Array<{
    junctionId: string;
    junctionName: string;
    action: 'PREEMPT_GREEN_WAVE' | 'HOLD_CROSS_TRAFFIC' | 'CLEAR_QUEUE';
    estimatedArrivalOffsetMin: number;
    simulatedControlNotice: string;
  }>;
  currentLat: number | null;
  currentLng: number | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface AuditLogDTO {
  id: string;
  actorId: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  beforeSummary: string;
  afterSummary: string;
  createdAt: string;
}

export interface AnalyticsOverviewDTO {
  networkSummary: {
    totalSegments: number;
    openSegments: number;
    restrictedSegments: number;
    closedSegments: number;
    avgCongestionPct: number;
    avgSpeedKmh: number;
    activeSimulations: number;
    isSimulated: boolean;
  };
  incidentStats: {
    total: number;
    pending: number;
    underReview: number;
    verified: number;
    rejected: number;
    resolved: number;
    possibleDuplicates: number;
  };
  topAffectedRoads: Array<{
    id: string;
    name: string;
    currentCongestion: number;
    closureStatus: RoadClosureStatus;
    activeIncidentCount: number;
  }>;
  predictionStats: {
    latestRunAt: string | null;
    avg15MinRisk: number;
    avg30MinRisk: number;
    modelVersion: string;
    maeEstimate: number;
    rmseEstimate: number;
    dataSource: string;
  };
  signalStats: {
    totalPlans: number;
    approvedSimulations: number;
    avgWaitReductionPct: number;
  };
  emergencyStats: {
    totalTrips: number;
    activeTrips: number;
    completedTrips: number;
    avgTimeSavedMin: number;
  };
  parkingStats?: {
    totalLocations: number;
    totalCapacity: number;
    availableSpaces: number;
    activeReservations: number;
    isSample: boolean;
  };
  transportStats?: {
    totalStops: number;
    totalRoutes: number;
    onScheduleRoutes: number;
    isSample: boolean;
  };
}

export interface ParkingLocationDTO {
  id: string;
  parkingName: string;
  address: string;
  latitude: number;
  longitude: number;
  parkingType: ParkingType;
  totalSlots: number;
  availableSlots: number;
  occupiedSlots: number;
  pricePerHour: number;
  priceLabel: string;
  openingTime: string;
  closingTime: string;
  contactInfo: string | null;
  status: ParkingStatus;
  distanceMeters?: number;
  isSample: boolean;
  dataNotice: string;
  updatedAt: string;
  createdAt: string;
}

export interface ParkingSlotItemDTO {
  slotNumber: string;
  occupied: boolean;
  reservedByCurrentUser: boolean;
}

export interface ParkingReservationDTO {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  parkingId: string;
  parkingName?: string;
  parkingAddress?: string;
  slotNumber: string;
  vehicleType: 'CAR' | 'BIKE';
  vehicleNumber: string | null;
  reservationTime: string;
  durationHours: number;
  status: ParkingReservationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface BusScheduleDTO {
  id: string;
  routeId: string;
  routeNumber?: string;
  routeName?: string;
  stopId: string;
  stopName?: string;
  scheduledArrival: string;
  scheduledDeparture: string;
  dayType: 'DAILY' | 'WEEKDAY' | 'WEEKEND';
  status: BusServiceStatus;
  isSample: boolean;
}

export interface BusRouteStopDTO {
  id: string;
  routeId: string;
  stopId: string;
  stopName: string;
  address: string;
  landmark: string | null;
  direction: string | null;
  latitude: number;
  longitude: number;
  stopOrder: number;
  travelMinutesFromStart: number;
}

export interface BusStopDTO {
  id: string;
  stopName: string;
  address: string;
  landmark: string | null;
  direction: string | null;
  latitude: number;
  longitude: number;
  distanceMeters?: number;
  routes: Array<{
    id: string;
    routeNumber: string;
    routeName: string;
    startingPoint: string;
    destination: string;
    estimatedDurationMin: number;
    frequencyMin: number;
    serviceStartTime: string;
    serviceEndTime: string;
    serviceStatus: BusServiceStatus;
  }>;
  nextSchedules?: BusScheduleDTO[];
  createdAt: string;
}

export interface BusRouteDTO {
  id: string;
  routeNumber: string;
  routeName: string;
  startingPoint: string;
  destination: string;
  routeDescription: string;
  estimatedDurationMin: number;
  frequencyMin: number;
  serviceStartTime: string;
  serviceEndTime: string;
  serviceStatus: BusServiceStatus;
  isSample: boolean;
  stops: BusRouteStopDTO[];
  schedules: BusScheduleDTO[];
  createdAt: string;
}

export interface TransitJourneyLegDTO {
  mode: 'WALK' | 'BUS';
  fromName: string;
  toName: string;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  distanceMeters: number;
  durationMin: number;
  routeId?: string;
  routeNumber?: string;
  routeName?: string;
  serviceStatus?: BusServiceStatus;
  scheduledDeparture?: string | null;
  intermediateStops?: BusRouteStopDTO[];
  geometry: Array<[number, number]>;
}

export interface TransitJourneyOptionDTO {
  id: string;
  type: 'DIRECT' | 'INTERCHANGE';
  originStop: BusStopDTO;
  destinationStop: BusStopDTO;
  interchangeStop: BusStopDTO | null;
  walkToStartMeters: number;
  walkFromEndMeters: number;
  totalWalkMeters: number;
  totalDurationMin: number;
  transfersCount: number;
  routeNumbers: string[];
  legs: TransitJourneyLegDTO[];
  dataNotice: string;
}

export type HistoricalTimeWindow = '6H' | '12H' | '24H';
export type HistoricalBucketHours = 2 | 4 | 6;

export interface HistoricalTimeBucketDTO {
  bucketKey: string;
  label: string;
  startIso: string;
  endIso: string;
  observationCount: number;
  avgCongestionPct: number;
  avgSpeedKmh: number;
  avgTravelTimeMin: number;
  freeFlowTravelTimeMin: number;
  avgDelayMin: number;
  avgQueueLength: number;
  totalVehicleCount: number;
  peakCongestionPct: number;
}

export interface HistoricalCorridorBreakdownDTO {
  segmentId: string;
  segmentName: string;
  avgCongestionPct: number;
  avgSpeedKmh: number;
  avgTravelTimeMin: number;
  avgDelayMin: number;
  observationCount: number;
}

export interface HistoricalAnalyticsDTO {
  window: HistoricalTimeWindow;
  bucketHours: HistoricalBucketHours;
  selectedSegmentId: string | null;
  availableSegments: Array<{ id: string; name: string }>;
  summary: {
    totalObservations: number;
    avgCongestionPct: number;
    avgSpeedKmh: number;
    avgTravelTimeMin: number;
    avgDelayMin: number;
    peakBucketLabel: string | null;
    peakCongestionPct: number;
    congestionDeltaPct: number;
    isSimulated: boolean;
    dataSource: string;
  };
  series: HistoricalTimeBucketDTO[];
  topCorridors: HistoricalCorridorBreakdownDTO[];
}

export type LiveNotificationEventType =
  | 'incident:reported'
  | 'incident:created'
  | 'incident:verified'
  | 'incident:resolved'
  | 'incident:updated'
  | 'road:status-changed';

export interface LiveIncidentNotificationDTO {
  notificationId: string;
  dedupeKey: string;
  event: LiveNotificationEventType;
  incidentId?: string;
  simulationId?: string;
  type: string;
  severity: IncidentSeverity | 'INFO';
  status: string;
  description: string;
  roadSegmentId: string | null;
  roadSegmentName: string | null;
  latitude?: number;
  longitude?: number;
  timestamp: string;
  isLiveWebSocket: boolean;
  isSimulated: boolean;
  unread: boolean;
}

export interface EmergencyContactDTO {
  id: string;
  userId: string;
  name: string;
  relationship: string;
  phone: string;
  notes: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export type EmergencyAssistanceEventType =
  | 'SOS_TRIGGERED'
  | 'DIAL_CLICKED'
  | 'LOCATION_SHARED'
  | 'HOSPITAL_VIEWED';

export interface EmergencyAssistanceLogDTO {
  id: string;
  userId: string | null;
  eventType: EmergencyAssistanceEventType;
  serviceDialed: string | null;
  contactName: string | null;
  latitude: number | null;
  longitude: number | null;
  locationLabel: string | null;
  hospitalPlaceId: string | null;
  hospitalName: string | null;
  sharedChannel: string | null;
  notes: string | null;
  createdAt: string;
}

export interface NearbyHospitalDTO {
  placeId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  phone: string | null;
  openNow: boolean | null;
  rating: number | null;
  userRatingCount: number | null;
  googleMapsUri: string | null;
  primaryType: string | null;
  source: 'GOOGLE_PLACES_NEW';
}

export interface NearbyHospitalsResponseDTO {
  hospitals: NearbyHospitalDTO[];
  source: 'GOOGLE_PLACES_NEW' | 'UNAVAILABLE';
  quotaExceeded: boolean;
  notice: string;
  searchedAt: string;
}

export interface OfflineRegionBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface OfflineRegionPresetDTO {
  id: string;
  name: string;
  subtitle: string;
  bounds: OfflineRegionBounds;
  center: { lat: number; lng: number };
  minZoom: number;
  maxZoom: number;
  estimatedTiles: number;
  estimatedSizeKb: number;
}

export interface OfflinePrecomputedRouteDTO {
  cacheKey: string;
  originLabel: string;
  destinationLabel: string;
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
  travelMode: TravelMode;
  result: RouteAlternativesResultDTO;
}

export interface OfflineRegionBundleDTO {
  region: OfflineRegionPresetDTO;
  nodes: RoadNodeDTO[];
  segments: RoadSegmentDTO[];
  parkingLocations: ParkingLocationDTO[];
  busStops: BusStopDTO[];
  precomputedRoutes: OfflinePrecomputedRouteDTO[];
  downloadedAt: string;
  expiresAt: string;
}

