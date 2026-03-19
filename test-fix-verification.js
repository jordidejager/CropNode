/**
 * FIX Verification Script
 * Tests the 3 fixes from the Slimme Invoer V2 afrondende fixes:
 * - FIX 1: Chat save writes to spuitschrift + parcel_history + inventory_movements
 * - FIX 2: Tankmix in one message (5 variants)
 * - FIX 3: Loading spinner on mobile "Alles Bevestigen" button
 * - TEST D: Regression checks
 */
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// ====== CONFIG ======
const BASE = 'http://localhost:3003';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots-e2e');
const SUPABASE_URL = 'https://djcsihpnidopxxuxumvj.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqY3NpaHBuaWRvcHh4dXh1bXZqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODM1OTcxNCwiZXhwIjoyMDgzOTM1NzE0fQ.VqnQH187m6qTD76gfJM9i0NxMq_n6EjD3Pnyhz02ocg';

const CONTEXT_TIMEOUT = 60;
const AI_TIMEOUT = 120;
const SAVE_TIMEOUT = 60;
const PAGE_LOAD = 45;

let page, browser;
const results = [];
const testEntryIds = []; // Track for cleanup

// ====== SUPABASE REST with retry ======
function supabaseQuery(table, params = '', retries = 3) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?${params}`;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const result = execSync(
                `curl -s -S --max-time 30 --retry 1 "${url}" -H "apikey: ${SUPABASE_SERVICE_KEY}" -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" -H "Accept: application/json"`,
                { encoding: 'utf-8', timeout: 40000 }
            );
            return JSON.parse(result);
        } catch (e) {
            if (attempt < retries) {
                console.log(`   ⏳ DB query retry ${attempt}/${retries}...`);
                execSync('sleep 3');
            } else {
                console.log(`   ❌ DB query failed after ${retries} attempts: ${e.message.substring(0, 80)}`);
                return null;
            }
        }
    }
}

function supabaseDelete(table, column, value) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?${column}=eq.${value}`;
    try {
        execSync(
            `curl -s -S --max-time 30 -X DELETE "${url}" -H "apikey: ${SUPABASE_SERVICE_KEY}" -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}"`,
            { encoding: 'utf-8', timeout: 40000 }
        );
    } catch (e) { /* ignore */ }
}

function logResult(id, pass, details) {
    const status = pass ? '✅' : '❌';
    console.log(`   → ${status} ${details}`);
    results.push({ id, pass, details });
}

// ====== HELPERS ======
async function login() {
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 60000 });

            // Wait for email input to appear
            await page.waitForSelector('input[name="username"]', { timeout: 30000 });
            await page.waitForTimeout(500);

            await page.fill('input[name="username"]', 'admin');
            await page.fill('input[name="password"]', 'admin123');
            await page.locator('button:has-text("Inloggen")').click();

            // Wait for redirect or error
            for (let i = 0; i < 20; i++) {
                await page.waitForTimeout(1000);
                const url = page.url();
                if (!url.includes('/login')) {
                    console.log(`Login: ✅ (attempt ${attempt})`);
                    return true;
                }
                // Check for "Failed to fetch" error - retry
                const text = await page.textContent('body').catch(() => '');
                if (text.includes('Failed to fetch') && i > 3) {
                    console.log(`   Retry: "Failed to fetch" error detected`);
                    // Re-click login
                    await page.locator('button:has-text("Inloggen")').click();
                }
            }
        } catch (e) {
            console.log(`   Login attempt ${attempt} failed: ${e.message.substring(0, 80)}`);
            if (attempt < 3) await page.waitForTimeout(5000);
        }
    }
    console.log('Login: ❌');
    return false;
}

async function navigateToSmartInput() {
    await page.goto(`${BASE}/command-center/smart-input-v2`, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for context to load (input field becomes enabled)
    for (let i = 0; i < CONTEXT_TIMEOUT; i++) {
        const hasInput = await page.locator('textarea, input[placeholder*="gespoten"]').count();
        if (hasInput > 0) {
            // Check if context loaded by looking for placeholder text
            const placeholder = await page.locator('textarea, input[placeholder*="gespoten"]').first().getAttribute('placeholder').catch(() => '');
            if (placeholder && placeholder.includes('gespoten')) {
                console.log(`   Context loaded in ${i}s`);
                return true;
            }
        }
        await page.waitForTimeout(1000);
    }
    console.log(`   ⚠️ Context may not be fully loaded`);
    return true; // Try anyway
}

async function sendMessage(text) {
    // Make textarea visible if hidden, then click to focus
    await page.evaluate(() => {
        const ta = document.querySelector('[data-testid="chat-input"]');
        if (ta) {
            ta.scrollIntoView();
            // Ensure it's visible
            ta.style.visibility = 'visible';
            ta.style.opacity = '1';
            ta.style.height = 'auto';
            ta.style.minHeight = '40px';
            ta.style.position = 'relative';
        }
    });
    await page.waitForTimeout(500);

    // Click to focus
    await page.locator('[data-testid="chat-input"]').click({ force: true, timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);

    // Type character by character (triggers React onChange)
    await page.keyboard.type(text, { delay: 10 });
    await page.waitForTimeout(300);

    // Press Enter to send
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
}

async function waitForCard(maxSec = AI_TIMEOUT) {
    for (let i = 0; i < maxSec; i++) {
        const pageText = await page.textContent('body').catch(() => '');
        const hasCard = /PERCELEN\s*\(\d+\)/i.test(pageText) || /MIDDELEN\s*\(\d+\)/i.test(pageText);
        const hasBevestigen = pageText.includes('Bevestigen') || pageText.includes('Bevestig');
        const isProcessing = pageText.includes('Analyseren') || pageText.includes('resolven') || pageText.includes('Valideren');

        if (hasCard || hasBevestigen) {
            // Extract counts
            const parcelMatch = pageText.match(/PERCELEN\s*\((\d+)\)/i);
            const productMatch = pageText.match(/MIDDELEN\s*\((\d+)\)/i);
            const parcels = parcelMatch ? parseInt(parcelMatch[1]) : 0;
            const products = productMatch ? parseInt(productMatch[1]) : 0;
            console.log(`   Card ready in ${i}s: ${parcels} percelen, ${products} middelen`);
            return { ready: true, parcels, products };
        }

        if (!isProcessing && i > 30) {
            // Not processing and waited 30s — give up
            break;
        }
        await page.waitForTimeout(1000);
    }
    return { ready: false, parcels: 0, products: 0 };
}

async function waitForSaveComplete(maxSec = SAVE_TIMEOUT) {
    let sawOpslaan = false;
    for (let i = 0; i < maxSec; i++) {
        const text = await page.textContent('body').catch(() => '');
        const hasBevestigd = text.includes('Bevestigd') || text.includes('bevestigd');
        const hasOpslaan = text.includes('Opslaan...') || text.includes('opslaan...');
        const hasFout = text.includes('Kon niet opslaan') || text.includes('Fout bij opslaan');

        if (hasOpslaan) sawOpslaan = true;
        if (hasBevestigd && (sawOpslaan || i > 5)) {
            console.log(`   Save completed in ${i}s`);
            return 'confirmed';
        }
        if (hasFout && (sawOpslaan || i > 5)) {
            console.log(`   Save FAILED at ${i}s`);
            return 'error';
        }
        await page.waitForTimeout(1000);
    }
    return 'timeout';
}

async function clickBevestigenButton() {
    // Try various button selectors for "Bevestigen" / "Alles Bevestigen"
    const selectors = [
        'button:has-text("Bevestigen")',
        'button:has-text("Alles Bevestigen")',
        'button:has-text("Bevestig")',
    ];
    for (const sel of selectors) {
        const btn = page.locator(sel).first();
        if (await btn.count() > 0 && await btn.isEnabled()) {
            await btn.click();
            return true;
        }
    }
    return false;
}

async function clearChat() {
    // Navigate fresh to clear state
    await page.goto(`${BASE}/command-center/smart-input-v2`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Check for "Nieuwe registratie" or clear button
    const newBtn = page.locator('button:has-text("Nieuw")').first();
    if (await newBtn.count() > 0) {
        await newBtn.click();
        await page.waitForTimeout(1000);
    }
}

// ====== TEST A: FIX 1 — Chat save writes to all 3 tables ======
async function testA() {
    console.log('\n============================================================');
    console.log('TEST A: FIX 1 — Chat save naar alle 3 tabellen');
    console.log('============================================================\n');

    // Step 1: Baseline counts
    console.log('[A1] Nulmeting...');
    const baseSpuitschrift = supabaseQuery('spuitschrift', 'select=id&order=created_at.desc&limit=1');
    const baseHistory = supabaseQuery('parcel_history', 'select=id&order=id.desc&limit=1');
    const baseInventory = supabaseQuery('inventory_movements', 'select=id&order=id.desc&limit=1');
    const spuitCount0 = supabaseQuery('spuitschrift', 'select=id', 3);
    const histCount0 = supabaseQuery('parcel_history', 'select=id', 3);
    const invCount0 = supabaseQuery('inventory_movements', 'select=id', 3);
    console.log(`   Baseline: spuitschrift=${spuitCount0?.length || '?'}, history=${histCount0?.length || '?'}, inventory=${invCount0?.length || '?'}`);

    // Step 2: Create registration via chat
    console.log('\n[A2] Registratie via chat...');
    await navigateToSmartInput();
    await sendMessage('vandaag alle conference met merpan 0.7 kg');

    const card = await waitForCard();
    if (!card.ready) {
        logResult('A-CHAT-SPUITSCHRIFT', false, 'Card not ready - AI timeout');
        logResult('A-CHAT-HISTORY', false, 'Skipped (no card)');
        logResult('A-CHAT-INVENTORY', false, 'Skipped (no card)');
        return;
    }

    // Send "klopt, opslaan" via chat
    console.log('\n[A3] Chat save: "klopt, opslaan"...');
    await sendMessage('klopt, opslaan');

    // Wait for agent response (longer timeout for chat save)
    let chatSaveSuccess = false;
    for (let i = 0; i < 90; i++) {
        const text = await page.textContent('body').catch(() => '');
        if (text.includes('opgeslagen') || text.includes('Opgeslagen') || text.includes('bevestigd') || text.includes('Bevestigd')) {
            console.log(`   Agent confirmed save after ${i}s`);
            chatSaveSuccess = true;
            break;
        }
        await page.waitForTimeout(1000);
    }

    if (!chatSaveSuccess) {
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'A-chat-save-timeout.png') });
        console.log('   ⚠️ No explicit save confirmation, checking DB anyway...');
    }

    await page.waitForTimeout(3000); // Let DB writes complete

    // Step 3: Check all 3 tables
    console.log('\n[A4] Checking 3 tables...');
    const spuitCount1 = supabaseQuery('spuitschrift', 'select=id', 3);
    const histCount1 = supabaseQuery('parcel_history', 'select=id', 3);
    const invCount1 = supabaseQuery('inventory_movements', 'select=id', 3);

    const newSpuit = (spuitCount1?.length || 0) - (spuitCount0?.length || 0);
    const newHist = (histCount1?.length || 0) - (histCount0?.length || 0);
    const newInv = (invCount1?.length || 0) - (invCount0?.length || 0);

    console.log(`   After chat save: spuitschrift +${newSpuit}, history +${newHist}, inventory +${newInv}`);

    // Get the newest spuitschrift entry
    const latestSpuit = supabaseQuery('spuitschrift', 'select=*&order=created_at.desc&limit=1');
    if (latestSpuit && latestSpuit.length > 0) {
        const entry = latestSpuit[0];
        testEntryIds.push(entry.id);
        console.log(`   Latest entry: id=${entry.id?.substring(0, 8)}, products=${JSON.stringify(entry.products)?.substring(0, 80)}`);

        // Check parcel_history for this specific spuitschrift_id
        const histForEntry = supabaseQuery('parcel_history', `select=*&spuitschrift_id=eq.${entry.id}`);
        const invForEntry = supabaseQuery('inventory_movements', `select=*&reference_id=eq.${entry.id}`);

        logResult('A-CHAT-SPUITSCHRIFT', newSpuit > 0, `spuitschrift: +${newSpuit} records`);
        logResult('A-CHAT-HISTORY', (histForEntry?.length || 0) > 0, `parcel_history: ${histForEntry?.length || 0} entries for spuitschrift_id=${entry.id?.substring(0, 8)}`);
        logResult('A-CHAT-INVENTORY', (invForEntry?.length || 0) > 0, `inventory_movements: ${invForEntry?.length || 0} entries for reference_id=${entry.id?.substring(0, 8)}`);
    } else {
        logResult('A-CHAT-SPUITSCHRIFT', false, 'No spuitschrift entry found');
        logResult('A-CHAT-HISTORY', false, 'Skipped');
        logResult('A-CHAT-INVENTORY', false, 'Skipped');
    }

    // Step 4: Compare with button save
    console.log('\n[A5] Knop-save vergelijking...');
    await clearChat();
    await page.waitForTimeout(3000);
    await navigateToSmartInput();
    await sendMessage('vandaag alle conference met score 0.2L');

    const card2 = await waitForCard();
    if (!card2.ready) {
        logResult('A-KNOP-SPUITSCHRIFT', false, 'Card not ready for button test');
        logResult('A-KNOP-HISTORY', false, 'Skipped');
        logResult('A-KNOP-INVENTORY', false, 'Skipped');
        logResult('A-PARITEIT', false, 'Cannot compare');
        return;
    }

    const clicked = await clickBevestigenButton();
    if (!clicked) {
        logResult('A-KNOP-SPUITSCHRIFT', false, 'Could not click Bevestigen');
        return;
    }

    const saveResult = await waitForSaveComplete();
    if (saveResult !== 'confirmed') {
        logResult('A-KNOP-SPUITSCHRIFT', false, `Save: ${saveResult}`);
        return;
    }

    await page.waitForTimeout(3000);

    // Check button save in all 3 tables
    const latestSpuit2 = supabaseQuery('spuitschrift', 'select=*&order=created_at.desc&limit=1');
    if (latestSpuit2 && latestSpuit2.length > 0) {
        const entry2 = latestSpuit2[0];
        testEntryIds.push(entry2.id);
        const hist2 = supabaseQuery('parcel_history', `select=*&spuitschrift_id=eq.${entry2.id}`);
        const inv2 = supabaseQuery('inventory_movements', `select=*&reference_id=eq.${entry2.id}`);

        logResult('A-KNOP-SPUITSCHRIFT', true, `spuitschrift: id=${entry2.id?.substring(0, 8)}`);
        logResult('A-KNOP-HISTORY', (hist2?.length || 0) > 0, `parcel_history: ${hist2?.length || 0} entries`);
        logResult('A-KNOP-INVENTORY', (inv2?.length || 0) > 0, `inventory_movements: ${inv2?.length || 0} entries`);

        // Compare parity
        const chatHist = results.find(r => r.id === 'A-CHAT-HISTORY')?.pass;
        const chatInv = results.find(r => r.id === 'A-CHAT-INVENTORY')?.pass;
        const knopHist = (hist2?.length || 0) > 0;
        const knopInv = (inv2?.length || 0) > 0;
        const parity = chatHist === knopHist && chatInv === knopInv;
        logResult('A-PARITEIT', parity, `Chat: hist=${chatHist}, inv=${chatInv} | Knop: hist=${knopHist}, inv=${knopInv}`);
    }
}

// ====== TEST B: FIX 2 — Tankmix in one message ======
async function testB() {
    console.log('\n============================================================');
    console.log('TEST B: FIX 2 — Tankmix in één bericht');
    console.log('============================================================\n');

    const variants = [
        { input: 'vandaag alle conference met merpan 0.7 kg en score 0.2L', expected: 2, label: 'en-separator' },
        { input: 'vandaag alle peren met merpan 0.7 kg, score 0.2L', expected: 2, label: 'komma-separator' },
        { input: 'vandaag alle conference met merpan 0.7 + score 0.2', expected: 2, label: 'plus-separator' },
        { input: 'vandaag alle peren met merpan 0.7, score 0.2 en delan 0.5', expected: 3, label: 'drie-producten' },
        { input: 'tankmix merpan 0.7 en score 0.2 op alle conference', expected: 2, label: 'tankmix-keyword' },
    ];

    let tankmixSaveId = null;

    for (let i = 0; i < variants.length; i++) {
        const v = variants[i];
        console.log(`\n[B${i + 1}] Variant: ${v.label}`);
        console.log(`   Input: "${v.input}"`);

        await clearChat();
        await page.waitForTimeout(2000);
        await navigateToSmartInput();
        await sendMessage(v.input);

        const card = await waitForCard();
        if (!card.ready) {
            logResult(`B-${i + 1}`, false, `${v.label}: Card not ready`);
            continue;
        }

        const productsOk = card.products >= v.expected;
        logResult(`B-${i + 1}`, productsOk, `${v.label}: ${card.products}/${v.expected} middelen, ${card.parcels} percelen`);

        // Save the first successful tankmix for spuitschrift verification
        if (productsOk && !tankmixSaveId && card.products >= 2) {
            console.log(`   Saving this tankmix for spuitschrift check...`);
            const clicked = await clickBevestigenButton();
            if (clicked) {
                const sr = await waitForSaveComplete();
                if (sr === 'confirmed') {
                    const latest = supabaseQuery('spuitschrift', 'select=*&order=created_at.desc&limit=1');
                    if (latest && latest.length > 0) {
                        tankmixSaveId = latest[0].id;
                        testEntryIds.push(tankmixSaveId);
                        const prods = latest[0].products;
                        console.log(`   Saved: ${prods?.length} products in spuitschrift`);
                        logResult('B-SAVE', (prods?.length || 0) >= 2, `Tankmix saved: ${prods?.length} products in DB`);
                    }
                }
            }
        }
    }

    if (!tankmixSaveId) {
        logResult('B-SAVE', false, 'No tankmix could be saved');
    }

    // Check spuitschrift UI for tankmix
    if (tankmixSaveId) {
        console.log('\n[B-UI] Checking tankmix in spuitschrift...');
        await page.goto(`${BASE}/crop-care/logs`, { waitUntil: 'domcontentloaded', timeout: 30000 });

        for (let i = 0; i < PAGE_LOAD; i++) {
            const text = await page.textContent('body').catch(() => '');
            if (text.includes('Merpan') && text.includes('Score')) {
                logResult('B-UI', true, 'Both Merpan and Score visible in spuitschrift');
                break;
            }
            if (i === PAGE_LOAD - 1) {
                const hasMerpan = text.includes('Merpan');
                const hasScore = text.includes('Score');
                logResult('B-UI', hasMerpan && hasScore, `Merpan=${hasMerpan}, Score=${hasScore}`);
            }
            await page.waitForTimeout(1000);
        }
    }
}

// ====== TEST C: FIX 3 — Loading spinner ======
async function testC() {
    console.log('\n============================================================');
    console.log('TEST C: FIX 3 — Loading spinner bij opslaan');
    console.log('============================================================\n');

    await clearChat();
    await page.waitForTimeout(2000);
    await navigateToSmartInput();
    await sendMessage('vandaag alle conference met merpan 0.7 kg');

    const card = await waitForCard();
    if (!card.ready) {
        logResult('C-SPINNER', false, 'Card not ready');
        return;
    }

    // Click Bevestigen and immediately check for spinner
    const btn = page.locator('button:has-text("Bevestigen")').first();
    if (await btn.count() === 0) {
        logResult('C-SPINNER', false, 'No Bevestigen button');
        return;
    }

    await btn.click();
    await page.waitForTimeout(500); // Small delay for state update

    // Check for loading indicators
    const text = await page.textContent('body').catch(() => '');
    const hasSpinner = text.includes('Opslaan...') || text.includes('opslaan...');
    const hasDisabled = await btn.isDisabled().catch(() => false);

    // Take screenshot of loading state
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'C-loading-state.png') });

    // Also check for Loader2 SVG (animated spinner)
    const hasAnimatedSpinner = await page.locator('.animate-spin').count() > 0;

    console.log(`   Spinner text: ${hasSpinner}, Button disabled: ${hasDisabled}, Animated: ${hasAnimatedSpinner}`);

    logResult('C-SPINNER', hasSpinner || hasAnimatedSpinner, `Loading feedback: text="${hasSpinner}", animated=${hasAnimatedSpinner}, disabled=${hasDisabled}`);

    // Wait for save to complete
    const sr = await waitForSaveComplete();
    if (sr === 'confirmed') {
        const latest = supabaseQuery('spuitschrift', 'select=id&order=created_at.desc&limit=1');
        if (latest && latest.length > 0) testEntryIds.push(latest[0].id);
    }

    logResult('C-COMPLETE', sr === 'confirmed', `Save completed: ${sr}`);
}

// ====== TEST D: Regression checks ======
async function testD() {
    console.log('\n============================================================');
    console.log('TEST D: Regressie checks');
    console.log('============================================================\n');

    const checks = [
        {
            id: 'D1',
            input: 'vandaag alle appels met score 0.3L',
            validate: (card) => card.parcels >= 8, // At least 8 apple parcels
            desc: 'Alle appels → ≥8 percelen'
        },
        {
            id: 'D2',
            input: 'vandaag alle peren met merpan 0.7 kg maar conference niet',
            validate: (card) => card.parcels > 0 && card.parcels < 15,
            desc: 'Peren minus conference → subset'
        },
        {
            id: 'D3',
            input: 'vandaag het hele bedrijf met merpan 0.7 kg',
            validate: (card) => card.parcels >= 20, // All parcels
            desc: 'Hele bedrijf → ≥20 percelen'
        },
        {
            id: 'D4',
            input: 'gisteren alle peren met flubberglub 2L',
            validate: (card, text) => text.includes('nbekend') || text.includes('niet gevonden') || card.products === 0,
            desc: 'Onbekend product → geblokkeerd'
        },
    ];

    for (const check of checks) {
        console.log(`\n[${check.id}] ${check.desc}`);

        await clearChat();
        await page.waitForTimeout(2000);
        await navigateToSmartInput();
        await sendMessage(check.input);

        const card = await waitForCard(90);
        const text = await page.textContent('body').catch(() => '');

        if (!card.ready && check.id !== 'D4') {
            logResult(check.id, false, 'Card not ready');
            continue;
        }

        // D4 might not show a card (blocked product) — check for error message
        if (check.id === 'D4' && !card.ready) {
            const hasError = text.includes('nbekend') || text.includes('niet gevonden') || text.includes('Onbekend');
            logResult(check.id, hasError, `Unknown product: error shown=${hasError}`);
            continue;
        }

        const pass = check.validate(card, text);
        logResult(check.id, pass, `${check.desc}: parcels=${card.parcels}, products=${card.products}`);
    }

    // D5: Check spuitschrift shows entries
    console.log('\n[D5] Spuitschrift zichtbaarheid...');
    await page.goto(`${BASE}/crop-care/logs`, { waitUntil: 'domcontentloaded', timeout: 30000 });

    for (let i = 0; i < PAGE_LOAD; i++) {
        const text = await page.textContent('body').catch(() => '');
        // Look for actual data (not skeleton)
        if (text.includes('Merpan') || text.includes('Score') || text.includes('Akkoord')) {
            logResult('D5', true, 'Spuitschrift entries visible');
            break;
        }
        if (i === PAGE_LOAD - 1) {
            logResult('D5', false, 'Spuitschrift entries not visible');
        }
        await page.waitForTimeout(1000);
    }
}

// ====== MAIN ======
async function main() {
    console.log('🧪 Fix Verification: Slimme Invoer V2');
    console.log('============================================================');
    console.log(`Date: ${new Date().toLocaleString('nl-NL')}`);
    console.log('============================================================');

    // Ensure screenshot dir
    if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

    // Launch browser
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    page = await context.newPage();

    // Check Supabase
    const dbCheck = supabaseQuery('spuitschrift', 'select=id&limit=1');
    console.log(`Supabase REST: ${dbCheck ? '✅' : '❌'}`);

    // Login
    const loggedIn = await login();
    if (!loggedIn) {
        console.log('❌ Cannot proceed without login');
        await browser.close();
        return;
    }

    // Run tests
    try {
        await testA();
    } catch (e) {
        console.log(`\n❌ TEST A crashed: ${e.message}`);
        logResult('A-CRASH', false, e.message.substring(0, 80));
    }

    try {
        await testB();
    } catch (e) {
        console.log(`\n❌ TEST B crashed: ${e.message}`);
        logResult('B-CRASH', false, e.message.substring(0, 80));
    }

    try {
        await testC();
    } catch (e) {
        console.log(`\n❌ TEST C crashed: ${e.message}`);
        logResult('C-CRASH', false, e.message.substring(0, 80));
    }

    try {
        await testD();
    } catch (e) {
        console.log(`\n❌ TEST D crashed: ${e.message}`);
        logResult('D-CRASH', false, e.message.substring(0, 80));
    }

    // Results
    console.log('\n============================================================');
    console.log('RESULTATEN');
    console.log('============================================================');

    const passed = results.filter(r => r.pass).length;
    const total = results.length;

    for (const r of results) {
        console.log(`${r.pass ? '✅' : '❌'} ${r.id}: ${r.details}`);
    }

    console.log(`\nScore: ${passed}/${total} PASS`);
    console.log('============================================================');

    // Save results
    fs.writeFileSync(
        path.join(SCREENSHOT_DIR, 'fix-verification-results.json'),
        JSON.stringify(results, null, 2)
    );

    // Cleanup test entries
    if (testEntryIds.length > 0) {
        console.log(`\n[Cleanup] Removing ${testEntryIds.length} test records...`);
        for (const id of testEntryIds) {
            supabaseDelete('parcel_history', 'spuitschrift_id', id);
            supabaseDelete('inventory_movements', 'reference_id', id);
            supabaseDelete('spuitschrift', 'id', id);
        }
        console.log('   Cleanup complete');
    }

    await browser.close();
}

main().catch(e => {
    console.error('Fatal:', e);
    process.exit(1);
});
