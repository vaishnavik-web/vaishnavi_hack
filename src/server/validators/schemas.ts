import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: z.string().trim().email('Valid email address is required').toLowerCase(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72)
    .regex(/[A-Z]/, 'Password must include at least one uppercase letter')
    .regex(/[0-9]/, 'Password must include at least one number'),
  role: z
    .enum(['COMMUTER', 'EMERGENCY_OPERATOR'])
    .optional()
    .default('COMMUTER'),
  vehicleType: z.enum(['AMBULANCE', 'FIRE_TRUCK']).optional(),
  registrationLabel: z.string().trim().min(3).max(40).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().email('Valid email address is required').toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10, 'Refresh token is required'),
});

export const profileUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80),
});

export const travelModeEnum = z.enum(['DRIVE', 'TWO_WHEELER', 'BICYCLE', 'WALK', 'TRANSIT']);

export const routeAlternativesQuerySchema = z
  .object({
    originNodeId: z.string().trim().min(1).optional(),
    destinationNodeId: z.string().trim().min(1).optional(),
    originLat: z.coerce.number().min(-90).max(90).optional(),
    originLng: z.coerce.number().min(-180).max(180).optional(),
    originLabel: z.string().trim().max(160).optional(),
    destinationLat: z.coerce.number().min(-90).max(90).optional(),
    destinationLng: z.coerce.number().min(-180).max(180).optional(),
    destinationLabel: z.string().trim().max(160).optional(),
    travelMode: travelModeEnum.optional().default('DRIVE'),
    distanceWeight: z.coerce.number().min(0).max(1).optional(),
    timeWeight: z.coerce.number().min(0).max(1).optional(),
    congestionWeight: z.coerce.number().min(0).max(1).optional(),
    incidentWeight: z.coerce.number().min(0).max(1).optional(),
  })
  .refine(
    (data) =>
      (Boolean(data.originNodeId) && Boolean(data.destinationNodeId)) ||
      (data.originLat !== undefined &&
        data.originLng !== undefined &&
        data.destinationLat !== undefined &&
        data.destinationLng !== undefined),
    {
      message:
        'Provide either originNodeId & destinationNodeId OR originLat, originLng, destinationLat & destinationLng',
    }
  );

export const evaluateRoutesBodySchema = z.object({
  originLat: z.number().min(-90).max(90),
  originLng: z.number().min(-180).max(180),
  originLabel: z.string().trim().max(160).optional(),
  originNodeId: z.string().trim().min(1).optional(),
  destinationLat: z.number().min(-90).max(90),
  destinationLng: z.number().min(-180).max(180),
  destinationLabel: z.string().trim().max(160).optional(),
  destinationNodeId: z.string().trim().min(1).optional(),
  travelMode: travelModeEnum.optional().default('DRIVE'),
  distanceWeight: z.number().min(0).max(1).optional(),
  timeWeight: z.number().min(0).max(1).optional(),
  congestionWeight: z.number().min(0).max(1).optional(),
  incidentWeight: z.number().min(0).max(1).optional(),
  candidates: z
    .array(
      z.object({
        distanceMeters: z.number().nonnegative(),
        durationSeconds: z.number().nonnegative(),
        staticDurationSeconds: z.number().nonnegative().optional(),
        geometry: z.array(z.tuple([z.number(), z.number()])).min(2),
        summary: z.string().max(200).optional(),
        steps: z
          .array(
            z.object({
              instruction: z.string(),
              name: z.string().optional(),
              maneuver: z.string().optional(),
              distanceMeters: z.number().nonnegative().optional(),
              durationSec: z.number().nonnegative().optional(),
              latitude: z.number(),
              longitude: z.number(),
            })
          )
          .optional()
          .default([]),
      })
    )
    .min(1)
    .max(5),
});

export const nearbyPlacesQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  category: z.enum(['gas_station', 'hospital', 'parking', 'restaurant', 'bus_station', 'atm']),
  radius: z.coerce.number().int().min(500).max(25000).optional().default(5000),
});

export const reverseGeocodeQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export const saveRouteSchema = z.object({
  label: z.string().trim().min(2).max(120),
  originNodeId: z.string().trim().min(1).optional(),
  destinationNodeId: z.string().trim().min(1).optional(),
  originLat: z.coerce.number().min(-90).max(90).optional(),
  originLng: z.coerce.number().min(-180).max(180).optional(),
  destinationLat: z.coerce.number().min(-90).max(90).optional(),
  destinationLng: z.coerce.number().min(-180).max(180).optional(),
  routeType: z.enum(['SHORTEST', 'FASTEST', 'RECOMMENDED']),
  summary: z.record(z.string(), z.unknown()),
});

export const createIncidentSchema = z.object({
  type: z.enum([
    'ACCIDENT',
    'ROADBLOCK',
    'CONGESTION',
    'CONSTRUCTION',
    'LANE_CLOSURE',
    'BREAKDOWN',
    'FLOODING',
    'WRONG_WAY_DRIVING',
    'ILLEGAL_PARKING',
    'BLOCKING_ROAD',
    'NO_PARKING_ZONE',
    'ROAD_OBSTRUCTION',
    'OTHER',
  ]),
  description: z
    .string()
    .trim()
    .min(8, 'Please provide at least 8 characters describing the incident')
    .max(500),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  roadName: z.string().trim().max(160).optional().nullable(),
  landmark: z.string().trim().max(160).optional().nullable(),
  occurredAt: z.string().trim().max(64).optional().nullable(),
  expiresAt: z.string().trim().max(64).optional().nullable(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  roadSegmentId: z.string().trim().optional().nullable(),
});

export const updateIncidentStatusSchema = z.object({
  status: z.enum(['UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'RESOLVED']),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  note: z.string().trim().max(300).optional(),
  applyRoadClosure: z.boolean().optional(),
  extendHours: z.coerce.number().min(1).max(72).optional(),
});

export const confirmIncidentPresenceSchema = z.object({
  stillPresent: z.boolean(),
  note: z.string().trim().max(250).optional(),
});

export const closureSimulationSchema = z.object({
  name: z.string().trim().min(3).max(100),
  type: z.enum(['FULL_CLOSURE', 'LANE_BLOCKAGE', 'CAPACITY_REDUCTION', 'TRAFFIC_SURGE']),
  targetSegmentId: z.string().trim().min(1),
  originNodeId: z.string().trim().optional(),
  destinationNodeId: z.string().trim().optional(),
  densityMultiplier: z.coerce.number().min(0.5).max(2.5).optional(),
  weatherCondition: z.enum(['CLEAR', 'RAIN', 'HEAVY_RAIN']).optional(),
});

export const trafficControlSimSchema = z.object({
  densityMultiplier: z.coerce.number().min(0.4).max(2.0).default(1.0),
  weatherCondition: z.enum(['CLEAR', 'RAIN', 'HEAVY_RAIN']).default('CLEAR'),
});

export const predictionRunSchema = z.object({
  weatherCondition: z.enum(['CLEAR', 'RAIN', 'HEAVY_RAIN']).optional().default('CLEAR'),
  densityMultiplier: z.coerce.number().min(0.5).max(2.0).optional().default(1.0),
});

export const signalOptimizeSchema = z.object({
  junctionId: z.string().trim().min(1),
  observedDensity: z.coerce.number().min(0.05).max(1.0),
  observedQueue: z.coerce.number().int().min(0).max(120),
});

export const createEmergencyTripSchema = z.object({
  vehicleId: z.string().trim().min(1),
  originNodeId: z.string().trim().min(1),
  destinationNodeId: z.string().trim().min(1),
  priorityLevel: z.enum(['STANDARD', 'URGENT', 'CRITICAL_CODE_3']),
});

export const updateEmergencyStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'EN_ROUTE', 'COMPLETED', 'CANCELLED', 'BLOCKED']),
  failureReason: z.string().trim().max(250).optional(),
});

export const emergencyLocationSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
});

export const idParamSchema = z.object({
  id: z.string().trim().min(1).max(100),
});

export const createParkingSchema = z.object({
  parkingName: z.string().trim().min(2).max(120),
  address: z.string().trim().min(4).max(200),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  parkingType: z.enum(['CAR', 'BIKE', 'BOTH']),
  totalSlots: z.coerce.number().int().min(1).max(2000),
  availableSlots: z.coerce.number().int().min(0).max(2000),
  pricePerHour: z.coerce.number().min(0).max(5000),
  priceLabel: z.string().trim().min(1).max(60).optional(),
  openingTime: z.string().trim().min(3).max(20).default('06:00'),
  closingTime: z.string().trim().min(3).max(20).default('22:00'),
  contactInfo: z.string().trim().max(80).optional().nullable(),
  status: z.enum(['AVAILABLE', 'LIMITED', 'FULL', 'TEMPORARILY_CLOSED']).optional(),
});

export const updateParkingSchema = createParkingSchema.partial();

export const reserveParkingSchema = z.object({
  slotNumber: z.string().trim().min(1).max(20),
  vehicleType: z.enum(['CAR', 'BIKE']),
  vehicleNumber: z.string().trim().max(30).optional().nullable(),
  reservationTime: z.string().trim().max(64).optional(),
  durationHours: z.coerce.number().int().min(1).max(24).default(2),
});

export const createBusStopSchema = z.object({
  stopName: z.string().trim().min(2).max(120),
  address: z.string().trim().min(3).max(200),
  landmark: z.string().trim().max(160).optional().nullable(),
  direction: z.string().trim().max(100).optional().nullable(),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
});

export const updateBusStopSchema = createBusStopSchema.partial();

export const createBusRouteSchema = z.object({
  routeNumber: z.string().trim().min(1).max(24),
  routeName: z.string().trim().min(2).max(120),
  startingPoint: z.string().trim().min(2).max(120),
  destination: z.string().trim().min(2).max(120),
  routeDescription: z.string().trim().min(3).max(400),
  estimatedDurationMin: z.coerce.number().int().min(2).max(360),
  frequencyMin: z.coerce.number().int().min(2).max(180).default(20),
  serviceStartTime: z.string().trim().min(3).max(20).default('06:00'),
  serviceEndTime: z.string().trim().min(3).max(20).default('22:30'),
  serviceStatus: z.enum(['ON_SCHEDULE', 'DELAYED', 'SUSPENDED']).default('ON_SCHEDULE'),
});

export const updateBusRouteSchema = createBusRouteSchema.partial();

export const upsertBusRouteStopSchema = z.object({
  stopId: z.string().trim().min(1),
  stopOrder: z.coerce.number().int().min(1).max(200),
  travelMinutesFromStart: z.coerce.number().int().min(0).max(360).default(0),
});

export const createBusScheduleSchema = z.object({
  routeId: z.string().trim().min(1),
  stopId: z.string().trim().min(1),
  scheduledArrival: z.string().trim().min(3).max(20),
  scheduledDeparture: z.string().trim().min(3).max(20),
  dayType: z.enum(['DAILY', 'WEEKDAY', 'WEEKEND']).default('DAILY'),
  status: z.enum(['ON_SCHEDULE', 'DELAYED', 'SUSPENDED']).default('ON_SCHEDULE'),
});

export const updateBusScheduleSchema = createBusScheduleSchema.partial();

export const createEmergencyContactSchema = z.object({
  name: z.string().trim().min(2, 'Contact name is required').max(100),
  relationship: z.string().trim().min(2, 'Relationship is required').max(60),
  phone: z
    .string()
    .trim()
    .min(3, 'Phone number is required')
    .max(30)
    .regex(/^[+0-9()\-\s]+$/, 'Enter a valid phone number'),
  notes: z.string().trim().max(240).optional().nullable(),
  isPrimary: z.boolean().optional().default(false),
});

export const updateEmergencyContactSchema = createEmergencyContactSchema.partial();

export const createAssistanceLogSchema = z.object({
  eventType: z.enum(['SOS_TRIGGERED', 'DIAL_CLICKED', 'LOCATION_SHARED', 'HOSPITAL_VIEWED']),
  serviceDialed: z.string().trim().max(40).optional().nullable(),
  contactName: z.string().trim().max(100).optional().nullable(),
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
  locationLabel: z.string().trim().max(200).optional().nullable(),
  hospitalPlaceId: z.string().trim().max(160).optional().nullable(),
  hospitalName: z.string().trim().max(160).optional().nullable(),
  sharedChannel: z.string().trim().max(60).optional().nullable(),
  notes: z.string().trim().max(300).optional().nullable(),
});

export const nearbyHospitalsQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().int().min(500).max(25000).optional().default(8000),
});

