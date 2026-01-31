import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function main() {
    console.log('=== PARCELS TABLE ===');
    const { data: parcels } = await supabase
        .from('parcels')
        .select('id, name')
        .limit(5);
    console.log(parcels);
    
    console.log('\n=== SUB_PARCELS TABLE ===');
    const { data: subParcels } = await supabase
        .from('sub_parcels')
        .select('id, name, crop, variety, area')
        .limit(10);
    console.log(subParcels);
    
    console.log('\n=== V_SPRAYABLE_PARCELS VIEW ===');
    const { data: viewData, error } = await supabase
        .from('v_sprayable_parcels')
        .select('id, name, crop, variety')
        .limit(10);
    if (error) {
        console.log('View error:', error.message);
    } else {
        console.log(viewData);
    }
    
    console.log('\n=== UNIQUE CROPS IN SUB_PARCELS ===');
    const { data: crops } = await supabase
        .from('sub_parcels')
        .select('crop')
    const uniqueCrops = [...new Set((crops || []).map(c => c.crop))];
    console.log('Unique crops:', uniqueCrops);
}

main();
