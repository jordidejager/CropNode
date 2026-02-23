#!/usr/bin/env npx tsx
/**
 * Regression Test Runner voor Slimme Invoer V2
 *
 * Stuurt elk scenario door de smart-input-v2 API en vergelijkt
 * het resultaat met de verwachte output.
 *
 * Usage:
 *   npx tsx scripts/run-regression-tests.ts [options]
 *
 * Options:
 *   --category=simpel    Run alleen tests van deze categorie
 *   --id=simpel-001      Run alleen deze specifieke test
 *   --verbose            Toon gedetailleerde output
 *   --base-url=URL       API base URL (default: http://localhost:3000)
 */

import { alleTests, testCategorieen, type RegressionTest } from './regression-corpus';

// ============================================================================
// CONFIGURATION
// ============================================================================

const args = process.argv.slice(2);
const verbose = args.includes('--verbose') || args.includes('-v');
const categoryArg = args.find(a => a.startsWith('--category='))?.split('=')[1];
const idArg = args.find(a => a.startsWith('--id='))?.split('=')[1];
const baseUrl = args.find(a => a.startsWith('--base-url='))?.split('=')[1] || 'http://localhost:3000';

// ============================================================================
// TYPES
// ============================================================================

interface TestResult {
    test: RegressionTest;
    passed: boolean;
    score: number;           // 0-100
    errors: string[];
    warnings: string[];
    actualOutput?: {
        aantalUnits: number;
        percelen: string[];
        producten: string[];
        doseringen: Record<string, number>;
        datum: string;
    };
    responseTime: number;
}

interface ApiResponse {
    action: string;
    humanSummary?: string;
    registration?: {
        groupId: string;
        date: string;
        rawInput: string;
        units: Array<{
            id: string;
            plots: string[];
            products: Array<{
                product: string;
                dosage: number;
                unit: string;
            }>;
            label?: string;
            status: string;
            date?: string;
        }>;
    };
    clarification?: {
        question: string;
        options?: string[];
        field: string;
    };
    validationFlags?: Array<{
        type: string;
        message: string;
    }>;
    error?: string;
}

// ============================================================================
// API CALLER
// ============================================================================

async function callSmartInputApi(
    message: string,
    conversationHistory: Array<{ id: string; role: 'user' | 'assistant'; content: string; timestamp: string }>,
    currentDraft: ApiResponse['registration'] | null
): Promise<ApiResponse> {
    const response = await fetch(`${baseUrl}/api/smart-input-v2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message,
            conversationHistory,
            currentDraft,
        }),
    });

    if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
    }

    // Parse streaming response
    const text = await response.text();
    const lines = text.split('\n').filter(l => l.trim());

    // Get the last 'complete' message
    for (let i = lines.length - 1; i >= 0; i--) {
        try {
            const msg = JSON.parse(lines[i]);
            if (msg.type === 'complete') {
                return msg.response;
            }
            if (msg.type === 'error') {
                return { action: 'error', error: msg.message };
            }
        } catch {
            // Skip non-JSON lines
        }
    }

    throw new Error('No complete message in response');
}

// ============================================================================
// TEST RUNNER
// ============================================================================

async function runTest(test: RegressionTest): Promise<TestResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    let conversationHistory: Array<{ id: string; role: 'user' | 'assistant'; content: string; timestamp: string }> = [];
    let currentDraft: ApiResponse['registration'] | null = null;
    let lastResponse: ApiResponse | null = null;

    try {
        // Run through all messages in sequence
        for (const message of test.berichten) {
            if (verbose) {
                console.log(`  → Sending: "${message}"`);
            }

            lastResponse = await callSmartInputApi(message, conversationHistory, currentDraft);

            // Update conversation history
            conversationHistory.push({
                id: crypto.randomUUID(),
                role: 'user',
                content: message,
                timestamp: new Date().toISOString(),
            });

            if (lastResponse.humanSummary) {
                conversationHistory.push({
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: lastResponse.humanSummary,
                    timestamp: new Date().toISOString(),
                });
            }

            // Update draft for next iteration
            if (lastResponse.registration) {
                currentDraft = lastResponse.registration;
            }

            if (lastResponse.action === 'cancel') {
                currentDraft = null;
            }

            if (verbose && lastResponse.humanSummary) {
                console.log(`  ← Response: "${lastResponse.humanSummary}"`);
            }
        }

        if (!lastResponse) {
            errors.push('Geen response ontvangen');
            return {
                test,
                passed: false,
                score: 0,
                errors,
                warnings,
                responseTime: Date.now() - startTime,
            };
        }

        // Extract actual output
        const actualOutput = extractActualOutput(lastResponse);

        // Compare with expected
        const comparison = compareOutput(test, actualOutput, errors, warnings);

        return {
            test,
            passed: errors.length === 0,
            score: comparison.score,
            errors,
            warnings,
            actualOutput,
            responseTime: Date.now() - startTime,
        };

    } catch (error) {
        errors.push(`Exception: ${error instanceof Error ? error.message : String(error)}`);
        return {
            test,
            passed: false,
            score: 0,
            errors,
            warnings,
            responseTime: Date.now() - startTime,
        };
    }
}

function extractActualOutput(response: ApiResponse) {
    const registration = response.registration;

    if (!registration) {
        return {
            aantalUnits: 0,
            percelen: [],
            producten: [],
            doseringen: {} as Record<string, number>,
            datum: '',
        };
    }

    const allPlots = registration.units.flatMap(u => u.plots);
    const allProducts = registration.units.flatMap(u => u.products);

    const doseringen: Record<string, number> = {};
    for (const prod of allProducts) {
        doseringen[prod.product] = prod.dosage;
    }

    return {
        aantalUnits: registration.units.length,
        percelen: allPlots,
        producten: [...new Set(allProducts.map(p => p.product))],
        doseringen,
        datum: registration.date,
    };
}

function compareOutput(
    test: RegressionTest,
    actual: ReturnType<typeof extractActualOutput>,
    errors: string[],
    warnings: string[]
): { score: number } {
    let totalChecks = 0;
    let passedChecks = 0;

    const { verwacht } = test;

    // Check aantal units
    if (verwacht.aantalUnits !== undefined) {
        totalChecks++;
        if (actual.aantalUnits === verwacht.aantalUnits) {
            passedChecks++;
        } else {
            errors.push(`Aantal units: verwacht ${verwacht.aantalUnits}, kreeg ${actual.aantalUnits}`);
        }
    }

    // Check producten
    if (verwacht.producten && verwacht.producten.length > 0) {
        for (const expectedProduct of verwacht.producten) {
            totalChecks++;
            const found = actual.producten.some(p =>
                p.toLowerCase().includes(expectedProduct.toLowerCase()) ||
                expectedProduct.toLowerCase().includes(p.toLowerCase())
            );
            if (found) {
                passedChecks++;
            } else {
                errors.push(`Product "${expectedProduct}" niet gevonden in output: [${actual.producten.join(', ')}]`);
            }
        }
    }

    // Check doseringen
    if (verwacht.doseringen) {
        for (const [product, expectedDosage] of Object.entries(verwacht.doseringen)) {
            totalChecks++;
            const actualProduct = Object.keys(actual.doseringen).find(p =>
                p.toLowerCase().includes(product.toLowerCase())
            );
            if (actualProduct) {
                const actualDosage = actual.doseringen[actualProduct];
                if (Math.abs(actualDosage - expectedDosage) < 0.01) {
                    passedChecks++;
                } else {
                    errors.push(`Dosering ${product}: verwacht ${expectedDosage}, kreeg ${actualDosage}`);
                }
            } else {
                errors.push(`Product "${product}" niet gevonden voor dosering check`);
            }
        }
    }

    // Check perceel criteria
    if (verwacht.perceelCriteria) {
        const criteria = verwacht.perceelCriteria;

        if (criteria.minAantal !== undefined) {
            totalChecks++;
            if (actual.percelen.length >= criteria.minAantal) {
                passedChecks++;
            } else {
                errors.push(`Min percelen: verwacht ${criteria.minAantal}, kreeg ${actual.percelen.length}`);
            }
        }

        if (criteria.maxAantal !== undefined) {
            totalChecks++;
            if (actual.percelen.length <= criteria.maxAantal) {
                passedChecks++;
            } else {
                errors.push(`Max percelen: verwacht ${criteria.maxAantal}, kreeg ${actual.percelen.length}`);
            }
        }

        // Note: crop and variety checks would require parcel data lookup
        // For now, we'll add these as warnings if we can't verify
        if (criteria.crop) {
            warnings.push(`Crop check "${criteria.crop}" niet geverifieerd (vereist perceel lookup)`);
        }

        if (criteria.nietAanwezig) {
            for (const notAllowed of criteria.nietAanwezig) {
                const found = actual.percelen.some(p =>
                    p.toLowerCase().includes(notAllowed.toLowerCase())
                );
                if (found) {
                    errors.push(`Perceel "${notAllowed}" zou niet aanwezig moeten zijn`);
                }
            }
        }
    }

    // Check specifieke percelen
    if (verwacht.percelen && verwacht.percelen.length > 0) {
        for (const expectedParcel of verwacht.percelen) {
            totalChecks++;
            const found = actual.percelen.some(p =>
                p.toLowerCase().includes(expectedParcel.toLowerCase())
            );
            if (found) {
                passedChecks++;
            } else {
                warnings.push(`Perceel "${expectedParcel}" niet gevonden in output`);
            }
        }
    }

    // Check datum
    if (verwacht.datumRelatief) {
        totalChecks++;
        const expectedDate = getRelativeDate(verwacht.datumRelatief);
        const actualDate = new Date(actual.datum);

        if (isSameDay(expectedDate, actualDate)) {
            passedChecks++;
        } else {
            errors.push(`Datum: verwacht ${verwacht.datumRelatief} (${expectedDate.toISOString().split('T')[0]}), kreeg ${actual.datum}`);
        }
    }

    const score = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 100;
    return { score };
}

function getRelativeDate(relative: string): Date {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (relative) {
        case 'vandaag':
            return today;
        case 'gisteren':
            return new Date(today.getTime() - 24 * 60 * 60 * 1000);
        case 'eergisteren':
            return new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);
        case 'morgen':
            return new Date(today.getTime() + 24 * 60 * 60 * 1000);
        default:
            return today;
    }
}

function isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() &&
           a.getMonth() === b.getMonth() &&
           a.getDate() === b.getDate();
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
    console.log('🧪 Slimme Invoer V2 Regression Tests\n');
    console.log(`Base URL: ${baseUrl}`);

    // Filter tests based on arguments
    let testsToRun = alleTests;

    if (categoryArg) {
        const category = categoryArg as keyof typeof testCategorieen;
        if (testCategorieen[category]) {
            testsToRun = testCategorieen[category];
            console.log(`Categorie filter: ${categoryArg}`);
        } else {
            console.error(`Onbekende categorie: ${categoryArg}`);
            console.error(`Beschikbaar: ${Object.keys(testCategorieen).join(', ')}`);
            process.exit(1);
        }
    }

    if (idArg) {
        testsToRun = testsToRun.filter(t => t.id === idArg);
        if (testsToRun.length === 0) {
            console.error(`Test niet gevonden: ${idArg}`);
            process.exit(1);
        }
    }

    console.log(`Tests te runnen: ${testsToRun.length}\n`);
    console.log('─'.repeat(60));

    const results: TestResult[] = [];
    let passed = 0;
    let failed = 0;

    for (const test of testsToRun) {
        process.stdout.write(`[${test.id}] ${test.beschrijving}... `);

        try {
            const result = await runTest(test);
            results.push(result);

            if (result.passed) {
                passed++;
                console.log(`✅ (${result.score}%, ${result.responseTime}ms)`);
            } else {
                failed++;
                console.log(`❌ (${result.score}%, ${result.responseTime}ms)`);
                if (verbose) {
                    for (const error of result.errors) {
                        console.log(`   ⚠️  ${error}`);
                    }
                }
            }
        } catch (error) {
            failed++;
            console.log(`💥 Exception: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    console.log('─'.repeat(60));

    // Summary
    const totalScore = results.length > 0
        ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length)
        : 0;

    console.log(`\n📊 Resultaten:`);
    console.log(`   Totaal:   ${testsToRun.length} tests`);
    console.log(`   Geslaagd: ${passed} (${Math.round(passed / testsToRun.length * 100)}%)`);
    console.log(`   Gefaald:  ${failed} (${Math.round(failed / testsToRun.length * 100)}%)`);
    console.log(`   Score:    ${totalScore}%`);

    // Category breakdown
    const categoryScores = new Map<string, { total: number; passed: number }>();
    for (const result of results) {
        const cat = result.test.categorie;
        const current = categoryScores.get(cat) || { total: 0, passed: 0 };
        current.total++;
        if (result.passed) current.passed++;
        categoryScores.set(cat, current);
    }

    console.log(`\n📈 Per categorie:`);
    for (const [category, stats] of categoryScores) {
        const pct = Math.round(stats.passed / stats.total * 100);
        const bar = '█'.repeat(Math.floor(pct / 10)) + '░'.repeat(10 - Math.floor(pct / 10));
        console.log(`   ${category.padEnd(12)} ${bar} ${pct}% (${stats.passed}/${stats.total})`);
    }

    // Failed tests summary
    if (failed > 0) {
        console.log(`\n❌ Gefaalde tests:`);
        for (const result of results.filter(r => !r.passed)) {
            console.log(`   [${result.test.id}] ${result.test.beschrijving}`);
            for (const error of result.errors.slice(0, 3)) {
                console.log(`      → ${error}`);
            }
        }
    }

    // Exit code for CI
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
