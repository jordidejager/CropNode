#!/usr/bin/env npx tsx
/**
 * Import CTGB product gebruiksvoorschriften as knowledge_articles.
 *
 * For each CTGB product with fruit-relevant gebruiksvoorschriften:
 * - Creates a knowledge_article with the official usage rules
 * - Sets is_public_source=true, public_source_ref to CTGB
 * - Marks as is_evergreen=true (regulations don't expire seasonally)
 * - Generates embedding for vector search
 *
 * Only imports products relevant to fruit (appel, peer, kers, pruim, pit-/steenvrucht).
 */
import { setDefaultResultOrder } from 'node:dns';
try { setDefaultResultOrder('ipv4first'); } catch {}
import { Agent, setGlobalDispatcher } from 'undici';
setGlobalDispatcher(new Agent({ connect: { timeout: 60_000 }, headersTimeout: 120_000, bodyTimeout: 120_000 }));

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { embedText, vectorToPgLiteral } from '../src/lib/knowledge/embed';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const limit = process.argv.includes('--limit')
  ? parseInt(process.argv[process.argv.indexOf('--limit') + 1], 10)
  : undefined;
const dryRun = process.argv.includes('--dry-run');

// Fruit-relevant gewas keywords
const FRUIT_CROPS = [
  'appel', 'peer', 'kers', 'pruim', 'pitfruit', 'steenfruit',
  'fruitboom', 'fruitteelt', 'boomgaard', 'fruit',
  'malus', 'pyrus', 'prunus',
];

function isFruitRelevant(gewas: string): boolean {
  const lower = (gewas ?? '').toLowerCase();
  return FRUIT_CROPS.some((kw) => lower.includes(kw));
}

function mapGewasToeCrop(gewas: string): string[] {
  const lower = (gewas ?? '').toLowerCase();
  const crops: string[] = [];
  if (lower.includes('appel') || lower.includes('malus') || lower.includes('pitfruit')) crops.push('appel');
  if (lower.includes('peer') || lower.includes('pyrus') || lower.includes('pitfruit')) crops.push('peer');
  if (lower.includes('kers') || lower.includes('prunus') || lower.includes('steenfruit')) crops.push('kers');
  if (lower.includes('pruim') || lower.includes('steenfruit')) crops.push('pruim');
  if (crops.length === 0 && (lower.includes('fruit') || lower.includes('boom'))) {
    crops.push('appel', 'peer');
  }
  return crops;
}

interface GV {
  gewas?: string;
  doelorganisme?: string;
  dosering?: string;
  maxToepassingen?: number;
  veiligheidstermijn?: string;
  interval?: string;
  locatie?: string;
  toepassingsmethode?: string;
  werking?: string[];
  opmerkingen?: string[];
}

function formatArticle(product: { naam: string; toelatingsnummer: string; werkzame_stoffen: string[] }, gvs: GV[]): string {
  const lines: string[] = [];
  lines.push(`${product.naam} is een gewasbeschermingsmiddel met toelatingsnummer ${product.toelatingsnummer}.`);
  if (product.werkzame_stoffen?.length > 0) {
    lines.push(`Werkzame stof: ${product.werkzame_stoffen.join(', ')}.`);
  }
  lines.push('');
  lines.push('Toepassingsvoorwaarden volgens CTGB-etiket:');

  for (const gv of gvs) {
    lines.push('');
    if (gv.gewas) lines.push(`Gewas: ${gv.gewas}`);
    if (gv.doelorganisme) lines.push(`Doelorganisme: ${gv.doelorganisme}`);
    if (gv.dosering) lines.push(`Dosering: ${gv.dosering}`);
    if (gv.maxToepassingen) lines.push(`Maximum toepassingen: ${gv.maxToepassingen} per seizoen`);
    if (gv.veiligheidstermijn) lines.push(`Veiligheidstermijn (VGT): ${gv.veiligheidstermijn}`);
    if (gv.interval) lines.push(`Interval: ${gv.interval}`);
    if (gv.toepassingsmethode) lines.push(`Toepassing: ${gv.toepassingsmethode}`);
    if (gv.opmerkingen?.length) lines.push(`Let op: ${gv.opmerkingen.join('. ')}`);
  }

  return lines.join('\n');
}

async function main() {
  console.log(`=== CTGB → Knowledge Articles (${dryRun ? 'DRY-RUN' : 'LIVE'}) ===`);

  // Fetch products with gebruiksvoorschriften
  let products: any[] = [];
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      let q = supabase
        .from('ctgb_products')
        .select('toelatingsnummer, naam, werkzame_stoffen, gebruiksvoorschriften')
        .not('gebruiksvoorschriften', 'is', null);
      if (limit) q = q.limit(limit);
      else q = q.limit(2000);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      products = data ?? [];
      break;
    } catch (err: any) {
      console.warn(`  Fetch ${attempt}/10: ${(err.message ?? '').slice(0, 40)}`);
      await new Promise(r => setTimeout(r, 2000 * Math.min(attempt, 5)));
    }
  }

  console.log(`${products.length} CTGB producten geladen`);

  // Filter fruit-relevant products
  const fruitProducts = products.filter((p: any) => {
    const gvs = (p.gebruiksvoorschriften ?? []) as GV[];
    return gvs.some((gv) => isFruitRelevant(gv.gewas ?? ''));
  });

  console.log(`${fruitProducts.length} fruit-relevant producten`);

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const [i, product] of fruitProducts.entries()) {
    const gvs = ((product.gebruiksvoorschriften ?? []) as GV[]).filter((gv) => isFruitRelevant(gv.gewas ?? ''));
    if (gvs.length === 0) continue;

    const title = `${product.naam}: CTGB toepassingsvoorwaarden voor fruitteelt`;
    const content = formatArticle(product, gvs);
    const summary = `Officiële CTGB-toepassingsvoorwaarden voor ${product.naam} (${product.toelatingsnummer}) in fruitteelt: dosering, veiligheidstermijn en maximum toepassingen.`;
    const contentHash = createHash('sha256').update(content).digest('hex');

    // Determine crops
    const crops = Array.from(new Set(gvs.flatMap((gv) => mapGewasToeCrop(gv.gewas ?? ''))));

    // Products mentioned
    const productsMentioned = [product.naam, ...(product.werkzame_stoffen ?? [])];

    // Determine subcategory from doelorganisme
    const organisms = gvs.map((gv) => (gv.doelorganisme ?? '').toLowerCase()).filter(Boolean);
    const subcategory = organisms[0] || 'gewasbescherming';

    if (dryRun) {
      if (i < 5) {
        console.log(`  ${product.naam} (${product.toelatingsnummer}) — ${gvs.length} GVs, crops: ${crops.join(',')}`);
      }
      created++;
      continue;
    }

    // Check if already exists
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        const { data: existing } = await supabase
          .from('knowledge_articles')
          .select('id')
          .eq('content_hash', contentHash)
          .limit(1);
        if (existing && existing.length > 0) {
          skipped++;
          break;
        }

        // Generate embedding
        const embedding = await embedText(`${title}\n${summary}\n${content}`);

        // Insert
        const { error } = await supabase.from('knowledge_articles').insert({
          title,
          content,
          summary,
          content_embedding: vectorToPgLiteral(embedding),
          category: 'certificering',
          subcategory,
          knowledge_type: 'regelgeving',
          crops,
          varieties: [],
          season_phases: [],
          relevant_months: [],
          products_mentioned: productsMentioned,
          is_public_source: true,
          public_source_ref: `CTGB — ${product.naam} (${product.toelatingsnummer})`,
          confidence_level: 'hoog',
          harvest_year: new Date().getUTCFullYear(),
          is_evergreen: true,
          content_hash: contentHash,
          fusion_sources: 1,
          status: 'published',
          published_at: new Date().toISOString(),
        });

        if (error) throw new Error(error.message);
        created++;

        if ((i + 1) % 25 === 0) {
          console.log(`  [${i + 1}/${fruitProducts.length}] created=${created} skipped=${skipped}`);
        }
        break;
      } catch (err: any) {
        if (attempt < 5) {
          await new Promise(r => setTimeout(r, 1500 * attempt));
          continue;
        }
        console.warn(`  x ${product.naam}: ${(err.message ?? '').slice(0, 50)}`);
        errors++;
      }
    }

    // Small delay for rate limiting
    await new Promise(r => setTimeout(r, 150));
  }

  console.log();
  console.log(`Klaar: ${created} artikelen gemaakt, ${skipped} overgeslagen, ${errors} fouten`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
