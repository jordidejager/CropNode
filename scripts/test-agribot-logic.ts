/**
 * MEGA TEST SCRIPT - AgriBot Hybrid Engine v2.0
 *
 * Tests:
 * 1. Parcel Filter Parsing (natural language → LocationFilter)
 * 2. Date Parsing (Dutch dates)
 * 3. Dosage Extraction
 * 4. Intent Pre-classification
 * 5. Filter Application Logic
 */

// ============================================
// Import the functions we're testing
// ============================================

import {
  parseNaturalLocationFilter,
  isKnownVariety,
  isKnownCrop,
  applyLocationFilter,
  KNOWN_VARIETIES,
  KNOWN_CROPS,
  type LocationFilter,
} from '../src/lib/validation/parcel-filter';

import {
  parseDutchDate,
  extractDosage,
  preClassifyIntent,
} from '../src/ai/prompts/agribot-v2';

// ============================================
// Test Utilities
// ============================================

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => boolean) {
  try {
    const result = fn();
    if (result) {
      console.log(`✓ ${name}`);
      passed++;
    } else {
      console.log(`✗ ${name}`);
      failed++;
      failures.push(name);
    }
  } catch (error) {
    console.log(`✗ ${name} - ERROR: ${error}`);
    failed++;
    failures.push(`${name} (error: ${error})`);
  }
}

function assertEqual(actual: any, expected: any, message?: string): boolean {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    console.log(`  Expected: ${expectedStr}`);
    console.log(`  Actual:   ${actualStr}`);
    if (message) console.log(`  Note: ${message}`);
    return false;
  }
  return true;
}

function assertIncludes(actual: any, expectedSubset: any): boolean {
  if (!actual) {
    console.log(`  Actual is null/undefined`);
    return false;
  }

  for (const [key, value] of Object.entries(expectedSubset)) {
    if (typeof value === 'object' && value !== null) {
      if (!assertIncludes(actual[key], value)) {
        return false;
      }
    } else if (actual[key] !== value) {
      console.log(`  Expected ${key}: ${value}`);
      console.log(`  Actual ${key}: ${actual[key]}`);
      return false;
    }
  }
  return true;
}

// ============================================
// TEST GROUP 1: Known Varieties & Crops
// ============================================

console.log('\n========================================');
console.log('TEST GROUP 1: Known Varieties & Crops');
console.log('========================================\n');

test('isKnownVariety: tessa', () => isKnownVariety('tessa') === true);
test('isKnownVariety: Tessa (capitalized)', () => isKnownVariety('Tessa') === true);
test('isKnownVariety: elstar', () => isKnownVariety('elstar') === true);
test('isKnownVariety: jonagold', () => isKnownVariety('jonagold') === true);
test('isKnownVariety: conference (peer)', () => isKnownVariety('conference') === true);
test('isKnownVariety: doyenne (peer)', () => isKnownVariety('doyenne') === true);
test('isKnownVariety: unknown variety', () => isKnownVariety('randomname') === false);
test('isKnownVariety: partial match (jon)', () => isKnownVariety('jon') === true); // prefix match

test('isKnownCrop: appel', () => isKnownCrop('appel') === true);
test('isKnownCrop: appels', () => isKnownCrop('appels') === true);
test('isKnownCrop: peer', () => isKnownCrop('peer') === true);
test('isKnownCrop: peren', () => isKnownCrop('peren') === true);
test('isKnownCrop: unknown crop', () => isKnownCrop('banaan') === false);

// ============================================
// TEST GROUP 2: Parcel Filter Parsing - Exclusions
// ============================================

console.log('\n========================================');
console.log('TEST GROUP 2: Filter Parsing - Exclusions');
console.log('========================================\n');

test('Exclusion: "De tessa percelen trouwens niet"', () => {
  const result = parseNaturalLocationFilter('De tessa percelen trouwens niet');
  return result?.exclude?.variety === 'tessa';
});

test('Exclusion: "tessa percelen niet"', () => {
  const result = parseNaturalLocationFilter('tessa percelen niet');
  return result?.exclude?.variety === 'tessa';
});

test('Exclusion: "behalve tessa"', () => {
  const result = parseNaturalLocationFilter('behalve tessa');
  return result?.exclude?.variety === 'tessa';
});

test('Exclusion: "zonder de jonagolds"', () => {
  const result = parseNaturalLocationFilter('zonder de jonagolds');
  return result?.exclude?.variety === 'jonagold';
});

test('Exclusion: "niet de elstars"', () => {
  const result = parseNaturalLocationFilter('niet de elstars');
  return result?.exclude?.variety === 'elstar';
});

test('Exclusion: "niet de elstar"', () => {
  const result = parseNaturalLocationFilter('niet de elstar');
  return result?.exclude?.variety === 'elstar';
});

test('Exclusion: "geen conference"', () => {
  const result = parseNaturalLocationFilter('geen conference');
  return result?.exclude?.variety === 'conference';
});

test('Exclusion: "toch niet de braeburns"', () => {
  const result = parseNaturalLocationFilter('toch niet de braeburns');
  return result?.exclude?.variety === 'braeburn';
});

// ============================================
// TEST GROUP 3: Parcel Filter Parsing - Inclusions
// ============================================

console.log('\n========================================');
console.log('TEST GROUP 3: Filter Parsing - Inclusions');
console.log('========================================\n');

test('Inclusion: "de elstars"', () => {
  const result = parseNaturalLocationFilter('de elstars');
  return result?.include?.variety === 'elstar';
});

test('Inclusion: "de tessa"', () => {
  const result = parseNaturalLocationFilter('de tessa');
  return result?.include?.variety === 'tessa';
});

test('Inclusion: "tessa percelen"', () => {
  const result = parseNaturalLocationFilter('tessa percelen');
  return result?.include?.variety === 'tessa';
});

test('Inclusion: "de conference percelen"', () => {
  const result = parseNaturalLocationFilter('de conference percelen');
  return result?.include?.variety === 'conference';
});

test('Inclusion: "alle appels"', () => {
  const result = parseNaturalLocationFilter('alle appels');
  return result?.include?.crop_type === 'appels';
});

test('Inclusion: "alle peren"', () => {
  const result = parseNaturalLocationFilter('alle peren');
  return result?.include?.crop_type === 'peren';
});

// ============================================
// TEST GROUP 4: Combined Include + Exclude
// ============================================

console.log('\n========================================');
console.log('TEST GROUP 4: Combined Include + Exclude');
console.log('========================================\n');

test('Combined: "alle appels behalve elstar"', () => {
  const result = parseNaturalLocationFilter('alle appels behalve elstar');
  return result?.include?.crop_type === 'appels' && result?.exclude?.variety === 'elstar';
});

test('Combined: "alle peren zonder conference"', () => {
  const result = parseNaturalLocationFilter('alle peren zonder conference');
  return result?.include?.crop_type === 'peren' && result?.exclude?.variety === 'conference';
});

test('Combined: "alle appels niet de tessa"', () => {
  const result = parseNaturalLocationFilter('alle appels niet de tessa');
  return result?.include?.crop_type === 'appels' && result?.exclude?.variety === 'tessa';
});

// ============================================
// TEST GROUP 5: Edge Cases
// ============================================

console.log('\n========================================');
console.log('TEST GROUP 5: Edge Cases');
console.log('========================================\n');

test('Edge: "alles" returns empty filter (all parcels)', () => {
  const result = parseNaturalLocationFilter('alles');
  return result !== null && Object.keys(result).length === 0;
});

test('Edge: "alle percelen" returns empty filter', () => {
  const result = parseNaturalLocationFilter('alle percelen');
  return result !== null && Object.keys(result).length === 0;
});

test('Edge: "overal" returns empty filter', () => {
  const result = parseNaturalLocationFilter('overal');
  return result !== null && Object.keys(result).length === 0;
});

test('Edge: Unknown text returns null', () => {
  const result = parseNaturalLocationFilter('wat een mooi weer vandaag');
  return result === null;
});

test('Edge: "de kanzi\'s" (with apostrophe)', () => {
  const result = parseNaturalLocationFilter("de kanzi's");
  return result?.include?.variety === 'kanzi';
});

// ============================================
// TEST GROUP 6: Date Parsing
// ============================================

console.log('\n========================================');
console.log('TEST GROUP 6: Dutch Date Parsing');
console.log('========================================\n');

const today = new Date('2026-01-23');

test('Date: "vandaag"', () => {
  const result = parseDutchDate('vandaag', today);
  return result === '2026-01-23';
});

test('Date: "gisteren"', () => {
  const result = parseDutchDate('gisteren', today);
  return result === '2026-01-22';
});

test('Date: "eergisteren"', () => {
  const result = parseDutchDate('eergisteren', today);
  return result === '2026-01-21';
});

test('Date: "vorige week"', () => {
  const result = parseDutchDate('vorige week', today);
  return result === '2026-01-16';
});

test('Date: "23 jan"', () => {
  const result = parseDutchDate('23 jan', today);
  return result !== null && result.includes('-01-23');
});

test('Date: unknown text returns null', () => {
  const result = parseDutchDate('gespoten', today);
  return result === null;
});

// ============================================
// TEST GROUP 7: Dosage Extraction
// ============================================

console.log('\n========================================');
console.log('TEST GROUP 7: Dosage Extraction');
console.log('========================================\n');

test('Dosage: "2L"', () => {
  const result = extractDosage('2L');
  return result?.dosage === 2 && result?.unit === 'l';
});

test('Dosage: "0.5 kg"', () => {
  const result = extractDosage('0.5 kg');
  return result?.dosage === 0.5 && result?.unit === 'kg';
});

test('Dosage: "200ml"', () => {
  const result = extractDosage('200ml');
  return result?.dosage === 200 && result?.unit === 'ml';
});

test('Dosage: "1,5 l/ha"', () => {
  const result = extractDosage('1,5 l/ha');
  return result?.dosage === 1.5 && result?.unit === 'l/ha';
});

test('Dosage: "0.2kg Chorus"', () => {
  const result = extractDosage('0.2kg Chorus');
  return result?.dosage === 0.2 && result?.unit === 'kg';
});

test('Dosage: no dosage returns null', () => {
  const result = extractDosage('Chorus op alle appels');
  return result === null;
});

// ============================================
// TEST GROUP 8: Intent Pre-classification
// ============================================

console.log('\n========================================');
console.log('TEST GROUP 8: Intent Pre-classification');
console.log('========================================\n');

test('Intent: "ja" → confirm', () => {
  const result = preClassifyIntent('ja');
  return result?.intent === 'confirm';
});

test('Intent: "ok" → confirm', () => {
  const result = preClassifyIntent('ok');
  return result?.intent === 'confirm';
});

test('Intent: "nee" → cancel', () => {
  const result = preClassifyIntent('nee');
  return result?.intent === 'cancel';
});

test('Intent: "2L Captan gespoten" → register_spray', () => {
  const result = preClassifyIntent('2L Captan gespoten');
  return result?.intent === 'register_spray';
});

test('Intent: "gisteren 0.5kg Chorus" → register_spray', () => {
  const result = preClassifyIntent('gisteren 0.5kg Chorus');
  return result?.intent === 'register_spray';
});

test('Intent: "hoeveel captan dit jaar" → query_history', () => {
  const result = preClassifyIntent('hoeveel captan dit jaar');
  return result?.intent === 'query_history';
});

test('Intent: "wat is de dosering van Decis" → query_regulation', () => {
  const result = preClassifyIntent('wat is de dosering van Decis');
  return result?.intent === 'query_regulation';
});

test('Intent: "niet de tessa" → modify_draft', () => {
  const result = preClassifyIntent('niet de tessa');
  return result?.intent === 'modify_draft';
});

test('Intent: "behalve elstar" → modify_draft', () => {
  const result = preClassifyIntent('behalve elstar');
  return result?.intent === 'modify_draft';
});

// ============================================
// TEST GROUP 9: Filter Application (Mock Parcels)
// ============================================

console.log('\n========================================');
console.log('TEST GROUP 9: Filter Application');
console.log('========================================\n');

// Mock parcels for testing
const mockParcels = [
  { id: '1', name: 'Elstar 1', crop: 'Appel', variety: 'Elstar', area: 1.5, parcelId: 'p1', parcelName: 'Perceel A', location: null, geometry: null, source: 'manual', rvoId: null },
  { id: '2', name: 'Elstar 2', crop: 'Appel', variety: 'Elstar', area: 2.0, parcelId: 'p1', parcelName: 'Perceel A', location: null, geometry: null, source: 'manual', rvoId: null },
  { id: '3', name: 'Jonagold 1', crop: 'Appel', variety: 'Jonagold', area: 1.8, parcelId: 'p2', parcelName: 'Perceel B', location: null, geometry: null, source: 'manual', rvoId: null },
  { id: '4', name: 'Tessa 1', crop: 'Appel', variety: 'Tessa', area: 1.2, parcelId: 'p3', parcelName: 'Perceel C', location: null, geometry: null, source: 'manual', rvoId: null },
  { id: '5', name: 'Conference 1', crop: 'Peer', variety: 'Conference', area: 2.5, parcelId: 'p4', parcelName: 'Perceel D', location: null, geometry: null, source: 'manual', rvoId: null },
  { id: '6', name: 'Conference 2', crop: 'Peer', variety: 'Conference', area: 1.9, parcelId: 'p4', parcelName: 'Perceel D', location: null, geometry: null, source: 'manual', rvoId: null },
  { id: '7', name: 'Doyenne 1', crop: 'Peer', variety: 'Doyenne', area: 1.5, parcelId: 'p5', parcelName: 'Perceel E', location: null, geometry: null, source: 'manual', rvoId: null },
];

test('Filter: all parcels (no filter)', () => {
  const result = applyLocationFilter({}, mockParcels);
  return result.totalMatched === 7;
});

test('Filter: include crop "Appel"', () => {
  const result = applyLocationFilter({ include: { crop_type: 'Appel' } }, mockParcels);
  return result.totalMatched === 4;
});

test('Filter: include crop "Peer"', () => {
  const result = applyLocationFilter({ include: { crop_type: 'Peer' } }, mockParcels);
  return result.totalMatched === 3;
});

test('Filter: include variety "Elstar"', () => {
  const result = applyLocationFilter({ include: { variety: 'Elstar' } }, mockParcels);
  return result.totalMatched === 2;
});

test('Filter: exclude variety "Tessa"', () => {
  const result = applyLocationFilter({ exclude: { variety: 'Tessa' } }, mockParcels);
  return result.totalMatched === 6;
});

test('Filter: include Appel, exclude Tessa', () => {
  const result = applyLocationFilter({
    include: { crop_type: 'Appel' },
    exclude: { variety: 'Tessa' }
  }, mockParcels);
  return result.totalMatched === 3; // Elstar x2 + Jonagold
});

test('Filter: include Peer, exclude Conference', () => {
  const result = applyLocationFilter({
    include: { crop_type: 'Peer' },
    exclude: { variety: 'Conference' }
  }, mockParcels);
  return result.totalMatched === 1; // Doyenne
});

test('Filter: specific IDs', () => {
  const result = applyLocationFilter({ specific_ids: ['1', '3', '5'] }, mockParcels);
  return result.totalMatched === 3;
});

// ============================================
// TEST GROUP 10: Full Integration - Parse + Apply
// ============================================

console.log('\n========================================');
console.log('TEST GROUP 10: Full Integration');
console.log('========================================\n');

test('Integration: "De tessa percelen trouwens niet" + apply', () => {
  const filter = parseNaturalLocationFilter('De tessa percelen trouwens niet');
  if (!filter) return false;
  const result = applyLocationFilter(filter, mockParcels);
  // Should exclude Tessa (1 parcel), leaving 6
  return result.totalMatched === 6;
});

test('Integration: "alle appels behalve elstar" + apply', () => {
  const filter = parseNaturalLocationFilter('alle appels behalve elstar');
  if (!filter) return false;
  const result = applyLocationFilter(filter, mockParcels);
  // Appel (4) - Elstar (2) = 2 (Jonagold + Tessa)
  return result.totalMatched === 2;
});

test('Integration: "de conference percelen" + apply', () => {
  const filter = parseNaturalLocationFilter('de conference percelen');
  if (!filter) return false;
  const result = applyLocationFilter(filter, mockParcels);
  return result.totalMatched === 2;
});

// ============================================
// FINAL SUMMARY
// ============================================

console.log('\n========================================');
console.log('FINAL RESULTS');
console.log('========================================\n');

console.log(`Total: ${passed + failed} tests`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failures.length > 0) {
  console.log('\nFailed tests:');
  failures.forEach(f => console.log(`  - ${f}`));
}

console.log('\n');
process.exit(failed > 0 ? 1 : 0);
