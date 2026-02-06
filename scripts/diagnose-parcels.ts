/**
 * Diagnostic script to analyze parcel data issues
 * Run with: npx tsx scripts/diagnose-parcels.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function diagnose() {
  console.log('=== PARCEL DIAGNOSTICS ===\n');

  // 1. Count parcels table
  const { count: parcelsCount, error: parcelsError } = await supabase
    .from('parcels')
    .select('*', { count: 'exact', head: true });

  console.log(`1. parcels table count: ${parcelsCount ?? 'ERROR: ' + parcelsError?.message}`);

  // 1b. Get all parcel IDs
  const { data: allParcels } = await supabase
    .from('parcels')
    .select('id')
    .limit(100);
  const parcelIds = new Set(allParcels?.map(p => p.id) || []);
  console.log(`   Parcel IDs: ${[...parcelIds].slice(0, 3).map(id => id.substring(0, 8)).join(', ')}...`);

  // 2. Count sub_parcels table
  const { count: subParcelsCount, error: subParcelsError } = await supabase
    .from('sub_parcels')
    .select('*', { count: 'exact', head: true });

  console.log(`2. sub_parcels table count: ${subParcelsCount ?? 'ERROR: ' + subParcelsError?.message}`);

  // 3. Count view
  const { count: viewCount, error: viewError } = await supabase
    .from('v_sprayable_parcels')
    .select('*', { count: 'exact', head: true });

  console.log(`3. v_sprayable_parcels view count: ${viewCount ?? 'ERROR: ' + viewError?.message}`);

  // 4. Sample from parcels
  const { data: sampleParcels, error: sampleParcelsError } = await supabase
    .from('parcels')
    .select('id, name, user_id')
    .limit(3);

  console.log('\n4. Sample parcels:');
  if (sampleParcelsError) {
    console.log('   ERROR:', sampleParcelsError.message);
  } else if (!sampleParcels || sampleParcels.length === 0) {
    console.log('   EMPTY - No rows in parcels table!');
  } else {
    sampleParcels.forEach(p => console.log(`   - ${p.id} | ${p.name} | user=${p.user_id}`));
  }

  // 5. Sample from sub_parcels
  const { data: sampleSubParcels, error: sampleSubParcelsError } = await supabase
    .from('sub_parcels')
    .select('id, name, crop, variety, area, parcel_id, user_id')
    .limit(5);

  console.log('\n5. Sample sub_parcels:');
  if (sampleSubParcelsError) {
    console.log('   ERROR:', sampleSubParcelsError.message);
  } else if (!sampleSubParcels || sampleSubParcels.length === 0) {
    console.log('   EMPTY - No rows in sub_parcels table!');
  } else {
    sampleSubParcels.forEach(sp =>
      console.log(`   - ${sp.id.substring(0, 8)}... | name="${sp.name}" | crop=${sp.crop} | variety=${sp.variety} | area=${sp.area} | parcel_id=${sp.parcel_id?.substring(0, 8) || 'NULL'}...`)
    );
  }

  // 6. Check for orphaned sub_parcels (parcel_id not in parcels)
  if (sampleSubParcels && sampleSubParcels.length > 0) {
    const firstParcelId = sampleSubParcels[0].parcel_id;
    if (firstParcelId) {
      const { data: matchingParcel, error: matchError } = await supabase
        .from('parcels')
        .select('id, name')
        .eq('id', firstParcelId)
        .single();

      console.log('\n6. FK Check - Does sub_parcels.parcel_id exist in parcels?');
      if (matchError) {
        console.log(`   parcel_id=${firstParcelId.substring(0, 8)}... NOT FOUND in parcels!`);
        console.log('   ROOT CAUSE: sub_parcels references non-existent parcels');
      } else {
        console.log(`   parcel_id=${firstParcelId.substring(0, 8)}... found: "${matchingParcel.name}"`);
      }
    } else {
      console.log('\n6. FK Check: sub_parcels.parcel_id is NULL');
    }
  }

  // 7. Sample from view (if any)
  const { data: sampleView, error: sampleViewError } = await supabase
    .from('v_sprayable_parcels')
    .select('*')
    .limit(3);

  console.log('\n7. Sample from v_sprayable_parcels view:');
  if (sampleViewError) {
    console.log('   ERROR:', sampleViewError.message);
  } else if (!sampleView || sampleView.length === 0) {
    console.log('   EMPTY - View returns no rows');
  } else {
    sampleView.forEach(v => console.log(`   - ${JSON.stringify(v)}`));
  }

  // 8. Check FK overlap
  console.log('\n8. FK Overlap Check:');
  const { data: allSubParcels } = await supabase
    .from('sub_parcels')
    .select('parcel_id')
    .limit(100);

  const subParcelIds = new Set(allSubParcels?.map(sp => sp.parcel_id).filter(Boolean) || []);
  console.log(`   Unique parcel_ids in sub_parcels: ${subParcelIds.size}`);
  console.log(`   Sample: ${[...subParcelIds].slice(0, 3).map(id => id?.substring(0, 8)).join(', ')}...`);

  // Check overlap
  const overlap = [...subParcelIds].filter(id => parcelIds.has(id));
  console.log(`   Overlap with parcels.id: ${overlap.length}`);

  if (overlap.length === 0 && subParcelIds.size > 0 && parcelIds.size > 0) {
    console.log('\n   >>> ZERO OVERLAP! sub_parcels.parcel_id does NOT match parcels.id <<<');
  }

  // 9. Diagnosis summary
  console.log('\n=== DIAGNOSIS ===');

  if (parcelsCount === 0) {
    console.log('ROOT CAUSE: parcels table is EMPTY');
    console.log('The view JOINs sub_parcels with parcels, so empty parcels = empty view');
    console.log('\nSOLUTION: Either:');
    console.log('1. Populate the parcels table with parent records');
    console.log('2. OR: Change view to use LEFT JOIN instead of INNER JOIN');
    console.log('3. OR: Create parcels from sub_parcels data');
  } else if (overlap.length === 0 && subParcelIds.size > 0) {
    console.log('ROOT CAUSE: FK mismatch - sub_parcels.parcel_id does not match parcels.id');
    console.log('\nThe sub_parcels table references parcel_ids that do not exist in parcels table.');
    console.log('\nSOLUTION OPTIONS:');
    console.log('1. Update sub_parcels.parcel_id to reference existing parcels.id');
    console.log('2. OR: Change view to use LEFT JOIN (parcels info will be NULL)');
    console.log('3. OR: Create matching parcels records');
  } else if (subParcelsCount && subParcelsCount > 0 && viewCount === 0) {
    console.log('ROOT CAUSE: Unknown - check view definition and RLS');
  } else {
    console.log('Data looks OK - view should work');
  }
}

diagnose().catch(console.error);
