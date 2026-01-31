import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://djcsihpnidopxxuxumvj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqY3NpaHBuaWRvcHh4dXh1bXZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzNTk3MTQsImV4cCI6MjA4MzkzNTcxNH0.2UANr8oKdFMlQ9cVJKLDclN6BVeIcrfnkqNmiM6m0Y8'
);

// Simulate extractSearchTerms
function extractSearchTerms(userInput) {
  const STOP_WORDS = new Set([
    'de', 'het', 'een', 'en', 'van', 'in', 'op', 'met', 'voor', 'naar',
    'alle', 'dit', 'dat', 'deze', 'die', 'is', 'zijn', 'was', 'werden',
    'gespoten', 'spuiten', 'spray', 'behandeld', 'toegepast', 'gedaan'
  ]);

  const CROP_WORDS = new Set([
    'peer', 'peren', 'appel', 'appels', 'kers', 'kersen', 'pruim', 'pruimen',
    'elstar', 'jonagold', 'braeburn', 'golden', 'conference', 'doyenne'
  ]);

  const normalizedInput = userInput.toLowerCase();
  const tokens = normalizedInput
    .split(/[\s,.!?]+/)
    .map(t => t.trim())
    .filter(t => t.length > 2);

  const productTerms = [];
  const contextTerms = [];

  for (const token of tokens) {
    if (STOP_WORDS.has(token)) continue;
    if (/^\d+[,.]?\d*$/.test(token)) continue;
    if (CROP_WORDS.has(token)) {
      contextTerms.push(token);
    } else {
      productTerms.push(token);
    }
  }

  return { productTerms, contextTerms };
}

// Simulate searchCtgbProducts
async function searchCtgbProducts(searchTerm) {
  if (!searchTerm || searchTerm.length < 2) return [];
  const normalizedSearch = searchTerm.toLowerCase().trim();

  const { data, error } = await supabase
    .from('ctgb_products')
    .select('naam, toelatingsnummer, search_keywords, werkzame_stoffen, formulering')
    .contains('search_keywords', [normalizedSearch]);

  if (error) {
    console.log(`  Error searching "${searchTerm}":`, error.message);
    return [];
  }
  return data || [];
}

// Simulate getCtgbProductsByNames
async function getCtgbProductsByNames(names) {
  if (!names || names.length === 0) return [];
  const normalizedNames = names.map(n => n.toLowerCase().trim()).filter(Boolean);

  const { data, error } = await supabase
    .from('ctgb_products')
    .select('naam, toelatingsnummer, search_keywords, werkzame_stoffen, formulering')
    .or(normalizedNames.map(n => `naam.ilike.%${n}%`).join(','));

  if (error) {
    console.log(`  Error in getCtgbProductsByNames:`, error.message);
    return [];
  }
  return data || [];
}

async function debugScoreSurround() {
  console.log('=== DEBUG: Score vs Surround Issue ===\n');

  const testInput = 'merpan en score';
  console.log(`Test input: "${testInput}"\n`);

  // Step 1: Extract search terms
  console.log('--- Step 1: extractSearchTerms ---');
  const { productTerms, contextTerms } = extractSearchTerms(testInput);
  console.log(`Product terms: [${productTerms.join(', ')}]`);
  console.log(`Context terms: [${contextTerms.join(', ')}]`);
  console.log();

  // Step 2: getCtgbProductsByNames (used in analyze-input)
  console.log('--- Step 2: getCtgbProductsByNames ---');
  const matchedProducts = await getCtgbProductsByNames(productTerms);
  console.log(`Found ${matchedProducts.length} products:`);
  matchedProducts.forEach(p => {
    console.log(`  - ${p.naam} (${p.toelatingsnummer})`);
    console.log(`    Formulering: ${p.formulering || 'N/A'}`);
    console.log(`    Keywords: ${JSON.stringify(p.search_keywords?.slice(0, 5))}...`);
  });
  console.log();

  // Step 3: searchCtgbProducts for each term (used in RAG)
  console.log('--- Step 3: searchCtgbProducts (for RAG context) ---');
  for (const term of productTerms) {
    const results = await searchCtgbProducts(term);
    console.log(`\nSearch for "${term}" in search_keywords:`);
    if (results.length === 0) {
      console.log(`  NO MATCHES FOUND!`);
    } else {
      results.forEach(p => {
        console.log(`  - ${p.naam} (${p.toelatingsnummer})`);
      });
    }
  }
  console.log();

  // Step 4: Check PRODUCT_ALIASES simulation
  console.log('--- Step 4: PRODUCT_ALIASES check ---');
  const PRODUCT_ALIASES = {
    'score': 'Score 250 EC',
    'surround': 'Surround WP',
    'merpan': 'Merpan spuitkorrel',
  };

  for (const term of productTerms) {
    const alias = PRODUCT_ALIASES[term.toLowerCase()];
    console.log(`"${term}" -> ${alias ? `"${alias}"` : '(no alias)'}`);
  }
  console.log();

  // Step 5: Check if Surround contains "score" in its keywords
  console.log('--- Step 5: Checking Surround product ---');
  const { data: surroundData } = await supabase
    .from('ctgb_products')
    .select('naam, search_keywords, werkzame_stoffen')
    .ilike('naam', '%Surround%');

  if (surroundData?.length) {
    surroundData.forEach(p => {
      console.log(`Product: ${p.naam}`);
      console.log(`Keywords: ${JSON.stringify(p.search_keywords)}`);
      console.log(`Has "score" in keywords: ${p.search_keywords?.includes('score') || false}`);
    });
  }
  console.log();

  // Step 6: Check if there's any product with both "score" and "surround"
  console.log('--- Step 6: Cross-check for confusion ---');
  const { data: scoreProducts } = await supabase
    .from('ctgb_products')
    .select('naam, search_keywords')
    .contains('search_keywords', ['score']);

  console.log(`Products with "score" in search_keywords:`);
  scoreProducts?.forEach(p => {
    console.log(`  - ${p.naam}`);
    if (p.search_keywords?.some(k => k.includes('surround'))) {
      console.log(`    ⚠️ ALSO HAS "surround" in keywords!`);
    }
  });

  // Step 7: Check Merpan formulation for unit determination
  console.log('\n--- Step 7: Merpan formulation check ---');
  const { data: merpanData } = await supabase
    .from('ctgb_products')
    .select('naam, formulering, werkzame_stoffen, gebruiksvoorschriften')
    .ilike('naam', '%Merpan%');

  if (merpanData?.length) {
    merpanData.forEach(p => {
      console.log(`\nProduct: ${p.naam}`);
      console.log(`Formulering: ${p.formulering || 'N/A'}`);
      // Check if it's a powder/granule
      const isPowder = /spuitkorrel|korrel|poeder|wg|wp|wdg|df|granul/i.test(p.naam) ||
                       /spuitkorrel|korrel|poeder|wg|wp|wdg|df|granul/i.test(p.formulering || '');
      console.log(`Is powder/granule: ${isPowder} -> Unit should be: ${isPowder ? 'kg' : 'L'}`);

      // Check gebruiksvoorschriften for dosage units
      const voorschriften = p.gebruiksvoorschriften || [];
      if (voorschriften.length > 0) {
        console.log(`First gebruiksvoorschrift dosering: ${voorschriften[0]?.dosering || 'N/A'}`);
      }
    });
  }

  console.log('\n=== END DEBUG ===');
}

debugScoreSurround().catch(console.error);
