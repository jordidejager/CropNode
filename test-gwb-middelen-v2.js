/**
 * Brede GWB Middelentest V2 - Slimme Invoer V2
 * Fixed: Better AI response detection using baseline comparison
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

async function waitForNewContent(page, baselineLen, timeoutSec = 60) {
  // Wait for page content to significantly grow (AI response)
  for (let i = 0; i < timeoutSec; i++) {
    const currentLen = await page.evaluate(() => document.body.innerText.length);
    // Content should grow by at least 50 chars for a real AI response
    if (currentLen > baselineLen + 100) {
      // Wait a bit more for full render
      await sleep(4000);
      return true;
    }
    await sleep(1000);
  }
  return false;
}

async function analyzeResponse(page) {
  return page.evaluate(() => {
    const body = document.body.innerText;

    // Search for product names (case-insensitive substring matching)
    const searchTerms = {
      'Merpan': /merpan/i,
      'Delan': /delan/i,
      'Bellis': /bellis/i,
      'Flint': /flint/i,
      'Scala': /scala/i,
      'Score': /score\s*(250)?/i,
      'Decis': /decis/i,
      'Pirimor': /pirimor/i,
      'CORAGEN': /coragen/i,
      'Karate': /karate/i,
      'Nissorun': /nissorun/i,
      'Apollo': /apollo/i,
      'Floramite': /floramite/i,
      'Regalis': /regalis/i,
      'Surround': /surround/i,
      'Teldor': /teldor/i,
      'Chorus': /chorus/i,
      'Luna': /luna/i,
      'Switch': /switch/i,
      'Captosan': /captosan/i,
      'Captan': /captan/i,
      'Syllit': /syllit/i,
    };

    const foundProducts = [];
    for (const [name, regex] of Object.entries(searchTerms)) {
      if (regex.test(body)) foundProducts.push(name);
    }

    // Look for dosage patterns
    const dosageMatches = body.match(/(\d+[.,]?\d*)\s*(kg|L|ml|l|g)(\/ha)?/gi) || [];

    // Check validation status
    const status = body.includes('Akkoord') ? 'Akkoord' :
                   body.includes('Waarschuwing') ? 'Waarschuwing' :
                   body.includes('Afgekeurd') ? 'Afgekeurd' :
                   body.includes('Te Controleren') ? 'Te Controleren' :
                   body.includes('niet gevonden') ? 'Niet gevonden' :
                   'Onbekend';

    // Check for card / parcels
    const hasCard = body.includes('Bevestigen') || body.includes('Bevestigd') ||
                    body.includes('Akkoord') || body.includes('Waarschuwing');
    const hasParcels = body.includes('Conference') || body.includes('Elstar') ||
                       body.includes('Boskoop') || body.includes('Jonagold') ||
                       body.includes('Gala') || body.includes('Doyenne') ||
                       (body.match(/\d+[.,]\d+\s*ha/g) || []).length >= 2;

    // Check for specific error patterns
    const nietGevonden = body.includes('niet gevonden');
    const nietToegelaten = body.includes('niet toegelaten');

    return {
      foundProducts,
      dosages: dosageMatches.slice(0, 5),
      status,
      hasCard,
      hasParcels,
      nietGevonden,
      nietToegelaten
    };
  });
}

async function resetChat(page) {
  await page.goto('http://localhost:3003/command-center/smart-input-v2', { timeout: 30000 });
  for (let i = 0; i < 15; i++) {
    const ready = await page.evaluate(() => !!document.querySelector('[data-testid="chat-input"]'));
    if (ready) {
      await sleep(1000); // Extra wait for context to load
      return true;
    }
    await sleep(2000);
  }
  return false;
}

// Test definitions
const TESTS = [
  // === A: FUNGICIDEN ===
  { id: 'A1', cat: 'Fungicide', input: 'vandaag alle conference met merpan 0.7 kg',
    expectProduct: 'Merpan', expectDosage: '0.7', expectUnit: 'kg' },
  { id: 'A2', cat: 'Fungicide', input: 'vandaag alle peren met delan 0.5 kg',
    expectProduct: 'Delan', expectDosage: '0.5', expectUnit: 'kg',
    note: 'Alias delan→Delan WG (broken ref)' },
  { id: 'A3', cat: 'Fungicide', input: 'vandaag alle elstar met bellis 0.8 kg',
    expectProduct: 'Bellis', expectDosage: '0.8', expectUnit: 'kg' },
  { id: 'A4', cat: 'Fungicide', input: 'vandaag alle conference met flint 0.15 kg',
    expectProduct: 'Flint', expectDosage: '0.15', expectUnit: 'kg' },
  { id: 'A5', cat: 'Fungicide', input: 'vandaag alle peren met scala 0.75 L',
    expectProduct: 'Scala', expectDosage: '0.75', expectUnit: 'L' },
  { id: 'A6', cat: 'Fungicide', input: 'vandaag alle conference met score 0.2 L',
    expectProduct: 'Score', expectDosage: '0.2', expectUnit: 'L' },

  // === B: INSECTICIDEN ===
  { id: 'B1', cat: 'Insecticide', input: 'vandaag alle appels met decis 0.25 L',
    expectProduct: 'Decis', expectDosage: '0.25', expectUnit: 'L',
    note: 'Alias decis→Decis EC (broken ref)' },
  { id: 'B2', cat: 'Insecticide', input: 'vandaag alle peren met pirimor 0.5 kg',
    expectProduct: 'Pirimor', expectDosage: '0.5', expectUnit: 'kg' },
  { id: 'B3', cat: 'Insecticide', input: 'vandaag alle appels met coragen 0.18 L',
    expectProduct: 'CORAGEN', expectDosage: '0.18', expectUnit: 'L' },
  { id: 'B4', cat: 'Insecticide', input: 'vandaag alle conference met karate zeon 0.15 L',
    expectProduct: 'Karate', expectDosage: '0.15', expectUnit: 'L' },

  // === C: ACARICIDEN ===
  { id: 'C1', cat: 'Acaricide', input: 'vandaag alle appels met nissorun 0.2 L',
    expectProduct: 'Nissorun', expectDosage: '0.2', expectUnit: 'L',
    note: 'Alias nissorun→Nissorun (DB=Nissorun vloeibaar)' },
  { id: 'C2', cat: 'Acaricide', input: 'vandaag alle peren met apollo 0.3 L',
    expectProduct: 'Apollo', expectDosage: '0.3', expectUnit: 'L' },
  { id: 'C3', cat: 'Acaricide', input: 'vandaag alle elstar met floramite 0.4 L',
    expectProduct: 'Floramite', expectDosage: '0.4', expectUnit: 'L' },

  // === D: GROEIREGULATOR + OVERIG ===
  { id: 'D1', cat: 'Groeiregulator', input: 'vandaag alle appels met regalis plus 2.5 kg',
    expectProduct: 'Regalis', expectDosage: '2.5', expectUnit: 'kg' },
  { id: 'D2', cat: 'Overig', input: 'vandaag alle conference met teldor 1.5 kg',
    expectProduct: 'Teldor', expectDosage: '1.5', expectUnit: 'kg' },
  { id: 'D3', cat: 'Overig', input: 'vandaag alle peren met switch 1 kg',
    expectProduct: 'Switch', expectDosage: '1', expectUnit: 'kg' },

  // === E: LASTIGE NAMEN ===
  { id: 'E1', cat: 'Lastige naam', input: 'vandaag alle conference met chorus 0.6 kg',
    expectProduct: 'Chorus', expectDosage: '0.6', expectUnit: 'kg',
    note: 'Alias chorus→Chorus (DB=CHORUS 50 WG)' },
  { id: 'E2', cat: 'Lastige naam', input: 'vandaag alle appels met luna experience 0.75 L',
    expectProduct: 'Luna', expectDosage: '0.75', expectUnit: 'L',
    note: 'Alias luna→Luna Sensation (broken; DB=LUNA EXPERIENCE)' },
  { id: 'E3', cat: 'Lastige naam', input: 'vandaag alle peren met captosan 1.1 L',
    expectProduct: 'Captosan', expectDosage: '1.1', expectUnit: 'L' },

  // === F: EENHEID-VARIATIES ===
  { id: 'F1', cat: 'Eenheid', input: 'vandaag alle conference met merpan 700 gram',
    expectProduct: 'Merpan', expectDosage: '700',
    note: '700g = 0.7 kg - controle eenheidsconversie' },
  { id: 'F2', cat: 'Eenheid', input: 'vandaag alle elstar met scala 750 ml',
    expectProduct: 'Scala', expectDosage: '750',
    note: '750ml = 0.75 L - controle ml→L conversie' },
  { id: 'F3', cat: 'Eenheid', input: 'vandaag alle peren met score 200 ml',
    expectProduct: 'Score', expectDosage: '200',
    note: '200ml = 0.2 L - controle ml→L conversie' },

  // === G: TANKMIXEN ===
  { id: 'G1', cat: 'Tankmix', input: 'vandaag alle conference met merpan 0.7 kg en score 0.2 L',
    expectProduct: 'Merpan', expectProduct2: 'Score',
    note: '2-product tankmix met "en"' },
  { id: 'G2', cat: 'Tankmix', input: 'vandaag alle peren met delan 0.5 kg + flint 0.15 kg',
    expectProduct: 'Delan', expectProduct2: 'Flint',
    note: '2-product tankmix met "+"' },
  { id: 'G3', cat: 'Tankmix', input: 'vandaag alle conference met merpan 0.7 kg, score 0.2 L en flint 0.15 kg',
    expectProduct: 'Merpan', expectProduct2: 'Score', expectProduct3: 'Flint',
    note: '3-product tankmix' },
];

(async () => {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     BREDE GWB MIDDELENTEST V2 - Slimme Invoer V2           ║');
  console.log('║     Datum: ' + new Date().toLocaleString('nl-NL') + '                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const results = [];

  try {
    // === LOGIN ===
    console.log('[LOGIN] Inloggen...');
    await page.goto('http://localhost:3003/login', { timeout: 30000 });
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'admin123');
    for (let a = 0; a < 3; a++) {
      await page.click('button[type="submit"]');
      try { await page.waitForURL(/command-center/, { timeout: 15000 }); break; } catch {}
      await sleep(2000);
    }
    console.log('  ✅ Ingelogd\n');

    // === RUN TESTS ===
    let currentCat = '';

    for (const test of TESTS) {
      if (test.cat !== currentCat) {
        currentCat = test.cat;
        console.log(`\n${'═'.repeat(60)}`);
        console.log(`  ${currentCat.toUpperCase()}`);
        console.log(`${'═'.repeat(60)}`);
      }

      console.log(`\n[${test.id}] ${test.input}`);
      if (test.note) console.log(`  ℹ️  ${test.note}`);

      const ready = await resetChat(page);
      if (!ready) {
        console.log('  ❌ Pagina niet geladen');
        results.push({ id: test.id, cat: test.cat, input: test.input, pass: false, reason: 'Pagina niet geladen' });
        continue;
      }

      // Capture baseline text length
      const baseline = await getBaseline(page);

      // Send the message
      await sendMessage(page, test.input);

      // Wait for AI to respond (content to grow)
      const responded = await waitForNewContent(page, baseline, 60);
      if (!responded) {
        console.log('  ❌ AI timeout (60s)');
        results.push({ id: test.id, cat: test.cat, input: test.input, pass: false, reason: 'AI timeout' });
        continue;
      }

      // Analyze response
      const response = await analyzeResponse(page);

      // Evaluate results
      let pass = true;
      const details = [];

      // Product 1
      const p1Found = response.foundProducts.includes(test.expectProduct);
      if (p1Found) {
        details.push(`Product: ✅ ${test.expectProduct}`);
      } else {
        pass = false;
        details.push(`Product: ❌ ${test.expectProduct} niet gevonden (wel: ${response.foundProducts.join(', ') || 'geen'})`);
      }

      // Product 2 (tankmix)
      if (test.expectProduct2) {
        const p2Found = response.foundProducts.includes(test.expectProduct2);
        if (p2Found) {
          details.push(`Product 2: ✅ ${test.expectProduct2}`);
        } else {
          pass = false;
          details.push(`Product 2: ❌ ${test.expectProduct2} niet gevonden`);
        }
      }

      // Product 3 (3-product tankmix)
      if (test.expectProduct3) {
        const p3Found = response.foundProducts.includes(test.expectProduct3);
        if (p3Found) {
          details.push(`Product 3: ✅ ${test.expectProduct3}`);
        } else {
          pass = false;
          details.push(`Product 3: ❌ ${test.expectProduct3} niet gevonden`);
        }
      }

      // Parcels
      if (response.hasParcels) {
        details.push(`Percelen: ✅`);
      } else {
        details.push(`Percelen: ⚠️ niet gedetecteerd`);
      }

      // Status
      details.push(`Status: ${response.status}`);

      // Dosages
      if (response.dosages.length > 0) {
        details.push(`Dosering: ${response.dosages.join(', ')}`);
      }

      // Validation warnings
      if (response.nietGevonden) {
        details.push(`⚠️ CTGB: "niet gevonden" (mogelijk broken alias)`);
      }
      if (response.nietToegelaten) {
        details.push(`⚠️ CTGB: "niet toegelaten"`);
      }

      console.log(`  ${pass ? '✅ PASS' : '❌ FAIL'}`);
      details.forEach(d => console.log(`    ${d}`));

      results.push({
        id: test.id, cat: test.cat, input: test.input, pass, details,
        foundProducts: response.foundProducts,
        status: response.status,
        nietGevonden: response.nietGevonden,
        hasParcels: response.hasParcels,
        dosages: response.dosages
      });
    }

    // === FINAL SUMMARY ===
    console.log(`\n\n${'═'.repeat(60)}`);
    console.log('  EINDRESULTATEN');
    console.log(`${'═'.repeat(60)}\n`);

    const categories = [...new Set(TESTS.map(t => t.cat))];
    let totalPass = 0;
    let totalFail = 0;

    for (const cat of categories) {
      const catResults = results.filter(r => r.cat === cat);
      const catPass = catResults.filter(r => r.pass).length;
      const catTotal = catResults.length;
      console.log(`  ${cat.padEnd(20)} ${catPass}/${catTotal} ${catPass === catTotal ? '✅' : '⚠️'}`);
      catResults.forEach(r => {
        const shortInput = r.input.length > 55 ? r.input.substring(0, 55) + '...' : r.input;
        console.log(`    ${r.pass ? '✅' : '❌'} [${r.id}] ${shortInput}`);
        if (!r.pass) {
          (r.details || []).filter(d => d.includes('❌')).forEach(d => console.log(`        ${d}`));
          if (r.reason) console.log(`        ${r.reason}`);
        }
        // Show CTGB warnings even for passing tests
        if (r.nietGevonden) console.log(`        ⚠️ CTGB "niet gevonden" warning`);
      });
      totalPass += catPass;
      totalFail += catTotal - catPass;
    }

    const total = totalPass + totalFail;
    console.log(`\n  ${'─'.repeat(40)}`);
    console.log(`  TOTAAL: ${totalPass}/${total} PASS (${Math.round(totalPass/total*100)}%)`);

    // Summary of issues
    const withNietGevonden = results.filter(r => r.nietGevonden);
    if (withNietGevonden.length > 0) {
      console.log(`\n  ⚠️ ${withNietGevonden.length} tests met CTGB "niet gevonden" warning:`);
      withNietGevonden.forEach(r => console.log(`    - [${r.id}] ${r.foundProducts.join(', ')}`));
    }

    console.log(`\n${'═'.repeat(60)}\n`);

    // Save results
    const { writeFileSync } = require('fs');
    writeFileSync('gwb-test-results-v2.json', JSON.stringify(results, null, 2));
    console.log('  Resultaten opgeslagen: gwb-test-results-v2.json');

  } catch (error) {
    console.error('Test error:', error.message);
    try { await page.screenshot({ path: 'gwb-test-error.png' }); } catch {}
  } finally {
    await browser.close();
  }
})();
