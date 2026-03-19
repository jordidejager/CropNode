const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DIR = '/tmp/smart-input-tests';
const PORT = 3003;

if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

const results = [];
const consoleErrors = [];

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().substring(0, 200)); });

  // === LOGIN via form ===
  console.log('Logging in via form...');
  await page.goto(`http://localhost:${PORT}/login`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(3000); // Wait for React hydration

  await page.fill('input[name="username"]', 'admin');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button:has-text("Inloggen")');

  // Wait for redirect with URL polling
  let loggedIn = false;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(500);
    const url = page.url();
    if (!url.includes('/login')) {
      loggedIn = true;
      console.log('Logged in, redirected to:', url);
      break;
    }
    if (i === 15) {
      const hasError = await page.locator('.text-red-400').isVisible().catch(() => false);
      if (hasError) {
        const errText = await page.locator('.text-red-400').textContent().catch(() => '');
        console.log('  Login error:', errText);
      }
    }
  }

  if (!loggedIn) {
    console.log('Form redirect failed, trying direct navigation...');
    await page.goto(`http://localhost:${PORT}/command-center/smart-input-v2`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);
    if (page.url().includes('/login')) {
      console.error('LOGIN FAILED');
      await page.screenshot({ path: path.join(DIR, 'login-failed.png') });
      await browser.close();
      return;
    }
    console.log('Direct navigation worked:', page.url());
  }

  await page.waitForTimeout(2000);
  console.log('Current URL:', page.url());

  // === HELPER: go to V2 and wait for context ===
  async function goToV2() {
    await page.goto(`http://localhost:${PORT}/command-center/smart-input-v2`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    for (let i = 0; i < 25; i++) {
      await page.waitForTimeout(1000);
      // Check via evaluate if any chat-input textarea has dimensions (is rendered)
      const ready = await page.evaluate(() => {
        const els = document.querySelectorAll('[data-testid="chat-input"]');
        for (const el of els) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) return true;
        }
        return false;
      }).catch(() => false);
      if (ready) { console.log('  V2 ready (' + (i+1) + 's)'); return true; }
      const err = await page.locator('text="Kon context niet laden"').isVisible().catch(() => false);
      if (err) {
        console.log('  Context FAILED, retrying...');
        await page.reload({ waitUntil: 'domcontentloaded' });
      }
    }
    console.log('  V2 timeout - taking debug screenshot');
    await page.screenshot({ path: path.join(DIR, 'v2-timeout-debug.png') });
    if (page.url().includes('/login')) {
      console.log('  REDIRECTED TO LOGIN - session expired');
      return false;
    }
    return false;
  }

  // === HELPER: send message and wait for response ===
  async function send(msg) {
    const t0 = Date.now();
    // Use evaluate to find and interact with the visible textarea directly
    await page.evaluate((message) => {
      const textareas = document.querySelectorAll('[data-testid="chat-input"]');
      let target = null;
      for (const ta of textareas) {
        const rect = ta.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          target = ta;
          break;
        }
      }
      if (!target && textareas.length > 0) target = textareas[textareas.length - 1];
      if (target) {
        target.scrollIntoView({ block: 'center' });
        target.focus();
        // Set value via native input setter to trigger React onChange
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        nativeInputValueSetter.call(target, message);
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, msg);
    await page.waitForTimeout(300);
    // Press Enter on the focused textarea
    await page.keyboard.press('Enter');

    // Wait for response: spinner appears then disappears, or new content
    await page.waitForTimeout(1000);
    for (let i = 0; i < 45; i++) { // max ~45s
      await page.waitForTimeout(1000);
      const spinning = await page.locator('[class*="animate-spin"], [class*="animate-pulse"]').first().isVisible().catch(() => false);
      const elapsed = (Date.now() - t0) / 1000;
      if (!spinning && elapsed > 3) break;
      if (elapsed > 40) break; // absolute max
    }
    await page.waitForTimeout(2000); // extra settle time
    return (Date.now() - t0) / 1000;
  }

  // === HELPER: get visible content ===
  async function getContent() {
    return await page.evaluate(() => {
      const main = document.querySelector('main') || document.body;
      return main.innerText.substring(0, 3000);
    });
  }

  // === HELPER: screenshot ===
  async function shot(name) {
    await page.screenshot({ path: path.join(DIR, name) });
    console.log('  Screenshot: ' + name);
  }

  // === CHECK CONTEXT ENDPOINT ===
  console.log('\n=== CONTEXT CHECK ===');
  await goToV2();
  const ctxData = await page.evaluate(async () => {
    try {
      const r = await fetch('/api/smart-input-v2/context');
      if (!r.ok) return { error: r.status };
      const d = await r.json();
      return { parcels: d.parcels?.length||0, products: d.products?.length||0, history: d.history?.length||0 };
    } catch(e) { return { error: e.message }; }
  });
  console.log('Context:', JSON.stringify(ctxData));

  // ============================================================
  // SESSIE 1: Simpele registratie
  // ============================================================
  console.log('\n=== SESSIE 1: Simpel ===');
  await goToV2();
  let rt = await send('gisteren alle peren met merpan 2 liter');
  let content = await getContent();
  await shot('test-s1-simpel.png');
  console.log(`  RT: ${rt.toFixed(1)}s`);
  console.log(`  Content preview: ${content.substring(0, 300)}`);
  results.push({ s: '1', in: 'gisteren alle peren met merpan 2 liter', rt: +rt.toFixed(1), out: content.substring(0, 600) });

  // Confirm
  rt = await send('klopt, opslaan');
  content = await getContent();
  await shot('test-s1-opslaan.png');
  results.push({ s: '1-save', in: 'klopt, opslaan', rt: +rt.toFixed(1), out: content.substring(0, 600) });

  // ============================================================
  // SESSIE 2: Tankmenging
  // ============================================================
  console.log('\n=== SESSIE 2: Tankmenging ===');
  await goToV2();
  rt = await send('vandaag alle appels gespoten met merpan 2L, score 0.3L en delan 0.75 kg');
  content = await getContent();
  await shot('test-s2-tankmenging.png');
  console.log(`  RT: ${rt.toFixed(1)}s`);
  console.log(`  Content preview: ${content.substring(0, 400)}`);
  results.push({ s: '2', in: 'tankmenging merpan+score+delan', rt: +rt.toFixed(1), out: content.substring(0, 600) });

  // ============================================================
  // SESSIE 3: Exception
  // ============================================================
  console.log('\n=== SESSIE 3: Exception ===');
  await goToV2();
  rt = await send('gisteren alle peren met captan 2L maar conference niet');
  content = await getContent();
  await shot('test-s3-exception.png');
  console.log(`  RT: ${rt.toFixed(1)}s`);
  console.log(`  Content preview: ${content.substring(0, 400)}`);
  results.push({ s: '3', in: 'alle peren behalve conference', rt: +rt.toFixed(1), out: content.substring(0, 600) });

  // ============================================================
  // SESSIE 4: Multi-turn dosering correctie
  // ============================================================
  console.log('\n=== SESSIE 4: Dosering correctie ===');
  await goToV2();
  rt = await send('vandaag alle conference met surround 30 kg');
  await shot('test-s4-initial.png');
  let rt1 = rt;
  rt = await send('nee de dosering is 25 kg');
  content = await getContent();
  await shot('test-s4-dosering-correctie.png');
  console.log(`  B1: ${rt1.toFixed(1)}s, B2: ${rt.toFixed(1)}s`);
  console.log(`  Content preview: ${content.substring(0, 400)}`);
  results.push({ s: '4', in: 'surround 30→25 kg', rt: +rt.toFixed(1), out: content.substring(0, 600) });

  // ============================================================
  // SESSIE 5: Perceel toevoegen
  // ============================================================
  console.log('\n=== SESSIE 5: Perceel toevoegen ===');
  await goToV2();
  await send('gisteren alle elstar met merpan 2L');
  await shot('test-s5-initial.png');
  rt = await send('oh en de kanzi ook');
  content = await getContent();
  await shot('test-s5-perceel-toevoegen.png');
  console.log(`  RT: ${rt.toFixed(1)}s`);
  results.push({ s: '5', in: 'elstar + kanzi toevoegen', rt: +rt.toFixed(1), out: content.substring(0, 600) });

  // ============================================================
  // SESSIE 6: Datum split
  // ============================================================
  console.log('\n=== SESSIE 6: Datum split ===');
  await goToV2();
  await send('gisteren alle peren met merpan 2L');
  rt = await send('stadhoek was eergisteren');
  content = await getContent();
  await shot('test-s6-datum-split.png');
  console.log(`  RT: ${rt.toFixed(1)}s`);
  results.push({ s: '6', in: 'stadhoek eergisteren split', rt: +rt.toFixed(1), out: content.substring(0, 600) });

  // ============================================================
  // SESSIE 7: Product toevoegen bij subset
  // ============================================================
  console.log('\n=== SESSIE 7: Product toevoegen subset ===');
  await goToV2();
  await send('vandaag alle peren met merpan 2L');
  rt = await send('bij conference ook score 0.3L erbij');
  content = await getContent();
  await shot('test-s7-product-toevoegen.png');
  console.log(`  RT: ${rt.toFixed(1)}s`);
  results.push({ s: '7', in: 'conference score erbij', rt: +rt.toFixed(1), out: content.substring(0, 600) });

  // ============================================================
  // SESSIE 8: Product wisselen
  // ============================================================
  console.log('\n=== SESSIE 8: Product wisselen ===');
  await goToV2();
  await send('gisteren alle appels met merpan 2L');
  rt = await send('niet merpan maar captan');
  content = await getContent();
  await shot('test-s8-product-swap.png');
  console.log(`  RT: ${rt.toFixed(1)}s`);
  results.push({ s: '8', in: 'merpan→captan swap', rt: +rt.toFixed(1), out: content.substring(0, 600) });

  // ============================================================
  // SESSIE 9: Halve dosering
  // ============================================================
  console.log('\n=== SESSIE 9: Halve dosering ===');
  await goToV2();
  await send('vandaag alle peren met merpan 2L');
  rt = await send('de jonge aanplant met halve dosering');
  content = await getContent();
  await shot('test-s9-halve-dosering.png');
  console.log(`  RT: ${rt.toFixed(1)}s`);
  results.push({ s: '9', in: 'halve dosering jonge aanplant', rt: +rt.toFixed(1), out: content.substring(0, 600) });

  // ============================================================
  // SESSIE 10a: Informeel - getankt
  // ============================================================
  console.log('\n=== SESSIE 10a: getankt ===');
  await goToV2();
  rt = await send('getankt met captan, alle bomen, gisteren');
  content = await getContent();
  await shot('test-s10a-getankt.png');
  console.log(`  RT: ${rt.toFixed(1)}s`);
  results.push({ s: '10a', in: 'getankt met captan', rt: +rt.toFixed(1), out: content.substring(0, 600) });

  // ============================================================
  // SESSIE 10b: Informeel - rondje
  // ============================================================
  console.log('\n=== SESSIE 10b: rondje ===');
  await goToV2();
  rt = await send('eergisteren een rondje gedaan met score door alle conference');
  content = await getContent();
  await shot('test-s10b-rondje.png');
  console.log(`  RT: ${rt.toFixed(1)}s`);
  results.push({ s: '10b', in: 'rondje gedaan met score', rt: +rt.toFixed(1), out: content.substring(0, 600) });

  // ============================================================
  // SESSIE 10c: Informeel - schurftmiddel
  // ============================================================
  console.log('\n=== SESSIE 10c: schurftmiddel ===');
  await goToV2();
  rt = await send('gister door de peren geweest met dat schurftmiddel, 2 liter');
  content = await getContent();
  await shot('test-s10c-schurftmiddel.png');
  console.log(`  RT: ${rt.toFixed(1)}s`);
  results.push({ s: '10c', in: 'dat schurftmiddel', rt: +rt.toFixed(1), out: content.substring(0, 600) });

  // ============================================================
  // SESSIE 11: Minimale input
  // ============================================================
  console.log('\n=== SESSIE 11: Minimaal ===');
  await goToV2();
  rt = await send('gespoten');
  content = await getContent();
  await shot('test-s11-minimaal.png');
  console.log(`  RT: ${rt.toFixed(1)}s`);
  results.push({ s: '11', in: 'gespoten', rt: +rt.toFixed(1), out: content.substring(0, 600) });

  // ============================================================
  // SESSIE 12: Zonder datum
  // ============================================================
  console.log('\n=== SESSIE 12: Zonder datum ===');
  await goToV2();
  rt = await send('alle conference met surround 30 kg');
  content = await getContent();
  await shot('test-s12-geen-datum.png');
  console.log(`  RT: ${rt.toFixed(1)}s`);
  results.push({ s: '12', in: 'geen datum', rt: +rt.toFixed(1), out: content.substring(0, 600) });

  // ============================================================
  // SESSIE 13: Zonder dosering
  // ============================================================
  console.log('\n=== SESSIE 13: Zonder dosering ===');
  await goToV2();
  rt = await send('gisteren alle peren met merpan');
  content = await getContent();
  await shot('test-s13-geen-dosering.png');
  console.log(`  RT: ${rt.toFixed(1)}s`);
  results.push({ s: '13', in: 'geen dosering', rt: +rt.toFixed(1), out: content.substring(0, 600) });

  // ============================================================
  // SESSIE 14: Product vraag
  // ============================================================
  console.log('\n=== SESSIE 14: Product vraag ===');
  await goToV2();
  rt = await send('welke middelen mag ik gebruiken tegen schurft op peer?');
  // Agent queries take longer - extra wait
  await page.waitForTimeout(5000);
  content = await getContent();
  await shot('test-s14-product-vraag.png');
  console.log(`  RT: ${rt.toFixed(1)}s`);
  results.push({ s: '14', in: 'welke middelen tegen schurft', rt: +rt.toFixed(1), out: content.substring(0, 800) });

  // ============================================================
  // SESSIE 15: Complexe multi-turn (5 berichten)
  // ============================================================
  console.log('\n=== SESSIE 15: Complex multi-turn ===');
  await goToV2();
  const msgs = [
    'gisteren alle peren met merpan en score',
    'merpan 2 liter, score 0.3',
    'conference niet, die was eergisteren',
    'bij de gieser wildeman ook bellis erbij, 0.8 kg',
    'klopt, sla maar op'
  ];
  for (let i = 0; i < msgs.length; i++) {
    rt = await send(msgs[i]);
    content = await getContent();
    await shot(`test-s15-b${i+1}.png`);
    console.log(`  B${i+1} (${rt.toFixed(1)}s): ${content.substring(0, 200)}`);
    results.push({ s: `15-b${i+1}`, in: msgs[i], rt: +rt.toFixed(1), out: content.substring(0, 600) });
  }

  // === SAVE RESULTS ===
  const report = { context: ctxData, results, errors: [...new Set(consoleErrors)].slice(0, 20), ts: new Date().toISOString() };
  fs.writeFileSync(path.join(DIR, 'results.json'), JSON.stringify(report, null, 2));
  console.log('\n=== ALL TESTS COMPLETE ===');
  console.log(`Total tests: ${results.length}`);
  console.log(`Unique console errors: ${[...new Set(consoleErrors)].length}`);

  await browser.close();
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
