/**
 * MEGA TEST SCRIPT - AgriBot Hybrid Engine v2.0
 * Standalone test - no external dependencies
 */

// ============================================
// COPY OF LOGIC FROM SOURCE FILES (standalone)
// ============================================

const KNOWN_VARIETIES = [
  // Appelrassen
  'elstar', 'jonagold', 'braeburn', 'golden', 'boskoop', 'goudreinette',
  'tessa', 'greenstar', 'kanzi', 'junami', 'wellant', 'delbar',
  'red prince', 'fuji', 'gala', 'granny smith', 'pink lady',
  'cox', 'santana', 'topaz', 'rubinette', 'belle de boskoop',
  'golden delicious', 'red delicious', 'honeycrisp', 'jazz',
  // Perenrassen
  'conference', 'doyenne', 'doyenné', 'comice', 'doyenne du comice',
  'gieser wildeman', 'beurre hardy', 'beurré hardy',
  'triomphe de vienne', 'concorde', 'sweet sensation', 'xenia',
  'cepuna', 'qtee', 'migo', 'williams', 'bon chretien',
  'packham', 'abate fetel', 'rocha', 'alexandrine douillard',
  'clapp', 'decana', 'coscia', 'forelle', 'lucas',
];

const KNOWN_CROPS = [
  'appel', 'appels', 'peer', 'peren', 'kers', 'kersen',
  'pruim', 'pruimen', 'aardbei', 'aardbeien', 'framboos', 'frambozen',
];

function isKnownVariety(word) {
  const normalized = word.toLowerCase().trim();
  return KNOWN_VARIETIES.some(v =>
    v === normalized ||
    v.startsWith(normalized) ||
    normalized.startsWith(v)
  );
}

function isKnownCrop(word) {
  const normalized = word.toLowerCase().trim();
  return KNOWN_CROPS.includes(normalized);
}

function parseNaturalLocationFilter(input) {
  const normalizedInput = input.toLowerCase().trim();
  const filter = {};

  // Pattern: "alle [gewas]"
  const allCropMatch = normalizedInput.match(/alle?\s+(appels?|peren?|kersen?|pruimen?|aardbeien?|frambozen?)/);
  if (allCropMatch) {
    filter.include = { crop_type: allCropMatch[1] };
  }

  // Pattern: "de [ras]s" or "[ras] percelen" - NOT followed by negation
  const varietyPatterns = [
    /de\s+(\w+)(?:s|\'s)?\s*(?:percelen)?(?!\s*(?:niet|trouwens))/,
    /^(\w+)\s+percelen(?!\s*(?:niet|trouwens))/,
  ];

  for (const pattern of varietyPatterns) {
    const match = normalizedInput.match(pattern);
    if (match) {
      let varietyName = match[1];
      // Strip trailing 's'
      if (varietyName.endsWith('s') && !varietyName.endsWith('ss')) {
        const stripped = varietyName.slice(0, -1);
        if (isKnownVariety(stripped)) varietyName = stripped;
      }
      if (isKnownVariety(varietyName)) {
        filter.include = { ...filter.include, variety: varietyName };
        break;
      }
    }
  }

  // Pattern: exclusions
  const excludePatterns = [
    /(\w+)\s+percelen\s+(?:\w+\s+)?niet/,
    /(?:de\s+)?(\w+?)(?:s|\'s)?\s+trouwens\s+niet/,  // "de jonagolds trouwens niet"
    /de\s+(\w+?)(?:s|\'s)?\s+niet/,  // "de tessa niet", "de elstars niet"
    /niet\s+(?:de\s+)?(\w+?)(?:s|\'s)?(?:\s|$)/,
    /(?:behalve|zonder|geen)\s+(?:de\s+)?(\w+?)(?:s|\'s)?(?:\s|$)/,
    /toch\s+niet\s+(?:de\s+)?(\w+?)(?:s|\'s)?(?:\s|$)/,
  ];

  for (const pattern of excludePatterns) {
    const match = normalizedInput.match(pattern);
    if (match) {
      let excluded = match[1];
      // Strip trailing 's'
      if (excluded.endsWith('s') && !excluded.endsWith('ss')) {
        const stripped = excluded.slice(0, -1);
        if (isKnownVariety(stripped) || isKnownCrop(stripped)) excluded = stripped;
      }

      if (isKnownCrop(excluded)) {
        filter.exclude = { ...filter.exclude, crop_type: excluded };
        if (filter.include?.crop_type === excluded) delete filter.include.crop_type;
        break;
      } else if (isKnownVariety(excluded)) {
        filter.exclude = { ...filter.exclude, variety: excluded };
        if (filter.include?.variety === excluded) delete filter.include.variety;
        break;
      } else if (!excluded.match(/percelen?|trouwens|niet|ook|en/)) {
        filter.exclude = { ...filter.exclude, parcel_name: excluded };
        break;
      }
    }
  }

  // Pattern: "alles" or "alle percelen"
  if (/\b(alles|alle\s+percelen?|overal)\b/.test(normalizedInput) &&
      !filter.include && !filter.exclude) {
    return {};
  }

  // Cleanup
  if (filter.include && Object.keys(filter.include).length === 0) delete filter.include;
  if (filter.exclude && Object.keys(filter.exclude).length === 0) delete filter.exclude;
  if (!filter.include && !filter.exclude && !filter.specific_ids) return null;

  return filter;
}

function parseDutchDate(input, today = new Date()) {
  const normalized = input.toLowerCase();

  if (normalized.includes('vandaag')) {
    return today.toISOString().split('T')[0];
  }
  // Check eergisteren BEFORE gisteren (eergisteren contains gisteren!)
  if (normalized.includes('eergisteren')) {
    const d = new Date(today);
    d.setDate(d.getDate() - 2);
    return d.toISOString().split('T')[0];
  }
  if (normalized.includes('gisteren')) {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }
  if (/vorige\s+week/i.test(normalized)) {
    const d = new Date(today);
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  }

  // Day names
  const dayNames = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
  for (let i = 0; i < dayNames.length; i++) {
    if (normalized.includes(dayNames[i])) {
      const targetDay = i;
      const currentDay = today.getDay();
      let daysAgo = currentDay - targetDay;
      if (daysAgo <= 0) daysAgo += 7;
      const d = new Date(today);
      d.setDate(d.getDate() - daysAgo);
      return d.toISOString().split('T')[0];
    }
  }

  // Explicit dates
  const datePattern = /(\d{1,2})[-\/\s]*(jan|feb|mrt|apr|mei|jun|jul|aug|sep|okt|nov|dec|\d{1,2})/i;
  const match = normalized.match(datePattern);
  if (match) {
    const day = parseInt(match[1], 10);
    const monthStr = match[2].toLowerCase();
    const monthMap = {
      'jan': 0, 'feb': 1, 'mrt': 2, 'apr': 3, 'mei': 4, 'jun': 5,
      'jul': 6, 'aug': 7, 'sep': 8, 'okt': 9, 'nov': 10, 'dec': 11,
    };
    let month = monthMap[monthStr] !== undefined ? monthMap[monthStr] : parseInt(monthStr, 10) - 1;
    const year = today.getFullYear();
    const date = new Date(year, month, day);
    if (date > today) date.setFullYear(year - 1);
    return date.toISOString().split('T')[0];
  }

  return null;
}

function extractDosage(text) {
  const pattern = /(\d+[,.]?\d*)\s*(l|kg|ml|g)(\/ha)?/i;
  const match = text.match(pattern);
  if (!match) return null;
  return {
    dosage: parseFloat(match[1].replace(',', '.')),
    unit: match[2].toLowerCase() + (match[3] || ''),
  };
}

function preClassifyIntent(input) {
  const normalized = input.toLowerCase().trim();

  if (normalized.length < 10) {
    if (/^(ja|ok|oke|prima|klopt|correct|akkoord)[\s!.]*$/i.test(normalized)) {
      return { intent: 'confirm', confidence: 0.99 };
    }
    if (/^(nee|stop|cancel|annuleer)[\s!.]*$/i.test(normalized)) {
      return { intent: 'cancel', confidence: 0.95 };
    }
  }

  const spraySignals = [
    /\d+[,.]?\d*\s*(l|kg|ml|g)(\/ha)?/i,
    /(gespoten|gespuit|bespoten|behandeld)/i,
    /(gisteren|vandaag|vorige\s+week)/i,
  ];
  if (spraySignals.some(p => p.test(normalized))) {
    return { intent: 'register_spray', confidence: 0.85 };
  }

  if (/(hoeveel|wanneer|laatste\s+keer|dit\s+jaar|overzicht)/i.test(normalized)) {
    return { intent: 'query_history', confidence: 0.8 };
  }
  if (/(welke?\s+middel|wat\s+kan|alternatieven|waarmee)/i.test(normalized)) {
    return { intent: 'query_product', confidence: 0.8 };
  }
  if (/(vgt|veiligheidstermijn|dosering|maximum|toegelaten|mag\s+ik)/i.test(normalized)) {
    return { intent: 'query_regulation', confidence: 0.8 };
  }
  if (/(niet|behalve|zonder|toch\s+niet|voeg.*toe|verwijder)/i.test(normalized)) {
    return { intent: 'modify_draft', confidence: 0.75 };
  }

  return null;
}

// Filter application
function normalizeCropName(name) {
  const normalized = name.toLowerCase().trim();
  const variants = [normalized];
  const pluralMappings = {
    'appel': ['appel', 'appels'], 'appels': ['appel', 'appels'],
    'peer': ['peer', 'peren'], 'peren': ['peer', 'peren'],
    'kers': ['kers', 'kersen'], 'kersen': ['kers', 'kersen'],
    'pruim': ['pruim', 'pruimen'], 'pruimen': ['pruim', 'pruimen'],
  };
  if (pluralMappings[normalized]) variants.push(...pluralMappings[normalized]);
  if (normalized.endsWith('s')) variants.push(normalized.slice(0, -1));
  if (normalized.endsWith('en')) variants.push(normalized.slice(0, -2));
  return [...new Set(variants)];
}

function cropMatches(parcelCrop, filterCrop) {
  const filterVariants = normalizeCropName(filterCrop);
  const parcelLower = parcelCrop.toLowerCase();
  return filterVariants.some(v => parcelLower === v || parcelLower.includes(v) || v.includes(parcelLower));
}

function varietyMatches(parcelVariety, filterVariety) {
  if (!parcelVariety) return false;
  const parcelLower = parcelVariety.toLowerCase();
  const filterLower = filterVariety.toLowerCase();
  return parcelLower === filterLower || parcelLower.includes(filterLower) || filterLower.includes(parcelLower);
}

function applyLocationFilter(filter, allParcels) {
  let result = [...allParcels];

  if (filter.specific_ids?.length > 0) {
    result = allParcels.filter(p => filter.specific_ids.includes(p.id));
  }

  if (filter.include) {
    if (filter.include.crop_type) {
      result = result.filter(p => cropMatches(p.crop, filter.include.crop_type));
    }
    if (filter.include.variety) {
      result = result.filter(p => varietyMatches(p.variety, filter.include.variety));
    }
  }

  if (filter.exclude) {
    if (filter.exclude.crop_type) {
      result = result.filter(p => !cropMatches(p.crop, filter.exclude.crop_type));
    }
    if (filter.exclude.variety) {
      result = result.filter(p => !varietyMatches(p.variety, filter.exclude.variety));
    }
  }

  return { parcels: result, totalMatched: result.length };
}

// ============================================
// TEST UTILITIES
// ============================================

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    if (fn()) {
      console.log(`✓ ${name}`);
      passed++;
    } else {
      console.log(`✗ ${name}`);
      failed++;
      failures.push(name);
    }
  } catch (e) {
    console.log(`✗ ${name} - ERROR: ${e.message}`);
    failed++;
    failures.push(`${name} (${e.message})`);
  }
}

// ============================================
// MOCK DATA
// ============================================

const mockParcels = [
  { id: '1', name: 'Elstar 1', crop: 'Appel', variety: 'Elstar' },
  { id: '2', name: 'Elstar 2', crop: 'Appel', variety: 'Elstar' },
  { id: '3', name: 'Jonagold 1', crop: 'Appel', variety: 'Jonagold' },
  { id: '4', name: 'Tessa 1', crop: 'Appel', variety: 'Tessa' },
  { id: '5', name: 'Conference 1', crop: 'Peer', variety: 'Conference' },
  { id: '6', name: 'Conference 2', crop: 'Peer', variety: 'Conference' },
  { id: '7', name: 'Doyenne 1', crop: 'Peer', variety: 'Doyenne' },
];

const today = new Date('2026-01-23');

// ============================================
// TEST GROUP 1: Known Varieties & Crops
// ============================================

console.log('\n========================================');
console.log('TEST GROUP 1: Known Varieties & Crops');
console.log('========================================\n');

test('isKnownVariety: tessa', () => isKnownVariety('tessa'));
test('isKnownVariety: Tessa (caps)', () => isKnownVariety('Tessa'));
test('isKnownVariety: elstar', () => isKnownVariety('elstar'));
test('isKnownVariety: jonagold', () => isKnownVariety('jonagold'));
test('isKnownVariety: conference', () => isKnownVariety('conference'));
test('isKnownVariety: doyenne', () => isKnownVariety('doyenne'));
test('isKnownVariety: unknown', () => !isKnownVariety('randomname'));
test('isKnownCrop: appel', () => isKnownCrop('appel'));
test('isKnownCrop: appels', () => isKnownCrop('appels'));
test('isKnownCrop: peer', () => isKnownCrop('peer'));
test('isKnownCrop: peren', () => isKnownCrop('peren'));
test('isKnownCrop: unknown', () => !isKnownCrop('banaan'));

// ============================================
// TEST GROUP 2: Filter Parsing - Exclusions
// ============================================

console.log('\n========================================');
console.log('TEST GROUP 2: Filter Parsing - Exclusions');
console.log('========================================\n');

test('Excl: "De tessa percelen trouwens niet"', () => {
  const r = parseNaturalLocationFilter('De tessa percelen trouwens niet');
  return r?.exclude?.variety === 'tessa';
});

test('Excl: "tessa percelen niet"', () => {
  const r = parseNaturalLocationFilter('tessa percelen niet');
  return r?.exclude?.variety === 'tessa';
});

test('Excl: "behalve tessa"', () => {
  const r = parseNaturalLocationFilter('behalve tessa');
  return r?.exclude?.variety === 'tessa';
});

test('Excl: "zonder de jonagolds"', () => {
  const r = parseNaturalLocationFilter('zonder de jonagolds');
  return r?.exclude?.variety === 'jonagold';
});

test('Excl: "niet de elstars"', () => {
  const r = parseNaturalLocationFilter('niet de elstars');
  return r?.exclude?.variety === 'elstar';
});

test('Excl: "niet de elstar"', () => {
  const r = parseNaturalLocationFilter('niet de elstar');
  return r?.exclude?.variety === 'elstar';
});

test('Excl: "geen conference"', () => {
  const r = parseNaturalLocationFilter('geen conference');
  return r?.exclude?.variety === 'conference';
});

test('Excl: "toch niet de braeburns"', () => {
  const r = parseNaturalLocationFilter('toch niet de braeburns');
  return r?.exclude?.variety === 'braeburn';
});

test('Excl: "de tessa niet"', () => {
  const r = parseNaturalLocationFilter('de tessa niet');
  return r?.exclude?.variety === 'tessa';
});

test('Excl: "de elstar niet"', () => {
  const r = parseNaturalLocationFilter('de elstar niet');
  return r?.exclude?.variety === 'elstar';
});

test('Excl: "de jonagolds niet"', () => {
  const r = parseNaturalLocationFilter('de jonagolds niet');
  return r?.exclude?.variety === 'jonagold';
});

// ============================================
// TEST GROUP 3: Filter Parsing - Inclusions
// ============================================

console.log('\n========================================');
console.log('TEST GROUP 3: Filter Parsing - Inclusions');
console.log('========================================\n');

test('Incl: "de elstars"', () => {
  const r = parseNaturalLocationFilter('de elstars');
  return r?.include?.variety === 'elstar';
});

test('Incl: "de tessa"', () => {
  const r = parseNaturalLocationFilter('de tessa');
  return r?.include?.variety === 'tessa';
});

test('Incl: "tessa percelen"', () => {
  const r = parseNaturalLocationFilter('tessa percelen');
  return r?.include?.variety === 'tessa';
});

test('Incl: "de conference percelen"', () => {
  const r = parseNaturalLocationFilter('de conference percelen');
  return r?.include?.variety === 'conference';
});

test('Incl: "alle appels"', () => {
  const r = parseNaturalLocationFilter('alle appels');
  return r?.include?.crop_type === 'appels';
});

test('Incl: "alle peren"', () => {
  const r = parseNaturalLocationFilter('alle peren');
  return r?.include?.crop_type === 'peren';
});

// ============================================
// TEST GROUP 4: Combined Include + Exclude
// ============================================

console.log('\n========================================');
console.log('TEST GROUP 4: Combined Include + Exclude');
console.log('========================================\n');

test('Combo: "alle appels behalve elstar"', () => {
  const r = parseNaturalLocationFilter('alle appels behalve elstar');
  return r?.include?.crop_type === 'appels' && r?.exclude?.variety === 'elstar';
});

test('Combo: "alle peren zonder conference"', () => {
  const r = parseNaturalLocationFilter('alle peren zonder conference');
  return r?.include?.crop_type === 'peren' && r?.exclude?.variety === 'conference';
});

test('Combo: "alle appels niet de tessa"', () => {
  const r = parseNaturalLocationFilter('alle appels niet de tessa');
  return r?.include?.crop_type === 'appels' && r?.exclude?.variety === 'tessa';
});

// ============================================
// TEST GROUP 5: Edge Cases
// ============================================

console.log('\n========================================');
console.log('TEST GROUP 5: Edge Cases');
console.log('========================================\n');

test('Edge: "alles" → empty filter', () => {
  const r = parseNaturalLocationFilter('alles');
  return r !== null && Object.keys(r).length === 0;
});

test('Edge: "alle percelen" → empty filter', () => {
  const r = parseNaturalLocationFilter('alle percelen');
  return r !== null && Object.keys(r).length === 0;
});

test('Edge: "overal" → empty filter', () => {
  const r = parseNaturalLocationFilter('overal');
  return r !== null && Object.keys(r).length === 0;
});

test('Edge: unknown text → null', () => {
  const r = parseNaturalLocationFilter('wat een mooi weer vandaag');
  return r === null;
});

// ============================================
// TEST GROUP 6: Date Parsing
// ============================================

console.log('\n========================================');
console.log('TEST GROUP 6: Dutch Date Parsing');
console.log('========================================\n');

test('Date: "vandaag"', () => parseDutchDate('vandaag', today) === '2026-01-23');
test('Date: "gisteren"', () => parseDutchDate('gisteren', today) === '2026-01-22');
test('Date: "eergisteren"', () => parseDutchDate('eergisteren', today) === '2026-01-21');
test('Date: "vorige week"', () => parseDutchDate('vorige week', today) === '2026-01-16');
test('Date: unknown → null', () => parseDutchDate('gespoten', today) === null);

// ============================================
// TEST GROUP 7: Dosage Extraction
// ============================================

console.log('\n========================================');
console.log('TEST GROUP 7: Dosage Extraction');
console.log('========================================\n');

test('Dose: "2L"', () => {
  const r = extractDosage('2L');
  return r?.dosage === 2 && r?.unit === 'l';
});

test('Dose: "0.5 kg"', () => {
  const r = extractDosage('0.5 kg');
  return r?.dosage === 0.5 && r?.unit === 'kg';
});

test('Dose: "200ml"', () => {
  const r = extractDosage('200ml');
  return r?.dosage === 200 && r?.unit === 'ml';
});

test('Dose: "1,5 l/ha"', () => {
  const r = extractDosage('1,5 l/ha');
  return r?.dosage === 1.5 && r?.unit === 'l/ha';
});

test('Dose: "0.2kg Chorus"', () => {
  const r = extractDosage('0.2kg Chorus');
  return r?.dosage === 0.2 && r?.unit === 'kg';
});

test('Dose: no dosage → null', () => extractDosage('Chorus op alle appels') === null);

// ============================================
// TEST GROUP 8: Intent Pre-classification
// ============================================

console.log('\n========================================');
console.log('TEST GROUP 8: Intent Pre-classification');
console.log('========================================\n');

test('Intent: "ja" → confirm', () => preClassifyIntent('ja')?.intent === 'confirm');
test('Intent: "ok" → confirm', () => preClassifyIntent('ok')?.intent === 'confirm');
test('Intent: "nee" → cancel', () => preClassifyIntent('nee')?.intent === 'cancel');
test('Intent: "2L Captan gespoten" → register_spray', () => preClassifyIntent('2L Captan gespoten')?.intent === 'register_spray');
test('Intent: "gisteren 0.5kg Chorus" → register_spray', () => preClassifyIntent('gisteren 0.5kg Chorus')?.intent === 'register_spray');
test('Intent: "hoeveel captan dit jaar" → query_history', () => preClassifyIntent('hoeveel captan dit jaar')?.intent === 'query_history');
test('Intent: "wat is de dosering" → query_regulation', () => preClassifyIntent('wat is de dosering van Decis')?.intent === 'query_regulation');
test('Intent: "niet de tessa" → modify_draft', () => preClassifyIntent('niet de tessa')?.intent === 'modify_draft');
test('Intent: "behalve elstar" → modify_draft', () => preClassifyIntent('behalve elstar')?.intent === 'modify_draft');

// ============================================
// TEST GROUP 9: Filter Application
// ============================================

console.log('\n========================================');
console.log('TEST GROUP 9: Filter Application');
console.log('========================================\n');

test('Apply: no filter → 7 parcels', () => applyLocationFilter({}, mockParcels).totalMatched === 7);
test('Apply: crop Appel → 4', () => applyLocationFilter({ include: { crop_type: 'Appel' } }, mockParcels).totalMatched === 4);
test('Apply: crop Peer → 3', () => applyLocationFilter({ include: { crop_type: 'Peer' } }, mockParcels).totalMatched === 3);
test('Apply: variety Elstar → 2', () => applyLocationFilter({ include: { variety: 'Elstar' } }, mockParcels).totalMatched === 2);
test('Apply: excl Tessa → 6', () => applyLocationFilter({ exclude: { variety: 'Tessa' } }, mockParcels).totalMatched === 6);
test('Apply: Appel excl Tessa → 3', () => applyLocationFilter({ include: { crop_type: 'Appel' }, exclude: { variety: 'Tessa' } }, mockParcels).totalMatched === 3);
test('Apply: Peer excl Conference → 1', () => applyLocationFilter({ include: { crop_type: 'Peer' }, exclude: { variety: 'Conference' } }, mockParcels).totalMatched === 1);
test('Apply: specific IDs → 3', () => applyLocationFilter({ specific_ids: ['1', '3', '5'] }, mockParcels).totalMatched === 3);

// ============================================
// TEST GROUP 10: Full Integration
// ============================================

console.log('\n========================================');
console.log('TEST GROUP 10: Full Integration');
console.log('========================================\n');

test('Integration: "De tessa percelen trouwens niet" → 6', () => {
  const filter = parseNaturalLocationFilter('De tessa percelen trouwens niet');
  if (!filter) return false;
  return applyLocationFilter(filter, mockParcels).totalMatched === 6;
});

test('Integration: "alle appels behalve elstar" → 2', () => {
  const filter = parseNaturalLocationFilter('alle appels behalve elstar');
  if (!filter) return false;
  return applyLocationFilter(filter, mockParcels).totalMatched === 2;
});

test('Integration: "de conference percelen" → 2', () => {
  const filter = parseNaturalLocationFilter('de conference percelen');
  if (!filter) return false;
  return applyLocationFilter(filter, mockParcels).totalMatched === 2;
});

test('Integration: "alle peren zonder conference" → 1', () => {
  const filter = parseNaturalLocationFilter('alle peren zonder conference');
  if (!filter) return false;
  return applyLocationFilter(filter, mockParcels).totalMatched === 1;
});

test('Integration: "de elstars" → 2', () => {
  const filter = parseNaturalLocationFilter('de elstars');
  if (!filter) return false;
  return applyLocationFilter(filter, mockParcels).totalMatched === 2;
});

// ============================================
// TEST GROUP 11: Real-world Scenarios
// ============================================

console.log('\n========================================');
console.log('TEST GROUP 11: Real-world Scenarios');
console.log('========================================\n');

test('Real: "Vandaag alle conference gespoten met 2L Captan"', () => {
  const intent = preClassifyIntent('Vandaag alle conference gespoten met 2L Captan');
  const date = parseDutchDate('Vandaag alle conference gespoten', today);
  const dose = extractDosage('2L Captan');
  return intent?.intent === 'register_spray' && date === '2026-01-23' && dose?.dosage === 2;
});

test('Real: "Gisteren 0.5kg Chorus op alle appels behalve tessa"', () => {
  const intent = preClassifyIntent('Gisteren 0.5kg Chorus op alle appels behalve tessa');
  const date = parseDutchDate('Gisteren', today);
  const dose = extractDosage('0.5kg Chorus');
  const filter = parseNaturalLocationFilter('alle appels behalve tessa');
  const result = applyLocationFilter(filter, mockParcels);
  return intent?.intent === 'register_spray' &&
         date === '2026-01-22' &&
         dose?.dosage === 0.5 &&
         result.totalMatched === 3; // Appel (4) - Tessa (1) = 3
});

test('Real: "De jonagolds trouwens niet"', () => {
  const intent = preClassifyIntent('De jonagolds trouwens niet');
  const filter = parseNaturalLocationFilter('De jonagolds trouwens niet');
  return intent?.intent === 'modify_draft' && filter?.exclude?.variety === 'jonagold';
});

test('Real: "Nee, zonder de elstars"', () => {
  const filter = parseNaturalLocationFilter('zonder de elstars');
  const result = applyLocationFilter(filter, mockParcels);
  return filter?.exclude?.variety === 'elstar' && result.totalMatched === 5;
});

// ============================================
// FINAL SUMMARY
// ============================================

console.log('\n========================================');
console.log('FINAL RESULTS');
console.log('========================================\n');

console.log(`Total:  ${passed + failed} tests`);
console.log(`Passed: ${passed} ✓`);
console.log(`Failed: ${failed} ✗`);

if (failures.length > 0) {
  console.log('\nFailed tests:');
  failures.forEach(f => console.log(`  - ${f}`));
}

console.log('\n');
process.exit(failed > 0 ? 1 : 0);
