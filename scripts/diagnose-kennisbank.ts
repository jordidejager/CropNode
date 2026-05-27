#!/usr/bin/env tsx
/**
 * Diagnose-script: scan alle knowledge_* tabellen op anomalieën.
 *
 * Categorieën:
 *   1. knowledge_articles — incomplete velden, slechte content, lege metadata
 *   2. knowledge_disease_profile — onvolledige profielen, mismatches
 *   3. knowledge_product_profile — schaarse profielen
 *   4. knowledge_product_advice — overlappende rijen, bad timing
 *   5. Cross-table — orphans, broken refs
 *
 * Output: gestructureerd rapport naar stdout. Geen DB writes.
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local', override: true });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

interface Finding {
  category: string;
  severity: 'high' | 'medium' | 'low';
  count: number;
  description: string;
  examples?: string[];
  fixSuggestion?: string;
}

const findings: Finding[] = [];

function add(f: Finding) {
  findings.push(f);
}

// ============================================
// Knowledge articles
// ============================================

async function checkArticles() {
  console.log('🔍 knowledge_articles...');

  // Fetch all published articles
  const { data: all, count } = await supabase
    .from('knowledge_articles')
    .select('id, title, content, summary, category, subcategory, knowledge_type, crops, products_mentioned, public_source_ref, status, transform_model, valid_until, content_hash', { count: 'exact' })
    .neq('status', 'archived');

  if (!all) return;
  console.log(`   ${count} actieve artikelen totaal`);

  // 1. Lege of korte content
  const shortContent = all.filter((a: any) => !a.content || a.content.length < 100);
  if (shortContent.length > 0) {
    add({
      category: 'articles.content',
      severity: 'high',
      count: shortContent.length,
      description: 'Artikelen met te korte content (<100 chars)',
      examples: shortContent.slice(0, 3).map((a: any) => `${a.title.slice(0, 50)} (${a.content?.length ?? 0} chars)`),
      fixSuggestion: 'UPDATE status=archived OF re-scrape',
    });
  }

  // 2. Lege summary
  const noSummary = all.filter((a: any) => !a.summary || a.summary.length < 10);
  if (noSummary.length > 0) {
    add({
      category: 'articles.summary',
      severity: 'medium',
      count: noSummary.length,
      description: 'Artikelen zonder summary',
      examples: noSummary.slice(0, 3).map((a: any) => a.title.slice(0, 50)),
    });
  }

  // 3. Crops leeg
  const noCrops = all.filter((a: any) => !a.crops || a.crops.length === 0);
  if (noCrops.length > 0) {
    add({
      category: 'articles.crops',
      severity: 'medium',
      count: noCrops.length,
      description: 'Artikelen zonder crop-tagging — verschijnen niet in crop-filters',
      examples: noCrops.slice(0, 3).map((a: any) => a.title.slice(0, 50)),
      fixSuggestion: 'Per artikel: detect crop uit content, of default [appel, peer]',
    });
  }

  // 4. Categorisering buiten verwacht enum
  const validCats = ['ziekte', 'plaag', 'abiotisch', 'bemesting', 'snoei', 'dunning', 'bewaring', 'certificering', 'algemeen', 'rassenkeuze', 'bodem', 'watermanagement', 'gewasbescherming', 'middelen', 'productie', 'oogst'];
  const badCat = all.filter((a: any) => a.category && !validCats.includes(a.category));
  if (badCat.length > 0) {
    add({
      category: 'articles.category',
      severity: 'medium',
      count: badCat.length,
      description: 'Onbekende category waarde',
      examples: badCat.slice(0, 5).map((a: any) => `${a.title.slice(0, 30)} → category="${a.category}"`),
    });
  }

  // 5. Bronvermeldingen in content (NOOIT mag staan).
  // CTGB is een officiële autoriteit, geen bronlek — die mag wel.
  const sourceMentioned = all.filter((a: any) => {
    const c = a.content?.toLowerCase() ?? '';
    return /fruitconsult|delphy|advies van |advies door |nft[- ]?fruit|wgf[- ]?fruit|groenkennisnet|de adviseur/.test(c);
  });
  if (sourceMentioned.length > 0) {
    add({
      category: 'articles.source-leak',
      severity: 'high',
      count: sourceMentioned.length,
      description: 'Artikelen die bronnaam in content noemen (verboden — moet anoniem)',
      examples: sourceMentioned.slice(0, 5).map((a: any) => a.title.slice(0, 50)),
      fixSuggestion: 'Run script om brontermen uit content te strippen',
    });
  }

  // 6. Temporal references in content
  const temporal = all.filter((a: any) => {
    const c = a.content?.toLowerCase() ?? '';
    return /vanaf morgen|komende dagen|volgende week|vandaag|gisteren|afgelopen weekend|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag/.test(c);
  });
  if (temporal.length > 0) {
    add({
      category: 'articles.temporal-leak',
      severity: 'high',
      count: temporal.length,
      description: 'Artikelen met temporal references (vanaf morgen / volgende week / weekdagen)',
      examples: temporal.slice(0, 5).map((a: any) => {
        const c = a.content?.toLowerCase() ?? '';
        const m = c.match(/(vanaf morgen|komende dagen|volgende week|vandaag|gisteren|afgelopen weekend|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)/);
        return `${a.title.slice(0, 30)} → "${m?.[1] ?? '?'}"`;
      }),
      fixSuggestion: 'Re-transform via Claude (heldere temporal-prompt) OF SQL find/replace',
    });
  }

  // 7. Onfatsoenlijk lange products_mentioned (vermoedelijk slechte parsing)
  const tooManyProducts = all.filter((a: any) => (a.products_mentioned ?? []).length > 30);
  if (tooManyProducts.length > 0) {
    add({
      category: 'articles.products-bloat',
      severity: 'low',
      count: tooManyProducts.length,
      description: 'Artikelen met > 30 products_mentioned (vermoedelijk slechte parsing)',
      examples: tooManyProducts.slice(0, 3).map((a: any) => `${a.title.slice(0, 30)} → ${a.products_mentioned.length} producten`),
    });
  }

  // 8. Vervaldatum in verleden (oud advies dat nog published is)
  const today = new Date().toISOString().slice(0, 10);
  const expired = all.filter((a: any) => a.valid_until && a.valid_until < today && a.status === 'published');
  if (expired.length > 0) {
    add({
      category: 'articles.expired',
      severity: 'medium',
      count: expired.length,
      description: 'Published artikelen met valid_until in verleden',
      examples: expired.slice(0, 5).map((a: any) => `${a.title.slice(0, 30)} valid_until=${a.valid_until}`),
      fixSuggestion: 'Status=archived voor deze artikelen',
    });
  }

  // 9. Duplicate content_hash (zou onmogelijk moeten zijn maar)
  const hashCounts: Record<string, number> = {};
  for (const a of all as any[]) {
    if (a.content_hash) hashCounts[a.content_hash] = (hashCounts[a.content_hash] ?? 0) + 1;
  }
  const dupHashes = Object.entries(hashCounts).filter(([, n]) => n > 1);
  if (dupHashes.length > 0) {
    add({
      category: 'articles.duplicate-hash',
      severity: 'low',
      count: dupHashes.length,
      description: 'Identieke content_hash op meerdere rijen',
    });
  }

  // 10. Transform model verdeling
  const modelCounts: Record<string, number> = {};
  for (const a of all as any[]) {
    const m = a.transform_model ?? '(geen — pre-tracking)';
    modelCounts[m] = (modelCounts[m] ?? 0) + 1;
  }
  console.log(`   Transform model: ${JSON.stringify(modelCounts)}`);
}

// ============================================
// Disease profiles
// ============================================

async function checkDiseaseProfiles() {
  console.log('🔍 knowledge_disease_profile...');
  const { data: all } = await supabase.from('knowledge_disease_profile').select('*');
  if (!all) return;
  console.log(`   ${all.length} profielen totaal`);

  // 1. Profielen zonder description
  const noDesc = all.filter((p: any) => !p.description || p.description.length < 20);
  if (noDesc.length > 0) {
    add({
      category: 'disease.no-description',
      severity: 'medium',
      count: noDesc.length,
      description: 'Disease profielen zonder description',
      examples: noDesc.slice(0, 5).map((p: any) => p.name),
    });
  }

  // 2. Geen symptomen
  const noSym = all.filter((p: any) => !p.symptoms || p.symptoms.length < 20);
  if (noSym.length > 0) {
    add({
      category: 'disease.no-symptoms',
      severity: 'medium',
      count: noSym.length,
      description: 'Disease profielen zonder symptomen-beschrijving',
      examples: noSym.slice(0, 5).map((p: any) => p.name),
    });
  }

  // 3. Geen lifecycle voor ECHTE plagen/ziektes (groeiregulatie/abiotisch hoeft niet)
  const noLifecycle = all.filter(
    (p: any) =>
      ['ziekte', 'plaag'].includes(p.profile_type) &&
      (!p.lifecycle_notes || p.lifecycle_notes.length < 30),
  );
  if (noLifecycle.length > 0) {
    add({
      category: 'disease.no-lifecycle',
      severity: 'high',
      count: noLifecycle.length,
      description: 'Plagen/ziektes zonder levenscyclus (gebruikers vragen hier specifiek naar)',
      examples: noLifecycle.slice(0, 5).map((p: any) => p.name),
      fixSuggestion: 'Re-run scripts/enrich-disease-profiles.ts met Claude',
    });
  }

  // 4. Crops mismatch met profile_type
  const noCrops = all.filter((p: any) => !p.crops || p.crops.length === 0);
  if (noCrops.length > 0) {
    add({
      category: 'disease.no-crops',
      severity: 'medium',
      count: noCrops.length,
      description: 'Profielen zonder crops (worden niet getoond bij gewas-filter)',
      examples: noCrops.slice(0, 5).map((p: any) => `${p.name} (type=${p.profile_type})`),
    });
  }

  // 5. Peak_months helemaal leeg
  const noPeak = all.filter((p: any) => !p.peak_months || p.peak_months.length === 0);
  if (noPeak.length > 0) {
    add({
      category: 'disease.no-peak-months',
      severity: 'low',
      count: noPeak.length,
      description: 'Profielen zonder peak_months (verschijnen nooit "NU ACTIEF")',
      examples: noPeak.slice(0, 5).map((p: any) => p.name),
    });
  }

  // 6. Profile_type counts
  const typeCounts: Record<string, number> = {};
  for (const p of all as any[]) {
    typeCounts[p.profile_type ?? '(null)'] = (typeCounts[p.profile_type ?? '(null)'] ?? 0) + 1;
  }
  console.log(`   profile_type: ${JSON.stringify(typeCounts)}`);

  // 7. Aliases array — leeg voor key profielen?
  const importantNoAliases = all.filter((p: any) => {
    const importantNames = ['schurft', 'perenbladvlo', 'vruchtboomkanker', 'meeldauw', 'fruitmot', 'bacterievuur'];
    return importantNames.includes(p.name.toLowerCase()) && (!p.aliases || p.aliases.length === 0);
  });
  if (importantNoAliases.length > 0) {
    add({
      category: 'disease.no-aliases',
      severity: 'medium',
      count: importantNoAliases.length,
      description: 'Hoofd-ziekten zonder aliases (synoniemen-lookup werkt niet)',
      examples: importantNoAliases.map((p: any) => p.name),
      fixSuggestion: 'Run migratie 079 indien nog niet gebeurd',
    });
  }
}

// ============================================
// Product profiles
// ============================================

async function checkProductProfiles() {
  console.log('🔍 knowledge_product_profile...');
  const { data: all } = await supabase.from('knowledge_product_profile').select('*');
  if (!all) {
    add({
      category: 'product.missing-table',
      severity: 'high',
      count: 0,
      description: 'knowledge_product_profile tabel bestaat niet (migratie 080 draaien)',
    });
    return;
  }
  console.log(`   ${all.length} middelen totaal`);

  // 1. Lege strategy_summary
  const noStrategy = all.filter((p: any) => !p.strategy_summary || p.strategy_summary.length < 20);
  if (noStrategy.length > 0) {
    add({
      category: 'product.no-strategy',
      severity: 'medium',
      count: noStrategy.length,
      description: 'Middel-profielen zonder strategy_summary',
      examples: noStrategy.slice(0, 5).map((p: any) => p.product_name),
    });
  }

  // 2. Geen target_organisms — alleen verwacht bij fungiciden/insecticiden/acariciden.
  // Groeiregulatoren, meststoffen, bioagens hebben legitiem geen "doelorganisme".
  const requiresTarget = ['fungicide', 'insecticide', 'acaricide', 'herbicide'];
  const noTargets = all.filter(
    (p: any) =>
      requiresTarget.includes(p.product_type) &&
      (!p.target_organisms || p.target_organisms.length === 0),
  );
  if (noTargets.length > 0) {
    add({
      category: 'product.no-targets',
      severity: 'high',
      count: noTargets.length,
      description: 'Fungi-/insecti-/acari-/herbiciden zonder doelorganismen',
      examples: noTargets.slice(0, 5).map((p: any) => `${p.product_name} (${p.product_type})`),
    });
  }

  // 3. Geen crops
  const noCrops = all.filter((p: any) => !p.crops || p.crops.length === 0);
  if (noCrops.length > 0) {
    add({
      category: 'product.no-crops',
      severity: 'medium',
      count: noCrops.length,
      description: 'Middelen zonder crops',
      examples: noCrops.slice(0, 5).map((p: any) => p.product_name),
    });
  }

  // 4. Spuit-omstandigheden helemaal leeg
  const noConds = all.filter((p: any) =>
    p.optimal_temp_min === null && p.optimal_humidity_min === null &&
    p.wind_speed_max_ms === null && p.delta_t_min === null
  );
  if (noConds.length > 0) {
    add({
      category: 'product.no-conditions',
      severity: 'low',
      count: noConds.length,
      description: 'Middelen zonder enige spuit-omstandigheid (temp/RH/wind/deltaT allemaal null)',
      examples: noConds.slice(0, 5).map((p: any) => p.product_name),
    });
  }
}

// ============================================
// Product advice
// ============================================

async function checkProductAdvice() {
  console.log('🔍 knowledge_product_advice...');
  const { data: all } = await supabase.from('knowledge_product_advice').select('*');
  if (!all) return;
  console.log(`   ${all.length} advies-rijen totaal`);

  // 1. Identieke (product, target, crop) — duplicates
  const seen = new Map<string, number>();
  for (const r of all as any[]) {
    const k = `${(r.product_name ?? '').toLowerCase()}|${(r.target_name ?? '').toLowerCase()}|${(r.crop ?? '').toLowerCase()}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  const dups = Array.from(seen.entries()).filter(([, n]) => n > 1);
  if (dups.length > 0) {
    add({
      category: 'advice.duplicates',
      severity: 'medium',
      count: dups.length,
      description: 'Duplicate (product × target × crop) combinaties — UI toont ze dubbel',
      examples: dups.slice(0, 5).map(([k, n]) => `${k} (${n}×)`),
      fixSuggestion: 'GROUP BY + keep oldest of highest source_article_count',
    });
  }

  // 2. Geen dosering
  const noDos = (all as any[]).filter((r) => !r.dosage || r.dosage.length < 2);
  if (noDos.length > 0) {
    add({
      category: 'advice.no-dosage',
      severity: 'low',
      count: noDos.length,
      description: 'Adviezen zonder dosering (verschijnen leeg in tabel)',
    });
  }
}

// ============================================
// Cross-table checks
// ============================================

async function checkCrossRefs() {
  console.log('🔍 Cross-table...');

  // Disease profile names die in geen enkel knowledge_article voorkomen
  const { data: profs } = await supabase.from('knowledge_disease_profile').select('name');
  const { data: arts } = await supabase.from('knowledge_articles').select('subcategory, title').eq('status', 'published');
  if (profs && arts) {
    const allText = (arts as any[]).map((a) => `${a.title ?? ''} ${a.subcategory ?? ''}`.toLowerCase()).join(' | ');
    const orphan = (profs as any[]).filter((p) => !allText.includes(p.name.toLowerCase()));
    if (orphan.length > 0) {
      add({
        category: 'crossref.orphan-profile',
        severity: 'low',
        count: orphan.length,
        description: 'Disease profielen zonder gerelateerde gepubliceerde artikelen',
        examples: orphan.slice(0, 10).map((p: any) => p.name),
      });
    }
  }
}

// ============================================
// Render rapport
// ============================================

function renderReport() {
  console.log('\n\n📋 KENNISBANK DIAGNOSE RAPPORT\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  const bySev = { high: [] as Finding[], medium: [] as Finding[], low: [] as Finding[] };
  for (const f of findings) bySev[f.severity].push(f);

  for (const sev of ['high', 'medium', 'low'] as const) {
    const items = bySev[sev];
    if (items.length === 0) continue;
    const icon = { high: '🔴', medium: '🟡', low: '🟢' }[sev];
    console.log(`${icon} ${sev.toUpperCase()} (${items.length})\n`);
    for (const f of items) {
      console.log(`  [${f.category}]  n=${f.count}`);
      console.log(`     ${f.description}`);
      if (f.examples && f.examples.length > 0) {
        for (const e of f.examples) console.log(`       · ${e}`);
      }
      if (f.fixSuggestion) console.log(`     ➤ ${f.fixSuggestion}`);
      console.log('');
    }
  }

  if (findings.length === 0) {
    console.log('✅ Geen anomalieën gevonden!\n');
  } else {
    console.log(`\n📊 Totaal: ${findings.length} bevindingen — ${bySev.high.length} high, ${bySev.medium.length} medium, ${bySev.low.length} low\n`);
  }
}

async function main() {
  console.log('🔬 Kennisbank diagnose starten...\n');
  await checkArticles();
  await checkDiseaseProfiles();
  await checkProductProfiles();
  await checkProductAdvice();
  await checkCrossRefs();
  renderReport();
}

main().catch((e) => {
  console.error('💥', e);
  process.exit(1);
});
