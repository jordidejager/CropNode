#!/usr/bin/env npx tsx
/**
 * RAG pipeline diagnostic — traces each step for a given query.
 * Shows exactly where the pipeline fails or loses information.
 */
import { setDefaultResultOrder } from 'node:dns';
try { setDefaultResultOrder('ipv4first'); } catch {}
import { Agent, setGlobalDispatcher } from 'undici';
setGlobalDispatcher(new Agent({ connect: { timeout: 60_000 }, headersTimeout: 120_000, bodyTimeout: 120_000 }));

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { extractQueryIntent } from '../src/lib/knowledge/rag/query-understanding';
import { retrieveChunks } from '../src/lib/knowledge/rag/retriever';
import { assessConfidence } from '../src/lib/knowledge/rag/confidence';
import { getCurrentPhenology } from '../src/lib/knowledge/phenology-service';
import { resolveProductAliases } from '../src/lib/knowledge/rag/ctgb-postprocessor';
import { embedText, vectorToPgLiteral } from '../src/lib/knowledge/embed';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const query = process.argv[2] ?? 'Hoelang kun je Pyrus gebruiken curatief?';

async function main() {
  console.log(`\n=== DIAGNOSE: "${query}" ===\n`);

  // Step 1: Intent
  console.log('── STAP 1: Query Understanding ──');
  const intent = await extractQueryIntent(query);
  console.log('  topic:', intent.topic);
  console.log('  crops:', intent.crops);
  console.log('  products:', intent.products);
  console.log('  specific_subjects:', intent.specific_subjects);
  console.log('  timing_question:', intent.timing_question);
  console.log('  confidence:', intent.extractor_confidence);
  if (intent.reject_reason) console.log('  ⚠️ reject_reason:', intent.reject_reason);
  if (intent.topic === 'off_topic') {
    console.log('\n  ❌ STOP: off_topic — pipeline stopt hier');
    return;
  }

  // Step 2: Alias resolution
  console.log('\n── STAP 2: Product Alias Resolution ──');
  if (intent.products.length > 0) {
    const resolved = await resolveProductAliases(supabase, intent.products);
    for (let i = 0; i < intent.products.length; i++) {
      const orig = intent.products[i];
      const res = resolved[i];
      if (res.toLowerCase() !== orig.toLowerCase()) {
        console.log(`  ${orig} → ${res} (alias gevonden!)`);
      } else {
        console.log(`  ${orig} → ${res} (geen alias)`);
      }
    }
  } else {
    console.log('  (geen producten in intent)');
  }

  // Step 3: Phenology
  console.log('\n── STAP 3: Fenologie ──');
  try {
    const pheno = await getCurrentPhenology(supabase);
    console.log('  phase:', pheno.phenologicalPhase);
    console.log('  month:', pheno.month);
    console.log('  bloomDate:', pheno.bloomDate);
  } catch (err: any) {
    console.log('  ⚠️ Phenology fout:', err.message);
  }

  // Step 4: Embedding
  console.log('\n── STAP 4: Query Embedding ──');
  const enrichedQuery = intent.products.length > 0
    ? `${query} ${(await resolveProductAliases(supabase, intent.products)).join(' ')}`
    : query;
  console.log('  enriched query:', enrichedQuery);
  const embedding = await embedText(enrichedQuery);
  console.log('  embedding dims:', embedding.length);

  // Step 5: Vector search (direct RPC)
  console.log('\n── STAP 5: Vector Search (direct RPC) ──');
  const { data: rpcData, error: rpcError } = await supabase.rpc('match_knowledge_articles', {
    query_embedding: vectorToPgLiteral(embedding),
    match_threshold: 0.65,
    match_count: 10,
    filter_crop: null,
    filter_category: null,
    filter_subcategory: null,
    filter_month: null,
  });
  if (rpcError) {
    console.log('  ❌ RPC error:', rpcError.message);
  } else {
    const rows = (rpcData ?? []) as any[];
    console.log(`  ${rows.length} resultaten:`);
    for (const r of rows.slice(0, 8)) {
      console.log(`    sim=${r.similarity?.toFixed(3)}  ${r.category}/${r.subcategory}  "${(r.title ?? '').slice(0, 55)}"`);
      console.log(`      products: ${(r.products_mentioned ?? []).slice(0, 5).join(', ')}`);
    }
  }

  // Step 5b: Product mention lookup
  console.log('\n── STAP 5b: Product Mention Lookup ──');
  if (intent.products.length > 0) {
    const resolved = await resolveProductAliases(supabase, intent.products);
    const allNames = Array.from(new Set([...intent.products, ...resolved]));
    console.log('  lookup names:', allNames);
    const { data: pmData, error: pmError } = await supabase
      .from('knowledge_articles')
      .select('id, title, products_mentioned')
      .eq('status', 'published')
      .overlaps('products_mentioned', allNames)
      .limit(10);
    if (pmError) {
      console.log('  ❌ Product lookup error:', pmError.message);
    } else {
      console.log(`  ${(pmData ?? []).length} artikelen met product in products_mentioned:`);
      for (const r of (pmData ?? []).slice(0, 5)) {
        console.log(`    "${(r.title as string).slice(0, 55)}" — products: ${(r.products_mentioned as string[]).join(', ')}`);
      }
    }
  }

  // Step 6: Full retriever
  console.log('\n── STAP 6: Volledige Retriever ──');
  try {
    const context = {
      intent,
      today: new Date().toISOString().slice(0, 10),
      currentMonth: new Date().getUTCMonth() + 1,
      currentPhaseBase: 'bloei' as string | null,
      currentPhaseDetail: 'volle-bloei',
    };
    const result = await retrieveChunks({
      supabase,
      query,
      intent,
      context,
      returnAliases: true,
    });

    const chunks = 'chunks' in result ? result.chunks : result;
    const aliases = 'resolvedAliases' in result ? result.resolvedAliases : {};
    console.log(`  ${(chunks as any[]).length} chunks na re-ranking`);
    console.log('  aliases:', JSON.stringify(aliases));
    for (const c of (chunks as any[]).slice(0, 5)) {
      console.log(`    sim=${c.similarity?.toFixed(3)} raw=${c.raw_similarity?.toFixed(3)}  "${(c.title ?? '').slice(0, 55)}"`);
    }

    // Step 7: Confidence
    console.log('\n── STAP 7: Confidence Check ──');
    const confidence = assessConfidence(intent, chunks as any[]);
    console.log('  passes:', confidence.passes);
    console.log('  topSimilarity:', confidence.topSimilarity?.toFixed(3));
    if (confidence.reason) console.log('  reason:', confidence.reason);
    if (!confidence.passes) {
      console.log('  ❌ CONFIDENCE FAALT — dit is waarom het antwoord "niet gevonden" zegt');
      console.log('  fallback:', confidence.fallbackMessage);
    }
  } catch (err: any) {
    console.log('  ❌ Retriever exception:', err.message);
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
