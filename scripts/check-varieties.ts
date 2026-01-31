import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

async function main() {
    const { data } = await supabase.from('sub_parcels').select('variety').ilike('variety', '%kanzi%');
    console.log('Kanzi parcels:', data?.length || 0, data);
    
    const { data: all } = await supabase.from('sub_parcels').select('variety');
    const uniqueVarieties = [...new Set((all || []).map(v => v.variety))];
    console.log('\nAll varieties:', uniqueVarieties);
}

main();
