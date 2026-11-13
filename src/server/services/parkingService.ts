import Database from 'better-sqlite3';
import crypto from 'crypto';
import {
  ParkingLocationDTO,
  ParkingReservationDTO,
  ParkingSlotItemDTO,
  ParkingStatus,
  ParkingType,
  UserRole,
} from '../../shared/types.js';
import { haversineMeters } from '../algorithms/geo.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { recordAuditLog } from './auditService.js';

const DATA_NOTICE =
  'Sample / manually maintained parking availability (live sensor feed not connected)';

function deriveParkingStatus(
  availableSlots: number,
  totalSlots: number,
  explicitStatus?: ParkingStatus
): ParkingStatus {
  if (explicitStatus === 'TEMPORARILY_CLOSED') return 'TEMPORARILY_CLOSED';
  if (availableSlots <= 0) return 'FULL';
  if (explicitStatus === 'FULL') return 'FULL';
  if (availableSlots / Math.max(1, totalSlots) <= 0.2) return 'LIMITED';
  return 'AVAILABLE';
}

function mapParking(row: any, refLat?: number, refLng?: number): ParkingLocationDTO {
  const totalSlots = Number(row.total_slots);
  const availableSlots = Math.max(0, Math.min(totalSlots, Number(row.available_slots)));
  const distanceMeters =
    refLat !== undefined && refLng !== undefined
      ? Math.round(haversineMeters(refLat, refLng, row.latitude, row.longitude))
      : undefined;

  return {
    id: row.id,
    parkingName: row.parking_name,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    parkingType: row.parking_type as ParkingType,
    totalSlots,
    availableSlots,
    occupiedSlots: Math.max(0, totalSlots - availableSlots),
    pricePerHour: Number(row.price_per_hour),
    priceLabel: row.price_label,
    openingTime: row.opening_time,
    closingTime: row.closing_time,
    contactInfo: row.contact_info || null,
    status: row.status as ParkingStatus,
    distanceMeters,
    isSample: Boolean(row.is_sample),
    dataNotice: DATA_NOTICE,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

function mapReservation(row: any, includeUser = false): ParkingReservationDTO {
  return {
    id: row.id,
    userId: row.user_id,
    ...(includeUser && row.user_name ? { userName: row.user_name } : {}),
    ...(includeUser && row.user_email ? { userEmail: row.user_email } : {}),
    parkingId: row.parking_id,
    parkingName: row.parking_name || undefined,
    parkingAddress: row.parking_address || undefined,
    slotNumber: row.slot_number,
    vehicleType: row.vehicle_type,
    vehicleNumber: row.vehicle_number || null,
    reservationTime: row.reservation_time,
    durationHours: Number(row.duration_hours),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listParkingLocations(
  db: Database.Database,
  filters: {
    q?: string;
    type?: string;
    availability?: string;
    maxPrice?: number;
    lat?: number;
    lng?: number;
    sort?: string;
  }
): ParkingLocationDTO[] {
  let sql = `SELECT * FROM parking_locations WHERE 1=1`;
  const params: any[] = [];

  if (filters.q) {
    sql += ` AND (LOWER(parking_name) LIKE ? OR LOWER(address) LIKE ?)`;
    const term = `%${filters.q.trim().toLowerCase()}%`;
    params.push(term, term);
  }

  if (filters.type && filters.type !== 'ALL') {
    if (filters.type === 'CAR') {
      sql += ` AND parking_type IN ('CAR', 'BOTH')`;
    } else if (filters.type === 'BIKE') {
      sql += ` AND parking_type IN ('BIKE', 'BOTH')`;
    } else {
      sql += ` AND parking_type = ?`;
      params.push(filters.type);
    }
  }

  if (filters.availability && filters.availability !== 'ALL') {
    if (filters.availability === 'OPEN_SPACES') {
      sql += ` AND available_slots > 0 AND status != 'TEMPORARILY_CLOSED'`;
    } else {
      sql += ` AND status = ?`;
      params.push(filters.availability);
    }
  }

  if (filters.maxPrice !== undefined && !Number.isNaN(filters.maxPrice)) {
    sql += ` AND price_per_hour <= ?`;
    params.push(filters.maxPrice);
  }

  const rows = db.prepare(sql).all(...params) as Array<any>;
  const refLat = filters.lat ?? 15.852;
  const refLng = filters.lng ?? 74.501;

  const list = rows.map((r) => mapParking(r, refLat, refLng));

  if (filters.sort === 'available') {
    list.sort((a, b) => b.availableSlots - a.availableSlots || (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));
  } else if (filters.sort === 'price') {
    list.sort((a, b) => a.pricePerHour - b.pricePerHour || (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));
  } else {
    list.sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));
  }

  return list;
}

export function getNearbyParking(
  db: Database.Database,
  lat: number,
  lng: number,
  limit = 4
): ParkingLocationDTO[] {
  const all = listParkingLocations(db, { lat, lng, sort: 'distance' });
  const prioritized = [
    ...all.filter((p) => p.status !== 'TEMPORARILY_CLOSED' && p.availableSlots > 0),
    ...all.filter((p) => p.status === 'FULL'),
  ];
  return prioritized.slice(0, limit);
}

export function getParkingById(
  db: Database.Database,
  parkingId: string,
  viewerUserId?: string,
  lat?: number,
  lng?: number
): { parking: ParkingLocationDTO; slots: ParkingSlotItemDTO[] } {
  const row = db.prepare(`SELECT * FROM parking_locations WHERE id = ?`).get(parkingId) as any;
  if (!row) throw notFound(`Parking location '${parkingId}' not found`);

  const parking = mapParking(row, lat ?? 15.852, lng ?? 74.501);

  const activeReservations = db
    .prepare(
      `SELECT slot_number, user_id FROM parking_reservations WHERE parking_id = ? AND status = 'ACTIVE'`
    )
    .all(parkingId) as Array<{ slot_number: string; user_id: string }>;

  const reservedMap = new Map(activeReservations.map((r) => [r.slot_number, r.user_id]));

  const displayCap = Math.min(parking.totalSlots, 48);
  const slots: ParkingSlotItemDTO[] = [];

  for (let i = 1; i <= displayCap; i++) {
    const label = `S-${String(i).padStart(2, '0')}`;
    const resUser = reservedMap.get(label);
    slots.push({
      slotNumber: label,
      occupied: Boolean(resUser),
      reservedByCurrentUser: Boolean(viewerUserId && resUser === viewerUserId),
    });
  }

  // Mark baseline occupied slots (beyond explicit reservations) from the end so available slot count matches
  const nonReservedOccupiedNeeded = Math.max(
    0,
    parking.occupiedSlots - activeReservations.length
  );
  let marked = 0;
  for (let i = slots.length - 1; i >= 0 && marked < nonReservedOccupiedNeeded; i--) {
    if (!slots[i].occupied) {
      slots[i].occupied = true;
      marked++;
    }
  }

  return { parking, slots };
}

export function reserveParkingSlot(
  db: Database.Database,
  parkingId: string,
  actor: { userId: string; email: string },
  input: {
    slotNumber: string;
    vehicleType: 'CAR' | 'BIKE';
    vehicleNumber?: string | null;
    reservationTime?: string;
    durationHours: number;
  }
): { reservation: ParkingReservationDTO; parking: ParkingLocationDTO } {
  const now = new Date().toISOString();
  const reservationId = `pres-${crypto.randomUUID().slice(0, 10)}`;

  const tx = db.transaction(() => {
    const parkingRow = db
      .prepare(`SELECT * FROM parking_locations WHERE id = ?`)
      .get(parkingId) as any;
    if (!parkingRow) throw notFound(`Parking location '${parkingId}' not found`);

    if (parkingRow.status === 'TEMPORARILY_CLOSED') {
      throw conflict('This parking facility is temporarily closed');
    }

    if (
      (parkingRow.parking_type === 'CAR' && input.vehicleType !== 'CAR') ||
      (parkingRow.parking_type === 'BIKE' && input.vehicleType !== 'BIKE')
    ) {
      throw badRequest(
        `This parking location only supports ${parkingRow.parking_type} vehicles`
      );
    }

    if (parkingRow.available_slots <= 0 || parkingRow.status === 'FULL') {
      throw conflict('No available parking slots remain at this location');
    }

    const existingActive = db
      .prepare(
        `SELECT id FROM parking_reservations WHERE parking_id = ? AND slot_number = ? AND status = 'ACTIVE'`
      )
      .get(parkingId, input.slotNumber);
    if (existingActive) {
      throw conflict(`Slot '${input.slotNumber}' is already reserved`);
    }

    try {
      db.prepare(
        `INSERT INTO parking_reservations (
          id, user_id, parking_id, slot_number, vehicle_type, vehicle_number, reservation_time, duration_hours, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`
      ).run(
        reservationId,
        actor.userId,
        parkingId,
        input.slotNumber,
        input.vehicleType,
        input.vehicleNumber || null,
        input.reservationTime || now,
        input.durationHours,
        now,
        now
      );
    } catch (err: any) {
      if (String(err?.message || '').includes('UNIQUE')) {
        throw conflict(`Slot '${input.slotNumber}' was just reserved by another driver`);
      }
      throw err;
    }

    const nextAvailable = Math.max(0, Number(parkingRow.available_slots) - 1);
    const nextStatus = deriveParkingStatus(nextAvailable, Number(parkingRow.total_slots));

    db.prepare(
      `UPDATE parking_locations SET available_slots = ?, status = ?, updated_at = ? WHERE id = ?`
    ).run(nextAvailable, nextStatus, now, parkingId);

    recordAuditLog(db, {
      actorId: actor.userId,
      actorEmail: actor.email,
      action: 'PARKING_SLOT_RESERVED',
      targetType: 'PARKING_RESERVATION',
      targetId: reservationId,
      beforeSummary: `available=${parkingRow.available_slots}`,
      afterSummary: `parking=${parkingId}, slot=${input.slotNumber}, available=${nextAvailable}`,
    });
  });

  tx();

  const resRow = db
    .prepare(
      `SELECT pr.*, p.parking_name, p.address as parking_address
       FROM parking_reservations pr
       JOIN parking_locations p ON p.id = pr.parking_id
       WHERE pr.id = ?`
    )
    .get(reservationId);
  const updatedParking = db
    .prepare(`SELECT * FROM parking_locations WHERE id = ?`)
    .get(parkingId);

  return {
    reservation: mapReservation(resRow),
    parking: mapParking(updatedParking),
  };
}

export function listUserReservations(
  db: Database.Database,
  userId: string
): ParkingReservationDTO[] {
  const rows = db
    .prepare(
      `SELECT pr.*, p.parking_name, p.address as parking_address
       FROM parking_reservations pr
       JOIN parking_locations p ON p.id = pr.parking_id
       WHERE pr.user_id = ?
       ORDER BY pr.created_at DESC`
    )
    .all(userId) as Array<any>;

  return rows.map((r) => mapReservation(r));
}

export function cancelParkingReservation(
  db: Database.Database,
  reservationId: string,
  actor: { userId: string; email: string; role: UserRole }
): { reservation: ParkingReservationDTO; parking: ParkingLocationDTO } {
  const now = new Date().toISOString();
  let parkingId = '';

  const tx = db.transaction(() => {
    const existing = db
      .prepare(`SELECT * FROM parking_reservations WHERE id = ?`)
      .get(reservationId) as any;
    if (!existing) throw notFound(`Reservation '${reservationId}' not found`);

    if (existing.user_id !== actor.userId && actor.role !== 'ADMIN') {
      throw forbidden('You can only cancel your own parking reservations');
    }
    if (existing.status !== 'ACTIVE') {
      throw conflict(`Reservation is already '${existing.status}'`);
    }

    parkingId = existing.parking_id;

    db.prepare(
      `UPDATE parking_reservations SET status = 'CANCELLED', updated_at = ? WHERE id = ?`
    ).run(now, reservationId);

    const pRow = db
      .prepare(`SELECT * FROM parking_locations WHERE id = ?`)
      .get(parkingId) as any;
    if (pRow) {
      const nextAvail = Math.min(Number(pRow.total_slots), Number(pRow.available_slots) + 1);
      const nextStatus =
        pRow.status === 'TEMPORARILY_CLOSED'
          ? 'TEMPORARILY_CLOSED'
          : deriveParkingStatus(nextAvail, Number(pRow.total_slots));

      db.prepare(
        `UPDATE parking_locations SET available_slots = ?, status = ?, updated_at = ? WHERE id = ?`
      ).run(nextAvail, nextStatus, now, parkingId);
    }

    recordAuditLog(db, {
      actorId: actor.userId,
      actorEmail: actor.email,
      action: 'PARKING_RESERVATION_CANCELLED',
      targetType: 'PARKING_RESERVATION',
      targetId: reservationId,
      beforeSummary: `status=ACTIVE, slot=${existing.slot_number}`,
      afterSummary: `status=CANCELLED`,
    });
  });

  tx();

  const resRow = db
    .prepare(
      `SELECT pr.*, p.parking_name, p.address as parking_address
       FROM parking_reservations pr
       JOIN parking_locations p ON p.id = pr.parking_id
       WHERE pr.id = ?`
    )
    .get(reservationId);
  const pRow = db.prepare(`SELECT * FROM parking_locations WHERE id = ?`).get(parkingId);

  return {
    reservation: mapReservation(resRow),
    parking: mapParking(pRow),
  };
}

export function createParkingLocation(
  db: Database.Database,
  actor: { userId: string; email: string },
  input: {
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
  }
): ParkingLocationDTO {
  if (input.availableSlots > input.totalSlots) {
    throw badRequest('Available slots cannot exceed total capacity');
  }

  const id = `park-${crypto.randomUUID().slice(0, 10)}`;
  const now = new Date().toISOString();
  const status = deriveParkingStatus(input.availableSlots, input.totalSlots, input.status);
  const effectiveAvailable = status === 'FULL' ? 0 : input.availableSlots;
  const priceLabel =
    input.priceLabel ||
    (input.pricePerHour === 0 ? 'Free' : `₹${input.pricePerHour}/hr`);

  db.transaction(() => {
    db.prepare(
      `INSERT INTO parking_locations (
        id, parking_name, address, latitude, longitude, parking_type,
        total_slots, available_slots, price_per_hour, price_label,
        opening_time, closing_time, contact_info, status, is_sample, updated_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    ).run(
      id,
      input.parkingName,
      input.address,
      input.latitude,
      input.longitude,
      input.parkingType,
      input.totalSlots,
      effectiveAvailable,
      input.pricePerHour,
      priceLabel,
      input.openingTime,
      input.closingTime,
      input.contactInfo || null,
      status,
      now,
      now
    );

    recordAuditLog(db, {
      actorId: actor.userId,
      actorEmail: actor.email,
      action: 'PARKING_CREATED',
      targetType: 'PARKING_LOCATION',
      targetId: id,
      beforeSummary: 'None',
      afterSummary: `name=${input.parkingName}, total=${input.totalSlots}, status=${status}`,
    });
  })();

  const created = db.prepare(`SELECT * FROM parking_locations WHERE id = ?`).get(id);
  return mapParking(created);
}

export function updateParkingLocation(
  db: Database.Database,
  parkingId: string,
  actor: { userId: string; email: string },
  input: Partial<{
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
): ParkingLocationDTO {
  const existing = db
    .prepare(`SELECT * FROM parking_locations WHERE id = ?`)
    .get(parkingId) as any;
  if (!existing) throw notFound(`Parking location '${parkingId}' not found`);

  const nextTotal = input.totalSlots ?? Number(existing.total_slots);
  let nextAvailable =
    input.availableSlots !== undefined
      ? Math.min(nextTotal, Math.max(0, input.availableSlots))
      : Math.min(nextTotal, Number(existing.available_slots));

  if (input.status === 'FULL') {
    nextAvailable = 0;
  }

  const nextStatus =
    input.status === 'TEMPORARILY_CLOSED'
      ? 'TEMPORARILY_CLOSED'
      : input.status === 'FULL'
      ? 'FULL'
      : deriveParkingStatus(nextAvailable, nextTotal, input.status);

  const nextPrice = input.pricePerHour ?? Number(existing.price_per_hour);
  const nextPriceLabel =
    input.priceLabel ??
    (input.pricePerHour !== undefined
      ? nextPrice === 0
        ? 'Free'
        : `₹${nextPrice}/hr`
      : existing.price_label);

  const now = new Date().toISOString();

  db.transaction(() => {
    db.prepare(
      `UPDATE parking_locations
       SET parking_name = ?, address = ?, latitude = ?, longitude = ?, parking_type = ?,
           total_slots = ?, available_slots = ?, price_per_hour = ?, price_label = ?,
           opening_time = ?, closing_time = ?, contact_info = ?, status = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      input.parkingName ?? existing.parking_name,
      input.address ?? existing.address,
      input.latitude ?? existing.latitude,
      input.longitude ?? existing.longitude,
      input.parkingType ?? existing.parking_type,
      nextTotal,
      nextAvailable,
      nextPrice,
      nextPriceLabel,
      input.openingTime ?? existing.opening_time,
      input.closingTime ?? existing.closing_time,
      input.contactInfo !== undefined ? input.contactInfo : existing.contact_info,
      nextStatus,
      now,
      parkingId
    );

    recordAuditLog(db, {
      actorId: actor.userId,
      actorEmail: actor.email,
      action: 'PARKING_UPDATED',
      targetType: 'PARKING_LOCATION',
      targetId: parkingId,
      beforeSummary: `avail=${existing.available_slots}/${existing.total_slots}, status=${existing.status}`,
      afterSummary: `avail=${nextAvailable}/${nextTotal}, status=${nextStatus}`,
    });
  })();

  const updated = db.prepare(`SELECT * FROM parking_locations WHERE id = ?`).get(parkingId);
  return mapParking(updated);
}

export function listAllReservationsAdmin(db: Database.Database): ParkingReservationDTO[] {
  const rows = db
    .prepare(
      `SELECT pr.*, p.parking_name, p.address as parking_address, u.name as user_name, u.email as user_email
       FROM parking_reservations pr
       JOIN parking_locations p ON p.id = pr.parking_id
       JOIN users u ON u.id = pr.user_id
       ORDER BY pr.created_at DESC
       LIMIT 100`
    )
    .all() as Array<any>;

  return rows.map((r) => mapReservation(r, true));
}

export function getParkingStatsSummary(db: Database.Database) {
  const row = db
    .prepare(
      `SELECT COUNT(*) as totalLocations,
              COALESCE(SUM(total_slots), 0) as totalCapacity,
              COALESCE(SUM(CASE WHEN status != 'TEMPORARILY_CLOSED' THEN available_slots ELSE 0 END), 0) as availableSpaces
       FROM parking_locations`
    )
    .get() as any;

  const activeRes = (
    db
      .prepare(`SELECT COUNT(*) as cnt FROM parking_reservations WHERE status = 'ACTIVE'`)
      .get() as { cnt: number }
  ).cnt;

  return {
    totalLocations: Number(row.totalLocations || 0),
    totalCapacity: Number(row.totalCapacity || 0),
    availableSpaces: Number(row.availableSpaces || 0),
    activeReservations: Number(activeRes || 0),
    isSample: true,
  };
}
