import React, { useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Navigation,
  AlertTriangle,
  ShieldAlert,
  ParkingSquare,
  Bus,
  BarChart3,
  Settings,
  Sliders,
  Ambulance,
  ShieldCheck,
  Siren,
  User,
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { PWAInstallButton } from './PWAInstallButton';

const PRIMARY_NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/navigate', label: 'Route Optimization', icon: Navigation },
  { to: '/sos', label: 'Emergency SOS & Hospitals', icon: Siren },
  { to: '/incidents', label: 'Traffic Reports', icon: AlertTriangle },
  { to: '/violations', label: 'Wrong-Way & Parking', icon: ShieldAlert },
  { to: '/parking', label: 'Smart Parking', icon: ParkingSquare },
  { to: '/transport', label: 'Bus & Public Transport', icon: Bus },
  { to: '/predictions', label: 'Traffic Analytics', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const OPS_NAV = [
  { to: '/signals', label: 'Signal Control', icon: Sliders },
  { to: '/emergency', label: 'Emergency Priority', icon: Ambulance },
  { to: '/admin', label: 'Admin & Impact', icon: ShieldCheck },
];

export function ThemeToggleButton({ compact = false }: { compact?: boolean }) {
  const { isDark, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#0F172A] px-2.5 min-h-[38px] sm:min-h-[32px] py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-xs"
    >
      {isDark ? (
        <Sun className="w-3.5 h-3.5 text-amber-400" />
      ) : (
        <Moon className="w-3.5 h-3.5 text-blue-600" />
      )}
      {!compact && <span>{isDark ? 'Light' : 'Dark'}</span>}
    </button>
  );
}

function TraffixBrandMark() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <img
        src="/icon.svg"
        alt="TRAFFIX logo"
        className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700/80 shrink-0"
      />
      <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap font-display">
        TRAFFIX
      </span>
    </span>
  );
}

export function MobileBottomNav({ onOpenMenu }: { onOpenMenu?: () => void }) {
  return (
    <nav
      aria-label="Mobile quick navigation"
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#090E1A]/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
    >
      <div className="grid grid-cols-5 items-center h-14 px-1">
        <NavLink
          to="/dashboard"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-lg text-[10px] font-medium transition-colors ${
              isActive
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-600 dark:text-slate-400'
            }`
          }
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>Home</span>
        </NavLink>

        <NavLink
          to="/navigate"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-lg text-[10px] font-medium transition-colors ${
              isActive
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-600 dark:text-slate-400'
            }`
          }
        >
          <Navigation className="w-4 h-4" />
          <span>Routes</span>
        </NavLink>

        <NavLink
          to="/sos"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-0.5 min-h-[44px] mx-1 rounded-xl text-[10px] font-bold transition-colors ${
              isActive
                ? 'bg-red-600 text-white shadow-sm'
                : 'bg-red-600/95 text-white hover:bg-red-500 shadow-xs'
            }`
          }
        >
          <Siren className="w-4 h-4" />
          <span>SOS</span>
        </NavLink>

        <NavLink
          to="/parking"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-lg text-[10px] font-medium transition-colors ${
              isActive
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-600 dark:text-slate-400'
            }`
          }
        >
          <ParkingSquare className="w-4 h-4" />
          <span>Parking</span>
        </NavLink>

        {onOpenMenu ? (
          <button
            type="button"
            onClick={onOpenMenu}
            className="flex flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-lg text-[10px] font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            aria-label="Open all modules menu"
          >
            <Menu className="w-4 h-4" />
            <span>Modules</span>
          </button>
        ) : (
          <NavLink
            to="/violations"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-lg text-[10px] font-medium transition-colors ${
                isActive
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-slate-600 dark:text-slate-400'
              }`
            }
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Reports</span>
          </NavLink>
        )}
      </div>
    </nav>
  );
}

export function PublicHeader() {
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-800/80 bg-white/92 dark:bg-[#090E1A]/92 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 py-3">
        <Link to="/" className="shrink-0">
          <TraffixBrandMark />
        </Link>

        <nav className="hidden lg:flex items-center gap-5 text-sm font-medium text-slate-600 dark:text-slate-300">
          <Link to="/dashboard" className="hover:text-blue-600 dark:hover:text-white transition-colors whitespace-nowrap">
            Dashboard
          </Link>
          <Link to="/navigate" className="hover:text-blue-600 dark:hover:text-white transition-colors whitespace-nowrap">
            Route Optimizer
          </Link>
          <Link to="/violations" className="hover:text-blue-600 dark:hover:text-white transition-colors whitespace-nowrap">
            Violations
          </Link>
          <Link to="/parking" className="hover:text-blue-600 dark:hover:text-white transition-colors whitespace-nowrap">
            Smart Parking
          </Link>
          <Link to="/transport" className="hover:text-blue-600 dark:hover:text-white transition-colors whitespace-nowrap">
            Public Transport
          </Link>
          <Link to="/predictions" className="hover:text-blue-600 dark:hover:text-white transition-colors whitespace-nowrap">
            Analytics
          </Link>
        </nav>

        <div className="hidden lg:flex items-center gap-2.5 shrink-0">
          <Link
            to="/sos"
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 hover:bg-red-500 px-3 py-1.5 text-xs font-bold text-white transition-colors whitespace-nowrap shadow-xs"
          >
            <Siren className="w-3.5 h-3.5" />
            <span>SOS</span>
          </Link>
          <PWAInstallButton />
          <ThemeToggleButton />
          {user ? (
            <Link
              to="/dashboard"
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 transition-colors whitespace-nowrap shrink-0"
            >
              Open Workspace
            </Link>
          ) : (
            <Link
              to="/login"
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 transition-colors whitespace-nowrap shrink-0"
            >
              Sign In
            </Link>
          )}
        </div>

        <div className="flex lg:hidden items-center gap-2">
          <Link
            to="/sos"
            className="inline-flex items-center gap-1 rounded-lg bg-red-600 hover:bg-red-500 px-2.5 min-h-[38px] text-xs font-bold text-white"
          >
            <Siren className="w-3.5 h-3.5" />
            <span>SOS</span>
          </Link>
          <PWAInstallButton compact />
          <ThemeToggleButton compact />
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-2 min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="lg:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] px-5 py-4 space-y-2">
          {PRIMARY_NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-white py-2 min-h-[44px]"
            >
              <item.icon className="w-4 h-4 text-slate-400" />
              <span>{item.label}</span>
            </Link>
          ))}
          <Link
            to={user ? '/profile' : '/login'}
            onClick={() => setMobileOpen(false)}
            className="block rounded-lg bg-blue-600 px-4 py-3 text-center text-sm font-medium text-white min-h-[44px]"
          >
            {user ? 'Account Profile' : 'Sign In'}
          </Link>
        </div>
      )}
    </header>
  );
}

export function WorkspaceLayout({
  title,
  breadcrumb,
  actions,
  children,
}: {
  title: string;
  breadcrumb: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { user, logout, socketConnected } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const renderNavItems = (onItemClick?: () => void) => (
    <>
      <div className="space-y-1">
        {PRIMARY_NAV.map((item) => {
          const Icon = item.icon;
          const isSos = item.to === '/sos';
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onItemClick}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 min-h-[42px] py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? isSos
                      ? 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-600/20 dark:text-red-300 dark:border-red-500/35'
                      : 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-600/15 dark:text-blue-300 dark:border-blue-500/25'
                    : isSos
                    ? 'text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30 border border-transparent'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800/50 border border-transparent'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </div>

      <div className="pt-4 mt-4 border-t border-slate-200 dark:border-slate-800/80 space-y-1">
        <p className="px-3 pb-1 text-[10px] font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Operations
        </p>
        {OPS_NAV.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onItemClick}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 min-h-[42px] py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-600/15 dark:text-blue-300 dark:border-blue-500/25'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800/50 border border-transparent'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </>
  );

  const renderSidebarFooter = (onAction?: () => void) => (
    <div className="border-t border-slate-200 dark:border-slate-800/80 p-4 space-y-3">
      <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
        <div className="flex items-center justify-between">
          <span>Simulation Baseline</span>
          <span className="font-mono text-cyan-600 dark:text-cyan-400">ACTIVE</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Socket Feed</span>
          <span
            className={`font-mono ${
              socketConnected
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-amber-600 dark:text-amber-400'
            }`}
          >
            {socketConnected ? 'CONNECTED' : 'RECONNECTING'}
          </span>
        </div>
      </div>

      {user ? (
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 space-y-2">
          <Link
            to="/profile"
            onClick={onAction}
            className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-white min-h-[38px]"
          >
            <User className="w-4 h-4 text-slate-400 shrink-0" />
            <div className="min-w-0">
              <p className="truncate font-medium text-xs">{user.name}</p>
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                {user.role}
              </p>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => {
              logout();
              onAction?.();
              navigate('/login');
            }}
            className="w-full flex items-center justify-center gap-2 rounded-md border border-slate-200 dark:border-slate-700/80 px-3 min-h-[38px] text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      ) : (
        <Link
          to="/login"
          state={{ from: location.pathname }}
          onClick={onAction}
          className="block w-full rounded-lg bg-blue-600 px-4 py-2.5 text-center text-xs font-semibold text-white hover:bg-blue-500 transition-colors"
        >
          Sign In
        </Link>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#090E1A] text-slate-900 dark:text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col border-r border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0C1221] shrink-0">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800/80">
          <Link to="/">
            <TraffixBrandMark />
          </Link>
        </div>

        <nav className="flex-1 px-3 py-4 overflow-y-auto">{renderNavItems()}</nav>

        {renderSidebarFooter()}
      </aside>

      {/* Mobile Drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-72 max-w-[85vw] bg-white dark:bg-[#0C1221] border-r border-slate-200 dark:border-slate-800 flex flex-col z-10">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <Link to="/" onClick={() => setSidebarOpen(false)}>
                <TraffixBrandMark />
              </Link>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                aria-label="Close navigation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 overflow-y-auto">
              {renderNavItems(() => setSidebarOpen(false))}
            </nav>
            {renderSidebarFooter(() => setSidebarOpen(false))}
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-slate-200 dark:border-slate-800/80 bg-white/95 dark:bg-[#0B111E]/95 px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
              aria-label="Open navigation"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                TRAFFIX / {breadcrumb} · SIMULATED DATA
              </p>
              <h1 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white truncate font-display">
                {title}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {actions}
            {location.pathname !== '/sos' && (
              <Link
                to="/sos"
                className="hidden sm:inline-flex items-center gap-1.5 rounded-lg bg-red-600 hover:bg-red-500 px-3 min-h-[32px] py-1.5 text-xs font-bold text-white transition-colors whitespace-nowrap shadow-xs"
              >
                <Siren className="w-3.5 h-3.5" />
                <span>SOS</span>
              </Link>
            )}
            <PWAInstallButton compact />
            <ThemeToggleButton compact />
            {!user && (
              <Link
                to="/login"
                className="rounded-lg bg-blue-600 px-3 min-h-[36px] sm:min-h-[32px] inline-flex items-center text-xs font-semibold text-white hover:bg-blue-500 transition-colors whitespace-nowrap shrink-0"
              >
                Sign In
              </Link>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 pb-24 lg:pb-6 overflow-x-hidden">{children}</main>
      </div>

      {/* Persistent Mobile Bottom Navigation */}
      <MobileBottomNav onOpenMenu={() => setSidebarOpen(true)} />
    </div>
  );
}
