import React from 'react';
import { Link } from 'react-router-dom';
import { Check, Moon, Shield, Sun, User } from 'lucide-react';
import { WorkspaceLayout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();

  return (
    <WorkspaceLayout title="Appearance & Workspace Settings" breadcrumb="Settings">
      <div className="max-w-3xl space-y-6">
        {/* Theme Selector */}
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-6 space-y-4 shadow-sm">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Display Theme (Light Mode / Dark Mode)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Applies immediately across all pages, analytics charts, modals, forms, and interactive maps. Saved locally across sessions.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`rounded-xl border p-4 text-left transition-all space-y-3 ${
                theme === 'light'
                  ? 'border-blue-600 bg-blue-50/70 ring-2 ring-blue-500/20'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090E1A] hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
                    <Sun className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">Light Mode</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      High-clarity daylight workspace
                    </p>
                  </div>
                </div>
                {theme === 'light' && (
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center">
                    <Check className="w-3 h-3" />
                  </span>
                )}
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-1.5">
                <div className="h-2 w-1/2 rounded bg-slate-200" />
                <div className="h-2 w-4/5 rounded bg-blue-100" />
              </div>
            </button>

            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={`rounded-xl border p-4 text-left transition-all space-y-3 ${
                theme === 'dark'
                  ? 'border-blue-500 bg-blue-950/30 ring-2 ring-blue-500/20'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090E1A] hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-slate-800 text-cyan-400 flex items-center justify-center">
                    <Moon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">Dark Mode</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Low-glare command center theme
                    </p>
                  </div>
                </div>
                {theme === 'dark' && (
                  <span className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center">
                    <Check className="w-3 h-3" />
                  </span>
                )}
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#060911] p-2.5 space-y-1.5">
                <div className="h-2 w-1/2 rounded bg-slate-700" />
                <div className="h-2 w-4/5 rounded bg-blue-900/60" />
              </div>
            </button>
          </div>
        </section>

        {/* Account & Data Transparency */}
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] p-6 space-y-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <User className="w-4 h-4 text-blue-500" />
            Account & Data Transparency
          </h2>

          {user ? (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090E1A] p-4 text-xs">
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">{user.name}</p>
                <p className="text-slate-500 dark:text-slate-400 font-mono">
                  {user.email} · Role: {user.role}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to="/profile"
                  className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Edit Profile
                </Link>
                {user.role === 'ADMIN' && (
                  <Link
                    to="/admin"
                    className="rounded-lg bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-500"
                  >
                    Admin Console
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090E1A] p-4 text-xs">
              <span className="text-slate-600 dark:text-slate-300">
                Sign in to save routes, reserve parking slots, and submit verified reports.
              </span>
              <Link
                to="/login"
                className="rounded-lg bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-500"
              >
                Sign In
              </Link>
            </div>
          )}

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090E1A] p-4 text-xs space-y-1.5 text-slate-600 dark:text-slate-300">
            <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-cyan-500" />
              Telemetry & Data Labeling Notice
            </p>
            <p>
              TRAFFIX clearly distinguishes <strong>Verified Operator Incidents</strong>,{' '}
              <strong>Unverified Community Reports</strong>, <strong>Simulated Traffic Metrics</strong>,{' '}
              <strong>Sample / Manually Updated Parking Availability</strong>, and{' '}
              <strong>Scheduled Sample Bus Timetables</strong>.
            </p>
          </div>
        </section>
      </div>
    </WorkspaceLayout>
  );
}
