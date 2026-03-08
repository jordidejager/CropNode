'use client';

import { RefreshCw, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface LastUpdatedProps {
  fetchedAt: string | null;
  onRefresh: () => void;
  isRefreshing: boolean;
}

/**
 * Shows when weather data was last updated + refresh button.
 * Shows a warning when data is stale (> 6 hours old).
 */
export function LastUpdated({ fetchedAt, onRefresh, isRefreshing }: LastUpdatedProps) {
  const isStale = fetchedAt
    ? Date.now() - new Date(fetchedAt).getTime() > 6 * 60 * 60 * 1000
    : false;

  const formattedTime = fetchedAt
    ? new Date(fetchedAt).toLocaleTimeString('nl-NL', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  const formattedDate = fetchedAt
    ? new Date(fetchedAt).toLocaleDateString('nl-NL', {
        day: 'numeric',
        month: 'short',
      })
    : null;

  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-2 text-xs text-white/30">
        <Clock className="h-3.5 w-3.5" />
        {fetchedAt ? (
          <span className={cn(isStale && 'text-amber-400/60')}>
            Bijgewerkt: {formattedDate} {formattedTime}
            {isStale && ' (verouderd)'}
          </span>
        ) : (
          <span>Laden...</span>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onRefresh}
        disabled={isRefreshing}
        className="h-8 px-3 text-xs text-white/40 hover:text-white hover:bg-white/5"
      >
        <RefreshCw
          className={cn('h-3.5 w-3.5 mr-1.5', isRefreshing && 'animate-spin')}
        />
        Vernieuwen
      </Button>
    </div>
  );
}
