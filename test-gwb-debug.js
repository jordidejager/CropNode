/**
 * Debug test: Check what text actually appears for failed products
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
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  try {
    // Login
    await page.goto('http://localhost:3003/login', { timeout: 30000 });
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForURL(/command-center/, { timeout: 15000 });
    console.log('Logged in\n');

    // Test A1: Merpan
    await page.goto('http://localhost:3003/command-center/smart-input-v2', { timeout: 30000 });
    for (let i = 0; i < 15; i++) {
      if (await page.$('[data-testid="chat-input"]')) break;
      await sleep(2000);
    }

    console.log('=== TEST: vandaag alle conference met merpan 0.7 kg ===');
    await sendMessage(page, 'vandaag alle conference met merpan 0.7 kg');

    // Wait longer and dump page text
    for (let i = 0; i < 60; i++) {
      await sleep(1000);
      const text = await page.evaluate(() => document.body.innerText);
      if (text.includes('Bevestigen') || text.includes('perceel') || text.includes('Akkoord') ||
          text.includes('Waarschuwing') || text.includes('niet gevonden')) {
        await sleep(3000); // Extra render time
        const fullText = await page.evaluate(() => document.body.innerText);

        // Search for product-related text
        const lines = fullText.split('\n');
        const productLines = lines.filter(l =>
          l.toLowerCase().includes('merpan') ||
          l.toLowerCase().includes('captan') ||
          l.toLowerCase().includes('spuitkorrel') ||
          l.toLowerCase().includes('product') ||
          l.includes('kg') || l.includes('L/ha') ||
          l.includes('0.7') || l.includes('0,7')
        );

        console.log('Product-related lines:');
        productLines.forEach(l => console.log(`  > "${l.trim()}"`));

        // Also check for all text containing numbers or dosage
        const dosageLines = lines.filter(l => /\d+[.,]\d+/.test(l) && l.length < 150);
        console.log('\nDosage-related lines:');
        dosageLines.slice(0, 15).forEach(l => console.log(`  > "${l.trim()}"`));

        // Take screenshot
        await page.screenshot({ path: 'debug-merpan.png', fullPage: true });
        console.log('\nScreenshot saved: debug-merpan.png');

        // Also dump HTML of registration card area
        const cardHTML = await page.evaluate(() => {
          // Look for the registration card container
          const cards = document.querySelectorAll('[class*="card"], [class*="registration"], [class*="group"]');
          let html = '';
          cards.forEach(c => {
            const t = c.innerText;
            if (t.includes('Bevestigen') || t.includes('perceel') || t.includes('kg') || t.includes('0.7')) {
              html += `\n--- Card (class="${c.className.substring(0, 80)}"): ---\n${t.substring(0, 500)}\n`;
            }
          });
          return html || 'No matching cards found';
        });
        console.log('\nCard content:');
        console.log(cardHTML);

        break;
      }
    }

    // Test B4: Karate Zeon
    await page.goto('http://localhost:3003/command-center/smart-input-v2', { timeout: 30000 });
    for (let i = 0; i < 15; i++) {
      if (await page.$('[data-testid="chat-input"]')) break;
      await sleep(2000);
    }

    console.log('\n\n=== TEST: vandaag alle conference met karate zeon 0.15 L ===');
    await sendMessage(page, 'vandaag alle conference met karate zeon 0.15 L');

    for (let i = 0; i < 60; i++) {
      await sleep(1000);
      const text = await page.evaluate(() => document.body.innerText);
      if (text.includes('Bevestigen') || text.includes('perceel') || text.includes('Akkoord')) {
        await sleep(3000);
        const fullText = await page.evaluate(() => document.body.innerText);
        const lines = fullText.split('\n');
        const productLines = lines.filter(l =>
          l.toLowerCase().includes('karate') ||
          l.toLowerCase().includes('zeon') ||
          l.toLowerCase().includes('lambda') ||
          l.toLowerCase().includes('insect') ||
          l.includes('0.15') || l.includes('0,15')
        );
        console.log('Product-related lines:');
        productLines.forEach(l => console.log(`  > "${l.trim()}"`));
        await page.screenshot({ path: 'debug-karate.png', fullPage: true });
        break;
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
})();
