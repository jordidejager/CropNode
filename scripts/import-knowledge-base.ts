#!/usr/bin/env npx tsx
/**
 * Knowledge Base Import Script
 *
 * Parses all factsheet .md files from knowledge-base/factsheets/
 * and imports them into the Supabase kennisbank tables.
 *
 * Usage:
 *   npx tsx scripts/import-knowledge-base.ts
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY from .env.local to bypass RLS.
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/** Retry a function up to maxRetries times with delay */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, delayMs = 1000): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      console.warn(`    ↻ Retry ${attempt}/${maxRetries} after error...`);
      await new Promise(r => setTimeout(r, delayMs * attempt));
    }
  }
  throw new Error('unreachable');
}

/** Small delay between operations to avoid connection issues */
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// ============================================
// CONSTANTS
// ============================================

const STANDARD_PHASES = [
  'winterrust', 'knopzwelling', 'groen-puntje', 'muizenoor',
  'volle-bloei', 'bloembladval', 'vruchtzetting', 'junirui',
  'celstrekking', 'oogst', 'bladval', 'na-oogst',
] as const;

const PHASE_ORDER: Record<string, number> = {};
STANDARD_PHASES.forEach((p, i) => { PHASE_ORDER[p] = i + 1; });

const CATEGORY_MAP: Record<string, { category: string; subcategory: string }> = {
  // Schimmelziekten
  schurft:           { category: 'Ziekten & Plagen', subcategory: 'Schimmelziekten' },
  meeldauw:          { category: 'Ziekten & Plagen', subcategory: 'Schimmelziekten' },
  vruchtboomkanker:  { category: 'Ziekten & Plagen', subcategory: 'Schimmelziekten' },
  stemphylium:       { category: 'Ziekten & Plagen', subcategory: 'Schimmelziekten' },
  alternaria:        { category: 'Ziekten & Plagen', subcategory: 'Schimmelziekten' },
  monilia:           { category: 'Ziekten & Plagen', subcategory: 'Schimmelziekten' },
  vruchtrot:         { category: 'Ziekten & Plagen', subcategory: 'Schimmelziekten' },
  vlekkenziekte:     { category: 'Ziekten & Plagen', subcategory: 'Schimmelziekten' },
  roetdauw:          { category: 'Ziekten & Plagen', subcategory: 'Schimmelziekten' },
  // Bacteriën
  bacterievuur:      { category: 'Ziekten & Plagen', subcategory: 'Bacteriën' },
  // Insecten
  perenbladvlo:      { category: 'Ziekten & Plagen', subcategory: 'Insecten' },
  bloedluis:         { category: 'Ziekten & Plagen', subcategory: 'Insecten' },
  fruitmot:          { category: 'Ziekten & Plagen', subcategory: 'Insecten' },
  luis:              { category: 'Ziekten & Plagen', subcategory: 'Insecten' },
  wants:             { category: 'Ziekten & Plagen', subcategory: 'Insecten' },
  appelbloesemkever: { category: 'Ziekten & Plagen', subcategory: 'Insecten' },
  // Mijten
  spint:             { category: 'Ziekten & Plagen', subcategory: 'Mijten' },
  // Teelt
  dunning:              { category: 'Teelt', subcategory: 'Vruchtzetting & Groei' },
  vruchtzetting:        { category: 'Teelt', subcategory: 'Vruchtzetting & Groei' },
  bloemknopvorming:     { category: 'Teelt', subcategory: 'Vruchtzetting & Groei' },
  bestuiving:           { category: 'Teelt', subcategory: 'Vruchtzetting & Groei' },
  groeregulatie:        { category: 'Teelt', subcategory: 'Vruchtzetting & Groei' },
  snoei_en_boomvorming: { category: 'Teelt', subcategory: 'Snoei & Vorming' },
  rassenkeuze:          { category: 'Teelt', subcategory: 'Rassenkeuze' },
  onderstammen:         { category: 'Teelt', subcategory: 'Aanplant' },
  bewaarbaarheid:       { category: 'Oogst & Bewaring', subcategory: 'Bewaring' },
};

/** Extra keywords per slug for search */
const EXTRA_KEYWORDS: Record<string, string[]> = {
  schurft:           ['venturia', 'inaequalis', 'pirina', 'scab'],
  meeldauw:          ['podosphaera', 'leucotricha', 'powdery mildew'],
  vruchtboomkanker:  ['neonectria', 'ditissima', 'nectria', 'canker'],
  stemphylium:       ['stemphylium', 'vesicarium', 'zwartvruchtrot'],
  alternaria:        ['alternaria', 'alternariose'],
  monilia:           ['monilinia', 'fructigena', 'laxa', 'brown rot'],
  vruchtrot:         ['botrytis', 'penicillium', 'fruit rot'],
  vlekkenziekte:     ['marssonina', 'blotch', 'leaf spot'],
  roetdauw:          ['sooty blotch', 'flyspeck', 'roetdauw'],
  bacterievuur:      ['erwinia', 'amylovora', 'fire blight'],
  perenbladvlo:      ['psylla', 'cacopsylla', 'pyri', 'pear psylla'],
  bloedluis:         ['eriosoma', 'lanigerum', 'woolly aphid'],
  fruitmot:          ['cydia', 'pomonella', 'codling moth'],
  luis:              ['aphis', 'dysaphis', 'aphid', 'bladluis'],
  wants:             ['lygus', 'halyomorpha', 'halys', 'stinkwants'],
  appelbloesemkever: ['anthonomus', 'pomorum', 'apple blossom weevil'],
  spint:             ['panonychus', 'ulmi', 'tetranychus', 'spider mite', 'fruitspintmijt'],
  dunning:           ['thinning', 'vruchten dunnen'],
  vruchtzetting:     ['fruit set', 'zetting'],
  bloemknopvorming:  ['flower bud', 'bloemknop', 'knopvorming'],
  bestuiving:        ['pollination', 'bestuivers', 'bijen'],
  groeregulatie:     ['growth regulation', 'groeiremming', 'regalis'],
  snoei_en_boomvorming: ['pruning', 'snoei', 'boomvorm', 'spil'],
  rassenkeuze:       ['variety', 'cultivar', 'ras'],
  onderstammen:      ['rootstock', 'onderstam', 'M9', 'M26'],
  bewaarbaarheid:    ['storage', 'bewaring', 'CA', 'ULO', 'smartfresh'],
};

// ============================================
// MARKDOWN PARSING
// ============================================

interface ParsedFactsheet {
  title: string;
  slug: string;
  isTeelt: boolean;
  articleCount: number;
  coveragePeriod: string | null;
  coverageQuality: string | null;
  summary: string | null;
  phenologicalPhases: string[];
  content: Record<string, unknown>;
  products: ProductRecord[];
  strategySteps: StrategyStepRecord[];
  varieties: VarietyRecord[];
}

interface ProductRecord {
  product_name: string;
  active_substance: string | null;
  product_type: string | null;
  application_type: string | null;
  applies_to: string[];
  dosage: string | null;
  timing: string | null;
  remarks: string | null;
}

interface StrategyStepRecord {
  phase: string;
  sort_order: number;
  action: string;
  applies_to: string[];
  urgency: string;
  products: string[];
  dosages: string[];
  conditions: string | null;
  sub_timing: string | null;
}

interface VarietyRecord {
  variety_name: string;
  fruit_type: string;
  susceptibility: string;
  notes: string | null;
}

/** Clean a cell value: trim, convert "null"/"onbekend"/empty to null */
function cleanCell(val: string): string | null {
  const trimmed = val.trim();
  if (!trimmed || trimmed.toLowerCase() === 'null' || trimmed === '-') return null;
  return trimmed;
}

/** Split a markdown table row into cells */
function splitTableRow(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return [];
  // Remove leading/trailing pipes and split
  const inner = trimmed.slice(1, -1);
  return inner.split('|').map(c => c.trim());
}

/** Check if a line is a table separator (|---|---|...) */
function isTableSeparator(line: string): boolean {
  return /^\|[\s\-:|]+\|$/.test(line.trim());
}

/** Check if a line is a table row */
function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|') && !isTableSeparator(trimmed);
}

/** Map a phase string to standard phases */
function mapToStandardPhases(phaseStr: string): string[] {
  const lower = phaseStr.toLowerCase().trim();
  const mapped: Set<string> = new Set();

  // Direct matches
  const directMap: [RegExp, string[]][] = [
    [/winterrust|winter\s*rust|snoeiperiode/i, ['winterrust']],
    [/knopzwelling/i, ['knopzwelling']],
    [/groen[\s-]*punt/i, ['groen-puntje']],
    [/muizenoor|muizen[\s-]*oor|begin groene knop/i, ['muizenoor']],
    [/volle[\s-]*bloei|^bloei$|tijdens de bloei/i, ['volle-bloei']],
    [/bloembladval|kort na de bloei|na de bloei/i, ['bloembladval']],
    [/vruchtzetting|vrucht[\s-]*zetting/i, ['vruchtzetting']],
    [/junirui|juni[\s-]*rui/i, ['junirui']],
    [/celstrekking|cel[\s-]*strekking/i, ['celstrekking']],
    [/oogst|pluk(?:periode)?|^pluk$/i, ['oogst']],
    [/bladval(?!wond)/i, ['bladval']],
    [/na[\s-]*(?:de[\s-]*)?(?:oogst|pluk)|na-oogst/i, ['na-oogst']],
  ];

  // Combined/range patterns
  if (/eerste 10 weken na de bloei|eerste 8 tot 10 weken/i.test(lower)) {
    mapped.add('bloembladval');
    mapped.add('vruchtzetting');
    mapped.add('junirui');
    return Array.from(mapped);
  }

  if (/massaal uitzwermen.*jonge scheuten/i.test(lower)) {
    mapped.add('vruchtzetting');
    mapped.add('junirui');
    return Array.from(mapped);
  }

  if (/begin eileg tot begin bloei/i.test(lower)) {
    mapped.add('knopzwelling');
    mapped.add('groen-puntje');
    mapped.add('muizenoor');
    return Array.from(mapped);
  }

  if (/tot en met het muizenoor/i.test(lower)) {
    mapped.add('knopzwelling');
    mapped.add('groen-puntje');
    mapped.add('muizenoor');
    return Array.from(mapped);
  }

  for (const [regex, phases] of directMap) {
    if (regex.test(lower)) {
      phases.forEach(p => mapped.add(p));
    }
  }

  // Fallback: if nothing matched, try word-by-word
  if (mapped.size === 0) {
    for (const phase of STANDARD_PHASES) {
      if (lower.includes(phase.replace('-', ' ')) || lower.includes(phase)) {
        mapped.add(phase);
      }
    }
  }

  return Array.from(mapped);
}

/** Map urgency string to standardized value */
function mapUrgency(val: string | null): string {
  if (!val) return 'seasonal';
  const lower = val.toLowerCase().trim();
  if (lower === 'tijdkritisch' || lower === 'time_critical') return 'time_critical';
  if (lower === 'seizoensgebonden' || lower === 'seasonal') return 'seasonal';
  if (lower === 'achtergrond' || lower === 'background') return 'background';
  if (lower === 'onbekend' || lower === '') return 'seasonal';
  return 'seasonal';
}

/** Map susceptibility string to standardized value */
function mapSusceptibility(val: string): string {
  const lower = val.toLowerCase().trim().replace(/\s+/g, '_');
  if (lower === 'bevestigd_gevoelig') return 'bevestigd_gevoelig';
  if (lower === 'waarschijnlijk_gevoelig') return 'waarschijnlijk_gevoelig';
  if (lower.includes('genoemd') && lower.includes('beoordeling')) return 'genoemd';
  if (lower === 'weinig_gevoelig') return 'weinig_gevoelig';
  if (lower === 'resistent') return 'resistent';
  // Fallback
  return lower.replace(/\s+/g, '_');
}

/** Split markdown content into sections by ## headings */
function splitSections(content: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const lines = content.split('\n');
  let currentKey = '__header__';
  let currentLines: string[] = [];

  for (const line of lines) {
    const h2Match = line.match(/^##\s+(.+)/);
    if (h2Match) {
      if (currentLines.length > 0) {
        sections[currentKey] = currentLines.join('\n').trim();
      }
      currentKey = h2Match[1].trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  if (currentLines.length > 0) {
    sections[currentKey] = currentLines.join('\n').trim();
  }

  return sections;
}

/** Split a section into subsections by ### headings */
function splitSubsections(content: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const lines = content.split('\n');
  let currentKey = '__main__';
  let currentLines: string[] = [];

  for (const line of lines) {
    const h3Match = line.match(/^###\s+(.+)/);
    if (h3Match) {
      if (currentLines.length > 0) {
        sections[currentKey] = currentLines.join('\n').trim();
      }
      currentKey = h3Match[1].trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  if (currentLines.length > 0) {
    sections[currentKey] = currentLines.join('\n').trim();
  }

  return sections;
}

/** Parse a markdown table into rows of string arrays (skip header/separator) */
function parseMarkdownTable(content: string): string[][] {
  const lines = content.split('\n').filter(l => l.trim().length > 0);
  const rows: string[][] = [];
  let headerSeen = false;
  let separatorSeen = false;

  for (const line of lines) {
    if (!line.trim().startsWith('|')) continue;

    if (!headerSeen) {
      headerSeen = true;
      continue; // skip header row
    }
    if (!separatorSeen && isTableSeparator(line)) {
      separatorSeen = true;
      continue; // skip separator
    }
    if (isTableRow(line)) {
      rows.push(splitTableRow(line));
    }
  }
  return rows;
}

/** Extract title from markdown */
function extractTitle(content: string): string {
  const match = content.match(/^#\s+(.+)/m);
  return match ? match[1].trim() : 'Unknown';
}

/** Parse Bronkwaliteit section */
function parseBronkwaliteit(section: string): {
  articleCount: number;
  coveragePeriod: string | null;
  coverageQuality: string | null;
} {
  const result = { articleCount: 0, coveragePeriod: null as string | null, coverageQuality: null as string | null };

  const countMatch = section.match(/Aantal bronartikelen:\s*(\d+)/i);
  if (countMatch) result.articleCount = parseInt(countMatch[1], 10);

  const periodMatch = section.match(/Periode:\s*(.+)/i);
  if (periodMatch) result.coveragePeriod = periodMatch[1].trim();

  const qualityMatch = section.match(/Dekking:\s*(.+)/i);
  if (qualityMatch) result.coverageQuality = qualityMatch[1].trim();

  return result;
}

/** Parse Fenologische relevantie/timing into standard phases */
function parsePhenologicalPhases(section: string): string[] {
  const allPhases: Set<string> = new Set();
  const lines = section.split('\n');

  for (const line of lines) {
    // Try to match bold phase names: **Phase:** or **Phase**
    const boldMatch = line.match(/\*\*([^*]+?)(?::?\s*\*\*|:\*\*)/);
    if (boldMatch) {
      const phases = mapToStandardPhases(boldMatch[1]);
      phases.forEach(p => allPhases.add(p));
      continue;
    }

    // Try plain text matching for each standard phase
    for (const phase of STANDARD_PHASES) {
      const variants = [phase, phase.replace('-', ' '), phase.replace('-', '')];
      for (const v of variants) {
        if (line.toLowerCase().includes(v)) {
          allPhases.add(phase);
        }
      }
    }
  }

  // Sort by standard order
  return Array.from(allPhases).sort((a, b) => (PHASE_ORDER[a] || 99) - (PHASE_ORDER[b] || 99));
}

/** Parse summary/samenvatting/kernpunten */
function parseSummary(sections: Record<string, string>): string | null {
  const summarySection = sections['Samenvatting'] || sections['Kernpunten'];
  if (!summarySection) return null;

  // Extract bullet points and join
  const bullets = summarySection.split('\n')
    .map(l => l.replace(/^[\s*-]+/, '').trim())
    .filter(l => l.length > 0);

  return bullets.join(' ');
}

/** Parse ziekten products (Appel/Peer subsections with 5-column tables) */
function parseZiektenProducts(section: string): ProductRecord[] {
  const products: ProductRecord[] = [];
  const subsections = splitSubsections(section);

  for (const [subKey, subContent] of Object.entries(subsections)) {
    const lowerKey = subKey.toLowerCase();
    let appliesTo: string[];
    if (lowerKey.includes('appel')) {
      appliesTo = ['appel'];
    } else if (lowerKey.includes('peer')) {
      appliesTo = ['peer'];
    } else {
      continue;
    }

    const rows = parseMarkdownTable(subContent);
    for (const cells of rows) {
      if (cells.length < 5) continue;
      const productName = cleanCell(cells[0]);
      if (!productName) continue;

      const productType = cleanCell(cells[3]);

      products.push({
        product_name: productName,
        active_substance: cleanCell(cells[1]),
        product_type: productType === 'onbekend' ? null : productType,
        application_type: null,
        applies_to: appliesTo,
        dosage: cleanCell(cells[2]),
        timing: cleanCell(cells[4]),
        remarks: null,
      });
    }
  }

  return deduplicateProducts(products);
}

/** Parse teelt products (single table with Gewas column, 6 columns) */
function parseTeeltProducts(section: string): ProductRecord[] {
  const products: ProductRecord[] = [];
  const rows = parseMarkdownTable(section);

  for (const cells of rows) {
    if (cells.length < 6) continue;
    const productName = cleanCell(cells[0]);
    if (!productName) continue;

    const gewas = cleanCell(cells[3]);
    let appliesTo: string[];
    if (gewas) {
      const lower = gewas.toLowerCase();
      if (lower.includes('appel') && lower.includes('peer')) {
        appliesTo = ['appel', 'peer'];
      } else if (lower.includes('appel')) {
        appliesTo = ['appel'];
      } else if (lower.includes('peer')) {
        appliesTo = ['peer'];
      } else {
        appliesTo = ['appel', 'peer'];
      }
    } else {
      appliesTo = ['appel', 'peer'];
    }

    products.push({
      product_name: productName,
      active_substance: cleanCell(cells[1]),
      product_type: null,
      application_type: null,
      applies_to: appliesTo,
      dosage: cleanCell(cells[2]),
      timing: cleanCell(cells[4]),
      remarks: cleanCell(cells[5]),
    });
  }

  return deduplicateProducts(products);
}

/** Deduplicate products: same name + same applies_to = keep most specific */
function deduplicateProducts(products: ProductRecord[]): ProductRecord[] {
  const map = new Map<string, ProductRecord>();

  for (const p of products) {
    const key = `${p.product_name.toLowerCase()}|${p.applies_to.sort().join(',')}`;
    const existing = map.get(key);

    if (!existing) {
      map.set(key, p);
    } else {
      // Keep most specific: prefer non-null values
      if (!existing.dosage && p.dosage) existing.dosage = p.dosage;
      if (!existing.timing && p.timing) existing.timing = p.timing;
      if (!existing.active_substance && p.active_substance) existing.active_substance = p.active_substance;
      if (!existing.product_type && p.product_type) existing.product_type = p.product_type;
    }
  }

  return Array.from(map.values());
}

/** Parse bestrijdingstijdlijn (Appel/Peer subsections, 5-column tables) */
function parseStrategySteps(section: string): StrategyStepRecord[] {
  const steps: StrategyStepRecord[] = [];
  const subsections = splitSubsections(section);

  for (const [subKey, subContent] of Object.entries(subsections)) {
    const lowerKey = subKey.toLowerCase();
    let appliesTo: string[];
    if (lowerKey.includes('appel')) {
      appliesTo = ['appel'];
    } else if (lowerKey.includes('peer')) {
      appliesTo = ['peer'];
    } else {
      continue;
    }

    const rows = parseMarkdownTable(subContent);
    for (const cells of rows) {
      if (cells.length < 5) continue;

      const faseRaw = cleanCell(cells[0]);
      const action = cleanCell(cells[1]);
      if (!faseRaw || !action) continue;

      const phases = mapToStandardPhases(faseRaw);
      const phase = phases.length > 0 ? phases[0] : faseRaw.toLowerCase().replace(/\s+/g, '-');

      const middelenStr = cleanCell(cells[2]);
      const urgencyRaw = cleanCell(cells[3]);
      const conditions = cleanCell(cells[4]);

      // Parse products from "Middel(en) + dosering" column
      const productsArr: string[] = [];
      const dosagesArr: string[] = [];
      if (middelenStr) {
        // Split on commas but be careful of dosage info
        // Products are typically comma-separated: "Delan, captan, Syllit: 1.7l"
        const parts = middelenStr.split(/,\s*(?=[A-Z])/);
        for (const part of parts) {
          const colonIdx = part.indexOf(':');
          if (colonIdx > -1) {
            productsArr.push(part.slice(0, colonIdx).trim());
            dosagesArr.push(part.slice(colonIdx + 1).trim());
          } else {
            productsArr.push(part.trim());
            dosagesArr.push('');
          }
        }
      }

      steps.push({
        phase,
        sort_order: PHASE_ORDER[phase] || 99,
        action,
        applies_to: appliesTo,
        urgency: mapUrgency(urgencyRaw),
        products: productsArr.filter(Boolean),
        dosages: dosagesArr,
        conditions,
        sub_timing: phases.length > 1 ? phases.join(', ') : null,
      });
    }
  }

  return steps;
}

/** Parse rasgevoeligheid (Appelrassen/Perenrassen subsections, 3-column tables) */
function parseVarietySusceptibility(section: string): VarietyRecord[] {
  const varieties: VarietyRecord[] = [];
  const subsections = splitSubsections(section);

  for (const [subKey, subContent] of Object.entries(subsections)) {
    const lowerKey = subKey.toLowerCase();
    let fruitType: string;
    if (lowerKey.includes('appel')) {
      fruitType = 'appel';
    } else if (lowerKey.includes('peer') || lowerKey.includes('peren')) {
      fruitType = 'peer';
    } else {
      continue;
    }

    const rows = parseMarkdownTable(subContent);
    for (const cells of rows) {
      if (cells.length < 3) continue;
      const varietyName = cleanCell(cells[0]);
      const susceptibilityRaw = cleanCell(cells[1]);
      if (!varietyName || !susceptibilityRaw) continue;

      varieties.push({
        variety_name: varietyName,
        fruit_type: fruitType,
        susceptibility: mapSusceptibility(susceptibilityRaw),
        notes: cleanCell(cells[2]),
      });
    }
  }

  return varieties;
}

/** Determine applies_to based on which subsections have actual data */
function determineAppliesTo(products: ProductRecord[], steps: StrategyStepRecord[], varieties: VarietyRecord[]): string[] {
  const crops = new Set<string>();

  for (const p of products) p.applies_to.forEach(c => crops.add(c));
  for (const s of steps) s.applies_to.forEach(c => crops.add(c));
  for (const v of varieties) crops.add(v.fruit_type);

  if (crops.size === 0) return ['appel', 'peer']; // default
  return Array.from(crops).sort();
}

/** Generate search keywords for a factsheet */
function generateKeywords(slug: string, title: string, products: ProductRecord[], varieties: VarietyRecord[]): string[] {
  const keywords = new Set<string>();

  // Title
  keywords.add(title.toLowerCase());

  // Slug
  keywords.add(slug);

  // Extra keywords
  const extras = EXTRA_KEYWORDS[slug];
  if (extras) extras.forEach(k => keywords.add(k.toLowerCase()));

  // Product names
  for (const p of products) {
    keywords.add(p.product_name.toLowerCase());
    if (p.active_substance) keywords.add(p.active_substance.toLowerCase());
  }

  // Variety names
  for (const v of varieties) {
    keywords.add(v.variety_name.toLowerCase());
  }

  return Array.from(keywords).sort();
}

/** Build structured JSONB content from sections */
function buildContent(sections: Record<string, string>): Record<string, unknown> {
  const content: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(sections)) {
    if (key === '__header__') continue;

    // For sections with subsections, parse them
    const subsections = splitSubsections(value);
    if (Object.keys(subsections).length > 1 || !subsections['__main__']) {
      const sub: Record<string, string> = {};
      for (const [sk, sv] of Object.entries(subsections)) {
        if (sk === '__main__' && !sv.trim()) continue;
        sub[sk] = sv;
      }
      content[key] = sub;
    } else {
      content[key] = value;
    }
  }

  return content;
}

/** Parse a single factsheet file */
function parseFactsheet(filePath: string, isTeelt: boolean): ParsedFactsheet {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const slug = path.basename(filePath, '.md');
  const title = extractTitle(raw);
  const sections = splitSections(raw);

  // Bronkwaliteit
  const bronSection = sections['Bronkwaliteit'] || '';
  const bron = parseBronkwaliteit(bronSection);

  // Phenological phases
  const phenoSection = sections['Fenologische relevantie'] || sections['Fenologische timing'] || '';
  const phenologicalPhases = parsePhenologicalPhases(phenoSection);

  // Summary
  const summary = parseSummary(sections);

  // Products
  let products: ProductRecord[];
  if (isTeelt) {
    const middelenSection = sections['Middelen en producten'] || '';
    products = parseTeeltProducts(middelenSection);
  } else {
    const middelenSection = sections['Geadviseerde middelen'] || '';
    products = parseZiektenProducts(middelenSection);
  }

  // Strategy steps
  let strategySteps: StrategyStepRecord[] = [];
  if (!isTeelt) {
    // Ziekten: parse Bestrijdingstijdlijn
    const timelineSection = sections['Bestrijdingstijdlijn'] || sections['Bestrijdings-/Teeltstrategie'] || '';
    if (timelineSection.trim()) {
      strategySteps = parseStrategySteps(timelineSection);
    }
  }
  // Teelt factsheets don't have timeline tables

  // Variety susceptibility
  let varieties: VarietyRecord[] = [];
  const varietySection = sections['Rasgevoeligheid'] || '';
  if (varietySection.trim()) {
    varieties = parseVarietySusceptibility(varietySection);
  }

  // Determine applies_to
  const appliesTo = determineAppliesTo(products, strategySteps, varieties);

  // Build structured content
  const content = buildContent(sections);

  return {
    title,
    slug,
    isTeelt,
    articleCount: bron.articleCount,
    coveragePeriod: bron.coveragePeriod,
    coverageQuality: bron.coverageQuality,
    summary,
    phenologicalPhases,
    content,
    products,
    strategySteps,
    varieties,
  };
}

// ============================================
// DATABASE OPERATIONS
// ============================================

async function supabaseOp<T>(label: string, fn: () => Promise<{ data: T; error: any }>): Promise<T | null> {
  const result = await withRetry(async () => {
    const { data, error } = await fn();
    if (error) {
      // If it's a network error (fetch failed), throw to trigger retry
      if (error.message?.includes('fetch failed') || error.message?.includes('ECONNRESET')) {
        throw new Error(error.message);
      }
      console.error(`  ✗ ${label}:`, error.message);
      return null;
    }
    return data;
  });
  return result;
}

async function importFactsheet(factsheet: ParsedFactsheet): Promise<void> {
  const cat = CATEGORY_MAP[factsheet.slug];
  if (!cat) {
    console.warn(`  ⚠ No category mapping for slug: ${factsheet.slug}, skipping`);
    return;
  }

  // 1. Check for existing topic
  await delay(200);
  const existingTopic = await supabaseOp('check existing', () =>
    supabase.from('kb_topics').select('id').eq('slug', factsheet.slug).maybeSingle()
  );

  if (existingTopic) {
    // Delete child records (NOT research_notes, NOT season_action_log)
    await supabaseOp('delete varieties', () =>
      supabase.from('kb_variety_susceptibility').delete().eq('topic_id', existingTopic.id).select()
    );
    await supabaseOp('delete steps', () =>
      supabase.from('kb_strategy_steps').delete().eq('topic_id', existingTopic.id).select()
    );
    await supabaseOp('delete products', () =>
      supabase.from('kb_products').delete().eq('topic_id', existingTopic.id).select()
    );
    await supabaseOp('delete topic', () =>
      supabase.from('kb_topics').delete().eq('slug', factsheet.slug).select()
    );
  }

  // 2. Insert topic
  const keywords = generateKeywords(factsheet.slug, factsheet.title, factsheet.products, factsheet.varieties);

  await delay(200);
  const topic = await supabaseOp('insert topic', () =>
    supabase
      .from('kb_topics')
      .insert({
        slug: factsheet.slug,
        title: factsheet.title,
        category: cat.category,
        subcategory: cat.subcategory,
        applies_to: determineAppliesTo(factsheet.products, factsheet.strategySteps, factsheet.varieties),
        summary: factsheet.summary,
        content: factsheet.content,
        phenological_phases: factsheet.phenologicalPhases,
        search_keywords: keywords,
        article_count: factsheet.articleCount,
        coverage_period: factsheet.coveragePeriod,
        coverage_quality: factsheet.coverageQuality,
      })
      .select('id')
      .single()
  );

  if (!topic) return;
  const topicId = topic.id;

  // 3. Insert products
  if (factsheet.products.length > 0) {
    const productRows = factsheet.products.map(p => ({
      topic_id: topicId,
      product_name: p.product_name,
      active_substance: p.active_substance,
      product_type: p.product_type,
      application_type: p.application_type,
      applies_to: p.applies_to,
      dosage: p.dosage,
      timing: p.timing,
      remarks: p.remarks,
    }));

    await delay(200);
    await supabaseOp('insert products', () =>
      supabase.from('kb_products').insert(productRows).select('id')
    );
  }

  // 4. Insert strategy steps
  if (factsheet.strategySteps.length > 0) {
    const stepRows = factsheet.strategySteps.map(s => ({
      topic_id: topicId,
      phase: s.phase,
      sort_order: s.sort_order,
      action: s.action,
      applies_to: s.applies_to,
      urgency: s.urgency,
      products: s.products,
      dosages: s.dosages,
      conditions: s.conditions,
      sub_timing: s.sub_timing,
    }));

    await delay(200);
    await supabaseOp('insert steps', () =>
      supabase.from('kb_strategy_steps').insert(stepRows).select('id')
    );
  }

  // 5. Insert varieties (deduplicate by variety_name + fruit_type)
  if (factsheet.varieties.length > 0) {
    const seen = new Set<string>();
    const dedupedVarieties = factsheet.varieties.filter(v => {
      const key = `${v.variety_name}|${v.fruit_type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const varietyRows = dedupedVarieties.map(v => ({
      topic_id: topicId,
      variety_name: v.variety_name,
      fruit_type: v.fruit_type,
      susceptibility: v.susceptibility,
      notes: v.notes,
    }));

    await delay(200);
    await supabaseOp('insert varieties', () =>
      supabase.from('kb_variety_susceptibility').insert(varietyRows).select('id')
    );
  }
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('🌿 Knowledge Base Import\n');

  const baseDir = path.resolve(__dirname, '..', 'knowledge-base', 'factsheets');
  const ziektenDir = path.join(baseDir, 'ziekten');
  const teeltDir = path.join(baseDir, 'teelt');

  // Collect all factsheet files
  const ziektenFiles = fs.readdirSync(ziektenDir)
    .filter(f => f.endsWith('.md'))
    .map(f => ({ path: path.join(ziektenDir, f), isTeelt: false }));

  const teeltFiles = fs.readdirSync(teeltDir)
    .filter(f => f.endsWith('.md'))
    .map(f => ({ path: path.join(teeltDir, f), isTeelt: true }));

  const allFiles = [...ziektenFiles, ...teeltFiles];

  console.log(`Found ${allFiles.length} factsheets (${ziektenFiles.length} ziekten, ${teeltFiles.length} teelt)\n`);

  // Parse all factsheets
  const factsheets: ParsedFactsheet[] = [];
  for (const file of allFiles) {
    const slug = path.basename(file.path, '.md');
    try {
      const parsed = parseFactsheet(file.path, file.isTeelt);
      factsheets.push(parsed);
      console.log(`  ✓ Parsed: ${slug} (${parsed.products.length} products, ${parsed.strategySteps.length} steps, ${parsed.varieties.length} varieties)`);
    } catch (err) {
      console.error(`  ✗ Failed to parse ${slug}:`, err);
    }
  }

  console.log('\nImporting to Supabase...\n');

  // Import each factsheet
  let totalProducts = 0;
  let totalSteps = 0;
  let totalVarieties = 0;

  for (const fs of factsheets) {
    await importFactsheet(fs);
    totalProducts += fs.products.length;
    totalSteps += fs.strategySteps.length;
    totalVarieties += fs.varieties.length;
    console.log(`  ✓ Imported: ${fs.slug}`);
  }

  // Print report
  console.log('\n' + '='.repeat(50));
  console.log('✅ Import voltooid');
  console.log(`Topics: ${factsheets.length} (${ziektenFiles.length} ziekten, ${teeltFiles.length} teelt)`);
  console.log(`Products: ${totalProducts} records`);
  console.log(`Strategy steps: ${totalSteps} records`);
  console.log(`Variety entries: ${totalVarieties} records`);
  console.log('');
  console.log('Per topic:');
  for (const fs of factsheets) {
    console.log(`  ${fs.slug}: ${fs.products.length} products, ${fs.strategySteps.length} steps, ${fs.varieties.length} varieties`);
  }
  console.log('='.repeat(50));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
