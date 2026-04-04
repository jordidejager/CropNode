/**
 * enrich-fertilizers.ts — Auto-generate descriptions for fertilizers
 *
 * Generates Dutch descriptions based on composition, category, and manufacturer.
 * Only fills in products that don't already have a description.
 *
 * Usage:
 *   npx tsx scripts/enrich-fertilizers.ts              # Run
 *   npx tsx scripts/enrich-fertilizers.ts --dry-run    # Preview
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
config({ path: resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const isDryRun = process.argv.includes('--dry-run');

function supabaseGet(path: string): any {
  const result = execSync(
    `curl -s --max-time 30 "${SUPABASE_URL}/rest/v1/${path}" -H "apikey: ${SUPABASE_KEY}" -H "Authorization: Bearer ${SUPABASE_KEY}"`,
    { encoding: 'utf-8', timeout: 40000 }
  );
  return JSON.parse(result);
}

function supabasePatch(id: string, data: any): boolean {
  const tmpFile = join(tmpdir(), `sb-fert-${Date.now()}.json`);
  writeFileSync(tmpFile, JSON.stringify(data));
  try {
    execSync(
      `curl -s --max-time 30 -X PATCH "${SUPABASE_URL}/rest/v1/fertilizers?id=eq.${encodeURIComponent(id)}" ` +
      `-H "apikey: ${SUPABASE_KEY}" -H "Authorization: Bearer ${SUPABASE_KEY}" ` +
      `-H "Content-Type: application/json" -H "Prefer: return=minimal" -d @${tmpFile}`,
      { encoding: 'utf-8', timeout: 40000 }
    );
    return true;
  } catch { return false; }
  finally { try { unlinkSync(tmpFile); } catch {} }
}

// Element names in Dutch
const elementNames: Record<string, string> = {
  N: 'stikstof', P: 'fosfor', P2O5: 'fosfaat', K: 'kalium', K2O: 'kali',
  CaO: 'calcium', Ca: 'calcium', MgO: 'magnesium', Mg: 'magnesium',
  S: 'zwavel', SO3: 'zwavel', Fe: 'ijzer', Mn: 'mangaan', Zn: 'zink',
  Cu: 'koper', B: 'borium', Mo: 'molybdeen', Co: 'kobalt', Si: 'silicium',
  Na: 'natrium', Cl: 'chloor', Se: 'seleen',
};

function generateDescription(f: any): string {
  const comp = f.composition || {};
  const elements = Object.entries(comp)
    .filter(([_, v]) => v != null && (v as number) > 0)
    .map(([k, v]) => ({ element: k, value: v as number, name: elementNames[k] || k }))
    .sort((a, b) => b.value - a.value);

  const category = f.category === 'Leaf' ? 'Bladmeststof' : f.category === 'Soil' ? 'Bodemmeststof' : 'Fertigatiemeststof';
  const manufacturer = f.manufacturer ? ` van ${f.manufacturer}` : '';

  if (elements.length === 0) {
    return `${category}${manufacturer}.`;
  }

  // Identify main elements
  const mainElements = elements.slice(0, 3).map(e => e.name);

  // NPK check
  const hasN = comp.N != null;
  const hasP = comp.P != null || comp.P2O5 != null;
  const hasK = comp.K != null || comp.K2O != null;
  const nVal = comp.N || 0;
  const pVal = comp.P2O5 || comp.P || 0;
  const kVal = comp.K2O || comp.K || 0;

  if (hasN && hasP && hasK) {
    const microStr = elements.filter(e => !['N', 'P', 'P2O5', 'K', 'K2O'].includes(e.element)).length > 0
      ? ' met sporenelementen' : '';
    return `${category}${manufacturer} met NPK ${nVal}-${pVal}-${kVal}${microStr}. ${f.unit === 'L' ? 'Vloeibaar.' : 'Korrel/granulaat.'}`;
  }

  // Single or dual element
  const elementStr = mainElements.join(', ');
  const formStr = f.unit === 'L' ? 'Vloeibare' : 'Granulaat';
  return `${formStr} ${category.toLowerCase()}${manufacturer} op basis van ${elementStr}.`;
}

function generateDosageFruit(f: any): string | null {
  const comp = f.composition || {};
  const category = f.category;

  if (category === 'Leaf') {
    // Generic leaf fertilizer dosage
    if (comp.CaO || comp.Ca) return '2-5 L/ha per bespuiting, 4-10 toepassingen per seizoen.';
    if (comp.B) return '0.5-2 L/ha per bespuiting, 2-4 toepassingen.';
    if (comp.Fe || comp.Mn || comp.Zn) return '1-3 L/ha per bespuiting, 2-4 toepassingen.';
    if (comp.MgO || comp.Mg) return '2-5 L/ha per bespuiting, 2-4 toepassingen.';
    return '1-5 L/ha per bespuiting (dosering afhankelijk van product en teelt).';
  }

  if (category === 'Soil') {
    if (comp.N && (comp.N as number) > 20) return '200-400 kg/ha per toediening, afhankelijk van bodemanalyse.';
    if (comp.K2O || comp.K) return '150-300 kg/ha afhankelijk van K-status bodem.';
    if (comp.P2O5 || comp.P) return '100-250 kg/ha afhankelijk van P-status bodem.';
    if (comp.CaO || comp.Ca) return '500-2000 kg/ha afhankelijk van pH en Ca-status.';
    return '100-400 kg/ha (dosering afhankelijk van bodemanalyse).';
  }

  return null;
}

async function main() {
  console.log('🌿 Fertilizer Enrichment');
  console.log(`   Dry run: ${isDryRun}\n`);

  // Fetch all fertilizers without description
  const ferts: any[] = [];
  let offset = 0;
  while (true) {
    try {
      const data = supabaseGet(`fertilizers?description=is.null&select=id,name,manufacturer,category,unit,composition&order=name&offset=${offset}&limit=500`);
      if (!data || data.length === 0) break;
      ferts.push(...data);
      if (data.length < 500) break;
      offset += 500;
    } catch (err: any) {
      console.error(`  Fetch error: ${err.message}`);
      break;
    }
  }

  console.log(`  Found ${ferts.length} fertilizers without description\n`);

  let updated = 0;
  let failed = 0;

  for (const f of ferts) {
    const description = generateDescription(f);
    const dosageFruit = generateDosageFruit(f);

    if (isDryRun) {
      if (updated < 10) {
        console.log(`  [${f.category}] ${f.name}`);
        console.log(`    → ${description}`);
        if (dosageFruit) console.log(`    → Dosering: ${dosageFruit}`);
      }
      updated++;
      continue;
    }

    const updateData: any = { description };
    if (dosageFruit) updateData.dosage_fruit = dosageFruit;

    const success = supabasePatch(f.id, updateData);
    if (success) { updated++; } else { failed++; }

    process.stdout.write(`\r  Updated: ${updated}/${ferts.length}`);
  }

  console.log(`\n\n  ✅ Done: ${updated} enriched, ${failed} failed`);
  if (isDryRun) console.log('  (DRY RUN — no changes written)');
}

main().catch(console.error);
