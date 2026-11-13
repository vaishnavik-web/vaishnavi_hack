import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  LocateFixed,
  MapPin,
  Search,
  ShieldAlert,
  ThumbsDown,
  ThumbsUp,
  Upload,
} from 'lucide-react';
import { WorkspaceLayout } from '../components/Layout';
import { TrafficMap } from '../components/TrafficMap';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  ClientSuggestionItem,
  useGoogleMapsServices,
} from '../hooks/useGoogleMapsServices';
import { incidentsApi, routesApi } from '../services/api';
import {
  IncidentDTO,
  IncidentSeverity,
  IncidentType,
  RoadNodeDTO,
  RoadSegmentDTO,
} from '../shared/types';

const VIOLATION_TYPES: IncidentType[] = [
  'WRONG_WAY_DRIVING',
  'ILLEGAL_PARKING',
  'BLOCKING_ROAD',
  'NO_PARKING_ZONE',
  'ROAD_OBSTRUCTION',
];

const ALL_INCIDENT_TYPES: IncidentType[] = [
  'WRONG_WAY_DRIVING',
  'ILLEGAL_PARKING',
  'BLOCKING_ROAD',
  'NO_PARKING_ZONE',
  'ROAD_OBSTRUCTION',
  'ACCIDENT',
  'ROADBLOCK',
  'CONGESTION',
  'CONSTRUCTION',
  'LANE_CLOSURE',
  'BREAKDOWN',
  'FLOODING',
  'OTHER',
];

const TYPE_LABELS: Record<IncidentType, string> = {
  WRONG_WAY_DRIVING: 'Wrong-Way Driving',
  ILLEGAL_PARKING: 'Illegal Parking',
  BLOCKING_ROAD: 'Vehicle Blocking Road',
  NO_PARKING_ZONE: 'Parked in No-Parking Zone',
  ROAD_OBSTRUCTION: 'Road Obstruction',
  ACCIDENT: 'Traffic Accident',
  ROADBLOCK: 'Roadblock / Closure',
  CONGESTION: 'Severe Congestion',
  CONSTRUCTION: 'Road Construction',
  LANE_CLOSURE: 'Lane Closure',
  BREAKDOWN: 'Vehicle Breakdown',
  FLOODING: 'Waterlogging / Flooding',
  OTHER: 'Other Traffic Violation / Issue',
};

const SEVERITIES: IncidentSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

function toLocalDateTimeInputValue(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export function IncidentsPage({ mode = 'all' }: { mode?: 'all' | 'violations' }) {
  const isViolationsMode = mode === 'violations';
  const { user, socket } = useAuth();
  const { pushToast } = useToast();

  const [nodes, setNodes] = useState<RoadNodeDTO[]>([]);
  const [segments, setSegments] = useState<RoadSegmentDTO[]>([]);
  const [incidents, setIncidents] = useState<IncidentDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIncident, setSelectedIncident] = useState<IncidentDTO | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [excludeExpired, setExcludeExpired] = useState(true);

  // Form state
  const [type, setType] = useState<IncidentType>(
    isViolationsMode ? 'WRONG_WAY_DRIVING' : 'ACCIDENT'
  );
  const [severity, setSeverity] = useState<IncidentSeverity>('HIGH');
  const [roadSegmentId, setRoadSegmentId] = useState('');
  const [roadName, setRoadName] = useState('');
  const [landmark, setLandmark] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => toLocalDateTimeInputValue());
  const [latitude, setLatitude] = useState(15.8548);
  const [longitude, setLongitude] = useState(74.5025);
  const [description, setDescription] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [lastSubmitted, setLastSubmitted] = useState<IncidentDTO | null>(null);
  const [locQuery, setLocQuery] = useState('');
  const [locSuggestions, setLocSuggestions] = useState<ClientSuggestionItem[]>([]);
  const [searchingLoc, setSearchingLoc] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const { isSdkReady, fetchPlaceSuggestions, resolvePlaceSuggestion } =
    useGoogleMapsServices();

  const availableTypes = useMemo(
    () => (isViolationsMode ? [...VIOLATION_TYPES, 'OTHER' as IncidentType] : ALL_INCIDENT_TYPES),
    [isViolationsMode]
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [net, list] = await Promise.all([
        routesApi.getNetwork(),
        incidentsApi.list({
          status: statusFilter,
          type: typeFilter,
          search: searchTerm || undefined,
          violationsOnly: isViolationsMode ? true : undefined,
          excludeExpired,
        }),
      ]);
      setNodes(net.nodes);
      setSegments(net.segments);
      setIncidents(list);
      setSelectedIncident((prev) =>
        prev ? list.find((item) => item.id === prev.id) || list[0] || null : list[0] || null
      );
    } catch (err: any) {
      pushToast({ variant: 'error', title: 'Load Failed', message: err.message });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, searchTerm, isViolationsMode, excludeExpired, pushToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => fetchData();
    socket.on('incident:created', refresh);
    socket.on('incident:verified', refresh);
    socket.on('incident:resolved', refresh);
    socket.on('incident:updated', refresh);
    socket.on('road:status-changed', refresh);
    return () => {
      socket.off('incident:created', refresh);
      socket.off('incident:verified', refresh);
      socket.off('incident:resolved', refresh);
      socket.off('incident:updated', refresh);
      socket.off('road:status-changed', refresh);
    };
  }, [socket, fetchData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setFormError('Please sign in to submit an incident report.');
      return;
    }
    setFormError(null);
    setSubmitting(true);

    try {
      const fd = new FormData();
      fd.append('type', type);
      fd.append('severity', severity);
      fd.append('description', description);
      fd.append('latitude', String(latitude));
      fd.append('longitude', String(longitude));
      if (roadSegmentId) fd.append('roadSegmentId', roadSegmentId);
      if (roadName.trim()) fd.append('roadName', roadName.trim());
      if (landmark.trim()) fd.append('landmark', landmark.trim());
      if (occurredAt) {
        const parsed = new Date(occurredAt);
        if (!Number.isNaN(parsed.getTime())) {
          fd.append('occurredAt', parsed.toISOString());
        }
      }
      if (imageFile) fd.append('image', imageFile);

      const res = await incidentsApi.submit(fd);
      setLastSubmitted(res.incident);
      setSelectedIncident(res.incident);
      setDescription('');
      setRoadName('');
      setLandmark('');
      setImageFile(null);
      await fetchData();

      pushToast({
        variant: res.possibleDuplicate ? 'warning' : 'success',
        title: res.possibleDuplicate
          ? 'Report Submitted (Flagged Possible Duplicate)'
          : 'Report Submitted for Review',
        message: `ID ${res.incidentId} · Status: ${res.status}`,
      });
    } catch (err: any) {
      setFormError(err.message || 'Server rejected incident report');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmPresence = async (incidentId: string, stillPresent: boolean) => {
    if (!user) {
      pushToast({
        variant: 'info',
        title: 'Sign In Required',
        message: 'Please sign in to confirm whether an incident is still active.',
      });
      return;
    }
    setConfirmingId(incidentId);
    try {
      const res = await incidentsApi.confirmPresence(incidentId, { stillPresent });
      setIncidents((prev) => prev.map((i) => (i.id === incidentId ? res.incident : i)));
      if (selectedIncident?.id === incidentId) setSelectedIncident(res.incident);
      pushToast({
        variant: 'success',
        title: stillPresent ? 'Confirmed Still Present' : 'Marked as Cleared / Not Present',
        message: `${res.confirmationsCount} total community check(s) recorded.`,
      });
    } catch (err: any) {
      pushToast({ variant: 'error', title: 'Update Failed', message: err.message });
    } finally {
      setConfirmingId(null);
    }
  };

  const getStatusBadge = (inc: IncidentDTO) => {
    if (inc.isExpired) {
      return (
        <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-mono bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          <Clock className="w-3 h-3" />
          EXPIRED (REVIEW NEEDED)
        </span>
      );
    }
    if (inc.status === 'VERIFIED') {
      return (
        <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-mono bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
          <CheckCircle2 className="w-3 h-3" />
          VERIFIED
        </span>
      );
    }
    if (inc.status === 'RESOLVED') {
      return (
        <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-mono bg-cyan-100 text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-300">
          RESOLVED
        </span>
      );
    }
    if (inc.status === 'REJECTED') {
      return (
        <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-mono bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300">
          REJECTED
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-mono bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
        {inc.status === 'PENDING' ? 'PENDING REVIEW (UNVERIFIED)' : 'UNDER REVIEW (UNVERIFIED)'}
      </span>
    );
  };

  const pageTitle = isViolationsMode
    ? 'Wrong-Way Driving & Illegal Parking Reporting'
    : 'Traffic Incident & Violation Reporting';
  const breadcrumb = isViolationsMode ? 'Wrong-Way & Parking' : 'Traffic Reports';

  return (
    <WorkspaceLayout title={pageTitle} breadcrumb={breadcrumb}>
      <div className="mb-4 rounded-xl border border-amber-300/70 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
          <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            Community reports are clearly marked as <strong>UNVERIFIED</strong> until verified by a traffic operator. Stale reports expire automatically so old obstructions do not permanently block routes.
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-700 dark:text-slate-300">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Wrong-Way / Critical
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500" /> Illegal Parking / No-Parking
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" /> Obstruction / Blocking Road
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Report Submission Form */}
        <div className="xl:col-span-5 space-y-5">
          <form
            onSubmit={handleSubmit}
            className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0D1424] p-5 space-y-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {isViolationsMode ? 'Report Violation or Obstruction' : 'Submit Traffic Incident'}
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400">Click map to set pin</span>
            </div>

            {!user && (
              <div className="rounded-lg border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between gap-3">
                <span>Sign in required to submit verified reports.</span>
                <Link to="/login" className="text-blue-600 dark:text-blue-400 hover:underline font-medium shrink-0">
                  Sign In
                </Link>
              </div>
            )}

            {formError && (
              <div className="rounded-lg border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-800 dark:text-red-200">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Incident / Violation Type
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as IncidentType)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 text-sm text-slate-900 dark:text-white"
                >
                  {availableTypes.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Reported Severity
                </label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as IncidentSeverity)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 text-sm text-slate-900 dark:text-white"
                >
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Road Name
                </label>
                <input
                  type="text"
                  value={roadName}
                  onChange={(e) => setRoadName(e.target.value)}
                  placeholder="e.g., College Road / NH-48"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 text-sm text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Nearby Landmark
                </label>
                <input
                  type="text"
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  placeholder="e.g., Near Central Bus Stand"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 text-sm text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Road Segment (Auto-snapped)
                </label>
                <select
                  value={roadSegmentId}
                  onChange={(e) => setRoadSegmentId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 text-sm text-slate-900 dark:text-white"
                >
                  <option value="">Auto-detect nearest corridor</option>
                  {segments.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Date & Time of Incident
                </label>
                <input
                  type="datetime-local"
                  value={occurredAt}
                  onChange={(e) => setOccurredAt(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 text-sm text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Location Pin or GPS (Permission-based)
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (!navigator.geolocation) {
                      pushToast({
                        variant: 'error',
                        title: 'Geolocation Unsupported',
                        message: 'Browser does not support GPS location.',
                      });
                      return;
                    }
                    navigator.geolocation.getCurrentPosition(
                      (pos) => {
                        setLatitude(Number(pos.coords.latitude.toFixed(5)));
                        setLongitude(Number(pos.coords.longitude.toFixed(5)));
                        pushToast({ variant: 'success', title: 'Incident Pin Set to Current GPS Location' });
                      },
                      (err) => {
                        pushToast({ variant: 'error', title: 'Location Permission Denied', message: err.message });
                      }
                    );
                  }}
                  className="inline-flex items-center gap-1 rounded bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25"
                >
                  <LocateFixed className="w-3 h-3" />
                  <span>Use My Location</span>
                </button>
              </div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={locQuery}
                  onChange={(e) => setLocQuery(e.target.value)}
                  placeholder="Search street or landmark for pin..."
                  className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                />
                <button
                  type="button"
                  disabled={searchingLoc}
                  onClick={async () => {
                    const q = locQuery.trim();
                    if (q.length < 2) return;
                    setSearchingLoc(true);
                    try {
                      if (isSdkReady) {
                        const gRes = await fetchPlaceSuggestions(q, 'origin');
                        if (gRes && gRes.length > 0) {
                          setLocSuggestions(gRes);
                          return;
                        }
                      }
                      const res = await routesApi.geocode(q);
                      setLocSuggestions(res.results);
                    } catch {
                      setLocSuggestions([]);
                    } finally {
                      setSearchingLoc(false);
                    }
                  }}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-[#090E1A] px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800"
                >
                  {searchingLoc ? '...' : 'Search'}
                </button>
              </div>
              {locSuggestions.length > 0 && (
                <div className="max-h-32 overflow-y-auto rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#090E1A]">
                  {locSuggestions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={async () => {
                        let lat = s.latitude;
                        let lng = s.longitude;
                        let label = s.name;
                        if (s.placePrediction) {
                          const fetched = await resolvePlaceSuggestion(s, 'origin');
                          if (!fetched) return;
                          lat = fetched.latitude;
                          lng = fetched.longitude;
                          label = fetched.name;
                        }
                        setLatitude(Number(lat.toFixed(5)));
                        setLongitude(Number(lng.toFixed(5)));
                        setLocQuery(label);
                        if (!roadName) setRoadName(label);
                        setLocSuggestions([]);
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border-b border-slate-200 dark:border-slate-800 last:border-0 truncate"
                    >
                      {s.displayName}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Latitude
                </label>
                <input
                  type="number"
                  step="0.00001"
                  required
                  value={latitude}
                  onChange={(e) => setLatitude(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 text-sm font-mono text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Longitude
                </label>
                <input
                  type="number"
                  step="0.00001"
                  required
                  value={longitude}
                  onChange={(e) => setLongitude(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 text-sm font-mono text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Incident Description
              </label>
              <textarea
                rows={3}
                required
                minLength={8}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe lane blockage, wrong-way direction, parked vehicle details, or obstruction..."
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Optional Evidence Photograph (JPEG/PNG/WebP, max 3MB)
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3.5 py-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer hover:border-blue-500/50">
                <Upload className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span className="truncate">
                  {imageFile ? imageFile.name : 'Choose optional image file...'}
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting || !user}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Validating & Checking Duplicates...' : 'Submit Report'}
            </button>
          </form>

          {/* Server Duplicate & Severity Estimation Readout */}
          {lastSubmitted && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-4 space-y-2.5 text-xs shadow-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900 dark:text-white">Server Analysis Result</span>
                <span className="font-mono text-cyan-600 dark:text-cyan-400">{lastSubmitted.id}</span>
              </div>
              <div className="text-slate-700 dark:text-slate-300 space-y-1">
                <p>
                  Workflow Status: <span className="font-mono text-amber-600 dark:text-amber-300">{lastSubmitted.status}</span>
                </p>
                <p>
                  Estimated Severity:{' '}
                  <span className="font-mono text-slate-900 dark:text-white">{lastSubmitted.estimatedSeverity}</span> (Confidence{' '}
                  {Math.round(lastSubmitted.severityConfidence * 100)}%)
                </p>
                <p>
                  Duplicate Check:{' '}
                  {lastSubmitted.possibleDuplicate ? (
                    <span className="text-amber-600 dark:text-amber-300">{lastSubmitted.duplicateReason}</span>
                  ) : (
                    <span className="text-emerald-600 dark:text-emerald-400">No nearby duplicate detected</span>
                  )}
                </p>
              </div>
              <ul className="list-disc list-inside text-slate-500 dark:text-slate-400 space-y-0.5 pt-1">
                {lastSubmitted.severityReasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Right Map & Incident Feed */}
        <div className="xl:col-span-7 space-y-5">
          <TrafficMap
            nodes={nodes}
            segments={segments}
            incidents={incidents}
            selectedPin={{ lat: latitude, lng: longitude }}
            selectedSegmentId={roadSegmentId || undefined}
            onMapClick={(lat, lng) => {
              setLatitude(lat);
              setLongitude(lng);
            }}
            onSegmentSelect={(seg, latLng) => {
              setRoadSegmentId(seg.id);
              if (!roadName) setRoadName(seg.name);
              if (latLng) {
                setLatitude(Number(latLng.lat.toFixed(5)));
                setLongitude(Number(latLng.lng.toFixed(5)));
              }
            }}
            onIncidentSelect={(inc) => setSelectedIncident(inc)}
            heightClass="h-[290px] sm:h-[360px]"
          />

          {/* Selected Incident Quick Summary Card */}
          {selectedIncident && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-4 shadow-sm space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">
                    {TYPE_LABELS[selectedIncident.type] || selectedIncident.type}
                  </span>
                  {getStatusBadge(selectedIncident)}
                  {selectedIncident.possibleDuplicate && (
                    <span className="rounded px-2 py-0.5 text-[10px] font-mono bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                      POSSIBLE DUPLICATE
                    </span>
                  )}
                </div>
                <Link
                  to={`/incidents/${selectedIncident.id}`}
                  className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Open Full Report →
                </Link>
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-300">{selectedIncident.description}</p>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <div className="flex flex-wrap items-center gap-3">
                  <span>
                    <strong className="text-slate-700 dark:text-slate-200">Location:</strong>{' '}
                    {selectedIncident.roadName || selectedIncident.roadSegmentName || 'Mapped Location'}
                    {selectedIncident.landmark ? ` (${selectedIncident.landmark})` : ''}
                  </span>
                  <span>
                    <strong className="text-slate-700 dark:text-slate-200">Reported:</strong>{' '}
                    {new Date(selectedIncident.occurredAt || selectedIncident.createdAt).toLocaleString()}
                  </span>
                  <span>
                    <strong className="text-slate-700 dark:text-slate-200">Still Present Votes:</strong>{' '}
                    {selectedIncident.stillPresentCount ?? 0}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={confirmingId === selectedIncident.id}
                    onClick={() => handleConfirmPresence(selectedIncident.id, true)}
                    className="inline-flex items-center gap-1 rounded border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 disabled:opacity-50"
                  >
                    <ThumbsUp className="w-3 h-3" /> Still Present
                  </button>
                  <button
                    type="button"
                    disabled={confirmingId === selectedIncident.id}
                    onClick={() => handleConfirmPresence(selectedIncident.id, false)}
                    className="inline-flex items-center gap-1 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                  >
                    <ThumbsDown className="w-3 h-3" /> Cleared
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Filters & List */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0D1424] p-4 space-y-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search road, landmark, or description..."
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] pl-8 pr-3 py-2 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 text-xs text-slate-900 dark:text-white"
              >
                <option value="ALL">All Visible Statuses</option>
                <option value="PENDING">Pending Review</option>
                <option value="UNDER_REVIEW">Under Review</option>
                <option value="VERIFIED">Verified</option>
                <option value="RESOLVED">Resolved</option>
              </select>

              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 text-xs text-slate-900 dark:text-white"
              >
                <option value="ALL">All Types</option>
                {availableTypes.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>

              <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={excludeExpired}
                  onChange={(e) => setExcludeExpired(e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-700 accent-blue-600"
                />
                <span>Hide expired</span>
              </label>
            </div>

            {loading ? (
              <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                Loading reports...
              </div>
            ) : incidents.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                No reports match the selected filters.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800/80">
                {incidents.map((inc) => (
                  <div
                    key={inc.id}
                    className={`py-3.5 flex flex-col sm:flex-row sm:items-start justify-between gap-4 rounded-lg px-2 transition-colors ${
                      selectedIncident?.id === inc.id
                        ? 'bg-blue-50/70 dark:bg-blue-950/20'
                        : ''
                    }`}
                  >
                    <div
                      className="space-y-1.5 min-w-0 flex-1 cursor-pointer"
                      onClick={() => setSelectedIncident(inc)}
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {TYPE_LABELS[inc.type] || inc.type}
                        </span>
                        <span
                          className={`font-mono ${
                            inc.severity === 'CRITICAL' || inc.severity === 'HIGH'
                              ? 'text-red-600 dark:text-red-400'
                              : inc.severity === 'MEDIUM'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {inc.severity}
                        </span>
                        {getStatusBadge(inc)}
                        {inc.possibleDuplicate && (
                          <span className="text-amber-600 dark:text-amber-300 font-medium">
                            Possible Duplicate
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-800 dark:text-slate-200">{inc.description}</p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {inc.roadName || inc.roadSegmentName || `${inc.latitude}, ${inc.longitude}`}
                          {inc.landmark ? ` · ${inc.landmark}` : ''}
                        </span>
                        <span>·</span>
                        <span className="font-mono">
                          {new Date(inc.occurredAt || inc.createdAt).toLocaleString()}
                        </span>
                        {(inc.stillPresentCount ?? 0) > 0 && (
                          <>
                            <span>·</span>
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                              {inc.stillPresentCount} confirmed present
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={confirmingId === inc.id}
                        onClick={() => handleConfirmPresence(inc.id, true)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                        title="Confirm incident is still present"
                      >
                        <ThumbsUp className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                        <span>Still here</span>
                      </button>
                      <Link
                        to={`/incidents/${inc.id}`}
                        className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                      >
                        Inspect
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </WorkspaceLayout>
  );
}
