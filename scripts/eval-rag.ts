#!/usr/bin/env tsx
/**
 * Eval harness voor de RAG chat pipeline.
 *
 * Draait de golden set (`scripts/rag-golden-set.json`) via runChatPipeline en
 * controleert of intent-extractie + antwoordtekst voldoen aan de verwachtingen.
 *
 * Gebruik:
 *   npx tsx scripts/eval-rag.ts                  # Alle queries
 *   npx tsx scripts/eval-rag.ts --id=schurft-curatief-appel
 *   npx tsx scripts/eval-rag.ts --verbose        # Print volledige antwoorden
 *
 * Output: JSON rapport naar stdout + samenvatting naar stderr.
 * Exit code 0 als alles slaagt, 1 als er failures zijn.
 */

import { config as loadEnv } from 'dotenv';
// Load env vars BEFORE importing anything that uses them (Genkit reads
// GOOGLE_API_KEY at module import time). `override: true` is needed
// because shell rc-files can set empty-string placeholders that dotenv
// otherwise refuses to overwrite.
loadEnv({ path: '.env.local', override: true });
loadEnv({ path: '.env', override: false });

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { runChatPipeline } from '../src/lib/knowledge/rag/pipeline';
import type { ChatTurn, QueryIntent, RagEvent } from '../src/lib/knowledge/rag/types';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface GoldenQuery {
  id: string;
  query: string;
  history?: ChatTurn[];
  expected_intent?: Partial<QueryIntent>;
  expected_answer_contains_any?: string[];
  expected_answer_contains_all?: string[];
  timing_question_expected?: boolean;
  dosage_question_expected?: boolean;
  should_fallback?: boolean;
  comment?: string;
}

interface GoldenSet {
  version: number;
  description: string;
  queries: GoldenQuery[];
}

interface EvalResult {
  id: string;
  query: string;
  pass: boolean;
  failures: string[];
  metrics: {
    latency_ms: number;
    top_similarity: number | null;
    retrieved_count: number;
    answer_length: number;
    used_agent: boolean;
    used_fallback: boolean;
  };
  intent?: QueryIntent | null;
  answer?: string;
}

function parseArgs(argv: string[]) {
  const out = { id: null as string | null, verbose: false };
  for (const a of argv) {
    if (a.startsWith('--id=')) out.id = a.slice(5);
    if (a === '--verbose') out.verbose = true;
  }
  return out;
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase credentials ontbreken (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function evalQuery(
  supabase: SupabaseClient,
  golden: GoldenQuery,
): Promise<EvalResult> {
  const failures: string[] = [];
  const start = Date.now();

  let intent: QueryIntent | null = null;
  let answer = '';
  let chunks: RagEvent extends { type: 'retrieval_done'; chunks: infer C } ? C : never[] = [] as never;
  let sources: Array<{ id: string; title: string }> = [];
  let usedFallback = false;
  let usedAgent = false;
  let topSim: number | null = null;

  for await (const event of runChatPipeline({
    supabase,
    query: golden.query,
    history: golden.history,
  })) {
    switch (event.type) {
      case 'understanding_done':
        intent = event.intent;
        break;
      case 'retrieval_done':
        chunks = event.chunks as never;
        topSim = event.topSimilarity ?? null;
        break;
      case 'answer_chunk':
        answer += event.text;
        break;
      case 'confidence_fail':
        usedFallback = true;
        break;
      case 'sources':
        sources = event.chunks.map((c) => ({ id: c.id, title: c.title }));
        break;
      case 'error':
        failures.push(`pipeline error: ${event.message}`);
        break;
      case 'done':
        break;
    }
  }

  const latency = Date.now() - start;

  // Heuristic: if we fell back OR agent was invoked via confidence-fail path
  if (/dit staat niet in onze kennisbank|ik heb hier geen informatie|valt buiten onze kennisbank/i.test(answer)) {
    usedFallback = true;
  }
  // No reliable way to detect agent usage from outside the pipeline — leave as false

  // Intent checks
  if (golden.expected_intent) {
    const ei = golden.expected_intent;
    if (ei.topic && intent?.topic !== ei.topic) {
      failures.push(`intent.topic mismatch: expected "${ei.topic}", got "${intent?.topic}"`);
    }
    if (ei.crops) {
      const missing = ei.crops.filter((c) => !intent?.crops.includes(c));
      if (missing.length > 0) failures.push(`intent.crops missing: ${missing.join(', ')}`);
    }
    if (ei.specific_subjects) {
      const missing = ei.specific_subjects.filter(
        (s) => !intent?.specific_subjects.some((is) => is.toLowerCase().includes(s.toLowerCase())),
      );
      if (missing.length > 0) failures.push(`intent.specific_subjects missing: ${missing.join(', ')}`);
    }
    if (ei.products) {
      const missing = ei.products.filter(
        (p) => !intent?.products.some((ip) => ip.toLowerCase() === p.toLowerCase()),
      );
      if (missing.length > 0) failures.push(`intent.products missing: ${missing.join(', ')}`);
    }
    if (ei.varieties) {
      const missing = ei.varieties.filter(
        (v) => !intent?.varieties.some((iv) => iv.toLowerCase() === v.toLowerCase()),
      );
      if (missing.length > 0) failures.push(`intent.varieties missing: ${missing.join(', ')}`);
    }
  }

  if (golden.timing_question_expected === true && intent?.timing_question !== true) {
    failures.push('timing_question not detected');
  }
  if (golden.dosage_question_expected === true && intent?.dosage_question !== true) {
    failures.push('dosage_question not detected');
  }

  // Fallback expectation
  if (golden.should_fallback === true && !usedFallback) {
    failures.push('expected fallback but got real answer');
  }
  if (golden.should_fallback === false && usedFallback) {
    failures.push('unexpected fallback — should have answered');
  }

  // Answer content checks (skip if fallback was expected)
  if (!golden.should_fallback) {
    const lower = answer.toLowerCase();
    if (golden.expected_answer_contains_all) {
      const missing = golden.expected_answer_contains_all.filter(
        (k) => !lower.includes(k.toLowerCase()),
      );
      if (missing.length > 0) failures.push(`answer missing all of: ${missing.join(', ')}`);
    }
    if (golden.expected_answer_contains_any && golden.expected_answer_contains_any.length > 0) {
      const found = golden.expected_answer_contains_any.some((k) =>
        lower.includes(k.toLowerCase()),
      );
      if (!found) {
        failures.push(
          `answer missing any of: ${golden.expected_answer_contains_any.join(', ')}`,
        );
      }
    }
  }

  return {
    id: golden.id,
    query: golden.query,
    pass: failures.length === 0,
    failures,
    metrics: {
      latency_ms: latency,
      top_similarity: topSim,
      retrieved_count: (chunks as unknown as unknown[]).length,
      answer_length: answer.length,
      used_agent: usedAgent,
      used_fallback: usedFallback,
    },
    intent,
    answer,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const goldenPath = join(__dirname, 'rag-golden-set.json');
  const golden = JSON.parse(readFileSync(goldenPath, 'utf8')) as GoldenSet;
  const queries = args.id
    ? golden.queries.filter((q) => q.id === args.id)
    : golden.queries;

  if (queries.length === 0) {
    console.error(`Geen queries gevonden${args.id ? ` voor id=${args.id}` : ''}`);
    process.exit(1);
  }

  const supabase = getServiceClient();
  const results: EvalResult[] = [];

  console.error(`\n🧪 RAG Eval — ${queries.length} queries\n`);

  for (const q of queries) {
    process.stderr.write(`▸ ${q.id} ... `);
    try {
      const result = await evalQuery(supabase, q);
      results.push(result);
      const icon = result.pass ? '✅' : '❌';
      const latency = `${Math.round(result.metrics.latency_ms)}ms`;
      const sim = result.metrics.top_similarity?.toFixed(3) ?? 'n/a';
      process.stderr.write(`${icon} ${latency} sim=${sim}\n`);
      if (!result.pass) {
        for (const f of result.failures) process.stderr.write(`   └─ ${f}\n`);
        if (args.verbose && result.answer) {
          process.stderr.write(`   Antwoord: ${result.answer.slice(0, 200)}…\n`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        id: q.id,
        query: q.query,
        pass: false,
        failures: [`runtime error: ${msg}`],
        metrics: {
          latency_ms: 0,
          top_similarity: null,
          retrieved_count: 0,
          answer_length: 0,
          used_agent: false,
          used_fallback: false,
        },
      });
      process.stderr.write(`💥 ${msg}\n`);
    }
  }

  // Summary
  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  const avgLatency = Math.round(
    results.reduce((s, r) => s + r.metrics.latency_ms, 0) / results.length,
  );

  console.error(`\n📊 Resultaat: ${passed}/${results.length} geslaagd (gem. ${avgLatency}ms)`);
  if (failed > 0) {
    console.error(`❌ ${failed} queries gefaald\n`);
  }

  // JSON rapport naar stdout zodat je het kunt pipen/savant
  console.log(JSON.stringify({ passed, failed, avgLatency, results }, null, 2));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Eval fout:', err);
  process.exit(1);
});
