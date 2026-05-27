#!/usr/bin/env tsx
/**
 * Extract per-middel encyclopedie-profielen uit knowledge_articles.
 *
 * Voor elk product dat in `products_mentioned` voorkomt aggregeren we ALLE
 * artikelen waarin het genoemd wordt en sturen Gemini een prompt om er een
 * compact, gestructureerd PROFIEL uit te destilleren:
 *   - doelorganismen + nevenwerking
 *   - resistentiegroep, BBCH-range, gevoelige rassen
 *   - optimale spuitomstandigheden (temp, RH, wind, deltaT, dagdeel)
 *   - watervolume + watergevoeligheid
 *   - tankmix-compat/incompat
 *   - alternatieven + resistentiemanagement
 *
 * Schrijft naar `knowledge_product_profile` (zie migratie 080).
 *
 * Gebruik:
 *   npx tsx scripts/extract-product-profiles.ts                 # full extract
 *   npx tsx scripts/extract-product-profiles.ts -- --limit 5    # eerst klein
 *   npx tsx scripts/extract-product-profiles.ts -- --dry-run    # geen DB writes
 *   npx tsx scripts/extract-product-profiles.ts -- --product=Scala  # alleen één
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local', override: true });
loadEnv({ path: '.env', override: false });

import { setDefaultResultOrder } from 'node:dns';
try { setDefaultResultOrder('ipv4first'); } catch { /* older node */ }
import { Agent, setGlobalDispatcher } from 'undici';
setGlobalDispatcher(new Agent({
  connect: { timeout: 60_000 },
  headersTimeout: 180_000,
  bodyTimeout: 180_000,
}));

import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { ai } from '../src/ai/genkit';
import { generateClaudeStructured } from '../src/lib/ai/claude';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

interface CliArgs {
  limit: number | null;
  product: string | null;
  dryRun: boolean;
  verbose: boolean;
  minArticles: number;
  provider: 'gemini' | 'claude';
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    limit: null,
    product: null,
    dryRun: false,
    verbose: false,
    minArticles: 2,
    // Claude default — eenmalige extract, hoge kwaliteit > snelheid.
    // Override met --provider=gemini voor goedkopere/snellere maar magere extracts.
    provider: 'claude',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--limit=')) out.limit = parseInt(a.slice(8), 10) || null;
    else if (a === '--limit') out.limit = parseInt(argv[++i] ?? '', 10) || null;
    else if (a.startsWith('--product=')) out.product = a.slice(10);
    else if (a === '--product') out.product = argv[++i] ?? null;
    else if (a.startsWith('--min-articles=')) out.minArticles = parseInt(a.slice(15), 10) || 2;
    else if (a === '--dry-run' || a === '--dry') out.dryRun = true;
    else if (a === '--verbose' || a === '-v') out.verbose = true;
    else if (a === '--provider=gemini' || (a === '--provider' && argv[i + 1] === 'gemini')) {
      out.provider = 'gemini';
      if (argv[i + 1] === 'gemini') i++;
    } else if (a === '--provider=claude' || (a === '--provider' && argv[i + 1] === 'claude')) {
      out.provider = 'claude';
      if (argv[i + 1] === 'claude') i++;
    }
  }
  return out;
}

// Mutable flags — set from CLI args in main(), used by extractProfile()
let VERBOSE = false;
let PROVIDER: 'gemini' | 'claude' = 'claude';

const EXTRACT_MODEL = 'googleai/gemini-2.5-flash';

// ============================================
// Zod schema voor Gemini output
// ============================================

const ProductProfileSchema = z.object({
  product_name: z.string(),
  active_substance: z.string().nullable().optional(),
  product_type: z.enum([
    'fungicide', 'insecticide', 'acaricide', 'herbicide', 'groeiregulator',
    'bladmeststof', 'bodemmeststof', 'bioagens', 'feromoon', 'overig',
  ]).nullable().optional(),
  resistance_group: z.string().nullable().optional(),
  aliases: z.array(z.string()).default([]),
  crops: z.array(z.string()).default([]),
  target_organisms: z.array(z.string()).default([]),
  side_effects: z.array(z.string()).default([]),
  bbch_min: z.number().int().nullable().optional(),
  bbch_max: z.number().int().nullable().optional(),
  sensitive_varieties: z.array(z.string()).default([]),

  optimal_temp_min: z.number().nullable().optional(),
  optimal_temp_max: z.number().nullable().optional(),
  optimal_humidity_min: z.number().int().nullable().optional(),
  optimal_humidity_max: z.number().int().nullable().optional(),
  wind_speed_max_ms: z.number().nullable().optional(),
  delta_t_min: z.number().nullable().optional(),
  delta_t_max: z.number().nullable().optional(),
  preferred_time_of_day: z.string().nullable().optional(),
  rain_fastness_hours: z.number().int().nullable().optional(),

  water_volume_l_per_ha: z.number().int().nullable().optional(),
  water_volume_notes: z.string().nullable().optional(),
  water_sensitivity: z.string().nullable().optional(),
  ph_range: z.string().nullable().optional(),

  tank_mix_compatible: z.array(z.string()).default([]),
  tank_mix_incompatible: z.array(z.string()).default([]),
  tank_mix_notes: z.string().nullable().optional(),

  strategy_summary: z.string().nullable().optional(),
  application_advice: z.string().nullable().optional(),
  resistance_management: z.string().nullable().optional(),
  alternatives: z.array(z.string()).default([]),

  safety_interval_days: z.number().int().nullable().optional(),
  max_applications_per_year: z.number().int().nullable().optional(),
  beneficials_impact: z.string().nullable().optional(),
  bee_safety: z.string().nullable().optional(),

  notes: z.string().nullable().optional(),
  confidence: z.enum(['hoog', 'gemiddeld', 'laag']).default('gemiddeld'),
});

type ProductProfile = z.infer<typeof ProductProfileSchema>;

// ============================================
// Gemini system prompt
// ============================================

const EXTRACT_SYSTEM_PROMPT = `Je bent een data-extractor voor CropNode (Nederlandse appel- en perentelers).

Je krijgt ALLE artikelen waarin een specifiek middel genoemd wordt. Destilleer daaruit één compleet PROFIEL van het middel.

KRITISCHE REGELS:
1. Extraheer informatie die in de artikelen voorkomt. Impliciete context telt mee:
   - Als een artikel zegt "Bij schurftrisico Captan 1,8 kg/ha" → target_organisms moet "schurft" bevatten.
   - Als een artikel zegt "Gazelle tegen perenbladvlo" → target_organisms moet "perenbladvlo" bevatten.
   - Als een product in 50 artikelen voorkomt onder "schurftbestrijding" → schurft is een target.
   Niet alleen formele "is een fungicide tegen X" zinnen; ook de praktische "spuit X bij Y" context.
2. Verzin GEEN getallen of doseringen die nergens genoemd worden. Numerieke velden (temp, RH, wind, deltaT, watervolume, BBCH, VGT) ALLEEN invullen als een artikel een concreet getal geeft.
3. Pak het MEEST CONSISTENTE getal/term als artikelen variëren — geen gemiddelde, geen interpolatie.
4. Combineer NOOIT je eigen general-knowledge fabriekskennis over middelen. Alleen wat uit de meegegeven artikelen blijkt.
5. Schrijf strategy_summary en application_advice in eigen woorden, gebaseerd op de artikelen — niet kopiëren.

VELDEN UITLEG:
- product_name: canonieke naam (Scala, Movento, GA4/7, Captan, etc.)
- active_substance: werkzame stof (pyrimethanil, spirotetramat, gibberelline A4+A7)
- product_type: fungicide | insecticide | acaricide | herbicide | groeiregulator | bladmeststof | bodemmeststof | bioagens | feromoon | overig
- resistance_group: FRAC voor fungiciden (M, 1-50), IRAC voor insecticiden (1A, 23, etc.)
- aliases: synoniemen en merknaam-varianten (bv. Pyrus voor Scala)
- crops: ["appel", "peer", "kers", "pruim"] — alleen die expliciet genoemd worden
- target_organisms: PRIMAIRE doelorganismen (schurft, vruchtboomkanker, fruitmot, perenbladvlo)
- side_effects: NEVENWERKING — andere ziektes/plagen waar 't óók (deels) tegen werkt
- bbch_min/max: vroegste / laatste BBCH-stadium dat genoemd wordt
- sensitive_varieties: rassen die fytotoxisch reageren (bv. "Gala niet bij hoge temp")

SPUITOMSTANDIGHEDEN:
- optimal_temp_min/max: temperatuurrange in °C (bv. 12-20)
- optimal_humidity_min/max: RH range in % (bv. 70-95)
- wind_speed_max_ms: maximaal m/s (vaak 3 of 4 voor drift)
- delta_t_min/max: deltaT range in °C (bv. 2-8 voor optimale opname)
- preferred_time_of_day: "ochtend" | "avond" | "ochtend/avond" | "niet midden op de dag" | "rustig weer"
- rain_fastness_hours: aantal uren regenvrij nodig na bespuiting

WATER + APPLICATIE:
- water_volume_l_per_ha: integer liters water per ha
- water_volume_notes: kort, bv. "minimaal 500 L bij volwas gewas"
- water_sensitivity: "gevoelig" (snelle penetratie nodig) | "neutraal" | "tolerant"
- ph_range: bv. "pH 5-7 in spuittank"

TANKMIX:
- tank_mix_compatible: lijst middel-namen die expliciet als compatible worden genoemd
- tank_mix_incompatible: lijst middelen waar het NIET mee mag (vaak koper, ATS, olie)
- tank_mix_notes: praktische opmerking zoals "nooit met alkalisch product"

STRATEGIE:
- strategy_summary: 1-2 zinnen "wat is dit middel, kort"
- application_advice: 2-4 zinnen praktisch advies (timing, voorzorgsmaatregelen)
- resistance_management: hoe afwisselen, max per seizoen, met welke groepen niet combineren
- alternatives: ANDERE middel-namen die als alternatief worden genoemd

VEILIGHEID:
- safety_interval_days: VGT in dagen
- max_applications_per_year: limiet per seizoen
- beneficials_impact: effect op nuttige insecten (oorwormen, roofmijten, etc.)
- bee_safety: "veilig" | "niet tijdens bloei" | "gevaarlijk" | null

CONFIDENCE:
- "hoog" als 5+ artikelen duidelijk overlappen
- "gemiddeld" als 2-4 artikelen consistent zijn
- "laag" als < 2 artikelen of veel tegenspraak

OUTPUT: JSON object exact volgens de meegegeven schema.`;

// ============================================
// Main flow
// ============================================

async function main() {
  const args = parseArgs(process.argv.slice(2));
  VERBOSE = args.verbose;
  PROVIDER = args.provider;

  console.log('\n💊 Middel-profiel extractie');
  console.log(`   provider:      ${args.provider}`);
  console.log(`   product:       ${args.product ?? 'alle'}`);
  console.log(`   limit:         ${args.limit ?? 'geen'}`);
  console.log(`   min artikelen: ${args.minArticles}`);
  console.log(`   dry-run:       ${args.dryRun}\n`);

  // 1. Verzamel alle products_mentioned uit knowledge_articles
  const productCounts = await collectProductMentions(args.minArticles);
  const totalProducts = Object.keys(productCounts).length;
  console.log(`📊 ${totalProducts} unieke middelen met ≥${args.minArticles} artikelen\n`);

  // 2. Filter
  let products = Object.entries(productCounts).sort((a, b) => b[1] - a[1]); // meeste artikelen eerst
  if (args.product) {
    products = products.filter(([name]) => name.toLowerCase() === args.product!.toLowerCase());
    if (products.length === 0) {
      console.error(`❌ Product "${args.product}" niet gevonden in artikelen.`);
      process.exit(1);
    }
  }
  if (args.limit) products = products.slice(0, args.limit);

  console.log(`🚀 ${products.length} producten verwerken...\n`);

  // 3. Per product: fetch artikelen, extract, store
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const [productName, count] of products) {
    process.stdout.write(`▸ ${productName.padEnd(35)} (${count} artikelen) `);
    try {
      const articles = await fetchArticlesForProduct(productName);
      if (articles.length < args.minArticles) {
        console.log('⏭️  te weinig data');
        skipped++;
        continue;
      }

      const profile = await extractProfile(productName, articles);
      if (!profile) {
        console.log('⚠️  geen profile (Gemini gaf niets terug)');
        skipped++;
        continue;
      }

      if (args.dryRun) {
        const targets = (profile.target_organisms ?? []).length;
        const conds = [
          profile.optimal_temp_min,
          profile.optimal_humidity_min,
          profile.wind_speed_max_ms,
          profile.delta_t_min,
        ].filter((v) => v != null).length;
        console.log(`✓ dry-run [type=${profile.product_type ?? '?'}, targets=${targets}, omstandigheden=${conds}/4]`);
        continue;
      }

      const action = await upsertProfile(profile, articles.length);
      if (action === 'created') created++;
      else updated++;
      console.log(`✅ ${action}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`❌ ${msg.slice(0, 80)}`);
      errors++;
    }
  }

  console.log(`\n📊 Resultaat:`);
  console.log(`   Aangemaakt:  ${created}`);
  console.log(`   Bijgewerkt:  ${updated}`);
  console.log(`   Overgeslagen: ${skipped}`);
  console.log(`   Fouten:      ${errors}`);
}

// ============================================
// Step 1: Collect product mentions
// ============================================

async function collectProductMentions(minArticles: number): Promise<Record<string, number>> {
  // Pull all products_mentioned arrays in batches (PostgREST cap 1000)
  const counts: Record<string, number> = {};
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('knowledge_articles')
      .select('products_mentioned')
      .eq('status', 'published')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Article fetch: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data) {
      for (const p of (row.products_mentioned ?? []) as string[]) {
        if (!p || p.length < 2) continue;
        // Normaliseer: trim + collapse whitespace, behoud case voor display
        const norm = p.trim().replace(/\s+/g, ' ');
        // Skip puur lowercase werkzame stoffen — die hebben we al via active_substance
        if (norm === norm.toLowerCase() && norm.split(/\s+/).length === 1) continue;
        counts[norm] = (counts[norm] ?? 0) + 1;
      }
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  // Filter onder minArticles
  return Object.fromEntries(Object.entries(counts).filter(([, n]) => n >= minArticles));
}

// ============================================
// Step 2: Fetch articles for one product
// ============================================

async function fetchArticlesForProduct(productName: string) {
  // Match exact in products_mentioned[] — case-insensitive via OR
  const { data, error } = await supabase
    .from('knowledge_articles')
    .select('id, title, content, summary, products_mentioned, crops, season_phases')
    .eq('status', 'published')
    .contains('products_mentioned', [productName])
    .order('fusion_sources', { ascending: false })
    .limit(30);
  if (error) throw new Error(`Articles for ${productName}: ${error.message}`);
  return (data ?? []) as Array<{
    id: string;
    title: string;
    content: string;
    summary: string | null;
    products_mentioned: string[];
    crops: string[];
    season_phases: string[];
  }>;
}

// ============================================
// Step 3: Extract profile via Gemini
// ============================================

async function extractProfile(
  productName: string,
  articles: Array<{ title: string; content: string; summary: string | null }>,
): Promise<ProductProfile | null> {
  // Bundle de artikelen — beperk per-artikel-lengte zodat we onder de context-limiet
  // blijven én Gemini niet "verstikt" raakt en alleen een half profiel produceert.
  const ARTICLES_PER_PROMPT = 10;
  const CHARS_PER_ARTICLE = 2500;
  const block = articles
    .slice(0, ARTICLES_PER_PROMPT)
    .map((a, i) => `=== Artikel ${i + 1}: ${a.title} ===\n${(a.content ?? '').slice(0, CHARS_PER_ARTICLE)}`)
    .join('\n\n');

  const userPrompt = `Middel: ${productName}

Onderstaande ${articles.length} artikelen noemen dit middel (top ${Math.min(ARTICLES_PER_PROMPT, articles.length)} getoond). Destilleer één compleet PROFIEL van het middel.

BELANGRIJK: vul ALTIJD ALLE velden uit het output-schema in. Wanneer informatie ontbreekt:
- array-velden → lege array []
- numerieke velden → null
- string-velden → null

Het is OK als veel velden null/[] zijn voor exotische middelen. Maar bekende velden zoals product_type, active_substance, target_organisms, crops MOETEN gevuld zijn als er ÉNIG signaal in de artikelen staat.

ARTIKELEN:

${block}`;

  try {
    let profile: ProductProfile | null;

    if (PROVIDER === 'claude') {
      const result = await generateClaudeStructured({
        system: EXTRACT_SYSTEM_PROMPT,
        prompt:
          userPrompt +
          '\n\nGeef alleen geldige JSON terug volgens het schema. Geen markdown-fences, geen toelichting.',
        schema: ProductProfileSchema,
        maxTokens: 4096,
        temperature: 0.1,
        cacheSystem: true, // system prompt is constant → caching levert kosten-besparing
      });
      profile = result.output;
      if (VERBOSE) {
        console.log(`\n   📤 Claude output voor ${productName}:`);
        console.log('   ' + JSON.stringify(profile, null, 2).split('\n').join('\n   '));
      }
    } else {
      const result = await ai.generate({
        model: EXTRACT_MODEL,
        system: EXTRACT_SYSTEM_PROMPT,
        prompt: userPrompt,
        output: { schema: ProductProfileSchema, format: 'json' },
        config: { temperature: 0.1, maxOutputTokens: 4096 },
      });
      const raw = (result as { output?: unknown }).output;
      if (VERBOSE) {
        console.log(`\n   📤 Raw Gemini output voor ${productName}:`);
        console.log('   ' + JSON.stringify(raw, null, 2).split('\n').join('\n   '));
      }
      if (!raw) return null;
      // Expliciete Zod parse — Genkit's `output.schema` valideert niet altijd
      // de defaults, dus array-velden kunnen undefined blijven.
      const parseResult = ProductProfileSchema.safeParse(raw);
      if (!parseResult.success) {
        console.warn(
          `   ⚠️  Schema fout: ${parseResult.error.issues.slice(0, 2).map((i) => i.path.join('.') + ': ' + i.message).join('; ')}`,
        );
        return null;
      }
      profile = parseResult.data;
    }

    if (!profile) return null;
    // Forceer de product_name die we kennen (LLM kan typo's introduceren)
    profile.product_name = productName;
    return profile;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`   ⚠️  ${PROVIDER} fout: ${msg.slice(0, 80)}`);
    return null;
  }
}

// ============================================
// Step 4: Upsert profile
// ============================================

async function upsertProfile(
  profile: ProductProfile,
  sourceCount: number,
): Promise<'created' | 'updated'> {
  // Map naar DB-rij — onbekende velden blijven null
  const row = {
    product_name: profile.product_name,
    active_substance: profile.active_substance ?? null,
    product_type: profile.product_type ?? null,
    resistance_group: profile.resistance_group ?? null,
    aliases: profile.aliases ?? [],
    crops: profile.crops ?? [],
    target_organisms: profile.target_organisms ?? [],
    side_effects: profile.side_effects ?? [],
    bbch_min: profile.bbch_min ?? null,
    bbch_max: profile.bbch_max ?? null,
    sensitive_varieties: profile.sensitive_varieties ?? [],

    optimal_temp_min: profile.optimal_temp_min ?? null,
    optimal_temp_max: profile.optimal_temp_max ?? null,
    optimal_humidity_min: profile.optimal_humidity_min ?? null,
    optimal_humidity_max: profile.optimal_humidity_max ?? null,
    wind_speed_max_ms: profile.wind_speed_max_ms ?? null,
    delta_t_min: profile.delta_t_min ?? null,
    delta_t_max: profile.delta_t_max ?? null,
    preferred_time_of_day: profile.preferred_time_of_day ?? null,
    rain_fastness_hours: profile.rain_fastness_hours ?? null,

    water_volume_l_per_ha: profile.water_volume_l_per_ha ?? null,
    water_volume_notes: profile.water_volume_notes ?? null,
    water_sensitivity: profile.water_sensitivity ?? null,
    ph_range: profile.ph_range ?? null,

    tank_mix_compatible: profile.tank_mix_compatible ?? [],
    tank_mix_incompatible: profile.tank_mix_incompatible ?? [],
    tank_mix_notes: profile.tank_mix_notes ?? null,

    strategy_summary: profile.strategy_summary ?? null,
    application_advice: profile.application_advice ?? null,
    resistance_management: profile.resistance_management ?? null,
    alternatives: profile.alternatives ?? [],

    safety_interval_days: profile.safety_interval_days ?? null,
    max_applications_per_year: profile.max_applications_per_year ?? null,
    beneficials_impact: profile.beneficials_impact ?? null,
    bee_safety: profile.bee_safety ?? null,

    notes: profile.notes ?? null,
    confidence: profile.confidence ?? 'gemiddeld',
    source_article_count: sourceCount,
  };

  // Bestaande row check
  const { data: existing } = await supabase
    .from('knowledge_product_profile')
    .select('id')
    .eq('product_name', profile.product_name)
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('knowledge_product_profile')
      .update(row)
      .eq('id', existing.id);
    if (error) throw new Error(`Update: ${error.message}`);
    return 'updated';
  } else {
    const { error } = await supabase.from('knowledge_product_profile').insert(row);
    if (error) throw new Error(`Insert: ${error.message}`);
    return 'created';
  }
}

main().catch((err) => {
  console.error('\n💥 Extract fout:', err);
  process.exit(1);
});
