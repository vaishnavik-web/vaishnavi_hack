import React, { useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export function PWAInstallButton({ compact = false }: { compact?: boolean }) {
  const { canPromptInstall, isInstalled, showIosGuideOption, triggerInstall } = usePWAInstall();
  const [iosModalOpen, setIosModalOpen] = useState(false);

  if (isInstalled || (!canPromptInstall && !showIosGuideOption)) {
    return null;
  }

  const handleClick = async () => {
    if (canPromptInstall) {
      await triggerInstall();
    } else if (showIosGuideOption) {
      setIosModalOpen(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label="Install TRAFFIX app"
        title="Install TRAFFIX to Home Screen"
        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-50 dark:bg-blue-950/40 px-2.5 min-h-[38px] sm:min-h-[32px] py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors shrink-0"
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        {!compact && <span>Install App</span>}
      </button>

      {iosModalOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ios-install-title"
        >
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0D1424] p-5 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h2
                    id="ios-install-title"
                    className="text-sm font-bold text-slate-900 dark:text-white font-display"
                  >
                    Install TRAFFIX on iPhone / iPad
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Add to Home Screen for standalone SOS &amp; routing access
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIosModalOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
                aria-label="Close instructions"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <ol className="space-y-2.5 text-xs text-slate-700 dark:text-slate-300">
              <li className="flex items-start gap-2.5">
                <span className="font-mono font-bold text-blue-600 dark:text-blue-400">1.</span>
                <span>
                  Tap the Safari <Share className="inline w-3.5 h-3.5 mx-0.5 text-blue-500" />{' '}
                  <strong>Share</strong> button in the browser toolbar.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="font-mono font-bold text-blue-600 dark:text-blue-400">2.</span>
                <span>
                  Scroll down and tap <strong>Add to Home Screen</strong>.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="font-mono font-bold text-blue-600 dark:text-blue-400">3.</span>
                <span>
                  Tap <strong>Add</strong> to launch TRAFFIX full-screen like a native app.
                </span>
              </li>
            </ol>

            <button
              type="button"
              onClick={() => setIosModalOpen(false)}
              className="w-full min-h-[44px] rounded-xl bg-blue-600 text-xs font-semibold text-white hover:bg-blue-500 transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
