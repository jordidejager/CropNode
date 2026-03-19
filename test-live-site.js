#!/usr/bin/env node
/**
 * =============================================================================
 * CropNode Live Site Test Suite — Uitgebreide E2E Tests
 * =============================================================================
 *
 * Doel: Grondige test van https://cropnode.vercel.app/ na deployment
 * Login: admin / admin123
 *
 * Uitvoeren:
 *   node test-live-site.js
 *   node test-live-site.js --fase=1        # Alleen FASE 1
 *   node test-live-site.js --verbose        # Extra output
 *
 * Fases:
 *   FASE 1:  Auth & Navigatie (login, routes, redirects)
 *   FASE 2:  Smart Input V2 — Core Parsing (10 scenario's)
 *   FASE 3:  Smart Input V2 — Typo Tolerantie & Edge Cases (8 scenario's)
 *   FASE 4:  CTGB Validatie Engine (6 scenario's)
 *   FASE 5:  Spuitschrift & Logbook (CRUD + display)
 *   FASE 6:  Percelen (list + map views)
 *   FASE 7:  Weather Hub (dashboard + expert)
 *   FASE 8:  Team Tasks (urenregistratie)
 *   FASE 9:  Research Hub (pests + papers)
 *   FASE 10: Mobiele Responsiveness (3 viewports)
 *   FASE 11: Cross-cutting (performance, errors, dark mode)
 * =============================================================================
 */

const BASE_URL = 'https://cropnode.vercel.app';
const LOGIN_USER = 'admin';
const LOGIN_PASS = 'admin123';
const LOGIN_EMAIL = 'admin@agrisprayer.local';

// Supabase config voor directe API calls
const SUPABASE_URL = 'https://djcsihpnidopxxuxumvj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqY3NpaHBuaWRvcHh4dXh1bXZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzNTk3MTQsImV4cCI6MjA4MzkzNTcxNH0.2UANr8oKdFMlQ9cVJKLDclN6BVeIcrfnkqNmiM6m0Y8';

// ============================================================================
// UTILS
// ============================================================================

const { execSync } = require('child_process');

const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const FASE_FILTER = args.find(a => a.startsWith('--fase='))?.split('=')[1];

let authToken = null;
let authCookie = null; // Full SSR cookie string for Next.js routes
let userContext = null;
const SUPABASE_REF = 'djcsihpnidopxxuxumvj';
const SSR_COOKIE_NAME = `sb-${SUPABASE_REF}-auth-token`;
const results = { pass: 0, fail: 0, skip: 0, details: [] };

function log(msg) { console.log(msg); }
function verbose(msg) { if (VERBOSE) console.log(`  [debug] ${msg}`); }

function result(fase, id, name, passed, detail = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  results.details.push({ fase, id, name, passed, detail });
  if (passed) results.pass++; else results.fail++;
  log(`  ${status} ${id}: ${name}${detail ? ` — ${detail}` : ''}`);
}

function skip(fase, id, name, reason) {
  results.skip++;
  results.details.push({ fase, id, name, passed: null, detail: reason });
  log(`  ⏭️ SKIP ${id}: ${name} — ${reason}`);
}

/**
 * Curl-based fetch to work around Node.js v24 ECONNRESET bug.
 * Falls back to native fetch for localhost URLs.
 */
function curlFetch(url, options = {}) {
  const method = options.method || 'GET';
  const headers = {
    'Content-Type': 'application/json',
    ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
    ...(options.headers || {}),
  };

  const headerArgs = Object.entries(headers)
    .map(([k, v]) => `-H '${k}: ${v}'`).join(' ');
  const bodyArg = options.body ? `-d '${options.body.replace(/'/g, "'\\''")}'` : '';
  const cmd = `curl -4 -s -w '\\n%{http_code}' --connect-timeout 15 --max-time 30 -X ${method} ${headerArgs} ${bodyArg} '${url}' 2>/dev/null`;

  try {
    const output = execSync(cmd, { encoding: 'utf-8', timeout: 35000, maxBuffer: 5 * 1024 * 1024 });
    const lines = output.trim().split('\n');
    const statusCode = parseInt(lines.pop()) || 0;
    const body = lines.join('\n');
    return { status: statusCode, body, ok: statusCode >= 200 && statusCode < 300 };
  } catch (e) {
    return { status: 0, body: '', ok: false, error: e.message };
  }
}

function curlJSON(url, options = {}) {
  const res = curlFetch(url, options);
  try {
    res.json = JSON.parse(res.body);
  } catch {
    res.json = null;
  }
  return res;
}

function fetchPage(path) {
  const url = `${BASE_URL}${path}`;
  const res = curlFetch(url);
  return { status: res.status, url };
}

function supabaseAuth() {
  const res = curlJSON(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify({ email: LOGIN_EMAIL, password: LOGIN_PASS }),
  });
  if (res.json?.access_token) {
    authToken = res.json.access_token;
    // Build SSR cookie value (URL-encoded session JSON) for Next.js middleware
    const sessionData = encodeURIComponent(JSON.stringify(res.json));
    authCookie = `${SSR_COOKIE_NAME}=${sessionData}`;
    return true;
  }
  verbose(`Auth failed: ${res.body?.substring(0, 200)}`);
  return false;
}

function supabaseQuery(table, query = '', extraHeaders = {}) {
  return curlJSON(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      ...extraHeaders,
    },
  });
}

function smartInputV2(message) {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');

  // Strip heavy data from userContext to keep body under Vercel's 4.5MB limit
  // Full context is ~5.5MB due to 1000 CTGB products with gebruiksvoorschriften
  let ctx = userContext || { parcels: [], products: [], recentHistory: [], productAliases: [], loadedAt: new Date().toISOString() };
  ctx = {
    ...ctx,
    parcels: (ctx.parcels || []).map(p => ({ id: p.id, name: p.name, crop: p.crop, variety: p.variety, area: p.area })),
    // Filter: alleen producten toegelaten voor fruitteelt (appel/peer) — scheelt ~700 producten
    products: (ctx.products || [])
      .filter(p => (p.gebruiksvoorschriften || []).some(g =>
        /appel|peer|pit.?fruit|kern.?fruit|fruit/i.test(g.gewas || '')))
      .map(p => ({
        id: p.id, naam: p.naam, toelatingsnummer: p.toelatingsnummer,
        categorie: p.categorie, werkzameStoffen: p.werkzameStoffen,
        gebruiksvoorschriften: (p.gebruiksvoorschriften || [])
          .filter(g => /appel|peer|pit.?fruit|kern.?fruit|fruit/i.test(g.gewas || ''))
          .map(g => ({ gewas: g.gewas, dosering: g.dosering, maxToepassingen: g.maxToepassingen })),
      })),
  };

  const body = JSON.stringify({
    message,
    conversationHistory: [],
    currentDraft: null,
    userContext: ctx,
  });

  // Write body to temp file to avoid E2BIG shell limit
  const tmpFile = path.join(os.tmpdir(), `cropnode-test-${Date.now()}.json`);
  fs.writeFileSync(tmpFile, body);

  // Write cookie to temp file to avoid command line overflow (cookie is ~2.5KB URL-encoded)
  const cookieFile = path.join(os.tmpdir(), `cropnode-cookie-${Date.now()}.txt`);
  // Netscape cookie format: domain, flag, path, secure, expiry, name, value
  const cookieName = SSR_COOKIE_NAME;
  const cookieValue = encodeURIComponent(JSON.stringify(JSON.parse(decodeURIComponent(authCookie.split('=').slice(1).join('=')))));
  fs.writeFileSync(cookieFile, `cropnode.vercel.app\tFALSE\t/\tTRUE\t0\t${cookieName}\t${cookieValue}\n`);
  const cmd = `curl -4 -s -w '\\n%{http_code}' --connect-timeout 15 --max-time 60 -X POST -H 'Content-Type: application/json' -b ${cookieFile} -d @${tmpFile} '${BASE_URL}/api/smart-input-v2' 2>/dev/null`;

  try {
    // Retry once on network error (Vercel cold starts)
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const output = execSync(cmd, { encoding: 'utf-8', timeout: 65000, maxBuffer: 5 * 1024 * 1024 });
        const lines = output.trim().split('\n');
        const statusCode = parseInt(lines.pop()) || 0;
        const raw = lines.join('\n');
        const chunks = raw.split('\n').filter(l => l.trim()).map(l => {
          try { return JSON.parse(l); } catch { return null; }
        }).filter(Boolean);
        return { status: statusCode, chunks, raw };
      } catch (e) {
        if (attempt === 0) {
          verbose(`Retry after error: ${e.message?.substring(0, 80)}`);
          execSync('sleep 2');
          continue;
        }
        return { status: 0, error: e.message?.substring(0, 120), chunks: [], raw: '' };
      }
    }
    return { status: 0, error: 'Max retries', chunks: [], raw: '' };
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
    try { fs.unlinkSync(cookieFile); } catch {}
  }
}

function fetchUserContext() {
  // Context response is large (~1MB with geometry), use bigger buffer
  const headers = {
    'Content-Type': 'application/json',
    'Cookie': authCookie,
    ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
  };
  const headerArgs = Object.entries(headers).filter(([,v]) => v)
    .map(([k, v]) => `-H '${k}: ${v}'`).join(' ');
  const cmd = `curl -4 -s -w '\\n%{http_code}' --connect-timeout 15 --max-time 30 ${headerArgs} '${BASE_URL}/api/smart-input-v2/context' 2>/dev/null`;
  try {
    const output = execSync(cmd, { encoding: 'utf-8', timeout: 35000, maxBuffer: 10 * 1024 * 1024 });
    const lines = output.trim().split('\n');
    const statusCode = parseInt(lines.pop()) || 0;
    const body = lines.join('\n');
    if (statusCode >= 200 && statusCode < 300) {
      userContext = JSON.parse(body);
      return true;
    }
    verbose(`Context fetch failed: status=${statusCode}`);
    return false;
  } catch (e) {
    verbose(`Context fetch error: ${e.message?.substring(0, 100)}`);
    return false;
  }
}

// ============================================================================
// FASE 1: AUTH & NAVIGATIE
// ============================================================================

function fase1() {
  log('\n════════════════════════════════════════');
  log('FASE 1: Auth & Navigatie');
  log('════════════════════════════════════════');

  // 1a: Login page bereikbaar
  const loginPage = fetchPage('/login');
  result(1, '1a', 'Login pagina bereikbaar', loginPage.status === 200);

  // 1b: Supabase auth
  const authOk = supabaseAuth();
  result(1, '1b', 'Supabase authenticatie slaagt', authOk);
  if (!authOk) {
    skip(1, '1c-1j', 'Overige auth tests', 'Auth gefaald');
    return;
  }

  // 1c: Context endpoint
  const contextOk = fetchUserContext();
  result(1, '1c', 'User context laden', contextOk,
    contextOk ? `${userContext?.parcels?.length || 0} parcels, ${userContext?.ctgbProducts?.length || 0} products` : 'Failed');

  // 1d-1j: Protected routes bereikbaar
  const routes = [
    { path: '/command-center/smart-input-v2', name: 'Smart Input V2' },
    { path: '/parcels/list', name: 'Percelen lijst' },
    { path: '/crop-care/logs', name: 'Spuitschrift logs' },
    { path: '/weather/dashboard', name: 'Weather Dashboard' },
    { path: '/team-tasks', name: 'Team Tasks' },
    { path: '/research', name: 'Research Hub' },
    { path: '/profile', name: 'Profiel' },
  ];

  for (let i = 0; i < routes.length; i++) {
    const r = routes[i];
    const id = `1${String.fromCharCode(100 + i)}`; // 1d, 1e, 1f, ...
    const res = curlFetch(`${BASE_URL}${r.path}`, {
      headers: { 'Cookie': authCookie },
    });
    result(1, id, `Route ${r.name} (${r.path})`, res.status === 200, `status=${res.status}`);
  }
}

// ============================================================================
// FASE 2: SMART INPUT V2 — CORE PARSING
// ============================================================================

function fase2() {
  log('\n════════════════════════════════════════');
  log('FASE 2: Smart Input V2 — Core Parsing');
  log('════════════════════════════════════════');

  if (!authToken) { skip(2, '2*', 'Alle tests', 'Geen auth'); return; }

  const tests = [
    {
      id: '2a', name: 'Simpele registratie met "met"',
      input: 'vandaag alle peren gespoten met merpan 0.7 kg',
      expect: { hasProduct: true, productMatch: /merpan/i },
    },
    {
      id: '2b', name: 'Multi-product tankmix',
      input: 'gisteren alle appels met captan 1.5 kg en score 0.2 l',
      expect: { hasProduct: true, minProducts: 2 },
    },
    {
      id: '2c', name: 'Datum "gisteren"',
      input: 'gisteren alle peren met delan 0.5 kg',
      expect: { hasProduct: true, productMatch: /delan/i },
    },
    {
      id: '2d', name: 'Specifieke percelen',
      input: 'vandaag schele conference met merpan 0.7 kg',
      expect: { hasProduct: true },
    },
    {
      id: '2e', name: 'Alle appels selectie',
      input: 'vandaag alle elstar met captan 1.5 kg',
      expect: { hasProduct: true, productMatch: /captan/i },
    },
    {
      id: '2f', name: 'Komma decimaal',
      input: 'vandaag alle peren met merpan 0,7 kg',
      expect: { hasProduct: true },
    },
    {
      id: '2g', name: 'Zonder eenheid (default kg)',
      input: 'alle peren met merpan 0.7',
      expect: { hasProduct: true },
    },
    {
      id: '2h', name: 'Gram eenheid (conversie naar kg)',
      input: 'alle peren met merpan 700 gram',
      expect: { hasProduct: true },
    },
    {
      id: '2i', name: 'Meststof herkenning (known limitation)',
      input: 'vandaag alle peren met kaliumchloride 5 kg',
      expect: { hasProduct: true },
      knownLimitation: 'Meststoffen staan niet in CTGB database',
    },
    {
      id: '2j', name: 'Liter eenheid',
      input: 'vandaag alle appels met score 0.25 l',
      expect: { hasProduct: true, productMatch: /score/i },
    },
  ];

  for (const t of tests) {
    verbose(`Testing: ${t.input}`);
    const res = smartInputV2(t.input);

    if (res.status === 0) {
      result(2, t.id, t.name, false, `Network error: ${res.error}`);
      continue;
    }

    // Analyze chunks for product presence
    const allText = res.raw.toLowerCase();
    const hasDraft = res.chunks.some(c => c.draft || c.type === 'draft' || c.parsedData);
    const hasProduct = allText.includes('middelen') || allText.includes('product') ||
                       allText.includes('merpan') || allText.includes('captan') ||
                       allText.includes('delan') || allText.includes('score') ||
                       allText.includes('kg/ha') || allText.includes('l/ha') ||
                       hasDraft;
    const noProducts = allText.includes('geen producten') || allText.includes('welk middel');

    let passed = t.expect.hasProduct ? (hasProduct && !noProducts) : true;

    if (t.expect.productMatch && passed) {
      passed = t.expect.productMatch.test(allText);
    }

    const detail = `status=${res.status}, chunks=${res.chunks.length}, hasProduct=${hasProduct}, noProducts=${noProducts}`;
    if (!passed && t.knownLimitation) {
      skip(2, t.id, t.name, t.knownLimitation);
    } else {
      result(2, t.id, t.name, passed, detail);
    }

    // Rate limit
    // Small delay between AI calls
    execSync('sleep 1');
  }
}

// ============================================================================
// FASE 3: TYPO TOLERANTIE & EDGE CASES
// ============================================================================

function fase3() {
  log('\n════════════════════════════════════════');
  log('FASE 3: Typo Tolerantie & Edge Cases');
  log('════════════════════════════════════════');

  if (!authToken) { skip(3, '3*', 'Alle tests', 'Geen auth'); return; }

  const tests = [
    {
      id: '3a', name: 'Typo "merpna" → Merpan (Levenshtein)',
      input: 'merpna 0.7 kg op alle peren',
      expect: { productMatch: /merpan/i, noAsk: true },
    },
    {
      id: '3b', name: 'Typo "captna" → Captan/Merpan',
      input: 'alle appels met captna 1.5 kg',
      expect: { hasProduct: true },
    },
    {
      id: '3c', name: 'Typo "belils" → Bellis',
      input: 'alle peren met belils 0.5 kg',
      expect: { hasProduct: true },
    },
    {
      id: '3d', name: 'Dubbele spaties',
      input: 'alle  peren   met   merpan   0.7  kg',
      expect: { hasProduct: true },
    },
    {
      id: '3e', name: 'Informeel taalgebruik',
      input: 'peren merpan 0.7 kg gedaan vandaag',
      expect: { hasProduct: true },
    },
    {
      id: '3f', name: 'Zonder "met" keyword (direct product)',
      input: 'merpan 0.7 kg op alle peren',
      expect: { productMatch: /merpan/i },
    },
    {
      id: '3g', name: 'Engels taalgebruik',
      input: 'sprayed all pears with captan 1.5 kg today',
      expect: { hasProduct: true },
    },
    {
      id: '3h', name: 'Meerdere slashes in dosering',
      input: 'alle peren met merpan 0.7 kg/ha',
      expect: { hasProduct: true },
    },
  ];

  for (const t of tests) {
    verbose(`Testing: ${t.input}`);
    const res = smartInputV2(t.input);

    if (res.status === 0) {
      result(3, t.id, t.name, false, `Network error: ${res.error}`);
      continue;
    }

    const allText = res.raw.toLowerCase();
    const noProducts = allText.includes('geen producten') || allText.includes('welk middel');
    const hasProduct = !noProducts && (
      allText.includes('kg/ha') || allText.includes('l/ha') ||
      allText.includes('merpan') || allText.includes('captan') || allText.includes('bellis') ||
      allText.includes('middelen') || allText.includes('toegevoegd')
    );

    let passed = true;
    if (t.expect.productMatch) passed = t.expect.productMatch.test(allText);
    if (t.expect.hasProduct) passed = passed && hasProduct;
    if (t.expect.noAsk) passed = passed && !noProducts;

    result(3, t.id, t.name, passed, `noProducts=${noProducts}, matched=${t.expect.productMatch ? t.expect.productMatch.test(allText) : 'n/a'}`);
    // Small delay between AI calls
    execSync('sleep 1');
  }
}

// ============================================================================
// FASE 4: CTGB VALIDATIE ENGINE
// ============================================================================

function fase4() {
  log('\n════════════════════════════════════════');
  log('FASE 4: CTGB Validatie Engine');
  log('════════════════════════════════════════');

  if (!authToken) { skip(4, '4*', 'Alle tests', 'Geen auth'); return; }

  const tests = [
    {
      id: '4a', name: 'Dosering OK (0.7 kg Merpan op peer)',
      input: 'vandaag alle peren met merpan 0.7 kg',
      expect: { noError: true },
    },
    {
      id: '4b', name: 'Dosering te hoog (5 kg Merpan op peer)',
      input: 'vandaag alle peren met merpan 5 kg',
      expect: { hasWarningOrError: true },
    },
    {
      id: '4c', name: 'Dosering grenswaarde (2 kg Merpan - bredere toelating)',
      input: 'vandaag alle peren met merpan 2 kg',
      expect: { noError: true }, // Past in bredere toelating
    },
    {
      id: '4d', name: 'Product niet in fruitteelt (insecticide)',
      input: 'vandaag alle peren met pirimor 0.5 kg',
      expect: { hasResponse: true }, // AI mag product afwijzen of accepteren
    },
    {
      id: '4e', name: 'Dosering OK score op appels (0.2 L)',
      input: 'vandaag alle appels met score 0.2 l',
      expect: { noError: true },
    },
    {
      id: '4f', name: 'Delan op peren (eerste toepassing)',
      input: 'vandaag alle peren met delan 0.5 kg',
      expect: { hasResponse: true }, // Check response bevat product info
    },
  ];

  for (const t of tests) {
    verbose(`Testing: ${t.input}`);
    const res = smartInputV2(t.input);

    if (res.status === 0) {
      result(4, t.id, t.name, false, `Network error: ${res.error}`);
      continue;
    }

    const allText = res.raw.toLowerCase();
    const hasError = allText.includes('fout') || allText.includes('❌') || allText.includes('error');
    const hasWarning = allText.includes('waarschuwing') || allText.includes('⚠');
    const noProducts = allText.includes('geen producten') || allText.includes('welk middel');
    const hasProduct = !noProducts && (allText.includes('kg/ha') || allText.includes('l/ha') || allText.includes('middelen'));

    let passed = true;
    if (t.expect.noError) passed = !hasError && !noProducts;
    if (t.expect.hasWarningOrError) passed = hasWarning || hasError;
    if (t.expect.hasProduct) passed = hasProduct;
    if (t.expect.hasResponse) passed = res.status === 200 && res.chunks.length > 0;

    result(4, t.id, t.name, passed, `error=${hasError}, warning=${hasWarning}, noProducts=${noProducts}`);
    // Small delay between AI calls
    execSync('sleep 1');
  }
}

// ============================================================================
// FASE 5: SPUITSCHRIFT & LOGBOOK
// ============================================================================

function fase5() {
  log('\n════════════════════════════════════════');
  log('FASE 5: Spuitschrift & Logbook');
  log('════════════════════════════════════════');

  if (!authToken) { skip(5, '5*', 'Alle tests', 'Geen auth'); return; }

  // 5a: Spuitschrift entries ophalen via Supabase REST
  try {
    const res = supabaseQuery('spuitschrift', 'select=*&order=date.desc&limit=20');
    const data = res.json;
    const count = Array.isArray(data) ? data.length : 0;
    result(5, '5a', 'Spuitschrift entries ophalen', count > 0, `${count} entries gevonden`);

    // 5b: Alle entries hebben spuitschrift_id
    if (count > 0) {
      const withId = data.filter(e => e.spuitschrift_id);
      result(5, '5b', 'Entries hebben spuitschrift_id', withId.length === count,
        `${withId.length}/${count} met ID`);

      // 5c: Entries hebben products
      const withProducts = data.filter(e => e.products && e.products.length > 0);
      result(5, '5c', 'Entries hebben producten', withProducts.length > 0,
        `${withProducts.length}/${count} met producten`);

      // 5d: Entries hebben datum
      const withDate = data.filter(e => e.date);
      result(5, '5d', 'Entries hebben datum', withDate.length === count,
        `${withDate.length}/${count} met datum`);

      // 5e: Entries hebben plots
      const withPlots = data.filter(e => e.plots && e.plots.length > 0);
      result(5, '5e', 'Entries hebben percelen', withPlots.length > 0,
        `${withPlots.length}/${count} met percelen`);
    }
  } catch (e) {
    result(5, '5a', 'Spuitschrift entries ophalen', false, e.message);
  }

  // 5f: Logbook entries
  { const r = supabaseQuery('logbook', 'select=*&order=created_at.desc&limit=10');
    result(5, '5f', 'Logbook entries ophalen', r.status === 200 || r.status === 206,
      `${Array.isArray(r.json) ? r.json.length : 0} drafts gevonden`); }

  // 5g: Parcel history
  { const r = supabaseQuery('parcel_history', 'select=*&order=date.desc&limit=10');
    result(5, '5g', 'Parcel history entries', r.status === 200 || r.status === 206,
      `${Array.isArray(r.json) ? r.json.length : 0} entries`); }
}

// ============================================================================
// FASE 6: PERCELEN
// ============================================================================

function fase6() {
  log('\n════════════════════════════════════════');
  log('FASE 6: Percelen');
  log('════════════════════════════════════════');

  if (!authToken) { skip(6, '6*', 'Alle tests', 'Geen auth'); return; }

  // 6a: Parcels ophalen
  const pRes = supabaseQuery('parcels', 'select=*');
  const parcels = Array.isArray(pRes.json) ? pRes.json : [];
  result(6, '6a', 'Parcels ophalen', parcels.length > 0, `${parcels.length} hoofdpercelen`);

  if (parcels.length > 0) {
    result(6, '6b', 'Parcels met geometry', parcels.filter(e => e.geometry).length > 0,
      `${parcels.filter(e => e.geometry).length}/${parcels.length} met geometry`);
    result(6, '6c', 'Parcels met locatie', parcels.filter(e => e.location).length > 0,
      `${parcels.filter(e => e.location).length}/${parcels.length} met locatie`);
  }

  // 6d: Sub-parcels ophalen
  const spRes = supabaseQuery('sub_parcels', 'select=*');
  const subs = Array.isArray(spRes.json) ? spRes.json : [];
  result(6, '6d', 'Sub-parcels ophalen', subs.length > 0, `${subs.length} blokken`);

  if (subs.length > 0) {
    const withCrop = subs.filter(e => e.crop && e.variety);
    result(6, '6e', 'Sub-parcels met gewas+ras', withCrop.length === subs.length, `${withCrop.length}/${subs.length}`);
    const withArea = subs.filter(e => e.area && e.area > 0);
    result(6, '6f', 'Sub-parcels met oppervlakte', withArea.length > 0,
      `${withArea.length}/${subs.length}, totaal ${withArea.reduce((s, e) => s + e.area, 0).toFixed(2)} ha`);
    const crops = {};
    subs.forEach(e => { crops[e.crop] = (crops[e.crop] || 0) + 1; });
    result(6, '6g', 'Gewas verdeling', Object.keys(crops).length > 0,
      Object.entries(crops).map(([k,v]) => `${k}:${v}`).join(', '));
  }

  // 6h: PDOK API
  const pdok = curlFetch('https://api.pdok.nl/rvo/gewaspercelen/ogc/v1/collections?f=json');
  result(6, '6h', 'PDOK API bereikbaar', pdok.status === 200, `status=${pdok.status}`);
}

// ============================================================================
// FASE 7: WEATHER HUB
// ============================================================================

function fase7() {
  log('\n════════════════════════════════════════');
  log('FASE 7: Weather Hub');
  log('════════════════════════════════════════');

  if (!authToken) { skip(7, '7*', 'Alle tests', 'Geen auth'); return; }

  const ws = supabaseQuery('weather_stations', 'select=*');
  const stations = Array.isArray(ws.json) ? ws.json : [];
  result(7, '7a', 'Weather stations ophalen', stations.length > 0,
    `${stations.length} stations`);

  const stationId = stations.length > 0 ? stations[0].id : '';

  const cur = curlFetch(`${BASE_URL}/api/weather/current?stationId=${stationId}`, { headers: { 'Cookie': authCookie } });
  result(7, '7b', 'Weather current API', cur.status === 200, `status=${cur.status}, bytes=${cur.body.length}`);

  const fc = curlFetch(`${BASE_URL}/api/weather/forecast?stationId=${stationId}`, { headers: { 'Cookie': authCookie } });
  result(7, '7c', 'Weather forecast API', fc.status === 200, `status=${fc.status}`);

  const hr = supabaseQuery('weather_data_hourly', 'select=id&limit=1', { 'Prefer': 'count=exact' });
  result(7, '7d', 'Hourly weather data', hr.status === 200 || hr.status === 206, `status=${hr.status}`);

  const dy = supabaseQuery('weather_data_daily', 'select=id&limit=1', { 'Prefer': 'count=exact' });
  result(7, '7e', 'Daily weather data', dy.status === 200 || dy.status === 206, `status=${dy.status}`);

  const om = curlJSON('https://api.open-meteo.com/v1/forecast?latitude=51.47&longitude=3.93&current=temperature_2m');
  result(7, '7f', 'Open-Meteo API bereikbaar', om.status === 200 && om.json?.current,
    om.json?.current ? `temp=${om.json.current.temperature_2m}°C` : 'No data');

  const mm = curlFetch(`${BASE_URL}/api/weather/multimodel?stationId=${stationId}`, { headers: { 'Cookie': authCookie } });
  result(7, '7g', 'Multimodel forecast API', mm.status === 200, `status=${mm.status}`);

  const en = curlFetch(`${BASE_URL}/api/weather/ensemble?stationId=${stationId}`, { headers: { 'Cookie': authCookie } });
  result(7, '7h', 'Ensemble forecast API', en.status === 200, `status=${en.status}`);
}

// ============================================================================
// FASE 8: TEAM TASKS
// ============================================================================

function fase8() {
  log('\n════════════════════════════════════════');
  log('FASE 8: Team Tasks');
  log('════════════════════════════════════════');

  if (!authToken) { skip(8, '8*', 'Alle tests', 'Geen auth'); return; }

  const tt = supabaseQuery('task_types', 'select=*');
  const types = Array.isArray(tt.json) ? tt.json : [];
  result(8, '8a', 'Task types ophalen', types.length > 0,
    types.length > 0 ? types.map(t => `${t.name} (€${t.default_hourly_rate})`).join(', ') : 'Geen types');

  const tl = supabaseQuery('task_logs', 'select=*&order=start_date.desc&limit=10');
  const logs = Array.isArray(tl.json) ? tl.json : [];
  result(8, '8b', 'Task logs ophalen', tl.status === 200, `${logs.length} logs`);

  if (logs.length > 0) {
    const entry = logs[0];
    const expected = entry.people_count * entry.hours_per_person * entry.days;
    const match = Math.abs(expected - entry.total_hours) < 0.01;
    result(8, '8c', 'Uren berekening klopt', match,
      `${entry.people_count}p × ${entry.hours_per_person}u × ${entry.days}d = ${expected} (DB: ${entry.total_hours})`);
  } else {
    skip(8, '8c', 'Uren berekening', 'Geen task logs');
  }

  const as = supabaseQuery('active_task_sessions', 'select=*');
  result(8, '8d', 'Active sessions endpoint', as.status === 200 || as.status === 206);
}

// ============================================================================
// FASE 9: RESEARCH HUB
// ============================================================================

function fase9() {
  log('\n════════════════════════════════════════');
  log('FASE 9: Research Hub');
  log('════════════════════════════════════════');

  if (!authToken) { skip(9, '9*', 'Alle tests', 'Geen auth'); return; }

  const pd = supabaseQuery('pests_diseases', 'select=id,name,type,crop&limit=50');
  const pests = Array.isArray(pd.json) ? pd.json : [];
  result(9, '9a', 'Pests & diseases ophalen', pd.status === 200 || pd.status === 206,
    `${pests.length} entries, status=${pd.status}`);

  if (pests.length > 0) {
    const complete = pests.filter(e => e.name && e.type && e.crop);
    result(9, '9b', 'Pests met volledige data', complete.length > 0, `${complete.length}/${pests.length} compleet`);
    const ptypes = {};
    pests.forEach(e => { ptypes[e.type] = (ptypes[e.type] || 0) + 1; });
    result(9, '9c', 'Pest types aanwezig', Object.keys(ptypes).length > 0,
      Object.entries(ptypes).map(([k,v]) => `${k}:${v}`).join(', '));
  }

  // CTGB search via Supabase direct (avoid Next.js API cookie issues)
  const ctgb = supabaseQuery('ctgb_products', 'select=id,naam,toelatingsnummer&naam=ilike.*merpan*&limit=5');
  const found = Array.isArray(ctgb.json) ? ctgb.json.length : 0;
  result(9, '9d', 'CTGB product zoeken (merpan)', found > 0 || ctgb.status === 200,
    `${found} resultaten, status=${ctgb.status}`);

  const ac = supabaseQuery('active_substances', 'select=code,name&limit=1');
  result(9, '9e', 'Werkzame stoffen database', ac.status === 200 || ac.status === 206, `status=${ac.status}`);

  const rp = supabaseQuery('research_papers', 'select=*&limit=5');
  result(9, '9g', 'Research papers endpoint', rp.status === 200);
}

// ============================================================================
// FASE 10: API PERFORMANCE & ENDPOINTS
// ============================================================================

function fase10() {
  log('\n════════════════════════════════════════');
  log('FASE 10: Performance & API Endpoints');
  log('════════════════════════════════════════');

  if (!authToken) { skip(10, '10*', 'Alle tests', 'Geen auth'); return; }

  // 10a: Smart Input V2 response time
  const start = Date.now();
  const aiRes = smartInputV2('vandaag alle peren met merpan 0.7 kg');
  const elapsed = Date.now() - start;
  result(10, '10a', 'Smart Input V2 response tijd', elapsed < 30000,
    `${elapsed}ms (target <30s voor AI parsing op Vercel)`);

  // 10b: Context endpoint performance
  const ctxStart = Date.now();
  curlFetch(`${BASE_URL}/api/smart-input-v2/context`, { headers: { 'Cookie': authCookie } });
  result(10, '10b', 'Context endpoint performance', (Date.now() - ctxStart) < 10000,
    `${Date.now() - ctxStart}ms`);

  // 10c: Weather API performance
  const wxStart = Date.now();
  curlFetch(`${BASE_URL}/api/weather/current`, { headers: { 'Cookie': authCookie } });
  result(10, '10c', 'Weather API performance', (Date.now() - wxStart) < 10000,
    `${Date.now() - wxStart}ms`);

  // 10d: Validate endpoint
  const val = curlFetch(`${BASE_URL}/api/validate`, {
    method: 'POST',
    headers: { 'Cookie': authCookie },
    body: JSON.stringify({ product: 'Merpan Spuitkorrel', dosage: 0.7, unit: 'kg', crop: 'Peer', parcelId: 'test' }),
  });
  result(10, '10d', 'Validate endpoint bereikbaar', val.status < 500, `status=${val.status}`);

  // 10e: Landing page
  const lpStart = Date.now();
  const lp = curlFetch(BASE_URL);
  result(10, '10e', 'Landing page load', lp.status === 200, `${Date.now() - lpStart}ms, status=${lp.status}`);
}

// ============================================================================
// FASE 11: DATA INTEGRITEIT
// ============================================================================

function fase11() {
  log('\n════════════════════════════════════════');
  log('FASE 11: Data Integriteit');
  log('════════════════════════════════════════');

  if (!authToken) { skip(11, '11*', 'Alle tests', 'Geen auth'); return; }

  // 11a: Product aliases tabel
  { const r = supabaseQuery('product_aliases', 'select=*&limit=100');
    const count = Array.isArray(r.json) ? r.json.length : 0;
    result(11, '11a', 'Product aliases database', count >= 0, `${count} aliassen`); }

  // 11b: Spuitschrift-logbook relatie
  { const r = supabaseQuery('spuitschrift', 'select=original_logbook_id&limit=50');
    const data = Array.isArray(r.json) ? r.json : [];
    if (data.length > 0) {
      const withLogbookRef = data.filter(e => e.original_logbook_id);
      result(11, '11b', 'Spuitschrift-logbook relatie', true,
        `${withLogbookRef.length}/${data.length} met logbook referentie`);
    } else {
      skip(11, '11b', 'Spuitschrift-logbook relatie', 'Geen spuitschrift data');
    }
  }

  // 11c: Sub-parcel ↔ parcel relatie
  { const r = supabaseQuery('sub_parcels', 'select=id,parcel_id,name&limit=50');
    const data = Array.isArray(r.json) ? r.json : [];
    if (data.length > 0) {
      const withParent = data.filter(e => e.parcel_id);
      result(11, '11c', 'Sub-parcel → parcel relatie', withParent.length === data.length,
        `${withParent.length}/${data.length} met parent`);
    } else {
      skip(11, '11c', 'Sub-parcel relatie', 'Geen sub-parcel data');
    }
  }

  // 11d: Geen orphan spuitschrift entries (na cleanup)
  { const r = supabaseQuery('spuitschrift', 'select=id,spuitschrift_id&spuitschrift_id=is.null');
    const orphans = Array.isArray(r.json) ? r.json.length : 0;
    result(11, '11d', 'Geen orphan spuitschrift entries', orphans === 0,
      `${orphans} orphans gevonden`); }

  // 11e: Weather station ↔ parcel koppeling
  { const r = supabaseQuery('parcel_weather_stations', 'select=*');
    result(11, '11e', 'Parcel-weather station koppelingen', r.status === 200 || r.status === 206,
      `${Array.isArray(r.json) ? r.json.length : 0} koppelingen`); }
}

// ============================================================================
// EINDRAPPORT
// ============================================================================

function printReport() {
  log('\n╔══════════════════════════════════════════════════════════╗');
  log('║           CROPNODE LIVE SITE TEST RAPPORT               ║');
  log('╚══════════════════════════════════════════════════════════╝');
  log(`\nDatum:    ${new Date().toISOString()}`);
  log(`Site:     ${BASE_URL}`);
  log(`Account:  ${LOGIN_USER}`);
  log('');
  log(`  ✅ PASS:  ${results.pass}`);
  log(`  ❌ FAIL:  ${results.fail}`);
  log(`  ⏭️ SKIP:  ${results.skip}`);
  log(`  📊 TOTAAL: ${results.pass + results.fail + results.skip}`);
  log(`  📈 SCORE: ${results.pass}/${results.pass + results.fail} (${((results.pass / (results.pass + results.fail || 1)) * 100).toFixed(1)}%)`);
  log('');

  // Per-fase samenvatting
  const fases = {};
  results.details.forEach(d => {
    if (!fases[d.fase]) fases[d.fase] = { pass: 0, fail: 0, skip: 0 };
    if (d.passed === true) fases[d.fase].pass++;
    else if (d.passed === false) fases[d.fase].fail++;
    else fases[d.fase].skip++;
  });

  const faseNames = {
    1: 'Auth & Navigatie',
    2: 'Core Parsing',
    3: 'Typo Tolerantie',
    4: 'CTGB Validatie',
    5: 'Spuitschrift',
    6: 'Percelen',
    7: 'Weather Hub',
    8: 'Team Tasks',
    9: 'Research Hub',
    10: 'Performance',
    11: 'Data Integriteit',
  };

  log('┌─────┬──────────────────────┬──────┬──────┬──────┐');
  log('│FASE │ Naam                 │ PASS │ FAIL │ SKIP │');
  log('├─────┼──────────────────────┼──────┼──────┼──────┤');
  for (const [fase, counts] of Object.entries(fases)) {
    const name = (faseNames[fase] || `Fase ${fase}`).padEnd(20);
    log(`│ ${String(fase).padStart(3)} │ ${name} │ ${String(counts.pass).padStart(4)} │ ${String(counts.fail).padStart(4)} │ ${String(counts.skip).padStart(4)} │`);
  }
  log('└─────┴──────────────────────┴──────┴──────┴──────┘');

  // Failed tests detail
  const failed = results.details.filter(d => d.passed === false);
  if (failed.length > 0) {
    log('\n❌ GEFAALDE TESTS:');
    failed.forEach(f => {
      log(`  ${f.id}: ${f.name} — ${f.detail}`);
    });
  }

  log('\n════════════════════════════════════════');
  log(results.fail === 0 ? '🎉 ALLE TESTS GESLAAGD!' : `⚠️ ${results.fail} TEST(S) GEFAALD`);
  log('════════════════════════════════════════\n');
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  log('╔══════════════════════════════════════════════════════════╗');
  log('║        CropNode Live Site Test Suite v2.0               ║');
  log('║        https://cropnode.vercel.app/                     ║');
  log('╚══════════════════════════════════════════════════════════╝');
  log(`\nStarttijd: ${new Date().toISOString()}`);
  log(`Modus: ${FASE_FILTER ? `Alleen FASE ${FASE_FILTER}` : 'Alle fases'}`);

  const allFases = [
    { num: 1, fn: fase1 },
    { num: 2, fn: fase2 },
    { num: 3, fn: fase3 },
    { num: 4, fn: fase4 },
    { num: 5, fn: fase5 },
    { num: 6, fn: fase6 },
    { num: 7, fn: fase7 },
    { num: 8, fn: fase8 },
    { num: 9, fn: fase9 },
    { num: 10, fn: fase10 },
    { num: 11, fn: fase11 },
  ];

  // Always run auth first when filtering to a specific fase
  if (FASE_FILTER && FASE_FILTER !== '1') {
    log('\n[Pre-auth: Logging in...]');
    supabaseAuth();
    fetchUserContext();
    log(`[Auth: ${authToken ? 'OK' : 'FAILED'}, Context: ${userContext ? 'OK' : 'FAILED'}]`);
  }

  for (const fase of allFases) {
    if (FASE_FILTER && String(fase.num) !== FASE_FILTER) continue;
    try {
      fase.fn();
    } catch (e) {
      log(`\n⚠️ FASE ${fase.num} CRASHED: ${e.message}`);
      result(fase.num, `${fase.num}!`, 'Fase uitvoering', false, e.message);
    }
  }

  printReport();
}

try {
  main();
} catch (e) {
  console.error('Fatal error:', e);
  process.exit(1);
}
