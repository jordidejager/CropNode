/**
 * Test Script: Multi-Turn Correction Service
 *
 * This script simulates a complete multi-turn registration session
 * to verify that all correction types work correctly.
 *
 * Run with: npx tsx scripts/test-multi-turn-corrections.ts
 */

import {
    detectCorrection,
    applyGroupedCorrection,
    getGroupedCorrectionMessage,
    type CorrectionResult,
    type ParcelInfo,
    type DraftContext
} from '../src/lib/correction-service';

import type { SprayRegistrationGroup, SprayRegistrationUnit, ProductEntry } from '../src/lib/types';

// ============================================
// Test Data: Mock Parcels
// ============================================

const mockParcels: ParcelInfo[] = [
    { id: 'parcel-1', name: 'Stadhoek', variety: 'Conference', crop: 'Peer' },
    { id: 'parcel-2', name: 'Thuis', variety: 'Conference', crop: 'Peer' },
    { id: 'parcel-3', name: 'Plantsoen', variety: 'Conference', crop: 'Peer' },
    { id: 'parcel-4', name: 'Schele', variety: 'Conference', crop: 'Peer' },
    { id: 'parcel-5', name: 'Busje', variety: 'Doyenne', crop: 'Peer' },
    { id: 'parcel-6', name: 'Jachthoek', variety: 'Doyenne', crop: 'Peer' },
    { id: 'parcel-7', name: 'Boomgaard Noord', variety: 'Elstar', crop: 'Appel' },
    { id: 'parcel-8', name: 'Boomgaard Zuid', variety: 'Jonagold', crop: 'Appel' },
    { id: 'parcel-9', name: 'Kanzi Blok', variety: 'Kanzi', crop: 'Appel' },
];

// All pear parcel IDs
const allPearIds = mockParcels.filter(p => p.crop === 'Peer').map(p => p.id);

// ============================================
// Helper Functions
// ============================================

function createInitialGroup(): SprayRegistrationGroup {
    return {
        groupId: 'group-test-1',
        date: getYesterday(),
        rawInput: 'gisteren alle peren gespoten met merpan',
        units: [{
            id: 'unit-1',
            plots: [...allPearIds],
            products: [{
                product: 'Merpan 500 SC',
                dosage: 2.5,
                unit: 'L'
            }],
            label: 'Alle peren',
            status: 'pending'
        }]
    };
}

function getYesterday(): Date {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    d.setHours(12, 0, 0, 0);
    return d;
}

function getDayBeforeYesterday(): Date {
    const d = new Date();
    d.setDate(d.getDate() - 2);
    d.setHours(12, 0, 0, 0);
    return d;
}

function logGroup(label: string, group: SprayRegistrationGroup): void {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📋 ${label}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Date: ${group.date.toLocaleDateString('nl-NL')}`);
    console.log(`Units: ${group.units.length}`);

    group.units.forEach((unit, i) => {
        console.log(`\n  Unit ${i + 1}: ${unit.label || 'Unnamed'}`);
        console.log(`    Plots (${unit.plots.length}): ${unit.plots.map(id => {
            const p = mockParcels.find(mp => mp.id === id);
            return p?.name || id;
        }).join(', ')}`);
        console.log(`    Products: ${unit.products.map(p => `${p.product} (${p.dosage} ${p.unit})`).join(', ')}`);
        if (unit.date) {
            console.log(`    Date: ${unit.date.toLocaleDateString('nl-NL')}`);
        }
        console.log(`    Status: ${unit.status}`);
    });
}

function logCorrection(input: string, correction: CorrectionResult): void {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`💬 Input: "${input}"`);
    console.log(`🔍 Detected: ${correction.type} (confidence: ${correction.confidence.toFixed(2)})`);
    if (correction.target) console.log(`   Target: ${correction.target}`);
    if (correction.targets) console.log(`   Targets: ${correction.targets.join(', ')}`);
    if (correction.entities) {
        console.log(`   Entities: ${JSON.stringify(correction.entities, null, 2).replace(/\n/g, '\n   ')}`);
    }
    if (correction.explanation) console.log(`   Explanation: ${correction.explanation}`);
}

// ============================================
// Test Scenarios
// ============================================

interface TestScenario {
    input: string;
    expectedType: string;
    description: string;
}

const testScenarios: TestScenario[] = [
    // Bericht 1: Initial state (no correction needed)
    // Bericht 2: Update specific product dosage
    {
        input: 'nee de merpan is 0,5',  // Must mention product name for specific update
        expectedType: 'update_dosage_specific',
        description: 'Update dosering Merpan naar 0.5 in alle units'
    },
    // Bericht 3: Split parcel to different date
    {
        input: 'perceel stadhoek was trouwens eergisteren',
        expectedType: 'add_plot_different_date',
        description: 'Split stadhoek naar eigen unit met datum eergisteren'
    },
    // Bericht 4: Add product to specific parcels
    {
        input: 'bij de Conference nog Score bijgedaan',
        expectedType: 'add_product_to_plots',
        description: 'Conference unit krijgt extra product Score'
    },
    // Bericht 5: Override dosage for specific parcel
    {
        input: 'perceel thuis maar halve dosering gespoten',
        expectedType: 'override_dosage_for_plots',
        description: 'Thuis wordt eigen unit met halve dosering'
    },
];

const additionalTests: TestScenario[] = [
    // Test replace_product (same as swap but different pattern)
    {
        input: 'niet Merpan maar Captan',
        expectedType: 'replace_product',  // Uses existing replace pattern
        description: 'Vervang Merpan door Captan in alle units'
    },
    // Test swap_product with explicit command
    {
        input: 'vervang merpan door captan',
        expectedType: 'swap_product',
        description: 'Expliciet product swap commando'
    },
    // Test add_plot_to_existing
    {
        input: 'oh en de Kanzi ook',
        expectedType: 'add_plot_to_existing',
        description: 'Voeg Kanzi toe aan de registratie'
    },
    // Test update_dosage_specific
    {
        input: 'nee de merpan is 1.5',
        expectedType: 'update_dosage_specific',
        description: 'Update alleen Merpan dosering naar 1.5'
    },
    // Test add_plot_different_date (most common pattern for date-based parcel additions)
    {
        input: 'de Conference was eergisteren',
        expectedType: 'add_plot_different_date',  // Creates new unit with different date
        description: 'Perceel met afwijkende datum'
    },
];

// ============================================
// Main Test Runner
// ============================================

async function runTests(): Promise<void> {
    console.log('\n🧪 Multi-Turn Correction Service Test Suite\n');
    console.log('=' .repeat(60));

    let currentGroup = createInitialGroup();
    logGroup('INITIAL STATE: "gisteren alle peren gespoten met merpan"', currentGroup);

    // Create DraftContext from the group for detection
    const createDraftContext = (group: SprayRegistrationGroup): DraftContext => ({
        plots: group.units.flatMap(u => u.plots),
        products: group.units[0]?.products || [],
        date: group.date.toISOString(),
        parcelInfo: mockParcels
    });

    let passCount = 0;
    let failCount = 0;

    // Run main test scenarios
    console.log('\n\n📝 MAIN SCENARIO: Multi-Turn Session\n');

    for (const scenario of testScenarios) {
        const draftContext = createDraftContext(currentGroup);
        const correction = detectCorrection(scenario.input, draftContext);

        logCorrection(scenario.input, correction);

        const passed = correction.type === scenario.expectedType;
        if (passed) {
            passCount++;
            console.log(`   ✅ PASS: Detected ${correction.type}`);

            // Apply the correction
            const newGroup = applyGroupedCorrection(correction, currentGroup, mockParcels);
            const message = getGroupedCorrectionMessage(correction, currentGroup, newGroup);
            console.log(`   💬 Response: ${message}`);

            currentGroup = newGroup;
            logGroup(`STATE AFTER: ${scenario.description}`, currentGroup);
        } else {
            failCount++;
            console.log(`   ❌ FAIL: Expected ${scenario.expectedType}, got ${correction.type}`);
        }
    }

    // Run additional individual tests
    console.log('\n\n📝 ADDITIONAL TESTS: Individual Corrections\n');

    for (const scenario of additionalTests) {
        // Reset to initial state for each additional test
        const testGroup = createInitialGroup();
        const draftContext = createDraftContext(testGroup);
        const correction = detectCorrection(scenario.input, draftContext);

        logCorrection(scenario.input, correction);

        const passed = correction.type === scenario.expectedType;
        if (passed) {
            passCount++;
            console.log(`   ✅ PASS: Detected ${correction.type}`);

            // Apply and show result
            const newGroup = applyGroupedCorrection(correction, testGroup, mockParcels);
            const message = getGroupedCorrectionMessage(correction, testGroup, newGroup);
            console.log(`   💬 Response: ${message}`);

            // Show unit changes
            console.log(`   📊 Units: ${testGroup.units.length} → ${newGroup.units.length}`);
        } else {
            failCount++;
            console.log(`   ❌ FAIL: Expected ${scenario.expectedType}, got ${correction.type}`);
        }
    }

    // Test confirm scenario
    console.log('\n\n📝 FINAL TEST: Confirmation\n');
    {
        const draftContext = createDraftContext(currentGroup);
        const correction = detectCorrection('klopt, opslaan', draftContext);
        logCorrection('klopt, opslaan', correction);

        if (correction.type === 'confirm') {
            passCount++;
            console.log('   ✅ PASS: Confirmation detected');
            console.log('   → Ready to save all units to spuitschrift');
        } else {
            failCount++;
            console.log(`   ❌ FAIL: Expected confirm, got ${correction.type}`);
        }
    }

    // Summary
    console.log('\n\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total tests: ${passCount + failCount}`);
    console.log(`✅ Passed: ${passCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log(`Success rate: ${((passCount / (passCount + failCount)) * 100).toFixed(1)}%`);

    if (failCount > 0) {
        process.exit(1);
    }
}

// ============================================
// Edge Case Tests
// ============================================

async function runEdgeCaseTests(): Promise<void> {
    console.log('\n\n🔬 EDGE CASE TESTS\n');

    const edgeCases = [
        // Ambiguous input
        { input: 'conference', expected: 'none', desc: 'Ambiguous - just variety name' },
        // Short form dosage
        { input: 'merpan 0.5 kg', expected: 'update_dosage_specific', desc: 'Short form dosage update' },
        // Multiple parcels date change
        { input: 'stadhoek en thuis waren maandag', expected: 'update_date_for_plots', desc: 'Multiple parcels date' },
        // Swap with known products
        { input: 'vervang score door bellis', expected: 'swap_product', desc: 'Explicit swap command' },
    ];

    for (const { input, expected, desc } of edgeCases) {
        const group = createInitialGroup();
        const draftContext: DraftContext = {
            plots: group.units.flatMap(u => u.plots),
            products: group.units[0]?.products || [],
            parcelInfo: mockParcels
        };

        const correction = detectCorrection(input, draftContext);
        const passed = correction.type === expected;

        console.log(`${passed ? '✅' : '❌'} "${input}"`);
        console.log(`   Expected: ${expected}, Got: ${correction.type}`);
        console.log(`   (${desc})\n`);
    }
}

// ============================================
// Run All Tests
// ============================================

console.log(`
╔══════════════════════════════════════════════════════════════╗
║  Multi-Turn Correction Service - Integration Test Suite      ║
║                                                              ║
║  Testing the following correction types:                     ║
║  • update_dosage_specific - Dosering voor specifiek product  ║
║  • add_plot_to_existing   - Perceel toevoegen               ║
║  • add_plot_different_date - Perceel met andere datum       ║
║  • add_product_to_plots   - Product aan subset              ║
║  • override_dosage_for_plots - Afwijkende dosering          ║
║  • swap_product           - Product vervangen               ║
║  • update_date_for_plots  - Datum wijzigen voor subset      ║
╚══════════════════════════════════════════════════════════════╝
`);

runTests()
    .then(() => runEdgeCaseTests())
    .catch(err => {
        console.error('Test failed with error:', err);
        process.exit(1);
    });
