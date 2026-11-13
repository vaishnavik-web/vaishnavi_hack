import {
  AnalyticsOverviewDTO,
  ApiResponse,
  AuditLogDTO,
  AuthTokensDTO,
  BusRouteDTO,
  BusScheduleDTO,
  BusServiceStatus,
  BusStopDTO,
  EmergencyAssistanceEventType,
  EmergencyAssistanceLogDTO,
  EmergencyContactDTO,
  EmergencyPriorityLevel,
  EmergencyTripDTO,
  EmergencyTripStatus,
  EmergencyVehicleDTO,
  GeocodeSuggestionDTO,
  HistoricalAnalyticsDTO,
  HistoricalBucketHours,
  HistoricalTimeWindow,
  IncidentConfirmationDTO,
  IncidentDTO,
  IncidentSeverity,
  IncidentStatus,
  JunctionDTO,
  NearbyHospitalsResponseDTO,
  NearbyPlaceCategory,
  NearbyPlacesResponseDTO,
  NetworkImpactResultDTO,
  OfflineRegionBundleDTO,
  OfflineRegionPresetDTO,
  ParkingLocationDTO,
  ParkingReservationDTO,
  ParkingSlotItemDTO,
  ParkingStatus,
  ParkingType,
  RoadNodeDTO,
  RoadSegmentDTO,
  RouteAlternativesResultDTO,
  SignalPlanDTO,
  SimulationScenarioDTO,
  TrafficPredictionDTO,
  TransitJourneyOptionDTO,
  TravelMode,
  UserDTO,
} from '../shared/types';
import { apiClient } from './apiClient';

export const authApi = {
  async register(payload: {
    name: string;
    email: string;
    password: string;
    role?: 'COMMUTER' | 'EMERGENCY_OPERATOR';
    vehicleType?: 'AMBULANCE' | 'FIRE_TRUCK';
    registrationLabel?: string;
  }): Promise<AuthTokensDTO> {
    const res = await apiClient.post<ApiResponse<AuthTokensDTO>>('/auth/register', payload);
    return res.data.data;
  },
  async login(payload: { email: string; password: string }): Promise<AuthTokensDTO> {
    const res = await apiClient.post<ApiResponse<AuthTokensDTO>>('/auth/login', payload);
    return res.data.data;
  },
  async me(): Promise<UserDTO> {
    const res = await apiClient.get<ApiResponse<{ user: UserDTO }>>('/auth/me');
    return res.data.data.user;
  },
  async updateProfile(name: string): Promise<UserDTO> {
    const res = await apiClient.patch<ApiResponse<{ user: UserDTO }>>('/auth/me', { name });
    return res.data.data.user;
  },
};

export const routesApi = {
  async getNetwork(): Promise<{
    nodes: RoadNodeDTO[];
    segments: RoadSegmentDTO[];
    activeClosuresCount: number;
    activeSimulationsCount: number;
    provider: any;
  }> {
    const res = await apiClient.get<ApiResponse<any>>('/routes/network');
    return res.data.data;
  },
  async geocode(q: string): Promise<{ results: GeocodeSuggestionDTO[] }> {
    const res = await apiClient.get<ApiResponse<{ results: GeocodeSuggestionDTO[] }>>(
      '/routes/geocode',
      { params: { q } }
    );
    return res.data.data;
  },
  async reverseGeocode(
    lat: number,
    lng: number
  ): Promise<{
    label: string;
    latitude: number;
    longitude: number;
    source: 'LOCAL_NODE' | 'GOOGLE_PLACES' | 'COORDINATE';
    nearestNodeId?: string;
  }> {
    const res = await apiClient.get<ApiResponse<any>>('/routes/reverse-geocode', {
      params: { lat, lng },
    });
    return res.data.data;
  },
  async getNearbyPlaces(
    lat: number,
    lng: number,
    category: NearbyPlaceCategory,
    radius = 5000
  ): Promise<NearbyPlacesResponseDTO> {
    const res = await apiClient.get<ApiResponse<NearbyPlacesResponseDTO>>(
      '/routes/nearby-places',
      { params: { lat, lng, category, radius } }
    );
    return res.data.data;
  },
  async getAlternatives(params: {
    originNodeId?: string;
    destinationNodeId?: string;
    originLat?: number;
    originLng?: number;
    originLabel?: string;
    destinationLat?: number;
    destinationLng?: number;
    destinationLabel?: string;
    travelMode?: TravelMode;
    distanceWeight?: number;
    timeWeight?: number;
    congestionWeight?: number;
    incidentWeight?: number;
  }): Promise<RouteAlternativesResultDTO> {
    const res = await apiClient.get<ApiResponse<RouteAlternativesResultDTO>>(
      '/routes/alternatives',
      { params }
    );
    return res.data.data;
  },
  async evaluateCandidates(payload: {
    originLat: number;
    originLng: number;
    originLabel?: string;
    originNodeId?: string;
    destinationLat: number;
    destinationLng: number;
    destinationLabel?: string;
    destinationNodeId?: string;
    travelMode?: TravelMode;
    distanceWeight?: number;
    timeWeight?: number;
    congestionWeight?: number;
    incidentWeight?: number;
    candidates: Array<{
      distanceMeters: number;
      durationSeconds: number;
      staticDurationSeconds?: number;
      geometry: Array<[number, number]>;
      summary?: string;
      steps?: Array<{
        instruction: string;
        name?: string;
        maneuver?: string;
        distanceMeters?: number;
        durationSec?: number;
        latitude: number;
        longitude: number;
      }>;
    }>;
  }): Promise<RouteAlternativesResultDTO> {
    const res = await apiClient.post<ApiResponse<RouteAlternativesResultDTO>>(
      '/routes/evaluate',
      payload
    );
    return res.data.data;
  },
  async listSaved(): Promise<Array<any>> {
    const res = await apiClient.get<ApiResponse<{ routes: Array<any> }>>('/routes/saved');
    return res.data.data.routes;
  },
  async saveRoute(payload: {
    label: string;
    originNodeId?: string;
    destinationNodeId?: string;
    originLat?: number;
    originLng?: number;
    destinationLat?: number;
    destinationLng?: number;
    routeType: 'SHORTEST' | 'FASTEST' | 'RECOMMENDED';
    summary: Record<string, unknown>;
  }) {
    const res = await apiClient.post<ApiResponse<any>>('/routes/saved', payload);
    return res.data.data;
  },
  async deleteSaved(id: string) {
    const res = await apiClient.delete<ApiResponse<any>>(`/routes/saved/${id}`);
    return res.data.data;
  },
};

export const incidentsApi = {
  async list(filters?: {
    status?: string;
    type?: string;
    severity?: string;
    search?: string;
    onlyDuplicates?: boolean;
    violationsOnly?: boolean;
    excludeExpired?: boolean;
  }): Promise<IncidentDTO[]> {
    const res = await apiClient.get<ApiResponse<{ incidents: IncidentDTO[] }>>('/incidents', {
      params: filters,
    });
    return res.data.data.incidents;
  },
  async getById(id: string): Promise<{
    incident: IncidentDTO;
    matches: Array<any>;
    confirmations: IncidentConfirmationDTO[];
  }> {
    const res = await apiClient.get<
      ApiResponse<{
        incident: IncidentDTO;
        matches: Array<any>;
        confirmations: IncidentConfirmationDTO[];
      }>
    >(`/incidents/${id}`);
    return res.data.data;
  },
  async submit(formData: FormData): Promise<{
    incidentId: string;
    status: IncidentStatus;
    possibleDuplicate: boolean;
    incident: IncidentDTO;
  }> {
    const res = await apiClient.post<ApiResponse<any>>('/incidents', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data.data;
  },
  async confirmPresence(
    id: string,
    payload: { stillPresent: boolean; note?: string }
  ): Promise<{ incident: IncidentDTO; confirmationsCount: number }> {
    const res = await apiClient.post<
      ApiResponse<{ incident: IncidentDTO; confirmationsCount: number }>
    >(`/incidents/${id}/confirm`, payload);
    return res.data.data;
  },
  async expireReport(id: string): Promise<IncidentDTO> {
    const res = await apiClient.patch<ApiResponse<{ incident: IncidentDTO }>>(
      `/incidents/${id}/expire`
    );
    return res.data.data.incident;
  },
  async updateStatus(
    id: string,
    payload: {
      status: Exclude<IncidentStatus, 'PENDING'>;
      severity?: IncidentSeverity;
      note?: string;
      applyRoadClosure?: boolean;
      extendHours?: number;
    }
  ): Promise<IncidentDTO> {
    const res = await apiClient.patch<ApiResponse<{ incident: IncidentDTO }>>(
      `/incidents/${id}/status`,
      payload
    );
    return res.data.data.incident;
  },
  async runImpactAnalysis(id: string): Promise<NetworkImpactResultDTO> {
    const res = await apiClient.post<ApiResponse<NetworkImpactResultDTO>>(
      `/incidents/${id}/impact-analysis`
    );
    return res.data.data;
  },
};

export const simulationsApi = {
  async list(): Promise<SimulationScenarioDTO[]> {
    const res = await apiClient.get<ApiResponse<{ scenarios: SimulationScenarioDTO[] }>>(
      '/simulations'
    );
    return res.data.data.scenarios;
  },
  async createClosure(payload: {
    name: string;
    type: 'FULL_CLOSURE' | 'LANE_BLOCKAGE' | 'CAPACITY_REDUCTION' | 'TRAFFIC_SURGE';
    targetSegmentId: string;
    originNodeId?: string;
    destinationNodeId?: string;
  }): Promise<SimulationScenarioDTO> {
    const res = await apiClient.post<ApiResponse<{ scenario: SimulationScenarioDTO }>>(
      '/simulations/closures',
      payload
    );
    return res.data.data.scenario;
  },
  async end(id: string): Promise<SimulationScenarioDTO> {
    const res = await apiClient.post<ApiResponse<{ scenario: SimulationScenarioDTO }>>(
      `/simulations/${id}/end`
    );
    return res.data.data.scenario;
  },
  async applyTrafficControls(payload: {
    densityMultiplier: number;
    weatherCondition: 'CLEAR' | 'RAIN' | 'HEAVY_RAIN';
  }) {
    const res = await apiClient.post<ApiResponse<any>>(
      '/simulations/traffic-controls',
      payload
    );
    return res.data.data;
  },
};

export const predictionsApi = {
  async getLatest(filters?: { horizon?: 15 | 30; segmentId?: string }): Promise<{
    predictions: TrafficPredictionDTO[];
    modelInfo: {
      modelVersion: string;
      maeEstimate: number;
      rmseEstimate: number;
      dataSource: string;
      isSimulated: boolean;
      lastPredictedAt: string | null;
    };
  }> {
    const res = await apiClient.get<ApiResponse<any>>('/predictions', { params: filters });
    return res.data.data;
  },
  async runPipeline(payload?: {
    weatherCondition?: 'CLEAR' | 'RAIN' | 'HEAVY_RAIN';
    densityMultiplier?: number;
  }) {
    const res = await apiClient.post<ApiResponse<any>>('/predictions/run', payload || {});
    return res.data.data;
  },
};

export const signalsApi = {
  async listJunctions(): Promise<JunctionDTO[]> {
    const res = await apiClient.get<ApiResponse<{ junctions: JunctionDTO[] }>>(
      '/signals/junctions'
    );
    return res.data.data.junctions;
  },
  async optimize(payload: {
    junctionId: string;
    observedDensity: number;
    observedQueue: number;
  }): Promise<SignalPlanDTO> {
    const res = await apiClient.post<ApiResponse<{ plan: SignalPlanDTO }>>(
      '/signals/optimize',
      payload
    );
    return res.data.data.plan;
  },
  async approve(planId: string): Promise<SignalPlanDTO> {
    const res = await apiClient.post<ApiResponse<{ plan: SignalPlanDTO }>>(
      `/signals/plans/${planId}/approve`
    );
    return res.data.data.plan;
  },
  async history(): Promise<SignalPlanDTO[]> {
    const res = await apiClient.get<ApiResponse<{ plans: SignalPlanDTO[] }>>(
      '/signals/history'
    );
    return res.data.data.plans;
  },
};

export const emergencyApi = {
  async listVehicles(): Promise<EmergencyVehicleDTO[]> {
    const res = await apiClient.get<ApiResponse<{ vehicles: EmergencyVehicleDTO[] }>>(
      '/emergency/vehicles'
    );
    return res.data.data.vehicles;
  },
  async listTrips(): Promise<EmergencyTripDTO[]> {
    const res = await apiClient.get<ApiResponse<{ trips: EmergencyTripDTO[] }>>(
      '/emergency/trips'
    );
    return res.data.data.trips;
  },
  async createTrip(payload: {
    vehicleId: string;
    originNodeId: string;
    destinationNodeId: string;
    priorityLevel: EmergencyPriorityLevel;
  }): Promise<EmergencyTripDTO> {
    const res = await apiClient.post<ApiResponse<{ trip: EmergencyTripDTO }>>(
      '/emergency/trips',
      payload
    );
    return res.data.data.trip;
  },
  async updateStatus(
    id: string,
    status: Exclude<EmergencyTripStatus, 'REQUESTED'>,
    failureReason?: string
  ): Promise<EmergencyTripDTO> {
    const res = await apiClient.patch<ApiResponse<{ trip: EmergencyTripDTO }>>(
      `/emergency/trips/${id}/status`,
      { status, failureReason }
    );
    return res.data.data.trip;
  },
  async recalculatePriorityRoute(id: string): Promise<EmergencyTripDTO> {
    const res = await apiClient.post<ApiResponse<{ trip: EmergencyTripDTO }>>(
      `/emergency/trips/${id}/priority-route`
    );
    return res.data.data.trip;
  },
  async updateLocation(id: string, latitude: number, longitude: number): Promise<EmergencyTripDTO> {
    const res = await apiClient.patch<ApiResponse<{ trip: EmergencyTripDTO }>>(
      `/emergency/trips/${id}/location`,
      { latitude, longitude }
    );
    return res.data.data.trip;
  },
};

export const analyticsApi = {
  async getPublicSummary(): Promise<{
    networkSummary: AnalyticsOverviewDTO['networkSummary'];
    verifiedIncidentsCount: number;
    predictionStats: AnalyticsOverviewDTO['predictionStats'];
    parkingStats?: AnalyticsOverviewDTO['parkingStats'];
    transportStats?: AnalyticsOverviewDTO['transportStats'];
  }> {
    const res = await apiClient.get<ApiResponse<any>>('/analytics/public-summary');
    return res.data.data;
  },
  async getOverview(): Promise<AnalyticsOverviewDTO> {
    const res = await apiClient.get<ApiResponse<AnalyticsOverviewDTO>>('/analytics/overview');
    return res.data.data;
  },
  async getHistorical(params?: {
    window?: HistoricalTimeWindow;
    bucketHours?: HistoricalBucketHours;
    segmentId?: string;
  }): Promise<HistoricalAnalyticsDTO> {
    const res = await apiClient.get<ApiResponse<HistoricalAnalyticsDTO>>(
      '/analytics/historical',
      { params }
    );
    return res.data.data;
  },
  async getAuditLogs(limit = 60): Promise<AuditLogDTO[]> {
    const res = await apiClient.get<ApiResponse<{ logs: AuditLogDTO[] }>>(
      '/analytics/audit-logs',
      { params: { limit } }
    );
    return res.data.data.logs;
  },
  async downloadCsv(): Promise<Blob> {
    const res = await apiClient.get('/analytics/export/csv', { responseType: 'blob' });
    return res.data;
  },
};

export const parkingApi = {
  async list(filters?: {
    q?: string;
    type?: string;
    availability?: string;
    maxPrice?: number;
    lat?: number;
    lng?: number;
    sort?: 'distance' | 'available' | 'price';
  }): Promise<ParkingLocationDTO[]> {
    const res = await apiClient.get<ApiResponse<{ locations: ParkingLocationDTO[] }>>('/parking', {
      params: filters,
    });
    return res.data.data.locations;
  },
  async getNearby(lat: number, lng: number, limit = 4): Promise<ParkingLocationDTO[]> {
    const res = await apiClient.get<ApiResponse<{ locations: ParkingLocationDTO[] }>>(
      '/parking/nearby',
      { params: { lat, lng, limit } }
    );
    return res.data.data.locations;
  },
  async getById(
    id: string,
    lat?: number,
    lng?: number
  ): Promise<{ parking: ParkingLocationDTO; slots: ParkingSlotItemDTO[] }> {
    const res = await apiClient.get<
      ApiResponse<{ parking: ParkingLocationDTO; slots: ParkingSlotItemDTO[] }>
    >(`/parking/${id}`, { params: { lat, lng } });
    return res.data.data;
  },
  async reserve(
    parkingId: string,
    payload: {
      slotNumber: string;
      vehicleType: 'CAR' | 'BIKE';
      vehicleNumber?: string;
      reservationTime?: string;
      durationHours: number;
    }
  ): Promise<{ reservation: ParkingReservationDTO; parking: ParkingLocationDTO }> {
    const res = await apiClient.post<
      ApiResponse<{ reservation: ParkingReservationDTO; parking: ParkingLocationDTO }>
    >(`/parking/${parkingId}/reserve`, payload);
    return res.data.data;
  },
  async listMyReservations(): Promise<ParkingReservationDTO[]> {
    const res = await apiClient.get<ApiResponse<{ reservations: ParkingReservationDTO[] }>>(
      '/parking/reservations/me'
    );
    return res.data.data.reservations;
  },
  async cancelReservation(
    reservationId: string
  ): Promise<{ reservation: ParkingReservationDTO; parking: ParkingLocationDTO }> {
    const res = await apiClient.patch<
      ApiResponse<{ reservation: ParkingReservationDTO; parking: ParkingLocationDTO }>
    >(`/parking/reservations/${reservationId}/cancel`);
    return res.data.data;
  },
  async create(payload: {
    parkingName: string;
    address: string;
    latitude: number;
    longitude: number;
    parkingType: ParkingType;
    totalSlots: number;
    availableSlots: number;
    pricePerHour: number;
    priceLabel?: string;
    openingTime: string;
    closingTime: string;
    contactInfo?: string | null;
    status?: ParkingStatus;
  }): Promise<ParkingLocationDTO> {
    const res = await apiClient.post<ApiResponse<{ location: ParkingLocationDTO }>>(
      '/parking',
      payload
    );
    return res.data.data.location;
  },
  async update(
    id: string,
    payload: Partial<{
      parkingName: string;
      address: string;
      latitude: number;
      longitude: number;
      parkingType: ParkingType;
      totalSlots: number;
      availableSlots: number;
      pricePerHour: number;
      priceLabel: string;
      openingTime: string;
      closingTime: string;
      contactInfo: string | null;
      status: ParkingStatus;
    }>
  ): Promise<ParkingLocationDTO> {
    const res = await apiClient.patch<ApiResponse<{ location: ParkingLocationDTO }>>(
      `/parking/${id}`,
      payload
    );
    return res.data.data.location;
  },
  async listAdminReservations(): Promise<{
    reservations: ParkingReservationDTO[];
    stats: AnalyticsOverviewDTO['parkingStats'];
  }> {
    const res = await apiClient.get<ApiResponse<any>>('/parking/admin/reservations');
    return res.data.data;
  },
};

export const transportApi = {
  async listStops(filters?: { q?: string; lat?: number; lng?: number }): Promise<BusStopDTO[]> {
    const res = await apiClient.get<ApiResponse<{ stops: BusStopDTO[] }>>('/transport/stops', {
      params: filters,
    });
    return res.data.data.stops;
  },
  async getStopDetails(stopId: string): Promise<{ stop: BusStopDTO; routeDetails: BusRouteDTO[] }> {
    const res = await apiClient.get<
      ApiResponse<{ stop: BusStopDTO; routeDetails: BusRouteDTO[] }>
    >(`/transport/stops/${stopId}`);
    return res.data.data;
  },
  async listRoutes(filters?: { q?: string; status?: string }): Promise<BusRouteDTO[]> {
    const res = await apiClient.get<ApiResponse<{ routes: BusRouteDTO[] }>>('/transport/routes', {
      params: filters,
    });
    return res.data.data.routes;
  },
  async planJourney(params: {
    originStopId?: string;
    originLat?: number;
    originLng?: number;
    originQuery?: string;
    destStopId?: string;
    destLat?: number;
    destLng?: number;
    destQuery?: string;
  }): Promise<{
    nearbyOriginStops: BusStopDTO[];
    nearbyDestinationStops: BusStopDTO[];
    options: TransitJourneyOptionDTO[];
    dataNotice: string;
  }> {
    const res = await apiClient.get<ApiResponse<any>>('/transport/plan', { params });
    return res.data.data;
  },
  async createStop(payload: {
    stopName: string;
    address: string;
    landmark?: string | null;
    direction?: string | null;
    latitude: number;
    longitude: number;
  }): Promise<BusStopDTO> {
    const res = await apiClient.post<ApiResponse<{ stop: BusStopDTO }>>('/transport/stops', payload);
    return res.data.data.stop;
  },
  async updateStop(
    id: string,
    payload: Partial<{
      stopName: string;
      address: string;
      landmark: string | null;
      direction: string | null;
      latitude: number;
      longitude: number;
    }>
  ): Promise<BusStopDTO> {
    const res = await apiClient.patch<ApiResponse<{ stop: BusStopDTO }>>(
      `/transport/stops/${id}`,
      payload
    );
    return res.data.data.stop;
  },
  async createRoute(payload: {
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
  }): Promise<BusRouteDTO> {
    const res = await apiClient.post<ApiResponse<{ route: BusRouteDTO }>>(
      '/transport/routes',
      payload
    );
    return res.data.data.route;
  },
  async updateRoute(
    id: string,
    payload: Partial<{
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
    }>
  ): Promise<BusRouteDTO> {
    const res = await apiClient.patch<ApiResponse<{ route: BusRouteDTO }>>(
      `/transport/routes/${id}`,
      payload
    );
    return res.data.data.route;
  },
  async upsertRouteStop(
    routeId: string,
    payload: { stopId: string; stopOrder: number; travelMinutesFromStart: number }
  ): Promise<BusRouteDTO> {
    const res = await apiClient.post<ApiResponse<{ route: BusRouteDTO }>>(
      `/transport/routes/${routeId}/stops`,
      payload
    );
    return res.data.data.route;
  },
  async createSchedule(payload: {
    routeId: string;
    stopId: string;
    scheduledArrival: string;
    scheduledDeparture: string;
    dayType: 'DAILY' | 'WEEKDAY' | 'WEEKEND';
    status: BusServiceStatus;
  }): Promise<BusScheduleDTO> {
    const res = await apiClient.post<ApiResponse<{ schedule: BusScheduleDTO }>>(
      '/transport/schedules',
      payload
    );
    return res.data.data.schedule;
  },
};

export const sosApi = {
  async getNearbyHospitals(
    lat: number,
    lng: number,
    radius = 8000
  ): Promise<NearbyHospitalsResponseDTO> {
    const res = await apiClient.get<ApiResponse<NearbyHospitalsResponseDTO>>('/sos/hospitals', {
      params: { lat, lng, radius },
    });
    return res.data.data;
  },
  async listContacts(): Promise<EmergencyContactDTO[]> {
    const res = await apiClient.get<ApiResponse<{ contacts: EmergencyContactDTO[] }>>(
      '/sos/contacts'
    );
    return res.data.data.contacts;
  },
  async createContact(payload: {
    name: string;
    relationship: string;
    phone: string;
    notes?: string | null;
    isPrimary?: boolean;
  }): Promise<EmergencyContactDTO> {
    const res = await apiClient.post<ApiResponse<{ contact: EmergencyContactDTO }>>(
      '/sos/contacts',
      payload
    );
    return res.data.data.contact;
  },
  async updateContact(
    id: string,
    payload: Partial<{
      name: string;
      relationship: string;
      phone: string;
      notes: string | null;
      isPrimary: boolean;
    }>
  ): Promise<EmergencyContactDTO> {
    const res = await apiClient.patch<ApiResponse<{ contact: EmergencyContactDTO }>>(
      `/sos/contacts/${id}`,
      payload
    );
    return res.data.data.contact;
  },
  async deleteContact(id: string): Promise<void> {
    await apiClient.delete(`/sos/contacts/${id}`);
  },
  async listHistory(limit = 40): Promise<EmergencyAssistanceLogDTO[]> {
    const res = await apiClient.get<ApiResponse<{ logs: EmergencyAssistanceLogDTO[] }>>(
      '/sos/history',
      { params: { limit } }
    );
    return res.data.data.logs;
  },
  async logEvent(payload: {
    eventType: EmergencyAssistanceEventType;
    serviceDialed?: string | null;
    contactName?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    locationLabel?: string | null;
    hospitalPlaceId?: string | null;
    hospitalName?: string | null;
    sharedChannel?: string | null;
    notes?: string | null;
  }): Promise<EmergencyAssistanceLogDTO> {
    const res = await apiClient.post<ApiResponse<{ log: EmergencyAssistanceLogDTO }>>(
      '/sos/history',
      payload
    );
    return res.data.data.log;
  },
};

export const offlineApi = {
  async listRegions(): Promise<OfflineRegionPresetDTO[]> {
    const res = await apiClient.get<ApiResponse<{ regions: OfflineRegionPresetDTO[] }>>(
      '/offline/regions'
    );
    return res.data.data.regions;
  },
  async getRegionBundle(regionId: string): Promise<OfflineRegionBundleDTO> {
    const res = await apiClient.get<ApiResponse<OfflineRegionBundleDTO>>(
      `/offline/regions/${encodeURIComponent(regionId)}/bundle`
    );
    return res.data.data;
  },
  async getCustomBundle(params: {
    name: string;
    north: number;
    south: number;
    east: number;
    west: number;
    minZoom?: number;
    maxZoom?: number;
  }): Promise<OfflineRegionBundleDTO> {
    const res = await apiClient.get<ApiResponse<OfflineRegionBundleDTO>>('/offline/custom-bundle', {
      params,
    });
    return res.data.data;
  },
};


