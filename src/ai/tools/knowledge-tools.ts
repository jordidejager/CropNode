/**
 * Knowledge RAG Agent Tools
 *
 * These tools give the RAG agent structured access to the knowledge base.
 * The agent decides WHICH tools to call based on the user's question,
 * enabling multi-step reasoning:
 *
 *   "Wat spuiten tegen schurft op Jonagold?"
 *   → lookupProductAdvice(target="schurft", crop="appel")
 *   → getDiseaseProfile("schurft")  (get susceptible varieties)
 *   → checkCtgbStatus("Captan")     (verify toelating)
 *   → searchKnowledgeBase("schurft Jonagold")  (extra context)
 *   → COMBINE into answer
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import type { SupabaseClient } from '@supabase/supabase-js';

// We need the Supabase client to be injected at tool creation time
// because Genkit tools can't receive runtime context. We use a module-level
// variable that's set before the agent is invoked.
let _supabase: SupabaseClient | null = null;

export function setToolSupabaseClient(client: SupabaseClient) {
  _supabase = client;
}

function getClient(): SupabaseClient {
  if (!_supabase) throw new Error('Supabase client niet gezet — roep setToolSupabaseClient() aan');
  return _supabase;
}

// ============================================================================
// TOOL 1: lookupProductAdvice
// ============================================================================

export const lookupProductAdviceTool = ai.defineTool(
  {
    name: 'lookupProductAdvice',
    description:
      'Zoek gestructureerde adviezen op: welk middel bij welke ziekte/plaag, met dosering en timing. ' +
      'Gebruik dit voor vragen als "Wat kan ik spuiten tegen schurft?", ' +
      '"Welke middelen werken curatief bij meeldauw?", "Dosering van Captan op appel?".',
    inputSchema: z.object({
      target: z.string().optional().describe('Ziekte of plaag (schurft, perenbladvlo, meeldauw, fruitmot, etc.)'),
      product: z.string().optional().describe('Productnaam (Captan, Scala, Movento, etc.)'),
      crop: z.string().optional().describe('Gewas (appel, peer, beide)'),
      type: z.string().optional().describe('preventief, curatief, beide, correctie'),
      limit: z.number().optional().default(10).describe('Max resultaten'),
    }),
    outputSchema: z.object({
      advice: z.array(z.object({
        product_name: z.string(),
        active_substance: z.string().nullable(),
        target_name: z.string(),
        crop: z.string(),
        dosage: z.string().nullable(),
        application_type: z.string().nullable(),
        timing: z.string().nullable(),
        curative_window_hours: z.number().nullable(),
        safety_interval_days: z.number().nullable(),
        resistance_group: z.string().nullable(),
        notes: z.string().nullable(),
        country_restrictions: z.string().nullable(),
      })),
      totalFound: z.number(),
    }),
  },
  async (input) => {
    const supabase = getClient();
    let q = supabase
      .from('knowledge_product_advice')
      .select('product_name, active_substance, target_name, crop, dosage, application_type, timing, curative_window_hours, safety_interval_days, resistance_group, notes, country_restrictions, source_article_count')
      .order('source_article_count', { ascending: false });

    if (input.target) q = q.ilike('target_name', `%${input.target}%`);
    if (input.product) q = q.ilike('product_name', `%${input.product}%`);
    if (input.crop) q = q.or(`crop.eq.${input.crop},crop.eq.beide`);
    if (input.type) q = q.eq('application_type', input.type);
    q = q.limit(input.limit ?? 10);

    const { data, error } = await q;
    if (error) {
      console.warn('[tool:lookupProductAdvice]', error.message);
      return { advice: [], totalFound: 0 };
    }

    return {
      advice: (data ?? []).map((r: Record<string, unknown>) => ({
        product_name: r.product_name as string,
        active_substance: r.active_substance as string | null,
        target_name: r.target_name as string,
        crop: r.crop as string,
        dosage: r.dosage as string | null,
        application_type: r.application_type as string | null,
        timing: r.timing as string | null,
        curative_window_hours: r.curative_window_hours as number | null,
        safety_interval_days: r.safety_interval_days as number | null,
        resistance_group: r.resistance_group as string | null,
        notes: r.notes as string | null,
        country_restrictions: r.country_restrictions as string | null,
      })),
      totalFound: (data ?? []).length,
    };
  },
);

// ============================================================================
// TOOL 2: getDiseaseProfile
// ============================================================================

export const getDiseaseProfileTool = ai.defineTool(
  {
    name: 'getDiseaseProfile',
    description:
      'Haal het volledige profiel op van een ziekte of plaag: beschrijving, symptomen, ' +
      'levenscyclus, preventie- en curatieve strategie, gevoelige rassen, kernmiddelen. ' +
      'Gebruik dit voor vragen als "Wat is schurft?", "Hoe herken ik perenbladvlo?", ' +
      '"Welke rassen zijn gevoelig voor meeldauw?".',
    inputSchema: z.object({
      name: z.string().describe('Naam van de ziekte of plaag (schurft, perenbladvlo, fruitmot, etc.)'),
    }),
    outputSchema: z.object({
      found: z.boolean(),
      profile: z.object({
        name: z.string(),
        latin_name: z.string().nullable(),
        type: z.string(),
        crops: z.array(z.string()),
        description: z.string().nullable(),
        symptoms: z.string().nullable(),
        prevention_strategy: z.string().nullable(),
        curative_strategy: z.string().nullable(),
        biological_options: z.string().nullable(),
        resistance_management: z.string().nullable(),
        monitoring_advice: z.string().nullable(),
        key_preventive_products: z.array(z.string()),
        key_curative_products: z.array(z.string()),
        susceptible_varieties: z.array(z.string()),
        resistant_varieties: z.array(z.string()),
        peak_phases: z.array(z.string()),
        peak_months: z.array(z.number()),
      }).nullable(),
    }),
  },
  async (input) => {
    const supabase = getClient();
    const { data, error } = await supabase
      .from('knowledge_disease_profile')
      .select('*')
      .ilike('name', `%${input.name}%`)
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return { found: false, profile: null };
    }

    const d = data as Record<string, unknown>;
    return {
      found: true,
      profile: {
        name: d.name as string,
        latin_name: d.latin_name as string | null,
        type: d.profile_type as string,
        crops: (d.crops as string[]) ?? [],
        description: d.description as string | null,
        symptoms: d.symptoms as string | null,
        prevention_strategy: d.prevention_strategy as string | null,
        curative_strategy: d.curative_strategy as string | null,
        biological_options: d.biological_options as string | null,
        resistance_management: d.resistance_management as string | null,
        monitoring_advice: d.monitoring_advice as string | null,
        key_preventive_products: (d.key_preventive_products as string[]) ?? [],
        key_curative_products: (d.key_curative_products as string[]) ?? [],
        susceptible_varieties: (d.susceptible_varieties as string[]) ?? [],
        resistant_varieties: (d.resistant_varieties as string[]) ?? [],
        peak_phases: (d.peak_phases as string[]) ?? [],
        peak_months: (d.peak_months as number[]) ?? [],
      },
    };
  },
);

// ============================================================================
// TOOL 3: getProductRelations
// ============================================================================

export const getProductRelationsTool = ai.defineTool(
  {
    name: 'getProductRelations',
    description:
      'Haal relaties op tussen gewasbeschermingsmiddelen: alternatieven, ' +
      'middelen met dezelfde resistentiegroep (die je moet afwisselen), ' +
      'en middelen die goed combineren. ' +
      'Gebruik dit voor vragen als "Alternatieven voor Captan?", ' +
      '"Welke middelen zitten in dezelfde resistentiegroep als Scala?", ' +
      '"Kan ik Faban combineren met Delan?".',
    inputSchema: z.object({
      product: z.string().describe('Productnaam om relaties voor op te zoeken'),
    }),
    outputSchema: z.object({
      relations: z.array(z.object({
        related_product: z.string(),
        relation_type: z.string(),
        context: z.string().nullable(),
        notes: z.string().nullable(),
      })),
      totalFound: z.number(),
    }),
  },
  async (input) => {
    const supabase = getClient();
    // Search both directions (product_a and product_b)
    const { data: dataA } = await supabase
      .from('knowledge_product_relations')
      .select('product_b, relation_type, context, notes')
      .ilike('product_a', `%${input.product}%`)
      .limit(20);

    const { data: dataB } = await supabase
      .from('knowledge_product_relations')
      .select('product_a, relation_type, context, notes')
      .ilike('product_b', `%${input.product}%`)
      .limit(20);

    const relations = [
      ...(dataA ?? []).map((r: Record<string, unknown>) => ({
        related_product: r.product_b as string,
        relation_type: r.relation_type as string,
        context: r.context as string | null,
        notes: r.notes as string | null,
      })),
      ...(dataB ?? []).map((r: Record<string, unknown>) => ({
        related_product: r.product_a as string,
        relation_type: r.relation_type as string,
        context: r.context as string | null,
        notes: r.notes as string | null,
      })),
    ];

    // Deduplicate
    const seen = new Set<string>();
    const unique = relations.filter((r) => {
      const key = `${r.related_product}|${r.relation_type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return { relations: unique, totalFound: unique.length };
  },
);

// ============================================================================
// TOOL 4: searchKnowledgeBase
// ============================================================================

export const searchKnowledgeBaseTool = ai.defineTool(
  {
    name: 'searchKnowledgeBase',
    description:
      'Zoek in de CropNode kennisbank voor gedetailleerde teeltkennis. ' +
      'Dit doorzoekt 2000+ artikelen over fruitteelt (appel, peer) met ' +
      'informatie over ziektebestrijding, bemesting, snoei, dunning, etc. ' +
      'Gebruik dit voor aanvullende context bij complexe vragen, ' +
      'of wanneer de gestructureerde tools niet genoeg informatie opleveren.',
    inputSchema: z.object({
      query: z.string().describe('Zoekvraag in het Nederlands'),
      category: z.string().optional().describe('Filter op categorie: ziekte, plaag, bemesting, snoei, dunning, bewaring'),
      subcategory: z.string().optional().describe('Filter op subcategorie: schurft, meeldauw, perenbladvlo, etc.'),
      crop: z.string().optional().describe('Filter op gewas: appel, peer'),
      limit: z.number().optional().default(4).describe('Max resultaten'),
    }),
    outputSchema: z.object({
      articles: z.array(z.object({
        title: z.string(),
        summary: z.string(),
        content: z.string(),
        category: z.string(),
        subcategory: z.string().nullable(),
        products_mentioned: z.array(z.string()),
      })),
      totalFound: z.number(),
    }),
  },
  async (input) => {
    const supabase = getClient();

    // Use metadata search (same as retriever v2 but simplified)
    let q = supabase
      .from('knowledge_articles')
      .select('title, summary, content, category, subcategory, products_mentioned')
      .eq('status', 'published')
      .order('fusion_sources', { ascending: false })
      .limit(input.limit ?? 4);

    if (input.category) q = q.eq('category', input.category);
    if (input.subcategory) q = q.ilike('subcategory', `%${input.subcategory}%`);
    if (input.crop) q = q.contains('crops', [input.crop]);

    // If no specific filters, do a title search
    if (!input.category && !input.subcategory) {
      q = q.ilike('title', `%${input.query.split(' ').slice(0, 3).join('%')}%`);
    }

    const { data, error } = await q;
    if (error) {
      console.warn('[tool:searchKnowledgeBase]', error.message);
      return { articles: [], totalFound: 0 };
    }

    return {
      articles: (data ?? []).map((r: Record<string, unknown>) => ({
        title: r.title as string,
        summary: (r.summary as string) ?? '',
        content: ((r.content as string) ?? '').slice(0, 2000), // cap content to avoid huge tool outputs
        category: r.category as string,
        subcategory: r.subcategory as string | null,
        products_mentioned: (r.products_mentioned as string[]) ?? [],
      })),
      totalFound: (data ?? []).length,
    };
  },
);

// ============================================================================
// TOOL 5: getCurrentSeason
// ============================================================================

export const getCurrentSeasonTool = ai.defineTool(
  {
    name: 'getCurrentSeason',
    description:
      'Geeft de huidige fenologische fase, datum, maand en seizoensinformatie terug. ' +
      'Gebruik dit om te bepalen welke adviezen NU relevant zijn.',
    inputSchema: z.object({}),
    outputSchema: z.object({
      today: z.string(),
      month: z.number(),
      monthName: z.string(),
      phase: z.string(),
      phaseDescription: z.string(),
    }),
  },
  async () => {
    const now = new Date();
    const month = now.getUTCMonth() + 1;
    const monthNames = [
      'januari', 'februari', 'maart', 'april', 'mei', 'juni',
      'juli', 'augustus', 'september', 'oktober', 'november', 'december',
    ];

    // Simple phase determination based on month
    // (a more precise version would use the bloom date from phenology_reference)
    const phases: Record<number, [string, string]> = {
      1: ['winterrust', 'De bomen zijn in rust. Focus op snoei en preventieve maatregelen.'],
      2: ['winterrust/knopzwelling', 'Einde winterrust, eerste knoppen zwellen. Begin met koperbespuitingen.'],
      3: ['knopzwelling/groen-puntje', 'Knoppen breken open. Eerste schurftinfecties mogelijk bij regen.'],
      4: ['volle-bloei', 'Bloeiperiode. Bestuiving, bacterievuurrisico, schurftpreventie cruciaal.'],
      5: ['bloembladval/vruchtzetting', 'Zetting van vruchten. Dunning starten, luisbestrijding.'],
      6: ['junirui', 'Natuurlijke rui. Dunning afronden, schurftschema aanhouden.'],
      7: ['celstrekking', 'Celstrekking fase. Vruchtgroei monitoren, spintcontrole.'],
      8: ['celstrekking/oogst', 'Late celstrekking, vroege oogst start. Bewaarfungiciden.'],
      9: ['oogst', 'Hoofdoogst. Plukwondjes afdekken, SmartFresh overwegen.'],
      10: ['oogst/bladval', 'Late oogst, bladval begint. Kankerpreventie, ureum op blad.'],
      11: ['bladval', 'Bladval. Preventieve koperbehandeling, snoei plannen.'],
      12: ['winterrust', 'Winterrust. Snoei uitvoeren, boomgaard opruimen.'],
    };

    const [phase, desc] = phases[month] ?? ['onbekend', ''];

    return {
      today: now.toISOString().slice(0, 10),
      month,
      monthName: monthNames[month - 1],
      phase,
      phaseDescription: desc,
    };
  },
);

// ============================================================================
// EXPORT ALL TOOLS
// ============================================================================

export const knowledgeTools = [
  lookupProductAdviceTool,
  getDiseaseProfileTool,
  getProductRelationsTool,
  searchKnowledgeBaseTool,
  getCurrentSeasonTool,
];
