'use client';

import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';

interface DataFreshnessBadgeProps {
  stationId: string | null;
  /** Optional callback to trigger manual refresh (e.g. from a parent Refresh button) */
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
}

interface FetchStatus {
  lastFetchedAt: string | null; // ISO
  ageMinutes: number | null;
  status: 'fresh' | 'ok' | 'stale' | 'unknown';
}

async function fetchFreshness(stationId: string): Promise<FetchStatus> {
  const res = await fetch(`/api/weather/freshness?stationId=${stationId}`);
  if (!res.ok) throw new Error('Freshness check failed');
  const json = await res.json();
  return json.data as FetchStatus;
}

function formatAge(minutes: number): string {
  if (minutes < 1) return 'zojuist';
  if (minutes < 60) return `${minutes}m geleden`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}u geleden`;
  const days = Math.floor(hours / 24);
  return `${days}d geleden`;
}

export function DataFreshnessBadge({
  stationId,
  onRefresh,
  refreshing,
}: DataFreshnessBadgeProps) {
  const { data, refetch } = useQuery({
    queryKey: ['weather', 'freshness', stationId],
    queryFn: () => fetchFreshness(stationId!),
    enabled: !!stationId,
    refetchInterval: 60 * 1000, // re-check every minute
    staleTime: 30 * 1000,
  });

  if (!stationId || !data || data.ageMinutes === null) {
    return null;
  }

  const { status, ageMinutes, lastFetchedAt } = data;

  const styles = {
    fresh: {
      container: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300',
      icon: CheckCircle2,
      label: 'Actueel',
    },
    ok: {
      container: 'bg-white/5 border-white/10 text-white/60',
      icon: CheckCircle2,
      label: 'Recent',
    },
    stale: {
      container: 'bg-amber-500/10 border-amber-500/25 text-amber-300',
      icon: AlertCircle,
      label: 'Verouderd',
    },
    unknown: {
      container: 'bg-white/5 border-white/10 text-white/60',
      icon: AlertCircle,
      label: 'Onbekend',
    },
  }[status];

  const Icon = styles.icon;

  const handleRefresh = async () => {
    if (onRefresh) await onRefresh();
    await refetch();
  };

  return (
    <button
      type="button"
      onClick={handleRefresh}
      disabled={refreshing}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-all',
        'hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed',
        styles.container
      )}
      title={lastFetchedAt ? `Laatste update: ${new Date(lastFetchedAt).toLocaleString('nl-NL')}` : undefined}
    >
      {refreshing ? (
        <RefreshCw className="h-3 w-3 animate-spin" />
      ) : (
        <Icon className="h-3 w-3" />
      )}
      <span className="font-medium">{styles.label}</span>
      <span className="opacity-70">·</span>
      <span className="tabular-nums opacity-80">{formatAge(ageMinutes)}</span>
    </button>
  );
}
