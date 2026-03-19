/**
 * Hertest: 4 tests die CTGB "niet gevonden" warnings hadden + 2 timeouts
 */
const { chromium } = require('playwright');
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

async function getBaseline(page) {
  return page.evaluate(() => document.body.innerText.length);
}

async function waitAndAnalyze(page, baseline) {
  for (let i = 0; i < 60; i++) {
    const len = await page.evaluate(() => document.body.innerText.length);
    if (len > baseline + 100) {
      await sleep(5000); // Wait for full render + CTGB validation
      return page.evaluate(() => {
        const body = document.body.innerText;
        return {
          hasNietGevonden: body.includes('niet gevonden'),
          hasNietToegelaten: body.includes('niet toegelaten'),
          hasAkkoord: body.includes('Akkoord'),
          hasWaarschuwing: body.includes('Waarschuwing'),
          // Extract product-related lines
          productLines: body.split('\n')
            .filter(l => /\d+[.,]\d+\s*(kg|L|ml|g)/i.test(l) || l.includes('Spuitkorrel') || l.includes('Protech') || l.includes('Next') || l.includes('CHORUS') || l.includes('LUNA') || l.includes('Apollo'))
            .map(l => l.trim())
            .filter(l => l.length > 3 && l.length < 200)
            .slice(0, 10)
        };
      });
    }
    await sleep(1000);
  }
  return null;
}

async function resetChat(page) {
  await page.goto('http://localhost:3003/command-center/smart-input-v2', { timeout: 30000 });
  for (let i = 0; i < 15; i++) {
    if (await page.$('[data-testid="chat-input"]')) { await sleep(1000); return true; }
    await sleep(2000);
  }
  return false;
}

const TESTS = [
  { id: 'B1', input: 'vandaag alle appels met decis 0.25 L', desc: 'Decis → Decis Protech (was Decis EC)' },
  { id: 'B4', input: 'vandaag alle conference met karate zeon 0.15 L', desc: 'Karate → Karate Next (was Karate Zeon)' },
  { id: 'C2', input: 'vandaag alle peren met apollo 0.3 L', desc: 'Apollo → niet in DB (alias verwijderd)' },
  { id: 'E1', input: 'vandaag alle conference met chorus 0.6 kg', desc: 'Chorus → CHORUS 50 WG (was Chorus)' },
  { id: 'A3', input: 'vandaag alle elstar met bellis 0.8 kg', desc: 'Hertest (was AI timeout)' },
  { id: 'A5', input: 'vandaag alle peren met scala 0.75 L', desc: 'Hertest (was AI timeout)' },
];

(async () => {
  console.log('=== HERTEST NA ALIAS FIXES ===\n');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  try {
    await page.goto('http://localhost:3003/login', { timeout: 30000 });
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'admin123');
    for (let a = 0; a < 3; a++) {
      await page.click('button[type="submit"]');
      try { await page.waitForURL(/command-center/, { timeout: 15000 }); break; } catch {}
      await sleep(2000);
    }
    console.log('Ingelogd\n');

    for (const test of TESTS) {
      console.log(`[${test.id}] ${test.input}`);
      console.log(`  Fix: ${test.desc}`);

      const ready = await resetChat(page);
      if (!ready) { console.log('  ❌ Pagina niet geladen\n'); continue; }

      const baseline = await getBaseline(page);
      await sendMessage(page, test.input);
      const result = await waitAndAnalyze(page, baseline);

      if (!result) {
        console.log('  ❌ AI timeout\n');
        continue;
      }

      const nietGevonden = result.hasNietGevonden;
      console.log(`  CTGB "niet gevonden": ${nietGevonden ? '❌ JA (broken alias)' : '✅ NEE (opgelost!)'}`);
      if (result.hasAkkoord) console.log('  Status: ✅ Akkoord');
      if (result.hasWaarschuwing) console.log('  Status: ⚠️ Waarschuwing');
      console.log('  Productregel(s):');
      result.productLines.forEach(l => console.log(`    > ${l}`));
      console.log();
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
})();
