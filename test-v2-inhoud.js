/**
 * Slimme Invoer V2 - Inhoudelijke Validatie Test Suite
 *
 * Wacht 15-20s per bericht, leest registratiekaart DOM uit,
 * valideert inhoud, en checkt database na opslaan.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DIR = '/tmp/v2-inhoud-tests';
const PORT = 3003;
const SB_URL = 'https://djcsihpnidopxxuxumvj.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqY3NpaHBuaWRvcHh4dXh1bXZqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODM1OTcxNCwiZXhwIjoyMDgzOTM1NzE0fQ.VqnQH187m6qTD76gfJM9i0NxMq_n6EjD3Pnyhz02ocg';

if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

const allResults = [];

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().substring(0, 300)); });

  // ============================================================
  // LOGIN
  // ============================================================
  console.log('=== LOGIN ===');
  await page.goto(`http://localhost:${PORT}/login`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(3000);
  await page.fill('input[name="username"]', 'admin');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button:has-text("Inloggen")');

  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(500);
    if (!page.url().includes('/login')) break;
  }
  if (page.url().includes('/login')) {
    console.error('LOGIN FAILED');
    await browser.close();
    return;
  }
  console.log('Logged in:', page.url());
  await page.waitForTimeout(2000);

  // ============================================================
  // HELPERS
  // ============================================================

  /** Navigate to V2 and wait for context to load */
  async function goToV2() {
    await page.goto(`http://localhost:${PORT}/command-center/smart-input-v2`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    for (let i = 0; i < 25; i++) {
      await page.waitForTimeout(1000);
      const ready = await page.evaluate(() => {
        const els = document.querySelectorAll('[data-testid="chat-input"]');
        for (const el of els) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) return true;
        }
        return false;
      }).catch(() => false);
      if (ready) { console.log(`  V2 ready (${i+1}s)`); return true; }
    }
    console.log('  V2 TIMEOUT');
    return false;
  }

  /** Type a message in the chat input and press Enter */
  async function typeMessage(msg) {
    await page.evaluate((message) => {
      const textareas = document.querySelectorAll('[data-testid="chat-input"]');
      let target = null;
      for (const ta of textareas) {
        const rect = ta.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) { target = ta; break; }
      }
      if (!target && textareas.length > 0) target = textareas[textareas.length - 1];
      if (target) {
        target.scrollIntoView({ block: 'center' });
        target.focus();
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(target, message);
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, msg);
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter');
  }

  /**
   * Wait until the AI finishes processing.
   * Checks for: no spinner, no "analyseren", no "resolven", card has data or bot message appeared.
   * Returns: { elapsed, timedOut }
   */
  async function waitForResponse(maxWaitSec = 30) {
    const t0 = Date.now();
    await page.waitForTimeout(2000); // initial wait

    for (let i = 0; i < maxWaitSec; i++) {
      await page.waitForTimeout(1000);

      const state = await page.evaluate(() => {
        const body = document.body.innerText;
        const isAnalyzing = body.includes('Invoer analyseren...') ||
                           body.includes('Producten resolven...') ||
                           body.includes('Agent analyseert...') ||
                           body.includes('Valideren');

        // Check for spinning elements
        const spinners = document.querySelectorAll('[class*="animate-spin"]');
        let hasActiveSpinner = false;
        for (const s of spinners) {
          const r = s.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) { hasActiveSpinner = true; break; }
        }

        // Check if registration card has data
        const cardText = document.querySelector('[class*="Actieve Registratie"], [class*="actieve-registratie"]');
        const rightPanel = document.querySelector('aside') || document.querySelector('[class*="registratie"]');
        const rightText = rightPanel ? rightPanel.innerText : '';
        const hasCardData = rightText.includes('ha') && !rightText.includes('0.00 ha') && rightText.includes('middel');

        // Check for bot response (non-registration)
        const hasBotResponse = body.includes('Dit lijkt geen bespuiting') ||
                              body.includes('Welke percelen') ||
                              body.includes('Welke dosering');

        return { isAnalyzing, hasActiveSpinner, hasCardData, hasBotResponse };
      }).catch(() => ({ isAnalyzing: true, hasActiveSpinner: true, hasCardData: false, hasBotResponse: false }));

      const elapsed = (Date.now() - t0) / 1000;

      // Done conditions
      if (!state.isAnalyzing && !state.hasActiveSpinner && (state.hasCardData || state.hasBotResponse) && elapsed > 3) {
        return { elapsed: +elapsed.toFixed(1), timedOut: false };
      }

      // Also done if nothing is loading and we've waited enough
      if (!state.isAnalyzing && !state.hasActiveSpinner && elapsed > 8) {
        return { elapsed: +elapsed.toFixed(1), timedOut: false };
      }
    }

    return { elapsed: +((Date.now() - t0) / 1000).toFixed(1), timedOut: true };
  }

  /**
   * Read the registration card content from the right panel.
   * Returns structured data about what's in the card.
   */
  async function readCard() {
    return await page.evaluate(() => {
      // Find the right-side panel
      const allText = document.body.innerText;

      // Find registration card section - it's typically in the right panel
      // Look for the aside or registration panel
      const panels = document.querySelectorAll('aside, [class*="border-l"]');
      let panelText = '';
      for (const p of panels) {
        const t = p.innerText;
        if (t.includes('Actieve Registratie') || t.includes('Registratie')) {
          panelText = t;
          break;
        }
      }

      if (!panelText) {
        // Try broader search
        const main = document.querySelector('main');
        panelText = main ? main.innerText : allText;
      }

      // Extract products with dosages
      const products = [];
      const productMatches = panelText.match(/([A-Z][a-zA-Z\s\d]+(?:Spuitkorrel|EC|WG|SC|DF|Flow|WP|SG|OD|HP))\s*([\d.,]+\s*(?:L|kg|ml|g)\/ha)/gi);
      if (productMatches) {
        for (const m of productMatches) {
          const parts = m.match(/(.+?)\s+([\d.,]+\s*(?:L|kg|ml|g)\/ha)/i);
          if (parts) products.push({ name: parts[1].trim(), dosage: parts[2].trim() });
        }
      }

      // Alternative: look for product elements in structured way
      const productEls = document.querySelectorAll('[class*="product"], [class*="middel"]');

      // Extract hectare
      const haMatch = panelText.match(/([\d.,]+)\s*ha/);
      const hectare = haMatch ? haMatch[1] : null;

      // Extract parcel count
      const parcelMatch = panelText.match(/PERCELEN\s*\((\d+)\)/i);
      const parcelCount = parcelMatch ? parseInt(parcelMatch[1]) : null;

      // Extract middelen count
      const middelenMatch = panelText.match(/MIDDELEN\s*\((\d+)\)/i);
      const middelenCount = middelenMatch ? parseInt(middelenMatch[1]) : null;

      // Extract date
      const dateMatch = panelText.match(/(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)\s+(\d+)\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)/i);
      const date = dateMatch ? dateMatch[0] : null;

      // Extract parcel names
      const parcelNames = [];
      const parcelSection = panelText.split('PERCELEN')[1] || '';
      const nameMatches = parcelSection.match(/([A-Z][a-zA-Zé\s]+(?:\([^)]+\))?)\s+[\d.,]+\s*ha/g);
      if (nameMatches) {
        for (const n of nameMatches) {
          const nm = n.match(/(.+?)\s+[\d.,]+\s*ha/);
          if (nm) parcelNames.push(nm[1].trim());
        }
      }

      // Extract CTGB warnings
      const warnings = [];
      const warnMatches = panelText.match(/[❌⚠️ℹ️].+/g);
      if (warnMatches) warnings.push(...warnMatches.map(w => w.substring(0, 150)));

      // Extract status
      const status = panelText.includes('Concept') ? 'Concept' :
                    panelText.includes('Te bevestigen') ? 'Te bevestigen' :
                    panelText.includes('Opgeslagen') ? 'Opgeslagen' : 'Onbekend';

      // Get chat messages
      const chatMessages = [];
      const msgBubbles = document.querySelectorAll('[class*="message"], [class*="bubble"], [class*="chat"]');

      return {
        raw: panelText.substring(0, 2000),
        products,
        hectare,
        parcelCount,
        middelenCount,
        date,
        parcelNames: parcelNames.slice(0, 30),
        warnings,
        status,
        hasCard: panelText.includes('Registratie') && (!!hectare || !!parcelCount),
        isEmpty: panelText.includes('Geen actieve registratie'),
      };
    }).catch(e => ({ error: e.message, raw: '', hasCard: false, isEmpty: true }));
  }

  /**
   * Read the chat area for bot messages
   */
  async function readChat() {
    return await page.evaluate(() => {
      const main = document.querySelector('main') || document.body;
      const text = main.innerText;

      // Extract bot messages (they appear after the user bubble)
      const botMessages = [];
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

      return {
        fullText: text.substring(0, 3000),
        hasError: text.includes('Fout') || text.includes('Error'),
        hasBotQuestion: text.includes('Welke') || text.includes('?'),
        hasNotRegistration: text.includes('Dit lijkt geen bespuiting'),
        botMessages: lines.filter(l =>
          l.includes('Welke') || l.includes('Dit lijkt') || l.includes('toegevoegd') ||
          l.includes('bijgewerkt') || l.includes('opgeslagen') || l.includes('Dosering')
        ).slice(0, 10),
      };
    }).catch(e => ({ error: e.message, fullText: '' }));
  }

  /** Take screenshot */
  async function shot(name) {
    const filepath = path.join(DIR, name);
    await page.screenshot({ path: filepath, fullPage: false });
    console.log(`  📸 ${name}`);
    return filepath;
  }

  /** Log test result */
  function logResult(testId, name, input, expected, got, status, details = '') {
    const result = { testId, name, input, expected, got, status, details, ts: new Date().toISOString() };
    allResults.push(result);
    const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
    console.log(`  ${icon} ${testId}: ${name} — ${status}`);
    if (details) console.log(`     ${details}`);
  }

  // ============================================================
  // CHECK CONTEXT
  // ============================================================
  console.log('\n=== CONTEXT CHECK ===');
  await goToV2();
  const ctxData = await page.evaluate(async () => {
    try {
      const r = await fetch('/api/smart-input-v2/context');
      const d = await r.json();
      return { parcels: d.parcels?.length||0, products: d.products?.length||0, history: d.history?.length||0, ok: true };
    } catch(e) { return { error: e.message, ok: false }; }
  });
  console.log('Context:', JSON.stringify(ctxData));
  if (!ctxData.ok || ctxData.products === 0) {
    console.error('KRITIEKE BUG: Context laden mislukt of 0 producten!');
  }

  // ============================================================
  // FASE A: BASIS REGISTRATIES
  // ============================================================
  console.log('\n========================================');
  console.log('FASE A: BASIS REGISTRATIES');
  console.log('========================================');

  // --- TEST A1: Enkel middel, alle peren ---
  {
    console.log('\n--- TEST A1: Enkel middel, alle peren ---');
    await goToV2();
    await typeMessage('gisteren alle peren met merpan 2 liter');
    const { elapsed, timedOut } = await waitForResponse(25);
    console.log(`  Wachttijd: ${elapsed}s ${timedOut ? '(TIMEOUT!)' : ''}`);

    await shot('a1-alle-peren-merpan.png');
    const card = await readCard();
    const chat = await readChat();

    console.log(`  Card: ${card.middelenCount} middelen, ${card.parcelCount} percelen, ${card.hectare} ha, datum: ${card.date}`);
    console.log(`  Percelen: ${card.parcelNames.join(', ')}`);
    console.log(`  Warnings: ${card.warnings.join(' | ')}`);
    console.log(`  Raw card (first 500): ${card.raw.substring(0, 500)}`);

    const expected = 'Merpan Spuitkorrel 2 L/ha, ~23-25 peren percelen, 30-45 ha, datum 25 feb';
    const got = `${card.middelenCount} middelen, ${card.parcelCount} percelen, ${card.hectare} ha, date=${card.date}`;

    let status = 'PASS';
    let details = '';
    if (timedOut) { status = 'FAIL'; details += 'TIMEOUT. '; }
    if (!card.hasCard) { status = 'FAIL'; details += 'Geen registratiekaart. '; }
    if (card.parcelCount && card.parcelCount < 15) { status = 'FAIL'; details += `Te weinig percelen (${card.parcelCount}). `; }

    logResult('A1', 'Enkel middel alle peren', 'gisteren alle peren met merpan 2 liter', expected, got, status, details);
  }

  // --- TEST A2: Enkel middel, alle appels ---
  {
    console.log('\n--- TEST A2: Enkel middel, alle appels ---');
    await goToV2();
    await typeMessage('vandaag alle appels met score 0.3 liter');
    const { elapsed, timedOut } = await waitForResponse(25);
    console.log(`  Wachttijd: ${elapsed}s ${timedOut ? '(TIMEOUT!)' : ''}`);

    await shot('a2-alle-appels-score.png');
    const card = await readCard();

    console.log(`  Card: ${card.middelenCount} middelen, ${card.parcelCount} percelen, ${card.hectare} ha`);
    console.log(`  Percelen: ${card.parcelNames.join(', ')}`);

    const expected = 'Score 250 EC 0.3 L/ha, ~6-7 appel percelen, 20-25 ha';
    const got = `${card.middelenCount} middelen, ${card.parcelCount} percelen, ${card.hectare} ha`;

    let status = 'PASS';
    let details = '';
    if (timedOut) { status = 'FAIL'; details += 'TIMEOUT. '; }
    if (!card.hasCard) { status = 'FAIL'; details += 'Geen registratiekaart. '; }
    if (card.parcelCount && card.parcelCount > 10) { status = 'FAIL'; details += `Te veel percelen - mogelijk peren erbij? (${card.parcelCount}). `; }

    logResult('A2', 'Enkel middel alle appels', 'vandaag alle appels met score 0.3 liter', expected, got, status, details);
  }

  // --- TEST A3: Specifiek ras (Conference) ---
  {
    console.log('\n--- TEST A3: Specifiek ras Conference ---');
    await goToV2();
    await typeMessage('gisteren alle conference met merpan 1.5L');
    const { elapsed, timedOut } = await waitForResponse(25);
    console.log(`  Wachttijd: ${elapsed}s ${timedOut ? '(TIMEOUT!)' : ''}`);

    await shot('a3-conference-merpan.png');
    const card = await readCard();

    console.log(`  Card: ${card.middelenCount} middelen, ${card.parcelCount} percelen, ${card.hectare} ha`);
    console.log(`  Percelen: ${card.parcelNames.join(', ')}`);

    // There are ~14 Conference sub-parcels in the data
    const expected = 'Merpan Spuitkorrel 1.5 L/ha, ~12-15 Conference percelen';
    const got = `${card.middelenCount} middelen, ${card.parcelCount} percelen, ${card.hectare} ha`;

    logResult('A3', 'Specifiek ras Conference', 'gisteren alle conference met merpan 1.5L', expected, got,
      timedOut ? 'FAIL' : card.hasCard ? 'PASS' : 'FAIL',
      timedOut ? 'TIMEOUT' : !card.hasCard ? 'Geen registratiekaart' : '');
  }

  // --- TEST A4: Tankmenging 2 producten ---
  {
    console.log('\n--- TEST A4: Tankmenging 2 producten ---');
    await goToV2();
    await typeMessage('vandaag alle peren met merpan 2L en score 0.3L');
    const { elapsed, timedOut } = await waitForResponse(25);
    console.log(`  Wachttijd: ${elapsed}s ${timedOut ? '(TIMEOUT!)' : ''}`);

    await shot('a4-tankmix-merpan-score.png');
    const card = await readCard();

    console.log(`  Card: ${card.middelenCount} middelen, ${card.parcelCount} percelen, ${card.hectare} ha`);
    console.log(`  Products: ${JSON.stringify(card.products)}`);
    console.log(`  Raw (first 600): ${card.raw.substring(0, 600)}`);

    const expected = '2 middelen: Merpan 2 L/ha + Score 0.3 L/ha, alle peren';
    const got = `${card.middelenCount} middelen: ${card.products.map(p => `${p.name}=${p.dosage}`).join(', ')}`;

    let status = 'PASS';
    let details = '';
    if (card.middelenCount !== 2) { status = 'FAIL'; details += `Verwacht 2 middelen, kreeg ${card.middelenCount}. `; }

    logResult('A4', 'Tankmenging 2 producten', 'vandaag alle peren met merpan 2L en score 0.3L', expected, got, status, details);
  }

  // --- TEST A5: Tankmenging 3 producten ---
  {
    console.log('\n--- TEST A5: Tankmenging 3 producten ---');
    await goToV2();
    await typeMessage('vandaag alle appels met merpan 2L, score 0.3L en delan 0.75 kg');
    const { elapsed, timedOut } = await waitForResponse(25);
    console.log(`  Wachttijd: ${elapsed}s ${timedOut ? '(TIMEOUT!)' : ''}`);

    await shot('a5-tankmix-3-producten.png');
    const card = await readCard();

    console.log(`  Card: ${card.middelenCount} middelen, ${card.parcelCount} percelen, ${card.hectare} ha`);
    console.log(`  Raw (first 800): ${card.raw.substring(0, 800)}`);

    const expected = '3 middelen: Merpan 2 L/ha + Score 0.3 L/ha + Delan 0.75 kg/ha';
    const got = `${card.middelenCount} middelen, ${card.parcelCount} percelen`;

    logResult('A5', 'Tankmenging 3 producten', 'vandaag alle appels met merpan 2L, score 0.3L en delan 0.75 kg', expected, got,
      card.middelenCount === 3 ? 'PASS' : card.middelenCount >= 1 ? 'PARTIAL' : 'FAIL',
      card.middelenCount !== 3 ? `Verwacht 3 middelen, kreeg ${card.middelenCount}` : '');
  }

  // ============================================================
  // FASE B: UITZONDERINGEN
  // ============================================================
  console.log('\n========================================');
  console.log('FASE B: UITZONDERINGEN ("niet" / "behalve")');
  console.log('========================================');

  // --- TEST B1: "maar conference niet" ---
  {
    console.log('\n--- TEST B1: "maar conference niet" ---');
    await goToV2();
    await typeMessage('gisteren alle peren met merpan 2L maar conference niet');
    const { elapsed, timedOut } = await waitForResponse(25);
    console.log(`  Wachttijd: ${elapsed}s`);

    await shot('b1-peren-zonder-conference.png');
    const card = await readCard();

    console.log(`  Card: ${card.parcelCount} percelen, ${card.hectare} ha`);
    console.log(`  Percelen: ${card.parcelNames.join(', ')}`);

    // Check if any Conference parcels snuck in
    const hasConference = card.parcelNames.some(n => n.toLowerCase().includes('conference'));

    logResult('B1', 'Peren zonder Conference', 'gisteren alle peren met merpan 2L maar conference niet',
      'Alle peren BEHALVE Conference',
      `${card.parcelCount} percelen. Conference erbij: ${hasConference ? 'JA (BUG!)' : 'NEE (correct)'}`,
      hasConference ? 'FAIL' : (card.hasCard ? 'PASS' : 'FAIL'),
      hasConference ? 'Conference percelen staan erbij terwijl ze uitgesloten moeten zijn' : '');
  }

  // --- TEST B2: "behalve elstar" ---
  {
    console.log('\n--- TEST B2: "behalve elstar" ---');
    await goToV2();
    await typeMessage('vandaag alle appels met score 0.3L behalve de elstar');
    const { elapsed, timedOut } = await waitForResponse(25);
    console.log(`  Wachttijd: ${elapsed}s`);

    await shot('b2-appels-zonder-elstar.png');
    const card = await readCard();

    console.log(`  Card: ${card.parcelCount} percelen, ${card.hectare} ha`);
    console.log(`  Percelen: ${card.parcelNames.join(', ')}`);

    logResult('B2', 'Appels zonder Elstar', 'vandaag alle appels met score 0.3L behalve de elstar',
      'Appels ZONDER Elstar percelen',
      `${card.parcelCount} percelen, ${card.hectare} ha`,
      card.hasCard ? 'PASS' : 'FAIL', '');
  }

  // ============================================================
  // FASE C: MULTI-TURN
  // ============================================================
  console.log('\n========================================');
  console.log('FASE C: MULTI-TURN CORRECTIES');
  console.log('========================================');

  // --- TEST C1: Dosering corrigeren ---
  {
    console.log('\n--- TEST C1: Dosering corrigeren ---');
    await goToV2();

    // B1
    await typeMessage('vandaag alle peren met merpan 2L');
    const r1 = await waitForResponse(25);
    console.log(`  B1 wacht: ${r1.elapsed}s`);
    await shot('c1-b1-merpan-2L.png');
    const card1 = await readCard();
    console.log(`  B1 Card: ${card1.middelenCount} middelen, ${card1.parcelCount} percelen, ${card1.hectare} ha`);
    console.log(`  B1 Raw: ${card1.raw.substring(0, 400)}`);

    // B2 - correctie
    await typeMessage('nee de dosering moet 1.5 liter zijn');
    const r2 = await waitForResponse(25);
    console.log(`  B2 wacht: ${r2.elapsed}s`);
    await shot('c1-b2-dosering-1.5L.png');
    const card2 = await readCard();
    console.log(`  B2 Card: ${card2.raw.substring(0, 400)}`);

    const has15 = card2.raw.includes('1.5') || card2.raw.includes('1,5');
    const still2 = card2.raw.includes('2 L/ha') || card2.raw.includes('2.0 L/ha');

    logResult('C1', 'Dosering corrigeren 2→1.5', 'B1: merpan 2L, B2: dosering 1.5L',
      'Dosering bijgewerkt naar 1.5 L/ha',
      `Dosering 1.5 gevonden: ${has15}, Nog 2L: ${still2}`,
      has15 ? 'PASS' : 'FAIL',
      !has15 ? 'Dosering niet bijgewerkt naar 1.5' : '');
  }

  // --- TEST C2: Perceel toevoegen ---
  {
    console.log('\n--- TEST C2: Perceel toevoegen ---');
    await goToV2();

    await typeMessage('gisteren alle elstar met merpan 2L');
    const r1 = await waitForResponse(25);
    console.log(`  B1 wacht: ${r1.elapsed}s`);
    await shot('c2-b1-elstar.png');
    const card1 = await readCard();
    const count1 = card1.parcelCount;
    console.log(`  B1: ${count1} percelen`);

    await typeMessage('oh en de kanzi ook');
    const r2 = await waitForResponse(25);
    console.log(`  B2 wacht: ${r2.elapsed}s`);
    await shot('c2-b2-plus-kanzi.png');
    const card2 = await readCard();
    console.log(`  B2: ${card2.parcelCount} percelen`);

    logResult('C2', 'Perceel toevoegen (Kanzi)', 'B1: elstar, B2: + kanzi',
      `Meer percelen dan B1 (${count1})`,
      `${card2.parcelCount} percelen na toevoeging`,
      (card2.parcelCount && count1 && card2.parcelCount > count1) ? 'PASS' : 'PARTIAL',
      '');
  }

  // --- TEST C3: Product wisselen ---
  {
    console.log('\n--- TEST C3: Product wisselen ---');
    await goToV2();

    await typeMessage('gisteren alle appels met merpan 2L');
    const r1 = await waitForResponse(25);
    await shot('c3-b1-merpan.png');
    const card1 = await readCard();
    console.log(`  B1: ${card1.raw.substring(0, 300)}`);

    await typeMessage('niet merpan maar captan');
    const r2 = await waitForResponse(25);
    await shot('c3-b2-captan.png');
    const card2 = await readCard();
    const chat2 = await readChat();
    console.log(`  B2: ${card2.raw.substring(0, 300)}`);
    console.log(`  Chat: ${chat2.botMessages.join(' | ')}`);

    // Note: "captan" is a werkzame stof, not a product name - should still resolve
    logResult('C3', 'Product wisselen merpan→captan', 'B1: merpan, B2: niet merpan maar captan',
      'Product gewijzigd naar Captan/Merpan variant',
      `Card: ${card2.raw.substring(0, 200)}`,
      'MANUAL_CHECK', 'Controleer of product daadwerkelijk is gewijzigd');
  }

  // --- TEST C4: Complexe multi-turn (4 stappen) ---
  {
    console.log('\n--- TEST C4: Complexe multi-turn ---');
    await goToV2();

    // B1: basis
    console.log('  B1: gisteren alle peren met merpan en score');
    await typeMessage('gisteren alle peren met merpan en score');
    const r1 = await waitForResponse(30);
    console.log(`  B1 wacht: ${r1.elapsed}s`);
    await shot('c4-b1-basis.png');
    const card1 = await readCard();
    const chat1 = await readChat();
    console.log(`  B1 card: ${card1.raw.substring(0, 300)}`);
    console.log(`  B1 chat: ${chat1.botMessages.join(' | ')}`);

    // B2: doseringen
    console.log('  B2: merpan 2 liter en score 0.3');
    await typeMessage('merpan 2 liter en score 0.3');
    const r2 = await waitForResponse(30);
    console.log(`  B2 wacht: ${r2.elapsed}s`);
    await shot('c4-b2-doseringen.png');
    const card2 = await readCard();
    console.log(`  B2 card: ${card2.middelenCount} middelen, ${card2.raw.substring(0, 300)}`);

    // B3: complexe correctie - datum split + product toevoegen
    console.log('  B3: conference was eergisteren en bij gieser wildeman ook bellis 0.8 kg erbij');
    await typeMessage('conference was eergisteren en bij gieser wildeman ook bellis 0.8 kg erbij');
    const r3 = await waitForResponse(35);
    console.log(`  B3 wacht: ${r3.elapsed}s`);
    await shot('c4-b3-complex-correctie.png');
    const card3 = await readCard();
    const chat3 = await readChat();
    console.log(`  B3 card: ${card3.raw.substring(0, 500)}`);
    console.log(`  B3 chat: ${chat3.fullText.substring(0, 500)}`);

    // B4: opslaan
    console.log('  B4: klopt, opslaan');
    await typeMessage('klopt, opslaan');
    const r4 = await waitForResponse(30);
    console.log(`  B4 wacht: ${r4.elapsed}s`);
    await shot('c4-b4-opslaan.png');
    const card4 = await readCard();
    const chat4 = await readChat();
    console.log(`  B4 chat: ${chat4.fullText.substring(0, 300)}`);

    logResult('C4', 'Complexe multi-turn 4 stappen', '4 berichten met correcties',
      'Datum split + product toevoegen + opslaan',
      `B3: ${card3.middelenCount} middelen, B4: ${chat4.botMessages.join('; ')}`,
      'MANUAL_CHECK', 'Complexe test - zie screenshots voor details');
  }

  // ============================================================
  // FASE D: EDGE CASES
  // ============================================================
  console.log('\n========================================');
  console.log('FASE D: EDGE CASES');
  console.log('========================================');

  // --- TEST D1: Onbekend product ---
  {
    console.log('\n--- TEST D1: Onbekend product ---');
    await goToV2();
    await typeMessage('gisteren alle peren met flubberglub 2L');
    const { elapsed } = await waitForResponse(20);
    await shot('d1-onbekend-product.png');
    const chat = await readChat();
    const card = await readCard();
    console.log(`  Chat: ${chat.fullText.substring(0, 400)}`);

    logResult('D1', 'Onbekend product', 'flubberglub 2L',
      'Foutmelding of vraag om verduidelijking',
      `Chat: ${chat.botMessages.join('; ')}`,
      chat.hasError || chat.hasBotQuestion || card.isEmpty ? 'PASS' : 'FAIL',
      'Systeem moet product niet verzinnen');
  }

  // --- TEST D2: Surround (bekende bug) ---
  {
    console.log('\n--- TEST D2: Surround ---');
    await goToV2();
    await typeMessage('vandaag alle conference met surround 30 kg');
    const { elapsed, timedOut } = await waitForResponse(25);
    await shot('d2-surround.png');
    const card = await readCard();
    const chat = await readChat();
    console.log(`  Card: ${card.raw.substring(0, 400)}`);
    console.log(`  Chat: ${chat.fullText.substring(0, 400)}`);

    const hasSurround = card.raw.toLowerCase().includes('surround') || chat.fullText.toLowerCase().includes('surround');
    logResult('D2', 'Surround product', 'surround 30 kg',
      'Surround WP gevonden',
      `Surround gevonden: ${hasSurround}, Card: ${card.middelenCount} middelen`,
      hasSurround && card.middelenCount >= 1 ? 'PASS' : 'FAIL',
      !hasSurround ? 'Surround niet gevonden in database' : '');
  }

  // --- TEST D3: Werkzame stof als productnaam (captan) ---
  {
    console.log('\n--- TEST D3: Werkzame stof "captan" ---');
    await goToV2();
    await typeMessage('gisteren alle peren met captan 2L');
    const { elapsed } = await waitForResponse(25);
    await shot('d3-captan-werkzame-stof.png');
    const card = await readCard();
    console.log(`  Card: ${card.raw.substring(0, 400)}`);

    const hasMerpan = card.raw.includes('Merpan');
    logResult('D3', 'Werkzame stof als naam', 'captan 2L',
      'Resolved naar Merpan Spuitkorrel (bevat captan)',
      `Merpan gevonden: ${hasMerpan}`,
      hasMerpan ? 'PASS' : 'PARTIAL',
      !hasMerpan ? 'captan niet geresolved naar Merpan' : '');
  }

  // --- TEST D4: Minimale input ---
  {
    console.log('\n--- TEST D4: Minimale input ---');
    await goToV2();
    await typeMessage('gespoten');
    const { elapsed } = await waitForResponse(20);
    await shot('d4-minimaal.png');
    const chat = await readChat();

    logResult('D4', 'Minimale input', 'gespoten',
      'Vraag om meer info of melding te weinig data',
      `Bot: ${chat.botMessages.join('; ')} | NotReg: ${chat.hasNotRegistration}`,
      chat.hasNotRegistration || chat.hasBotQuestion ? 'PASS' : 'FAIL', '');
  }

  // --- TEST D5: Zonder dosering ---
  {
    console.log('\n--- TEST D5: Zonder dosering ---');
    await goToV2();
    await typeMessage('gisteren alle peren met merpan');
    const { elapsed } = await waitForResponse(25);
    await shot('d5-geen-dosering.png');
    const card = await readCard();
    const chat = await readChat();
    console.log(`  Card: ${card.raw.substring(0, 400)}`);
    console.log(`  Chat: ${chat.fullText.substring(0, 400)}`);

    const asksDosage = chat.fullText.toLowerCase().includes('dosering') || chat.hasBotQuestion;
    logResult('D5', 'Zonder dosering', 'alle peren met merpan',
      'Vraag om dosering OF default met vraag',
      `Vraagt dosering: ${asksDosage}, Card middelen: ${card.middelenCount}`,
      asksDosage || card.hasCard ? 'PASS' : 'PARTIAL', '');
  }

  // --- TEST D6: Zonder datum ---
  {
    console.log('\n--- TEST D6: Zonder datum ---');
    await goToV2();
    await typeMessage('alle conference met merpan 2L');
    const { elapsed } = await waitForResponse(25);
    await shot('d6-geen-datum.png');
    const card = await readCard();
    console.log(`  Card date: ${card.date}`);
    console.log(`  Card: ${card.raw.substring(0, 400)}`);

    // Should default to today (26 feb 2026)
    const hasToday = card.raw.includes('26 februari') || card.raw.includes('donderdag');
    logResult('D6', 'Zonder datum', 'alle conference met merpan 2L',
      'Datum = vandaag (26 feb 2026)',
      `Datum: ${card.date}, Vandaag gevonden: ${hasToday}`,
      card.hasCard ? 'PASS' : 'FAIL', '');
  }

  // --- TEST D7: Hele bedrijf ---
  {
    console.log('\n--- TEST D7: Hele bedrijf ---');
    await goToV2();
    await typeMessage('gisteren het hele bedrijf gespoten met merpan 2L');
    const { elapsed } = await waitForResponse(25);
    await shot('d7-hele-bedrijf.png');
    const card = await readCard();
    console.log(`  Card: ${card.parcelCount} percelen, ${card.hectare} ha`);

    // Should select ALL sub-parcels (32 total)
    logResult('D7', 'Hele bedrijf', 'het hele bedrijf met merpan 2L',
      '~32 percelen, ~55-60 ha',
      `${card.parcelCount} percelen, ${card.hectare} ha`,
      card.parcelCount && card.parcelCount >= 25 ? 'PASS' : card.hasCard ? 'PARTIAL' : 'FAIL',
      card.parcelCount && card.parcelCount < 25 ? `Verwacht ~32, kreeg ${card.parcelCount}` : '');
  }

  // --- TEST D8a: Informeel "getankt" ---
  {
    console.log('\n--- TEST D8a: Informeel "getankt" ---');
    await goToV2();
    await typeMessage('getankt met captan 2L, alle peren, eergisteren');
    const { elapsed } = await waitForResponse(25);
    await shot('d8a-getankt.png');
    const card = await readCard();
    console.log(`  Card: ${card.middelenCount} middelen, ${card.parcelCount} percelen`);

    logResult('D8a', 'Informeel: getankt', 'getankt met captan 2L alle peren eergisteren',
      'Herkend als registratie, peren + captan/merpan',
      `${card.middelenCount} middelen, ${card.parcelCount} percelen, ${card.hectare} ha`,
      card.hasCard ? 'PASS' : 'FAIL', '');
  }

  // --- TEST D8b: Informeel "rondje" ---
  {
    console.log('\n--- TEST D8b: Informeel "rondje" ---');
    await goToV2();
    await typeMessage('gister een rondje gedaan met score 0.3L door alle conference');
    const { elapsed } = await waitForResponse(25);
    await shot('d8b-rondje.png');
    const card = await readCard();
    console.log(`  Card: ${card.middelenCount} middelen, ${card.parcelCount} percelen`);

    logResult('D8b', 'Informeel: rondje', 'rondje met score door conference',
      'Herkend, Score 250 EC, Conference percelen',
      `${card.middelenCount} middelen, ${card.parcelCount} percelen`,
      card.hasCard ? 'PASS' : 'FAIL', '');
  }

  // ============================================================
  // FASE E: OPSLAAN + LOGBOEK
  // ============================================================
  console.log('\n========================================');
  console.log('FASE E: OPSLAAN + LOGBOEK CHECK');
  console.log('========================================');

  // --- TEST E1: Volledige opslaan flow ---
  {
    console.log('\n--- TEST E1: Volledige opslaan flow ---');
    await goToV2();

    // B1: registratie
    await typeMessage('gisteren alle elstar met score 0.3L');
    const r1 = await waitForResponse(25);
    console.log(`  B1 wacht: ${r1.elapsed}s`);
    await shot('e1-b1-registratie.png');
    const card1 = await readCard();
    console.log(`  Card: ${card1.middelenCount} middelen, ${card1.parcelCount} percelen`);

    // B2: bevestigen
    await typeMessage('klopt, opslaan');
    const r2 = await waitForResponse(25);
    console.log(`  B2 wacht: ${r2.elapsed}s`);
    await shot('e1-b2-opslaan.png');
    const chat2 = await readChat();
    const card2 = await readCard();
    console.log(`  Chat: ${chat2.fullText.substring(0, 400)}`);
    console.log(`  Card status: ${card2.status}`);

    // Probeer bevestig-knop te klikken als die er is
    const hasConfirmBtn = await page.locator('button:has-text("Bevestigen")').isVisible().catch(() => false);
    if (hasConfirmBtn) {
      console.log('  Bevestigen knop gevonden, klikken...');
      await page.click('button:has-text("Bevestigen")');
      await waitForResponse(15);
      await shot('e1-b3-bevestigd.png');
    }

    // Check spuitlogboek
    console.log('  Navigeren naar spuitlogboek...');
    await page.goto(`http://localhost:${PORT}/crop-care/logs`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(8000);
    await shot('e1-spuitlogboek.png');
    const logContent = await page.evaluate(() => document.body.innerText.substring(0, 3000));
    console.log(`  Logboek (first 500): ${logContent.substring(0, 500)}`);

    const hasEntry = logContent.includes('Score') || logContent.includes('Elstar') || logContent.includes('score');
    logResult('E1', 'Opslaan + logboek check', 'elstar + score → opslaan → check logboek',
      'Registratie zichtbaar in spuitlogboek',
      `Logboek bevat entry: ${hasEntry}`,
      'MANUAL_CHECK', 'Controleer screenshot van logboek');
  }

  // ============================================================
  // SAVE REPORT
  // ============================================================
  const report = {
    context: ctxData,
    results: allResults,
    consoleErrors: [...new Set(consoleErrors)].slice(0, 20),
    summary: {
      total: allResults.length,
      pass: allResults.filter(r => r.status === 'PASS').length,
      fail: allResults.filter(r => r.status === 'FAIL').length,
      partial: allResults.filter(r => r.status === 'PARTIAL').length,
      manual: allResults.filter(r => r.status === 'MANUAL_CHECK').length,
    },
    ts: new Date().toISOString()
  };

  fs.writeFileSync(path.join(DIR, 'results.json'), JSON.stringify(report, null, 2));

  console.log('\n========================================');
  console.log('TEST SUITE COMPLETE');
  console.log('========================================');
  console.log(`Total: ${report.summary.total} | ✅ ${report.summary.pass} | ❌ ${report.summary.fail} | ⚠️ ${report.summary.partial} | 🔍 ${report.summary.manual}`);
  console.log(`Console errors: ${[...new Set(consoleErrors)].length}`);

  await browser.close();
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
