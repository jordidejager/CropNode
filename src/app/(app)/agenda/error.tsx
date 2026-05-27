'use client';

/**
 * Error boundary voor /agenda — toont de échte error in plaats van de
 * generieke "Er ging iets mis" Sentry-pagina. Helpt bij debuggen van
 * server- en client-side render fouten op deze specifieke route.
 */

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function AgendaError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[agenda] Render error:', error);
  }, [error]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-rose-200">
              De agenda kon niet geladen worden
            </h2>
            <p className="mt-1 text-sm text-rose-300/80">
              Dit gebeurt meestal omdat een achterliggende kennisbank-tabel
              (bijvoorbeeld <code className="rounded bg-black/30 px-1">knowledge_product_advice</code>{' '}
              of <code className="rounded bg-black/30 px-1">knowledge_disease_profile</code>)
              nog niet is gemigreerd in deze omgeving.
            </p>

            <div className="mt-4 rounded-lg border border-white/10 bg-black/30 p-3 text-[11px] font-mono text-white/70">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-white/40">
                Foutmelding
              </div>
              <div className="whitespace-pre-wrap break-words text-rose-300">
                {error.message || 'Onbekende fout'}
              </div>
              {error.digest && (
                <div className="mt-2 text-[10px] text-white/30">
                  digest: {error.digest}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => reset()}
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-300 hover:bg-emerald-500/20"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Opnieuw proberen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
