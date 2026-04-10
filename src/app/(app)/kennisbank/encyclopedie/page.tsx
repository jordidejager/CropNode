'use client';

/**
 * Encyclopedie overzicht — alle echte ziekten & plagen als een Wikipedia-index.
 * Filtert teelttechniek/bemesting/bewaring eruit (die horen op /kennisbank/actueel).
 */

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Bug, Leaf, Search, BookOpen, CloudRain,
  ChevronRight, Sparkles, Calendar,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { getSupabase } from '@/lib/supabase';
import { useCurrentPhenology } from '@/hooks/use-knowledge';
import { cn } from '@/lib/utils';

interface DiseaseProfile {
  id: string;
  name: string;
  latin_name: string | null;
  profile_type: string;
  crops: string[];
  description: string | null;
  peak_months: number[];
  key_preventive_products: string[];
  key_curative_products: string[];
  source_article_count: number;
}

// Teelttechniek-keywords die NIET in de encyclopedie horen
const EXCLUDE_KEYWORDS = [
  'vruchtzetting', 'zetting', 'bladvoeding', 'stikstof', 'bemesting', 'dunning',
  'snoei', 'bewaring', 'smartfresh', 'koeling', 'rassenkeuze', 'onderstam',
  'beregening', 'calcium', 'kalium', 'magnesium', 'borium', 'mangaan',
  'groeiregulatie', 'vastzetten', 'vastspuiten', 'plak', 'onkruid',
  'stikstofbemesting', 'fertigatie', 'groeistof', 'ethrel', 'regalis',
  'ga4', 'ga3', 'ats', 'bestuiving', 'hagel', 'vorst', 'wind', 'droogte',
  'zonnebrand', 'residuwachttijd', 'insecticidenresidu', 'residubeheer',
  'driftreductie', 'fosfietresidu', 'residu', 'breedbladige',
  'calciumtoevoeging', 'insecten', 'schimmels',
];

function useDiseaseProfiles() {
  return useQuery<DiseaseProfile[]>({
    queryKey: ['disease-profiles-encyclopedia'],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('knowledge_disease_profile')
        .select('id, name, latin_name, profile_type, crops, description, peak_months, key_preventive_products, key_curative_products, source_article_count')
        .order('source_article_count', { ascending: false });
      if (error) throw new Error(error.message);
      // Filter uit teelttechniek
      return ((data ?? []) as unknown as DiseaseProfile[]).filter((p) => {
        const lower = p.name.toLowerCase();
        return !EXCLUDE_KEYWORDS.some((kw) => lower.includes(kw));
      });
    },
    staleTime: 5 * 60 * 1000,
  });
}

const TYPE_CONFIG: Record<string, { label: string; icon: typeof Bug; color: string; bg: string }> = {
  plaag: { label: 'Plaag', icon: Bug, color: 'text-orange-400', bg: 'bg-orange-500/10' },
  ziekte: { label: 'Ziekte', icon: Leaf, color: 'text-rose-400', bg: 'bg-rose-500/10' },
  abiotisch: { label: 'Abiotisch', icon: CloudRain, color: 'text-blue-400', bg: 'bg-blue-500/10' },
};

const MONTH_LABELS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

export default function EncyclopediePage() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const { data: profiles = [], isLoading } = useDiseaseProfiles();
  const { data: phenology } = useCurrentPhenology();
  const currentMonth = phenology?.month ?? new Date().getUTCMonth() + 1;

  const filtered = useMemo(() => {
    return profiles.filter((p) => {
      if (search) {
        const q = search.toLowerCase();
        if (!p.name.toLowerCase().includes(q) && !(p.latin_name ?? '').toLowerCase().includes(q)) return false;
      }
      if (typeFilter && p.profile_type !== typeFilter) return false;
      return true;
    });
  }, [profiles, search, typeFilter]);

  // Group by first letter for encyclopedia feel
  const grouped = useMemo(() => {
    const groups = new Map<string, DiseaseProfile[]>();
    for (const p of filtered) {
      const letter = p.name[0]?.toUpperCase() ?? '#';
      if (!groups.has(letter)) groups.set(letter, []);
      groups.get(letter)!.push(p);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20">
            <BookOpen className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-light text-white">Encyclopedie</h1>
            <p className="text-xs text-white/40">
              {profiles.length} ziekten & plagen · Klik voor volledig profiel
            </p>
          </div>
        </div>
      </motion.div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            placeholder="Zoek ziekte, plaag, of Latijnse naam..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2.5 pl-10 pr-4 text-sm text-white placeholder-white/30 focus:border-emerald-500/40 focus:outline-none"
          />
        </div>
        {Object.entries(TYPE_CONFIG).map(([type, cfg]) => {
          const Icon = cfg.icon;
          const isActive = typeFilter === type;
          const count = profiles.filter((p) => p.profile_type === type).length;
          return (
            <button
              key={type}
              type="button"
              onClick={() => setTypeFilter(isActive ? null : type)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all',
                isActive ? `${cfg.bg} ${cfg.color} border-current` : 'border-white/10 text-white/50 hover:text-white/70',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {cfg.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Alphabetical groups */}
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl border border-white/5 bg-white/[0.02]" />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(([letter, items]) => (
            <section key={letter}>
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-sm font-bold text-emerald-400">
                  {letter}
                </span>
                <div className="h-px flex-1 bg-white/[0.06]" />
              </div>
              <div className="grid gap-2">
                {items.map((profile) => (
                  <EncyclopediaRow key={profile.id} profile={profile} currentMonth={currentMonth} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function EncyclopediaRow({ profile, currentMonth }: { profile: DiseaseProfile; currentMonth: number }) {
  const cfg = TYPE_CONFIG[profile.profile_type] ?? TYPE_CONFIG.ziekte;
  const Icon = cfg.icon;
  const isActive = profile.peak_months.includes(currentMonth);
  const slug = encodeURIComponent(profile.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''));

  return (
    <Link
      href={`/kennisbank/encyclopedie/${slug}?id=${profile.id}`}
      className={cn(
        'group flex items-center gap-4 rounded-xl border p-3 transition-all hover:border-white/20',
        isActive ? 'border-amber-500/15 bg-amber-500/[0.02]' : 'border-white/[0.06] bg-white/[0.01]',
      )}
    >
      {/* Type icon */}
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', cfg.bg)}>
        <Icon className={cn('h-5 w-5', cfg.color)} />
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold capitalize text-white group-hover:text-emerald-400 transition-colors">
            {profile.name}
          </h3>
          {isActive && (
            <span className="flex items-center gap-0.5 rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-400">
              <Sparkles className="h-2.5 w-2.5" /> NU
            </span>
          )}
        </div>
        {profile.latin_name && (
          <p className="text-[11px] italic text-white/30">{profile.latin_name}</p>
        )}
        {profile.description && (
          <p className="mt-0.5 line-clamp-1 text-xs text-white/40">{profile.description}</p>
        )}
      </div>

      {/* Month bar (compact) */}
      <div className="hidden shrink-0 sm:flex">
        <div className="flex gap-px">
          {Array.from({ length: 12 }).map((_, m) => (
            <div
              key={m}
              className={cn(
                'h-6 w-1.5 rounded-sm',
                profile.peak_months.includes(m + 1)
                  ? m + 1 === currentMonth ? 'bg-emerald-400' : 'bg-white/20'
                  : 'bg-white/[0.04]',
              )}
              title={MONTH_LABELS[m]}
            />
          ))}
        </div>
      </div>

      {/* Crops + article count */}
      <div className="hidden shrink-0 text-right text-[10px] text-white/30 sm:block">
        <div>{profile.crops.join(', ')}</div>
        <div>{profile.source_article_count} art.</div>
      </div>

      <ChevronRight className="h-4 w-4 shrink-0 text-white/20 group-hover:text-emerald-400 transition-colors" />
    </Link>
  );
}
