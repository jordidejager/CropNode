import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://djcsihpnidopxxuxumvj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqY3NpaHBuaWRvcHh4dXh1bXZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzNTk3MTQsImV4cCI6MjA4MzkzNTcxNH0.2UANr8oKdFMlQ9cVJKLDclN6BVeIcrfnkqNmiM6m0Y8'
);

async function checkProducts() {
  console.log('=== Checking Products ===\n');

  // Check Score 250 EC
  console.log('1. Searching for "Score" in naam:');
  const { data: scoreData, error: scoreError } = await supabase
    .from('ctgb_products')
    .select('naam, search_keywords, werkzame_stoffen')
    .ilike('naam', '%Score%');

  if (scoreError) console.log('Error:', scoreError);
  else {
    scoreData?.forEach(p => {
      console.log(`  - ${p.naam}`);
      console.log(`    keywords: ${JSON.stringify(p.search_keywords)}`);
    });
    if (!scoreData?.length) console.log('  No products found!');
  }

  // Check what happens with search_keywords containing "score"
  console.log('\n2. Searching for products with "score" in search_keywords:');
  const { data: keywordData, error: keywordError } = await supabase
    .from('ctgb_products')
    .select('naam, search_keywords')
    .contains('search_keywords', ['score']);

  if (keywordError) console.log('Error:', keywordError);
  else {
    keywordData?.forEach(p => {
      console.log(`  - ${p.naam}`);
    });
    if (!keywordData?.length) console.log('  No products found with "score" keyword!');
  }

  // Check Surround
  console.log('\n3. Checking Surround products:');
  const { data: surroundData, error: surroundError } = await supabase
    .from('ctgb_products')
    .select('naam, search_keywords')
    .ilike('naam', '%Surround%');

  if (surroundError) console.log('Error:', surroundError);
  else {
    surroundData?.forEach(p => {
      console.log(`  - ${p.naam}`);
      console.log(`    keywords: ${JSON.stringify(p.search_keywords)}`);
    });
  }

  // Check Merpan
  console.log('\n4. Checking Merpan products:');
  const { data: merpanData, error: merpanError } = await supabase
    .from('ctgb_products')
    .select('naam, search_keywords, categorie')
    .ilike('naam', '%Merpan%');

  if (merpanError) console.log('Error:', merpanError);
  else {
    merpanData?.forEach(p => {
      console.log(`  - ${p.naam} (${p.categorie})`);
      console.log(`    keywords: ${JSON.stringify(p.search_keywords)}`);
    });
  }

  // Check how many products total
  console.log('\n5. Total products in database:');
  const { count, error: countError } = await supabase
    .from('ctgb_products')
    .select('*', { count: 'exact', head: true });

  if (countError) console.log('Error:', countError);
  else console.log(`  ${count} products`);
}

checkProducts().catch(console.error);
