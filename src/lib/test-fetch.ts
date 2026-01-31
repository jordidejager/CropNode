
import { config } from 'dotenv';
config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing env vars');
    process.exit(1);
}

import fetch from 'node-fetch';

async function main() {
    console.log('Testing raw fetch (node-fetch) to Supabase...');
    const url = `${SUPABASE_URL}/rest/v1/spuitschrift?select=*&limit=5`;

    try {
        const response = await fetch(url, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        console.log(`Status: ${response.status} ${response.statusText}`);
        if (!response.ok) {
            const text = await response.text();
            console.error('Response body:', text);
        } else {
            const data = await response.json();
            console.log(`Success! Found ${data.length} items.`);
            if (data.length > 0) console.log(JSON.stringify(data[0], null, 2));
        }
    } catch (error) {
        console.error('Fetch failed:', error);
    }
}

main();
