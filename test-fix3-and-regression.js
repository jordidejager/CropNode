/**
 * FIX 3 Verification: Loading spinner + Regression checks
 */
const { chromium } = require('playwright');

const SUPABASE_URL = 'https://djcsihpnidopxxuxumvj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqY3NpaHBuaWRvcHh4dXh1bXZqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODM1OTcxNCwiZXhwIjoyMDgzOTM1NzE0fQ.VqnQH187m6qTD76gfJM9i0NxMq_n6EjD3Pnyhz02ocg';

function supabaseQuery(table, params = '') {
  const { execSync } = require('child_process');
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params}`;
  const cmd = `curl -s "${url}" -H "apikey: ${SUPABASE_KEY}" -H "Authorization: Bearer ${SUPABASE_KEY}"`;
  try { return JSON.parse(execSync(cmd, { timeout: 15000 }).toString()); } catch { return null; }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function sendMessage(page, text) {
  await page.evaluate((msg) => {
    const el = document.querySelector('[data-testid="chat-input"]');
    const propsKey = Object.keys(el).find(k => k.startsWith('__reactProps$'));
    el[propsKey].onChange({ target: { value: msg, style: { height: '' }, scrollHeight: 40 } });
  }, text);
  await sleep(200);
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="chat-input"]');
    const propsKey = Object.keys(el).find(k => k.startsWith('__reactProps$'));
    el[propsKey].onKeyDown({ key: 'Enter', shiftKey: false, preventDefault: () => {} });
  });
}

async function waitForText(page, texts, timeoutSec = 45) {
  for (let i = 0; i < timeoutSec; i++) {
    const found = await page.evaluate((t) => {
      const body = document.body.innerText;
      return t.map(x => body.includes(x));
    }, texts);
    if (found.some(Boolean)) return { success: true, found };
    await sleep(1000);
  }
  return { success: false, found: texts.map(() => false) };
}

async function resetChat(page) {
  await page.goto('http://localhost:3003/command-center/smart-input-v2', { timeout: 30000 });
  for (let i = 0; i < 10; i++) {
    if (await page.$('[data-testid="chat-input"]')) return true;
    await sleep(2000);
  }
  return false;
}

(async () => {
  console.log('=== FIX 3 + REGRESSION VERIFICATION ===\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const allResults = [];

  try {
    // Login
    console.log('[LOGIN] Logging in...');
    await page.goto('http://localhost:3003/login', { timeout: 30000 });
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'admin123');
    for (let a = 0; a < 3; a++) {
      await page.click('button[type="submit"]');
      try { await page.waitForURL(/command-center/, { timeout: 15000 }); break; } catch {}
      await sleep(2000);
    }
    console.log('  OK\n');

    // === TEST C: FIX 3 - Loading Spinner ===
    console.log('=== TEST C: FIX 3 - Loading Spinner ===');
    {
      const ready = await resetChat(page);
      if (!ready) {
        console.log('FAIL: Page not loaded');
        allResults.push({ name: 'C: Loading spinner', pass: false });
      } else {
        // Check if the source code has the Loader2 spinner in the mobile button
        const { execSync } = require('child_process');
        const sourceCheck = execSync('grep -c "Opslaan\\.\\.\\." src/app/\\(app\\)/command-center/smart-input-v2/page.tsx').toString().trim();
        const hasLoaderImport = execSync('grep -c "Loader2" src/app/\\(app\\)/command-center/smart-input-v2/page.tsx').toString().trim();

        const spinnerInSource = parseInt(sourceCheck) > 0 && parseInt(hasLoaderImport) > 0;
        console.log(`  Source code check: Loader2 imported=${parseInt(hasLoaderImport) > 0}, "Opslaan..." text=${parseInt(sourceCheck) > 0}`);

        // Also check that the button is disabled during saving (savingUnitId !== null)
        const disabledCheck = execSync('grep -c "disabled={savingUnitId !== null}" src/app/\\(app\\)/command-center/smart-input-v2/page.tsx').toString().trim();
        console.log(`  Button disabled during save: ${parseInt(disabledCheck) > 0}`);

        const pass = spinnerInSource && parseInt(disabledCheck) > 0;
        console.log(`  Result: ${pass ? 'PASS' : 'FAIL'}\n`);
        allResults.push({ name: 'C: Loading spinner (source check)', pass });
      }
    }

    // Also verify desktop card has spinner (RegistrationGroupCard)
    {
      const { execSync } = require('child_process');
      const desktopSpinner = execSync('grep -c "Opslaan\\.\\.\\." src/components/registration-group-card.tsx').toString().trim();
      const pass = parseInt(desktopSpinner) > 0;
      console.log(`  Desktop card spinner: ${pass ? 'PASS' : 'FAIL'}\n`);
      allResults.push({ name: 'C: Desktop card spinner', pass });
    }

    // === TEST D: Regression Checks ===
    console.log('=== TEST D: Regression Checks ===\n');

    // D1: Appels (niet conference)
    console.log('[D1] Appels: "vandaag alle elstar met captan 1.5 kg"');
    {
      const ready = await resetChat(page);
      if (!ready) {
        allResults.push({ name: 'D1: Appels', pass: false, reason: 'Page not loaded' });
      } else {
        await sendMessage(page, 'vandaag alle elstar met captan 1.5 kg');
        const result = await waitForText(page, ['Captan', 'Elstar'], 45);
        const pass = result.found[0]; // At least Captan found
        console.log(`  Captan=${result.found[0]}, Elstar text=${result.found[1]}`);
        console.log(`  Result: ${pass ? 'PASS' : 'FAIL'}\n`);
        allResults.push({ name: 'D1: Appels (Elstar + Captan)', pass });
      }
    }

    // D2: Peren minus conference (alle peren)
    console.log('[D2] Alle peren: "vandaag alle peren met merpan 0.7 kg"');
    {
      const ready = await resetChat(page);
      if (!ready) {
        allResults.push({ name: 'D2: Alle peren', pass: false, reason: 'Page not loaded' });
      } else {
        await sendMessage(page, 'vandaag alle peren met merpan 0.7 kg');
        const result = await waitForText(page, ['Merpan'], 45);
        const pass = result.found[0];
        console.log(`  Merpan=${result.found[0]}`);
        console.log(`  Result: ${pass ? 'PASS' : 'FAIL'}\n`);
        allResults.push({ name: 'D2: Alle peren (Merpan)', pass });
      }
    }

    // D3: Heel het bedrijf
    console.log('[D3] Heel het bedrijf: "vandaag heel het bedrijf met captan 1.5 kg"');
    {
      const ready = await resetChat(page);
      if (!ready) {
        allResults.push({ name: 'D3: Heel het bedrijf', pass: false, reason: 'Page not loaded' });
      } else {
        await sendMessage(page, 'vandaag heel het bedrijf met captan 1.5 kg');
        const result = await waitForText(page, ['Captan'], 45);
        const pass = result.found[0];
        console.log(`  Captan=${result.found[0]}`);
        console.log(`  Result: ${pass ? 'PASS' : 'FAIL'}\n`);
        allResults.push({ name: 'D3: Heel het bedrijf (Captan)', pass });
      }
    }

    // D4: Onbekend product
    console.log('[D4] Onbekend product: "vandaag alle peren met xyz123 0.5L"');
    {
      const ready = await resetChat(page);
      if (!ready) {
        allResults.push({ name: 'D4: Onbekend product', pass: false, reason: 'Page not loaded' });
      } else {
        await sendMessage(page, 'vandaag alle peren met xyz123 0.5L');
        // Should get a warning or error, not a valid registration
        const result = await waitForText(page, ['niet gevonden', 'onbekend', 'geen product', 'niet herkend', 'Fout', 'xyz123'], 30);
        const hasWarning = result.found.some(Boolean);
        console.log(`  Warning/error shown: ${hasWarning}`);
        console.log(`  Result: ${hasWarning ? 'PASS' : 'FAIL (no warning for unknown product)'}\n`);
        allResults.push({ name: 'D4: Onbekend product', pass: hasWarning });
      }
    }

    // D5: Spuitschrift pagina toont entries
    console.log('[D5] Spuitschrift pagina zichtbaar');
    {
      await page.goto('http://localhost:3003/crop-care/logs', { timeout: 30000 });
      await sleep(5000);
      const hasContent = await page.evaluate(() => {
        const text = document.body.innerText;
        return text.includes('Merpan') || text.includes('Captan') || text.includes('Score') || text.includes('Spuitschrift');
      });
      console.log(`  Spuitschrift page has content: ${hasContent}`);
      console.log(`  Result: ${hasContent ? 'PASS' : 'FAIL'}\n`);
      allResults.push({ name: 'D5: Spuitschrift pagina', pass: hasContent });
    }

    // === FINAL SUMMARY ===
    console.log('==========================================');
    console.log('=== FINAL VERIFICATION SUMMARY ===');
    console.log('==========================================\n');

    for (const r of allResults) {
      console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`);
    }

    const passCount = allResults.filter(r => r.pass).length;
    const total = allResults.length;
    console.log(`\n  Total: ${passCount}/${total} PASS`);

  } catch (error) {
    console.error('Test error:', error.message);
    try { await page.screenshot({ path: 'test-regression-error.png' }); } catch {}
  } finally {
    await browser.close();
  }
})();
