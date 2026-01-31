import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

async function main() {
    console.log('=== v_sprayable_parcels IDs ===');
    const { data: viewData } = await supabase
        .from('v_sprayable_parcels')
        .select('id, name, area, crop, variety')
        .limit(5);
    
    console.log('Sample parcels from view:');
    for (const p of viewData || []) {
        console.log(`  ID: ${p.id}`);
        console.log(`  Name: ${p.name}`);
        console.log(`  Area: ${p.area}`);
        console.log(`  Crop: ${p.crop}`);
        console.log('  ---');
    }
    
    // Check specific Kanzi parcel
    const { data: kanziData } = await supabase
        .from('v_sprayable_parcels')
        .select('id, name, area, crop, variety')
        .ilike('variety', '%kanzi%');
    
    console.log('\n=== Kanzi parcels ===');
    console.log(kanziData);
    
    // Check specific Appel parcels
    const { data: appleData } = await supabase
        .from('v_sprayable_parcels')
        .select('id, name, area, crop, variety')
        .eq('crop', 'Appel')
        .limit(5);
    
    console.log('\n=== Appel parcels ===');
    console.log(appleData);
}

main();
