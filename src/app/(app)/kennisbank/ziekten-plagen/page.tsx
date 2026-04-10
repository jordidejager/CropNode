'use client';

/**
 * Ziekten & Plagen overzichtspagina — vervangt de oude mockPests.
 *
 * Haalt data uit knowledge_disease_profile (230 profielen) en toont:
 * - Seizoens-dashboard: huidige fase + meest urgente ziekten/plagen NU
 * - Filterable grid met alle ziekten/plagen
 * - Maandactiviteits-balk per ziekte/plaag
 */

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bug,
  Leaf,
  Search,
  Snowflake,
  Sun,
  Sprout,
  Flower2,
  Apple,
  CloudRain,
  AlertTriangle,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { getSupabase } from '@/lib/supabase';
import { useCurrentPhenology } from '@/hooks/use-knowledge';
import { cn } from '@/lib/utils';

// ============================================
// Types
// ============================================

interface DiseaseProfile {
  id: string;
  name: string;
  latin_name: string | null;
  profile_type: string;
  crops: string[];
  description: string | null;
  symptoms: string | null;
  lifecycle_notes: string | null;
  peak_phases: string[];
  peak_months: number[];
  key_preventive_products: string[];
  key_curative_products: string[];
  susceptible_varieties: string[];
  source_article_count: number;
}

// ============================================
// Data fetching
// ============================================

function useDiseaseProfiles() {
  return useQuery<DiseaseProfile[]>({
    queryKey: ['disease-profiles'],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('knowledge_disease_profile')
        .select('*')
        .order('source_article_count', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as DiseaseProfile[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ============================================
// Constants
// ============================================

const TYPE_CONFIG: Record<string, { label: string; icon: typeof Bug; color: string; bg: string }> = {
  plaag: { label: 'Plaag', icon: Bug, color: 'text-orange-400', bg: 'bg-orange-500/10' },
  ziekte: { label: 'Ziekte', icon: Leaf, color: 'text-rose-400', bg: 'bg-rose-500/10' },
  abiotisch: { label: 'Abiotisch', icon: CloudRain, color: 'text-blue-400', bg: 'bg-blue-500/10' },
};

const PHASE_ICONS: Record<string, typeof Sun> = {
  rust: Snowflake,
  knopstadium: Sprout,
  bloei: Flower2,
  vruchtzetting: Apple,
  groei: Sun,
  oogst: Apple,
  nabloei: Leaf,
};

const MONTH_LABELS = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];

// ============================================
// Main page
// ============================================

export default function ZiektenPlagenPage() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [cropFilter, setCropFilter] = useState<string | null>(null);

  const { data: profiles = [], isLoading } = useDiseaseProfiles();
  const { data: phenology } = useCurrentPhenology();

  const currentMonth = phenology?.month ?? new Date().getUTCMonth() + 1;
  const currentPhase = phenology?.phenologicalPhase ?? 'onbekend';

  // Filter profiles
  const filtered = useMemo(() => {
    return profiles.filter((p) => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase()) &&
          !(p.latin_name ?? '').toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      if (typeFilter && p.profile_type !== typeFilter) return false;
      if (cropFilter && !p.crops.includes(cropFilter)) return false;
      return true;
    });
  }, [profiles, search, typeFilter, cropFilter]);

  // Split into "now relevant" and "rest"
  const nowRelevant = useMemo(() =>
    filtered
      .filter((p) => p.peak_months.includes(currentMonth))
      .sort((a, b) => b.source_article_count - a.source_article_count)
      .slice(0, 12),
    [filtered, currentMonth],
  );

  const rest = useMemo(() =>
    filtered.filter((p) => !nowRelevant.some((n) => n.id === p.id)),
    [filtered, nowRelevant],
  );

  const PhaseIcon = PHASE_ICONS[phenology?.seasonPhase ?? 'bloei'] ?? Sun;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {/* Season header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 rounded-2xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-xl"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20">
            <PhaseIcon className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              {currentPhase.replace(/-/g, ' ').replace(/\//g, ' / ')} · {MONTH_LABELS[currentMonth - 1]}
            </p>
            <h1 className="text-2xl font-light text-white">Ziekten & Plagen</h1>
          </div>
        </div>
        <p className="mt-2 text-sm text-white/50">
          {profiles.length} ziekten en plagen in de kennisbank · {nowRelevant.length} relevant in deze periode
        </p>
      </motion.div>

      {/* Now relevant section */}
      {nowRelevant.length > 0 && (
        <section className="mb-12">
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-400/80">
              Nu relevant ({MONTH_LABELS[currentMonth - 1]})
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence>
              {nowRelevant.map((profile, i) => (
                <DiseaseCard key={profile.id} profile={profile} index={i} currentMonth={currentMonth} highlight />
              ))}
            </AnimatePresence>
          </div>
        </section>
      )}

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            placeholder="Zoek ziekte of plaag..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2.5 pl-10 pr-4 text-sm text-white placeholder-white/30 focus:border-emerald-500/40 focus:outline-none"
          />
        </div>
        {(['ziekte', 'plaag', 'abiotisch'] as const).map((type) => {
          const cfg = TYPE_CONFIG[type];
          const Icon = cfg.icon;
          const isActive = typeFilter === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => setTypeFilter(isActive ? null : type)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all',
                isActive
                  ? `${cfg.bg} ${cfg.color} border-current`
                  : 'border-white/10 text-white/50 hover:border-white/20 hover:text-white/70',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {cfg.label}
            </button>
          );
        })}
        {(['appel', 'peer'] as const).map((crop) => {
          const isActive = cropFilter === crop;
          return (
            <button
              key={crop}
              type="button"
              onClick={() => setCropFilter(isActive ? null : crop)}
              className={cn(
                'rounded-lg border px-3 py-2 text-xs font-medium transition-all',
                isActive
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                  : 'border-white/10 text-white/50 hover:border-white/20 hover:text-white/70',
              )}
            >
              {crop === 'appel' ? '🍎 Appel' : '🍐 Peer'}
            </button>
          );
        })}
      </div>

      {/* All diseases/pests grid */}
      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/40">
          {search || typeFilter || cropFilter ? `Gefilterd (${rest.length})` : `Alle ziekten & plagen (${rest.length})`}
        </h2>
        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="h-36 animate-pulse rounded-xl border border-white/5 bg-white/[0.02]" />
            ))}
          </div>
        ) : rest.length === 0 ? (
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-8 text-center text-sm text-white/40">
            Geen resultaten gevonden voor deze filters
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((profile, i) => (
              <DiseaseCard key={profile.id} profile={profile} index={i} currentMonth={currentMonth} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ============================================
// Disease card
// ============================================

function DiseaseCard({
  profile,
  index,
  currentMonth,
  highlight,
}: {
  profile: DiseaseProfile;
  index: number;
  currentMonth: number;
  highlight?: boolean;
}) {
  const cfg = TYPE_CONFIG[profile.profile_type] ?? TYPE_CONFIG.ziekte;
  const Icon = cfg.icon;
  const isNowActive = profile.peak_months.includes(currentMonth);

  // Top products (max 3)
  const topProducts = [
    ...profile.key_preventive_products.slice(0, 2),
    ...profile.key_curative_products.slice(0, 1),
  ].filter(Boolean).slice(0, 3);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.02, 0.5), duration: 0.3 }}
      className={cn(
        'group relative rounded-xl border p-4 transition-all cursor-pointer hover:border-white/20',
        highlight
          ? 'border-amber-500/20 bg-amber-500/[0.03]'
          : 'border-white/[0.06] bg-white/[0.02]',
      )}
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className={cn('flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', cfg.bg, cfg.color)}>
          <Icon className="h-3 w-3" />
          {cfg.label}
        </div>
        {isNowActive && (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-400">
            <Sparkles className="h-3 w-3" />
            NU ACTIEF
          </span>
        )}
      </div>

      {/* Name */}
      <h3 className="mt-2 text-sm font-semibold capitalize text-white group-hover:text-emerald-400 transition-colors">
        {profile.name}
      </h3>
      {profile.latin_name && (
        <p className="text-[11px] italic text-white/30">{profile.latin_name}</p>
      )}

      {/* Description */}
      {profile.description && (
        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-white/50">
          {profile.description}
        </p>
      )}

      {/* Products */}
      {topProducts.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {topProducts.map((p, i) => (
            <span key={`${p}-${i}`} className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-white/40">
              {p}
            </span>
          ))}
        </div>
      )}

      {/* Bottom row */}
      <div className="mt-3 flex items-center justify-between text-[10px] text-white/30">
        <div className="flex gap-1.5">
          {profile.crops.slice(0, 3).map((crop) => (
            <span key={crop} className="rounded bg-white/5 px-1.5 py-0.5">
              {crop}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span>{profile.source_article_count} artikelen</span>
          <ChevronRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      </div>

      {/* Month activity bar */}
      <div className="mt-2 flex gap-0.5">
        {Array.from({ length: 12 }).map((_, m) => (
          <div
            key={m}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors',
              profile.peak_months.includes(m + 1)
                ? m + 1 === currentMonth
                  ? 'bg-emerald-400'
                  : 'bg-white/20'
                : 'bg-white/[0.04]',
            )}
            title={MONTH_LABELS[m]}
          />
        ))}
      </div>
    </motion.div>
  );
}
