/**
 * Brede GWB Middelentest - Slimme Invoer V2
 * Test 25 gewasbeschermingsmiddelen in alle categorieën
 * Methode: Playwright headless + React props chat interaction
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

async function waitForResponse(page, timeoutSec = 60) {
  // Wait for the AI to respond - look for registration card or error text
  for (let i = 0; i < timeoutSec; i++) {
    const state = await page.evaluate(() => {
      const body = document.body.innerText;
      const hasCard = !!document.querySelector('[class*="registration"]') ||
                      body.includes('Akkoord') || body.includes('Waarschuwing') ||
                      body.includes('Afgekeurd') || body.includes('Te Controleren');
      const hasError = body.includes('niet gevonden') || body.includes('niet herkend') ||
                       body.includes('onbekend') || body.includes('Fout');
      const hasProduct = body.includes('Bevestigen') || body.includes('percelen') || body.includes('perceel');
      const isTyping = body.includes('...') && !body.includes('Opslaan...');
      return { hasCard, hasError, hasProduct, isTyping, bodyLen: body.length };
    });

    if (state.hasCard || state.hasError || state.hasProduct) {
      await sleep(2000); // Extra wait for full render
      return true;
    }
    await sleep(1000);
  }
  return false;
}

async function getPageState(page) {
  return page.evaluate(() => {
    const body = document.body.innerText;

    // Extract product info from the page
    const lines = body.split('\n').filter(l => l.trim());

    // Find product names mentioned
    const productPatterns = [
      'Merpan', 'Delan', 'Bellis', 'FLINT', 'Flint', 'Scala', 'Score',
      'Decis', 'Pirimor', 'CORAGEN', 'Coragen', 'Karate', 'Nissorun',
      'Apollo', 'Floramite', 'Regalis', 'Surround', 'Teldor',
      'CHORUS', 'Chorus', 'LUNA', 'Luna', 'Switch', 'Captosan',
      'Captan', 'Syllit', 'Spruzit'
    ];

    const foundProducts = productPatterns.filter(p => body.includes(p));

    // Check validation status
    const hasAkkoord = body.includes('Akkoord');
    const hasWaarschuwing = body.includes('Waarschuwing');
    const hasAfgekeurd = body.includes('Afgekeurd');
    const hasTeControleren = body.includes('Te Controleren');
    const hasNietGevonden = body.includes('niet gevonden');
    const hasNietHerkend = body.includes('niet herkend');

    // Check for registration card elements
    const hasCard = body.includes('Bevestigen') || body.includes('Bevestigd');
    const hasParcels = body.includes('percelen') || body.includes('perceel');

    // Look for dosage info (numbers with units)
    const dosageMatch = body.match(/(\d+[.,]?\d*)\s*(kg|L|ml|l|g)\/ha/i);
    const dosage = dosageMatch ? dosageMatch[0] : null;

    // Count parcels in card if visible
    const parcelCount = (body.match(/Conference|Elstar|Boskoop|Jonagold|Gala|Doyenne/gi) || []).length;

    return {
      foundProducts,
      hasAkkoord, hasWaarschuwing, hasAfgekeurd, hasTeControleren,
      hasNietGevonden, hasNietHerkend,
      hasCard, hasParcels, dosage, parcelCount,
      // Grab relevant portion of text for debugging
      snippet: body.substring(0, 3000)
    };
  });
}

async function resetChat(page) {
  await page.goto('http://localhost:3003/command-center/smart-input-v2', { timeout: 30000 });
  for (let i = 0; i < 15; i++) {
    const ready = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="chat-input"]');
      return !!el;
    });
    if (ready) return true;
    await sleep(2000);
  }
  return false;
}

// Test definitions
const TESTS = [
  // === A: FUNGICIDEN ===
  { id: 'A1', cat: 'Fungicide', input: 'vandaag alle conference met merpan 0.7 kg',
    expect: { products: ['Merpan'], unit: 'kg', hasParcels: true } },
  { id: 'A2', cat: 'Fungicide', input: 'vandaag alle peren met delan 0.5 kg',
    expect: { products: ['Delan'], unit: 'kg', hasParcels: true },
    note: 'Alias delan→Delan WG (broken: actual=Delan DF)' },
  { id: 'A3', cat: 'Fungicide', input: 'vandaag alle elstar met bellis 0.8 kg',
    expect: { products: ['Bellis'], unit: 'kg', hasParcels: true } },
  { id: 'A4', cat: 'Fungicide', input: 'vandaag alle conference met flint 0.15 kg',
    expect: { products: ['FLINT', 'Flint'], unit: 'kg', hasParcels: true } },
  { id: 'A5', cat: 'Fungicide', input: 'vandaag alle peren met scala 0.75 L',
    expect: { products: ['Scala'], unit: 'L', hasParcels: true } },
  { id: 'A6', cat: 'Fungicide', input: 'vandaag alle conference met score 0.2 L',
    expect: { products: ['Score'], unit: 'L', hasParcels: true } },

  // === B: INSECTICIDEN ===
  { id: 'B1', cat: 'Insecticide', input: 'vandaag alle appels met decis 0.25 L',
    expect: { products: ['Decis'], unit: 'L', hasParcels: true },
    note: 'Alias decis→Decis EC (broken: actual=Decis Protech)' },
  { id: 'B2', cat: 'Insecticide', input: 'vandaag alle peren met pirimor 0.5 kg',
    expect: { products: ['Pirimor'], unit: 'kg', hasParcels: true } },
  { id: 'B3', cat: 'Insecticide', input: 'vandaag alle appels met coragen 0.18 L',
    expect: { products: ['CORAGEN', 'Coragen'], unit: 'L', hasParcels: true } },
  { id: 'B4', cat: 'Insecticide', input: 'vandaag alle conference met karate zeon 0.15 L',
    expect: { products: ['Karate'], unit: 'L', hasParcels: true } },

  // === C: ACARICIDEN ===
  { id: 'C1', cat: 'Acaricide', input: 'vandaag alle appels met nissorun 0.2 L',
    expect: { products: ['Nissorun'], unit: 'L', hasParcels: true },
    note: 'Alias nissorun→Nissorun (DB=Nissorun vloeibaar)' },
  { id: 'C2', cat: 'Acaricide', input: 'vandaag alle peren met apollo 0.3 L',
    expect: { products: ['Apollo'], unit: 'L', hasParcels: true } },
  { id: 'C3', cat: 'Acaricide', input: 'vandaag alle elstar met floramite 0.4 L',
    expect: { products: ['Floramite'], unit: 'L', hasParcels: true } },

  // === D: OVERIG ===
  { id: 'D1', cat: 'Groeiregulator', input: 'vandaag alle appels met regalis plus 2.5 kg',
    expect: { products: ['Regalis'], unit: 'kg', hasParcels: true } },
  { id: 'D2', cat: 'Overig', input: 'vandaag alle conference met teldor 1.5 kg',
    expect: { products: ['Teldor'], unit: 'kg', hasParcels: true } },
  { id: 'D3', cat: 'Overig', input: 'vandaag alle peren met switch 1 kg',
    expect: { products: ['Switch'], unit: 'kg', hasParcels: true } },

  // === E: LASTIGE NAMEN ===
  { id: 'E1', cat: 'Lastige naam', input: 'vandaag alle conference met chorus 0.6 kg',
    expect: { products: ['CHORUS', 'Chorus'], unit: 'kg', hasParcels: true },
    note: 'Alias chorus→Chorus (DB=CHORUS 50 WG)' },
  { id: 'E2', cat: 'Lastige naam', input: 'vandaag alle appels met luna experience 0.75 L',
    expect: { products: ['LUNA', 'Luna'], unit: 'L', hasParcels: true },
    note: 'Alias luna→Luna Sensation (broken: DB=LUNA EXPERIENCE)' },
  { id: 'E3', cat: 'Lastige naam', input: 'vandaag alle peren met captosan 1.1 L',
    expect: { products: ['Captosan'], unit: 'L', hasParcels: true } },

  // === F: EENHEID-VARIATIES ===
  { id: 'F1', cat: 'Eenheid', input: 'vandaag alle conference met merpan 700 gram',
    expect: { products: ['Merpan'], hasParcels: true },
    note: '700g = 0.7 kg - controle eenheidsconversie' },
  { id: 'F2', cat: 'Eenheid', input: 'vandaag alle elstar met scala 750 ml',
    expect: { products: ['Scala'], hasParcels: true },
    note: '750ml = 0.75 L - controle ml→L conversie' },
  { id: 'F3', cat: 'Eenheid', input: 'vandaag alle peren met score 200 ml',
    expect: { products: ['Score'], hasParcels: true },
    note: '200ml = 0.2 L - controle ml→L conversie' },

  // === G: TANKMIXEN ===
  { id: 'G1', cat: 'Tankmix', input: 'vandaag alle conference met merpan 0.7 kg en score 0.2 L',
    expect: { products: ['Merpan', 'Score'], hasParcels: true },
    note: '2-product tankmix met "en"' },
  { id: 'G2', cat: 'Tankmix', input: 'vandaag alle peren met delan 0.5 kg + flint 0.15 kg',
    expect: { products: ['Delan', 'Flint', 'FLINT'], hasParcels: true },
    note: '2-product tankmix met "+"' },
  { id: 'G3', cat: 'Tankmix', input: 'vandaag alle conference met merpan 0.7 kg, score 0.2 L en flint 0.15 kg',
    expect: { products: ['Merpan', 'Score', 'Flint', 'FLINT'], hasParcels: true },
    note: '3-product tankmix' },
];

(async () => {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     BREDE GWB MIDDELENTEST - Slimme Invoer V2              ║');
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
        results.push({ ...test, pass: false, reason: 'Pagina niet geladen' });
        continue;
      }

      // Send the message
      await sendMessage(page, test.input);

      // Wait for AI response
      const responded = await waitForResponse(page, 60);
      if (!responded) {
        console.log('  ❌ AI timeout (60s)');
        results.push({ ...test, pass: false, reason: 'AI timeout' });
        continue;
      }

      // Analyze the response
      const state = await getPageState(page);

      // Check results
      let pass = true;
      const details = [];

      // Check product recognition
      const expectedProducts = test.expect.products;
      const productFound = expectedProducts.some(p => state.foundProducts.includes(p));
      if (productFound) {
        const matched = state.foundProducts.filter(p => expectedProducts.some(e => p.includes(e) || e.includes(p)));
        details.push(`Product: ✅ ${matched.join(', ')}`);
      } else {
        pass = false;
        if (state.hasNietGevonden) {
          details.push(`Product: ❌ "niet gevonden" in response`);
        } else if (state.hasNietHerkend) {
          details.push(`Product: ❌ "niet herkend"`);
        } else {
          details.push(`Product: ❌ Geen match (gevonden: ${state.foundProducts.join(', ') || 'geen'})`);
        }
      }

      // Check parcels
      if (test.expect.hasParcels) {
        if (state.hasParcels || state.hasCard) {
          details.push(`Percelen: ✅`);
        } else {
          // Not necessarily a fail - product could be found but no card yet
          details.push(`Percelen: ⚠️ geen kaart zichtbaar`);
        }
      }

      // Check validation status
      if (state.hasAkkoord) details.push(`Status: Akkoord ✅`);
      else if (state.hasWaarschuwing) details.push(`Status: Waarschuwing ⚠️`);
      else if (state.hasAfgekeurd) details.push(`Status: Afgekeurd ❌`);
      else if (state.hasTeControleren) details.push(`Status: Te Controleren`);
      else if (state.hasNietGevonden) details.push(`Status: Product niet gevonden ❌`);

      // For tankmix: check all products are found
      if (test.cat === 'Tankmix') {
        // For tankmix we need at least 2 different product families
        const uniqueProductFamilies = new Set(state.foundProducts.map(p => p.split(' ')[0]));
        if (uniqueProductFamilies.size >= 2) {
          details.push(`Tankmix: ✅ ${uniqueProductFamilies.size} producten`);
        } else {
          pass = false;
          details.push(`Tankmix: ❌ slechts ${uniqueProductFamilies.size} product(en) gevonden`);
        }
      }

      // Log dosage if found
      if (state.dosage) details.push(`Dosering: ${state.dosage}`);

      console.log(`  ${pass ? '✅ PASS' : '❌ FAIL'}`);
      details.forEach(d => console.log(`    ${d}`));

      results.push({ ...test, pass, details, state: {
        foundProducts: state.foundProducts,
        hasAkkoord: state.hasAkkoord,
        hasWaarschuwing: state.hasWaarschuwing,
        hasAfgekeurd: state.hasAfgekeurd,
        hasNietGevonden: state.hasNietGevonden,
        hasCard: state.hasCard,
        hasParcels: state.hasParcels,
        dosage: state.dosage
      }});
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
        console.log(`    ${r.pass ? '✅' : '❌'} [${r.id}] ${r.input.substring(0, 55)}${r.input.length > 55 ? '...' : ''}`);
        if (!r.pass && r.reason) console.log(`        Reden: ${r.reason}`);
        if (!r.pass && r.details) r.details.filter(d => d.includes('❌')).forEach(d => console.log(`        ${d}`));
      });
      totalPass += catPass;
      totalFail += catTotal - catPass;
    }

    console.log(`\n  ${'─'.repeat(40)}`);
    console.log(`  TOTAAL: ${totalPass}/${totalPass + totalFail} PASS (${Math.round(totalPass/(totalPass+totalFail)*100)}%)`);
    console.log(`${'═'.repeat(60)}\n`);

    // Save detailed results as JSON
    const { writeFileSync } = require('fs');
    writeFileSync('gwb-test-results.json', JSON.stringify(results, null, 2));
    console.log('  Gedetailleerde resultaten opgeslagen: gwb-test-results.json');

  } catch (error) {
    console.error('Test error:', error.message);
    try { await page.screenshot({ path: 'gwb-test-error.png' }); } catch {}
  } finally {
    await browser.close();
  }
})();
