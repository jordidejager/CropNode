/**
 * Structured knowledge lookups — direct SQL queries against the
 * knowledge_product_advice, knowledge_disease_profile, and
 * knowledge_product_relations tables.
 *
 * These complement the vector search in the retriever by providing
 * exact, reliable answers for structured queries like:
 *   - "Welk middel tegen schurft bij appel?" → lookup_product_advice
 *   - "Vertel over perenbladvlo" → get_disease_profile
 *   - "Alternatieven voor Captan?" → get_product_relations
 *
 * Used by the RAG pipeline as additional context alongside vector search results.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================
// Product Advice Lookup
// ============================================

export interface ProductAdvice {
  product_name: string;
  active_substance: string | null;
  target_name: string;
  crop: string;
  dosage: string | null;
  application_type: string | null;
  timing: string | null;
  curative_window_hours: number | null;
  max_applications_per_year: number | null;
  safety_interval_days: number | null;
  notes: string | null;
  country_restrictions: string | null;
  resistance_group: string | null;
  source_article_count: number;
}

export async function lookupProductAdvice(
  supabase: SupabaseClient,
  params: {
    target?: string;
    product?: string;
    crop?: string;
    applicationType?: string;
    limit?: number;
  },
): Promise<ProductAdvice[]> {
  try {
    // Direct query ipv RPC (RPC timeoutt op ons Supabase plan)
    let q = supabase
      .from('knowledge_product_advice')
      .select('product_name, active_substance, target_name, crop, dosage, application_type, timing, curative_window_hours, max_applications_per_year, safety_interval_days, notes, country_restrictions, resistance_group, source_article_count')
      .order('source_article_count', { ascending: false })
      .limit(params.limit ?? 20);

    if (params.target) q = q.ilike('target_name', `%${params.target}%`);
    if (params.product) q = q.ilike('product_name', `%${params.product}%`);
    if (params.crop) q = q.or(`crop.eq.${params.crop},crop.eq.beide`);
    if (params.applicationType) q = q.eq('application_type', params.applicationType);

    const { data, error } = await q;
    if (error) {
      console.warn('[structured] product_advice lookup fout:', error.message);
      return [];
    }
    return (data ?? []) as unknown as ProductAdvice[];
  } catch (err) {
    console.warn('[structured] product_advice exception:', err);
    return [];
  }
}

// ============================================
// Disease Profile
// ============================================

export interface DiseaseProfile {
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
  key_preventive_products: string[];
  key_curative_products: string[];
  susceptible_varieties: string[];
  resistant_varieties: string[];
  peak_phases: string[];
  peak_months: number[];
  source_article_count: number;
}

// In-memory cache for disease profiles — prevents repeated DB calls
// that fail due to flaky network. Cache refreshes every 30 minutes.
let _profileCache: Map<string, DiseaseProfile> | null = null;
let _profileCacheTime = 0;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

async function ensureProfileCache(supabase: SupabaseClient): Promise<Map<string, DiseaseProfile>> {
  if (_profileCache && Date.now() - _profileCacheTime < CACHE_TTL_MS) {
    return _profileCache;
  }

  // Try to load all profiles in one shot
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      const { data, error } = await supabase
        .from('knowledge_disease_profile')
        .select('*')
        .order('source_article_count', { ascending: false });

      if (error) throw new Error(error.message);
      const map = new Map<string, DiseaseProfile>();
      for (const row of (data ?? []) as DiseaseProfile[]) {
        map.set(row.name.toLowerCase(), row);
      }
      _profileCache = map;
      _profileCacheTime = Date.now();
      console.log(`[structured] Disease profile cache geladen: ${map.size} profielen`);
      return map;
    } catch (err: any) {
      if (attempt < 8) {
        await new Promise(r => setTimeout(r, 1500 * attempt));
        continue;
      }
      console.warn('[structured] Cache load failed after 8 attempts');
    }
  }

  // Return empty map if all attempts fail, but keep old cache if available
  return _profileCache ?? new Map();
}

export async function lookupDiseaseProfile(
  supabase: SupabaseClient,
  diseaseName: string,
): Promise<DiseaseProfile | null> {
  try {
    const cache = await ensureProfileCache(supabase);
    const lower = diseaseName.toLowerCase();

    // Exact match first
    if (cache.has(lower)) {
      const profile = cache.get(lower)!;
      console.log(`[structured] Disease profile (cache): ${profile.name} (lifecycle: ${profile.lifecycle_notes ? 'ja' : 'nee'})`);
      return profile;
    }

    // Partial match
    for (const [key, profile] of cache) {
      if (key.includes(lower) || lower.includes(key)) {
        console.log(`[structured] Disease profile (cache, partial): ${profile.name}`);
        return profile;
      }
    }

    console.log(`[structured] Geen profiel in cache voor: ${diseaseName}`);
    return null;
  } catch (err) {
    console.warn('[structured] disease_profile exception:', err);
    return null;
  }
}

// ============================================
// Product Relations
// ============================================

export interface ProductRelation {
  related_product: string;
  relation_type: string;
  context: string | null;
  notes: string | null;
}

export async function lookupProductRelations(
  supabase: SupabaseClient,
  productName: string,
): Promise<ProductRelation[]> {
  try {
    // Direct queries ipv RPC (beide richtingen)
    const [resultA, resultB] = await Promise.all([
      supabase
        .from('knowledge_product_relations')
        .select('product_b, relation_type, context, notes')
        .ilike('product_a', `%${productName}%`)
        .limit(20),
      supabase
        .from('knowledge_product_relations')
        .select('product_a, relation_type, context, notes')
        .ilike('product_b', `%${productName}%`)
        .limit(20),
    ]);

    const relations: ProductRelation[] = [
      ...(resultA.data ?? []).map((r: any) => ({
        related_product: r.product_b,
        relation_type: r.relation_type,
        context: r.context,
        notes: r.notes,
      })),
      ...(resultB.data ?? []).map((r: any) => ({
        related_product: r.product_a,
        relation_type: r.relation_type,
        context: r.context,
        notes: r.notes,
      })),
    ];

    // Deduplicate
    const seen = new Set<string>();
    return relations.filter(r => {
      const key = `${r.related_product}|${r.relation_type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch (err) {
    console.warn('[structured] product_relations exception:', err);
    return [];
  }
}

// ============================================
// Format structured data as context for the generator
// ============================================

/**
 * Format structured lookup results as text that can be injected into
 * the grounded generator's context alongside vector search chunks.
 */
export function formatStructuredContext(params: {
  productAdvice?: ProductAdvice[];
  diseaseProfile?: DiseaseProfile | null;
  productRelations?: ProductRelation[];
}): string | null {
  const parts: string[] = [];

  // Disease profile
  if (params.diseaseProfile) {
    const dp = params.diseaseProfile;
    parts.push('[GESTRUCTUREERDE KENNIS — ZIEKTE/PLAAG PROFIEL]');
    parts.push(`${dp.name} (${dp.profile_type})`);
    if (dp.latin_name) parts.push(`Wetenschappelijke naam: ${dp.latin_name}`);
    if (dp.crops.length > 0) parts.push(`Gewassen: ${dp.crops.join(', ')}`);
    if (dp.description) parts.push(`Beschrijving: ${dp.description}`);
    if (dp.symptoms) parts.push(`Symptomen: ${dp.symptoms}`);
    if (dp.lifecycle_notes) parts.push(`Levenscyclus: ${dp.lifecycle_notes}`);
    if (dp.peak_phases.length > 0) parts.push(`Piekfases: ${dp.peak_phases.join(', ')}`);
    if (dp.key_preventive_products.length > 0) {
      parts.push(`Preventieve middelen: ${dp.key_preventive_products.join(', ')}`);
    }
    if (dp.key_curative_products.length > 0) {
      parts.push(`Curatieve middelen: ${dp.key_curative_products.join(', ')}`);
    }
    if (dp.prevention_strategy) parts.push(`Preventie: ${dp.prevention_strategy}`);
    if (dp.curative_strategy) parts.push(`Curatief: ${dp.curative_strategy}`);
    if (dp.biological_options) parts.push(`Biologisch: ${dp.biological_options}`);
    if (dp.resistance_management) parts.push(`Resistentie: ${dp.resistance_management}`);
    if (dp.monitoring_advice) parts.push(`Monitoring: ${dp.monitoring_advice}`);
    if (dp.susceptible_varieties.length > 0) {
      parts.push(`Gevoelige rassen: ${dp.susceptible_varieties.join(', ')}`);
    }
    if (dp.resistant_varieties.length > 0) {
      parts.push(`Resistente rassen: ${dp.resistant_varieties.join(', ')}`);
    }
    parts.push('');
  }

  // Product advice table
  if (params.productAdvice && params.productAdvice.length > 0) {
    parts.push('[GESTRUCTUREERDE KENNIS — PRODUCT ADVIES]');
    parts.push('Product | Doel | Gewas | Dosering | Type | Timing | Curatief window | VGT | Max/jaar | Opmerkingen');
    parts.push('---|---|---|---|---|---|---|---|---|---');
    for (const pa of params.productAdvice) {
      parts.push([
        pa.product_name,
        pa.target_name,
        pa.crop,
        pa.dosage ?? '-',
        pa.application_type ?? '-',
        pa.timing ?? '-',
        pa.curative_window_hours ? `${pa.curative_window_hours}u` : '-',
        pa.safety_interval_days ? `${pa.safety_interval_days}d` : '-',
        pa.max_applications_per_year ?? '-',
        [pa.notes, pa.country_restrictions].filter(Boolean).join('; ') || '-',
      ].join(' | '));
    }
    parts.push('');
  }

  // Product relations
  if (params.productRelations && params.productRelations.length > 0) {
    // Group by relation type
    const byType = new Map<string, ProductRelation[]>();
    for (const r of params.productRelations) {
      if (!byType.has(r.relation_type)) byType.set(r.relation_type, []);
      byType.get(r.relation_type)!.push(r);
    }

    parts.push('[GESTRUCTUREERDE KENNIS — PRODUCT RELATIES]');
    for (const [type, rels] of byType) {
      const label = type === 'alternatief_voor' ? 'Alternatieven'
        : type === 'zelfde_resistentiegroep' ? 'Zelfde resistentiegroep'
        : type === 'combineer_met' ? 'Combineer met'
        : type === 'niet_combineren' ? 'Niet combineren met'
        : type;
      const names = rels.map(r => r.related_product).slice(0, 10);
      parts.push(`${label}: ${names.join(', ')}`);
    }
    parts.push('');
  }

  return parts.length > 0 ? parts.join('\n') : null;
}
