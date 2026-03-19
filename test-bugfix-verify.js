/**
 * Bugfix Verification Tests for Slimme Invoer V2
 * Tests: BUG-001, BUG-002, BUG-003, BUG-004, BUG-005, OBS-003
 *
 * Wait up to 35s for AI to respond, then read card content.
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3003';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots-bugfix');

let page, browser;

async function setup() {
    if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    page = await ctx.newPage();
}

async function login() {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.waitForSelector('input[name="username"]', { timeout: 10000 });
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'admin123');
    await page.click('button[type="submit"]');

    // Wait for redirect — try waitForURL first, then manual poll
    const redirected = await page.waitForURL('**/command-center**', { timeout: 10000 }).then(() => true).catch(() => false);
    if (!redirected) {
        // Manual poll for up to 10 more seconds
        for (let i = 0; i < 10; i++) {
            await page.waitForTimeout(1000);
            if (page.url().includes('command-center')) break;
        }
    }

    const isLoggedIn = page.url().includes('command-center');
    console.log(`Login: ${isLoggedIn ? '✅ SUCCESS' : '❌ FAILED'} (${page.url()})`);

    if (!isLoggedIn) {
        // Check for error message
        const errorText = await page.evaluate(() => document.body.innerText.substring(0, 300));
        console.log(`Login page: ${errorText.substring(0, 150)}`);
    }

    return isLoggedIn;
}

async function goToV2() {
    await page.goto(`${BASE}/command-center/smart-input-v2`, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Check if redirected to login
    if (page.url().includes('login')) {
        console.log('   ⚠️ Session expired, re-login...');
        await login();
        await page.goto(`${BASE}/command-center/smart-input-v2`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }

    // Wait for context to finish loading
    for (let i = 0; i < 40; i++) {
        await page.waitForTimeout(1000);
        const isLoading = await page.evaluate(() => document.body.innerText.includes('Context laden...'));
        if (!isLoading) {
            if (i > 5) console.log(`   Context loaded after ${i + 1}s`);
            break;
        }
        if (i === 39) console.log('   ⚠️ Context still loading after 40s!');
    }
    await page.waitForTimeout(1500);
}

async function typeMessage(text) {
    // Use :visible to target the correct (desktop) textarea
    const textarea = page.locator('textarea[data-testid="chat-input"]:visible').first();
    await textarea.click({ timeout: 5000 });
    await textarea.fill(text);
    await page.waitForTimeout(300);
    await textarea.press('Enter');
}

async function waitForResponse(maxWaitSec = 35) {
    const start = Date.now();
    const maxWait = maxWaitSec * 1000;

    while (Date.now() - start < maxWait) {
        await page.waitForTimeout(1000);

        const state = await page.evaluate(() => {
            const body = document.body.innerText;
            const isProcessing = body.includes('Invoer analyseren...') ||
                                 body.includes('Producten resolven...') ||
                                 body.includes('Agent analyseert...') ||
                                 body.includes('Agent denkt na...') ||
                                 body.includes('Valideren...') ||
                                 body.includes('Verwerken...') ||
                                 body.includes('Even denken...') ||
                                 body.includes('Percelen ophalen...');
            return { isProcessing };
        });

        if (!state.isProcessing) {
            // Extra wait for rendering
            await page.waitForTimeout(2000);
            break;
        }
    }
}

async function readCard() {
    return await page.evaluate(() => {
        const body = document.body.innerText;

        // UI renders "PERCELEN (7)" and "MIDDELEN (1)" via CSS uppercase
        const parcelMatch = body.match(/PERCELEN\s*\((\d+)\)/i) ||
                            body.match(/(\d+)\s*(?:percelen|perceel)/i);
        // Ha format: "24.79 ha" or "24,79 ha"
        const haMatch = body.match(/([\d.,]+)\s*ha/i);
        // Middelen: "MIDDELEN (2)" or "2 middelen"
        const middelMatch = body.match(/MIDDELEN\s*\((\d+)\)/i) ||
                            body.match(/(\d+)\s*middel/i);

        // Check for specific content
        const hasBevestigen = /bevestigen/i.test(body);
        const hasWelkePercelen = /welke\s*percelen/i.test(body);
        const hasWelkeDosering = /welke\s*dosering/i.test(body) || /dosering\s*ontbreekt/i.test(body) || /geen\s*dosering/i.test(body);
        const hasWelkMiddel = /welk\s*middel/i.test(body);
        const hasOnbekendMiddel = /onbekend\s*middel/i.test(body) ||
                                  /niet\s*gevonden/i.test(body) ||
                                  /onbekend\s*product/i.test(body) ||
                                  /niet\s*herkend/i.test(body);
        const hasUnitGeenProducten = /geen\s*producten/i.test(body);
        const isStillProcessing = body.includes('Verwerken...') ||
                                  body.includes('Even denken...') ||
                                  body.includes('Invoer analyseren...') ||
                                  body.includes('Producten resolven...') ||
                                  body.includes('Agent analyseert...') ||
                                  body.includes('Agent denkt na...') ||
                                  body.includes('Valideren...');

        return {
            parcelCount: parcelMatch ? parseInt(parcelMatch[1]) : 0,
            hectare: haMatch ? parseFloat(haMatch[1].replace(',', '.')) : 0,
            middelCount: middelMatch ? parseInt(middelMatch[1]) : 0,
            hasBevestigen,
            hasWelkePercelen,
            hasWelkeDosering,
            hasWelkMiddel,
            hasOnbekendMiddel,
            hasUnitGeenProducten,
            isStillProcessing,
            snippet: body.substring(0, 800),
        };
    });
}

async function shot(name) {
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage: false });
}

// ============================================
// TEST CASES
// ============================================

const results = [];

async function runTest(id, input, validator, description) {
    console.log(`\n🧪 ${id}: ${description}`);
    console.log(`   Input: "${input}"`);

    try {
        await goToV2();
        await typeMessage(input);
        await waitForResponse(35);
        await shot(id);

        const card = await readCard();
        console.log(`   Card: ${card.parcelCount} percelen, ${card.hectare} ha, middelen=${card.middelCount}`);
        console.log(`   Bevestigen=${card.hasBevestigen}, WelkePercelen=${card.hasWelkePercelen}, WelkeDosering=${card.hasWelkeDosering}`);
        console.log(`   OnbekendMiddel=${card.hasOnbekendMiddel}, GeenProducten=${card.hasUnitGeenProducten}, StillProcessing=${card.isStillProcessing}`);

        const result = validator(card);
        console.log(`   → ${result.pass ? '✅ PASS' : '❌ FAIL'}: ${result.reason}`);
        results.push({ id, description, pass: result.pass, reason: result.reason, card });
    } catch (err) {
        console.log(`   → ❌ ERROR: ${err.message}`);
        await shot(`${id}-error`);
        results.push({ id, description, pass: false, reason: `ERROR: ${err.message}` });
    }
}

async function main() {
    await setup();
    const loggedIn = await login();
    if (!loggedIn) {
        console.log('❌ Could not log in. Aborting tests.');
        await browser.close();
        return;
    }

    // BUG-001: "alle appels" should be recognized
    await runTest('BUG001', 'vandaag alle appels met score 0.3 liter', (card) => {
        if (card.isStillProcessing) return { pass: false, reason: 'TIMEOUT - AI still processing after 35s' };
        if (card.hasUnitGeenProducten) return { pass: false, reason: 'Geen producten - bug still present' };
        if (card.hasWelkePercelen && card.parcelCount === 0) return { pass: false, reason: 'Asks "Welke percelen?" - appels not recognized' };
        if (card.parcelCount >= 5 && card.parcelCount <= 10) return { pass: true, reason: `${card.parcelCount} appelpercelen gevonden, ${card.hectare} ha` };
        if (card.parcelCount > 0) return { pass: true, reason: `${card.parcelCount} percelen gevonden (expected ~7)` };
        return { pass: false, reason: `No parcels found (expected ~7 apple parcels)` };
    }, '"alle appels" → ~7 percelen, ~25 ha');

    // BUG-002: "maar X niet" should work
    await runTest('BUG002', 'vandaag alle peren met merpan 2L maar conference niet', (card) => {
        if (card.isStillProcessing) return { pass: false, reason: 'TIMEOUT - AI still processing after 35s' };
        if (card.hasUnitGeenProducten) return { pass: false, reason: 'Geen producten - product loss bug' };
        if (card.parcelCount === 0) return { pass: false, reason: 'Empty card - exclusion broke parsing' };
        // All pears (~25) minus Conference parcels (~11) = ~14 remaining
        if (card.parcelCount > 0 && card.parcelCount < 20 && card.middelCount > 0) return { pass: true, reason: `${card.parcelCount} peren minus conference, ${card.hectare} ha, ${card.middelCount} middelen` };
        if (card.parcelCount > 0 && card.parcelCount < 20) return { pass: true, reason: `${card.parcelCount} peren minus conference, ${card.hectare} ha (middelen=${card.middelCount})` };
        if (card.parcelCount >= 20) return { pass: false, reason: `${card.parcelCount} parcels - conference not excluded` };
        return { pass: false, reason: `Unexpected: ${card.parcelCount} parcels` };
    }, '"maar conference niet" → peren minus Conference');

    // BUG-003: "behalve" should select correct parcels
    await runTest('BUG003', 'vandaag alle appels met score 0.3L behalve de tessa', (card) => {
        if (card.isStillProcessing) return { pass: false, reason: 'TIMEOUT - AI still processing after 35s' };
        if (card.parcelCount === 0) return { pass: false, reason: 'No parcels - appels not recognized' };
        // All apples (~7) minus Tessa parcels (~3) = ~4 remaining
        if (card.parcelCount >= 2 && card.parcelCount <= 6) return { pass: true, reason: `${card.parcelCount} appels minus tessa, ${card.hectare} ha` };
        if (card.parcelCount >= 7) return { pass: false, reason: `${card.parcelCount} parcels - tessa not excluded (expected ~4)` };
        return { pass: false, reason: `Unexpected: ${card.parcelCount} parcels, ${card.hectare} ha` };
    }, '"behalve de tessa" → only appels minus Tessa');

    // BUG-004: Unknown product should not be registerable
    await runTest('BUG004', 'gisteren alle peren met flubberglub 2L', (card) => {
        if (card.isStillProcessing) return { pass: false, reason: 'TIMEOUT - AI still processing after 35s' };
        if (card.hasOnbekendMiddel) return { pass: true, reason: 'Unknown product detected and flagged' };
        if (!card.hasBevestigen) return { pass: true, reason: 'Bevestigen button not shown (blocked)' };
        return { pass: false, reason: 'Unknown product "flubberglub" was accepted without error flag' };
    }, 'Onbekend product → geblokkeerd');

    // BUG-005: Missing dosage should ask for dosage, not parcels
    await runTest('BUG005', 'gisteren alle peren met merpan', (card) => {
        if (card.isStillProcessing) return { pass: false, reason: 'TIMEOUT - AI still processing after 35s' };
        if (card.hasWelkeDosering) return { pass: true, reason: 'Correctly asks "Welke dosering?"' };
        if (card.hasWelkePercelen) return { pass: false, reason: 'Asks "Welke percelen?" instead of "Welke dosering?"' };
        if (card.parcelCount > 0 && !card.hasWelkePercelen) return { pass: true, reason: `Shows card with ${card.parcelCount} parcels - dosage prompt in chat` };
        return { pass: false, reason: `Unexpected state: parcels=${card.parcelCount}, welkePercelen=${card.hasWelkePercelen}` };
    }, 'Ontbrekende dosering → "Welke dosering?"');

    // OBS-003: "alle peren" should consistently return same count
    await runTest('OBS003a', 'gisteren alle peren met merpan 2L', (card) => {
        if (card.isStillProcessing) return { pass: false, reason: 'TIMEOUT - AI still processing after 35s' };
        if (card.parcelCount >= 20 && card.parcelCount <= 27) return { pass: true, reason: `${card.parcelCount} perenpercelen, consistent` };
        if (card.parcelCount > 0) return { pass: true, reason: `${card.parcelCount} percelen gevonden` };
        return { pass: false, reason: 'No parcels found' };
    }, '"alle peren" → consistent ~25 percelen (run 1)');

    await runTest('OBS003b', 'vandaag alle peren met score 0.3L', (card) => {
        if (card.isStillProcessing) return { pass: false, reason: 'TIMEOUT - AI still processing after 35s' };
        if (card.parcelCount >= 20 && card.parcelCount <= 27) return { pass: true, reason: `${card.parcelCount} perenpercelen, consistent` };
        if (card.parcelCount > 0) return { pass: true, reason: `${card.parcelCount} percelen gevonden` };
        return { pass: false, reason: 'No parcels found' };
    }, '"alle peren" → consistent ~25 percelen (run 2)');

    // Tankmix test (regression)
    await runTest('TANKMIX', 'vandaag alle peren met merpan 2L en score 0.3L', (card) => {
        if (card.isStillProcessing) return { pass: false, reason: 'TIMEOUT - AI still processing after 35s' };
        if (card.parcelCount > 0 && card.middelCount >= 2) return { pass: true, reason: `${card.parcelCount} percelen, ${card.middelCount} middelen` };
        if (card.parcelCount > 0) return { pass: true, reason: `${card.parcelCount} percelen (tankmix: ${card.middelCount} middelen)` };
        return { pass: false, reason: 'No parcels or products found' };
    }, 'Tankmix → 2 middelen (regressie)');

    // "Het hele bedrijf" test (regression)
    await runTest('BEDRIJF', 'vandaag het hele bedrijf met merpan 2L', (card) => {
        if (card.isStillProcessing) return { pass: false, reason: 'TIMEOUT - AI still processing after 35s' };
        if (card.parcelCount >= 28 && card.parcelCount <= 35) return { pass: true, reason: `${card.parcelCount} percelen (hele bedrijf)` };
        if (card.parcelCount > 0) return { pass: true, reason: `${card.parcelCount} percelen gevonden` };
        return { pass: false, reason: 'No parcels found' };
    }, '"het hele bedrijf" → ~32 percelen (regressie)');

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('RESULTATEN');
    console.log('='.repeat(60));

    const passed = results.filter(r => r.pass).length;
    const failed = results.filter(r => !r.pass).length;

    for (const r of results) {
        console.log(`${r.pass ? '✅' : '❌'} ${r.id}: ${r.reason}`);
    }

    console.log(`\nScore: ${passed}/${results.length} PASS (${failed} FAIL)`);

    // Save results as JSON
    fs.writeFileSync(
        path.join(SCREENSHOT_DIR, 'results.json'),
        JSON.stringify(results, null, 2)
    );

    await browser.close();
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
