import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import {
  Bus,
  Check,
  CheckCheck,
  CircleParking,
  Clock,
  Download,
  Play,
  Plus,
  Square,
  X as XIcon,
} from 'lucide-react';
import { Dashboard } from '../components/Dashboard';
import { WorkspaceLayout } from '../components/Layout';
import { TrafficMap } from '../components/TrafficMap';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import {
  analyticsApi,
  incidentsApi,
  parkingApi,
  routesApi,
  simulationsApi,
  transportApi,
} from '../services/api';
import {
  AnalyticsOverviewDTO,
  AuditLogDTO,
  BusRouteDTO,
  BusServiceStatus,
  BusStopDTO,
  IncidentDTO,
  NetworkImpactResultDTO,
  ParkingLocationDTO,
  ParkingReservationDTO,
  ParkingStatus,
  ParkingType,
  RoadNodeDTO,
  RoadSegmentDTO,
  SimulationScenarioDTO,
} from '../shared/types';

export function AdminPage() {
  const { user, socket } = useAuth();
  const { theme } = useTheme();
  const { pushToast } = useToast();
  const isDark = theme === 'dark';

  const [tab, setTab] = useState<
    'review' | 'parking' | 'transport' | 'simulations' | 'analytics' | 'audit'
  >('review');
  const [nodes, setNodes] = useState<RoadNodeDTO[]>([]);
  const [segments, setSegments] = useState<RoadSegmentDTO[]>([]);
  const [incidents, setIncidents] = useState<IncidentDTO[]>([]);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [onlyDuplicates, setOnlyDuplicates] = useState(false);

  const [selectedIncident, setSelectedIncident] = useState<IncidentDTO | null>(null);
  const [impactResult, setImpactResult] = useState<NetworkImpactResultDTO | null>(null);

  const [simulations, setSimulations] = useState<SimulationScenarioDTO[]>([]);
  const [simName, setSimName] = useState('KLE Corridor Peak Closure Test');
  const [simType, setSimType] = useState<'FULL_CLOSURE' | 'LANE_BLOCKAGE'>('FULL_CLOSURE');
  const [simSegmentId, setSimSegmentId] = useState('seg-12');

  // Parking Admin State
  const [parkingList, setParkingList] = useState<ParkingLocationDTO[]>([]);
  const [adminReservations, setAdminReservations] = useState<ParkingReservationDTO[]>([]);
  const [newParkingName, setNewParkingName] = useState('');
  const [newParkingAddress, setNewParkingAddress] = useState('');
  const [newParkingLat, setNewParkingLat] = useState(15.855);
  const [newParkingLng, setNewParkingLng] = useState(74.504);
  const [newParkingType, setNewParkingType] = useState<ParkingType>('BOTH');
  const [newParkingCapacity, setNewParkingCapacity] = useState(40);
  const [newParkingAvailable, setNewParkingAvailable] = useState(30);
  const [newParkingPrice, setNewParkingPrice] = useState(20);
  const [newParkingOpen, setNewParkingOpen] = useState('06:00');
  const [newParkingClose, setNewParkingClose] = useState('23:00');
  const [newParkingContact, setNewParkingContact] = useState('');

  // Transport Admin State
  const [busStops, setBusStops] = useState<BusStopDTO[]>([]);
  const [busRoutes, setBusRoutes] = useState<BusRouteDTO[]>([]);
  const [newStopName, setNewStopName] = useState('');
  const [newStopAddress, setNewStopAddress] = useState('');
  const [newStopLandmark, setNewStopLandmark] = useState('');
  const [newStopDirection, setNewStopDirection] = useState('Northbound');
  const [newStopLat, setNewStopLat] = useState(15.856);
  const [newStopLng, setNewStopLng] = useState(74.503);

  const [newRouteNumber, setNewRouteNumber] = useState('');
  const [newRouteName, setNewRouteName] = useState('');
  const [newRouteStart, setNewRouteStart] = useState('');
  const [newRouteEnd, setNewRouteEnd] = useState('');
  const [newRouteDuration, setNewRouteDuration] = useState(30);
  const [newRouteFreq, setNewRouteFreq] = useState(20);

  const [assignRouteId, setAssignRouteId] = useState('');
  const [assignStopId, setAssignStopId] = useState('');
  const [assignOrder, setAssignOrder] = useState(1);
  const [assignTravelMin, setAssignTravelMin] = useState(0);
  const [schedDepTime, setSchedDepTime] = useState('09:15');

  const [overview, setOverview] = useState<AnalyticsOverviewDTO | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);

  const isAdmin = user?.role === 'ADMIN';
  const isOperator = user && ['ADMIN', 'SIGNAL_OPERATOR'].includes(user.role);

  const loadAll = useCallback(async () => {
    if (!isOperator) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [net, incs, sims, ov, parks, stops, rts] = await Promise.all([
        routesApi.getNetwork(),
        incidentsApi.list({
          status: statusFilter,
          onlyDuplicates,
        }),
        simulationsApi.list(),
        analyticsApi.getOverview(),
        parkingApi.list(),
        transportApi.listStops(),
        transportApi.listRoutes(),
      ]);
      setNodes(net.nodes);
      setSegments(net.segments);
      setIncidents(incs);
      setSimulations(sims);
      setOverview(ov);
      setParkingList(parks);
      setBusStops(stops);
      setBusRoutes(rts);
      if (!assignRouteId && rts.length > 0) setAssignRouteId(rts[0].id);
      if (!assignStopId && stops.length > 0) setAssignStopId(stops[0].id);

      if (isAdmin) {
        const [logs, resData] = await Promise.all([
          analyticsApi.getAuditLogs(60),
          parkingApi.listAdminReservations(),
        ]);
        setAuditLogs(logs);
        setAdminReservations(resData.reservations);
      }
    } catch (err: any) {
      pushToast({ variant: 'error', title: 'Admin Load Failed', message: err.message });
    } finally {
      setLoading(false);
    }
  }, [isOperator, isAdmin, statusFilter, onlyDuplicates, assignRouteId, assignStopId, pushToast]);

  useEffect(() => {
    loadAll();
  }, [user, statusFilter, onlyDuplicates]);

  useEffect(() => {
    if (!socket || !isOperator) return;
    const refresh = () => loadAll();
    socket.on('incident:created', refresh);
    socket.on('incident:updated', refresh);
    socket.on('road:status-changed', refresh);
    socket.on('parking:updated', refresh);
    socket.on('transport:updated', refresh);
    return () => {
      socket.off('incident:created', refresh);
      socket.off('incident:updated', refresh);
      socket.off('road:status-changed', refresh);
      socket.off('parking:updated', refresh);
      socket.off('transport:updated', refresh);
    };
  }, [socket, isOperator, loadAll]);

  const handleReviewAction = async (
    incidentId: string,
    status: 'UNDER_REVIEW' | 'VERIFIED' | 'REJECTED' | 'RESOLVED',
    applyRoadClosure = false
  ) => {
    setActionBusy(true);
    try {
      const updated = await incidentsApi.updateStatus(incidentId, {
        status,
        applyRoadClosure,
      });
      setSelectedIncident(updated);
      await loadAll();
      pushToast({
        variant: 'success',
        title: `Incident ${status}`,
        message: `Updated ${incidentId} and broadcasted network state.`,
      });
    } catch (err: any) {
      pushToast({ variant: 'error', title: 'Review Action Failed', message: err.message });
    } finally {
      setActionBusy(false);
    }
  };

  const handleExpireIncident = async (incidentId: string) => {
    setActionBusy(true);
    try {
      const updated = await incidentsApi.expireReport(incidentId);
      setSelectedIncident(updated);
      await loadAll();
      pushToast({ variant: 'info', title: 'Report Expired', message: `${incidentId} marked expired.` });
    } catch (err: any) {
      pushToast({ variant: 'error', title: 'Expire Failed', message: err.message });
    } finally {
      setActionBusy(false);
    }
  };

  const handleAnalyzeImpact = async (incidentId: string) => {
    try {
      const res = await incidentsApi.runImpactAnalysis(incidentId);
      setImpactResult(res);
    } catch (err: any) {
      pushToast({ variant: 'error', title: 'Impact Analysis Failed', message: err.message });
    }
  };

  const handleStartSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const scenario = await simulationsApi.createClosure({
        name: simName,
        type: simType,
        targetSegmentId: simSegmentId,
      });
      await loadAll();
      pushToast({
        variant: 'success',
        title: 'Simulation Started',
        message: `${scenario.name} (+${scenario.results.addedDelayMin}m detour impact)`,
      });
    } catch (err: any) {
      pushToast({ variant: 'error', title: 'Simulation Failed', message: err.message });
    }
  };

  const handleEndSimulation = async (id: string) => {
    try {
      await simulationsApi.end(id);
      await loadAll();
      pushToast({ variant: 'info', title: 'Simulation Ended', message: 'Baseline road restored.' });
    } catch (err: any) {
      pushToast({ variant: 'error', title: 'End Simulation Failed', message: err.message });
    }
  };

  const handleCreateParking = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await parkingApi.create({
        parkingName: newParkingName,
        address: newParkingAddress,
        latitude: newParkingLat,
        longitude: newParkingLng,
        parkingType: newParkingType,
        totalSlots: newParkingCapacity,
        availableSlots: newParkingAvailable,
        pricePerHour: newParkingPrice,
        openingTime: newParkingOpen,
        closingTime: newParkingClose,
        contactInfo: newParkingContact || null,
      });
      setNewParkingName('');
      setNewParkingAddress('');
      setNewParkingContact('');
      await loadAll();
      pushToast({ variant: 'success', title: 'Parking Location Added' });
    } catch (err: any) {
      pushToast({ variant: 'error', title: 'Create Parking Failed', message: err.message });
    }
  };

  const handleUpdateParkingQuick = async (
    p: ParkingLocationDTO,
    patch: { availableSlots?: number; totalSlots?: number; status?: ParkingStatus }
  ) => {
    try {
      await parkingApi.update(p.id, patch);
      await loadAll();
      pushToast({ variant: 'success', title: 'Parking Updated', message: p.parkingName });
    } catch (err: any) {
      pushToast({ variant: 'error', title: 'Update Failed', message: err.message });
    }
  };

  const handleCreateStop = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await transportApi.createStop({
        stopName: newStopName,
        address: newStopAddress,
        landmark: newStopLandmark || null,
        direction: newStopDirection || null,
        latitude: newStopLat,
        longitude: newStopLng,
      });
      setNewStopName('');
      setNewStopAddress('');
      setNewStopLandmark('');
      await loadAll();
      pushToast({ variant: 'success', title: 'Bus Stop Created' });
    } catch (err: any) {
      pushToast({ variant: 'error', title: 'Create Stop Failed', message: err.message });
    }
  };

  const handleCreateRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await transportApi.createRoute({
        routeNumber: newRouteNumber,
        routeName: newRouteName,
        startingPoint: newRouteStart,
        destination: newRouteEnd,
        routeDescription: `${newRouteStart} to ${newRouteEnd}`,
        estimatedDurationMin: newRouteDuration,
        frequencyMin: newRouteFreq,
        serviceStartTime: '06:00',
        serviceEndTime: '22:00',
        serviceStatus: 'ON_SCHEDULE',
      });
      setNewRouteNumber('');
      setNewRouteName('');
      setNewRouteStart('');
      setNewRouteEnd('');
      await loadAll();
      pushToast({ variant: 'success', title: 'Bus Route Created' });
    } catch (err: any) {
      pushToast({ variant: 'error', title: 'Create Route Failed', message: err.message });
    }
  };

  const handleAssignRouteStopAndSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignRouteId || !assignStopId) return;
    try {
      await transportApi.upsertRouteStop(assignRouteId, {
        stopId: assignStopId,
        stopOrder: assignOrder,
        travelMinutesFromStart: assignTravelMin,
      });
      await transportApi.createSchedule({
        routeId: assignRouteId,
        stopId: assignStopId,
        scheduledArrival: schedDepTime,
        scheduledDeparture: schedDepTime,
        dayType: 'DAILY',
        status: 'ON_SCHEDULE',
      });
      await loadAll();
      pushToast({ variant: 'success', title: 'Stop & Scheduled Timing Linked to Route' });
    } catch (err: any) {
      pushToast({ variant: 'error', title: 'Assignment Failed', message: err.message });
    }
  };

  const handleRouteStatusChange = async (routeId: string, serviceStatus: BusServiceStatus) => {
    try {
      await transportApi.updateRoute(routeId, { serviceStatus });
      await loadAll();
      pushToast({ variant: 'info', title: 'Bus Route Status Updated' });
    } catch (err: any) {
      pushToast({ variant: 'error', title: 'Update Failed', message: err.message });
    }
  };

  const handleExportCsv = async () => {
    try {
      const blob = await analyticsApi.downloadCsv();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'traffix-operational-summary.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      pushToast({ variant: 'error', title: 'CSV Export Failed', message: err.message });
    }
  };

  if (!user || !isOperator) {
    return (
      <WorkspaceLayout title="Traffic Operations & Network Impact Admin" breadcrumb="Admin">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-6 max-w-lg space-y-3 shadow-sm">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Traffic Administrator or Signal Operator authorization required. Access is strictly
            enforced on the backend.
          </p>
          <Link
            to="/login"
            className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white"
          >
            Sign In as Traffic Admin
          </Link>
        </div>
      </WorkspaceLayout>
    );
  }

  return (
    <WorkspaceLayout
      title="Administration, Parking, Transit & Simulation Lab"
      breadcrumb="Admin"
      actions={
        <button
          type="button"
          onClick={handleExportCsv}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1424] px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export CSV</span>
        </button>
      }
    >
      <div className="space-y-6">
        {/* Segmented Workspace Tabs */}
        <div className="flex flex-wrap items-center gap-1 p-1 bg-white dark:bg-[#0D1424] border border-slate-200 dark:border-slate-800 rounded-lg w-fit shadow-sm">
          {(
            [
              { id: 'review', label: 'Incident Review Queue' },
              ...(isAdmin ? [{ id: 'parking' as const, label: 'Parking Management' }] : []),
              ...(isAdmin ? [{ id: 'transport' as const, label: 'Bus & Transit Admin' }] : []),
              { id: 'simulations', label: 'Closure & Blockage Lab' },
              { id: 'analytics', label: 'Traffic Overview' },
              ...(isAdmin ? [{ id: 'audit' as const, label: 'Audit Logs' }] : []),
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                tab === t.id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* TAB 1: Incident Review Queue */}
        {tab === 'review' && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            <div className="xl:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-5 space-y-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Incident & Violation Queue
                </h2>
                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={onlyDuplicates}
                      onChange={(e) => setOnlyDuplicates(e.target.checked)}
                      className="accent-blue-500"
                    />
                    <span>Duplicates Only</span>
                  </label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="PENDING">Pending Review</option>
                    <option value="UNDER_REVIEW">Under Review</option>
                    <option value="VERIFIED">Verified</option>
                    <option value="REJECTED">Rejected</option>
                    <option value="RESOLVED">Resolved</option>
                  </select>
                </div>
              </div>

              {loading ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
                  Loading queue...
                </p>
              ) : incidents.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
                  No incidents match current filter.
                </p>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800/70">
                  {incidents.map((inc) => (
                    <div
                      key={inc.id}
                      onClick={() => {
                        setSelectedIncident(inc);
                        setImpactResult(null);
                      }}
                      className={`py-3.5 px-3 rounded-lg cursor-pointer transition-colors ${
                        selectedIncident?.id === inc.id
                          ? 'bg-blue-50 dark:bg-blue-950/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {inc.type} · {inc.roadName || inc.roadSegmentName || 'Unmapped'}
                        </span>
                        <span className="font-mono text-cyan-600 dark:text-cyan-300">
                          {inc.isExpired ? `${inc.status} (EXPIRED)` : inc.status}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-700 dark:text-slate-300 line-clamp-2">
                        {inc.description}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        <span>Severity: {inc.severity}</span>
                        <span>Est: {inc.estimatedSeverity}</span>
                        {(inc.stillPresentCount ?? 0) > 0 && (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            {inc.stillPresentCount} still-present votes
                          </span>
                        )}
                        {inc.possibleDuplicate && (
                          <span className="text-amber-600 dark:text-amber-300">
                            Possible Duplicate ({inc.duplicateScore})
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="xl:col-span-5 space-y-5">
              {selectedIncident ? (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-5 space-y-4 shadow-sm">
                  <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
                    <p className="text-xs font-mono text-cyan-600 dark:text-cyan-400">
                      {selectedIncident.id} · {selectedIncident.status}
                      {selectedIncident.isExpired ? ' · EXPIRED' : ''}
                    </p>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white mt-0.5">
                      {selectedIncident.type} —{' '}
                      {selectedIncident.roadName || selectedIncident.roadSegmentName || 'Corridor'}
                    </h3>
                    {selectedIncident.landmark && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Landmark: {selectedIncident.landmark}
                      </p>
                    )}
                  </div>

                  <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                    {selectedIncident.description}
                  </p>

                  {selectedIncident.possibleDuplicate && (
                    <div className="rounded-lg border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-800 dark:text-amber-200">
                      Duplicate Alert: {selectedIncident.duplicateReason}
                    </div>
                  )}

                  <div className="text-xs space-y-1 text-slate-600 dark:text-slate-300">
                    <p>Reporter: {selectedIncident.reporterName || selectedIncident.reporterId}</p>
                    <p>
                      Estimated Severity: {selectedIncident.estimatedSeverity} (
                      {Math.round(selectedIncident.severityConfidence * 100)}%)
                    </p>
                  </div>

                  {isAdmin && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      {selectedIncident.status === 'PENDING' && (
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() =>
                            handleReviewAction(selectedIncident.id, 'UNDER_REVIEW', false)
                          }
                          className="rounded-lg border border-cyan-400 dark:border-cyan-500/40 px-3 py-2 text-xs font-medium text-cyan-700 dark:text-cyan-300 hover:bg-cyan-50 dark:hover:bg-cyan-950/30 disabled:opacity-50"
                        >
                          Under Review
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() =>
                          handleReviewAction(selectedIncident.id, 'VERIFIED', false)
                        }
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Verify</span>
                      </button>
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() =>
                          handleReviewAction(selectedIncident.id, 'VERIFIED', true)
                        }
                        className="rounded-lg bg-orange-600 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
                      >
                        Verify & Close Road
                      </button>
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() => handleReviewAction(selectedIncident.id, 'RESOLVED')}
                        className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        <span>Resolve</span>
                      </button>
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() => handleReviewAction(selectedIncident.id, 'REJECTED')}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-400 dark:border-red-500/40 px-3 py-2 text-xs text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                      >
                        <XIcon className="w-3.5 h-3.5" />
                        <span>Reject</span>
                      </button>
                      {!selectedIncident.isExpired && (
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => handleExpireIncident(selectedIncident.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-amber-400 dark:border-amber-500/40 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 disabled:opacity-50"
                        >
                          <Clock className="w-3.5 h-3.5" />
                          <span>Expire</span>
                        </button>
                      )}
                    </div>
                  )}

                  <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
                    <button
                      type="button"
                      onClick={() => handleAnalyzeImpact(selectedIncident.id)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3.5 py-2 text-xs font-medium text-cyan-700 dark:text-cyan-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      Run Connected-Road Network Impact Analysis
                    </button>
                  </div>

                  {impactResult && (
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090E1A] p-3.5 space-y-3 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-slate-900 dark:text-white">
                          Downstream Impact (SIMULATED)
                        </p>
                        <span
                          className={`font-mono text-[11px] ${
                            impactResult.networkConnectivityIntact
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {impactResult.networkConnectivityIntact
                            ? `Connectivity Intact · +${impactResult.estimatedAddedTravelTimeMin}m delay`
                            : 'Critical Cut-Edge (Disconnected)'}
                        </span>
                      </div>
                      <p className="text-slate-700 dark:text-slate-300">{impactResult.summary}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-8 text-center text-xs text-slate-500 dark:text-slate-400 shadow-sm">
                  Select an incident from the review queue to inspect details, verification controls, and network impact.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: Smart Parking Management Dashboard */}
        {tab === 'parking' && isAdmin && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-4 shadow-sm">
                <p className="text-xs text-slate-500 dark:text-slate-400">Parking Facilities</p>
                <p className="mt-1 text-2xl font-mono font-semibold text-slate-900 dark:text-white">
                  {overview?.parkingStats?.totalLocations ?? parkingList.length}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-4 shadow-sm">
                <p className="text-xs text-slate-500 dark:text-slate-400">Available / Total Slots</p>
                <p className="mt-1 text-2xl font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                  {overview?.parkingStats?.availableSpaces ?? 0} / {overview?.parkingStats?.totalCapacity ?? 0}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-4 shadow-sm">
                <p className="text-xs text-slate-500 dark:text-slate-400">Active Reservations</p>
                <p className="mt-1 text-2xl font-mono font-semibold text-cyan-600 dark:text-cyan-300">
                  {overview?.parkingStats?.activeReservations ?? 0}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-4 shadow-sm">
                <p className="text-xs text-slate-500 dark:text-slate-400">Occupancy Rate</p>
                <p className="mt-1 text-2xl font-mono font-semibold text-amber-600 dark:text-amber-300">
                  {overview?.parkingStats?.totalCapacity
                    ? `${Math.round(
                        ((overview.parkingStats.totalCapacity -
                          overview.parkingStats.availableSpaces) /
                          overview.parkingStats.totalCapacity) *
                          100
                      )}%`
                    : '0%'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
              {/* Add Parking Location Form */}
              <form
                onSubmit={handleCreateParking}
                className="xl:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-5 space-y-3 shadow-sm"
              >
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <CircleParking className="w-4 h-4 text-emerald-500" />
                  Add New Parking Location
                </h2>
                <input
                  type="text"
                  required
                  value={newParkingName}
                  onChange={(e) => setNewParkingName(e.target.value)}
                  placeholder="Parking Facility Name"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 text-xs text-slate-900 dark:text-white"
                />
                <input
                  type="text"
                  required
                  value={newParkingAddress}
                  onChange={(e) => setNewParkingAddress(e.target.value)}
                  placeholder="Full Address"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 text-xs text-slate-900 dark:text-white"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    step="0.0001"
                    required
                    value={newParkingLat}
                    onChange={(e) => setNewParkingLat(Number(e.target.value))}
                    placeholder="Latitude"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                  />
                  <input
                    type="number"
                    step="0.0001"
                    required
                    value={newParkingLng}
                    onChange={(e) => setNewParkingLng(Number(e.target.value))}
                    placeholder="Longitude"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={newParkingType}
                    onChange={(e) => setNewParkingType(e.target.value as ParkingType)}
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-2 py-2 text-xs text-slate-900 dark:text-white"
                  >
                    <option value="BOTH">Car & Bike</option>
                    <option value="CAR">Car Only</option>
                    <option value="BIKE">Bike Only</option>
                  </select>
                  <input
                    type="number"
                    min="1"
                    required
                    value={newParkingCapacity}
                    onChange={(e) => setNewParkingCapacity(Number(e.target.value))}
                    placeholder="Capacity"
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-2.5 py-2 text-xs text-slate-900 dark:text-white"
                  />
                  <input
                    type="number"
                    min="0"
                    required
                    value={newParkingAvailable}
                    onChange={(e) => setNewParkingAvailable(Number(e.target.value))}
                    placeholder="Available"
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-2.5 py-2 text-xs text-slate-900 dark:text-white"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="number"
                    min="0"
                    required
                    value={newParkingPrice}
                    onChange={(e) => setNewParkingPrice(Number(e.target.value))}
                    placeholder="₹/hr"
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-2.5 py-2 text-xs text-slate-900 dark:text-white"
                  />
                  <input
                    type="text"
                    value={newParkingOpen}
                    onChange={(e) => setNewParkingOpen(e.target.value)}
                    placeholder="Open 06:00"
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-2.5 py-2 text-xs text-slate-900 dark:text-white"
                  />
                  <input
                    type="text"
                    value={newParkingClose}
                    onChange={(e) => setNewParkingClose(e.target.value)}
                    placeholder="Close 23:00"
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-2.5 py-2 text-xs text-slate-900 dark:text-white"
                  />
                </div>
                <input
                  type="text"
                  value={newParkingContact}
                  onChange={(e) => setNewParkingContact(e.target.value)}
                  placeholder="Contact Phone / Desk (Optional)"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 text-xs text-slate-900 dark:text-white"
                />
                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Parking Facility
                </button>
              </form>

              {/* Parking Operations Table */}
              <div className="xl:col-span-8 space-y-5">
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] overflow-hidden shadow-sm">
                  <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      Manage Parking Capacity & Status
                    </h3>
                    <span className="font-mono text-[10px] text-amber-600 dark:text-amber-300">
                      MANUAL OPERATOR UPDATES
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-[#090E1A] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="px-4 py-2.5 font-medium">Facility</th>
                          <th className="px-4 py-2.5 font-medium">Available / Cap</th>
                          <th className="px-4 py-2.5 font-medium">Status</th>
                          <th className="px-4 py-2.5 font-medium text-right">Quick Controls</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800/70">
                        {parkingList.map((p) => (
                          <tr key={p.id}>
                            <td className="px-4 py-3">
                              <p className="font-semibold text-slate-900 dark:text-white">{p.parkingName}</p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                {p.parkingType} · {p.priceLabel}
                              </p>
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-800 dark:text-slate-200">
                              {p.availableSlots} / {p.totalSlots}
                            </td>
                            <td className="px-4 py-3 font-mono text-[11px]">{p.status}</td>
                            <td className="px-4 py-3 text-right space-x-1.5 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateParkingQuick(p, {
                                    availableSlots: Math.max(0, p.availableSlots - 1),
                                  })
                                }
                                className="rounded border border-slate-300 dark:border-slate-700 px-2 py-1 text-[11px] hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                -1 Slot
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateParkingQuick(p, {
                                    availableSlots: Math.min(p.totalSlots, p.availableSlots + 1),
                                  })
                                }
                                className="rounded border border-slate-300 dark:border-slate-700 px-2 py-1 text-[11px] hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                +1 Slot
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateParkingQuick(p, {
                                    availableSlots: 0,
                                    status: 'FULL',
                                  })
                                }
                                className="rounded border border-rose-300 dark:border-rose-700 px-2 py-1 text-[11px] text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                              >
                                Mark Full
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateParkingQuick(p, {
                                    status:
                                      p.status === 'TEMPORARILY_CLOSED'
                                        ? p.availableSlots > 0
                                          ? 'AVAILABLE'
                                          : 'FULL'
                                        : 'TEMPORARILY_CLOSED',
                                  })
                                }
                                className="rounded border border-slate-300 dark:border-slate-700 px-2 py-1 text-[11px] hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                {p.status === 'TEMPORARILY_CLOSED' ? 'Reopen' : 'Temp Close'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* All Reservations */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] overflow-hidden shadow-sm">
                  <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      Recent Parking Reservations ({adminReservations.length})
                    </h3>
                  </div>
                  <div className="overflow-x-auto max-h-60">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-[#090E1A] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="px-4 py-2 font-medium">Facility & Slot</th>
                          <th className="px-4 py-2 font-medium">User</th>
                          <th className="px-4 py-2 font-medium">Vehicle</th>
                          <th className="px-4 py-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800/70">
                        {adminReservations.map((r) => (
                          <tr key={r.id}>
                            <td className="px-4 py-2 text-slate-900 dark:text-white">
                              {r.parkingName} · <strong>{r.slotNumber}</strong>
                            </td>
                            <td className="px-4 py-2 text-slate-600 dark:text-slate-300">
                              {r.userName || r.userId}
                            </td>
                            <td className="px-4 py-2 font-mono text-slate-500 dark:text-slate-400">
                              {r.vehicleType} {r.vehicleNumber || ''}
                            </td>
                            <td className="px-4 py-2 font-mono text-[11px]">{r.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Bus & Public Transport Management */}
        {tab === 'transport' && isAdmin && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Create Stop */}
              <form
                onSubmit={handleCreateStop}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-5 space-y-3 shadow-sm"
              >
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Bus className="w-4 h-4 text-blue-500" /> Add Bus Stop
                </h2>
                <input
                  type="text"
                  required
                  value={newStopName}
                  onChange={(e) => setNewStopName(e.target.value)}
                  placeholder="Stop Name"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 text-xs text-slate-900 dark:text-white"
                />
                <input
                  type="text"
                  required
                  value={newStopAddress}
                  onChange={(e) => setNewStopAddress(e.target.value)}
                  placeholder="Street / Location"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 text-xs text-slate-900 dark:text-white"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={newStopLandmark}
                    onChange={(e) => setNewStopLandmark(e.target.value)}
                    placeholder="Landmark"
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 text-xs text-slate-900 dark:text-white"
                  />
                  <input
                    type="text"
                    value={newStopDirection}
                    onChange={(e) => setNewStopDirection(e.target.value)}
                    placeholder="Direction"
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 text-xs text-slate-900 dark:text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    step="0.0001"
                    required
                    value={newStopLat}
                    onChange={(e) => setNewStopLat(Number(e.target.value))}
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                  />
                  <input
                    type="number"
                    step="0.0001"
                    required
                    value={newStopLng}
                    onChange={(e) => setNewStopLng(Number(e.target.value))}
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500"
                >
                  Create Bus Stop
                </button>
              </form>

              {/* Create Route */}
              <form
                onSubmit={handleCreateRoute}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-5 space-y-3 shadow-sm"
              >
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Add Bus Route
                </h2>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    value={newRouteNumber}
                    onChange={(e) => setNewRouteNumber(e.target.value)}
                    placeholder="Route No (e.g. 601)"
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 text-xs text-slate-900 dark:text-white"
                  />
                  <input
                    type="text"
                    required
                    value={newRouteName}
                    onChange={(e) => setNewRouteName(e.target.value)}
                    placeholder="Route Name"
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 text-xs text-slate-900 dark:text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    value={newRouteStart}
                    onChange={(e) => setNewRouteStart(e.target.value)}
                    placeholder="Start Endpoint"
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 text-xs text-slate-900 dark:text-white"
                  />
                  <input
                    type="text"
                    required
                    value={newRouteEnd}
                    onChange={(e) => setNewRouteEnd(e.target.value)}
                    placeholder="End Destination"
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 text-xs text-slate-900 dark:text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min="5"
                    required
                    value={newRouteDuration}
                    onChange={(e) => setNewRouteDuration(Number(e.target.value))}
                    placeholder="Est Duration (min)"
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 text-xs text-slate-900 dark:text-white"
                  />
                  <input
                    type="number"
                    min="5"
                    required
                    value={newRouteFreq}
                    onChange={(e) => setNewRouteFreq(Number(e.target.value))}
                    placeholder="Freq (min)"
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 text-xs text-slate-900 dark:text-white"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500"
                >
                  Create Bus Route
                </button>
              </form>

              {/* Assign Stop & Timetable */}
              <form
                onSubmit={handleAssignRouteStopAndSchedule}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-5 space-y-3 shadow-sm"
              >
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Link Stop & Schedule
                </h2>
                <select
                  value={assignRouteId}
                  onChange={(e) => setAssignRouteId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 text-xs text-slate-900 dark:text-white"
                >
                  {busRoutes.map((r) => (
                    <option key={r.id} value={r.id}>
                      Route {r.routeNumber}: {r.routeName}
                    </option>
                  ))}
                </select>
                <select
                  value={assignStopId}
                  onChange={(e) => setAssignStopId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 text-xs text-slate-900 dark:text-white"
                >
                  {busStops.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.stopName}
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="number"
                    min="1"
                    value={assignOrder}
                    onChange={(e) => setAssignOrder(Number(e.target.value))}
                    placeholder="Order"
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-2.5 py-2 text-xs text-slate-900 dark:text-white"
                  />
                  <input
                    type="number"
                    min="0"
                    value={assignTravelMin}
                    onChange={(e) => setAssignTravelMin(Number(e.target.value))}
                    placeholder="+Min"
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-2.5 py-2 text-xs text-slate-900 dark:text-white"
                  />
                  <input
                    type="text"
                    value={schedDepTime}
                    onChange={(e) => setSchedDepTime(e.target.value)}
                    placeholder="09:15"
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-2.5 py-2 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full rounded-lg bg-cyan-600 px-4 py-2 text-xs font-semibold text-white hover:bg-cyan-500"
                >
                  Add Stop & Scheduled Time
                </button>
              </form>
            </div>

            {/* Bus Routes Status List */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] overflow-hidden shadow-sm">
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Configured Bus Routes ({busRoutes.length}) & Stops ({busStops.length})
                </h3>
                <span className="font-mono text-[10px] text-cyan-600 dark:text-cyan-400">
                  SCHEDULED SAMPLE DATA
                </span>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-slate-800/70">
                {busRoutes.map((r) => (
                  <div key={r.id} className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">
                        Bus {r.routeNumber} — {r.routeName} ({r.startingPoint} → {r.destination})
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {r.stops.length} stops · Every {r.frequencyMin}m · {r.serviceStartTime}–{r.serviceEndTime}
                      </p>
                    </div>
                    <select
                      value={r.serviceStatus}
                      onChange={(e) =>
                        handleRouteStatusChange(r.id, e.target.value as BusServiceStatus)
                      }
                      className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-white"
                    >
                      <option value="ON_SCHEDULE">ON_SCHEDULE</option>
                      <option value="DELAYED">DELAYED</option>
                      <option value="SUSPENDED">SUSPENDED</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: Road Closure & Lane-Blockage Simulation Lab */}
        {tab === 'simulations' && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            <div className="xl:col-span-5 space-y-5">
              <form
                onSubmit={handleStartSimulation}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-5 space-y-4 shadow-sm"
              >
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                    Non-Destructive Closure Simulation
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Simulates full closure or lane restriction in route calculation without
                    overwriting real road records.
                  </p>
                </div>

                <div>
                  <label className="block text-xs text-slate-600 dark:text-slate-300 mb-1">
                    Scenario Name
                  </label>
                  <input
                    type="text"
                    required
                    value={simName}
                    onChange={(e) => setSimName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 text-sm text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-600 dark:text-slate-300 mb-1">
                    Target Road Segment
                  </label>
                  <select
                    value={simSegmentId}
                    onChange={(e) => setSimSegmentId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 text-sm text-slate-900 dark:text-white"
                  >
                    {segments.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.effectiveClosureStatus})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-600 dark:text-slate-300 mb-1">
                    Blockage Mode
                  </label>
                  <select
                    value={simType}
                    onChange={(e) => setSimType(e.target.value as any)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 text-sm text-slate-900 dark:text-white"
                  >
                    <option value="FULL_CLOSURE">Full Road Closure (Excluded from Routing)</option>
                    <option value="LANE_BLOCKAGE">One-Lane Blockage (+22% load penalty)</option>
                  </select>
                </div>

                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500"
                >
                  <Play className="w-4 h-4" />
                  <span>Start Simulation Scenario</span>
                </button>
              </form>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-4 space-y-3 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Scenario History
                </h3>
                {simulations.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No simulation scenarios recorded.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {simulations.map((s) => (
                      <div
                        key={s.id}
                        className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090E1A] p-3 text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-slate-900 dark:text-white">{s.name}</span>
                          <span
                            className={`font-mono ${
                              s.status === 'ACTIVE'
                                ? 'text-amber-600 dark:text-amber-300'
                                : 'text-slate-500'
                            }`}
                          >
                            {s.status}
                          </span>
                        </div>
                        <p className="text-slate-500 dark:text-slate-400">
                          {s.targetSegmentName} · {s.type} · +{s.results.addedDelayMin}m delay
                        </p>
                        {s.status === 'ACTIVE' && (
                          <button
                            type="button"
                            onClick={() => handleEndSimulation(s.id)}
                            className="inline-flex items-center gap-1 rounded border border-red-400 dark:border-red-500/40 px-2.5 py-1 text-[11px] text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
                          >
                            <Square className="w-3 h-3" />
                            <span>End Scenario & Restore Road</span>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="xl:col-span-7">
              <TrafficMap
                nodes={nodes}
                segments={segments}
                incidents={incidents}
                selectedSegmentId={simSegmentId}
                onSegmentSelect={(seg) => setSimSegmentId(seg.id)}
                heightClass="h-[340px] sm:h-[520px]"
              />
            </div>
          </div>
        )}

        {/* TAB 5: Traffic Overview Analytics */}
        {tab === 'analytics' && overview && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-4 shadow-sm">
                <p className="text-xs text-slate-500 dark:text-slate-400">Open / Restricted / Closed</p>
                <p className="mt-1.5 text-xl font-mono text-slate-900 dark:text-white tabular-nums">
                  {overview.networkSummary.openSegments} /{' '}
                  {overview.networkSummary.restrictedSegments} /{' '}
                  {overview.networkSummary.closedSegments}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-4 shadow-sm">
                <p className="text-xs text-slate-500 dark:text-slate-400">Incidents (Pending / Verified)</p>
                <p className="mt-1.5 text-xl font-mono text-slate-900 dark:text-white tabular-nums">
                  {overview.incidentStats.pending} / {overview.incidentStats.verified}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-4 shadow-sm">
                <p className="text-xs text-slate-500 dark:text-slate-400">Signal Wait Reduction</p>
                <p className="mt-1.5 text-xl font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {overview.signalStats.avgWaitReductionPct}% avg
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-4 shadow-sm">
                <p className="text-xs text-slate-500 dark:text-slate-400">Emergency Time Saved</p>
                <p className="mt-1.5 text-xl font-mono text-cyan-600 dark:text-cyan-300 tabular-nums">
                  {overview.emergencyStats.avgTimeSavedMin} min avg
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
                Top Affected Corridors — Congestion Load (%)
              </h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={overview.topAffectedRoads.map((r) => ({
                      name: r.name.split(' ').slice(0, 2).join(' '),
                      LoadPct: Math.round(r.currentCongestion * 100),
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1E293B' : '#E2E8F0'} />
                    <XAxis dataKey="name" tick={{ fill: isDark ? '#94A3B8' : '#64748B', fontSize: 11 }} />
                    <YAxis tick={{ fill: isDark ? '#94A3B8' : '#64748B', fontSize: 11 }} domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: isDark ? '#111827' : '#FFFFFF',
                        borderColor: isDark ? '#334155' : '#CBD5E1',
                        color: isDark ? '#F8FAFC' : '#0F172A',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="LoadPct" fill="#F97316" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <Dashboard overview={overview} compact />
          </div>
        )}

        {/* TAB 6: Audit Log */}
        {tab === 'audit' && isAdmin && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Immutable Operational Audit Log
              </h3>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                {auditLogs.length} entries
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-[#090E1A] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-3 font-medium">Timestamp</th>
                    <th className="px-4 py-3 font-medium">Actor</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                    <th className="px-4 py-3 font-medium">Target</th>
                    <th className="px-4 py-3 font-medium">Before → After</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800/70">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                      <td className="px-4 py-2.5 font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-slate-800 dark:text-slate-200">{log.actorEmail}</td>
                      <td className="px-4 py-2.5 font-mono text-cyan-600 dark:text-cyan-300">{log.action}</td>
                      <td className="px-4 py-2.5 font-mono text-slate-700 dark:text-slate-300">
                        {log.targetType}:{log.targetId}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">
                        {log.beforeSummary} → {log.afterSummary}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </WorkspaceLayout>
  );
}
