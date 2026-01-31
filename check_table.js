const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function testInsert() {
    const { data, error } = await supabase
        .from('sub_parcels')
        .insert({
            crop: 'Test',
            variety: 'Test',
            area: 0,
            irrigation_type: 'Test'
        });

    if (error) {
        console.log('Insert failed:', error.message);
        if (error.message.includes('relation "public.sub_parcels" does not exist')) {
            console.log('CRITICAL: Table sub_parcels does not exist.');
        }
    } else {
        console.log('Insert successful? (Check RLS):', data);
    }
}

testInsert();
