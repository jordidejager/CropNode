'use client';

/**
 * Encyclopedie — visueel overzicht van alle 49 kennisbank-onderwerpen.
 *
 * Gegroepeerd per categorie (Ziekten, Plagen, Teelt, Bemesting/Bodem)
 * met visuele kaarten, seizoensbalkjes, en CTGB-gevalideerde producten.
 */

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Bug, Leaf, Search, BookOpen, CloudRain, Sprout,
  ChevronRight, Sparkles, Apple, Shield, Swords,
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

function useAllProfiles() {
  return useQuery<DiseaseProfile[]>({
    queryKey: ['all-profiles-encyclopedia'],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('knowledge_disease_profile')
        .select('id, name, latin_name, profile_type, crops, description, peak_months, key_preventive_products, key_curative_products, source_article_count')
        .order('source_article_count', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as DiseaseProfile[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

const SECTIONS = [
  {
    key: 'ziekte',
    title: 'Ziekten',
    subtitle: 'Schimmels, bacteriën en virussen',
    icon: Leaf,
    color: 'text-rose-400',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/20',
    glow: 'hover:shadow-rose-500/10',
  },
  {
    key: 'plaag',
    title: 'Plagen',
    subtitle: 'Insecten, mijten en slakken',
    icon: Bug,
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20',
    glow: 'hover:shadow-orange-500/10',
  },
  {
    key: 'groeiregulatie',
    title: 'Teelttechniek',
    subtitle: 'Vruchtzetting, dunning, kwaliteit en bewaring',
    icon: Sprout,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    glow: 'hover:shadow-emerald-500/10',
  },
  {
    key: 'abiotisch',
    title: 'Bemesting & Bodem',
    subtitle: 'Nutriënten, bodemgezondheid, residu en onkruid',
    icon: CloudRain,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    glow: 'hover:shadow-blue-500/10',
  },
] as const;

const MONTH_LABELS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

export default function EncyclopediePage() {
  const [search, setSearch] = useState('');
  const { data: profiles = [], isLoading } = useAllProfiles();
  const { data: phenology } = useCurrentPhenology();
  const currentMonth = phenology?.month ?? new Date().getUTCMonth() + 1;

  const filtered = useMemo(() => {
    if (!search) return profiles;
    const q = search.toLowerCase();
    return profiles.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.latin_name ?? '').toLowerCase().includes(q),
    );
  }, [profiles, search]);

  const bySection = useMemo(() => {
    const map = new Map<string, DiseaseProfile[]>();
    for (const section of SECTIONS) map.set(section.key, []);
    for (const p of filtered) {
      const list = map.get(p.profile_type);
      if (list) list.push(p);
    }
    return map;
  }, [filtered]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/20">
            <BookOpen className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-light text-white">Encyclopedie</h1>
            <p className="text-sm text-white/40">
              {profiles.length} onderwerpen · Alles over ziekten, plagen en teelttechniek
            </p>
          </div>
        </div>
      </motion.div>

      {/* Search */}
      <div className="mb-8">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            placeholder="Zoek op naam of Latijnse naam..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2.5 pl-10 pr-4 text-sm text-white placeholder-white/30 focus:border-emerald-500/40 focus:outline-none"
          />
        </div>
      </div>

      {/* Sections */}
      {isLoading ? (
        <div className="space-y-12">
          {SECTIONS.map((s) => (
            <div key={s.key}>
              <div className="mb-4 h-8 w-48 animate-pulse rounded-lg bg-white/5" />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-40 animate-pulse rounded-xl border border-white/5 bg-white/[0.02]" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-12">
          {SECTIONS.map((section) => {
            const items = bySection.get(section.key) ?? [];
            if (items.length === 0 && search) return null;
            const SectionIcon = section.icon;
            return (
              <motion.section
                key={section.key}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
              >
                {/* Section header */}
                <div className="mb-4 flex items-center gap-3">
                  <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', section.bg)}>
                    <SectionIcon className={cn('h-4 w-4', section.color)} />
                  </div>
                  <div>
                    <h2 className={cn('text-lg font-semibold', section.color)}>
                      {section.title}
                    </h2>
                    <p className="text-xs text-white/30">{section.subtitle}</p>
                  </div>
                  <span className="ml-auto text-xs text-white/20">{items.length}</span>
                </div>

                {/* Cards grid */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((profile, i) => {
                    const slug = encodeURIComponent(
                      profile.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
                    );
                    const isNowActive = profile.peak_months.includes(currentMonth);
                    const topProducts = [
                      ...profile.key_preventive_products.slice(0, 2),
                      ...profile.key_curative_products.slice(0, 1),
                    ].slice(0, 3);

                    return (
                      <motion.div
                        key={profile.id}
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: Math.min(i * 0.03, 0.3) }}
                      >
                        <Link
                          href={`/kennisbank/encyclopedie/${slug}?id=${profile.id}`}
                          className={cn(
                            'group block rounded-xl border p-4 transition-all hover:border-white/20 hover:shadow-lg',
                            section.glow,
                            isNowActive
                              ? `${section.border} bg-gradient-to-br from-white/[0.03] to-transparent`
                              : 'border-white/[0.06] bg-white/[0.02]',
                          )}
                        >
                          {/* Top row */}
                          <div className="flex items-start justify-between">
                            <div className="min-w-0 flex-1">
                              <h3 className="text-sm font-semibold capitalize text-white group-hover:text-emerald-400 transition-colors">
                                {profile.name}
                              </h3>
                              {profile.latin_name && (
                                <p className="text-[11px] italic text-white/25">{profile.latin_name}</p>
                              )}
                            </div>
                            {isNowActive && (
                              <span className="ml-2 flex shrink-0 items-center gap-0.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-400">
                                <Sparkles className="h-2.5 w-2.5" /> NU
                              </span>
                            )}
                          </div>

                          {/* Description */}
                          {profile.description && (
                            <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-white/40">
                              {profile.description}
                            </p>
                          )}

                          {/* Products */}
                          {topProducts.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {topProducts.map((p, idx) => (
                                <span key={`${p}-${idx}`} className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-white/35">
                                  {p}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Bottom: month bar + metadata */}
                          <div className="mt-3 flex items-center justify-between">
                            <div className="flex gap-0.5">
                              {Array.from({ length: 12 }).map((_, m) => (
                                <div
                                  key={m}
                                  className={cn(
                                    'h-1.5 w-2 rounded-sm',
                                    profile.peak_months.includes(m + 1)
                                      ? m + 1 === currentMonth ? 'bg-emerald-400' : 'bg-white/20'
                                      : 'bg-white/[0.04]',
                                  )}
                                  title={MONTH_LABELS[m]}
                                />
                              ))}
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-white/25">
                              {profile.crops.slice(0, 2).map((c) => (
                                <span key={c}>{c === 'appel' ? '🍎' : c === 'peer' ? '🍐' : c}</span>
                              ))}
                              <span className="ml-1">{profile.source_article_count} art.</span>
                              <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </div>
                        </Link>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.section>
            );
          })}
        </div>
      )}
    </div>
  );
}
