'use client';

import { useEffect, useRef } from 'react';
import { CloudSun, Loader2, AlertTriangle } from 'lucide-react';
import { useWeatherInitialize } from '@/hooks/use-weather';

export function WeatherEmptyState() {
  const initMutation = useWeatherInitialize();
  const hasTriggered = useRef(false);

  // Auto-initialize on mount — no button click needed
  useEffect(() => {
    if (hasTriggered.current) return;
    if (initMutation.isPending || initMutation.isSuccess) return;
    hasTriggered.current = true;

    initMutation.mutate(undefined, {
      onSuccess: () => {
        // Reload so the dashboard picks up the new station
        setTimeout(() => window.location.reload(), 800);
      },
      onError: (error) => {
        console.error('[WeatherEmptyState] Auto-init failed:', error);
        hasTriggered.current = false; // allow retry
      },
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col items-center justify-center py-24 px-4">
      <div className="p-4 bg-white/5 rounded-2xl mb-6">
        <CloudSun className="h-12 w-12 text-white/20" />
      </div>

      {initMutation.isError ? (
        <div className="flex flex-col items-center gap-3 mt-4">
          <div className="flex items-center gap-2 text-red-400">
            <AlertTriangle className="h-4 w-4" />
            <p className="text-sm font-medium">
              {initMutation.error?.message ?? 'Initialisatie mislukt'}
            </p>
          </div>
          <button
            onClick={() => {
              hasTriggered.current = false;
              initMutation.mutate(undefined, {
                onSuccess: () => {
                  setTimeout(() => window.location.reload(), 800);
                },
              });
            }}
            className="px-4 py-2 rounded-xl bg-emerald-500/20 text-emerald-400 text-sm font-bold hover:bg-emerald-500/30 transition-colors"
          >
            Opnieuw proberen
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 mt-4">
          <Loader2 className="h-6 w-6 text-emerald-400 animate-spin" />
          <p className="text-white/50 text-sm text-center max-w-md">
            {initMutation.isSuccess
              ? 'Weerdata opgehaald! Dashboard wordt geladen...'
              : 'Weerstation wordt automatisch aangemaakt...'}
          </p>
          <p className="text-white/30 text-xs text-center max-w-sm">
            Forecast, multi-model en ensemble data worden opgehaald.
          </p>
        </div>
      )}
    </div>
  );
}
