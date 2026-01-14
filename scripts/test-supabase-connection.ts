#!/usr/bin/env npx tsx
/**
 * Test Supabase Connection Script
 *
 * Dit script test de verbinding met Supabase en haalt
 * een rij uit de ctgb_products tabel op.
 *
 * Gebruik:
 *   npx tsx scripts/test-supabase-connection.ts
 *
 * Voorwaarden:
 *   1. De tabel ctgb_products moet bestaan in Supabase
 *   2. Er moet minimaal 1 rij in de tabel staan
 *   3. .env.local moet NEXT_PUBLIC_SUPABASE_URL en NEXT_PUBLIC_SUPABASE_ANON_KEY bevatten
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function testConnection() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║       Supabase Connection Test                     ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  // Check environment variables
  console.log('--- Stap 1: Environment Variables ---\n');

  if (!supabaseUrl) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL is niet gevonden in .env.local');
    process.exit(1);
  }
  console.log(`✓ SUPABASE_URL: ${supabaseUrl}`);

  if (!supabaseAnonKey) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_ANON_KEY is niet gevonden in .env.local');
    process.exit(1);
  }
  console.log(`✓ SUPABASE_ANON_KEY: ${supabaseAnonKey.substring(0, 20)}...`);

  // Create client
  console.log('\n--- Stap 2: Verbinding maken ---\n');

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  console.log('✓ Supabase client aangemaakt');

  // Test connection by fetching from ctgb_products
  console.log('\n--- Stap 3: Data ophalen uit ctgb_products ---\n');

  try {
    const { data, error, count } = await supabase
      .from('ctgb_products')
      .select('*', { count: 'exact' })
      .limit(1);

    if (error) {
      console.error('❌ Fout bij ophalen data:', error.message);
      console.log('\n💡 Tip: Heb je de SQL al uitgevoerd in de Supabase SQL Editor?');
      console.log('   Zie: sql/create_ctgb_products.sql');
      process.exit(1);
    }

    console.log(`✓ Verbinding succesvol!`);
    console.log(`  Aantal records in tabel: ${count ?? 'onbekend'}`);

    if (data && data.length > 0) {
      console.log('\n--- Voorbeeld record ---\n');
      const product = data[0];
      console.log(`  Naam: ${product.naam}`);
      console.log(`  Toelatingsnummer: ${product.toelatingsnummer}`);
      console.log(`  Status: ${product.status}`);
      console.log(`  Categorie: ${product.categorie}`);
      console.log(`  Werkzame stoffen: ${product.werkzame_stoffen?.join(', ') || 'geen'}`);
    } else {
      console.log('\n⚠️  Tabel is leeg. Voer eerst data migratie uit.');
    }

  } catch (err) {
    console.error('❌ Onverwachte fout:', err);
    process.exit(1);
  }

  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║              TEST GESLAAGD ✓                       ║');
  console.log('╚════════════════════════════════════════════════════╝\n');
}

testConnection();
