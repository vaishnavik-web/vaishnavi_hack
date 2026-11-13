import React, { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: string;
  title: string;
  message?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  pushToast: (toast: Omit<ToastItem, 'id'>) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (toast: Omit<ToastItem, 'id'>) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-3), { ...toast, id }]);
      setTimeout(() => dismiss(id), 5000);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ pushToast }}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 shadow-xl backdrop-blur-md transition-all ${
              t.variant === 'error'
                ? 'bg-red-50/95 border-red-200 text-red-900 dark:bg-[#1A1218]/95 dark:border-red-500/40 dark:text-red-100'
                : t.variant === 'warning'
                ? 'bg-amber-50/95 border-amber-200 text-amber-900 dark:bg-[#1A1610]/95 dark:border-amber-500/40 dark:text-amber-100'
                : t.variant === 'success'
                ? 'bg-emerald-50/95 border-emerald-200 text-emerald-900 dark:bg-[#0F1B17]/95 dark:border-emerald-500/40 dark:text-emerald-100'
                : 'bg-white/95 border-slate-200 text-slate-900 dark:bg-[#111827]/95 dark:border-blue-500/40 dark:text-slate-100'
            }`}
          >
            <div className="mt-0.5 shrink-0">
              {t.variant === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
              {t.variant === 'error' && <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />}
              {t.variant === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />}
              {t.variant === 'info' && <Info className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-tight">{t.title}</p>
              {t.message && (
                <p className="text-xs opacity-85 mt-1 leading-snug">{t.message}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="opacity-70 hover:opacity-100 p-0.5"
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
