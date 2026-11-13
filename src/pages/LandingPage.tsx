import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Navigation,
  AlertTriangle,
  TrendingUp,
  ShieldCheck,
  ParkingSquare,
  Bus,
  Siren,
} from 'lucide-react';
import { MobileBottomNav, PublicHeader } from '../components/Layout';
import { analyticsApi } from '../services/api';
import heroCorridorImg from '../assets/images/hero_urban_corridor_1794548898212.jpg';

export function LandingPage() {
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    analyticsApi
      .getPublicSummary()
      .then(setSummary)
      .catch(() => setSummary(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#090E1A] dark:text-slate-100 flex flex-col transition-colors pb-16 lg:pb-0">
      <PublicHeader />

      <main className="flex-1">
        {/* Hero Split */}
        <section className="mx-auto max-w-7xl px-4 sm:px-6 pt-10 pb-10 lg:pt-16 lg:pb-14">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="lg:col-span-6 flex flex-col justify-center space-y-5"
            >
              <p className="text-xs font-mono text-cyan-700 dark:text-cyan-400 tracking-wide">
                SMART-CITY TRAFFIC OPERATIONS · SIMULATED BASELINE NETWORK
              </p>
              <h1
                className="text-3xl sm:text-5xl font-bold tracking-tight text-slate-900 dark:text-white leading-[1.1] font-display max-w-xl"
                style={{ textWrap: 'balance' }}
              >
                Intelligent route optimization and urban corridor control.
              </h1>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
                TRAFFIX unifies Google Maps multi-factor routing, wrong-way &amp; illegal parking
                reporting, Smart Parking slot discovery, bus transit planning, 15–30 minute
                congestion forecasting, emergency SOS hospital lookup, and priority green-corridor control.
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Link
                  to="/navigate"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 min-h-[46px] text-sm font-semibold text-white hover:bg-blue-500 transition-colors whitespace-nowrap"
                >
                  <span>Open Route Optimizer</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/sos"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 min-h-[46px] text-sm font-semibold text-white hover:bg-red-500 transition-colors whitespace-nowrap"
                >
                  <Siren className="w-4 h-4" />
                  <span>Emergency SOS</span>
                </Link>
                <Link
                  to="/parking"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-transparent px-4 min-h-[46px] text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors whitespace-nowrap"
                >
                  <span>Smart Parking</span>
                </Link>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: 0.05 }}
              className="lg:col-span-6"
            >
              <div className="relative h-full min-h-[260px] lg:min-h-[380px] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 dark:bg-[#111827] shadow-sm">
                <img
                  src={heroCorridorImg}
                  alt="Aerial twilight view of smart-city arterial interchange"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#090E1A]/90 via-[#090E1A]/20 to-transparent" />
                <div className="absolute bottom-4 left-5 right-5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-200">
                  <span>16-Node Arterial Road Graph · 28 Bidir Corridors</span>
                  <span className="font-mono text-cyan-300">SIMULATED DATA</span>
                </div>
              </div>
            </motion.div>
          </div>

          {/* 4-column live KPI strip below hero */}
          <div className="mt-10 grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4 border-t border-slate-200 dark:border-slate-800/80 pt-8">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0D1424] p-4 sm:p-5 shadow-xs">
              <p className="text-xs text-slate-500 dark:text-slate-400">Monitored Road Segments</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white font-mono tabular-nums">
                {loading ? '—' : summary?.networkSummary?.totalSegments ?? 28}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {loading ? 'Loading...' : `${summary?.networkSummary?.openSegments ?? 0} open · simulated`}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0D1424] p-4 sm:p-5 shadow-xs">
              <p className="text-xs text-slate-500 dark:text-slate-400">Avg Network Load</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white font-mono tabular-nums">
                {loading ? '—' : `${summary?.networkSummary?.avgCongestionPct ?? 0}%`}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {loading ? 'Loading...' : `${summary?.networkSummary?.avgSpeedKmh ?? 0} km/h mean speed`}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0D1424] p-4 sm:p-5 shadow-xs">
              <p className="text-xs text-slate-500 dark:text-slate-400">Smart Parking Availability</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white font-mono tabular-nums">
                {loading
                  ? '—'
                  : `${summary?.parkingStats?.availableSpaces ?? 0} / ${summary?.parkingStats?.totalCapacity ?? 0}`}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {loading
                  ? 'Loading...'
                  : `${summary?.parkingStats?.totalLocations ?? 0} facilities · Sample data`}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0D1424] p-4 sm:p-5 shadow-xs">
              <p className="text-xs text-slate-500 dark:text-slate-400">Public Bus Network</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white font-mono tabular-nums">
                {loading
                  ? '—'
                  : `${summary?.transportStats?.totalStops ?? 0} stops · ${summary?.transportStats?.totalRoutes ?? 0} routes`}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Verified incidents: {loading ? '—' : summary?.verifiedIncidentsCount ?? 0} · Timetable
              </p>
            </div>
          </div>
        </section>

        {/* Core Capabilities */}
        <section className="mx-auto max-w-7xl px-4 sm:px-6 py-10 sm:py-12 border-t border-slate-200 dark:border-slate-800/70">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white font-display">
              Integrated Modules Backed by Server-Side Algorithms
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Every route search, violation check, parking reservation, transit itinerary, SOS
              hospital search, prediction batch, and signal timing plan runs with relational persistence.
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <Link
              to="/navigate"
              className="group rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0D1424] p-6 hover:border-blue-500/40 transition-colors shadow-xs"
            >
              <Navigation className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-300 transition-colors">
                01. Multi-Factor Routing &amp; Hazards
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Compare Shortest, Fastest, and Recommended Google Maps routes with verified
                incident warnings and destination Smart Parking suggestions.
              </p>
            </Link>

            <Link
              to="/sos"
              className="group rounded-xl border border-red-200 dark:border-red-500/30 bg-white dark:bg-[#0D1424] p-6 hover:border-red-500/60 transition-colors shadow-xs"
            >
              <Siren className="w-5 h-5 text-red-600 dark:text-red-400" />
              <h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-white group-hover:text-red-600 dark:group-hover:text-red-300 transition-colors">
                02. Emergency SOS &amp; Nearby Hospitals
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                One-tap 108 / 112 / 101 calling, personal emergency contacts, GPS location sharing,
                real Google Places hospital discovery, and assistance audit logs.
              </p>
            </Link>

            <Link
              to="/violations"
              className="group rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0D1424] p-6 hover:border-blue-500/40 transition-colors shadow-xs"
            >
              <AlertTriangle className="w-5 h-5 text-amber-500 dark:text-amber-400" />
              <h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-300 transition-colors">
                03. Wrong-Way &amp; Illegal Parking
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Pin road violations with GPS capture, photo upload, automatic nearby duplicate
                flagging, community &ldquo;Still Present?&rdquo; checks, and expiry lifecycle.
              </p>
            </Link>

            <Link
              to="/parking"
              className="group rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0D1424] p-6 hover:border-blue-500/40 transition-colors shadow-xs"
            >
              <ParkingSquare className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-300 transition-colors">
                04. Smart Parking Availability
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Search Car &amp; Bike facilities with exact slot counts, color availability
                indicators, atomic slot reservations, and one-click route guidance.
              </p>
            </Link>

            <Link
              to="/transport"
              className="group rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0D1424] p-6 hover:border-blue-500/40 transition-colors shadow-xs"
            >
              <Bus className="w-5 h-5 text-sky-600 dark:text-sky-400" />
              <h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-300 transition-colors">
                05. Bus Stop &amp; Public Transport
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Explore bus stops, scheduled timetable departures, direct and 1-transfer interchange
                journeys, and walking distances to reduce private vehicle trips.
              </p>
            </Link>

            <Link
              to="/predictions"
              className="group rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0D1424] p-6 hover:border-blue-500/40 transition-colors shadow-xs"
            >
              <TrendingUp className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
              <h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-300 transition-colors">
                06. Forecasting &amp; Signal Ops
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                15–30 minute regression congestion forecasting, adaptive traffic signal timing
                optimization, closure impact simulation, and emergency priority corridors.
              </p>
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#080C16] px-6 py-6 transition-colors">
        <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <span>TRAFFIX — Intelligent Traffic Management and Route Optimization System</span>
          <span>Simulated Traffic Baseline &amp; Sample Facility Data Active · OpenAPI at /api/docs</span>
        </div>
      </footer>

      <MobileBottomNav />
    </div>
  );
}
