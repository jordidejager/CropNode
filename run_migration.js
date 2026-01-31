const { Client } = require('pg');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

async function runMigration() {
    // Try using the base hostname which resolves
    const connectionString = process.env.SUPABASE_DB_URL.replace('db.djcsihpnidopxxuxumvj.supabase.co', 'djcsihpnidopxxuxumvj.supabase.co');

    const client = new Client({
        connectionString: connectionString,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        await client.connect();
        console.log('Connected to database.');

        const sql = fs.readFileSync('supabase_schema_percelen_v2.sql', 'utf8');
        console.log('Read migration file.');

        await client.query(sql);
        console.log('Migration successful.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        try {
            await client.end();
        } catch (e) { }
    }
}

runMigration();
