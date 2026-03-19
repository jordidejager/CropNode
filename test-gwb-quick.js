/**
 * Quick check: is "niet gevonden" for Decis from the current card or sidebar?
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

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();

  await page.goto('http://localhost:3003/login', { timeout: 30000 });
  await page.fill('input[name="username"]', 'admin');
  await page.fill('input[name="password"]', 'admin123');
  await page.click('button[type="submit"]');
  try { await page.waitForURL(/command-center/, { timeout: 15000 }); } catch {}
  await sleep(2000);

  // Test Decis
  await page.goto('http://localhost:3003/command-center/smart-input-v2', { timeout: 30000 });
  for (let i = 0; i < 15; i++) { if (await page.$('[data-testid="chat-input"]')) break; await sleep(2000); }
  await sleep(1000);

  // Check baseline for "niet gevonden" BEFORE sending message
  const baselineText = await page.evaluate(() => document.body.innerText);
  const baselineNietGevonden = baselineText.includes('niet gevonden');
  console.log(`Baseline (before sending): "niet gevonden" = ${baselineNietGevonden}`);

  // Count occurrences
  const baselineCount = (baselineText.match(/niet gevonden/g) || []).length;
  console.log(`Baseline count: ${baselineCount}\n`);

  // Send message
  console.log('Sending: vandaag alle appels met decis 0.25 L');
  const baseline = baselineText.length;
  await sendMessage(page, 'vandaag alle appels met decis 0.25 L');

  // Wait for response
  for (let i = 0; i < 60; i++) {
    const len = await page.evaluate(() => document.body.innerText.length);
    if (len > baseline + 100) { await sleep(5000); break; }
    await sleep(1000);
  }

  const afterText = await page.evaluate(() => document.body.innerText);
  const afterCount = (afterText.match(/niet gevonden/g) || []).length;
  console.log(`After response: "niet gevonden" count = ${afterCount}`);
  console.log(`Delta: ${afterCount - baselineCount} new "niet gevonden" occurrences`);

  // Find where "niet gevonden" appears
  const lines = afterText.split('\n');
  const nietGevondenLines = lines.filter(l => l.includes('niet gevonden'));
  console.log('\nLines with "niet gevonden":');
  nietGevondenLines.forEach(l => console.log(`  > "${l.trim()}"`));

  // Check if there's a validation status for Decis specifically
  const decisLines = lines.filter(l => l.toLowerCase().includes('decis'));
  console.log('\nLines with "decis":');
  decisLines.forEach(l => console.log(`  > "${l.trim()}"`));

  // Check for "Akkoord" status on the card
  const hasAkkoord = afterText.includes('Akkoord');
  console.log(`\nCard shows "Akkoord": ${hasAkkoord}`);

  await browser.close();
})();
