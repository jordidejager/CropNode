'use client';

/**
 * Agenda — actiepunten voor de teler
 *
 * Aggregeert dingen die "volgens FruitConsult" (en andere bronnen in de
 * kennisbank) deze week moeten gebeuren of binnenkort gaan spelen.
 *
 * Drie buckets:
 *   - NU URGENT — piekperiode voor ziekte/plaag, of advies in deze maand+fase
 *   - DEZE WEEK — overlap met huidige maand of fase
 *   - VOORBEREIDEN — komende maand/fase
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CalendarDays,
  Bug,
  Sprout,
  FlaskConical,
  Newspaper,
  Filter,
  Sparkles,
  RefreshCw,
  ChevronRight,
  Apple as AppleIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';

// ============================================
// Types (mirror /api/knowledge/action-items)
// ============================================

type Urgency = 'nu' | 'deze_week' | 'voorbereiden';

interface ActionItem {
  id: string;
  type: 'ziekte' | 'plaag' | 'product_advies' | 'artikel';
  urgency: Urgency;
  title: string;
  subtitle: string;
  detail: string;
  crops: string[];
  phases: string[];
  months: number[];
  category: string;
  article_id?: string | null;
  dosage?: string | null;
  ask_chatbot?: string | null;
  sort_score: number;
}

interface ApiResponse {
  generated_at: string;
  phenology: {
    month: number;
    phase: string;
    phase_detail: string;
    next_month: number;
    next_phase: string;
  };
  crop: string | null;
  totals: {
    nu: number;
    deze_week: number;
    voorbereiden: number;
    total: number;
  };
  items: {
    nu: ActionItem[];
    deze_week: ActionItem[];
    voorbereiden: ActionItem[];
  };
}

// ============================================
// Constants
// ============================================

const MONTH_LABELS = [
  'januari',
  'februari',
  'maart',
  'april',
  'mei',
  'juni',
  'juli',
  'augustus',
  'september',
  'oktober',
  'november',
  'december',
];

const URGENCY_META: Record<
  Urgency,
  { label: string; icon: typeof AlertTriangle; color: string; ring: string }
> = {
  nu: {
    label: 'Nu urgent',
    icon: AlertTriangle,
    color: 'text-rose-300',
    ring: 'border-rose-500/30 bg-rose-500/[0.04]',
  },
  deze_week: {
    label: 'Deze week',
    icon: CalendarDays,
    color: 'text-amber-300',
    ring: 'border-amber-500/30 bg-amber-500/[0.04]',
  },
  voorbereiden: {
    label: 'Voorbereiden',
    icon: Sprout,
    color: 'text-emerald-300',
    ring: 'border-emerald-500/30 bg-emerald-500/[0.04]',
  },
};

const TYPE_META: Record<
  ActionItem['type'],
  { icon: typeof Bug; tint: string }
> = {
  ziekte: { icon: Sprout, tint: 'text-violet-300' },
  plaag: { icon: Bug, tint: 'text-orange-300' },
  product_advies: { icon: FlaskConical, tint: 'text-emerald-300' },
  artikel: { icon: Newspaper, tint: 'text-sky-300' },
};

// ============================================
// Page
// ============================================

export default function AgendaPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cropFilter, setCropFilter] = useState<'alle' | 'appel' | 'peer'>('alle');
  const [typeFilter, setTypeFilter] = useState<Set<ActionItem['type']>>(
    new Set(['ziekte', 'plaag', 'product_advies', 'artikel']),
  );

  // Fetch on mount + when crop changes
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    const url = cropFilter === 'alle'
      ? '/api/knowledge/action-items'
      : `/api/knowledge/action-items?crop=${cropFilter}`;
    fetch(url, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: ApiResponse) => setData(d))
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [cropFilter]);

  const filteredItems = useMemo(() => {
    if (!data) return null;
    const filter = (arr: ActionItem[]) => arr.filter((i) => typeFilter.has(i.type));
    return {
      nu: filter(data.items.nu),
      deze_week: filter(data.items.deze_week),
      voorbereiden: filter(data.items.voorbereiden),
    };
  }, [data, typeFilter]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-light tracking-tight text-white sm:text-3xl">
              Agenda
            </h1>
            <p className="mt-1 text-sm text-white/60">
              Wat speelt er deze week en wat komt eraan, op basis van de kennisbank.
            </p>
          </div>
          {data?.phenology && (
            <div className="hidden rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-right text-xs text-white/70 sm:block">
              <div className="text-[10px] uppercase tracking-wider text-white/40">
                Huidige fase
              </div>
              <div className="font-medium text-white">
                {prettyPhase(data.phenology.phase_detail)}
              </div>
              <div className="text-[10px] text-white/40">
                {MONTH_LABELS[data.phenology.month - 1]}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-white/40">
            <Filter className="inline h-3.5 w-3.5 align-text-bottom" /> Gewas:
          </span>
          {(['alle', 'appel', 'peer'] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCropFilter(c)}
              className={cn(
                'rounded-full border px-3 py-1 transition-colors',
                cropFilter === c
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : 'border-white/10 bg-white/[0.03] text-white/60 hover:border-white/20 hover:text-white/80',
              )}
            >
              {c === 'alle' ? 'Alle' : c === 'appel' ? '🍎 Appel' : '🍐 Peer'}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-white/40">Type:</span>
          {(['ziekte', 'plaag', 'product_advies', 'artikel'] as const).map((t) => {
            const meta = TYPE_META[t];
            const Icon = meta.icon;
            const active = typeFilter.has(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTypeFilter((prev) => {
                    const next = new Set(prev);
                    if (next.has(t)) next.delete(t);
                    else next.add(t);
                    return next;
                  });
                }}
                className={cn(
                  'flex items-center gap-1 rounded-md border px-2 py-1 transition-colors',
                  active
                    ? `border-white/20 bg-white/[0.04] ${meta.tint}`
                    : 'border-white/[0.06] bg-white/[0.01] text-white/30 hover:text-white/60',
                )}
              >
                <Icon className="h-3 w-3" />
                {labelForType(t)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-white/50">
          <RefreshCw className="h-4 w-4 animate-spin text-emerald-400" />
          Actiepunten verzamelen uit kennisbank...
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          Kon agenda niet laden: {error}
        </div>
      )}

      {/* Content */}
      {filteredItems && !loading && !error && (
        <div className="space-y-8">
          {(['nu', 'deze_week', 'voorbereiden'] as const).map((bucket) => {
            const items = filteredItems[bucket];
            const meta = URGENCY_META[bucket];
            const Icon = meta.icon;
            if (items.length === 0) {
              return (
                <section key={bucket}>
                  <SectionHeader
                    label={meta.label}
                    count={0}
                    icon={Icon}
                    color={meta.color}
                  />
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.01] p-6 text-center text-xs text-white/30">
                    Geen items in deze categorie voor dit gewas + filter.
                  </div>
                </section>
              );
            }
            return (
              <section key={bucket}>
                <SectionHeader
                  label={meta.label}
                  count={items.length}
                  icon={Icon}
                  color={meta.color}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  {items.map((item) => (
                    <ActionCard key={item.id} item={item} ring={meta.ring} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Footer note */}
      {data && (
        <p className="mt-12 text-center text-[10px] text-white/20">
          Gegenereerd om {new Date(data.generated_at).toLocaleString('nl-NL')} op basis
          van {data.totals.total} relevante items.
        </p>
      )}
    </div>
  );
}

// ============================================
// Subcomponents
// ============================================

function SectionHeader({
  label,
  count,
  icon: Icon,
  color,
}: {
  label: string;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon className={cn('h-4 w-4', color)} />
      <h2 className={cn('text-sm font-semibold uppercase tracking-wider', color)}>
        {label}
      </h2>
      <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/40">
        {count}
      </span>
    </div>
  );
}

function ActionCard({ item, ring }: { item: ActionItem; ring: string }) {
  const meta = TYPE_META[item.type];
  const Icon = meta.icon;
  const chatHref = item.ask_chatbot
    ? `/kennisbank?ask=${encodeURIComponent(item.ask_chatbot)}`
    : null;

  return (
    <div className={cn('relative rounded-2xl border p-4', ring)}>
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04]',
            meta.tint,
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold leading-tight text-white">
              {item.title}
            </h3>
            <span className="shrink-0 text-[9px] uppercase tracking-wider text-white/30">
              {labelForType(item.type)}
            </span>
          </div>
          {item.subtitle && (
            <p className="mt-1 text-xs leading-relaxed text-white/70">
              {item.subtitle}
            </p>
          )}

          {/* Meta footer */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px] text-white/40">
            {item.crops.length > 0 && (
              <span className="flex items-center gap-1 rounded-full border border-white/[0.06] bg-white/[0.02] px-2 py-0.5">
                <AppleIcon className="h-2.5 w-2.5" />
                {item.crops.join(' + ')}
              </span>
            )}
            {item.phases.slice(0, 2).map((p) => (
              <span
                key={p}
                className="rounded-full border border-white/[0.06] bg-white/[0.02] px-2 py-0.5"
              >
                {prettyPhase(p)}
              </span>
            ))}
            {item.months.length > 0 && (
              <span className="rounded-full border border-white/[0.06] bg-white/[0.02] px-2 py-0.5">
                {formatMonths(item.months)}
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="mt-3 flex items-center gap-3 text-[11px]">
            {chatHref && (
              <Link
                href={chatHref}
                className="flex items-center gap-1 text-emerald-300 hover:text-emerald-200"
              >
                <Sparkles className="h-3 w-3" />
                Vraag chatbot
                <ChevronRight className="h-3 w-3" />
              </Link>
            )}
            {item.article_id && (
              <Link
                href={`/kennisbank/artikelen/${item.article_id}`}
                className="flex items-center gap-1 text-white/50 hover:text-white/80"
              >
                <Newspaper className="h-3 w-3" />
                Open artikel
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Helpers
// ============================================

function labelForType(t: ActionItem['type']): string {
  switch (t) {
    case 'ziekte':
      return 'Ziekte';
    case 'plaag':
      return 'Plaag';
    case 'product_advies':
      return 'Middel';
    case 'artikel':
      return 'Artikel';
  }
}

function prettyPhase(s: string): string {
  return s.replace(/-/g, ' ').replace(/\//g, ' / ');
}

function formatMonths(months: number[]): string {
  if (months.length === 0) return '';
  const sorted = [...months].sort((a, b) => a - b);
  const labels = sorted.map((m) => MONTH_LABELS[m - 1].slice(0, 3));
  if (labels.length <= 2) return labels.join(', ');
  // Detect contiguous range
  const isContiguous = sorted.every((m, i) => i === 0 || m === sorted[i - 1] + 1);
  if (isContiguous) {
    return `${labels[0]} – ${labels[labels.length - 1]}`;
  }
  return labels.slice(0, 3).join(', ') + (labels.length > 3 ? '…' : '');
}
