import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  Bus,
  Clock,
  Footprints,
  Info,
  LocateFixed,
  MapPin,
  Repeat,
  Search,
} from 'lucide-react';
import { WorkspaceLayout } from '../components/Layout';
import { TrafficMap } from '../components/TrafficMap';
import { useToast } from '../context/ToastContext';
import { routesApi, transportApi } from '../services/api';
import {
  BusRouteDTO,
  BusStopDTO,
  RoadNodeDTO,
  RoadSegmentDTO,
  TransitJourneyOptionDTO,
} from '../shared/types';

function getServiceStatusBadge(status: string) {
  if (status === 'SUSPENDED') {
    return 'bg-red-100 text-red-700 border-red-300 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/40';
  }
  if (status === 'DELAYED') {
    return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40';
  }
  return 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40';
}

export function TransportPage() {
  const { pushToast } = useToast();

  const [nodes, setNodes] = useState<RoadNodeDTO[]>([]);
  const [segments, setSegments] = useState<RoadSegmentDTO[]>([]);
  const [stops, setStops] = useState<BusStopDTO[]>([]);
  const [routes, setRoutes] = useState<BusRouteDTO[]>([]);
  const [selectedStop, setSelectedStop] = useState<BusStopDTO | null>(null);
  const [stopRouteDetails, setStopRouteDetails] = useState<BusRouteDTO[]>([]);
  const [stopSearch, setStopSearch] = useState('');

  // Journey Search
  const [originStopId, setOriginStopId] = useState('');
  const [destStopId, setDestStopId] = useState('');
  const [originQuery, setOriginQuery] = useState('');
  const [destQuery, setDestQuery] = useState('');
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [planning, setPlanning] = useState(false);
  const [journeyOptions, setJourneyOptions] = useState<TransitJourneyOptionDTO[]>([]);
  const [nearbyOriginStops, setNearbyOriginStops] = useState<BusStopDTO[]>([]);
  const [selectedJourney, setSelectedJourney] = useState<TransitJourneyOptionDTO | null>(null);
  const [fitBoundsKey, setFitBoundsKey] = useState(0);

  const loadTransportData = useCallback(async () => {
    try {
      const [net, stopList, routeList] = await Promise.all([
        routesApi.getNetwork(),
        transportApi.listStops({ q: stopSearch.trim() || undefined }),
        transportApi.listRoutes(),
      ]);
      setNodes(net.nodes);
      setSegments(net.segments);
      setStops(stopList);
      setRoutes(routeList);
      if (!selectedStop && stopList.length > 0) {
        setSelectedStop(stopList[0]);
      }
      if (!originStopId && stopList.length >= 2) {
        setOriginStopId(stopList[0].id);
        setDestStopId(stopList[Math.min(5, stopList.length - 1)].id);
      }
    } catch (err: any) {
      pushToast({ variant: 'error', title: 'Load Failed', message: err.message });
    }
  }, [stopSearch, selectedStop, originStopId, pushToast]);

  useEffect(() => {
    loadTransportData();
  }, [loadTransportData]);

  useEffect(() => {
    if (!selectedStop) {
      setStopRouteDetails([]);
      return;
    }
    transportApi
      .getStopDetails(selectedStop.id)
      .then((res) => setStopRouteDetails(res.routeDetails))
      .catch(() => setStopRouteDetails([]));
  }, [selectedStop?.id]);

  const handlePlanJourney = async (e: React.FormEvent) => {
    e.preventDefault();
    setPlanning(true);
    try {
      const res = await transportApi.planJourney({
        originStopId: originQuery.trim() ? undefined : originStopId || undefined,
        originLat: userCoords?.lat,
        originLng: userCoords?.lng,
        originQuery: originQuery.trim() || undefined,
        destStopId: destQuery.trim() ? undefined : destStopId || undefined,
        destQuery: destQuery.trim() || undefined,
      });
      setNearbyOriginStops(res.nearbyOriginStops);
      setJourneyOptions(res.options);
      setSelectedJourney(res.options[0] || null);
      setFitBoundsKey((k) => k + 1);
      if (res.options.length === 0) {
        pushToast({
          variant: 'info',
          title: 'No Direct or 1-Transfer Route Found',
          message: 'Try selecting major hubs like Central Bus Stand or Chennamma Circle.',
        });
      }
    } catch (err: any) {
      pushToast({ variant: 'error', title: 'Journey Search Failed', message: err.message });
    } finally {
      setPlanning(false);
    }
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      pushToast({ variant: 'error', title: 'Geolocation Unsupported' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {
          lat: Number(pos.coords.latitude.toFixed(5)),
          lng: Number(pos.coords.longitude.toFixed(5)),
        };
        setUserCoords(coords);
        setOriginQuery('');
        setOriginStopId('');
        pushToast({
          variant: 'success',
          title: 'Origin Set to GPS Location',
          message: 'Closest bus stops will be matched on search.',
        });
      },
      (err) => {
        pushToast({ variant: 'error', title: 'Location Permission Denied', message: err.message });
      }
    );
  };

  return (
    <WorkspaceLayout
      title="Bus Stops & Public Transport Information"
      breadcrumb="Public Transport"
    >
      {/* Honest Timetable Notice */}
      <div className="mb-4 rounded-xl border border-cyan-300/70 dark:border-cyan-500/30 bg-cyan-50 dark:bg-cyan-950/20 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-cyan-900 dark:text-cyan-200">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 shrink-0 text-cyan-600 dark:text-cyan-400" />
          <span>
            <strong>Scheduled Sample Timetables:</strong> Live bus GPS feeds are not connected. Arrival times and frequencies represent scheduled sample municipal timetables.
          </span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wide px-2 py-0.5 rounded bg-white/70 dark:bg-slate-900/60 border border-cyan-300 dark:border-cyan-700">
          {stops.length} Stops · {routes.length} Routes
        </span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left Column: Transit Journey Planner & Options */}
        <div className="xl:col-span-5 space-y-5">
          <form
            onSubmit={handlePlanJourney}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-4 space-y-3.5 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Bus className="w-4 h-4 text-blue-500" />
                Search Public Transport Route
              </h2>
              <button
                type="button"
                onClick={handleUseMyLocation}
                className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25"
              >
                <LocateFixed className="w-3 h-3" />
                <span>Near Me</span>
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Starting Stop or Area {userCoords && <span className="text-emerald-600 dark:text-emerald-400">(GPS Active)</span>}
              </label>
              <select
                value={originStopId}
                onChange={(e) => {
                  setOriginStopId(e.target.value);
                  setOriginQuery('');
                  setUserCoords(null);
                }}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 text-xs text-slate-900 dark:text-white"
              >
                <option value="">-- Select Starting Bus Stop --</option>
                {stops.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.stopName} ({s.landmark || s.address})
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={originQuery}
                onChange={(e) => setOriginQuery(e.target.value)}
                placeholder="Or type starting landmark/area name..."
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-1.5 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Destination Stop or Area
              </label>
              <select
                value={destStopId}
                onChange={(e) => {
                  setDestStopId(e.target.value);
                  setDestQuery('');
                }}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 text-xs text-slate-900 dark:text-white"
              >
                <option value="">-- Select Destination Bus Stop --</option>
                {stops.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.stopName} ({s.landmark || s.address})
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={destQuery}
                onChange={(e) => setDestQuery(e.target.value)}
                placeholder="Or type destination landmark/area name..."
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-1.5 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <button
              type="submit"
              disabled={planning}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {planning ? 'Finding Bus Routes & Interchanges...' : 'Find Bus Routes'}
            </button>
          </form>

          {/* Journey Options Comparison */}
          {journeyOptions.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-4 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Public Transport Options ({journeyOptions.length})
                </h3>
                <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                  SCHEDULED SAMPLE
                </span>
              </div>

              {nearbyOriginStops.length > 0 && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090E1A] p-2.5 text-[11px] text-slate-600 dark:text-slate-300">
                  <strong className="text-slate-800 dark:text-slate-100">Closest Starting Stops:</strong>{' '}
                  {nearbyOriginStops
                    .map((s) => `${s.stopName}${s.distanceMeters !== undefined ? ` (~${s.distanceMeters}m walk)` : ''}`)
                    .join(', ')}
                </div>
              )}

              <div className="space-y-2.5">
                {journeyOptions.map((opt) => {
                  const isSel = selectedJourney?.id === opt.id;
                  const timingsSummary =
                    opt.legs
                      .filter((l) => l.mode === 'BUS')
                      .map((l) => (l.scheduledDeparture ? `Dep ${l.scheduledDeparture}` : null))
                      .filter(Boolean)
                      .join(' · ') || 'Scheduled Sample';
                  return (
                    <div
                      key={opt.id}
                      onClick={() => {
                        setSelectedJourney(opt);
                        setFitBoundsKey((k) => k + 1);
                      }}
                      className={`cursor-pointer rounded-xl border p-3.5 transition-colors space-y-2 ${
                        isSel
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/25'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090E1A] hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-mono font-semibold ${
                              opt.transfersCount === 0
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                            }`}
                          >
                            {opt.transfersCount === 0 ? 'DIRECT BUS' : '1 INTERCHANGE'}
                          </span>
                          <span className="text-xs font-semibold text-slate-900 dark:text-white">
                            {opt.routeNumbers.map((rn) => `Bus ${rn}`).join(' → ')}
                          </span>
                        </div>
                        <span className="font-mono text-xs font-bold text-cyan-600 dark:text-cyan-300">
                          ~{opt.totalDurationMin} min
                        </span>
                      </div>

                      {opt.interchangeStop && (
                        <p className="text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-1">
                          <Repeat className="w-3 h-3" /> Change bus at: <strong>{opt.interchangeStop.stopName}</strong>
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 dark:text-slate-400 font-mono">
                        <span className="inline-flex items-center gap-1">
                          <Footprints className="w-3 h-3" /> {opt.totalWalkMeters}m walk
                        </span>
                        <span>· {timingsSummary}</span>
                      </div>

                      <div className="space-y-1 pt-1 border-t border-slate-200 dark:border-slate-800">
                        {opt.legs.map((leg, i) => (
                          <div key={i} className="text-[11px] text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                            {leg.mode === 'WALK' ? (
                              <Footprints className="w-3 h-3 text-slate-400 shrink-0" />
                            ) : (
                              <Bus className="w-3 h-3 text-blue-500 shrink-0" />
                            )}
                            <span>
                              {leg.mode === 'BUS' ? `Bus ${leg.routeNumber}: ` : 'Walk: '}
                              {leg.fromName} <ArrowRight className="inline w-2.5 h-2.5" /> {leg.toName} ({leg.durationMin}m)
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Bus Stop Directory */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-4 space-y-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Bus Stops Directory
              </h3>
              <div className="relative w-44">
                <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={stopSearch}
                  onChange={(e) => setStopSearch(e.target.value)}
                  placeholder="Filter stops..."
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] pl-7 pr-2 py-1 text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {stops.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedStop(s)}
                  className={`w-full text-left rounded-lg border p-2.5 transition-colors text-xs ${
                    selectedStop?.id === s.id
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/25'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090E1A] hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900 dark:text-white">{s.stopName}</span>
                    <span className="font-mono text-[10px] text-cyan-600 dark:text-cyan-400">
                      {s.routes.map((r) => r.routeNumber).join(', ')}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {s.address} {s.landmark ? `· ${s.landmark}` : ''}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Map & Selected Bus Stop / Route Details */}
        <div className="xl:col-span-7 space-y-5">
          <TrafficMap
            nodes={nodes}
            segments={segments}
            busStops={stops}
            selectedBusStopId={selectedStop?.id || null}
            transitLegs={selectedJourney?.legs || []}
            fitBoundsKey={fitBoundsKey}
            onBusStopSelect={(stop) => setSelectedStop(stop)}
            heightClass="h-[300px] sm:h-[380px]"
          />

          {selectedStop && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-5 space-y-4 shadow-sm">
              <div className="border-b border-slate-200 dark:border-slate-800 pb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-blue-500" />
                    {selectedStop.stopName}
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    {selectedStop.address}
                    {selectedStop.landmark ? ` · Landmark: ${selectedStop.landmark}` : ''}
                    {selectedStop.direction ? ` · Direction: ${selectedStop.direction}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setOriginStopId(selectedStop.id);
                      setOriginQuery('');
                    }}
                    className="rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-[11px] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Set as Start
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDestStopId(selectedStop.id);
                      setDestQuery('');
                    }}
                    className="rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-[11px] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Set as Dest
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Bus Routes Serving This Stop ({stopRouteDetails.length})
                  </h3>
                  <span className="font-mono text-[10px] text-cyan-600 dark:text-cyan-400">
                    SCHEDULED SAMPLE TIMETABLE
                  </span>
                </div>

                {stopRouteDetails.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No active bus routes assigned to this stop yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {stopRouteDetails.map((route) => {
                      const stopSchedules = route.schedules.filter(
                        (sc) => sc.stopId === selectedStop.id
                      );
                      return (
                        <div
                          key={route.id}
                          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090E1A] p-4 space-y-2.5 text-xs"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="rounded bg-blue-600 px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                                Route {route.routeNumber}
                              </span>
                              <span className="font-semibold text-slate-900 dark:text-white">
                                {route.routeName}
                              </span>
                            </div>
                            <span
                              className={`rounded border px-2 py-0.5 text-[10px] font-mono ${getServiceStatusBadge(
                                route.serviceStatus
                              )}`}
                            >
                              {route.serviceStatus} (SCHEDULED)
                            </span>
                          </div>

                          <p className="text-slate-600 dark:text-slate-300">
                            <strong>{route.startingPoint}</strong> → <strong>{route.destination}</strong> ·{' '}
                            Est. Journey: {route.estimatedDurationMin} min · Every {route.frequencyMin} min ({route.serviceStartTime} – {route.serviceEndTime})
                          </p>

                          {/* Stops along the route */}
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                            {route.stops.map((st, idx) => (
                              <React.Fragment key={st.id}>
                                <span
                                  className={`rounded px-1.5 py-0.5 ${
                                    st.stopId === selectedStop.id
                                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-500/30 dark:text-blue-200 font-semibold'
                                      : 'bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                                  }`}
                                >
                                  {st.stopName}
                                </span>
                                {idx < route.stops.length - 1 && (
                                  <span className="text-slate-400">→</span>
                                )}
                              </React.Fragment>
                            ))}
                          </div>

                          {/* Scheduled Timings at this Stop */}
                          {stopSchedules.length > 0 && (
                            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2">
                              <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                <Clock className="w-3 h-3" /> Scheduled Departures here:
                              </span>
                              {stopSchedules.map((sc) => (
                                <span
                                  key={sc.id}
                                  className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1424] px-2 py-0.5 font-mono text-[11px] text-slate-800 dark:text-slate-200"
                                >
                                  {sc.scheduledDeparture} ({sc.dayType})
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </WorkspaceLayout>
  );
}
