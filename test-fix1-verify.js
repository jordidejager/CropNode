/**
 * FIX 1 Verification: Chat save path should write to all 3 tables
 * Uses Playwright for browser interaction + curl for DB verification
 */
const { chromium } = require('playwright');

const SUPABASE_URL = 'https://djcsihpnidopxxuxumvj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqY3NpaHBuaWRvcHh4dXh1bXZqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODM1OTcxNCwiZXhwIjoyMDgzOTM1NzE0fQ.VqnQH187m6qTD76gfJM9i0NxMq_n6EjD3Pnyhz02ocg';

async function supabaseQuery(table, params = '') {
  const { execSync } = require('child_process');
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params}`;
  const cmd = `curl -s "${url}" -H "apikey: ${SUPABASE_KEY}" -H "Authorization: Bearer ${SUPABASE_KEY}"`;
  try {
    const result = execSync(cmd, { timeout: 15000 }).toString();
    return JSON.parse(result);
  } catch (e) {
    console.error(`DB query failed for ${table}:`, e.message);
    return null;
  }
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  console.log('=== FIX 1 VERIFICATION: Chat Save → 3 Tables ===\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  try {
    // Step 1: Login
    console.log('[1/5] Logging in...');
    await page.goto('http://localhost:3003/login', { timeout: 30000 });
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'admin123');

    let loginSuccess = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.click('button[type="submit"]');
      try {
        await page.waitForURL(/command-center/, { timeout: 15000 });
        loginSuccess = true;
        break;
      } catch {
        console.log(`  Login attempt ${attempt + 1} failed, retrying...`);
        await sleep(2000);
      }
    }
    if (!loginSuccess) {
      console.log('FAIL: Could not login');
      await browser.close();
      process.exit(1);
    }
    console.log('  Login OK');

    // Step 2: Navigate to Smart Input V2
    console.log('[2/5] Navigating to Smart Input V2...');
    await page.goto('http://localhost:3003/command-center/smart-input-v2', { timeout: 30000 });

    // Wait for page to load - check for chat input
    let inputReady = false;
    for (let i = 0; i < 10; i++) {
      const input = await page.$('[data-testid="chat-input"]');
      if (input) { inputReady = true; break; }
      await sleep(2000);
    }

    if (!inputReady) {
      console.log('FAIL: Chat input not found');
      await browser.close();
      process.exit(1);
    }
    console.log('  Smart Input V2 loaded');

    // Step 3: Send registration message
    console.log('[3/5] Sending: "vandaag alle conference met merpan 0.7 kg"...');

    // Use React props approach to set value and send
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="chat-input"]');
      const propsKey = Object.keys(el).find(k => k.startsWith('__reactProps$'));
      const props = el[propsKey];
      const fakeTarget = { value: 'vandaag alle conference met merpan 0.7 kg', style: { height: '' }, scrollHeight: 40 };
      props.onChange({ target: fakeTarget });
    });
    await sleep(200);
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="chat-input"]');
      const propsKey = Object.keys(el).find(k => k.startsWith('__reactProps$'));
      const props = el[propsKey];
      props.onKeyDown({ key: 'Enter', shiftKey: false, preventDefault: () => {} });
    });

    // Wait for registration card to appear (up to 45s)
    console.log('  Waiting for AI response (up to 45s)...');
    let cardReady = false;
    for (let i = 0; i < 45; i++) {
      const hasCard = await page.evaluate(() => {
        const text = document.body.innerText;
        return text.includes('Concept') || text.includes('Merpan') || text.includes('Registratie');
      });
      if (hasCard) {
        const hasMerpan = await page.evaluate(() => document.body.innerText.includes('Merpan'));
        if (hasMerpan) { cardReady = true; break; }
      }
      await sleep(1000);
    }

    if (!cardReady) {
      console.log('FAIL: Registration card not ready after 45s');
      await page.screenshot({ path: 'test-fix1-fail-card.png' });
      await browser.close();
      process.exit(1);
    }
    console.log('  Registration card appeared with Merpan');

    // Step 4: Send "klopt, opslaan" via chat
    console.log('[4/5] Sending: "klopt, opslaan" (chat save path)...');

    // Record timestamp before save
    const beforeSave = new Date().toISOString();

    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="chat-input"]');
      const propsKey = Object.keys(el).find(k => k.startsWith('__reactProps$'));
      const props = el[propsKey];
      const fakeTarget = { value: 'klopt, opslaan', style: { height: '' }, scrollHeight: 40 };
      props.onChange({ target: fakeTarget });
    });
    await sleep(200);
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="chat-input"]');
      const propsKey = Object.keys(el).find(k => k.startsWith('__reactProps$'));
      const props = el[propsKey];
      props.onKeyDown({ key: 'Enter', shiftKey: false, preventDefault: () => {} });
    });

    // Wait for save confirmation
    let saveConfirmed = false;
    for (let i = 0; i < 60; i++) {
      const status = await page.evaluate(() => {
        const text = document.body.innerText;
        return {
          hasOpgeslagen: text.includes('Opgeslagen') || text.includes('opgeslagen'),
          hasBevestigd: text.includes('Bevestigd'),
        };
      });
      if (status.hasOpgeslagen || status.hasBevestigd) {
        saveConfirmed = true;
        break;
      }
      await sleep(1000);
    }

    if (!saveConfirmed) {
      console.log('FAIL: Save not confirmed after 60s');
      await page.screenshot({ path: 'test-fix1-fail-save.png' });
      await browser.close();
      process.exit(1);
    }
    console.log('  Save confirmed via chat');

    // Wait a bit for DB writes to complete
    await sleep(3000);

    // Step 5: Verify database - all 3 tables
    console.log('[5/5] Verifying database (3 tables)...');

    // Find the most recent spuitschrift entry
    const spuitschriftEntries = await supabaseQuery('spuitschrift', 'order=created_at.desc&limit=1&select=id,products,status,original_raw_input,created_at');

    if (!spuitschriftEntries || spuitschriftEntries.length === 0) {
      console.log('FAIL: No spuitschrift entry found');
      await browser.close();
      process.exit(1);
    }

    const entry = spuitschriftEntries[0];
    const entryId = entry.id;
    const hasMerpan = entry.products?.some(p => p.product?.includes('Merpan'));

    console.log(`  SPUITSCHRIFT: id=${entryId.substring(0,8)}..., Merpan=${hasMerpan}, status=${entry.status}`);

    if (!hasMerpan) {
      console.log('FAIL: Spuitschrift entry does not contain Merpan');
      await browser.close();
      process.exit(1);
    }

    // Check parcel_history
    const parcelHistory = await supabaseQuery('parcel_history', `spuitschrift_id=eq.${entryId}&select=id,parcel_name,product,dosage,unit`);

    const phCount = parcelHistory?.length || 0;
    console.log(`  PARCEL_HISTORY: ${phCount} entries for spuitschrift_id=${entryId.substring(0,8)}...`);

    if (phCount > 0) {
      console.log(`    Sample: ${parcelHistory[0].parcel_name} - ${parcelHistory[0].product} ${parcelHistory[0].dosage} ${parcelHistory[0].unit}`);
    }

    // Check inventory_movements
    const inventoryMovements = await supabaseQuery('inventory_movements', `reference_id=eq.${entryId}&select=id,product_name,quantity,unit,type`);

    const imCount = inventoryMovements?.length || 0;
    console.log(`  INVENTORY_MOVEMENTS: ${imCount} entries for reference_id=${entryId.substring(0,8)}...`);

    if (imCount > 0) {
      console.log(`    Sample: ${inventoryMovements[0].product_name} qty=${inventoryMovements[0].quantity} ${inventoryMovements[0].unit}`);
    }

    // Final verdict
    console.log('\n=== RESULTS ===');
    console.log(`  Spuitschrift:        ${hasMerpan ? 'PASS' : 'FAIL'}`);
    console.log(`  Parcel History:      ${phCount > 0 ? `PASS (${phCount} entries)` : 'FAIL (0 entries)'}`);
    console.log(`  Inventory Movements: ${imCount > 0 ? `PASS (${imCount} entries)` : 'FAIL (0 entries)'}`);

    const allPass = hasMerpan && phCount > 0 && imCount > 0;
    console.log(`\n  FIX 1 VERDICT: ${allPass ? 'PASS - All 3 tables written' : 'FAIL - Missing table writes'}`);

    await page.screenshot({ path: 'test-fix1-result.png' });
  } catch (error) {
    console.error('Test error:', error.message);
    try { await page.screenshot({ path: 'test-fix1-error.png' }); } catch {}
  } finally {
    await browser.close();
  }
})();
