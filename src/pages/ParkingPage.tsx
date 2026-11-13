import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Car,
  CircleParking,
  Clock,
  Info,
  LocateFixed,
  MapPin,
  Navigation,
  Phone,
  Search,
  Ticket,
  XCircle,
} from 'lucide-react';
import { WorkspaceLayout } from '../components/Layout';
import { TrafficMap } from '../components/TrafficMap';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { parkingApi, routesApi } from '../services/api';
import {
  ParkingLocationDTO,
  ParkingReservationDTO,
  ParkingSlotItemDTO,
  RoadNodeDTO,
  RoadSegmentDTO,
} from '../shared/types';

function getStatusStyles(p: ParkingLocationDTO) {
  if (p.status === 'TEMPORARILY_CLOSED') {
    return {
      label: 'TEMPORARILY CLOSED',
      badge: 'bg-slate-200 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
      dot: 'bg-slate-500',
    };
  }
  if (p.status === 'FULL' || p.availableSlots <= 0) {
    return {
      label: 'FULL (0 FREE)',
      badge: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/40',
      dot: 'bg-red-500',
    };
  }
  if (p.status === 'LIMITED') {
    return {
      label: `LIMITED (${p.availableSlots} FREE)`,
      badge: 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-500/20 dark:text-orange-300 dark:border-orange-500/40',
      dot: 'bg-orange-500',
    };
  }
  return {
    label: `AVAILABLE (${p.availableSlots} FREE)`,
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40',
    dot: 'bg-emerald-500',
  };
}

export function ParkingPage() {
  const { user, socket } = useAuth();
  const { pushToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [nodes, setNodes] = useState<RoadNodeDTO[]>([]);
  const [segments, setSegments] = useState<RoadSegmentDTO[]>([]);
  const [locations, setLocations] = useState<ParkingLocationDTO[]>([]);
  const [selectedParking, setSelectedParking] = useState<ParkingLocationDTO | null>(null);
  const [slots, setSlots] = useState<ParkingSlotItemDTO[]>([]);
  const [myReservations, setMyReservations] = useState<ParkingReservationDTO[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'CAR' | 'BIKE'>('ALL');
  const [availabilityFilter, setAvailabilityFilter] = useState<'ALL' | 'OPEN_SPACES' | 'AVAILABLE' | 'LIMITED'>('ALL');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [sortBy, setSortBy] = useState<'distance' | 'available' | 'price'>('distance');
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number }>({
    lat: 15.852,
    lng: 74.501,
  });

  // Reservation Form
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [vehicleType, setVehicleType] = useState<'CAR' | 'BIKE'>('CAR');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [durationHours, setDurationHours] = useState(2);
  const [reserving, setReserving] = useState(false);

  const loadLocations = useCallback(async () => {
    setLoading(true);
    try {
      const list = await parkingApi.list({
        q: query.trim() || undefined,
        type: typeFilter,
        availability: availabilityFilter,
        maxPrice: maxPrice ? Number(maxPrice) : undefined,
        lat: userCoords.lat,
        lng: userCoords.lng,
        sort: sortBy,
      });
      setLocations(list);
      const paramId = searchParams.get('selected');
      setSelectedParking((prev) => {
        if (paramId) {
          const match = list.find((item) => item.id === paramId);
          if (match) return match;
        }
        if (prev) {
          return list.find((item) => item.id === prev.id) || list[0] || null;
        }
        return list[0] || null;
      });
    } catch (err: any) {
      pushToast({ variant: 'error', title: 'Failed to load parking', message: err.message });
    } finally {
      setLoading(false);
    }
  }, [query, typeFilter, availabilityFilter, maxPrice, userCoords, sortBy, searchParams, pushToast]);

  const loadSlotDetails = useCallback(
    async (parkingId: string) => {
      try {
        const res = await parkingApi.getById(parkingId, userCoords.lat, userCoords.lng);
        setSlots(res.slots);
        const firstFree = res.slots.find((s) => !s.occupied);
        setSelectedSlot(firstFree ? firstFree.slotNumber : '');
        if (res.parking.parkingType === 'BIKE') setVehicleType('BIKE');
        else setVehicleType('CAR');
      } catch {
        setSlots([]);
      }
    },
    [userCoords]
  );

  const loadMyReservations = useCallback(async () => {
    if (!user) {
      setMyReservations([]);
      return;
    }
    try {
      const list = await parkingApi.listMyReservations();
      setMyReservations(list);
    } catch {
      setMyReservations([]);
    }
  }, [user]);

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
    loadLocations();
  }, [loadLocations]);

  useEffect(() => {
    if (selectedParking) {
      loadSlotDetails(selectedParking.id);
    } else {
      setSlots([]);
    }
  }, [selectedParking?.id, loadSlotDetails]);

  useEffect(() => {
    loadMyReservations();
  }, [loadMyReservations]);

  useEffect(() => {
    if (!socket) return;
    const onParkingUpdate = () => {
      loadLocations();
      if (selectedParking) loadSlotDetails(selectedParking.id);
      loadMyReservations();
    };
    socket.on('parking:updated', onParkingUpdate);
    return () => {
      socket.off('parking:updated', onParkingUpdate);
    };
  }, [socket, loadLocations, loadSlotDetails, loadMyReservations, selectedParking]);

  const handleFindNearest = () => {
    if (!navigator.geolocation) {
      pushToast({ variant: 'error', title: 'Geolocation Unsupported' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({
          lat: Number(pos.coords.latitude.toFixed(5)),
          lng: Number(pos.coords.longitude.toFixed(5)),
        });
        setSortBy('distance');
        pushToast({ variant: 'success', title: 'Sorted by Distance from Your Location' });
      },
      (err) => {
        pushToast({ variant: 'error', title: 'Location Permission Denied', message: err.message });
      }
    );
  };

  const handleReserve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      pushToast({ variant: 'info', title: 'Sign In Required', message: 'Sign in to reserve a parking slot.' });
      return;
    }
    if (!selectedParking || !selectedSlot) return;

    setReserving(true);
    try {
      await parkingApi.reserve(selectedParking.id, {
        slotNumber: selectedSlot,
        vehicleType,
        vehicleNumber: vehicleNumber.trim() || undefined,
        durationHours,
      });
      pushToast({
        variant: 'success',
        title: 'Parking Slot Reserved',
        message: `${selectedParking.parkingName} · Slot ${selectedSlot}`,
      });
      setVehicleNumber('');
      await Promise.all([loadLocations(), loadSlotDetails(selectedParking.id), loadMyReservations()]);
    } catch (err: any) {
      pushToast({ variant: 'error', title: 'Reservation Failed', message: err.message });
      await loadSlotDetails(selectedParking.id);
    } finally {
      setReserving(false);
    }
  };

  const handleCancelReservation = async (resId: string) => {
    try {
      await parkingApi.cancelReservation(resId);
      pushToast({ variant: 'info', title: 'Reservation Cancelled', message: 'Parking slot released.' });
      await Promise.all([
        loadLocations(),
        selectedParking ? loadSlotDetails(selectedParking.id) : Promise.resolve(),
        loadMyReservations(),
      ]);
    } catch (err: any) {
      pushToast({ variant: 'error', title: 'Cancel Failed', message: err.message });
    }
  };

  return (
    <WorkspaceLayout
      title="Smart Parking Availability & Slot Reservation"
      breadcrumb="Smart Parking"
      actions={
        <button
          type="button"
          onClick={handleFindNearest}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 whitespace-nowrap"
        >
          <LocateFixed className="w-3.5 h-3.5" />
          <span>Find Nearest Parking</span>
        </button>
      }
    >
      {/* Honest Data Notice */}
      <div className="mb-4 rounded-xl border border-amber-300/70 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
          <Info className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            <strong>Sample / Manually Updated Availability:</strong> Live physical parking lot sensors are not connected. Counts reflect curated sample capacities, operator updates, and reservations made in TRAFFIX.
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono text-slate-700 dark:text-slate-300">
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Available
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500" /> Limited
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Full
          </span>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="mb-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="relative lg:col-span-2">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search parking by area, road, or name..."
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] pl-8 pr-3 py-2 text-xs text-slate-900 dark:text-white"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 text-xs text-slate-900 dark:text-white"
          >
            <option value="ALL">All Vehicles (Car & Bike)</option>
            <option value="CAR">Car Parking</option>
            <option value="BIKE">Bike Parking</option>
          </select>

          <select
            value={availabilityFilter}
            onChange={(e) => setAvailabilityFilter(e.target.value as any)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-3 py-2 text-xs text-slate-900 dark:text-white"
          >
            <option value="ALL">All Availability</option>
            <option value="OPEN_SPACES">Has Open Spaces</option>
            <option value="AVAILABLE">Green — High Availability</option>
            <option value="LIMITED">Orange — Limited Spaces</option>
          </select>

          <div className="flex gap-2">
            <select
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-2.5 py-2 text-xs text-slate-900 dark:text-white"
            >
              <option value="">Any Price</option>
              <option value="0">Free Only</option>
              <option value="20">Up to ₹20/hr</option>
              <option value="40">Up to ₹40/hr</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-2.5 py-2 text-xs text-slate-900 dark:text-white"
            >
              <option value="distance">Sort: Distance</option>
              <option value="available">Sort: Open Slots</option>
              <option value="price">Sort: Lowest Price</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left List */}
        <div className="xl:col-span-5 space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-4 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Nearby Parking Locations ({locations.length})
              </h2>
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                Click to inspect slots
              </span>
            </div>

            {loading ? (
              <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                Loading parking directory...
              </div>
            ) : locations.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                No parking locations match the current filters.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[540px] overflow-y-auto pr-1">
                {locations.map((p) => {
                  const st = getStatusStyles(p);
                  const isSel = selectedParking?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedParking(p)}
                      className={`w-full text-left rounded-xl border p-3.5 transition-colors space-y-2 ${
                        isSel
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/25'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#090E1A] hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${st.dot}`} />
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                              {p.parkingName}
                            </h3>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                            {p.address}
                          </p>
                        </div>
                        <span className={`rounded border px-2 py-0.5 text-[10px] font-mono shrink-0 ${st.badge}`}>
                          {p.availableSlots} / {p.totalSlots} FREE
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-slate-600 dark:text-slate-300">
                        <span>{p.distanceMeters !== undefined ? `${(p.distanceMeters / 1000).toFixed(2)} km away` : ''}</span>
                        <span>· {p.parkingType}</span>
                        <span>· {p.priceLabel}</span>
                        <span>· {p.openingTime}-{p.closingTime}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* My Reservations */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-4 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Ticket className="w-4 h-4 text-blue-500" />
                My Parking Reservations
              </h3>
              {!user && (
                <Link to="/login" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                  Sign In
                </Link>
              )}
            </div>
            {myReservations.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {user ? 'You have no parking reservations yet.' : 'Sign in to view or manage slot reservations.'}
              </p>
            ) : (
              <div className="space-y-2">
                {myReservations.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090E1A] p-3 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 dark:text-white truncate">
                        {r.parkingName} · Slot {r.slotNumber}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                        {r.vehicleType} {r.vehicleNumber ? `(${r.vehicleNumber})` : ''} · {r.durationHours}h ·{' '}
                        <span
                          className={
                            r.status === 'ACTIVE'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-slate-400'
                          }
                        >
                          {r.status}
                        </span>
                      </p>
                    </div>
                    {r.status === 'ACTIVE' && (
                      <button
                        type="button"
                        onClick={() => handleCancelReservation(r.id)}
                        className="inline-flex items-center gap-1 rounded border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/30 px-2.5 py-1 text-[11px] font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/40 shrink-0"
                      >
                        <XCircle className="w-3 h-3" /> Cancel
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Map & Selected Parking Details / Reservation */}
        <div className="xl:col-span-7 space-y-5">
          <TrafficMap
            nodes={nodes}
            segments={segments}
            parkingLocations={locations}
            selectedParkingId={selectedParking?.id || null}
            onParkingSelect={(p) => setSelectedParking(p)}
            heightClass="h-[290px] sm:h-[360px]"
          />

          {selectedParking && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-5 space-y-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <CircleParking className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                      {selectedParking.parkingName}
                    </h2>
                    <span
                      className={`rounded border px-2 py-0.5 text-[10px] font-mono ${
                        getStatusStyles(selectedParking).badge
                      }`}
                    >
                      {getStatusStyles(selectedParking).label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" /> {selectedParking.address}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      `/navigate?destLat=${selectedParking.latitude}&destLng=${
                        selectedParking.longitude
                      }&destLabel=${encodeURIComponent(selectedParking.parkingName)}`
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-500 shrink-0"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Navigate to Parking</span>
                </button>
              </div>

              {/* Metrics Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090E1A] p-3">
                  <p className="text-slate-500 dark:text-slate-400">Available / Total</p>
                  <p className="mt-1 font-mono text-base font-bold text-slate-900 dark:text-white">
                    {selectedParking.availableSlots} / {selectedParking.totalSlots}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {selectedParking.occupiedSlots} occupied
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090E1A] p-3">
                  <p className="text-slate-500 dark:text-slate-400">Charges & Type</p>
                  <p className="mt-1 font-mono text-sm font-semibold text-slate-900 dark:text-white">
                    {selectedParking.priceLabel}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Car className="w-3 h-3" /> {selectedParking.parkingType}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090E1A] p-3">
                  <p className="text-slate-500 dark:text-slate-400">Opening Hours</p>
                  <p className="mt-1 font-mono text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-cyan-500" />
                    {selectedParking.openingTime} – {selectedParking.closingTime}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090E1A] p-3">
                  <p className="text-slate-500 dark:text-slate-400">Distance & Contact</p>
                  <p className="mt-1 font-mono text-sm font-semibold text-slate-900 dark:text-white">
                    {selectedParking.distanceMeters !== undefined
                      ? `${(selectedParking.distanceMeters / 1000).toFixed(2)} km`
                      : 'Mapped'}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1">
                    <Phone className="w-3 h-3" /> {selectedParking.contactInfo || 'Not listed'}
                  </p>
                </div>
              </div>

              {/* Slot Picker & Reservation Form */}
              <div className="space-y-3 border-t border-slate-200 dark:border-slate-800 pt-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Select & Reserve Parking Slot
                  </h3>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Green = Free · Red = Reserved / Occupied
                  </span>
                </div>

                {selectedParking.status === 'TEMPORARILY_CLOSED' ? (
                  <div className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 p-3 text-xs text-slate-600 dark:text-slate-300">
                    This parking facility is temporarily closed by the operator and cannot accept reservations.
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-1.5 max-h-40 overflow-y-auto p-1">
                      {slots.map((slot) => {
                        const isAvailable = !slot.occupied;
                        const isPicked = selectedSlot === slot.slotNumber;
                        return (
                          <button
                            key={slot.slotNumber}
                            type="button"
                            disabled={!isAvailable}
                            onClick={() => setSelectedSlot(slot.slotNumber)}
                            className={`rounded-md border px-1.5 py-1.5 text-[10px] font-mono font-semibold transition-colors ${
                              isPicked
                                ? 'border-blue-600 bg-blue-600 text-white shadow'
                                : isAvailable
                                ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
                                : 'border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/25 text-rose-500 dark:text-rose-400 opacity-60 cursor-not-allowed'
                            }`}
                          >
                            {slot.slotNumber}
                          </button>
                        );
                      })}
                    </div>

                    <form onSubmit={handleReserve} className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2">
                      <div>
                        <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                          Vehicle Type
                        </label>
                        <select
                          value={vehicleType}
                          onChange={(e) => setVehicleType(e.target.value as 'CAR' | 'BIKE')}
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-2.5 py-2 text-xs text-slate-900 dark:text-white"
                        >
                          {(selectedParking.parkingType === 'CAR' || selectedParking.parkingType === 'BOTH') && (
                            <option value="CAR">Car</option>
                          )}
                          {(selectedParking.parkingType === 'BIKE' || selectedParking.parkingType === 'BOTH') && (
                            <option value="BIKE">Bike / Two-Wheeler</option>
                          )}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                          Vehicle Plate (Optional)
                        </label>
                        <input
                          type="text"
                          value={vehicleNumber}
                          onChange={(e) => setVehicleNumber(e.target.value)}
                          placeholder="KA-22-AB-1234"
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-2.5 py-2 text-xs text-slate-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                          Duration (Hours)
                        </label>
                        <select
                          value={durationHours}
                          onChange={(e) => setDurationHours(Number(e.target.value))}
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090E1A] px-2.5 py-2 text-xs text-slate-900 dark:text-white"
                        >
                          {[1, 2, 3, 4, 6, 8, 12].map((h) => (
                            <option key={h} value={h}>
                              {h} hr{h > 1 ? 's' : ''} (₹{h * selectedParking.pricePerHour})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-end">
                        <button
                          type="submit"
                          disabled={reserving || !selectedSlot || selectedParking.availableSlots <= 0}
                          className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                        >
                          {reserving
                            ? 'Reserving...'
                            : selectedSlot
                            ? `Reserve ${selectedSlot}`
                            : 'No Slots Free'}
                        </button>
                      </div>
                    </form>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </WorkspaceLayout>
  );
}
