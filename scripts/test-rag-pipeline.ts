#!/usr/bin/env npx tsx
/**
 * Automated RAG pipeline test — fires test questions against the chat API
 * and checks if the answers meet expectations.
 *
 * Usage:
 *   npm run test:rag                    # run all tests
 *   npm run test:rag -- --only pyrus    # run only tests matching "pyrus"
 *   npm run test:rag -- --verbose       # show full answer text
 *
 * Requires: npm run dev running on localhost:3000
 */

// Force IPv4 for Supabase
import { setDefaultResultOrder } from 'node:dns';
try { setDefaultResultOrder('ipv4first'); } catch {}

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
const args = process.argv.slice(2);
const onlyFilter = args.find(a => a !== '--verbose' && !a.startsWith('--only'))
  ?? args.find((_, i) => args[i - 1] === '--only');
const verbose = args.includes('--verbose');

// ============================================
// Test definitions
// ============================================

interface TestCase {
  name: string;
  query: string;
  /** Strings that MUST appear in the answer (case-insensitive) */
  expectContains?: string[];
  /** Strings that must NOT appear in the answer */
  expectNotContains?: string[];
  /** Expect at least N sources */
  expectMinSources?: number;
  /** Expect CTGB annotations containing these product names */
  expectCtgbProducts?: string[];
  /** Expect CTGB annotations with this status for a product */
  expectCtgbStatus?: { product: string; status: 'TOEGELATEN' | 'VERVALLEN' | 'TWIJFEL' | 'ONBEKEND' };
  /** If true, the answer should NOT be a fallback/rejection */
  expectAnswer?: boolean;
}

const tests: TestCase[] = [
  {
    name: 'Pyrus curatief → moet Scala info geven',
    query: 'Hoelang kun je Pyrus gebruiken voor curatieve behandeling na infectie?',
    expectContains: ['48 uur', 'scala'],
    expectNotContains: ['staat niet in onze kennisbank', 'geen informatie'],
    expectAnswer: true,
    expectMinSources: 2,
    expectCtgbProducts: ['Scala'],
  },
  {
    name: 'Topsin M → moet VERVALLEN tonen',
    query: 'Mag ik Topsin M gebruiken?',
    expectAnswer: true,
    expectNotContains: ['verbindingsprobleem', 'geen informatie'],
    expectCtgbStatus: { product: 'Topsin M', status: 'VERVALLEN' },
  },
  {
    name: 'GA47 informatie → moet teelttechniek artikelen vinden',
    query: 'ga47 informatie',
    expectAnswer: true,
    expectNotContains: ['valt buiten', 'off_topic', 'geen informatie'],
    expectContains: ['ga4/7'],
    expectMinSources: 3,
  },
  {
    name: 'Schurft nu → rijk antwoord zonder temporele vervuiling',
    query: 'Wat nu te doen tegen schurft in appels?',
    expectAnswer: true,
    expectContains: ['captan', 'preventie'],
    expectNotContains: ['woensdag', 'dinsdag', 'maandag', 'volgende week', 'FruitConsult'],
    expectMinSources: 3,
  },
  {
    name: 'Sercadis schurft + meeldauw → dubbelwerking',
    query: 'Heeft Sercadis een goede werking tegen zowel schurft als meeldauw?',
    expectAnswer: true,
    expectContains: ['sercadis'],
    expectMinSources: 2,
    expectCtgbProducts: ['Sercadis'],
  },
  {
    name: 'Conference spuiten → geen off_topic',
    query: 'Wanneer ga47 op Conference spuiten?',
    expectAnswer: true,
    expectNotContains: ['valt buiten', 'geen informatie'],
    expectMinSources: 1,
  },
  {
    name: 'Off-topic test → kunstmest tomaten',
    query: 'Welke kunstmest voor tomaten?',
    expectContains: ['valt buiten'],
    expectAnswer: false,
  },
];

// ============================================
// Runner
// ============================================

interface ParsedResponse {
  answerText: string;
  sources: Array<{ title: string; category: string }>;
  ctgbAnnotations: Array<{ product: string; status: string; toelatingsnummer?: string }>;
  events: unknown[];
  error: string | null;
}

async function runQuery(query: string): Promise<ParsedResponse> {
  const result: ParsedResponse = {
    answerText: '',
    sources: [],
    ctgbAnnotations: [],
    events: [],
    error: null,
  };

  try {
    const res = await fetch(`${BASE_URL}/api/knowledge/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) {
      result.error = `HTTP ${res.status}: ${await res.text().catch(() => '')}`;
      return result;
    }

    const text = await res.text();
    const lines = text.split('\n\n').filter(l => l.startsWith('data: '));

    for (const line of lines) {
      try {
        const event = JSON.parse(line.slice(6));
        result.events.push(event);

        if (event.type === 'answer_chunk' && event.text) {
          result.answerText += event.text;
        }
        if (event.type === 'sources' && event.chunks) {
          result.sources = event.chunks.map((c: any) => ({
            title: c.title,
            category: `${c.category}/${c.subcategory ?? ''}`,
          }));
        }
        if (event.type === 'ctgb_annotation' && event.annotations) {
          result.ctgbAnnotations = event.annotations.map((a: any) => ({
            product: a.product,
            status: a.status,
            toelatingsnummer: a.toelatingsnummer,
          }));
        }
        if (event.type === 'error') {
          result.error = event.message;
        }
      } catch {
        // ignore malformed
      }
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }

  return result;
}

function checkTest(test: TestCase, result: ParsedResponse): { pass: boolean; failures: string[] } {
  const failures: string[] = [];
  const answerLower = result.answerText.toLowerCase();

  if (result.error) {
    failures.push(`Error: ${result.error}`);
  }

  if (test.expectAnswer === true) {
    const rejectionPhrases = [
      'staat niet in onze kennisbank',
      'geen informatie over',
      'valt buiten onze kennisbank',
      'verbindingsprobleem',
    ];
    for (const phrase of rejectionPhrases) {
      if (answerLower.includes(phrase)) {
        failures.push(`Antwoord is een afwijzing: bevat "${phrase}"`);
      }
    }
  }

  if (test.expectAnswer === false) {
    // Should be a rejection
    if (result.answerText && !['valt buiten', 'geen informatie', 'niet in onze kennisbank', 'off_topic'].some(p => answerLower.includes(p))) {
      failures.push('Verwachtte een afwijzing maar kreeg een inhoudelijk antwoord');
    }
  }

  if (test.expectContains) {
    for (const s of test.expectContains) {
      if (!answerLower.includes(s.toLowerCase())) {
        failures.push(`Antwoord mist verwacht woord: "${s}"`);
      }
    }
  }

  if (test.expectNotContains) {
    for (const s of test.expectNotContains) {
      if (answerLower.includes(s.toLowerCase())) {
        failures.push(`Antwoord bevat ongewenst woord: "${s}"`);
      }
    }
  }

  if (test.expectMinSources && result.sources.length < test.expectMinSources) {
    failures.push(`Verwachtte minstens ${test.expectMinSources} bronnen, kreeg ${result.sources.length}`);
  }

  if (test.expectCtgbProducts) {
    for (const prod of test.expectCtgbProducts) {
      const found = result.ctgbAnnotations.some(a =>
        a.product.toLowerCase().includes(prod.toLowerCase())
      );
      if (!found) {
        failures.push(`CTGB check mist product: "${prod}" (gevonden: ${result.ctgbAnnotations.map(a => a.product).join(', ') || 'geen'})`);
      }
    }
  }

  if (test.expectCtgbStatus) {
    const { product, status } = test.expectCtgbStatus;
    const annotation = result.ctgbAnnotations.find(a =>
      a.product.toLowerCase().includes(product.toLowerCase())
    );
    if (!annotation) {
      failures.push(`CTGB: verwachtte "${product}" met status ${status}, maar product niet in annotaties`);
    } else if (!annotation.status.toUpperCase().includes(status)) {
      failures.push(`CTGB: "${product}" heeft status "${annotation.status}", verwachtte "${status}"`);
    }
  }

  return { pass: failures.length === 0, failures };
}

// ============================================
// Main
// ============================================

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   RAG Pipeline Test Suite                ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`Target: ${BASE_URL}`);
  console.log('');

  const activeTests = onlyFilter
    ? tests.filter(t => t.name.toLowerCase().includes(onlyFilter.toLowerCase()))
    : tests;

  if (activeTests.length === 0) {
    console.log(`Geen tests gevonden voor filter "${onlyFilter}"`);
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;

  for (const test of activeTests) {
    process.stdout.write(`  ${test.name}... `);
    const startMs = Date.now();
    const result = await runQuery(test.query);
    const elapsed = Date.now() - startMs;

    const check = checkTest(test, result);

    if (check.pass) {
      console.log(`✅ PASS (${elapsed}ms, ${result.sources.length} bronnen)`);
      passed++;
    } else {
      console.log(`❌ FAIL (${elapsed}ms)`);
      for (const f of check.failures) {
        console.log(`     ↳ ${f}`);
      }
      failed++;
    }

    if (verbose || !check.pass) {
      const preview = result.answerText.slice(0, 200).replace(/\n/g, ' ');
      console.log(`     Antwoord: "${preview}${result.answerText.length > 200 ? '...' : ''}"`);
      if (result.ctgbAnnotations.length > 0) {
        console.log(`     CTGB: ${result.ctgbAnnotations.map(a => `${a.product}=${a.status}`).join(', ')}`);
      }
    }

    console.log('');
  }

  console.log('════════════════════════════════════════════');
  console.log(`  ${passed} passed, ${failed} failed, ${activeTests.length} total`);
  console.log('════════════════════════════════════════════');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
