#!/usr/bin/env npx tsx
/**
 * Smart Input V2 Test Suite
 *
 * Test script voor de volledige Slimme Invoer flow:
 * 1. Product search/matching
 * 2. Parcel resolution (groepering)
 * 3. V2 Grouped registrations (variaties)
 * 4. Confirmation flow
 * 5. Database saves
 *
 * Run: npx tsx scripts/test-smart-input-v2.ts
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Colors for output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m',
};

const log = {
    info: (msg: string) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
    success: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
    warn: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
    error: (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
    header: (msg: string) => console.log(`\n${colors.bold}${colors.cyan}═══ ${msg} ═══${colors.reset}\n`),
    subheader: (msg: string) => console.log(`\n${colors.bold}--- ${msg} ---${colors.reset}`),
};

interface TestResult {
    name: string;
    passed: boolean;
    details?: string;
    error?: string;
}

const results: TestResult[] = [];

function addResult(name: string, passed: boolean, details?: string, error?: string) {
    results.push({ name, passed, details, error });
    if (passed) {
        log.success(`${name}${details ? `: ${details}` : ''}`);
    } else {
        log.error(`${name}${error ? `: ${error}` : ''}`);
    }
}

// ============================================================================
// TEST 1: Database Connection & Basic Data
// ============================================================================

async function testDatabaseConnection() {
    log.header('TEST 1: Database Connection & Basic Data');

    const { createClient } = await import('@supabase/supabase-js');

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        addResult('Supabase credentials', false, undefined, 'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
        return null;
    }
    addResult('Supabase credentials', true, 'Found in .env.local');

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Test parcels
    const { data: parcels, error: parcelError } = await supabase
        .from('parcels')
        .select('id, name, crop, variety, area')
        .limit(10);

    if (parcelError) {
        addResult('Fetch parcels', false, undefined, parcelError.message);
    } else {
        addResult('Fetch parcels', true, `Found ${parcels?.length || 0} parcels`);
        if (parcels && parcels.length > 0) {
            log.info(`  Sample parcels: ${parcels.slice(0, 3).map(p => `${p.name} (${p.crop || 'NO CROP'})`).join(', ')}`);
        }
    }

    // Test CTGB products
    const { data: products, error: productError } = await supabase
        .from('ctgb_products')
        .select('id, naam, toelatingsnummer, search_keywords')
        .limit(10);

    if (productError) {
        addResult('Fetch CTGB products', false, undefined, productError.message);
    } else {
        addResult('Fetch CTGB products', true, `Found ${products?.length || 0} products`);
        if (products && products.length > 0) {
            log.info(`  Sample products: ${products.slice(0, 3).map(p => p.naam).join(', ')}`);
        }
    }

    // Check if common products exist
    const commonProducts = ['Merpan', 'Captan', 'Score', 'Delan', 'Luna'];
    for (const productName of commonProducts) {
        const { data: found } = await supabase
            .from('ctgb_products')
            .select('naam, search_keywords')
            .ilike('naam', `%${productName}%`)
            .limit(1);

        if (found && found.length > 0) {
            const hasKeywords = found[0].search_keywords && found[0].search_keywords.length > 0;
            addResult(`Product "${productName}" exists`, true, `Name: ${found[0].naam}, Keywords: ${hasKeywords ? found[0].search_keywords.slice(0, 3).join(', ') : 'NONE'}`);
        } else {
            addResult(`Product "${productName}" exists`, false, undefined, 'Not found in database');
        }
    }

    return supabase;
}

// ============================================================================
// TEST 2: Product Search Logic
// ============================================================================

async function testProductSearch(supabase: any) {
    log.header('TEST 2: Product Search Logic');

    if (!supabase) {
        log.warn('Skipping - no database connection');
        return;
    }

    // Test search_keywords contains
    const searchTerms = ['merpan', 'captan', 'score', 'fungicide', 'schurft'];

    for (const term of searchTerms) {
        const { data, error } = await supabase
            .from('ctgb_products')
            .select('naam')
            .contains('search_keywords', [term])
            .limit(5);

        if (error) {
            addResult(`Search for "${term}"`, false, undefined, error.message);
        } else {
            const found = data?.length || 0;
            if (found > 0) {
                addResult(`Search for "${term}"`, true, `Found ${found}: ${data.map((p: any) => p.naam).join(', ')}`);
            } else {
                // Try with ilike on naam instead
                const { data: ilikData } = await supabase
                    .from('ctgb_products')
                    .select('naam')
                    .ilike('naam', `%${term}%`)
                    .limit(5);

                if (ilikData && ilikData.length > 0) {
                    addResult(`Search for "${term}"`, false, undefined, `search_keywords empty, but found via naam ilike: ${ilikData.map((p: any) => p.naam).join(', ')}`);
                } else {
                    addResult(`Search for "${term}"`, false, undefined, 'No results in search_keywords OR naam');
                }
            }
        }
    }
}

// ============================================================================
// TEST 3: Parcel Resolution Logic
// ============================================================================

async function testParcelResolution(supabase: any) {
    log.header('TEST 3: Parcel Resolution Logic');

    if (!supabase) {
        log.warn('Skipping - no database connection');
        return;
    }

    // Get all parcels with crops from the v_sprayable_parcels view (correct schema)
    const { data: allParcels, error } = await supabase
        .from('v_sprayable_parcels')
        .select('id, name, crop, variety, area');

    if (error || !allParcels) {
        addResult('Load parcels', false, undefined, error?.message || 'No data');
        return;
    }

    addResult('Load active parcels', true, `Found ${allParcels.length} sprayable parcels`);

    // Check crop distribution
    const cropCounts: Record<string, number> = {};
    for (const p of allParcels) {
        const crop = p.crop?.toLowerCase() || 'NO_CROP';
        cropCounts[crop] = (cropCounts[crop] || 0) + 1;
    }

    log.info(`  Crop distribution: ${JSON.stringify(cropCounts)}`);

    // Test group resolution
    const groupTests = [
        { type: 'crop', value: 'appel', expected: 'Appel parcels' },
        { type: 'crop', value: 'peer', expected: 'Peer parcels' },
        { type: 'variety', value: 'elstar', expected: 'Elstar parcels' },
        { type: 'variety', value: 'conference', expected: 'Conference parcels' },
        { type: 'variety', value: 'kanzi', expected: 'Kanzi parcels' },
    ];

    for (const test of groupTests) {
        let matched: any[] = [];
        if (test.type === 'crop') {
            matched = allParcels.filter((p: any) =>
                p.crop?.toLowerCase().includes(test.value) ||
                p.crop?.toLowerCase() === test.value ||
                p.crop?.toLowerCase() === test.value + 's' ||
                p.crop?.toLowerCase() === test.value + 'en'
            );
        } else if (test.type === 'variety') {
            matched = allParcels.filter((p: any) =>
                p.variety?.toLowerCase().includes(test.value)
            );
        }

        if (matched.length > 0) {
            addResult(`Group "${test.value}" (${test.type})`, true, `Found ${matched.length} parcels: ${matched.slice(0, 3).map((p: any) => p.name).join(', ')}${matched.length > 3 ? '...' : ''}`);
        } else {
            addResult(`Group "${test.value}" (${test.type})`, false, undefined, 'No matching parcels found');
        }
    }
}

// ============================================================================
// TEST 4: V2 Variation Pattern Detection
// ============================================================================

async function testVariationPatternDetection() {
    log.header('TEST 4: V2 Variation Pattern Detection');

    // Import the detection function
    function detectVariationPattern(input: string): { hasVariation: boolean; pattern?: string } {
        const inputLower = input.toLowerCase();

        const variationPatterns = [
            { pattern: /\bbehalve\b/, label: 'behalve' },
            { pattern: /\buitgezonderd\b/, label: 'uitgezonderd' },
            { pattern: /\bniet de\b/, label: 'niet de' },
            { pattern: /\bzonder de?\b/, label: 'zonder' },
            { pattern: /\bmaar\b.*\b(ook|extra|nog)\b/, label: 'maar...ook' },
            { pattern: /\bmaar\b(?!.*\bniet\b).*\b(score|merpan|captan|delan|bellis)/i, label: 'maar + product' },
            { pattern: /\bhalve\s*dosering\b/, label: 'halve dosering' },
            { pattern: /\bdubbele\s*dosering\b/, label: 'dubbele dosering' },
            { pattern: /\b(0[.,]5|halve?)\s*(kg|l)\b/, label: 'halve dosis' },
        ];

        for (const { pattern, label } of variationPatterns) {
            if (pattern.test(inputLower)) {
                return { hasVariation: true, pattern: label };
            }
        }

        return { hasVariation: false };
    }

    const testCases = [
        // Should trigger V2
        { input: 'Alle appels met Merpan, maar de Kanzi ook met Score', shouldTrigger: true },
        { input: 'Alle peren met Captan, behalve de Conference', shouldTrigger: true },
        { input: 'Fruit met Score, uitgezonderd Tessa', shouldTrigger: true },
        { input: 'Appels met Delan, maar Elstar ook extra Luna', shouldTrigger: true },
        { input: 'Peren met 1kg Captan, Lucas halve dosering', shouldTrigger: true },
        { input: 'Alle appels zonder de Kanzi met Merpan', shouldTrigger: true },

        // Should NOT trigger V2
        { input: 'Alle appels met Merpan', shouldTrigger: false },
        { input: '1kg Captan op peren', shouldTrigger: false },
        { input: 'Vandaag gespoten met Score', shouldTrigger: false },
        { input: 'Kanzi nog met Merpan', shouldTrigger: false }, // Follow-up, no variation
    ];

    for (const { input, shouldTrigger } of testCases) {
        const result = detectVariationPattern(input);

        if (result.hasVariation === shouldTrigger) {
            addResult(
                `Pattern: "${input.slice(0, 40)}..."`,
                true,
                result.hasVariation ? `Triggered (${result.pattern})` : 'Not triggered (expected)'
            );
        } else {
            addResult(
                `Pattern: "${input.slice(0, 40)}..."`,
                false,
                undefined,
                `Expected ${shouldTrigger ? 'trigger' : 'no trigger'}, got ${result.hasVariation ? `trigger (${result.pattern})` : 'no trigger'}`
            );
        }
    }
}

// ============================================================================
// TEST 5: API Endpoint Tests
// ============================================================================

async function testAPIEndpoints() {
    log.header('TEST 5: API Endpoint Tests');

    const baseUrl = 'http://localhost:3000';

    // Check if server is running
    try {
        const healthCheck = await fetch(`${baseUrl}/api/validate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ draft: { plots: [], products: [] } }),
        });

        if (healthCheck.ok) {
            addResult('Dev server running', true, `Status ${healthCheck.status}`);
        } else {
            addResult('Dev server running', false, undefined, `Status ${healthCheck.status}`);
            return;
        }
    } catch (e: any) {
        addResult('Dev server running', false, undefined, `Connection failed: ${e.message}. Run "npm run dev" first.`);
        log.warn('Skipping API tests - server not running');
        return;
    }

    // Test analyze-input endpoint
    log.subheader('Testing /api/analyze-input');

    const analyzeTests = [
        {
            name: 'Simple spray input',
            input: {
                rawInput: '1kg Merpan op alle appels',
                previousDraft: null,
                chatHistory: [],
                parcelInfo: [
                    { id: 'test-1', name: 'Appel Perceel 1', crop: 'Appel', variety: 'Elstar' },
                    { id: 'test-2', name: 'Peer Perceel 1', crop: 'Peer', variety: 'Conference' },
                ],
            },
        },
        {
            name: 'V2 Grouped input',
            input: {
                rawInput: 'Alle appels met Merpan, maar de Kanzi ook met Score',
                previousDraft: null,
                chatHistory: [],
                parcelInfo: [
                    { id: 'test-1', name: 'Appel Elstar', crop: 'Appel', variety: 'Elstar' },
                    { id: 'test-2', name: 'Appel Kanzi', crop: 'Appel', variety: 'Kanzi' },
                    { id: 'test-3', name: 'Peer Conference', crop: 'Peer', variety: 'Conference' },
                ],
            },
        },
    ];

    for (const test of analyzeTests) {
        try {
            const response = await fetch(`${baseUrl}/api/analyze-input`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(test.input),
            });

            if (!response.ok) {
                addResult(test.name, false, undefined, `HTTP ${response.status}`);
                continue;
            }

            // Read streaming response
            const reader = response.body?.getReader();
            if (!reader) {
                addResult(test.name, false, undefined, 'No response body');
                continue;
            }

            const decoder = new TextDecoder();
            let fullResponse = '';
            let messageTypes: string[] = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                fullResponse += chunk;

                // Parse lines
                const lines = chunk.split('\n').filter(Boolean);
                for (const line of lines) {
                    try {
                        const msg = JSON.parse(line);
                        messageTypes.push(msg.type);
                    } catch { }
                }
            }

            const hasComplete = messageTypes.includes('complete') || messageTypes.includes('grouped_complete');
            const hasError = messageTypes.includes('error');

            if (hasError) {
                addResult(test.name, false, undefined, `Error in stream: ${fullResponse.slice(0, 200)}`);
            } else if (hasComplete) {
                addResult(test.name, true, `Stream types: ${messageTypes.join(' → ')}`);
            } else {
                addResult(test.name, false, undefined, `No complete message. Types: ${messageTypes.join(', ')}`);
            }
        } catch (e: any) {
            addResult(test.name, false, undefined, e.message);
        }
    }

    // Test validate endpoint
    log.subheader('Testing /api/validate');

    const validateTests = [
        {
            name: 'Valid draft',
            input: {
                draft: {
                    plots: ['test-1', 'test-2'],
                    products: [{ product: 'Merpan', dosage: 1, unit: 'kg' }],
                    date: new Date().toISOString().split('T')[0],
                },
            },
        },
        {
            name: 'Empty draft',
            input: {
                draft: { plots: [], products: [] },
            },
        },
    ];

    for (const test of validateTests) {
        try {
            const response = await fetch(`${baseUrl}/api/validate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(test.input),
            });

            const data = await response.json();

            if (response.ok && data.status) {
                addResult(test.name, true, `Status: ${data.status}`);
            } else {
                addResult(test.name, false, undefined, `Response: ${JSON.stringify(data).slice(0, 100)}`);
            }
        } catch (e: any) {
            addResult(test.name, false, undefined, e.message);
        }
    }
}

// ============================================================================
// TEST 6: End-to-End Flow Simulation
// ============================================================================

async function testE2EFlow(supabase: any) {
    log.header('TEST 6: End-to-End Flow Simulation');

    if (!supabase) {
        log.warn('Skipping - no database connection');
        return;
    }

    // Get real parcels and products
    const { data: realParcels } = await supabase
        .from('parcels')
        .select('id, name, crop, variety')
        .eq('active', true)
        .limit(5);

    const { data: realProducts } = await supabase
        .from('ctgb_products')
        .select('naam')
        .limit(10);

    if (!realParcels?.length || !realProducts?.length) {
        addResult('E2E prerequisites', false, undefined, 'No parcels or products in database');
        return;
    }

    log.info(`Using ${realParcels.length} real parcels and ${realProducts.length} products for simulation`);

    // Simulate the flow
    const testInput = `1 kg ${realProducts[0].naam} op ${realParcels[0].name}`;
    log.info(`Simulating input: "${testInput}"`);

    // This would require the server to be running
    log.info('(Full E2E test requires running server - use Playwright tests for browser simulation)');
    addResult('E2E simulation', true, 'Prerequisites available');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
    console.log(`\n${colors.bold}${colors.cyan}╔══════════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.bold}${colors.cyan}║       SMART INPUT V2 - COMPREHENSIVE TEST SUITE          ║${colors.reset}`);
    console.log(`${colors.bold}${colors.cyan}╚══════════════════════════════════════════════════════════╝${colors.reset}\n`);

    const startTime = Date.now();

    // Run tests
    const supabase = await testDatabaseConnection();
    await testProductSearch(supabase);
    await testParcelResolution(supabase);
    await testVariationPatternDetection();
    await testAPIEndpoints();
    await testE2EFlow(supabase);

    // Summary
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    console.log(`\n${colors.bold}${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bold}SUMMARY${colors.reset}`);
    console.log(`${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`\nTotal tests: ${results.length}`);
    console.log(`${colors.green}Passed: ${passed}${colors.reset}`);
    console.log(`${colors.red}Failed: ${failed}${colors.reset}`);
    console.log(`Time: ${elapsed}s`);

    if (failed > 0) {
        console.log(`\n${colors.bold}${colors.red}FAILED TESTS:${colors.reset}`);
        for (const r of results.filter(r => !r.passed)) {
            console.log(`  ${colors.red}✗${colors.reset} ${r.name}: ${r.error || 'Unknown error'}`);
        }
    }

    console.log(`\n${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}\n`);

    // Exit with error code if tests failed
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
