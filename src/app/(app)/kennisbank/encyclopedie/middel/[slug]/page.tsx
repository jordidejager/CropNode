'use client';

/**
 * Middel-encyclopedie detailpagina.
 *
 * Toont per gewasbeschermingsmiddel:
 *   - werkzame stof, type, resistentiegroep, aliassen
 *   - doelorganismen (primair) + nevenwerking (bonus)
 *   - optimale spuitomstandigheden (temp, RH, wind, deltaT, tijdstip)
 *   - watervolume + gevoeligheid + pH
 *   - tankmix-compat / -incompat met opmerkingen
 *   - strategie-samenvatting + toepassingsadvies + resistentiemanagement
 *   - veiligheid (VGT, max applicaties, bijenveiligheid, impact nuttige fauna)
 *   - alternatieven (klikbaar naar hun pagina)
 *   - foto-gallery (uit gelinkte WUR-artikelen)
 *
 * Data komt uit `knowledge_product_profile` (migratie 080).
 */

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowLeft, AlertTriangle, BookOpen, Check, CircleDashed, X,
  Droplets, Wind, Thermometer, Clock, Sparkles, FlaskConical, Sun,
  Shield, Bug, Beaker, Leaf,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { getSupabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

interface ProductProfile {
  id: string;
  product_name: string;
  active_substance: string | null;
  product_type: string | null;
  resistance_group: string | null;
  aliases: string[];
  crops: string[];
  target_organisms: string[];
  side_effects: string[];
  bbch_min: number | null;
  bbch_max: number | null;
  sensitive_varieties: string[];

  optimal_temp_min: number | null;
  optimal_temp_max: number | null;
  optimal_humidity_min: number | null;
  optimal_humidity_max: number | null;
  wind_speed_max_ms: number | null;
  delta_t_min: number | null;
  delta_t_max: number | null;
  preferred_time_of_day: string | null;
  rain_fastness_hours: number | null;

  water_volume_l_per_ha: number | null;
  water_volume_notes: string | null;
  water_sensitivity: string | null;
  ph_range: string | null;

  tank_mix_compatible: string[];
  tank_mix_incompatible: string[];
  tank_mix_notes: string | null;

  strategy_summary: string | null;
  application_advice: string | null;
  resistance_management: string | null;
  alternatives: string[];

  safety_interval_days: number | null;
  max_applications_per_year: number | null;
  beneficials_impact: string | null;
  bee_safety: string | null;

  image_urls: string[];
  source_article_count: number;
  confidence: string;
  notes: string | null;
}

function useProductProfile(id: string | null) {
  return useQuery<ProductProfile | null>({
    queryKey: ['product-profile', id],
    queryFn: async () => {
      if (!id) return null;
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('knowledge_product_profile')
        .select('*')
        .eq('id', id)
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as unknown as ProductProfile | null;
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

// Related articles by products_mentioned
function useArticlesForProduct(name: string | null) {
  return useQuery({
    queryKey: ['articles-for-product', name],
    queryFn: async () => {
      if (!name) return [];
      const supabase = getSupabase();
      const { data } = await supabase
        .from('knowledge_articles')
        .select('id, title, category, subcategory')
        .eq('status', 'published')
        .contains('products_mentioned', [name])
        .order('fusion_sources', { ascending: false })
        .limit(10);
      return (data ?? []) as Array<{ id: string; title: string; category: string; subcategory: string | null }>;
    },
    enabled: !!name,
    staleTime: 5 * 60 * 1000,
  });
}

// Alternative products lookup — convert names to ids
function useAlternativeIds(names: string[]) {
  return useQuery({
    queryKey: ['alt-ids', names.sort().join(',')],
    queryFn: async () => {
      if (names.length === 0) return {} as Record<string, string>;
      const supabase = getSupabase();
      const { data } = await supabase
        .from('knowledge_product_profile')
        .select('id, product_name')
        .in('product_name', names);
      const map: Record<string, string> = {};
      for (const row of (data ?? []) as Array<{ id: string; product_name: string }>) {
        map[row.product_name] = row.id;
      }
      return map;
    },
    enabled: names.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

// CTGB lookup (best effort)
function useCtgbStatus(productName: string | null) {
  return useQuery({
    queryKey: ['ctgb-product', productName],
    queryFn: async () => {
      if (!productName) return null;
      const supabase = getSupabase();
      const { data } = await supabase
        .from('ctgb_products')
        .select('toelatingsnummer, naam, status, vervaldatum')
        .ilike('naam', `%${productName}%`)
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!productName,
    staleTime: 30 * 60 * 1000,
  });
}

// ============================================
// Helpers
// ============================================

const TYPE_LABELS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  fungicide:     { label: 'Fungicide',     color: 'text-violet-300', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
  insecticide:   { label: 'Insecticide',   color: 'text-orange-300', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
  acaricide:     { label: 'Acaricide',     color: 'text-amber-300',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20' },
  herbicide:     { label: 'Herbicide',     color: 'text-lime-300',   bg: 'bg-lime-500/10',   border: 'border-lime-500/20' },
  groeiregulator: { label: 'Groeiregulator', color: 'text-cyan-300', bg: 'bg-cyan-500/10',   border: 'border-cyan-500/20' },
  bladmeststof:  { label: 'Bladmeststof',  color: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  bodemmeststof: { label: 'Bodemmeststof', color: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  bioagens:      { label: 'Bioagens',      color: 'text-green-300',  bg: 'bg-green-500/10',  border: 'border-green-500/20' },
  feromoon:      { label: 'Feromoon',      color: 'text-pink-300',   bg: 'bg-pink-500/10',   border: 'border-pink-500/20' },
  overig:        { label: 'Overig',        color: 'text-white/60',   bg: 'bg-white/[0.05]',  border: 'border-white/10' },
};

function rangeLabel(min: number | null, max: number | null, unit: string): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) return `${min}–${max} ${unit}`;
  if (min != null) return `≥ ${min} ${unit}`;
  return `≤ ${max} ${unit}`;
}

// ============================================
// Page
// ============================================

export default function MiddelDetailPage() {
  const searchParams = useSearchParams();
  const productId = searchParams.get('id');
  const { data: profile, isLoading } = useProductProfile(productId);
  const { data: articles = [] } = useArticlesForProduct(profile?.product_name ?? null);
  const { data: altIds = {} } = useAlternativeIds(profile?.alternatives ?? []);
  const { data: ctgb } = useCtgbStatus(profile?.product_name ?? null);

  const conditions = useMemo(() => {
    if (!profile) return [] as Array<{ icon: typeof Thermometer; label: string; value: string }>;
    const list: Array<{ icon: typeof Thermometer; label: string; value: string }> = [];
    const temp = rangeLabel(profile.optimal_temp_min, profile.optimal_temp_max, '°C');
    if (temp) list.push({ icon: Thermometer, label: 'Temperatuur', value: temp });
    const rh = rangeLabel(profile.optimal_humidity_min, profile.optimal_humidity_max, '%');
    if (rh) list.push({ icon: Droplets, label: 'Luchtvochtigheid', value: rh });
    if (profile.wind_speed_max_ms != null) {
      list.push({ icon: Wind, label: 'Wind', value: `≤ ${profile.wind_speed_max_ms} m/s` });
    }
    const dt = rangeLabel(profile.delta_t_min, profile.delta_t_max, '°C');
    if (dt) list.push({ icon: Beaker, label: 'Delta T', value: dt });
    if (profile.preferred_time_of_day) {
      list.push({ icon: Sun, label: 'Tijdstip', value: profile.preferred_time_of_day });
    }
    if (profile.rain_fastness_hours != null) {
      list.push({ icon: Clock, label: 'Regenvast na', value: `${profile.rain_fastness_hours}u` });
    }
    return list;
  }, [profile]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="h-64 animate-pulse rounded-2xl border border-white/5 bg-white/[0.02]" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12 text-center">
        <p className="text-white/50">Middel niet gevonden</p>
        <Link href="/kennisbank/encyclopedie" className="mt-4 inline-block text-emerald-400 hover:underline">
          ← Terug naar encyclopedie
        </Link>
      </div>
    );
  }

  const typeCfg = TYPE_LABELS[profile.product_type ?? 'overig'] ?? TYPE_LABELS.overig;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      {/* Back link */}
      <Link
        href="/kennisbank/encyclopedie"
        className="mb-6 inline-flex items-center gap-1 text-xs text-white/40 hover:text-emerald-400 transition-colors"
      >
        <ArrowLeft className="h-3 w-3" /> Encyclopedie
      </Link>

      {/* Hero */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-start gap-4">
          <div className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl', typeCfg.bg)}>
            <FlaskConical className={cn('h-7 w-7', typeCfg.color)} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', typeCfg.bg, typeCfg.color)}>
                {typeCfg.label}
              </span>
              {profile.resistance_group && (
                <span className="rounded-md bg-white/[0.04] px-2 py-0.5 text-[10px] font-mono text-white/60">
                  FRAC/IRAC {profile.resistance_group}
                </span>
              )}
              {ctgb?.status === 'toegelaten' && (
                <span className="flex items-center gap-0.5 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                  <Check className="h-3 w-3" /> CTGB toegelaten
                </span>
              )}
              {ctgb?.status === 'vervallen' && (
                <span className="flex items-center gap-0.5 rounded-md bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-400">
                  <X className="h-3 w-3" /> CTGB vervallen
                </span>
              )}
            </div>
            <h1 className="mt-1 text-3xl font-light text-white">{profile.product_name}</h1>
            {profile.active_substance && (
              <p className="mt-0.5 text-sm italic text-white/40">
                Werkzame stof: {profile.active_substance}
              </p>
            )}
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-white/30">
              {profile.crops.length > 0 && <span>{profile.crops.join(' + ')}</span>}
              {profile.crops.length > 0 && <span>·</span>}
              <span>{profile.source_article_count} bronartikelen</span>
              {profile.aliases.length > 0 && (
                <>
                  <span>·</span>
                  <span>Ook bekend als: {profile.aliases.join(', ')}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {profile.strategy_summary && (
          <p className="mt-5 text-base leading-relaxed text-white/80">
            {profile.strategy_summary}
          </p>
        )}
      </motion.div>

      {/* Image gallery (WUR + GKN) */}
      {profile.image_urls.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="mb-8">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/30">
            Afbeeldingen
          </p>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {profile.image_urls.slice(0, 12).map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 overflow-hidden rounded-lg border border-white/10 hover:border-emerald-500/30 transition-colors"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`${profile.product_name} ${i + 1}`}
                  className="h-32 w-44 object-cover"
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        </motion.div>
      )}

      {/* Optimale spuitomstandigheden */}
      {conditions.length > 0 && (
        <Section icon={Thermometer} title="Optimale spuitomstandigheden">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {conditions.map(({ icon: Icon, label, value }) => (
              <div
                key={label}
                className="rounded-xl border border-white/10 bg-white/[0.02] p-3"
              >
                <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/40">
                  <Icon className="h-3 w-3" /> {label}
                </div>
                <div className="text-sm font-medium text-white">{value}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Water + applicatie */}
      {(profile.water_volume_l_per_ha != null ||
        profile.water_sensitivity ||
        profile.water_volume_notes ||
        profile.ph_range) && (
        <Section icon={Droplets} title="Water en spuittank">
          <ul className="space-y-1.5 text-sm text-white/80">
            {profile.water_volume_l_per_ha != null && (
              <li><strong className="text-white">Watervolume:</strong> {profile.water_volume_l_per_ha} L/ha</li>
            )}
            {profile.water_volume_notes && (
              <li><strong className="text-white">Opmerking:</strong> {profile.water_volume_notes}</li>
            )}
            {profile.water_sensitivity && (
              <li><strong className="text-white">Watergevoeligheid:</strong> {profile.water_sensitivity}</li>
            )}
            {profile.ph_range && (
              <li><strong className="text-white">pH:</strong> {profile.ph_range}</li>
            )}
          </ul>
        </Section>
      )}

      {/* Doelorganismen + nevenwerking */}
      {(profile.target_organisms.length > 0 || profile.side_effects.length > 0) && (
        <Section icon={Bug} title="Werkingsspectrum">
          {profile.target_organisms.length > 0 && (
            <div className="mb-3">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-white/40">Primair doel</div>
              <div className="flex flex-wrap gap-1.5">
                {profile.target_organisms.map((t) => (
                  <span key={t} className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
          {profile.side_effects.length > 0 && (
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-white/40">Nevenwerking</div>
              <div className="flex flex-wrap gap-1.5">
                {profile.side_effects.map((t) => (
                  <span key={t} className="rounded-md border border-white/10 bg-white/[0.02] px-2 py-0.5 text-xs text-white/60">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* Tankmix */}
      {(profile.tank_mix_compatible.length > 0 ||
        profile.tank_mix_incompatible.length > 0 ||
        profile.tank_mix_notes) && (
        <Section icon={Beaker} title="Tankmix">
          {profile.tank_mix_compatible.length > 0 && (
            <div className="mb-3">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-emerald-400">✓ Wel combineren</div>
              <div className="flex flex-wrap gap-1.5">
                {profile.tank_mix_compatible.map((p) => (
                  <span key={p} className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}
          {profile.tank_mix_incompatible.length > 0 && (
            <div className="mb-3">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-rose-400">✗ Niet combineren</div>
              <div className="flex flex-wrap gap-1.5">
                {profile.tank_mix_incompatible.map((p) => (
                  <span key={p} className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-xs text-rose-300">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}
          {profile.tank_mix_notes && (
            <p className="text-xs text-white/60">{profile.tank_mix_notes}</p>
          )}
        </Section>
      )}

      {/* Toepassingsadvies */}
      {profile.application_advice && (
        <Section icon={Sparkles} title="Toepassingsadvies">
          <p className="whitespace-pre-line text-sm leading-relaxed text-white/80">
            {profile.application_advice}
          </p>
        </Section>
      )}

      {/* Resistentiemanagement */}
      {profile.resistance_management && (
        <Section icon={Shield} title="Resistentiemanagement">
          <p className="whitespace-pre-line text-sm leading-relaxed text-white/80">
            {profile.resistance_management}
          </p>
        </Section>
      )}

      {/* Veiligheid */}
      {(profile.safety_interval_days != null ||
        profile.max_applications_per_year != null ||
        profile.beneficials_impact ||
        profile.bee_safety ||
        profile.sensitive_varieties.length > 0) && (
        <Section icon={AlertTriangle} title="Veiligheid en restricties">
          <ul className="space-y-1.5 text-sm text-white/80">
            {profile.safety_interval_days != null && (
              <li><strong className="text-white">VGT:</strong> {profile.safety_interval_days} dagen</li>
            )}
            {profile.max_applications_per_year != null && (
              <li><strong className="text-white">Max per seizoen:</strong> {profile.max_applications_per_year}×</li>
            )}
            {(profile.bbch_min != null || profile.bbch_max != null) && (
              <li>
                <strong className="text-white">BBCH-range:</strong>{' '}
                {profile.bbch_min ?? '—'}–{profile.bbch_max ?? '—'}
              </li>
            )}
            {profile.bee_safety && (
              <li><strong className="text-white">Bijenveiligheid:</strong> {profile.bee_safety}</li>
            )}
            {profile.beneficials_impact && (
              <li><strong className="text-white">Effect op nuttige fauna:</strong> {profile.beneficials_impact}</li>
            )}
            {profile.sensitive_varieties.length > 0 && (
              <li><strong className="text-white">Gevoelige rassen:</strong> {profile.sensitive_varieties.join(', ')}</li>
            )}
          </ul>
        </Section>
      )}

      {/* Alternatieven */}
      {profile.alternatives.length > 0 && (
        <Section icon={Leaf} title="Alternatieven">
          <div className="flex flex-wrap gap-1.5">
            {profile.alternatives.map((name) => {
              const altId = altIds[name];
              if (altId) {
                return (
                  <Link
                    key={name}
                    href={`/kennisbank/encyclopedie/middel/x?id=${altId}`}
                    className="rounded-md border border-emerald-500/30 bg-emerald-500/[0.06] px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-500/[0.12] transition-colors"
                  >
                    {name}
                  </Link>
                );
              }
              return (
                <span key={name} className="rounded-md border border-white/10 bg-white/[0.02] px-2 py-1 text-xs text-white/50">
                  {name}
                </span>
              );
            })}
          </div>
        </Section>
      )}

      {/* Related articles */}
      {articles.length > 0 && (
        <Section icon={BookOpen} title="Bronartikelen">
          <ul className="space-y-1.5">
            {articles.map((a) => (
              <li key={a.id}>
                <span className="text-[9px] font-semibold uppercase tracking-wider text-emerald-400/70 mr-1.5">
                  {a.category}{a.subcategory ? ` · ${a.subcategory}` : ''}
                </span>
                <span className="text-sm text-white/70">{a.title}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Confidence + notes */}
      {(profile.confidence !== 'hoog' || profile.notes) && (
        <div className="mt-8 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4 text-xs text-amber-200/80">
          {profile.confidence !== 'hoog' && (
            <div className="mb-1 flex items-center gap-1.5">
              <CircleDashed className="h-3 w-3" />
              <span>
                Confidence: <strong>{profile.confidence}</strong> — bevestig altijd via het CTGB-etiket
                of een adviseur.
              </span>
            </div>
          )}
          {profile.notes && <p className="text-white/60">{profile.notes}</p>}
        </div>
      )}
    </div>
  );
}

// ============================================
// Section wrapper
// ============================================

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="mb-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5"
    >
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
        <Icon className="h-4 w-4 text-emerald-400" />
        {title}
      </div>
      {children}
    </motion.section>
  );
}
