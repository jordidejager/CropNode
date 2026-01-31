import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://djcsihpnidopxxuxumvj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqY3NpaHBuaWRvcHh4dXh1bXZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzNTk3MTQsImV4cCI6MjA4MzkzNTcxNH0.2UANr8oKdFMlQ9cVJKLDclN6BVeIcrfnkqNmiM6m0Y8'
);

async function testSearch() {
  console.log('=== Testing Product Search ===\n');

  // Simulate what getCtgbProductsByNames does
  const names = ['merpan', 'score'];
  const normalizedNames = names.map(n => n.toLowerCase().trim());

  console.log('Searching for:', normalizedNames);
  console.log('Query:', normalizedNames.map(n => `naam.ilike.%${n}%`).join(','));

  const { data, error } = await supabase
    .from('ctgb_products')
    .select('naam, toelatingsnummer')
    .or(normalizedNames.map(n => `naam.ilike.%${n}%`).join(','));

  if (error) {
    console.log('Error:', error);
    return;
  }

  console.log(`\nFound ${data?.length || 0} products:`);
  data?.forEach(p => {
    console.log(`  - ${p.naam} (${p.toelatingsnummer})`);
  });

  // Also test search_keywords
  console.log('\n--- Testing search_keywords ---\n');

  for (const term of names) {
    const { data: keywordData, error: keywordError } = await supabase
      .from('ctgb_products')
      .select('naam')
      .contains('search_keywords', [term]);

    console.log(`"${term}" in search_keywords:`);
    if (keywordError) console.log('  Error:', keywordError);
    else if (!keywordData?.length) console.log('  No matches');
    else keywordData.forEach(p => console.log(`  - ${p.naam}`));
  }
}

testSearch().catch(console.error);
