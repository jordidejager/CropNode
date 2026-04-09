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
    phase?: string;
    limit?: number;
  },
): Promise<ProductAdvice[]> {
  try {
    const { data, error } = await supabase.rpc('lookup_product_advice', {
      filter_target: params.target ?? null,
      filter_product: params.product ?? null,
      filter_crop: params.crop ?? null,
      filter_type: params.applicationType ?? null,
      filter_phase: params.phase ?? null,
      result_limit: params.limit ?? 20,
    });
    if (error) {
      console.warn('[structured] lookup_product_advice fout:', error.message);
      return [];
    }
    return (data ?? []) as ProductAdvice[];
  } catch (err) {
    console.warn('[structured] lookup_product_advice exception:', err);
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

export async function lookupDiseaseProfile(
  supabase: SupabaseClient,
  diseaseName: string,
): Promise<DiseaseProfile | null> {
  try {
    const { data, error } = await supabase.rpc('get_disease_profile', {
      disease_name: diseaseName,
    });
    if (error) {
      console.warn('[structured] get_disease_profile fout:', error.message);
      return null;
    }
    const rows = data as DiseaseProfile[] | null;
    return rows && rows.length > 0 ? rows[0] : null;
  } catch (err) {
    console.warn('[structured] get_disease_profile exception:', err);
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
    const { data, error } = await supabase.rpc('get_product_relations', {
      product: productName,
    });
    if (error) {
      console.warn('[structured] get_product_relations fout:', error.message);
      return [];
    }
    return (data ?? []) as ProductRelation[];
  } catch (err) {
    console.warn('[structured] get_product_relations exception:', err);
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
    if (dp.crops.length > 0) parts.push(`Gewassen: ${dp.crops.join(', ')}`);
    if (dp.peak_phases.length > 0) parts.push(`Piekfases: ${dp.peak_phases.join(', ')}`);
    if (dp.key_preventive_products.length > 0) {
      parts.push(`Preventieve middelen: ${dp.key_preventive_products.join(', ')}`);
    }
    if (dp.key_curative_products.length > 0) {
      parts.push(`Curatieve middelen: ${dp.key_curative_products.join(', ')}`);
    }
    if (dp.prevention_strategy) parts.push(`Preventie: ${dp.prevention_strategy}`);
    if (dp.curative_strategy) parts.push(`Curatief: ${dp.curative_strategy}`);
    if (dp.resistance_management) parts.push(`Resistentie: ${dp.resistance_management}`);
    if (dp.susceptible_varieties.length > 0) {
      parts.push(`Gevoelige rassen: ${dp.susceptible_varieties.join(', ')}`);
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
