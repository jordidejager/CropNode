/**
 * Pipeline Test - Slimme Invoer V2
 * Tests parsing via API endpoint
 * First loads context, then sends each test
 */

const APP_URL = 'http://localhost:3003';
const SUPABASE_URL = 'https://djcsihpnidopxxuxumvj.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqY3NpaHBuaWRvcHh4dXh1bXZqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODM1OTcxNCwiZXhwIjoyMDgzOTM1NzE0fQ.VqnQH187m6qTD76gfJM9i0NxMq_n6EjD3Pnyhz02ocg';

const fs = require('fs');
let COOKIE = process.argv[2];
if (!COOKIE) {
    try {
        COOKIE = fs.readFileSync('/tmp/sb_cookie.txt', 'utf8').trim();
    } catch (e) {
        console.error('Usage: node test-pipeline-api.js "<cookie_value>" or save cookie to /tmp/sb_cookie.txt');
        process.exit(1);
    }
}

const TESTS = [
    { id: 'P1', cat: 'Fungicide (kg)',    input: 'vandaag alle conference met delan 0.5 kg',             expectProduct: 'Delan', expectDosage: 0.5, expectUnit: 'kg' },
    { id: 'P2', cat: 'Fungicide (L)',     input: 'vandaag alle peren met scala 0.75 L',                  expectProduct: 'Scala', expectDosage: 0.75, expectUnit: 'L' },
    { id: 'P3', cat: 'Insecticide',       input: 'vandaag alle appels met coragen 0.18 L',               expectProduct: 'CORAGEN', expectDosage: 0.18, expectUnit: 'L' },
    { id: 'P4', cat: 'Acaricide',         input: 'vandaag alle appels met nissorun 0.2 L',               expectProduct: 'Nissorun', expectDosage: 0.2, expectUnit: 'L' },
    { id: 'P5', cat: 'Groeiregulator',    input: 'vandaag alle appels met regalis plus 2.5 kg',          expectProduct: 'Regalis', expectDosage: 2.5, expectUnit: 'kg' },
    { id: 'P6', cat: 'Lastige naam',      input: 'vandaag alle conference met chorus 0.6 kg',            expectProduct: 'CHORUS', expectDosage: 0.6, expectUnit: 'kg' },
    { id: 'P7', cat: 'Eenheidsconversie', input: 'vandaag alle peren met delan 500 gram',                expectProduct: 'Delan', expectDosage: 0.5, expectUnit: 'kg' },
    { id: 'P8', cat: 'Tankmix',           input: 'vandaag alle conference met merpan 0.7 kg en flint 0.15 kg', expectProduct: 'Merpan', expectProduct2: 'FLINT', expectDosage: 0.7, expectUnit: 'kg' },
];

async function fetchWithRetry(url, options, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const res = await fetch(url, options);
            return res;
        } catch (e) {
            if (i < maxRetries - 1) {
                console.log(`  ⚠️ Retry ${i + 1}/${maxRetries}: ${e.message}`);
                await new Promise(r => setTimeout(r, 2000));
            } else {
                throw e;
            }
        }
    }
}

async function loadContext() {
    const res = await fetchWithRetry(`${APP_URL}/api/smart-input-v2/context`, {
        headers: { 'Cookie': COOKIE },
    });
    if (!res.ok) {
        throw new Error(`Context load failed: ${res.status} ${await res.text()}`);
    }
    return res.json();
}

async function sendSmartInputV2(message, userContext) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
        const res = await fetchWithRetry(`${APP_URL}/api/smart-input-v2`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': COOKIE,
            },
            body: JSON.stringify({
                message,
                conversationHistory: [],
                currentDraft: null,
                userContext: userContext,
            }),
            signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!res.ok) {
            const text = await res.text();
            return { error: `HTTP ${res.status}: ${text.substring(0, 300)}` };
        }

        // Parse NDJSON streaming response - each line is a JSON object
        const text = await res.text();
        const lines = text.split('\n').filter(l => l.trim().length > 0);

        let registrationGroup = null;
        let completeResponse = null;

        for (const line of lines) {
            try {
                const data = JSON.parse(line);
                if (data.type === 'complete' && data.response) {
                    completeResponse = data.response;
                    registrationGroup = data.response.registration;
                }
            } catch (e) {
                // Skip unparseable lines
            }
        }

        return { registrationGroup, completeResponse };
    } catch (e) {
        clearTimeout(timeout);
        if (e.name === 'AbortError') return { error: 'AI timeout (60s)' };
        return { error: e.message };
    }
}

function checkResponse(response, test) {
    const result = {
        id: test.id,
        cat: test.cat,
        input: test.input,
        parsing: '❌',
        products: [],
        parcels: 0,
        issues: [],
    };

    if (response.error) {
        result.issues.push(`Error: ${response.error}`);
        return result;
    }

    const group = response.registrationGroup;
    if (!group) {
        result.issues.push('Geen registrationGroup');
        return result;
    }

    const units = group.units || [];
    if (units.length === 0) {
        result.issues.push('Geen units');
        return result;
    }

    const unit = units[0];
    const products = unit.products || [];
    result.parcels = (unit.plots || []).length;

    if (products.length === 0) {
        result.issues.push('Geen producten');
        return result;
    }

    result.products = products.map(p => ({ product: p.product, dosage: p.dosage, unit: p.unit }));

    // Check product 1
    const p1 = products[0];
    const prodMatch = p1.product?.toLowerCase().includes(test.expectProduct.toLowerCase());
    const doseMatch = Math.abs((p1.dosage || 0) - test.expectDosage) < 0.01;
    const unitMatch = p1.unit === test.expectUnit;

    if (!prodMatch) result.issues.push(`Product: "${test.expectProduct}" → "${p1.product}"`);
    if (!doseMatch) result.issues.push(`Dosering: ${test.expectDosage} → ${p1.dosage}`);
    if (!unitMatch) result.issues.push(`Eenheid: "${test.expectUnit}" → "${p1.unit}"`);

    // Check product 2 (tankmix)
    if (test.expectProduct2) {
        if (products.length >= 2) {
            const p2 = products[1];
            const p2Match = p2.product?.toLowerCase().includes(test.expectProduct2.toLowerCase());
            if (!p2Match) result.issues.push(`P2: "${test.expectProduct2}" → "${p2.product}"`);
        } else {
            result.issues.push(`Tankmix: verwacht 2 producten, kreeg ${products.length}`);
        }
    }

    if (prodMatch && doseMatch) {
        result.parsing = '✅';
    }

    return result;
}

async function main() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║     PIPELINE TEST - Slimme Invoer V2 (API + streaming)      ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log();

    // Step 1: Load context
    console.log('[CONTEXT] Loading user context...');
    let userContext;
    try {
        userContext = await loadContext();
        console.log(`  ✅ ${userContext.parcels?.length} parcels, ${userContext.products?.length} products`);
    } catch (e) {
        console.log(`  ❌ ${e.message}`);
        process.exit(1);
    }
    console.log();

    // Step 2: Run tests
    const results = [];
    let passCount = 0;

    for (const test of TESTS) {
        process.stdout.write(`[${test.id}] ${test.cat}: `);

        const response = await sendSmartInputV2(test.input, userContext);
        const result = checkResponse(response, test);
        results.push(result);

        if (result.parsing === '✅') {
            passCount++;
            const prods = result.products.map(p => `${p.product} ${p.dosage} ${p.unit}`).join(' + ');
            console.log(`✅ ${prods} (${result.parcels} percelen)`);
        } else {
            console.log(`❌ ${result.issues.join(' | ')}`);
        }

        // Wait between requests
        await new Promise(r => setTimeout(r, 3000));
    }

    // Summary
    console.log();
    console.log('════════════════════════════════════════════════════════════');
    console.log(`  RESULTAAT: ${passCount}/${TESTS.length} PASS`);
    console.log('════════════════════════════════════════════════════════════');

    for (const r of results) {
        const status = r.parsing === '✅' ? '✅' : '❌';
        const prods = r.products.length > 0 ? r.products.map(p => `${p.product} ${p.dosage} ${p.unit}`).join(' + ') : '';
        console.log(`  ${status} [${r.id}] ${r.cat}: ${prods}${r.issues.length > 0 ? ' → ' + r.issues.join(', ') : ''}`);
    }

    console.log();
    console.log('Done.');
}

main().catch(console.error);
