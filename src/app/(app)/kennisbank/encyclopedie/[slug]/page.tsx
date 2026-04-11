'use client';

/**
 * Encyclopedie detailpagina — volledig profiel van een ziekte of plaag.
 *
 * Toont: beschrijving, levenscyclus, symptomen, afbeeldingen,
 * seizoenskalender, middelen (preventief + curatief), gevoelige rassen,
 * en gerelateerde kennisartikelen.
 */

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Bug, Leaf, CloudRain, Calendar, Shield, Swords,
  Eye, Microscope, Sprout, BookOpen, AlertTriangle, Sparkles,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { getSupabase } from '@/lib/supabase';
import { useCurrentPhenology, useArticles } from '@/hooks/use-knowledge';
import { cn } from '@/lib/utils';
import { Check, X, CircleDashed } from 'lucide-react';

interface FullDiseaseProfile {
  id: string;
  name: string;
  latin_name: string | null;
  profile_type: string;
  crops: string[];
  description: string | null;
  symptoms: string | null;
  lifecycle_notes: string | null;
  damage_impact: string | null;
  prevention_strategy: string | null;
  curative_strategy: string | null;
  biological_options: string | null;
  resistance_management: string | null;
  monitoring_advice: string | null;
  peak_phases: string[];
  peak_months: number[];
  key_preventive_products: string[];
  key_curative_products: string[];
  susceptible_varieties: string[];
  resistant_varieties: string[];
  source_article_count: number;
}

function useProfile(id: string | null) {
  return useQuery<FullDiseaseProfile | null>({
    queryKey: ['disease-profile-detail', id],
    queryFn: async () => {
      if (!id) return null;
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('knowledge_disease_profile')
        .select('*')
        .eq('id', id)
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as unknown as FullDiseaseProfile | null;
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

// Fetch related articles (by subcategory match)
function useRelatedArticles(name: string | null) {
  return useQuery({
    queryKey: ['related-articles', name],
    queryFn: async () => {
      if (!name) return [];
      const supabase = getSupabase();
      const { data } = await supabase
        .from('knowledge_articles')
        .select('id, title, category, subcategory, image_urls')
        .eq('status', 'published')
        .ilike('subcategory', `%${name}%`)
        .order('fusion_sources', { ascending: false })
        .limit(8);
      return (data ?? []) as Array<{ id: string; title: string; category: string; subcategory: string | null; image_urls: string[] }>;
    },
    enabled: !!name,
    staleTime: 5 * 60 * 1000,
  });
}

// Fetch structured product advice for this disease/topic
interface ProductAdviceRow {
  product_name: string;
  active_substance: string | null;
  crop: string;
  dosage: string | null;
  application_type: string | null;
  timing: string | null;
  curative_window_hours: number | null;
  safety_interval_days: number | null;
  max_applications_per_year: number | null;
  notes: string | null;
  country_restrictions: string | null;
  resistance_group: string | null;
}

function useProductAdvice(targetName: string | null) {
  return useQuery<ProductAdviceRow[]>({
    queryKey: ['product-advice-detail', targetName],
    queryFn: async () => {
      if (!targetName) return [];
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('knowledge_product_advice')
        .select('product_name, active_substance, crop, dosage, application_type, timing, curative_window_hours, safety_interval_days, max_applications_per_year, notes, country_restrictions, resistance_group')
        .ilike('target_name', `%${targetName}%`)
        .order('source_article_count', { ascending: false })
        .limit(30);
      if (error) return [];
      return (data ?? []) as unknown as ProductAdviceRow[];
    },
    enabled: !!targetName,
    staleTime: 5 * 60 * 1000,
  });
}

// ============================================
// CTGB status lookup for products
// ============================================

// Known historically withdrawn products
const WITHDRAWN_PRODUCTS: Record<string, string> = {
  'topsin m': 'Vervallen okt 2020',
  'topsin': 'Vervallen okt 2020',
  'mancozeb': 'Vervallen jan 2021',
  'dithane': 'Vervallen (mancozeb)',
  'tridex': 'Vervallen (mancozeb)',
  'pirimor': 'Beperkt beschikbaar',
  'vertimec pro': 'Niet meer toegelaten',
  'vertimec': 'Niet meer toegelaten',
  'movento': 'Niet meer toegelaten NL',
  'movento od': 'Niet meer toegelaten NL',
  'movento 150 od': 'Niet meer toegelaten NL',
  'batavia': 'Niet meer toegelaten NL',
};

function useCtgbStatus(productNames: string[]) {
  return useQuery({
    queryKey: ['ctgb-status', productNames.join(',')],
    queryFn: async () => {
      if (productNames.length === 0) return {};
      const supabase = getSupabase();
      const statuses: Record<string, { status: 'toegelaten' | 'vervallen' | 'onbekend'; note?: string; toelatingsnummer?: string }> = {};

      // Check withdrawn list first
      for (const name of productNames) {
        const lower = name.toLowerCase();
        if (WITHDRAWN_PRODUCTS[lower]) {
          statuses[name] = { status: 'vervallen', note: WITHDRAWN_PRODUCTS[lower] };
          continue;
        }

        // Lookup in product_aliases to get official name
        try {
          const { data: aliasData } = await supabase
            .from('product_aliases')
            .select('official_name')
            .eq('alias', lower)
            .limit(1);

          const officialName = aliasData?.[0]?.official_name ?? name;

          // Search in ctgb_products
          const { data: ctgbData } = await supabase
            .from('ctgb_products')
            .select('toelatingsnummer, naam, status, vervaldatum')
            .ilike('naam', `%${officialName}%`)
            .limit(1);

          if (ctgbData && ctgbData.length > 0) {
            const product = ctgbData[0] as any;
            const rawStatus = (product.status ?? '').toLowerCase();
            const vervaldatum = product.vervaldatum ? new Date(product.vervaldatum) : null;
            const isExpired = vervaldatum && vervaldatum < new Date();

            if (rawStatus === 'valid' && !isExpired) {
              statuses[name] = { status: 'toegelaten', toelatingsnummer: product.toelatingsnummer };
            } else {
              statuses[name] = { status: 'vervallen', note: isExpired ? `Vervallen ${product.vervaldatum}` : rawStatus, toelatingsnummer: product.toelatingsnummer };
            }
          } else {
            statuses[name] = { status: 'onbekend' };
          }
        } catch {
          statuses[name] = { status: 'onbekend' };
        }
      }
      return statuses;
    },
    enabled: productNames.length > 0,
    staleTime: 10 * 60 * 1000,
  });
}

function ProductBadge({ name, status }: { name: string; status?: { status: string; note?: string; toelatingsnummer?: string } }) {
  const cfg = {
    toegelaten: { icon: Check, color: 'text-emerald-400', border: 'border-emerald-500/20', bg: 'bg-emerald-500/5' },
    vervallen: { icon: X, color: 'text-rose-400', border: 'border-rose-500/20', bg: 'bg-rose-500/5' },
    onbekend: { icon: CircleDashed, color: 'text-white/40', border: 'border-white/10', bg: 'bg-white/[0.02]' },
  }[status?.status ?? 'onbekend'] ?? { icon: CircleDashed, color: 'text-white/40', border: 'border-white/10', bg: 'bg-white/[0.02]' };
  const Icon = cfg.icon;

  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px]', cfg.border, cfg.bg)}
      title={status?.note ?? (status?.toelatingsnummer ? `CTGB ${status.toelatingsnummer}` : undefined)}
    >
      <span className="text-white/70">{name}</span>
      <Icon className={cn('h-3 w-3', cfg.color)} />
      {status?.status === 'vervallen' && (
        <span className={cn('text-[9px] font-semibold uppercase', cfg.color)}>
          {status.note?.includes('Niet meer') ? 'VERVALLEN' : status.note ?? 'VERVALLEN'}
        </span>
      )}
    </span>
  );
}

const TYPE_CONFIG: Record<string, { label: string; icon: typeof Bug; color: string; bg: string; border: string }> = {
  plaag: { label: 'Plaag', icon: Bug, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
  ziekte: { label: 'Ziekte', icon: Leaf, color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20' },
  abiotisch: { label: 'Abiotisch', icon: CloudRain, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
};

const MONTH_LABELS_FULL = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'];
const MONTH_LABELS_SHORT = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];

export default function EncyclopediaDetailPage() {
  const searchParams = useSearchParams();
  const profileId = searchParams.get('id');
  const { data: profile, isLoading } = useProfile(profileId);
  const { data: phenology } = useCurrentPhenology();
  const { data: relatedArticles = [] } = useRelatedArticles(profile?.name ?? null);
  const { data: productAdvice = [] } = useProductAdvice(profile?.name ?? null);
  const currentMonth = phenology?.month ?? new Date().getUTCMonth() + 1;
  const allProducts = [
    ...(profile?.key_preventive_products ?? []),
    ...(profile?.key_curative_products ?? []),
    ...productAdvice.map((pa) => pa.product_name),
  ];
  const uniqueProducts = Array.from(new Set(allProducts));
  const { data: ctgbStatuses = {} } = useCtgbStatus(uniqueProducts);

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
        <p className="text-white/50">Profiel niet gevonden</p>
        <Link href="/kennisbank/encyclopedie" className="mt-4 inline-block text-emerald-400 hover:underline">
          ← Terug naar encyclopedie
        </Link>
      </div>
    );
  }

  const cfg = TYPE_CONFIG[profile.profile_type] ?? TYPE_CONFIG.ziekte;
  const Icon = cfg.icon;
  const isNowActive = profile.peak_months.includes(currentMonth);

  // Collect images from related articles
  const images = relatedArticles.flatMap((a) => a.image_urls ?? []).filter(Boolean).slice(0, 6);

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
          <div className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl', cfg.bg)}>
            <Icon className={cn('h-7 w-7', cfg.color)} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={cn('rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', cfg.bg, cfg.color)}>
                {cfg.label}
              </span>
              {isNowActive && (
                <span className="flex items-center gap-0.5 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                  <Sparkles className="h-3 w-3" /> NU ACTIEF
                </span>
              )}
            </div>
            <h1 className="mt-1 text-3xl font-light capitalize text-white">{profile.name}</h1>
            {profile.latin_name && (
              <p className="mt-0.5 text-sm italic text-white/40">{profile.latin_name}</p>
            )}
            <div className="mt-1 flex gap-2 text-xs text-white/30">
              {profile.crops.map((c) => <span key={c}>{c}</span>)}
              <span>·</span>
              <span>{profile.source_article_count} bronartikelen</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Images gallery */}
      {images.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="mb-8">
          <div className="flex gap-2 overflow-x-auto rounded-xl pb-2">
            {images.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="shrink-0 overflow-hidden rounded-lg border border-white/10 hover:border-emerald-500/30 transition-colors">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`${profile.name} ${i + 1}`} className="h-36 w-48 object-cover" loading="lazy" />
              </a>
            ))}
          </div>
        </motion.div>
      )}

      {/* Seasonal activity bar */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="mb-8 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-white/40">
          <Calendar className="h-3.5 w-3.5" /> Seizoensactiviteit
        </div>
        <div className="flex gap-1">
          {Array.from({ length: 12 }).map((_, m) => {
            const isActive = profile.peak_months.includes(m + 1);
            const isCurrent = m + 1 === currentMonth;
            return (
              <div key={m} className="flex-1 text-center">
                <div
                  className={cn(
                    'mx-auto mb-1 h-8 w-full rounded-md transition-colors',
                    isActive
                      ? isCurrent ? 'bg-emerald-400' : 'bg-white/20'
                      : 'bg-white/[0.04]',
                  )}
                />
                <span className={cn('text-[9px]', isCurrent ? 'font-bold text-emerald-400' : 'text-white/30')}>
                  {MONTH_LABELS_SHORT[m]}
                </span>
              </div>
            );
          })}
        </div>
        {profile.peak_phases.length > 0 && (
          <p className="mt-2 text-xs text-white/40">
            Piekfases: {profile.peak_phases.join(', ')}
          </p>
        )}
      </motion.div>

      {/* Content sections */}
      <div className="space-y-6">
        <ContentSection icon={BookOpen} title="Beschrijving" content={profile.description} delay={0.2} />
        <ContentSection icon={Eye} title="Symptomen" content={profile.symptoms} delay={0.25} />
        <ContentSection icon={Microscope} title="Levenscyclus" content={profile.lifecycle_notes} delay={0.3} />
        <ContentSection icon={Shield} title="Preventieve aanpak" content={profile.prevention_strategy} delay={0.35}>
          {profile.key_preventive_products.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {profile.key_preventive_products.map((p, idx) => (
                <ProductBadge key={`prev-${idx}`} name={p} status={ctgbStatuses[p]} />
              ))}
            </div>
          )}
        </ContentSection>
        <ContentSection icon={Swords} title="Curatieve aanpak" content={profile.curative_strategy} delay={0.4}>
          {profile.key_curative_products.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {profile.key_curative_products.map((p, idx) => (
                <ProductBadge key={`cur-${idx}`} name={p} status={ctgbStatuses[p]} />
              ))}
            </div>
          )}
        </ContentSection>
        {/* Detailed product advice table from knowledge_product_advice */}
        {productAdvice.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.42 }}
            className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
            <div className="mb-3 flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-emerald-400/60" />
              <h3 className="text-sm font-semibold text-white">Gedetailleerd middelenoverzicht</h3>
              <span className="text-[10px] text-white/30">({productAdvice.length} adviezen)</span>
            </div>
            <div className="overflow-x-auto -mx-2 px-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06] text-left text-[10px] font-semibold uppercase tracking-wider text-white/40">
                    <th className="pb-2 pr-3">Middel</th>
                    <th className="pb-2 pr-3">Werkzame stof</th>
                    <th className="pb-2 pr-3">Gewas</th>
                    <th className="pb-2 pr-3">Dosering</th>
                    <th className="pb-2 pr-3">Type</th>
                    <th className="pb-2 pr-3">Timing</th>
                    <th className="pb-2 pr-3">CTGB</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {productAdvice.map((pa, idx) => {
                    const status = ctgbStatuses[pa.product_name];
                    const statusColor = status?.status === 'toegelaten' ? 'text-emerald-400'
                      : status?.status === 'vervallen' ? 'text-rose-400' : 'text-white/30';
                    const StatusIcon = status?.status === 'toegelaten' ? Check
                      : status?.status === 'vervallen' ? X : CircleDashed;
                    return (
                      <tr key={idx} className={cn('text-white/60', status?.status === 'vervallen' && 'opacity-50 line-through')}>
                        <td className="py-2 pr-3 font-medium text-white/80 no-underline" style={{ textDecoration: 'none' }}>{pa.product_name}</td>
                        <td className="py-2 pr-3 text-white/40">{pa.active_substance ?? '-'}</td>
                        <td className="py-2 pr-3">{pa.crop === 'beide' ? '🍎🍐' : pa.crop === 'appel' ? '🍎' : '🍐'}</td>
                        <td className="py-2 pr-3 font-mono text-[10px]">{pa.dosage ?? '-'}</td>
                        <td className="py-2 pr-3">
                          {pa.application_type && (
                            <span className={cn(
                              'rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase',
                              pa.application_type === 'preventief' ? 'bg-emerald-500/10 text-emerald-400' :
                              pa.application_type === 'curatief' ? 'bg-amber-500/10 text-amber-400' :
                              'bg-white/5 text-white/40',
                            )}>
                              {pa.application_type}
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-3 max-w-[200px] truncate">{pa.timing ?? '-'}</td>
                        <td className="py-2">
                          <StatusIcon className={cn('h-3.5 w-3.5', statusColor)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {productAdvice.some((pa) => pa.safety_interval_days) && (
              <p className="mt-3 text-[10px] text-white/30">
                VGT (veiligheidstermijn): {productAdvice.filter((pa) => pa.safety_interval_days).map((pa) => `${pa.product_name} ${pa.safety_interval_days}d`).join(' · ')}
              </p>
            )}
            {productAdvice.some((pa) => pa.country_restrictions) && (
              <p className="mt-1 text-[10px] text-amber-400/60">
                ⚠️ Let op: {productAdvice.filter((pa) => pa.country_restrictions).map((pa) => `${pa.product_name}: ${pa.country_restrictions}`).join(' · ')}
              </p>
            )}
          </motion.div>
        )}

        <ContentSection icon={Sprout} title="Biologische bestrijding" content={profile.biological_options} delay={0.45} />
        <ContentSection icon={AlertTriangle} title="Resistentiemanagement" content={profile.resistance_management} delay={0.5} />
        <ContentSection icon={Eye} title="Monitoring & waarneming" content={profile.monitoring_advice} delay={0.55} />

        {/* Varieties */}
        {(profile.susceptible_varieties.length > 0 || profile.resistant_varieties.length > 0) && (
          <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
            className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
            <h3 className="mb-3 text-sm font-semibold text-white">Rasgevoeligheid</h3>
            {profile.susceptible_varieties.length > 0 && (
              <div className="mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-rose-400/70">Gevoelig</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {profile.susceptible_varieties.map((v, idx) => (
                    <span key={`sus-${idx}`} className="rounded bg-rose-500/10 px-2 py-0.5 text-xs text-rose-300">{v}</span>
                  ))}
                </div>
              </div>
            )}
            {profile.resistant_varieties.length > 0 && (
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/70">Resistent / minder gevoelig</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {profile.resistant_varieties.map((v, idx) => (
                    <span key={`res-${idx}`} className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300">{v}</span>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Related articles */}
        {relatedArticles.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65 }}>
            <h3 className="mb-3 text-sm font-semibold text-white">Gerelateerde kennisartikelen ({relatedArticles.length})</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {relatedArticles.map((a) => (
                <div key={a.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-xs">
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-emerald-400/60">
                    {a.category}{a.subcategory ? ` · ${a.subcategory}` : ''}
                  </span>
                  <p className="mt-0.5 text-white/70">{a.title}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function ContentSection({
  icon: SectionIcon,
  title,
  content,
  delay = 0,
  children,
}: {
  icon: typeof BookOpen;
  title: string;
  content: string | null;
  delay?: number;
  children?: React.ReactNode;
}) {
  if (!content && !children) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5"
    >
      <div className="mb-2 flex items-center gap-2">
        <SectionIcon className="h-4 w-4 text-emerald-400/60" />
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>
      {content && (
        <p className="text-sm leading-relaxed text-white/60">{content}</p>
      )}
      {children}
    </motion.div>
  );
}
