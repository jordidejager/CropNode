/**
 * Generate comprehensive product aliases from CTGB database
 *
 * This script fetches all products and generates predictable aliases:
 * - Short names (first word of product name)
 * - Common abbreviations
 * - Without formulation codes
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://djcsihpnidopxxuxumvj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqY3NpaHBuaWRvcHh4dXh1bXZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzNTk3MTQsImV4cCI6MjA4MzkzNTcxNH0.2UANr8oKdFMlQ9cVJKLDclN6BVeIcrfnkqNmiM6m0Y8'
);

// Formulation codes to strip
const FORMULATION_CODES = [
  'WG', 'WP', 'WDG', 'DF', 'SG', 'SP', // Powders/granules
  'SC', 'EC', 'SL', 'SE', 'EW', 'OD', 'CS', 'DC', 'ME', // Liquids
  'ZC', 'ZW', 'FS', 'GR', 'RB', 'TB', 'WS', // Others
];

// Words to skip as standalone aliases (too generic)
const SKIP_WORDS = new Set([
  'crop', 'protectant', 'pro', 'plus', 'max', 'ultra', 'gold', 'super',
  'bio', 'new', 'advanced', 'premium', 'extra', 'forte',
]);

// Existing aliases (to avoid duplicates)
const EXISTING_ALIASES = new Set([
  'captan', 'captaan', 'merpan', 'batavia', 'delan', 'scala', 'bellis',
  'flint', 'chorus', 'topsin', 'teldor', 'switch', 'luna', 'calypso',
  'movento', 'pirimor', 'karate', 'decis', 'tracer', 'steward', 'runner',
  'envidor', 'nissorun', 'apollo', 'floramite', 'score', 'coragen', 'surround',
  'dithianon', 'pyrimethanil', 'boscalid', 'trifloxystrobin', 'cyprodinil',
  'thiophanate-methyl', 'fenhexamid', 'fluopyram', 'thiacloprid', 'spirotetramat',
  'pirimicarb', 'lambda-cyhalothrin', 'deltamethrin', 'spinosad', 'indoxacarb',
  'methoxyfenozide', 'spirodiclofen', 'hexythiazox', 'clofentezine', 'bifenazaat',
]);

async function generateAliases() {
  console.log('=== Generating Product Aliases from CTGB Database ===\n');

  // Fetch all products
  const { data: products, error } = await supabase
    .from('ctgb_products')
    .select('naam, toelatingsnummer, werkzame_stoffen')
    .eq('status', 'Valid')
    .order('naam');

  if (error) {
    console.error('Error fetching products:', error.message);
    return;
  }

  console.log(`Found ${products.length} valid products\n`);

  // Generate aliases
  const aliases = new Map(); // alias -> product name
  const ambiguous = new Map(); // alias -> [product names] (for conflicts)

  for (const product of products) {
    const name = product.naam;
    const nameLower = name.toLowerCase();

    // 1. Extract base name (without formulation code and numbers)
    let baseName = name;

    // Remove registered trademark symbols
    baseName = baseName.replace(/[®™]/g, '');

    // Remove formulation codes at the end
    for (const code of FORMULATION_CODES) {
      const pattern = new RegExp(`\\s+${code}$`, 'i');
      baseName = baseName.replace(pattern, '');
    }

    // Remove trailing numbers and spaces (like "250", "80", "500")
    baseName = baseName.replace(/\s+\d+(\s*(g\/l|g|mg|%|ec|sc))?$/i, '').trim();

    // Get first word as potential alias
    const firstWord = baseName.split(/\s+/)[0].toLowerCase();

    // Skip if too short or in skip list
    if (firstWord.length >= 3 && !SKIP_WORDS.has(firstWord) && !EXISTING_ALIASES.has(firstWord)) {
      if (aliases.has(firstWord)) {
        // Conflict - multiple products with same first word
        if (!ambiguous.has(firstWord)) {
          ambiguous.set(firstWord, [aliases.get(firstWord)]);
        }
        ambiguous.get(firstWord).push(name);
      } else {
        aliases.set(firstWord, name);
      }
    }

    // 2. Full base name (without formulation code) as alias
    const baseNameLower = baseName.toLowerCase().trim();
    if (baseNameLower !== firstWord && baseNameLower.length >= 4 && !EXISTING_ALIASES.has(baseNameLower)) {
      aliases.set(baseNameLower, name);
    }
  }

  // Remove ambiguous aliases
  for (const [alias, products] of ambiguous) {
    aliases.delete(alias);
    console.log(`Ambiguous alias "${alias}" matches: ${products.join(', ')}`);
  }

  console.log(`\n=== Generated ${aliases.size} unique aliases ===\n`);

  // Output as JavaScript object
  console.log('// Add to PRODUCT_ALIASES in product-aliases.ts:');
  console.log('const GENERATED_ALIASES: Record<string, string> = {');

  const sortedAliases = Array.from(aliases.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [alias, product] of sortedAliases) {
    // Skip if alias is same as product name (case-insensitive)
    if (alias.toLowerCase() === product.toLowerCase()) continue;
    console.log(`    '${alias}': '${product}',`);
  }
  console.log('};');

  // Also list products that might need manual aliases
  console.log('\n=== Products that might need manual aliases ===');
  const commonProducts = products
    .filter(p => p.werkzame_stoffen && p.werkzame_stoffen.length > 0)
    .filter(p => {
      const firstWord = p.naam.split(/\s+/)[0].toLowerCase();
      return !aliases.has(firstWord) && !EXISTING_ALIASES.has(firstWord);
    })
    .slice(0, 30);

  for (const p of commonProducts) {
    console.log(`  ${p.naam} (${p.werkzame_stoffen?.join(', ')})`);
  }
}

generateAliases().catch(console.error);
