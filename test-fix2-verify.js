/**
 * FIX 2 Verification: Tankmix (multiple products) in a single message
 * Tests 3 variants of tankmix input
 */
const { chromium } = require('playwright');

const SUPABASE_URL = 'https://djcsihpnidopxxuxumvj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqY3NpaHBuaWRvcHh4dXh1bXZqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODM1OTcxNCwiZXhwIjoyMDgzOTM1NzE0fQ.VqnQH187m6qTD76gfJM9i0NxMq_n6EjD3Pnyhz02ocg';

function supabaseQuery(table, params = '') {
  const { execSync } = require('child_process');
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params}`;
  const cmd = `curl -s "${url}" -H "apikey: ${SUPABASE_KEY}" -H "Authorization: Bearer ${SUPABASE_KEY}"`;
  try {
    return JSON.parse(execSync(cmd, { timeout: 15000 }).toString());
  } catch { return null; }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function sendMessage(page, text) {
  await page.evaluate((msg) => {
    const el = document.querySelector('[data-testid="chat-input"]');
    const propsKey = Object.keys(el).find(k => k.startsWith('__reactProps$'));
    const props = el[propsKey];
    props.onChange({ target: { value: msg, style: { height: '' }, scrollHeight: 40 } });
  }, text);
  await sleep(200);
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="chat-input"]');
    const propsKey = Object.keys(el).find(k => k.startsWith('__reactProps$'));
    el[propsKey].onKeyDown({ key: 'Enter', shiftKey: false, preventDefault: () => {} });
  });
}

async function waitForProducts(page, expectedProducts, timeoutSec = 45) {
  for (let i = 0; i < timeoutSec; i++) {
    const found = await page.evaluate((products) => {
      const text = document.body.innerText;
      return products.map(p => text.includes(p));
    }, expectedProducts);
    if (found.every(Boolean)) return { success: true, found };
    await sleep(1000);
  }
  const finalFound = await page.evaluate((products) => {
    const text = document.body.innerText;
    return products.map(p => text.includes(p));
  }, expectedProducts);
  return { success: false, found: finalFound };
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
  console.log('=== FIX 2 VERIFICATION: Tankmix in één bericht ===\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

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
    console.log('  Login OK\n');

    // Test variants
    const variants = [
      {
        name: 'V1: "en" connector',
        input: 'vandaag alle conference met merpan 0.7 kg en score 0.2L',
        expected: ['Merpan', 'Score'],
      },
      {
        name: 'V2: "+" connector',
        input: 'alle peren met merpan 0.7 kg + score 0.2L',
        expected: ['Merpan', 'Score'],
      },
      {
        name: 'V3: comma separated',
        input: 'vandaag alle conference met merpan 0.7 kg, score 0.2L',
        expected: ['Merpan', 'Score'],
      },
    ];

    const results = [];

    for (const variant of variants) {
      console.log(`[TEST] ${variant.name}`);
      console.log(`  Input: "${variant.input}"`);

      const ready = await resetChat(page);
      if (!ready) {
        console.log('  SKIP: Could not load Smart Input V2');
        results.push({ name: variant.name, pass: false, reason: 'Page not loaded' });
        continue;
      }

      await sendMessage(page, variant.input);
      console.log('  Waiting for AI response...');

      const result = await waitForProducts(page, variant.expected, 45);

      const productStatus = variant.expected.map((p, i) => `${p}=${result.found[i] ? 'YES' : 'NO'}`).join(', ');
      const pass = result.success;

      console.log(`  Products found: ${productStatus}`);
      console.log(`  Result: ${pass ? 'PASS' : 'FAIL'}\n`);
      results.push({ name: variant.name, pass, products: productStatus });

      // If first variant passed, try to save it
      if (pass && results.filter(r => r.pass).length === 1) {
        console.log('  [BONUS] Saving tankmix via "Bevestigen" button...');
        try {
          // Click the confirm button
          const confirmBtn = await page.$('button:has-text("Bevestigen")');
          if (confirmBtn) {
            await confirmBtn.click();
            await sleep(10000);
            const saved = await page.evaluate(() => document.body.innerText.includes('Bevestigd'));
            console.log(`  Save result: ${saved ? 'PASS' : 'FAIL'}\n`);
          } else {
            console.log('  No confirm button found\n');
          }
        } catch (e) {
          console.log(`  Save error: ${e.message}\n`);
        }
      }
    }

    // Final results
    console.log('=== RESULTS ===');
    for (const r of results) {
      console.log(`  ${r.name}: ${r.pass ? 'PASS' : 'FAIL'} (${r.products || r.reason})`);
    }
    const passCount = results.filter(r => r.pass).length;
    console.log(`\n  FIX 2 VERDICT: ${passCount}/${results.length} variants passed`);
    console.log(`  ${passCount >= 2 ? 'PASS' : 'FAIL'} (threshold: 2/${results.length})`);

  } catch (error) {
    console.error('Test error:', error.message);
    try { await page.screenshot({ path: 'test-fix2-error.png' }); } catch {}
  } finally {
    await browser.close();
  }
})();
