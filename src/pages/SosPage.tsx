import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Ambulance,
  CheckCircle2,
  Clock,
  Copy,
  Edit3,
  ExternalLink,
  Flame,
  Hospital,
  LocateFixed,
  Mail,
  MapPin,
  MessageSquare,
  Navigation,
  Phone,
  Plus,
  RefreshCw,
  Share2,
  Shield,
  Siren,
  Star,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { WorkspaceLayout } from '../components/Layout';
import { TrafficMap } from '../components/TrafficMap';
import { dispatchGmpQuotaExceeded } from '../config/maps';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { routesApi, sosApi } from '../services/api';
import {
  EmergencyAssistanceEventType,
  EmergencyAssistanceLogDTO,
  EmergencyContactDTO,
  NearbyHospitalDTO,
  RoadNodeDTO,
  RoadSegmentDTO,
} from '../shared/types';

const LOCAL_CONTACTS_KEY = 'traffix_local_emergency_contacts_v1';
const LOCAL_HISTORY_KEY = 'traffix_local_sos_history_v1';

interface GpsPoint {
  lat: number;
  lng: number;
  accuracyMeters: number | null;
  capturedAt: string;
  label: string;
  source: 'GPS' | 'DEFAULT_CORRIDOR' | 'MAP_PIN';
}

function loadLocalContacts(): EmergencyContactDTO[] {
  try {
    const raw = localStorage.getItem(LOCAL_CONTACTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalContacts(list: EmergencyContactDTO[]) {
  try {
    localStorage.setItem(LOCAL_CONTACTS_KEY, JSON.stringify(list));
  } catch {
    // ignore storage limits
  }
}

function loadLocalHistory(): EmergencyAssistanceLogDTO[] {
  try {
    const raw = localStorage.getItem(LOCAL_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalHistory(list: EmergencyAssistanceLogDTO[]) {
  try {
    localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(list.slice(0, 40)));
  } catch {
    // ignore storage limits
  }
}

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
}

function formatEventTitle(log: EmergencyAssistanceLogDTO): string {
  switch (log.eventType) {
    case 'SOS_TRIGGERED':
      return 'SOS Location Lock & Hospital Check Activated';
    case 'DIAL_CLICKED':
      return `Device Dialer Opened (${log.serviceDialed || log.contactName || 'Emergency'})`;
    case 'LOCATION_SHARED':
      return `Location Share Prepared (${log.sharedChannel || 'Link'})`;
    case 'HOSPITAL_VIEWED':
      return `Selected Hospital: ${log.hospitalName || 'Nearby Hospital'}`;
    default:
      return log.eventType;
  }
}

export function SosPage() {
  const { user } = useAuth();
  const { pushToast } = useToast();

  const [nodes, setNodes] = useState<RoadNodeDTO[]>([]);
  const [segments, setSegments] = useState<RoadSegmentDTO[]>([]);

  const [gpsPoint, setGpsPoint] = useState<GpsPoint>({
    lat: 15.853,
    lng: 74.502,
    accuracyMeters: null,
    capturedAt: new Date().toISOString(),
    label: 'Belagavi Central Corridor (Reference Center — Enable GPS for Exact Position)',
    source: 'DEFAULT_CORRIDOR',
  });
  const [gpsStatus, setGpsStatus] = useState<'IDLE' | 'LOCATING' | 'GRANTED' | 'DENIED'>('IDLE');
  const [gpsError, setGpsError] = useState<string | null>(null);

  const [hospitals, setHospitals] = useState<NearbyHospitalDTO[]>([]);
  const [hospitalsNotice, setHospitalsNotice] = useState<string>(
    'Lock your GPS location or tap Search Hospitals to discover nearby medical facilities via Google Places API (New).'
  );
  const [hospitalsSource, setHospitalsSource] = useState<'GOOGLE_PLACES_NEW' | 'UNAVAILABLE' | 'IDLE'>(
    'IDLE'
  );
  const [loadingHospitals, setLoadingHospitals] = useState(false);
  const [searchRadius, setSearchRadius] = useState<number>(8000);
  const [selectedHospital, setSelectedHospital] = useState<NearbyHospitalDTO | null>(null);
  const [fitBoundsKey, setFitBoundsKey] = useState(0);

  const [contacts, setContacts] = useState<EmergencyContactDTO[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [contactName, setContactName] = useState('');
  const [contactRelation, setContactRelation] = useState('Family');
  const [contactPhone, setContactPhone] = useState('');
  const [contactNotes, setContactNotes] = useState('');
  const [contactPrimary, setContactPrimary] = useState(false);
  const [savingContact, setSavingContact] = useState(false);

  const [history, setHistory] = useState<EmergencyAssistanceLogDTO[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sosActiveBanner, setSosActiveBanner] = useState(false);

  const appendHistory = useCallback(
    async (payload: {
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
    }) => {
      try {
        const created = await sosApi.logEvent(payload);
        setHistory((prev) => {
          const next = [created, ...prev].slice(0, 40);
          if (!user) saveLocalHistory(next);
          return next;
        });
      } catch {
        // Fallback local record if offline or network blocked
        const fallback: EmergencyAssistanceLogDTO = {
          id: `local-${Date.now()}`,
          userId: user?.id || null,
          eventType: payload.eventType,
          serviceDialed: payload.serviceDialed || null,
          contactName: payload.contactName || null,
          latitude: payload.latitude ?? null,
          longitude: payload.longitude ?? null,
          locationLabel: payload.locationLabel || null,
          hospitalPlaceId: payload.hospitalPlaceId || null,
          hospitalName: payload.hospitalName || null,
          sharedChannel: payload.sharedChannel || null,
          notes: payload.notes || null,
          createdAt: new Date().toISOString(),
        };
        setHistory((prev) => {
          const next = [fallback, ...prev].slice(0, 40);
          saveLocalHistory(next);
          return next;
        });
      }
    },
    [user]
  );

  const fetchHospitals = useCallback(
    async (lat: number, lng: number, radius = searchRadius) => {
      setLoadingHospitals(true);
      try {
        const resp = await sosApi.getNearbyHospitals(lat, lng, radius);
        setHospitals(resp.hospitals);
        setHospitalsSource(resp.source);
        setHospitalsNotice(resp.notice);
        if (resp.quotaExceeded) {
          dispatchGmpQuotaExceeded();
        }
        if (resp.hospitals.length > 0) {
          setSelectedHospital(resp.hospitals[0]);
        } else {
          setSelectedHospital(null);
        }
        setFitBoundsKey((k) => k + 1);
      } catch (err: any) {
        setHospitals([]);
        setHospitalsSource('UNAVAILABLE');
        setHospitalsNotice(
          err?.message || 'Unable to query nearby hospitals right now. Dial 108 / 112 directly.'
        );
      } finally {
        setLoadingHospitals(false);
      }
    },
    [searchRadius]
  );

  // Initial road network + contacts + history
  useEffect(() => {
    routesApi
      .getNetwork()
      .then((net) => {
        setNodes(net.nodes);
        setSegments(net.segments);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (user) {
      setLoadingContacts(true);
      setLoadingHistory(true);
      Promise.all([sosApi.listContacts(), sosApi.listHistory(40)])
        .then(([c, h]) => {
          setContacts(c);
          setHistory(h);
        })
        .catch(() => {
          setContacts(loadLocalContacts());
          setHistory(loadLocalHistory());
        })
        .finally(() => {
          setLoadingContacts(false);
          setLoadingHistory(false);
        });
    } else {
      setContacts(loadLocalContacts());
      setHistory(loadLocalHistory());
    }
  }, [user]);

  // Fetch initial hospitals near corridor center so map immediately displays available real data
  useEffect(() => {
    fetchHospitals(15.853, 74.502, 8000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const captureGpsLocation = useCallback(
    (triggerSosLog = false) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        setGpsStatus('DENIED');
        setGpsError('Geolocation is not supported by this browser.');
        return;
      }

      setGpsStatus('LOCATING');
      setGpsError(null);

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = Number(pos.coords.latitude.toFixed(6));
          const lng = Number(pos.coords.longitude.toFixed(6));
          const acc = Math.round(pos.coords.accuracy);
          let label = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

          try {
            const rev = await routesApi.reverseGeocode(lat, lng);
            if (rev?.label) label = rev.label;
          } catch {
            // keep coordinate label cleanly
          }

          const nextPoint: GpsPoint = {
            lat,
            lng,
            accuracyMeters: acc,
            capturedAt: new Date().toISOString(),
            label,
            source: 'GPS',
          };

          setGpsPoint(nextPoint);
          setGpsStatus('GRANTED');
          await fetchHospitals(lat, lng, searchRadius);

          if (triggerSosLog) {
            setSosActiveBanner(true);
            await appendHistory({
              eventType: 'SOS_TRIGGERED',
              latitude: lat,
              longitude: lng,
              locationLabel: label,
              notes: `User activated SOS check & locked GPS (±${acc} m). Ready for user-initiated call or location share.`,
            });
          }

          pushToast({
            variant: 'success',
            title: 'GPS Location Locked',
            message: `${label} (±${acc} m)`,
          });
        },
        (err) => {
          setGpsStatus('DENIED');
          const msg =
            err.code === err.PERMISSION_DENIED
              ? 'Location permission denied. Tap the Google Map to pin your location manually or allow GPS in browser settings.'
              : 'Unable to acquire GPS fix. You can tap anywhere on the Google Map below to set your coordinates.';
          setGpsError(msg);
          if (triggerSosLog) {
            setSosActiveBanner(true);
            appendHistory({
              eventType: 'SOS_TRIGGERED',
              latitude: gpsPoint.lat,
              longitude: gpsPoint.lng,
              locationLabel: gpsPoint.label,
              notes: 'SOS panel activated (GPS permission unavailable — using map/reference coordinates).',
            });
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
      );
    },
    [appendHistory, fetchHospitals, gpsPoint.label, gpsPoint.lat, gpsPoint.lng, pushToast, searchRadius]
  );

  const shareMapsUrl = useMemo(
    () => `https://www.google.com/maps?q=${gpsPoint.lat},${gpsPoint.lng}`,
    [gpsPoint.lat, gpsPoint.lng]
  );

  const shareMessage = useMemo(() => {
    const accuracyTxt = gpsPoint.accuracyMeters ? ` (±${gpsPoint.accuracyMeters}m)` : '';
    return `EMERGENCY SOS LOCATION (${gpsPoint.source === 'GPS' ? 'GPS Verified' : 'Pinned Location'}): ${
      gpsPoint.label
    } [${gpsPoint.lat.toFixed(5)}, ${gpsPoint.lng.toFixed(
      5
    )}${accuracyTxt}]. Open on Google Maps: ${shareMapsUrl}`;
  }, [gpsPoint, shareMapsUrl]);

  const handleDialClick = (serviceLabel: string, phoneNumber: string, contactName?: string) => {
    appendHistory({
      eventType: 'DIAL_CLICKED',
      serviceDialed: phoneNumber,
      contactName: contactName || serviceLabel,
      latitude: gpsPoint.lat,
      longitude: gpsPoint.lng,
      locationLabel: gpsPoint.label,
      notes: `User tapped dial action (${phoneNumber}). Device dialer opened — confirm call on your phone.`,
    });
    pushToast({
      variant: 'info',
      title: `Dialer Requested: ${phoneNumber}`,
      message: `Confirm the call to ${contactName || serviceLabel} in your device phone app.`,
    });
  };

  const handleCopyLocation = async () => {
    try {
      await navigator.clipboard.writeText(shareMessage);
      appendHistory({
        eventType: 'LOCATION_SHARED',
        latitude: gpsPoint.lat,
        longitude: gpsPoint.lng,
        locationLabel: gpsPoint.label,
        sharedChannel: 'CLIPBOARD',
        notes: 'Emergency coordinates & Google Maps link copied to clipboard by user.',
      });
      pushToast({
        variant: 'success',
        title: 'Location Copied',
        message: 'Paste into WhatsApp, SMS, or any messaging app to share.',
      });
    } catch {
      pushToast({
        variant: 'error',
        title: 'Clipboard Unavailable',
        message: 'Copy the link manually from the share preview box.',
      });
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'TRAFFIX SOS Location',
          text: shareMessage,
          url: shareMapsUrl,
        });
        appendHistory({
          eventType: 'LOCATION_SHARED',
          latitude: gpsPoint.lat,
          longitude: gpsPoint.lng,
          locationLabel: gpsPoint.label,
          sharedChannel: 'WEB_SHARE_SHEET',
          notes: 'User completed native OS share sheet.',
        });
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          await handleCopyLocation();
        }
      }
    } else {
      await handleCopyLocation();
    }
  };

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName.trim() || !contactPhone.trim()) return;
    setSavingContact(true);

    try {
      if (user) {
        if (editingId) {
          const updated = await sosApi.updateContact(editingId, {
            name: contactName.trim(),
            relationship: contactRelation.trim() || 'Personal',
            phone: contactPhone.trim(),
            notes: contactNotes.trim() || null,
            isPrimary: contactPrimary,
          });
          setContacts((prev) =>
            prev
              .map((c) =>
                c.id === updated.id ? updated : contactPrimary ? { ...c, isPrimary: false } : c
              )
              .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
          );
          pushToast({ variant: 'success', title: 'Emergency Contact Updated' });
        } else {
          const created = await sosApi.createContact({
            name: contactName.trim(),
            relationship: contactRelation.trim() || 'Personal',
            phone: contactPhone.trim(),
            notes: contactNotes.trim() || null,
            isPrimary: contactPrimary,
          });
          setContacts((prev) =>
            [
              created,
              ...prev.map((c) => (contactPrimary ? { ...c, isPrimary: false } : c)),
            ].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
          );
          pushToast({ variant: 'success', title: 'Emergency Contact Saved' });
        }
      } else {
        const now = new Date().toISOString();
        let nextList: EmergencyContactDTO[];
        if (editingId) {
          nextList = contacts.map((c) => {
            if (c.id === editingId) {
              return {
                ...c,
                name: contactName.trim(),
                relationship: contactRelation.trim() || 'Personal',
                phone: contactPhone.trim(),
                notes: contactNotes.trim() || null,
                isPrimary: contactPrimary,
                updatedAt: now,
              };
            }
            return contactPrimary ? { ...c, isPrimary: false } : c;
          });
        } else {
          const newItem: EmergencyContactDTO = {
            id: `local-ec-${Date.now()}`,
            userId: 'local-guest',
            name: contactName.trim(),
            relationship: contactRelation.trim() || 'Personal',
            phone: contactPhone.trim(),
            notes: contactNotes.trim() || null,
            isPrimary: contactPrimary,
            createdAt: now,
            updatedAt: now,
          };
          nextList = [
            newItem,
            ...contacts.map((c) => (contactPrimary ? { ...c, isPrimary: false } : c)),
          ];
        }
        nextList.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
        setContacts(nextList);
        saveLocalContacts(nextList);
        pushToast({
          variant: 'success',
          title: 'Saved Locally on This Device',
          message: 'Sign in to sync emergency contacts across devices.',
        });
      }

      setEditingId(null);
      setContactName('');
      setContactRelation('Family');
      setContactPhone('');
      setContactNotes('');
      setContactPrimary(false);
    } catch (err: any) {
      pushToast({
        variant: 'error',
        title: 'Unable to Save Contact',
        message: err?.message || 'Check the contact details and try again.',
      });
    } finally {
      setSavingContact(false);
    }
  };

  const handleDeleteContact = async (id: string) => {
    try {
      if (user) {
        await sosApi.deleteContact(id);
      }
      const next = contacts.filter((c) => c.id !== id);
      setContacts(next);
      if (!user) saveLocalContacts(next);
      pushToast({ variant: 'info', title: 'Contact Removed' });
    } catch (err: any) {
      pushToast({ variant: 'error', title: 'Delete Failed', message: err?.message });
    }
  };

  const startEditContact = (c: EmergencyContactDTO) => {
    setEditingId(c.id);
    setContactName(c.name);
    setContactRelation(c.relationship);
    setContactPhone(c.phone);
    setContactNotes(c.notes || '');
    setContactPrimary(c.isPrimary);
  };

  return (
    <WorkspaceLayout
      title="Emergency SOS, Contacts & Nearby Hospitals"
      breadcrumb="SOS & Emergency Help"
      actions={
        <button
          type="button"
          onClick={() => captureGpsLocation(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 hover:bg-red-500 px-3 min-h-[38px] text-xs font-semibold text-white shadow-xs transition-colors"
        >
          <Siren className="w-3.5 h-3.5" />
          <span>Activate SOS Check</span>
        </button>
      }
    >
      <div className="space-y-6">
        {/* Honest Behavior Notice + Quick SOS Activation */}
        <section className="rounded-xl border border-red-300 dark:border-red-500/40 bg-red-50/90 dark:bg-red-950/25 p-4 sm:p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1.5 max-w-3xl">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                <Siren className="w-5 h-5 shrink-0" />
                <h2 className="text-base sm:text-lg font-bold font-display">
                  Immediate Emergency Assistance &amp; Location Handoff
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-red-900/90 dark:text-red-100/90 leading-relaxed">
                Tapping an emergency service opens your device dialer or messaging draft with your
                GPS coordinates. <strong>TRAFFIX never falsely claims</strong> that calls were
                placed or SMS alerts were automatically delivered without your confirmation.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => captureGpsLocation(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 hover:bg-red-500 active:scale-[0.98] px-5 min-h-[48px] text-sm font-bold text-white shadow-sm transition-all"
              >
                <LocateFixed className="w-4 h-4" />
                <span>
                  {gpsStatus === 'LOCATING' ? 'Locking GPS...' : 'Lock GPS & Start SOS'}
                </span>
              </button>
            </div>
          </div>

          {sosActiveBanner && (
            <div className="rounded-lg border border-amber-400/50 bg-white/90 dark:bg-[#0D1424] px-4 py-3 text-xs text-slate-800 dark:text-slate-100 flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>
                  SOS check prepared at{' '}
                  <strong className="font-mono">
                    {gpsPoint.lat.toFixed(5)}, {gpsPoint.lng.toFixed(5)}
                  </strong>
                  . Choose a dialer button below or share your location draft manually.
                </span>
              </span>
              <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                Recorded in Assistance History
              </span>
            </div>
          )}

          {/* Primary Emergency Numbers Grid (108 / 112 / 101) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <a
              href="tel:108"
              onClick={() => handleDialClick('Ambulance (108)', '108')}
              className="flex items-center justify-between gap-3 rounded-xl border border-red-300 dark:border-red-500/40 bg-white dark:bg-[#0D1424] p-4 min-h-[64px] hover:border-red-500 transition-colors shadow-xs"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400">
                  <Ambulance className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Medical / Ambulance
                  </p>
                  <p className="text-base font-bold text-slate-900 dark:text-white font-mono">
                    Call 108
                  </p>
                </div>
              </div>
              <Phone className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
            </a>

            <a
              href="tel:112"
              onClick={() => handleDialClick('Police / National Emergency (112)', '112')}
              className="flex items-center justify-between gap-3 rounded-xl border border-blue-300 dark:border-blue-500/40 bg-white dark:bg-[#0D1424] p-4 min-h-[64px] hover:border-blue-500 transition-colors shadow-xs"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Police / National SOS
                  </p>
                  <p className="text-base font-bold text-slate-900 dark:text-white font-mono">
                    Call 112
                  </p>
                </div>
              </div>
              <Phone className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            </a>

            <a
              href="tel:101"
              onClick={() => handleDialClick('Fire & Rescue Services (101)', '101')}
              className="flex items-center justify-between gap-3 rounded-xl border border-orange-300 dark:border-orange-500/40 bg-white dark:bg-[#0D1424] p-4 min-h-[64px] hover:border-orange-500 transition-colors shadow-xs"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400">
                  <Flame className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Fire &amp; Rescue
                  </p>
                  <p className="text-base font-bold text-slate-900 dark:text-white font-mono">
                    Call 101
                  </p>
                </div>
              </div>
              <Phone className="w-4 h-4 text-orange-600 dark:text-orange-400 shrink-0" />
            </a>
          </div>
        </section>

        {/* GPS Location Capture + Location Sharing + Nearby Hospital Map */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Left Column: GPS + Share + Contacts */}
          <div className="xl:col-span-5 space-y-5">
            {/* Location Capture & Sharing Card */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white font-display">
                    Your Location &amp; Live Share
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => captureGpsLocation(false)}
                  disabled={gpsStatus === 'LOCATING'}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 min-h-[38px] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  <LocateFixed className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                  <span>{gpsStatus === 'LOCATING' ? 'Locating...' : 'Capture GPS'}</span>
                </button>
              </div>

              {gpsError && (
                <div className="rounded-lg border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                  {gpsError}
                </div>
              )}

              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090E1A] p-3.5 space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Location Source</span>
                  <span className="font-mono font-semibold text-cyan-700 dark:text-cyan-400">
                    {gpsPoint.source === 'GPS'
                      ? 'DEVICE GPS LOCKED'
                      : gpsPoint.source === 'MAP_PIN'
                      ? 'MANUAL MAP PIN'
                      : 'CORRIDOR REFERENCE'}
                  </span>
                </div>
                <p className="font-medium text-slate-900 dark:text-white">{gpsPoint.label}</p>
                <p className="font-mono text-slate-600 dark:text-slate-300 tabular-nums">
                  {gpsPoint.lat.toFixed(6)}, {gpsPoint.lng.toFixed(6)}
                  {gpsPoint.accuracyMeters ? ` · Accuracy ±${gpsPoint.accuracyMeters} m` : ''}
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Shareable Emergency Message Preview
                </label>
                <textarea
                  readOnly
                  rows={3}
                  value={shareMessage}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 text-xs font-mono text-slate-700 dark:text-slate-200"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={handleNativeShare}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 min-h-[44px] px-3 text-xs font-semibold text-white transition-colors"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Share</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyLocation}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 min-h-[44px] px-3 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </button>
                <a
                  href={`sms:?body=${encodeURIComponent(shareMessage)}`}
                  onClick={() =>
                    appendHistory({
                      eventType: 'LOCATION_SHARED',
                      latitude: gpsPoint.lat,
                      longitude: gpsPoint.lng,
                      locationLabel: gpsPoint.label,
                      sharedChannel: 'SMS_DRAFT',
                      notes: 'Opened SMS message draft with GPS location (user must tap Send).',
                    })
                  }
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 min-h-[44px] px-3 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>SMS Draft</span>
                </a>
                <a
                  href={`mailto:?subject=${encodeURIComponent(
                    'SOS Emergency Location'
                  )}&body=${encodeURIComponent(shareMessage)}`}
                  onClick={() =>
                    appendHistory({
                      eventType: 'LOCATION_SHARED',
                      latitude: gpsPoint.lat,
                      longitude: gpsPoint.lng,
                      locationLabel: gpsPoint.label,
                      sharedChannel: 'EMAIL_DRAFT',
                      notes: 'Opened email draft with GPS location (user must send).',
                    })
                  }
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 min-h-[44px] px-3 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Email</span>
                </a>
              </div>
            </div>

            {/* Personal Emergency Contacts */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white font-display">
                    Personal Emergency Contacts ({contacts.length})
                  </h3>
                </div>
                {!user && (
                  <Link
                    to="/login"
                    className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Sign in to sync
                  </Link>
                )}
              </div>

              <form onSubmit={handleSaveContact} className="space-y-2.5 border-b border-slate-200 dark:border-slate-800 pb-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    required
                    placeholder="Contact full name"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 min-h-[42px] text-xs text-slate-900 dark:text-white"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Relationship (e.g. Spouse)"
                    value={contactRelation}
                    onChange={(e) => setContactRelation(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 min-h-[42px] text-xs text-slate-900 dark:text-white"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="tel"
                    required
                    placeholder="Phone (+91 98...)"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 min-h-[42px] text-xs font-mono text-slate-900 dark:text-white"
                  />
                  <input
                    type="text"
                    placeholder="Medical note / blood group (optional)"
                    value={contactNotes}
                    onChange={(e) => setContactNotes(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 min-h-[42px] text-xs text-slate-900 dark:text-white"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer min-h-[36px]">
                    <input
                      type="checkbox"
                      checked={contactPrimary}
                      onChange={(e) => setContactPrimary(e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-600"
                    />
                    <span>Primary SOS contact</span>
                  </label>

                  <div className="flex items-center gap-2">
                    {editingId && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setContactName('');
                          setContactRelation('Family');
                          setContactPhone('');
                          setContactNotes('');
                          setContactPrimary(false);
                        }}
                        className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 min-h-[38px] text-xs text-slate-600 dark:text-slate-300"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={savingContact}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 px-3.5 min-h-[38px] text-xs font-semibold text-white disabled:opacity-50"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>
                        {savingContact
                          ? 'Saving...'
                          : editingId
                          ? 'Update Contact'
                          : 'Save Contact'}
                      </span>
                    </button>
                  </div>
                </div>
              </form>

              {loadingContacts ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">Loading contacts...</p>
              ) : contacts.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No personal emergency contacts saved yet. Add family or doctor numbers above for
                  one-tap calling and GPS SMS drafts.
                </p>
              ) : (
                <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                  {contacts.map((c) => (
                    <div
                      key={c.id}
                      className={`rounded-lg border p-3 text-xs space-y-2 ${
                        c.isPrimary
                          ? 'border-blue-500/50 bg-blue-50/70 dark:bg-blue-950/25'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090E1A]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {c.name}
                            </span>
                            {c.isPrimary && (
                              <span className="font-mono text-[10px] font-semibold text-blue-700 dark:text-blue-300">
                                PRIMARY
                              </span>
                            )}
                          </div>
                          <p className="text-slate-500 dark:text-slate-400">
                            {c.relationship} · <span className="font-mono">{c.phone}</span>
                          </p>
                          {c.notes && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              {c.notes}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => startEditContact(c)}
                            className="p-2 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-white"
                            aria-label={`Edit ${c.name}`}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteContact(c.id)}
                            className="p-2 rounded-md text-slate-500 hover:text-red-600 dark:hover:text-red-400"
                            aria-label={`Delete ${c.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <a
                          href={`tel:${c.phone.replace(/\s+/g, '')}`}
                          onClick={() => handleDialClick(c.relationship, c.phone, c.name)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 min-h-[38px] px-2.5 text-xs font-semibold text-white transition-colors"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          <span>Call</span>
                        </a>
                        <a
                          href={`sms:${c.phone.replace(/\s+/g, '')}?body=${encodeURIComponent(
                            shareMessage
                          )}`}
                          onClick={() =>
                            appendHistory({
                              eventType: 'LOCATION_SHARED',
                              contactName: c.name,
                              latitude: gpsPoint.lat,
                              longitude: gpsPoint.lng,
                              locationLabel: gpsPoint.label,
                              sharedChannel: 'CONTACT_SMS_DRAFT',
                              notes: `Opened SMS draft addressed to ${c.name} (${c.phone}). User must confirm send.`,
                            })
                          }
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1424] min-h-[38px] px-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>Share GPS SMS</span>
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Google Maps Nearby Hospitals + List + Assistance History */}
          <div className="xl:col-span-7 space-y-5">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Hospital className="w-4 h-4 text-red-600 dark:text-red-400" />
                    <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white font-display">
                      Nearby Hospitals (Google Places API)
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Tap the Google Map to pin another area or lock GPS to refresh hospital distance.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={searchRadius}
                    onChange={(e) => {
                      const nextRad = Number(e.target.value);
                      setSearchRadius(nextRad);
                      fetchHospitals(gpsPoint.lat, gpsPoint.lng, nextRad);
                    }}
                    aria-label="Hospital search radius"
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-2.5 min-h-[38px] text-xs text-slate-800 dark:text-slate-200"
                  >
                    <option value={3000}>Within 3 km</option>
                    <option value={8000}>Within 8 km</option>
                    <option value={15000}>Within 15 km</option>
                  </select>
                  <button
                    type="button"
                    disabled={loadingHospitals}
                    onClick={() => fetchHospitals(gpsPoint.lat, gpsPoint.lng, searchRadius)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-slate-800 hover:bg-slate-700 px-3 min-h-[38px] text-xs font-medium text-white disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${loadingHospitals ? 'animate-spin' : ''}`}
                    />
                    <span>Search</span>
                  </button>
                </div>
              </div>

              <TrafficMap
                nodes={nodes}
                segments={segments}
                hospitals={hospitals}
                selectedHospitalId={selectedHospital?.placeId || null}
                startPoint={{
                  lat: gpsPoint.lat,
                  lng: gpsPoint.lng,
                  label: gpsPoint.label,
                }}
                fitBoundsKey={fitBoundsKey}
                showHeatmapDefault={false}
                showRoadOverlay={false}
                heightClass="h-[300px] sm:h-[360px]"
                onMapClick={async (lat, lng) => {
                  let label = `Pinned (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
                  try {
                    const rev = await routesApi.reverseGeocode(lat, lng);
                    if (rev?.label) label = rev.label;
                  } catch {
                    // keep coord label
                  }
                  setGpsPoint({
                    lat,
                    lng,
                    accuracyMeters: null,
                    capturedAt: new Date().toISOString(),
                    label,
                    source: 'MAP_PIN',
                  });
                  fetchHospitals(lat, lng, searchRadius);
                }}
                onHospitalSelect={(h) => {
                  setSelectedHospital(h);
                  appendHistory({
                    eventType: 'HOSPITAL_VIEWED',
                    hospitalPlaceId: h.placeId,
                    hospitalName: h.name,
                    latitude: h.latitude,
                    longitude: h.longitude,
                    locationLabel: h.address,
                    notes: `Selected ${h.name} (${formatDistance(h.distanceMeters)} away).`,
                  });
                }}
              />

              <div
                className={`rounded-lg border px-3.5 py-2.5 text-xs ${
                  hospitalsSource === 'UNAVAILABLE'
                    ? 'border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-950/25 text-amber-800 dark:text-amber-200'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090E1A] text-slate-600 dark:text-slate-300'
                }`}
              >
                {loadingHospitals ? 'Querying Google Places API (New) for nearby hospitals...' : hospitalsNotice}
              </div>

              {hospitals.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto pr-1">
                  {hospitals.map((h) => {
                    const isSelected = selectedHospital?.placeId === h.placeId;
                    return (
                      <div
                        key={h.placeId}
                        onClick={() => setSelectedHospital(h)}
                        className={`rounded-xl border p-3.5 text-xs space-y-2.5 cursor-pointer transition-colors ${
                          isSelected
                            ? 'border-red-500 bg-red-50/70 dark:bg-red-950/20'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090E1A] hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 dark:text-white truncate">
                              {h.name}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">
                              {h.address}
                            </p>
                          </div>
                          <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 shrink-0 tabular-nums">
                            {formatDistance(h.distanceMeters)}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                          {h.openNow !== null && (
                            <span
                              className={
                                h.openNow
                                  ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                                  : 'text-amber-600 dark:text-amber-400 font-medium'
                              }
                            >
                              {h.openNow ? 'Open now' : 'Closed now'}
                            </span>
                          )}
                          {h.rating !== null && (
                            <span className="inline-flex items-center gap-1 font-mono">
                              <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                              {h.rating}
                              {h.userRatingCount ? ` (${h.userRatingCount})` : ''}
                            </span>
                          )}
                          <span className="font-mono text-cyan-700 dark:text-cyan-400">
                            Google Places
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {h.phone && (
                            <a
                              href={`tel:${h.phone.replace(/\s+/g, '')}`}
                              onClick={(ev) => {
                                ev.stopPropagation();
                                handleDialClick(h.name, h.phone!, h.name);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-2.5 min-h-[36px] text-[11px] font-semibold text-white"
                            >
                              <Phone className="w-3 h-3" />
                              <span>Call</span>
                            </a>
                          )}
                          <Link
                            to={`/navigate?originLat=${gpsPoint.lat}&originLng=${
                              gpsPoint.lng
                            }&originLabel=${encodeURIComponent(
                              gpsPoint.label
                            )}&destLat=${h.latitude}&destLng=${h.longitude}&destLabel=${encodeURIComponent(
                              h.name
                            )}`}
                            onClick={(ev) => ev.stopPropagation()}
                            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 hover:bg-blue-500 px-2.5 min-h-[36px] text-[11px] font-semibold text-white"
                          >
                            <Navigation className="w-3 h-3" />
                            <span>Route Here</span>
                          </Link>
                          {h.googleMapsUri && (
                            <a
                              href={h.googleMapsUri}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(ev) => ev.stopPropagation()}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 min-h-[36px] text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>Maps</span>
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Emergency Assistance History */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white font-display">
                    Emergency Assistance History ({history.length})
                  </h3>
                </div>
                {!user && history.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setHistory([]);
                      saveLocalHistory([]);
                    }}
                    className="text-[11px] text-slate-500 hover:text-red-600 dark:hover:text-red-400"
                  >
                    Clear Device Log
                  </button>
                )}
              </div>

              {loadingHistory ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">Loading history...</p>
              ) : history.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No emergency actions recorded yet. SOS checks, dialer launches, shared location
                  drafts, and hospital lookups appear here for audit clarity.
                </p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {history.map((log) => (
                    <div
                      key={log.id}
                      className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090E1A] px-3.5 py-2.5 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="space-y-0.5">
                        <p className="font-medium text-slate-900 dark:text-white">
                          {formatEventTitle(log)}
                        </p>
                        {log.notes && (
                          <p className="text-[11px] text-slate-600 dark:text-slate-400">
                            {log.notes}
                          </p>
                        )}
                        {log.locationLabel && (
                          <p className="text-[11px] font-mono text-cyan-700 dark:text-cyan-400">
                            {log.locationLabel}
                          </p>
                        )}
                      </div>
                      <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </WorkspaceLayout>
  );
}
