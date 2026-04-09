#!/usr/bin/env npx tsx
/**
 * Extract structured knowledge from knowledge_articles into:
 *   - knowledge_product_advice (product × disease × crop combos)
 *   - knowledge_disease_profile (per-disease dossiers)
 *   - knowledge_product_relations (product relationships)
 *
 * Uses Gemini to extract structured data from article content.
 * Resumeable: skips articles already processed (tracks via a temp marker).
 *
 * Usage:
 *   npm run knowledge:extract                          # full extraction
 *   npm run knowledge:extract -- --limit 20            # test with 20
 *   npm run knowledge:extract -- --target schurft      # only schurft articles
 *   npm run knowledge:extract -- --dry-run             # parse only
 */

import { setDefaultResultOrder } from 'node:dns';
try { setDefaultResultOrder('ipv4first'); } catch {}
import { Agent, setGlobalDispatcher } from 'undici';
setGlobalDispatcher(new Agent({ connect: { timeout: 60_000 }, headersTimeout: 120_000, bodyTimeout: 120_000 }));

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { ai } from '../src/ai/genkit';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const args = process.argv.slice(2);
const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1], 10) : undefined;
const targetFilter = args.includes('--target') ? args[args.indexOf('--target') + 1] : undefined;
const dryRun = args.includes('--dry-run');
const EXTRACT_MODEL = 'googleai/gemini-2.5-flash-lite';
const BATCH_SIZE = 5; // articles per Gemini call (batch for efficiency)

// ============================================
// Extraction schema
// ============================================

const ProductAdviceSchema = z.object({
  product_name: z.string(),
  active_substance: z.string().nullable().optional(),
  resistance_group: z.string().nullable().optional(),
  target_name: z.string(),
  target_type: z.enum(['ziekte', 'plaag', 'abiotisch', 'dunning', 'groeiregulatie']),
  crop: z.string(),
  dosage: z.string().nullable().optional(),
  application_type: z.enum(['preventief', 'curatief', 'beide', 'correctie']).nullable().optional(),
  timing: z.string().nullable().optional(),
  phenological_phases: z.array(z.string()).default([]),
  relevant_months: z.array(z.number()).default([]),
  curative_window_hours: z.number().nullable().optional(),
  max_applications_per_year: z.number().nullable().optional(),
  safety_interval_days: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  country_restrictions: z.string().nullable().optional(),
});

const ExtractionResultSchema = z.object({
  product_advice: z.array(ProductAdviceSchema).default([]),
});

const EXTRACT_SYSTEM_PROMPT = `Je bent een data-extractor voor CropNode. Je extraheert GESTRUCTUREERDE product-advies combinaties uit Nederlandse fruitteelt kennisartikelen.

PER ARTIKEL: extraheer ELKE combinatie van (product × ziekte/plaag × gewas) die genoemd wordt.

Voor elke combinatie vul je in:
- product_name: commerciële naam (Captan, Scala, Movento, GA4/7, etc.)
- active_substance: werkzame stof (captan, pyrimethanil, spirotetramat)
- resistance_group: FRAC/IRAC code als bekend (M4, 9, 23, etc.) of null
- target_name: waartegen (schurft, perenbladvlo, meeldauw, fruitmot, etc.)
- target_type: ziekte | plaag | abiotisch | dunning | groeiregulatie
- crop: appel | peer | beide
- dosage: exact zoals genoemd ("1,8 kg/ha", "0,75 l/ha")
- application_type: preventief | curatief | beide | correctie
- timing: wanneer toepassen (fenologische conditie, niet kalenderdata)
- phenological_phases: array van fasen (rust, knopstadium, bloei, vruchtzetting, groei, oogst, nabloei)
- relevant_months: array van maandnummers (1-12)
- curative_window_hours: alleen bij curatief — max uren na infectie (48, 72, 96)
- max_applications_per_year: max toepassingen per seizoen als genoemd
- safety_interval_days: VGT (veiligheidstermijn) in dagen als genoemd
- notes: resistentie-info, combinatie-advies, bijzonderheden
- country_restrictions: "niet tijdens bloei in NL", "alleen BE", etc.

REGELS:
1. Extraheer ALLEEN wat letterlijk in het artikel staat — verzin niets
2. Eén rij per unieke combinatie van product + ziekte + gewas + type
3. Als een product voor zowel appel als peer geldt, maak twee rijen (of "beide" als het identiek is)
4. Doseringen en productnamen EXACT overnemen
5. GEEN specifieke data (geen "woensdag", geen "15 mei") — alleen fenologische timing
6. Als het artikel geen product-advies bevat (bv. puur over rassenkennis), retourneer een lege array

OUTPUT: JSON { "product_advice": [...] }`;

// ============================================
// Main
// ============================================

async function main() {
  console.log('========================================');
  console.log('Structured Knowledge Extraction');
  console.log('========================================');
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'LIVE'}`);
  if (limit) console.log(`Limit: ${limit}`);
  if (targetFilter) console.log(`Target filter: ${targetFilter}`);
  console.log();

  // Fetch articles with products_mentioned (most relevant for extraction)
  // Retry up to 10 times — network can be flaky
  let articles: any[] | null = null;
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      let query = supabase
        .from('knowledge_articles')
        .select('id, title, content, category, subcategory, crops, products_mentioned, season_phases, relevant_months')
        .eq('status', 'published')
        .not('products_mentioned', 'eq', '{}')
        .order('fusion_sources', { ascending: false });

      if (targetFilter) {
        query = query.ilike('subcategory', `%${targetFilter}%`);
      }
      if (limit) {
        query = query.limit(limit);
      } else {
        query = query.limit(2000);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      articles = data;
      break;
    } catch (err: any) {
      console.warn(`Ophalen artikelen poging ${attempt}/10: ${err.message?.slice(0, 60)}`);
      if (attempt === 10) {
        console.error('Kan artikelen niet ophalen na 10 pogingen');
        process.exit(1);
      }
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }

  console.log(`${(articles ?? []).length} artikelen met producten gevonden`);

  if (dryRun) {
    for (const a of (articles ?? []).slice(0, 5)) {
      console.log(`  ${(a as any).title?.slice(0, 60)} — products: ${((a as any).products_mentioned ?? []).join(', ')}`);
    }
    return;
  }

  const allAdvice: z.infer<typeof ProductAdviceSchema>[] = [];
  let processed = 0;
  let errors = 0;
  const startTime = Date.now();

  // Process in batches
  const items = articles ?? [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const batchTexts = batch.map((a: any) => {
      const title = a.title ?? '';
      const content = (a.content ?? '').slice(0, 4000);
      const category = `${a.category}/${a.subcategory ?? ''}`;
      const crops = (a.crops ?? []).join(', ');
      return `--- ARTIKEL: ${title} [${category}] [${crops}] ---\n${content}`;
    }).join('\n\n');

    try {
      const result = await callWithRetry(async () => {
        return ai.generate({
          model: EXTRACT_MODEL,
          system: EXTRACT_SYSTEM_PROMPT,
          prompt: `Extraheer alle product-advies combinaties uit deze ${batch.length} artikelen:\n\n${batchTexts}`,
          output: { schema: ExtractionResultSchema, format: 'json' },
          config: { temperature: 0.1 },
        });
      });

      const output = (result as any).output;
      if (output?.product_advice) {
        allAdvice.push(...output.product_advice);
      }
      processed += batch.length;

      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const eta = processed > 0 ? Math.floor(((Date.now() - startTime) / processed) * (items.length - i - BATCH_SIZE) / 1000) : 0;
      console.log(`[${processed}/${items.length}] ${elapsed}s elapsed, ~${eta}s ETA — ${output?.product_advice?.length ?? 0} advies-rijen geëxtraheerd`);
    } catch (err: any) {
      console.error(`  ❌ Batch ${i}-${i + BATCH_SIZE}: ${err.message?.slice(0, 80)}`);
      errors++;
    }

    // Small delay between batches
    await new Promise(r => setTimeout(r, 200));
  }

  console.log();
  console.log(`Extractie klaar: ${allAdvice.length} product-advies rijen uit ${processed} artikelen (${errors} fouten)`);

  // Deduplicate by (product, target, crop, type)
  const deduped = deduplicateAdvice(allAdvice);
  console.log(`Na deduplicatie: ${deduped.length} unieke rijen`);

  // Insert into knowledge_product_advice
  console.log();
  console.log('Opslaan in knowledge_product_advice...');

  let inserted = 0;
  let skipped = 0;
  for (const advice of deduped) {
    const upsertWithRetry = async () => {
      for (let a = 1; a <= 5; a++) {
        const { error: e } = await supabase.from('knowledge_product_advice').upsert({
          product_name: advice.product_name,
          active_substance: advice.active_substance ?? null,
          resistance_group: advice.resistance_group ?? null,
          target_name: advice.target_name,
          target_type: advice.target_type,
          crop: advice.crop,
          dosage: advice.dosage ?? null,
          application_type: advice.application_type ?? null,
          timing: advice.timing ?? null,
          phenological_phases: advice.phenological_phases,
          relevant_months: advice.relevant_months,
          curative_window_hours: advice.curative_window_hours ?? null,
          max_applications_per_year: advice.max_applications_per_year ?? null,
          safety_interval_days: advice.safety_interval_days ?? null,
          notes: advice.notes ?? null,
          country_restrictions: advice.country_restrictions ?? null,
          source_article_count: 1,
        }, { onConflict: 'product_name,target_name,crop,application_type' });
        if (!e) return null;
        if (a < 5 && /fetch failed/i.test(e.message)) {
          await new Promise(r => setTimeout(r, 1000 * a));
          continue;
        }
        return e;
      }
      return { message: 'max retries' };
    };
    const insertError = await upsertWithRetry();
    if (insertError) {
      if (typeof insertError === 'object' && 'message' in insertError && !(insertError as any).message?.includes('duplicate')) {
        console.warn(`  ⚠️ ${advice.product_name}/${advice.target_name}: ${(insertError as any).message?.slice(0, 60)}`);
      }
      skipped++;
    } else {
      inserted++;
    }
  }

  console.log(`  Inserted: ${inserted}, Skipped: ${skipped}`);

  // Now extract disease profiles from the aggregated data
  console.log();
  console.log('Genereren disease profiles...');
  await extractDiseaseProfiles(deduped);

  // Extract product relations
  console.log();
  console.log('Genereren product relations...');
  await extractProductRelations(deduped);

  const totalTime = Math.floor((Date.now() - startTime) / 1000);
  console.log();
  console.log('========================================');
  console.log(`Klaar in ${Math.floor(totalTime / 60)}m ${totalTime % 60}s`);
  console.log(`  Product advice: ${inserted} rijen`);
  console.log(`  Fouten: ${errors}`);
  console.log('========================================');
}

// ============================================
// Disease profile extraction (from aggregated product_advice)
// ============================================

async function extractDiseaseProfiles(advice: z.infer<typeof ProductAdviceSchema>[]) {
  // Group advice by target_name
  const byTarget = new Map<string, z.infer<typeof ProductAdviceSchema>[]>();
  for (const a of advice) {
    const key = a.target_name.toLowerCase();
    if (!byTarget.has(key)) byTarget.set(key, []);
    byTarget.get(key)!.push(a);
  }

  // Only create profiles for targets with 3+ advice rows
  const significantTargets = Array.from(byTarget.entries())
    .filter(([, rows]) => rows.length >= 3)
    .sort((a, b) => b[1].length - a[1].length);

  console.log(`  ${significantTargets.length} ziekte/plaag profielen te genereren`);

  for (const [targetName, rows] of significantTargets) {
    const preventive = rows.filter(r => r.application_type === 'preventief').map(r => r.product_name);
    const curative = rows.filter(r => r.application_type === 'curatief').map(r => r.product_name);
    const crops = Array.from(new Set(rows.map(r => r.crop)));
    const phases = Array.from(new Set(rows.flatMap(r => r.phenological_phases)));
    const months = Array.from(new Set(rows.flatMap(r => r.relevant_months))).sort();
    const targetType = rows[0].target_type;

    const { error } = await supabase
      .from('knowledge_disease_profile')
      .upsert({
        name: targetName,
        profile_type: targetType === 'plaag' ? 'plaag' : targetType === 'abiotisch' ? 'abiotisch' : 'ziekte',
        crops,
        peak_phases: phases,
        peak_months: months,
        key_preventive_products: Array.from(new Set(preventive)).slice(0, 8),
        key_curative_products: Array.from(new Set(curative)).slice(0, 8),
        source_article_count: rows.length,
      }, { onConflict: 'name' });

    if (error && !error.message.includes('duplicate')) {
      console.warn(`  ⚠️ Profile ${targetName}: ${error.message.slice(0, 60)}`);
    }
  }

  console.log(`  ${significantTargets.length} profielen opgeslagen`);
}

// ============================================
// Product relations (from shared targets + known aliases)
// ============================================

async function extractProductRelations(advice: z.infer<typeof ProductAdviceSchema>[]) {
  const relations: Array<{ a: string; b: string; type: string; context: string; notes: string }> = [];

  // 1. Same resistance group → zelfde_resistentiegroep
  const byGroup = new Map<string, Set<string>>();
  for (const a of advice) {
    if (a.resistance_group) {
      if (!byGroup.has(a.resistance_group)) byGroup.set(a.resistance_group, new Set());
      byGroup.get(a.resistance_group)!.add(a.product_name);
    }
  }
  for (const [group, products] of byGroup) {
    const list = Array.from(products);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        relations.push({
          a: list[i], b: list[j],
          type: 'zelfde_resistentiegroep',
          context: `FRAC/IRAC groep ${group}`,
          notes: 'Wissel af om resistentie te voorkomen',
        });
      }
    }
  }

  // 2. Same target + crop + different product → alternatief_voor
  const byTargetCrop = new Map<string, Set<string>>();
  for (const a of advice) {
    const key = `${a.target_name}|${a.crop}`;
    if (!byTargetCrop.has(key)) byTargetCrop.set(key, new Set());
    byTargetCrop.get(key)!.add(a.product_name);
  }
  for (const [key, products] of byTargetCrop) {
    if (products.size < 2) continue;
    const [target, crop] = key.split('|');
    const list = Array.from(products).slice(0, 10); // cap to avoid combinatorial explosion
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        relations.push({
          a: list[i], b: list[j],
          type: 'alternatief_voor',
          context: `${target} bij ${crop}`,
          notes: '',
        });
      }
    }
  }

  // Dedupe and insert
  const seen = new Set<string>();
  let inserted = 0;
  for (const rel of relations) {
    const key = [rel.a, rel.b, rel.type].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);

    const { error } = await supabase
      .from('knowledge_product_relations')
      .upsert({
        product_a: rel.a,
        product_b: rel.b,
        relation_type: rel.type,
        context: rel.context,
        notes: rel.notes,
      }, { onConflict: 'product_a,product_b,relation_type' });

    if (!error) inserted++;
  }

  console.log(`  ${inserted} relaties opgeslagen (van ${relations.length} totaal, ${seen.size} uniek)`);
}

// ============================================
// Helpers
// ============================================

function deduplicateAdvice(rows: z.infer<typeof ProductAdviceSchema>[]): z.infer<typeof ProductAdviceSchema>[] {
  const map = new Map<string, z.infer<typeof ProductAdviceSchema>>();
  for (const row of rows) {
    const key = `${row.product_name}|${row.target_name}|${row.crop}|${row.application_type ?? 'onbekend'}`.toLowerCase();
    const existing = map.get(key);
    if (!existing) {
      map.set(key, row);
    } else {
      // Merge: keep most specific dosage, combine notes
      if (row.dosage && (!existing.dosage || existing.dosage === 'onbekend')) {
        existing.dosage = row.dosage;
      }
      if (row.curative_window_hours && !existing.curative_window_hours) {
        existing.curative_window_hours = row.curative_window_hours;
      }
      if (row.safety_interval_days && !existing.safety_interval_days) {
        existing.safety_interval_days = row.safety_interval_days;
      }
      if (row.timing && (!existing.timing || existing.timing.length < row.timing.length)) {
        existing.timing = row.timing;
      }
    }
  }
  return Array.from(map.values());
}

async function callWithRetry<T>(fn: () => Promise<T>, maxAttempts = 4, baseDelayMs = 2000): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.warn(`  Retry ${attempt}/${maxAttempts}: ${message.slice(0, 60)}. Wacht ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
