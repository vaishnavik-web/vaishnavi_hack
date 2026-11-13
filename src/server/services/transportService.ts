import Database from 'better-sqlite3';
import crypto from 'crypto';
import {
  BusRouteDTO,
  BusRouteStopDTO,
  BusScheduleDTO,
  BusServiceStatus,
  BusStopDTO,
  TransitJourneyLegDTO,
  TransitJourneyOptionDTO,
} from '../../shared/types.js';
import { haversineMeters } from '../algorithms/geo.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { recordAuditLog } from './auditService.js';

const TRANSPORT_NOTICE =
  'Scheduled sample timetable & simulated stop topology (live bus GPS feed not connected)';

function buildStopRoutesMap(db: Database.Database) {
  const rows = db
    .prepare(
      `SELECT rs.stop_id, r.*
       FROM bus_route_stops rs
       JOIN bus_routes r ON r.id = rs.route_id
       ORDER BY r.route_number ASC`
    )
    .all() as Array<any>;

  const map = new Map<string, BusStopDTO['routes']>();
  for (const row of rows) {
    const list = map.get(row.stop_id) || [];
    list.push({
      id: row.id,
      routeNumber: row.route_number,
      routeName: row.route_name,
      startingPoint: row.starting_point,
      destination: row.destination,
      estimatedDurationMin: Number(row.estimated_duration_min),
      frequencyMin: Number(row.frequency_min),
      serviceStartTime: row.service_start_time,
      serviceEndTime: row.service_end_time,
      serviceStatus: row.service_status as BusServiceStatus,
    });
    map.set(row.stop_id, list);
  }
  return map;
}

export function listBusStops(
  db: Database.Database,
  filters?: { q?: string; lat?: number; lng?: number }
): BusStopDTO[] {
  let sql = `SELECT * FROM bus_stops WHERE 1=1`;
  const params: any[] = [];
  if (filters?.q) {
    sql += ` AND (LOWER(stop_name) LIKE ? OR LOWER(address) LIKE ? OR LOWER(COALESCE(landmark, '')) LIKE ?)`;
    const term = `%${filters.q.trim().toLowerCase()}%`;
    params.push(term, term, term);
  }
  sql += ` ORDER BY stop_name ASC`;

  const rows = db.prepare(sql).all(...params) as Array<any>;
  const stopRoutes = buildStopRoutesMap(db);
  const refLat = filters?.lat;
  const refLng = filters?.lng;

  const list: BusStopDTO[] = rows.map((r) => ({
    id: r.id,
    stopName: r.stop_name,
    address: r.address,
    landmark: r.landmark || null,
    direction: r.direction || null,
    latitude: r.latitude,
    longitude: r.longitude,
    distanceMeters:
      refLat !== undefined && refLng !== undefined
        ? Math.round(haversineMeters(refLat, refLng, r.latitude, r.longitude))
        : undefined,
    routes: stopRoutes.get(r.id) || [],
    createdAt: r.created_at,
  }));

  if (refLat !== undefined && refLng !== undefined) {
    list.sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));
  }

  return list;
}

export function getBusStopDetails(
  db: Database.Database,
  stopId: string
): { stop: BusStopDTO; routeDetails: BusRouteDTO[] } {
  const row = db.prepare(`SELECT * FROM bus_stops WHERE id = ?`).get(stopId) as any;
  if (!row) throw notFound(`Bus stop '${stopId}' not found`);

  const stopRoutes = buildStopRoutesMap(db);
  const routes = stopRoutes.get(stopId) || [];

  const scheduleRows = db
    .prepare(
      `SELECT bs.*, r.route_number, r.route_name, s.stop_name
       FROM bus_schedules bs
       JOIN bus_routes r ON r.id = bs.route_id
       JOIN bus_stops s ON s.id = bs.stop_id
       WHERE bs.stop_id = ?
       ORDER BY bs.scheduled_departure ASC`
    )
    .all(stopId) as Array<any>;

  const nextSchedules: BusScheduleDTO[] = scheduleRows.map((s) => ({
    id: s.id,
    routeId: s.route_id,
    routeNumber: s.route_number,
    routeName: s.route_name,
    stopId: s.stop_id,
    stopName: s.stop_name,
    scheduledArrival: s.scheduled_arrival,
    scheduledDeparture: s.scheduled_departure,
    dayType: s.day_type,
    status: s.status,
    isSample: Boolean(s.is_sample),
  }));

  const routeDetails = routes.map((rt) => getBusRouteById(db, rt.id));

  return {
    stop: {
      id: row.id,
      stopName: row.stop_name,
      address: row.address,
      landmark: row.landmark || null,
      direction: row.direction || null,
      latitude: row.latitude,
      longitude: row.longitude,
      routes,
      nextSchedules,
      createdAt: row.created_at,
    },
    routeDetails,
  };
}

export function getBusRouteById(db: Database.Database, routeId: string): BusRouteDTO {
  const r = db.prepare(`SELECT * FROM bus_routes WHERE id = ?`).get(routeId) as any;
  if (!r) throw notFound(`Bus route '${routeId}' not found`);

  const stopRows = db
    .prepare(
      `SELECT rs.*, s.stop_name, s.address, s.landmark, s.direction, s.latitude, s.longitude
       FROM bus_route_stops rs
       JOIN bus_stops s ON s.id = rs.stop_id
       WHERE rs.route_id = ?
       ORDER BY rs.stop_order ASC`
    )
    .all(routeId) as Array<any>;

  const stops: BusRouteStopDTO[] = stopRows.map((rs) => ({
    id: rs.id,
    routeId: rs.route_id,
    stopId: rs.stop_id,
    stopName: rs.stop_name,
    address: rs.address,
    landmark: rs.landmark || null,
    direction: rs.direction || null,
    latitude: rs.latitude,
    longitude: rs.longitude,
    stopOrder: Number(rs.stop_order),
    travelMinutesFromStart: Number(rs.travel_minutes_from_start),
  }));

  const scheduleRows = db
    .prepare(
      `SELECT bs.*, s.stop_name
       FROM bus_schedules bs
       JOIN bus_stops s ON s.id = bs.stop_id
       WHERE bs.route_id = ?
       ORDER BY bs.scheduled_departure ASC`
    )
    .all(routeId) as Array<any>;

  const schedules: BusScheduleDTO[] = scheduleRows.map((sc) => ({
    id: sc.id,
    routeId: sc.route_id,
    routeNumber: r.route_number,
    routeName: r.route_name,
    stopId: sc.stop_id,
    stopName: sc.stop_name,
    scheduledArrival: sc.scheduled_arrival,
    scheduledDeparture: sc.scheduled_departure,
    dayType: sc.day_type,
    status: sc.status,
    isSample: Boolean(sc.is_sample),
  }));

  return {
    id: r.id,
    routeNumber: r.route_number,
    routeName: r.route_name,
    startingPoint: r.starting_point,
    destination: r.destination,
    routeDescription: r.route_description,
    estimatedDurationMin: Number(r.estimated_duration_min),
    frequencyMin: Number(r.frequency_min),
    serviceStartTime: r.service_start_time,
    serviceEndTime: r.service_end_time,
    serviceStatus: r.service_status as BusServiceStatus,
    isSample: Boolean(r.is_sample),
    stops,
    schedules,
    createdAt: r.created_at,
  };
}

export function listBusRoutes(
  db: Database.Database,
  filters?: { q?: string; status?: string }
): BusRouteDTO[] {
  let sql = `SELECT id FROM bus_routes WHERE 1=1`;
  const params: any[] = [];
  if (filters?.q) {
    sql += ` AND (LOWER(route_number) LIKE ? OR LOWER(route_name) LIKE ? OR LOWER(starting_point) LIKE ? OR LOWER(destination) LIKE ?)`;
    const term = `%${filters.q.trim().toLowerCase()}%`;
    params.push(term, term, term, term);
  }
  if (filters?.status && filters.status !== 'ALL') {
    sql += ` AND service_status = ?`;
    params.push(filters.status);
  }
  sql += ` ORDER BY route_number ASC`;

  const ids = db.prepare(sql).all(...params) as Array<{ id: string }>;
  return ids.map((row) => getBusRouteById(db, row.id));
}

function resolveCandidateStops(
  allStops: BusStopDTO[],
  input: { stopId?: string; lat?: number; lng?: number; query?: string }
): Array<{ stop: BusStopDTO; walkMeters: number }> {
  if (input.stopId) {
    const exact = allStops.find((s) => s.id === input.stopId);
    if (exact) return [{ stop: exact, walkMeters: 0 }];
  }

  if (input.lat !== undefined && input.lng !== undefined) {
    const withDist = allStops
      .map((s) => ({
        stop: s,
        walkMeters: Math.round(haversineMeters(input.lat!, input.lng!, s.latitude, s.longitude)),
      }))
      .sort((a, b) => a.walkMeters - b.walkMeters);
    return withDist.slice(0, 4);
  }

  if (input.query) {
    const term = input.query.trim().toLowerCase();
    const matched = allStops.filter(
      (s) =>
        s.stopName.toLowerCase().includes(term) ||
        s.address.toLowerCase().includes(term) ||
        (s.landmark || '').toLowerCase().includes(term)
    );
    if (matched.length > 0) {
      return matched.slice(0, 4).map((s) => ({ stop: s, walkMeters: 0 }));
    }
  }

  return [];
}

function buildBusLeg(
  route: BusRouteDTO,
  boardIdx: number,
  alightIdx: number,
  db: Database.Database
): TransitJourneyLegDTO {
  const slice = route.stops.slice(boardIdx, alightIdx + 1);
  const first = slice[0];
  const last = slice[slice.length - 1];
  let dist = 0;
  for (let i = 0; i < slice.length - 1; i++) {
    dist += haversineMeters(
      slice[i].latitude,
      slice[i].longitude,
      slice[i + 1].latitude,
      slice[i + 1].longitude
    );
  }
  const durationMin = Math.max(
    3,
    last.travelMinutesFromStart - first.travelMinutesFromStart
  );
  const firstSchedule = db
    .prepare(
      `SELECT scheduled_departure FROM bus_schedules WHERE route_id = ? AND stop_id = ? ORDER BY scheduled_departure ASC LIMIT 1`
    )
    .get(route.id, first.stopId) as { scheduled_departure?: string } | undefined;

  return {
    mode: 'BUS',
    fromName: first.stopName,
    toName: last.stopName,
    fromLat: first.latitude,
    fromLng: first.longitude,
    toLat: last.latitude,
    toLng: last.longitude,
    distanceMeters: Math.round(dist),
    durationMin,
    routeId: route.id,
    routeNumber: route.routeNumber,
    routeName: route.routeName,
    serviceStatus: route.serviceStatus,
    scheduledDeparture: firstSchedule?.scheduled_departure || route.serviceStartTime,
    intermediateStops: slice,
    geometry: slice.map((s) => [s.latitude, s.longitude]),
  };
}

export function planPublicTransportJourney(
  db: Database.Database,
  params: {
    originStopId?: string;
    originLat?: number;
    originLng?: number;
    originQuery?: string;
    destStopId?: string;
    destLat?: number;
    destLng?: number;
    destQuery?: string;
  }
): {
  nearbyOriginStops: BusStopDTO[];
  nearbyDestinationStops: BusStopDTO[];
  options: TransitJourneyOptionDTO[];
  dataNotice: string;
} {
  const allStops = listBusStops(db);
  const allRoutes = listBusRoutes(db).filter((r) => r.serviceStatus !== 'SUSPENDED');

  const originCandidates = resolveCandidateStops(allStops, {
    stopId: params.originStopId,
    lat: params.originLat,
    lng: params.originLng,
    query: params.originQuery,
  });

  const destCandidates = resolveCandidateStops(allStops, {
    stopId: params.destStopId,
    lat: params.destLat,
    lng: params.destLng,
    query: params.destQuery,
  });

  if (originCandidates.length === 0 || destCandidates.length === 0) {
    return {
      nearbyOriginStops: originCandidates.map((c) => ({ ...c.stop, distanceMeters: c.walkMeters })),
      nearbyDestinationStops: destCandidates.map((c) => ({ ...c.stop, distanceMeters: c.walkMeters })),
      options: [],
      dataNotice: TRANSPORT_NOTICE,
    };
  }

  const stopMap = new Map(allStops.map((s) => [s.id, s]));
  const options: TransitJourneyOptionDTO[] = [];
  const seenKeys = new Set<string>();

  // 1. Direct routes
  for (const oc of originCandidates) {
    for (const dc of destCandidates) {
      if (oc.stop.id === dc.stop.id) continue;

      for (const route of allRoutes) {
        const boardIdx = route.stops.findIndex((s) => s.stopId === oc.stop.id);
        const alightIdx = route.stops.findIndex((s) => s.stopId === dc.stop.id);
        if (boardIdx !== -1 && alightIdx !== -1 && boardIdx < alightIdx) {
          const key = `DIRECT-${route.id}-${oc.stop.id}-${dc.stop.id}`;
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);

          const legs: TransitJourneyLegDTO[] = [];
          if (oc.walkMeters > 30 && params.originLat !== undefined && params.originLng !== undefined) {
            legs.push({
              mode: 'WALK',
              fromName: params.originQuery || 'Starting Point',
              toName: oc.stop.stopName,
              fromLat: params.originLat,
              fromLng: params.originLng,
              toLat: oc.stop.latitude,
              toLng: oc.stop.longitude,
              distanceMeters: oc.walkMeters,
              durationMin: Math.max(1, Math.round(oc.walkMeters / 75)),
              geometry: [
                [params.originLat, params.originLng],
                [oc.stop.latitude, oc.stop.longitude],
              ],
            });
          }

          const busLeg = buildBusLeg(route, boardIdx, alightIdx, db);
          legs.push(busLeg);

          if (dc.walkMeters > 30 && params.destLat !== undefined && params.destLng !== undefined) {
            legs.push({
              mode: 'WALK',
              fromName: dc.stop.stopName,
              toName: params.destQuery || 'Destination',
              fromLat: dc.stop.latitude,
              fromLng: dc.stop.longitude,
              toLat: params.destLat,
              toLng: params.destLng,
              distanceMeters: dc.walkMeters,
              durationMin: Math.max(1, Math.round(dc.walkMeters / 75)),
              geometry: [
                [dc.stop.latitude, dc.stop.longitude],
                [params.destLat, params.destLng],
              ],
            });
          }

          const totalDurationMin = legs.reduce((s, l) => s + l.durationMin, 0);
          options.push({
            id: `opt-${crypto.randomUUID().slice(0, 8)}`,
            type: 'DIRECT',
            originStop: { ...oc.stop, distanceMeters: oc.walkMeters },
            destinationStop: { ...dc.stop, distanceMeters: dc.walkMeters },
            interchangeStop: null,
            walkToStartMeters: oc.walkMeters,
            walkFromEndMeters: dc.walkMeters,
            totalWalkMeters: oc.walkMeters + dc.walkMeters,
            totalDurationMin,
            transfersCount: 0,
            routeNumbers: [route.routeNumber],
            legs,
            dataNotice: TRANSPORT_NOTICE,
          });
        }
      }
    }
  }

  // 2. 1-Transfer Interchange routes
  for (const oc of originCandidates.slice(0, 3)) {
    for (const dc of destCandidates.slice(0, 3)) {
      if (oc.stop.id === dc.stop.id) continue;

      for (const r1 of allRoutes) {
        const b1 = r1.stops.findIndex((s) => s.stopId === oc.stop.id);
        if (b1 === -1) continue;

        for (let i1 = b1 + 1; i1 < r1.stops.length; i1++) {
          const transferStopId = r1.stops[i1].stopId;
          if (transferStopId === dc.stop.id) continue;

          for (const r2 of allRoutes) {
            if (r2.id === r1.id) continue;
            const b2 = r2.stops.findIndex((s) => s.stopId === transferStopId);
            const a2 = r2.stops.findIndex((s) => s.stopId === dc.stop.id);
            if (b2 !== -1 && a2 !== -1 && b2 < a2) {
              const key = `XFER-${r1.id}-${r2.id}-${transferStopId}-${oc.stop.id}-${dc.stop.id}`;
              if (seenKeys.has(key)) continue;
              seenKeys.add(key);

              const xferStop = stopMap.get(transferStopId);
              if (!xferStop) continue;

              const legs: TransitJourneyLegDTO[] = [];
              if (oc.walkMeters > 30 && params.originLat !== undefined && params.originLng !== undefined) {
                legs.push({
                  mode: 'WALK',
                  fromName: params.originQuery || 'Starting Point',
                  toName: oc.stop.stopName,
                  fromLat: params.originLat,
                  fromLng: params.originLng,
                  toLat: oc.stop.latitude,
                  toLng: oc.stop.longitude,
                  distanceMeters: oc.walkMeters,
                  durationMin: Math.max(1, Math.round(oc.walkMeters / 75)),
                  geometry: [
                    [params.originLat, params.originLng],
                    [oc.stop.latitude, oc.stop.longitude],
                  ],
                });
              }

              legs.push(buildBusLeg(r1, b1, i1, db));
              legs.push(buildBusLeg(r2, b2, a2, db));

              if (dc.walkMeters > 30 && params.destLat !== undefined && params.destLng !== undefined) {
                legs.push({
                  mode: 'WALK',
                  fromName: dc.stop.stopName,
                  toName: params.destQuery || 'Destination',
                  fromLat: dc.stop.latitude,
                  fromLng: dc.stop.longitude,
                  toLat: params.destLat,
                  toLng: params.destLng,
                  distanceMeters: dc.walkMeters,
                  durationMin: Math.max(1, Math.round(dc.walkMeters / 75)),
                  geometry: [
                    [dc.stop.latitude, dc.stop.longitude],
                    [params.destLat, params.destLng],
                  ],
                });
              }

              const transferWaitMin = 6;
              const totalDurationMin =
                legs.reduce((s, l) => s + l.durationMin, 0) + transferWaitMin;

              options.push({
                id: `opt-${crypto.randomUUID().slice(0, 8)}`,
                type: 'INTERCHANGE',
                originStop: { ...oc.stop, distanceMeters: oc.walkMeters },
                destinationStop: { ...dc.stop, distanceMeters: dc.walkMeters },
                interchangeStop: xferStop,
                walkToStartMeters: oc.walkMeters,
                walkFromEndMeters: dc.walkMeters,
                totalWalkMeters: oc.walkMeters + dc.walkMeters,
                totalDurationMin,
                transfersCount: 1,
                routeNumbers: [r1.routeNumber, r2.routeNumber],
                legs,
                dataNotice: TRANSPORT_NOTICE,
              });
            }
          }
        }
      }
    }
  }

  options.sort((a, b) => {
    if (a.transfersCount !== b.transfersCount) return a.transfersCount - b.transfersCount;
    return a.totalDurationMin - b.totalDurationMin || a.totalWalkMeters - b.totalWalkMeters;
  });

  // Deduplicate identical route pairs keeping best stop pairing
  const uniqueByRouteSig: TransitJourneyOptionDTO[] = [];
  const sigs = new Set<string>();
  for (const opt of options) {
    const sig = `${opt.type}:${opt.routeNumbers.join('->')}:${opt.interchangeStop?.id || 'none'}`;
    if (!sigs.has(sig)) {
      sigs.add(sig);
      uniqueByRouteSig.push(opt);
    }
    if (uniqueByRouteSig.length >= 6) break;
  }

  return {
    nearbyOriginStops: originCandidates.map((c) => ({ ...c.stop, distanceMeters: c.walkMeters })),
    nearbyDestinationStops: destCandidates.map((c) => ({ ...c.stop, distanceMeters: c.walkMeters })),
    options: uniqueByRouteSig,
    dataNotice: TRANSPORT_NOTICE,
  };
}

export function createBusStop(
  db: Database.Database,
  actor: { userId: string; email: string },
  input: {
    stopName: string;
    address: string;
    landmark?: string | null;
    direction?: string | null;
    latitude: number;
    longitude: number;
  }
): BusStopDTO {
  const id = `stop-${crypto.randomUUID().slice(0, 10)}`;
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO bus_stops (id, stop_name, address, landmark, direction, latitude, longitude, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.stopName,
      input.address,
      input.landmark || null,
      input.direction || null,
      input.latitude,
      input.longitude,
      now
    );
    recordAuditLog(db, {
      actorId: actor.userId,
      actorEmail: actor.email,
      action: 'BUS_STOP_CREATED',
      targetType: 'BUS_STOP',
      targetId: id,
      beforeSummary: 'None',
      afterSummary: `stopName=${input.stopName}`,
    });
  })();
  return getBusStopDetails(db, id).stop;
}

export function updateBusStop(
  db: Database.Database,
  stopId: string,
  actor: { userId: string; email: string },
  input: Partial<{
    stopName: string;
    address: string;
    landmark: string | null;
    direction: string | null;
    latitude: number;
    longitude: number;
  }>
): BusStopDTO {
  const existing = db.prepare(`SELECT * FROM bus_stops WHERE id = ?`).get(stopId) as any;
  if (!existing) throw notFound(`Bus stop '${stopId}' not found`);

  db.transaction(() => {
    db.prepare(
      `UPDATE bus_stops SET stop_name = ?, address = ?, landmark = ?, direction = ?, latitude = ?, longitude = ? WHERE id = ?`
    ).run(
      input.stopName ?? existing.stop_name,
      input.address ?? existing.address,
      input.landmark !== undefined ? input.landmark : existing.landmark,
      input.direction !== undefined ? input.direction : existing.direction,
      input.latitude ?? existing.latitude,
      input.longitude ?? existing.longitude,
      stopId
    );
    recordAuditLog(db, {
      actorId: actor.userId,
      actorEmail: actor.email,
      action: 'BUS_STOP_UPDATED',
      targetType: 'BUS_STOP',
      targetId: stopId,
      beforeSummary: `stopName=${existing.stop_name}`,
      afterSummary: `stopName=${input.stopName ?? existing.stop_name}`,
    });
  })();
  return getBusStopDetails(db, stopId).stop;
}

export function createBusRoute(
  db: Database.Database,
  actor: { userId: string; email: string },
  input: {
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
  }
): BusRouteDTO {
  const dup = db
    .prepare(`SELECT id FROM bus_routes WHERE route_number = ?`)
    .get(input.routeNumber);
  if (dup) throw conflict(`Bus route number '${input.routeNumber}' already exists`);

  const id = `br-${crypto.randomUUID().slice(0, 10)}`;
  const now = new Date().toISOString();

  db.transaction(() => {
    db.prepare(
      `INSERT INTO bus_routes (
        id, route_number, route_name, starting_point, destination, route_description,
        estimated_duration_min, frequency_min, service_start_time, service_end_time, service_status, is_sample, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    ).run(
      id,
      input.routeNumber,
      input.routeName,
      input.startingPoint,
      input.destination,
      input.routeDescription,
      input.estimatedDurationMin,
      input.frequencyMin,
      input.serviceStartTime,
      input.serviceEndTime,
      input.serviceStatus,
      now
    );

    recordAuditLog(db, {
      actorId: actor.userId,
      actorEmail: actor.email,
      action: 'BUS_ROUTE_CREATED',
      targetType: 'BUS_ROUTE',
      targetId: id,
      beforeSummary: 'None',
      afterSummary: `route=${input.routeNumber} (${input.routeName})`,
    });
  })();

  return getBusRouteById(db, id);
}

export function updateBusRoute(
  db: Database.Database,
  routeId: string,
  actor: { userId: string; email: string },
  input: Partial<{
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
): BusRouteDTO {
  const existing = db.prepare(`SELECT * FROM bus_routes WHERE id = ?`).get(routeId) as any;
  if (!existing) throw notFound(`Bus route '${routeId}' not found`);

  db.transaction(() => {
    db.prepare(
      `UPDATE bus_routes
       SET route_number = ?, route_name = ?, starting_point = ?, destination = ?, route_description = ?,
           estimated_duration_min = ?, frequency_min = ?, service_start_time = ?, service_end_time = ?, service_status = ?
       WHERE id = ?`
    ).run(
      input.routeNumber ?? existing.route_number,
      input.routeName ?? existing.route_name,
      input.startingPoint ?? existing.starting_point,
      input.destination ?? existing.destination,
      input.routeDescription ?? existing.route_description,
      input.estimatedDurationMin ?? existing.estimated_duration_min,
      input.frequencyMin ?? existing.frequency_min,
      input.serviceStartTime ?? existing.service_start_time,
      input.serviceEndTime ?? existing.service_end_time,
      input.serviceStatus ?? existing.service_status,
      routeId
    );

    recordAuditLog(db, {
      actorId: actor.userId,
      actorEmail: actor.email,
      action: 'BUS_ROUTE_UPDATED',
      targetType: 'BUS_ROUTE',
      targetId: routeId,
      beforeSummary: `status=${existing.service_status}`,
      afterSummary: `status=${input.serviceStatus ?? existing.service_status}`,
    });
  })();

  return getBusRouteById(db, routeId);
}

export function upsertBusRouteStop(
  db: Database.Database,
  routeId: string,
  actor: { userId: string; email: string },
  input: { stopId: string; stopOrder: number; travelMinutesFromStart: number }
): BusRouteDTO {
  const route = db.prepare(`SELECT id FROM bus_routes WHERE id = ?`).get(routeId);
  if (!route) throw notFound(`Bus route '${routeId}' not found`);
  const stop = db.prepare(`SELECT id FROM bus_stops WHERE id = ?`).get(input.stopId);
  if (!stop) throw notFound(`Bus stop '${input.stopId}' not found`);

  db.transaction(() => {
    db.prepare(`DELETE FROM bus_route_stops WHERE route_id = ? AND (stop_id = ? OR stop_order = ?)`).run(
      routeId,
      input.stopId,
      input.stopOrder
    );
    db.prepare(
      `INSERT INTO bus_route_stops (id, route_id, stop_id, stop_order, travel_minutes_from_start)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      `brs-${crypto.randomUUID().slice(0, 10)}`,
      routeId,
      input.stopId,
      input.stopOrder,
      input.travelMinutesFromStart
    );
    recordAuditLog(db, {
      actorId: actor.userId,
      actorEmail: actor.email,
      action: 'BUS_ROUTE_STOP_UPSERTED',
      targetType: 'BUS_ROUTE',
      targetId: routeId,
      beforeSummary: `stop=${input.stopId}`,
      afterSummary: `order=${input.stopOrder}, min=${input.travelMinutesFromStart}`,
    });
  })();

  return getBusRouteById(db, routeId);
}

export function removeBusRouteStop(
  db: Database.Database,
  routeId: string,
  stopId: string,
  actor: { userId: string; email: string }
): BusRouteDTO {
  const info = db
    .prepare(`DELETE FROM bus_route_stops WHERE route_id = ? AND stop_id = ?`)
    .run(routeId, stopId);
  if (info.changes === 0) throw notFound('Stop assignment not found on this route');

  recordAuditLog(db, {
    actorId: actor.userId,
    actorEmail: actor.email,
    action: 'BUS_ROUTE_STOP_REMOVED',
    targetType: 'BUS_ROUTE',
    targetId: routeId,
    beforeSummary: `stop=${stopId}`,
    afterSummary: 'removed',
  });
  return getBusRouteById(db, routeId);
}

export function createBusSchedule(
  db: Database.Database,
  actor: { userId: string; email: string },
  input: {
    routeId: string;
    stopId: string;
    scheduledArrival: string;
    scheduledDeparture: string;
    dayType: 'DAILY' | 'WEEKDAY' | 'WEEKEND';
    status: BusServiceStatus;
  }
): BusScheduleDTO {
  const route = db.prepare(`SELECT route_number, route_name FROM bus_routes WHERE id = ?`).get(input.routeId) as any;
  if (!route) throw badRequest('Bus route not found');
  const stop = db.prepare(`SELECT stop_name FROM bus_stops WHERE id = ?`).get(input.stopId) as any;
  if (!stop) throw badRequest('Bus stop not found');

  const id = `bsch-${crypto.randomUUID().slice(0, 10)}`;
  db.transaction(() => {
    db.prepare(
      `INSERT INTO bus_schedules (id, route_id, stop_id, scheduled_arrival, scheduled_departure, day_type, status, is_sample)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
    ).run(
      id,
      input.routeId,
      input.stopId,
      input.scheduledArrival,
      input.scheduledDeparture,
      input.dayType,
      input.status
    );
    recordAuditLog(db, {
      actorId: actor.userId,
      actorEmail: actor.email,
      action: 'BUS_SCHEDULE_CREATED',
      targetType: 'BUS_SCHEDULE',
      targetId: id,
      beforeSummary: 'None',
      afterSummary: `route=${route.route_number}, stop=${stop.stop_name}, dep=${input.scheduledDeparture}`,
    });
  })();

  return {
    id,
    routeId: input.routeId,
    routeNumber: route.route_number,
    routeName: route.route_name,
    stopId: input.stopId,
    stopName: stop.stop_name,
    scheduledArrival: input.scheduledArrival,
    scheduledDeparture: input.scheduledDeparture,
    dayType: input.dayType,
    status: input.status,
    isSample: true,
  };
}

export function updateBusSchedule(
  db: Database.Database,
  scheduleId: string,
  actor: { userId: string; email: string },
  input: Partial<{
    scheduledArrival: string;
    scheduledDeparture: string;
    dayType: 'DAILY' | 'WEEKDAY' | 'WEEKEND';
    status: BusServiceStatus;
  }>
) {
  const existing = db.prepare(`SELECT * FROM bus_schedules WHERE id = ?`).get(scheduleId) as any;
  if (!existing) throw notFound(`Schedule '${scheduleId}' not found`);

  db.transaction(() => {
    db.prepare(
      `UPDATE bus_schedules SET scheduled_arrival = ?, scheduled_departure = ?, day_type = ?, status = ? WHERE id = ?`
    ).run(
      input.scheduledArrival ?? existing.scheduled_arrival,
      input.scheduledDeparture ?? existing.scheduled_departure,
      input.dayType ?? existing.day_type,
      input.status ?? existing.status,
      scheduleId
    );
    recordAuditLog(db, {
      actorId: actor.userId,
      actorEmail: actor.email,
      action: 'BUS_SCHEDULE_UPDATED',
      targetType: 'BUS_SCHEDULE',
      targetId: scheduleId,
      beforeSummary: `dep=${existing.scheduled_departure}, status=${existing.status}`,
      afterSummary: `dep=${input.scheduledDeparture ?? existing.scheduled_departure}, status=${input.status ?? existing.status}`,
    });
  })();

  return db.prepare(`SELECT * FROM bus_schedules WHERE id = ?`).get(scheduleId);
}

export function getTransportStatsSummary(db: Database.Database) {
  const stops = (db.prepare(`SELECT COUNT(*) as cnt FROM bus_stops`).get() as { cnt: number }).cnt;
  const routes = (db.prepare(`SELECT COUNT(*) as cnt FROM bus_routes`).get() as { cnt: number }).cnt;
  const onSchedule = (
    db
      .prepare(`SELECT COUNT(*) as cnt FROM bus_routes WHERE service_status = 'ON_SCHEDULE'`)
      .get() as { cnt: number }
  ).cnt;

  return {
    totalStops: Number(stops || 0),
    totalRoutes: Number(routes || 0),
    onScheduleRoutes: Number(onSchedule || 0),
    isSample: true,
  };
}
