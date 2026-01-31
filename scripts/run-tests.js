#!/usr/bin/env node

/**
 * AgriBot Slimme Invoer Test Runner v2
 *
 * Roept de API aan op EXACT dezelfde manier als de webapp.
 * Haalt eerst echte percelen op uit de database.
 *
 * Gebruik: node scripts/run-tests.js [--verbose] [--scenario SC001]
 */

const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_URL = `${BASE_URL}/api/analyze-input`;
const SCENARIOS_FILE = path.join(__dirname, '..', 'test-scenarios.json');

// Parse CLI arguments
const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose') || args.includes('-v');
const SCENARIO_FILTER = args.find(a => a.startsWith('--scenario='))?.split('=')[1]
    || args[args.indexOf('--scenario') + 1];

// Colors
const c = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    dim: '\x1b[2m',
    bold: '\x1b[1m',
};

const log = (msg, color = '') => console.log(`${color}${msg}${c.reset}`);
const logV = (msg) => VERBOSE && console.log(`${c.dim}    ${msg}${c.reset}`);

/**
 * Haal echte percelen op uit de database via een API call
 * Dit simuleert wat de webapp doet bij het laden
 */
async function fetchRealParcels() {
    // We gebruiken de Supabase client direct via een test endpoint
    // Of we mocken de data die normaal uit de database komt

    // Voor nu: return hardcoded data die matcht met wat in de database staat
    // Dit moet je aanpassen naar je echte perceel IDs!

    log('\nProbeer percelen op te halen uit database...', c.cyan);

    try {
        // Probeer een simpele API call om te checken of de server draait
        const testResponse = await fetch(`${BASE_URL}/api/analyze-input`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rawInput: 'test' })
        });

        if (!testResponse.ok) {
            log(`  Server responded with ${testResponse.status}`, c.yellow);
        }
    } catch (e) {
        log(`  Kon geen verbinding maken met ${BASE_URL}`, c.red);
        log(`  Zorg dat de dev server draait: npm run dev`, c.yellow);
        process.exit(1);
    }

    log('  Server is bereikbaar!', c.green);
    return null; // We laten de API de percelen ophalen
}

/**
 * Parse NDJSON stream response (one JSON object per line)
 */
async function parseNDJSON(response) {
    const text = await response.text();
    const messages = [];

    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
            messages.push(JSON.parse(trimmed));
        } catch (e) {
            // Skip invalid JSON
            logV(`Skipping invalid JSON line: ${trimmed.substring(0, 50)}`);
        }
    }

    return messages;
}

/**
 * Extract final state from SSE messages
 */
function getFinalState(messages) {
    let state = {
        plots: [],
        products: [],
        date: null,
        correctionType: null,
        slotRequest: null,
        error: null,
        raw: messages
    };

    for (const msg of messages) {
        if (msg.type === 'complete' && msg.data) {
            state.plots = msg.data.plots || [];
            state.products = msg.data.products || [];
            state.date = msg.data.date || null;
        }
        if (msg.type === 'partial' && msg.data) {
            if (msg.data.plots?.length) state.plots = msg.data.plots;
            if (msg.data.products?.length) state.products = msg.data.products;
            if (msg.data.date) state.date = msg.data.date;
        }
        if (msg.type === 'correction') {
            state.correctionType = msg.correction?.type;
            if (msg.updatedDraft) {
                state.plots = msg.updatedDraft.plots || [];
                state.products = msg.updatedDraft.products || [];
            }
        }
        if (msg.type === 'slot_request') {
            state.slotRequest = msg.slotRequest?.missingSlot;
            // Preserve the current draft from slot_request
            if (msg.slotRequest?.currentDraft) {
                state.plots = msg.slotRequest.currentDraft.plots || [];
                state.products = msg.slotRequest.currentDraft.products || [];
                state.date = msg.slotRequest.currentDraft.date || null;
            }
        }
        if (msg.type === 'error') {
            state.error = msg.message;
        }
    }

    return state;
}

/**
 * Voer een API call uit - EXACT zoals de webapp
 */
async function callAPI(input, previousDraft, chatHistory) {
    // Build request body EXACT like webapp (page.tsx line 892-897)
    const body = {
        rawInput: input,
        previousDraft: previousDraft || undefined,
        chatHistory: chatHistory || undefined,
        // parcelInfo wordt NIET meegegeven - de API haalt dit zelf op uit de database
    };

    logV(`Request: ${JSON.stringify(body, null, 2)}`);

    const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
    }

    const messages = await parseNDJSON(response);
    logV(`Received ${messages.length} NDJSON messages`);

    return getFinalState(messages);
}

/**
 * Check expectations
 */
function checkExpectations(expected, actual) {
    const fails = [];

    // Plot count checks
    if (expected.plotCount !== undefined && actual.plots.length !== expected.plotCount) {
        fails.push(`plotCount: verwacht ${expected.plotCount}, kreeg ${actual.plots.length}`);
    }
    if (expected.plotCountMin !== undefined && actual.plots.length < expected.plotCountMin) {
        fails.push(`plotCountMin: verwacht >= ${expected.plotCountMin}, kreeg ${actual.plots.length}`);
    }

    // Product count checks
    if (expected.productCount !== undefined && actual.products.length !== expected.productCount) {
        fails.push(`productCount: verwacht ${expected.productCount}, kreeg ${actual.products.length}`);
    }
    if (expected.productCountMin !== undefined && actual.products.length < expected.productCountMin) {
        fails.push(`productCountMin: verwacht >= ${expected.productCountMin}, kreeg ${actual.products.length}`);
    }

    // Products contain check
    if (expected.productsContain) {
        for (const name of expected.productsContain) {
            const found = actual.products.some(p =>
                p.product?.toLowerCase().includes(name.toLowerCase())
            );
            if (!found) {
                fails.push(`productsContain: "${name}" niet gevonden in [${actual.products.map(p => p.product).join(', ')}]`);
            }
        }
    }

    // Correction type check
    if (expected.correctionType && actual.correctionType !== expected.correctionType) {
        fails.push(`correctionType: verwacht "${expected.correctionType}", kreeg "${actual.correctionType}"`);
    }

    // Has date check
    if (expected.hasDate && !actual.date) {
        fails.push(`hasDate: verwacht datum, kreeg niets`);
    }

    // Dosage check
    if (expected.dosage) {
        const product = actual.products.find(p =>
            p.product?.toLowerCase().includes(expected.dosage.product.toLowerCase())
        );
        if (!product) {
            fails.push(`dosage: product "${expected.dosage.product}" niet gevonden`);
        } else {
            const tolerance = expected.dosage.tolerance || 0.05;
            if (Math.abs(product.dosage - expected.dosage.value) > tolerance) {
                fails.push(`dosage: verwacht ${expected.dosage.value}, kreeg ${product.dosage}`);
            }
        }
    }

    // Slot request check (for multi-step slot filling)
    if (expected.slotRequest && actual.slotRequest !== expected.slotRequest) {
        fails.push(`slotRequest: verwacht "${expected.slotRequest}", kreeg "${actual.slotRequest}"`);
    }

    return fails;
}

/**
 * Run a scenario
 */
async function runScenario(scenario) {
    log(`\n${c.bold}━━━ ${scenario.id}: ${scenario.description} ━━━${c.reset}`);

    let draft = null;
    let chatHistory = [];
    let passed = true;

    for (let i = 0; i < scenario.steps.length; i++) {
        const step = scenario.steps[i];
        log(`  Stap ${i + 1}: "${step.input}"`, c.cyan);

        // Add user message to history
        chatHistory.push({
            role: 'user',
            content: step.input,
            timestamp: new Date().toISOString()
        });

        try {
            const result = await callAPI(step.input, draft, chatHistory);

            if (result.error) {
                log(`    ${c.red}✗ ERROR: ${result.error}${c.reset}`);
                passed = false;
                continue;
            }

            // Check expectations
            const fails = checkExpectations(step.expected, result);

            if (fails.length === 0) {
                log(`    ${c.green}✓ PASS${c.reset} (${result.plots.length} percelen, ${result.products.length} middelen)`);
            } else {
                log(`    ${c.red}✗ FAIL${c.reset}`);
                for (const f of fails) {
                    log(`      - ${f}`, c.red);
                }
                passed = false;
            }

            // Update draft for next step
            if (result.correctionType !== 'cancel_all') {
                draft = {
                    plots: result.plots,
                    products: result.products,
                };
                // Only include date if it's actually set (avoid null validation error)
                if (result.date) {
                    draft.date = result.date;
                }
            } else {
                draft = null;
            }

            // Add assistant message
            chatHistory.push({
                role: 'assistant',
                content: 'Verwerkt.',
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            log(`    ${c.red}✗ ERROR: ${error.message}${c.reset}`);
            passed = false;
        }

        // Rate limiting
        await new Promise(r => setTimeout(r, 1000));
    }

    return passed;
}

/**
 * Main
 */
async function main() {
    log(`\n${c.bold}${c.blue}╔════════════════════════════════════════════════════════════╗${c.reset}`);
    log(`${c.bold}${c.blue}║        AgriBot Test Runner v2.0                            ║${c.reset}`);
    log(`${c.bold}${c.blue}╚════════════════════════════════════════════════════════════╝${c.reset}`);
    log(`\nAPI: ${API_URL}`);
    log(`Verbose: ${VERBOSE ? 'AAN' : 'UIT'}`);

    // Check server
    await fetchRealParcels();

    // Load scenarios
    let testData;
    try {
        testData = JSON.parse(fs.readFileSync(SCENARIOS_FILE, 'utf-8'));
    } catch (e) {
        log(`\n${c.red}Kon test-scenarios.json niet laden: ${e.message}${c.reset}`);
        process.exit(1);
    }

    // Filter scenarios
    let scenarios = testData.scenarios;
    if (SCENARIO_FILTER) {
        scenarios = scenarios.filter(s => s.id === SCENARIO_FILTER);
        if (scenarios.length === 0) {
            log(`${c.red}Scenario "${SCENARIO_FILTER}" niet gevonden${c.reset}`);
            process.exit(1);
        }
    }

    log(`\nGeladen: ${scenarios.length} scenario's`);

    // Run tests
    let passed = 0;
    let failed = 0;
    const start = Date.now();

    for (const scenario of scenarios) {
        const result = await runScenario(scenario);
        if (result) passed++; else failed++;
    }

    const duration = ((Date.now() - start) / 1000).toFixed(1);

    // Summary
    log(`\n${c.bold}╔════════════════════════════════════════════════════════════╗${c.reset}`);
    log(`${c.bold}║  RESULTAAT                                                   ║${c.reset}`);
    log(`${c.bold}╚════════════════════════════════════════════════════════════╝${c.reset}`);
    log(`\n  Duur:     ${duration}s`);
    log(`  Totaal:   ${passed + failed} scenario's`);
    log(`  ${c.green}Geslaagd: ${passed}${c.reset}`);
    log(`  ${failed > 0 ? c.red : ''}Gefaald:  ${failed}${c.reset}`);

    const rate = Math.round((passed / (passed + failed)) * 100);
    const rateColor = rate >= 80 ? c.green : rate >= 50 ? c.yellow : c.red;
    log(`\n  ${rateColor}${c.bold}Success Rate: ${rate}%${c.reset}\n`);

    process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
    log(`\n${c.red}FATAL: ${e.message}${c.reset}`);
    process.exit(1);
});
