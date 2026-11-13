import crypto from 'crypto';
import Database from 'better-sqlite3';
import { env } from '../config/env.js';
import {
  EmergencyAssistanceEventType,
  EmergencyAssistanceLogDTO,
  EmergencyContactDTO,
  NearbyHospitalDTO,
  NearbyHospitalsResponseDTO,
} from '../../shared/types.js';
import { haversineMeters } from '../algorithms/geo.js';
import { forbidden, notFound } from '../utils/errors.js';

function getServerMapsKey(): string {
  const k = (
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    env.googleMapsApiKey ||
    ''
  ).trim();
  if (!k || k === 'YOUR_API_KEY' || k === 'MY_GOOGLE_MAPS_API_KEY') return '';
  return k;
}

function isExternalNetworkAllowed(): boolean {
  if (process.env.TRAFFIX_DISABLE_EXTERNAL === 'true') return false;
  if (process.env.VITEST === 'true' && process.env.TRAFFIX_TEST_FETCH !== 'true') {
    return false;
  }
  return true;
}

function mapContactRow(r: any): EmergencyContactDTO {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    relationship: r.relationship,
    phone: r.phone,
    notes: r.notes || null,
    isPrimary: Boolean(r.is_primary),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapLogRow(r: any): EmergencyAssistanceLogDTO {
  return {
    id: r.id,
    userId: r.user_id || null,
    eventType: r.event_type as EmergencyAssistanceEventType,
    serviceDialed: r.service_dialed || null,
    contactName: r.contact_name || null,
    latitude: r.latitude !== null && r.latitude !== undefined ? Number(r.latitude) : null,
    longitude: r.longitude !== null && r.longitude !== undefined ? Number(r.longitude) : null,
    locationLabel: r.location_label || null,
    hospitalPlaceId: r.hospital_place_id || null,
    hospitalName: r.hospital_name || null,
    sharedChannel: r.shared_channel || null,
    notes: r.notes || null,
    createdAt: r.created_at,
  };
}

export function listEmergencyContacts(
  db: Database.Database,
  userId: string
): EmergencyContactDTO[] {
  const rows = db
    .prepare(
      `SELECT * FROM emergency_contacts
       WHERE user_id = ?
       ORDER BY is_primary DESC, created_at DESC`
    )
    .all(userId);
  return rows.map(mapContactRow);
}

export function createEmergencyContact(
  db: Database.Database,
  userId: string,
  input: {
    name: string;
    relationship: string;
    phone: string;
    notes?: string | null;
    isPrimary?: boolean;
  }
): EmergencyContactDTO {
  const now = new Date().toISOString();
  const id = `ec-${crypto.randomUUID().slice(0, 8)}`;

  const tx = db.transaction(() => {
    if (input.isPrimary) {
      db.prepare('UPDATE emergency_contacts SET is_primary = 0 WHERE user_id = ?').run(userId);
    }
    db.prepare(
      `INSERT INTO emergency_contacts (
        id, user_id, name, relationship, phone, notes, is_primary, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      userId,
      input.name.trim(),
      input.relationship.trim(),
      input.phone.trim(),
      input.notes?.trim() || null,
      input.isPrimary ? 1 : 0,
      now,
      now
    );
  });
  tx();

  const row = db.prepare('SELECT * FROM emergency_contacts WHERE id = ?').get(id);
  return mapContactRow(row);
}

export function updateEmergencyContact(
  db: Database.Database,
  userId: string,
  contactId: string,
  input: Partial<{
    name: string;
    relationship: string;
    phone: string;
    notes: string | null;
    isPrimary: boolean;
  }>
): EmergencyContactDTO {
  const existing = db.prepare('SELECT * FROM emergency_contacts WHERE id = ?').get(contactId) as any;
  if (!existing) throw notFound('Emergency contact not found');
  if (existing.user_id !== userId) throw forbidden('Cannot modify another user contact');

  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    if (input.isPrimary) {
      db.prepare('UPDATE emergency_contacts SET is_primary = 0 WHERE user_id = ?').run(userId);
    }
    db.prepare(
      `UPDATE emergency_contacts
       SET name = ?, relationship = ?, phone = ?, notes = ?, is_primary = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      input.name !== undefined ? input.name.trim() : existing.name,
      input.relationship !== undefined ? input.relationship.trim() : existing.relationship,
      input.phone !== undefined ? input.phone.trim() : existing.phone,
      input.notes !== undefined ? input.notes?.trim() || null : existing.notes,
      input.isPrimary !== undefined ? (input.isPrimary ? 1 : 0) : existing.is_primary,
      now,
      contactId
    );
  });
  tx();

  const updated = db.prepare('SELECT * FROM emergency_contacts WHERE id = ?').get(contactId);
  return mapContactRow(updated);
}

export function deleteEmergencyContact(
  db: Database.Database,
  userId: string,
  contactId: string
): void {
  const existing = db.prepare('SELECT * FROM emergency_contacts WHERE id = ?').get(contactId) as any;
  if (!existing) throw notFound('Emergency contact not found');
  if (existing.user_id !== userId) throw forbidden('Cannot delete another user contact');
  db.prepare('DELETE FROM emergency_contacts WHERE id = ?').run(contactId);
}

export function listAssistanceHistory(
  db: Database.Database,
  userId: string,
  limit = 40
): EmergencyAssistanceLogDTO[] {
  const rows = db
    .prepare(
      `SELECT * FROM emergency_assistance_logs
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(userId, Math.min(100, Math.max(1, limit)));
  return rows.map(mapLogRow);
}

export function recordAssistanceEvent(
  db: Database.Database,
  userId: string | null,
  input: {
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
  }
): EmergencyAssistanceLogDTO {
  const id = `soslog-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO emergency_assistance_logs (
      id, user_id, event_type, service_dialed, contact_name, latitude, longitude,
      location_label, hospital_place_id, hospital_name, shared_channel, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    input.eventType,
    input.serviceDialed?.trim() || null,
    input.contactName?.trim() || null,
    input.latitude ?? null,
    input.longitude ?? null,
    input.locationLabel?.trim() || null,
    input.hospitalPlaceId?.trim() || null,
    input.hospitalName?.trim() || null,
    input.sharedChannel?.trim() || null,
    input.notes?.trim() || null,
    now
  );

  const row = db.prepare('SELECT * FROM emergency_assistance_logs WHERE id = ?').get(id);
  return mapLogRow(row);
}

export async function findNearbyHospitals(
  lat: number,
  lng: number,
  radiusMeters = 8000
): Promise<NearbyHospitalsResponseDTO> {
  const searchedAt = new Date().toISOString();
  const apiKey = getServerMapsKey();

  if (!isExternalNetworkAllowed()) {
    return {
      hospitals: [],
      source: 'UNAVAILABLE',
      quotaExceeded: false,
      notice:
        'External Google Places lookup disabled in isolated test mode. Live Places API (New) lookup runs when network access is active.',
      searchedAt,
    };
  }

  if (!apiKey && process.env.TRAFFIX_TEST_FETCH !== 'true') {
    return {
      hospitals: [],
      source: 'UNAVAILABLE',
      quotaExceeded: false,
      notice:
        'Google Maps API key is not configured on the server; real hospital lookup is unavailable. Use emergency numbers 108 / 112 directly.',
      searchedAt,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey || 'test-key',
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.formattedAddress,places.location,places.nationalPhoneNumber,places.internationalPhoneNumber,places.currentOpeningHours.openNow,places.rating,places.userRatingCount,places.googleMapsUri,places.primaryTypeDisplayName',
      },
      body: JSON.stringify({
        includedTypes: ['hospital'],
        maxResultCount: 12,
        rankPreference: 'DISTANCE',
        locationRestriction: {
          circle: {
            center: {
              latitude: lat,
              longitude: lng,
            },
            radius: Math.min(25000, Math.max(500, radiusMeters)),
          },
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      let quotaExceeded = res.status === 429;
      let errMsg = `Google Places API HTTP ${res.status}`;
      try {
        const errJson = (await res.json()) as any;
        if (errJson?.error?.status === 'RESOURCE_EXHAUSTED') quotaExceeded = true;
        if (errJson?.error?.message) errMsg = String(errJson.error.message);
      } catch {
        // ignore JSON parse failure
      }
      return {
        hospitals: [],
        source: 'UNAVAILABLE',
        quotaExceeded,
        notice: quotaExceeded
          ? 'Google Maps Places API quota reached. Please dial 108 (Ambulance) or 112 (Emergency) directly if needed.'
          : `Google Places Nearby Search returned an error (${errMsg}). No fabricated hospital records are shown.`,
        searchedAt,
      };
    }

    const data = (await res.json()) as { places?: Array<any> };
    const rawPlaces = Array.isArray(data?.places) ? data.places : [];

    const hospitals: NearbyHospitalDTO[] = rawPlaces
      .map((item) => {
        const hLat = Number(item?.location?.latitude);
        const hLng = Number(item?.location?.longitude);
        if (!Number.isFinite(hLat) || !Number.isFinite(hLng)) return null;

        const name = item?.displayName?.text
          ? String(item.displayName.text)
          : 'Hospital';
        const address = item?.formattedAddress
          ? String(item.formattedAddress)
          : `${hLat.toFixed(5)}, ${hLng.toFixed(5)}`;
        const phone =
          item?.nationalPhoneNumber || item?.internationalPhoneNumber || null;

        return {
          placeId: String(item?.id || `${hLat.toFixed(5)}-${hLng.toFixed(5)}`),
          name,
          address,
          latitude: Number(hLat.toFixed(6)),
          longitude: Number(hLng.toFixed(6)),
          distanceMeters: Math.round(haversineMeters(lat, lng, hLat, hLng)),
          phone: phone ? String(phone) : null,
          openNow:
            typeof item?.currentOpeningHours?.openNow === 'boolean'
              ? item.currentOpeningHours.openNow
              : null,
          rating: typeof item?.rating === 'number' ? Number(item.rating.toFixed(1)) : null,
          userRatingCount:
            typeof item?.userRatingCount === 'number' ? item.userRatingCount : null,
          googleMapsUri: item?.googleMapsUri ? String(item.googleMapsUri) : null,
          primaryType: item?.primaryTypeDisplayName?.text
            ? String(item.primaryTypeDisplayName.text)
            : 'Hospital',
          source: 'GOOGLE_PLACES_NEW' as const,
        };
      })
      .filter(Boolean) as NearbyHospitalDTO[];

    hospitals.sort((a, b) => a.distanceMeters - b.distanceMeters);

    return {
      hospitals,
      source: 'GOOGLE_PLACES_NEW',
      quotaExceeded: false,
      notice:
        hospitals.length > 0
          ? `Found ${hospitals.length} nearby hospitals via Google Places API (New).`
          : 'No hospitals returned by Google Places API (New) within the selected search radius.',
      searchedAt,
    };
  } catch (err: any) {
    return {
      hospitals: [],
      source: 'UNAVAILABLE',
      quotaExceeded: false,
      notice:
        err?.name === 'AbortError'
          ? 'Hospital search timed out. Use emergency numbers 108 / 112 directly if urgent.'
          : 'Unable to reach Google Places API right now. No synthetic hospitals shown.',
      searchedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}
