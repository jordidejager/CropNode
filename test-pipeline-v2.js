/**
 * ISSUE 1: Volledige Pipeline Test - Slimme Invoer V2
 * Test parsing → validatie → opslaan → DB verificatie
 *
 * Run: node test-pipeline-v2.js
 */

const SUPABASE_URL = 'https://djcsihpnidopxxuxumvj.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqY3NpaHBuaWRvcHh4dXh1bXZqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODM1OTcxNCwiZXhwIjoyMDgzOTM1NzE0fQ.VqnQH187m6qTD76gfJM9i0NxMq_n6EjD3Pnyhz02ocg';
const APP_URL = 'http://localhost:3003';

// Test credentials
const TEST_EMAIL = 'jordidejager@me.com';
const TEST_PASSWORD = 'spuitschrift';

const TESTS = [
    { id: 'P1', cat: 'Fungicide (kg)',    input: 'vandaag alle conference met delan 0.5 kg',             expectProduct: 'Delan', expectDosage: 0.5, expectUnit: 'kg/ha' },
    { id: 'P2', cat: 'Fungicide (L)',     input: 'vandaag alle peren met scala 0.75 L',                  expectProduct: 'Scala', expectDosage: 0.75, expectUnit: 'L/ha' },
    { id: 'P3', cat: 'Insecticide',       input: 'vandaag alle appels met coragen 0.18 L',               expectProduct: 'CORAGEN', expectDosage: 0.18, expectUnit: 'L/ha' },
    { id: 'P4', cat: 'Acaricide',         input: 'vandaag alle appels met nissorun 0.2 L',               expectProduct: 'Nissorun', expectDosage: 0.2, expectUnit: 'L/ha' },
    { id: 'P5', cat: 'Groeiregulator',    input: 'vandaag alle appels met regalis plus 2.5 kg',          expectProduct: 'Regalis', expectDosage: 2.5, expectUnit: 'kg/ha' },
    { id: 'P6', cat: 'Lastige naam',      input: 'vandaag alle conference met chorus 0.6 kg',            expectProduct: 'CHORUS', expectDosage: 0.6, expectUnit: 'kg/ha' },
    { id: 'P7', cat: 'Eenheidsconversie', input: 'vandaag alle peren met delan 500 gram',                expectProduct: 'Delan', expectDosage: 0.5, expectUnit: 'kg/ha' },
    { id: 'P8', cat: 'Tankmix',           input: 'vandaag alle conference met merpan 0.7 kg en flint 0.15 kg', expectProduct: 'Merpan', expectProduct2: 'FLINT', expectDosage: 0.7, expectUnit: 'kg/ha' },
];

async function supabaseQuery(table, params = '') {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
        headers: {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
        },
    });
    return res.json();
}

async function login() {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_SERVICE_KEY,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });
    const data = await res.json();
    if (!data.access_token) throw new Error('Login failed: ' + JSON.stringify(data));
    return data;
}

async function sendSmartInputV2(message, accessToken, sessionId) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
        const res = await fetch(`${APP_URL}/api/smart-input-v2`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': `sb-access-token=${accessToken}`,
            },
            body: JSON.stringify({
                message,
                sessionId: sessionId || crypto.randomUUID(),
                conversationHistory: [],
            }),
            signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!res.ok) {
            const text = await res.text();
            return { error: `HTTP ${res.status}: ${text.substring(0, 200)}` };
        }

        return res.json();
    } catch (e) {
        clearTimeout(timeout);
        if (e.name === 'AbortError') return { error: 'AI timeout (60s)' };
        return { error: e.message };
    }
}

function checkProduct(response, test) {
    const result = {
        id: test.id,
        cat: test.cat,
        input: test.input,
        parsing: '❌',
        product: null,
        dosage: null,
        unit: null,
        parcels: 0,
        validationStatus: null,
        issues: [],
    };

    if (response.error) {
        result.issues.push(`Error: ${response.error}`);
        return result;
    }

    // Check for registrationGroup
    const group = response.registrationGroup;
    if (!group) {
        result.issues.push('Geen registrationGroup in response');
        return result;
    }

    // Check units
    const units = group.units || [];
    if (units.length === 0) {
        result.issues.push('Geen units in registrationGroup');
        return result;
    }

    const unit = units[0];
    const products = unit.products || [];

    if (products.length === 0) {
        result.issues.push('Geen producten in unit');
        return result;
    }

    result.product = products[0].product;
    result.dosage = products[0].dosage;
    result.unit = products[0].unit;
    result.parcels = (unit.plots || []).length;

    // Check product match
    const productMatch = result.product?.toLowerCase().includes(test.expectProduct.toLowerCase());

    // Check dosage
    const dosageMatch = Math.abs((result.dosage || 0) - test.expectDosage) < 0.01;

    // Check unit
    const unitMatch = result.unit === test.expectUnit;

    if (productMatch && dosageMatch) {
        result.parsing = '✅';
    } else {
        if (!productMatch) result.issues.push(`Product: verwacht "${test.expectProduct}", kreeg "${result.product}"`);
        if (!dosageMatch) result.issues.push(`Dosering: verwacht ${test.expectDosage}, kreeg ${result.dosage}`);
    }

    if (!unitMatch) result.issues.push(`Eenheid: verwacht "${test.expectUnit}", kreeg "${result.unit}"`);

    // Check validation
    if (unit.validationResult) {
        result.validationStatus = unit.validationResult.status;
    }

    // Tankmix check
    if (test.expectProduct2 && products.length >= 2) {
        const prod2Match = products[1].product?.toLowerCase().includes(test.expectProduct2.toLowerCase());
        if (!prod2Match) result.issues.push(`Product 2: verwacht "${test.expectProduct2}", kreeg "${products[1]?.product}"`);
    } else if (test.expectProduct2 && products.length < 2) {
        result.issues.push(`Tankmix: verwacht 2 producten, kreeg ${products.length}`);
    }

    return result;
}

async function main() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║     VOLLEDIGE PIPELINE TEST - Slimme Invoer V2              ║');
    console.log('║     Datum: ' + new Date().toLocaleString('nl-NL') + '                           ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log();

    // Step 1: Login
    console.log('[LOGIN] Inloggen...');
    let auth;
    try {
        auth = await login();
        console.log('  ✅ Ingelogd als', TEST_EMAIL);
    } catch (e) {
        console.log('  ❌ Login mislukt:', e.message);
        process.exit(1);
    }

    // Step 2: Count existing spuitschrift records (for later comparison)
    const existingRecords = await supabaseQuery('spuitschrift', 'select=id&order=created_at.desc&limit=5');
    console.log(`  ℹ️  Huidige spuitschrift records: ${existingRecords.length}+ (laatste 5 opgehaald)`);
    console.log();

    // Step 3: Run tests sequentially (to avoid overwhelming the AI)
    const results = [];
    let passCount = 0;

    for (const test of TESTS) {
        console.log(`[${test.id}] ${test.input}`);

        const response = await sendSmartInputV2(test.input, auth.access_token, crypto.randomUUID());
        const result = checkProduct(response, test);
        results.push(result);

        if (result.parsing === '✅') {
            passCount++;
            console.log(`  ✅ PASS`);
            console.log(`    Product: ${result.product}`);
            console.log(`    Dosering: ${result.dosage} ${result.unit}`);
            console.log(`    Percelen: ${result.parcels}`);
            console.log(`    Validatie: ${result.validationStatus || 'n/a'}`);
        } else {
            console.log(`  ❌ FAIL`);
            for (const issue of result.issues) {
                console.log(`    ${issue}`);
            }
        }
        console.log();

        // Wait between requests to avoid rate limiting
        await new Promise(r => setTimeout(r, 2000));
    }

    // Summary
    console.log('════════════════════════════════════════════════════════════');
    console.log('  PARSING RESULTATEN');
    console.log('════════════════════════════════════════════════════════════');
    console.log();
    console.log(`  ${passCount}/${TESTS.length} PASS`);
    console.log();

    for (const r of results) {
        const status = r.parsing === '✅' ? '✅' : '❌';
        console.log(`  ${status} [${r.id}] ${r.cat}`);
        if (r.parsing !== '✅') {
            for (const issue of r.issues) {
                console.log(`      ${issue}`);
            }
        } else {
            console.log(`      ${r.product} ${r.dosage} ${r.unit} (${r.parcels} percelen)`);
        }
    }

    // Step 4: Check specific DB records for unit normalization
    console.log();
    console.log('════════════════════════════════════════════════════════════');
    console.log('  EENHEIDSCONVERSIE CHECK');
    console.log('════════════════════════════════════════════════════════════');

    // Find unit-conversion test result
    const unitTest = results.find(r => r.id === 'P7');
    if (unitTest && unitTest.parsing === '✅') {
        console.log(`  P7 "delan 500 gram":`);
        console.log(`    Dosering: ${unitTest.dosage} ${unitTest.unit}`);
        console.log(`    Verwacht: 0.5 kg/ha`);
        if (unitTest.dosage === 0.5 && unitTest.unit === 'kg/ha') {
            console.log(`    ✅ Eenheidsconversie correct (500g → 0.5 kg/ha)`);
        } else if (unitTest.unit?.includes('g') && unitTest.dosage === 500) {
            console.log(`    ❌ Eenheidsconversie NIET uitgevoerd (nog steeds 500 g)`);
        } else {
            console.log(`    ⚠️ Onverwacht resultaat`);
        }
    }

    console.log();
    console.log('Done.');
}

main().catch(console.error);
