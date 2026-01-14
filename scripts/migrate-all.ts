#!/usr/bin/env npx tsx
/**
 * Master Migration Script: Firestore -> Supabase
 *
 * Dit script migreert ALLE Firestore collecties naar Supabase.
 * Gebruikt de Supabase JS client (REST API) voor maximale compatibiliteit.
 *
 * Gebruik:
 *   npx tsx scripts/migrate-all.ts
 *
 * Opties:
 *   --dry-run       Toon wat er zou gebeuren maar voer niet uit
 *   --collection=X  Migreer alleen collectie X
 *   --skip-create   Skip CREATE TABLE (tabellen bestaan al)
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, Timestamp } from 'firebase/firestore';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

// ============================================
// CONFIGURATION
// ============================================

const COLLECTIONS = [
  'logbook',
  'parcelHistory',
  'parcels',
  'userPreferences',
  'inventoryMovements',
  'ctgb_products',
  'spuitschrift',
  'fertilizers',
] as const;

type CollectionName = (typeof COLLECTIONS)[number];

// Firebase config
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Supabase config
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// ============================================
// CLI ARGUMENTS
// ============================================

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const skipCreate = args.includes('--skip-create');
const collectionArg = args.find(a => a.startsWith('--collection='));
const onlyCollection = collectionArg ? collectionArg.split('=')[1] : null;

// ============================================
// TABLE SCHEMAS (for manual creation in Supabase Dashboard)
// ============================================

const TABLE_SCHEMAS: Record<CollectionName, string> = {
  logbook: `
CREATE TABLE IF NOT EXISTS logbook (
  id TEXT PRIMARY KEY,
  raw_input TEXT,
  status TEXT,
  date TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  parsed_data JSONB,
  validation_message TEXT,
  original_logbook_id TEXT
);`,

  parcelHistory: `
CREATE TABLE IF NOT EXISTS parcel_history (
  id TEXT PRIMARY KEY,
  log_id TEXT,
  spuitschrift_id TEXT,
  parcel_id TEXT,
  parcel_name TEXT,
  crop TEXT,
  variety TEXT,
  product TEXT,
  dosage DECIMAL,
  unit TEXT,
  date TIMESTAMPTZ
);`,

  parcels: `
CREATE TABLE IF NOT EXISTS parcels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  crop TEXT,
  variety TEXT,
  area DECIMAL,
  location JSONB,
  geometry JSONB,
  source TEXT,
  rvo_id TEXT
);`,

  userPreferences: `
CREATE TABLE IF NOT EXISTS user_preferences (
  id TEXT PRIMARY KEY,
  alias TEXT NOT NULL,
  preferred TEXT NOT NULL
);`,

  inventoryMovements: `
CREATE TABLE IF NOT EXISTS inventory_movements (
  id TEXT PRIMARY KEY,
  product_name TEXT NOT NULL,
  quantity DECIMAL,
  unit TEXT,
  type TEXT,
  date TIMESTAMPTZ,
  description TEXT,
  reference_id TEXT
);`,

  ctgb_products: `
CREATE TABLE IF NOT EXISTS ctgb_products (
  id TEXT PRIMARY KEY,
  toelatingsnummer TEXT UNIQUE,
  naam TEXT NOT NULL,
  status TEXT,
  vervaldatum TEXT,
  categorie TEXT,
  toelatingshouder TEXT,
  werkzame_stoffen TEXT[],
  samenstelling JSONB,
  gebruiksvoorschriften JSONB,
  etikettering JSONB,
  search_keywords TEXT[],
  last_synced_at TIMESTAMPTZ
);`,

  spuitschrift: `
CREATE TABLE IF NOT EXISTS spuitschrift (
  id TEXT PRIMARY KEY,
  spuitschrift_id TEXT,
  original_logbook_id TEXT,
  original_raw_input TEXT,
  date TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  plots TEXT[],
  products JSONB,
  validation_message TEXT,
  status TEXT
);`,

  fertilizers: `
CREATE TABLE IF NOT EXISTS fertilizers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  manufacturer TEXT,
  category TEXT,
  unit TEXT,
  composition JSONB,
  search_keywords TEXT[]
);`,
};

// ============================================
// DATA TRANSFORMERS
// ============================================

function convertTimestamp(value: any): string | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value.toDate && typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value === 'string') return new Date(value).toISOString();
  if (value.seconds) return new Date(value.seconds * 1000).toISOString();
  return null;
}

function transformDocument(collectionName: CollectionName, docId: string, data: any): Record<string, any> {
  switch (collectionName) {
    case 'logbook':
      return {
        id: docId,
        raw_input: data.rawInput,
        status: data.status,
        date: convertTimestamp(data.date),
        created_at: convertTimestamp(data.createdAt),
        parsed_data: data.parsedData || null,
        validation_message: data.validationMessage,
        original_logbook_id: data.originalLogbookId,
      };

    case 'parcelHistory':
      return {
        id: docId,
        log_id: data.logId,
        spuitschrift_id: data.spuitschriftId,
        parcel_id: data.parcelId,
        parcel_name: data.parcelName,
        crop: data.crop,
        variety: data.variety,
        product: data.product,
        dosage: data.dosage,
        unit: data.unit,
        date: convertTimestamp(data.date),
      };

    case 'parcels':
      let geometry = data.geometry;
      if (typeof geometry === 'string') {
        try {
          geometry = JSON.parse(geometry);
        } catch {
          // Keep as string if parsing fails
        }
      }
      return {
        id: docId,
        name: data.name,
        crop: data.crop,
        variety: data.variety,
        area: data.area,
        location: data.location || null,
        geometry: geometry || null,
        source: data.source,
        rvo_id: data.rvoId,
      };

    case 'userPreferences':
      return {
        id: docId,
        alias: data.alias,
        preferred: data.preferred,
      };

    case 'inventoryMovements':
      return {
        id: docId,
        product_name: data.productName,
        quantity: data.quantity,
        unit: data.unit,
        type: data.type,
        date: convertTimestamp(data.date),
        description: data.description,
        reference_id: data.referenceId,
      };

    case 'ctgb_products':
      return {
        id: docId,
        toelatingsnummer: data.toelatingsnummer,
        naam: data.naam,
        status: data.status,
        vervaldatum: data.vervaldatum,
        categorie: data.categorie,
        toelatingshouder: data.toelatingshouder,
        werkzame_stoffen: data.werkzameStoffen || [],
        samenstelling: data.samenstelling || null,
        gebruiksvoorschriften: data.gebruiksvoorschriften || [],
        etikettering: data.etikettering || null,
        search_keywords: data.searchKeywords || [],
        last_synced_at: convertTimestamp(data.lastSyncedAt),
      };

    case 'spuitschrift':
      return {
        id: docId,
        spuitschrift_id: data.spuitschriftId,
        original_logbook_id: data.originalLogbookId,
        original_raw_input: data.originalRawInput,
        date: convertTimestamp(data.date),
        created_at: convertTimestamp(data.createdAt),
        plots: data.plots || [],
        products: data.products || [],
        validation_message: data.validationMessage,
        status: data.status,
      };

    case 'fertilizers':
      return {
        id: docId,
        name: data.name,
        manufacturer: data.manufacturer,
        category: data.category,
        unit: data.unit,
        composition: data.composition || null,
        search_keywords: data.searchKeywords || [],
      };

    default:
      return { id: docId, ...data };
  }
}

// ============================================
// TABLE NAME MAPPING
// ============================================

function getTableName(collectionName: CollectionName): string {
  const mapping: Record<CollectionName, string> = {
    logbook: 'logbook',
    parcelHistory: 'parcel_history',
    parcels: 'parcels',
    userPreferences: 'user_preferences',
    inventoryMovements: 'inventory_movements',
    ctgb_products: 'ctgb_products',
    spuitschrift: 'spuitschrift',
    fertilizers: 'fertilizers',
  };
  return mapping[collectionName];
}

// ============================================
// MAIN MIGRATION FUNCTIONS
// ============================================

async function createTableIfNeeded(supabase: SupabaseClient, collectionName: CollectionName): Promise<boolean> {
  const tableName = getTableName(collectionName);

  // Test if table exists by doing a simple query
  const { error } = await supabase.from(tableName).select('id').limit(1);

  if (error && error.code === '42P01') {
    // Table doesn't exist
    console.log(`  ⚠️  Tabel '${tableName}' bestaat niet.`);
    console.log(`  📋 Voer deze SQL uit in Supabase Dashboard > SQL Editor:\n`);
    console.log(TABLE_SCHEMAS[collectionName]);
    console.log('\n  🔗 https://supabase.com/dashboard/project/djcsihpnidopxxuxumvj/sql/new\n');
    return false;
  }

  return true;
}

async function migrateCollection(
  firestoreDb: any,
  supabase: SupabaseClient,
  collectionName: CollectionName
): Promise<{ success: boolean; count: number; error?: string }> {
  const tableName = getTableName(collectionName);

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`📦 Migreren: ${collectionName} -> ${tableName}`);
  console.log(`${'─'.repeat(50)}`);

  try {
    // Step 1: Check if table exists
    if (!skipCreate) {
      console.log('  📋 Tabel controleren...');
      const tableExists = await createTableIfNeeded(supabase, collectionName);
      if (!tableExists) {
        return { success: false, count: 0, error: 'Tabel bestaat niet' };
      }
      console.log('  ✓ Tabel bestaat');
    }

    // Step 2: Fetch all documents from Firestore
    console.log('  📥 Data ophalen uit Firestore...');
    const snapshot = await getDocs(collection(firestoreDb, collectionName));
    const docCount = snapshot.size;

    if (docCount === 0) {
      console.log('  ⚠️  Collectie is leeg, overslaan.');
      return { success: true, count: 0 };
    }

    console.log(`  ✓ ${docCount} documenten gevonden`);

    // Step 3: Transform documents
    console.log('  🔄 Data transformeren...');
    const records: Record<string, any>[] = [];

    snapshot.forEach(doc => {
      const transformed = transformDocument(collectionName, doc.id, doc.data());
      records.push(transformed);
    });

    // Step 4: Insert into Supabase in batches
    // Smaller batch size to avoid rate limiting and server overload
    const BATCH_SIZE = 25;
    const DELAY_BETWEEN_BATCHES = 200; // ms
    let insertedCount = 0;
    let errorCount = 0;

    console.log('  📤 Data invoegen in Supabase...');

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);

      if (isDryRun) {
        console.log(`  [DRY RUN] Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} records`);
        insertedCount += batch.length;
      } else {
        try {
          const { error } = await supabase
            .from(tableName)
            .upsert(batch, { onConflict: 'id' });

          if (error) {
            console.error(`\n  ⚠️  Batch error: ${error.message?.substring(0, 100)}`);
            errorCount += batch.length;
          } else {
            insertedCount += batch.length;
          }
        } catch (err: any) {
          console.error(`\n  ⚠️  Network error: ${err.message?.substring(0, 50)}`);
          errorCount += batch.length;
        }

        // Rate limiting delay
        if (i + BATCH_SIZE < records.length) {
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
        }
      }

      process.stdout.write(`\r  📤 Voortgang: ${insertedCount}/${docCount}${errorCount > 0 ? ` (${errorCount} fouten)` : ''}`);
    }

    console.log(`\n  ✅ ${insertedCount} records gemigreerd naar ${tableName}`);
    return { success: true, count: insertedCount };

  } catch (error: any) {
    console.error(`\n  ❌ Fout bij migratie ${collectionName}:`, error.message);
    return { success: false, count: 0, error: error.message };
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     MASTER MIGRATIE: Firestore -> Supabase                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  if (isDryRun) {
    console.log('\n⚠️  DRY RUN MODE - Geen wijzigingen worden uitgevoerd\n');
  }

  if (onlyCollection) {
    console.log(`📌 Alleen migreren: ${onlyCollection}\n`);
  }

  // Validate environment
  if (!SUPABASE_URL) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL niet gevonden in .env.local');
    process.exit(1);
  }

  if (!SUPABASE_SERVICE_KEY) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY of NEXT_PUBLIC_SUPABASE_ANON_KEY niet gevonden in .env.local');
    process.exit(1);
  }

  const startTime = Date.now();

  // Initialize Firebase
  console.log('🔥 Firebase initialiseren...');
  const app = initializeApp(firebaseConfig);
  const firestoreDb = getFirestore(app);
  console.log('✓ Firebase klaar\n');

  // Initialize Supabase
  console.log('🐘 Supabase initialiseren...');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  console.log('✓ Supabase klaar\n');

  // Determine which collections to migrate
  const collectionsToMigrate = onlyCollection
    ? [onlyCollection as CollectionName]
    : COLLECTIONS;

  // Migrate each collection
  const results: { collection: string; success: boolean; count: number; error?: string }[] = [];
  const tablesNeeded: string[] = [];

  for (const collectionName of collectionsToMigrate) {
    if (!COLLECTIONS.includes(collectionName as CollectionName)) {
      console.warn(`⚠️  Onbekende collectie: ${collectionName}, overslaan.`);
      continue;
    }

    const result = await migrateCollection(firestoreDb, supabase, collectionName as CollectionName);
    results.push({ collection: collectionName, ...result });

    if (!result.success && result.error === 'Tabel bestaat niet') {
      tablesNeeded.push(collectionName);
    }
  }

  // Summary
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const successCount = results.filter(r => r.success).length;
  const totalRecords = results.reduce((sum, r) => sum + r.count, 0);

  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                      SAMENVATTING                          ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  Collecties gemigreerd:    ${String(successCount + '/' + results.length).padStart(28)} ║`);
  console.log(`║  Totaal records:           ${String(totalRecords).padStart(28)} ║`);
  console.log(`║  Duur:                     ${String(duration + 's').padStart(28)} ║`);
  console.log('╠════════════════════════════════════════════════════════════╣');

  for (const r of results) {
    const status = r.success ? '✓' : '✗';
    const countStr = r.success ? `${r.count} records` : (r.error?.substring(0, 25) || 'fout');
    console.log(`║  ${status} ${r.collection.padEnd(20)} ${countStr.padStart(30)} ║`);
  }

  console.log('╚════════════════════════════════════════════════════════════╝');

  // If tables are needed, output combined SQL
  if (tablesNeeded.length > 0) {
    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║  ⚠️  ACTIE VEREIST: Maak eerst deze tabellen aan           ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('\nKopieer en voer deze SQL uit in Supabase Dashboard:\n');
    console.log('🔗 https://supabase.com/dashboard/project/djcsihpnidopxxuxumvj/sql/new\n');
    console.log('────────────────────────────────────────────────────────────');

    for (const col of tablesNeeded) {
      console.log(TABLE_SCHEMAS[col as CollectionName]);
    }

    console.log('────────────────────────────────────────────────────────────');
    console.log('\nNa het aanmaken van de tabellen, voer dit script opnieuw uit:');
    console.log('  npx tsx scripts/migrate-all.ts --skip-create\n');
  } else if (!isDryRun && successCount > 0) {
    console.log('\n✅ Migratie voltooid!');
  }
}

main();
