/**
 * FASE 1: Seizoenssimulatie - 10 bespuitingen invoeren en opslaan
 * Uses curl with file I/O for large payloads
 */

const fs = require('fs');
const { execSync } = require('child_process');

const APP_URL = 'http://localhost:3003';
const SUPABASE_URL = 'https://djcsihpnidopxxuxumvj.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqY3NpaHBuaWRvcHh4dXh1bXZqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODM1OTcxNCwiZXhwIjoyMDgzOTM1NzE0fQ.VqnQH187m6qTD76gfJM9i0NxMq_n6EjD3Pnyhz02ocg';

const COOKIE = fs.readFileSync('/tmp/sb_cookie.txt', 'utf8').trim();
const USER_ID = fs.readFileSync('/tmp/sb_user_id.txt', 'utf8').trim();
const USER_CONTEXT = JSON.parse(fs.readFileSync('/tmp/user_context.json', 'utf8'));

console.log(`Context: ${USER_CONTEXT.parcels?.length} percelen, ${USER_CONTEXT.products?.length} producten`);

const REGISTRATIONS = [
    { id: 'R01', date: '2026-03-03', input: '3 maart alle conference met merpan 0.7 kg',
      expect: [{ name: 'Merpan', dosage: 0.7, unit: 'kg' }] },
    { id: 'R02', date: '2026-03-05', input: '5 maart alle appels met delan 0.5 kg',
      expect: [{ name: 'Delan', dosage: 0.5, unit: 'kg' }] },
    { id: 'R03', date: '2026-03-10', input: '10 maart alle peren met merpan 0.7 kg en score 0.2L',
      expect: [{ name: 'Merpan', dosage: 0.7, unit: 'kg' }, { name: 'Score', dosage: 0.2, unit: 'L' }] },
    { id: 'R04', date: '2026-03-12', input: '12 maart alle appels met flint 0.15 kg en pirimor 0.5 kg',
      expect: [{ name: 'Flint', dosage: 0.15, unit: 'kg' }, { name: 'Pirimor', dosage: 0.5, unit: 'kg' }] },
    { id: 'R05', date: '2026-03-20', input: '20 maart alle conference met bellis 0.8 kg',
      expect: [{ name: 'Bellis', dosage: 0.8, unit: 'kg' }] },
    { id: 'R06', date: '2026-03-22', input: '22 maart alle appels met regalis plus 1.25 kg',
      expect: [{ name: 'Regalis', dosage: 1.25, unit: 'kg' }] },
    { id: 'R07', date: '2026-03-28', input: '28 maart alle peren met scala 0.75L maar conference niet',
      expect: [{ name: 'Scala', dosage: 0.75, unit: 'L' }], exclusion: 'conference' },
    { id: 'R08', date: '2026-04-01', input: '1 april alle conference met merpan 0.7 kg, flint 0.15 kg en coragen 0.18L',
      expect: [{ name: 'Merpan', dosage: 0.7, unit: 'kg' }, { name: 'Flint', dosage: 0.15, unit: 'kg' }, { name: 'Coragen', dosage: 0.18, unit: 'L' }] },
    { id: 'R09', date: '2026-04-08', input: '8 april alle appels met nissorun 0.2L',
      expect: [{ name: 'Nissorun', dosage: 0.2, unit: 'L' }] },
    { id: 'R10', date: '2026-04-10', input: '10 april alle peren met teldor 1.5 kg',
      expect: [{ name: 'Teldor', dosage: 1.5, unit: 'kg' }] },
];

// ── Supabase REST via curl ──
function sbQuery(table, query = '', method = 'GET', body = null) {
    const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
    const prefer = method === 'POST' ? 'return=representation' : 'return=minimal';
    let cmd = `curl -s -X ${method} '${url}' -H 'apikey: ${SERVICE_KEY}' -H 'Authorization: Bearer ${SERVICE_KEY}' -H 'Content-Type: application/json' -H 'Prefer: ${prefer}'`;
    if (body) {
        const f = `/tmp/sb_${Date.now()}.json`;
        fs.writeFileSync(f, JSON.stringify(body));
        cmd += ` -d @${f}`;
    }
    const r = execSync(cmd, { timeout: 20000, maxBuffer: 50 * 1024 * 1024, encoding: 'utf8' });
    try { return JSON.parse(r); } catch { return r; }
}

// ── AI API call ──
function callAI(message) {
    const body = { message, conversationHistory: [], currentDraft: null, userContext: USER_CONTEXT };
    const f = `/tmp/ai_${Date.now()}.json`;
    const out = `/tmp/ai_out_${Date.now()}.txt`;
    fs.writeFileSync(f, JSON.stringify(body));

    try {
        execSync(
            `curl -s -X POST '${APP_URL}/api/smart-input-v2' -H 'Content-Type: application/json' -H 'Cookie: ${COOKIE}' -d @${f} -o ${out}`,
            { timeout: 90000, maxBuffer: 50 * 1024 * 1024 }
        );
        const result = fs.readFileSync(out, 'utf8');
        const lines = result.split('\n').filter(l => l.trim());
        for (const line of lines) {
            try {
                const d = JSON.parse(line);
                if (d.type === 'complete' && d.response) {
                    return { registration: d.response.registration, response: d.response };
                }
            } catch {}
        }
        return { error: 'No complete response', raw: result.substring(0, 300) };
    } catch (e) {
        return { error: e.message.substring(0, 200) };
    }
}

// ── Check parsing ──
function check(reg, registration) {
    const issues = [];
    if (!registration) return { ok: false, issues: ['Geen registration'], prods: [], plots: 0 };
    const units = registration.units || [];
    if (!units.length) return { ok: false, issues: ['Geen units'], prods: [], plots: 0 };

    let prods = [], plots = [];
    for (const u of units) { prods.push(...(u.products || [])); plots.push(...(u.plots || [])); }

    for (const exp of reg.expect) {
        const found = prods.find(p => p.product?.toLowerCase().includes(exp.name.toLowerCase()));
        if (!found) { issues.push(`"${exp.name}" niet gevonden`); continue; }
        if (Math.abs((found.dosage || 0) - exp.dosage) > 0.02) issues.push(`${exp.name}: dos ${exp.dosage}→${found.dosage}`);
        if (found.unit !== exp.unit) issues.push(`${exp.name}: unit ${exp.unit}→${found.unit}`);
    }
    if (!plots.length) issues.push('Geen percelen');
    if (reg.exclusion) {
        if (plots.some(p => (p.name || '').toLowerCase().includes(reg.exclusion))) issues.push(`"${reg.exclusion}" niet uitgesloten`);
    }
    return { ok: issues.length === 0, issues, prods, plots: plots.length };
}

// ── Save to DB ──
function save(registration, rawInput) {
    const results = [];
    for (const unit of (registration.units || [])) {
        const plotIds = (unit.plots || []).map(p => p.id || p);
        const products = (unit.products || []).map(p => ({ product: p.product, dosage: p.dosage, unit: p.unit }));
        const date = registration.date || unit.date || new Date().toISOString();
        const id = crypto.randomUUID();

        const [saved] = sbQuery('spuitschrift', '', 'POST', {
            id, spuitschrift_id: crypto.randomUUID(), original_logbook_id: null,
            original_raw_input: rawInput, date, plots: plotIds, products,
            validation_message: null, status: 'Akkoord', user_id: USER_ID,
        });

        // Parcel history
        if (plotIds.length > 0) {
            const pids = plotIds.map(i => `"${i}"`).join(',');
            const pdata = sbQuery('sub_parcels', `?id=in.(${pids})&select=id,name,crop,variety`);
            const pmap = {};
            if (Array.isArray(pdata)) for (const p of pdata) pmap[p.id] = p;

            const entries = [];
            for (const pid of plotIds) {
                const info = pmap[pid] || {};
                for (const prod of products) {
                    entries.push({
                        id: crypto.randomUUID(), log_id: null, spuitschrift_id: saved.id,
                        parcel_id: pid, parcel_name: info.name || pid,
                        crop: info.crop || null, variety: info.variety || null,
                        product: prod.product, dosage: prod.dosage, unit: prod.unit,
                        date, user_id: USER_ID,
                    });
                }
            }
            for (let i = 0; i < entries.length; i += 30) {
                sbQuery('parcel_history', '', 'POST', entries.slice(i, i + 30));
            }
        }
        results.push({ id: saved.id, plots: plotIds.length, products: products.length });
    }
    return results;
}

// ══════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   FASE 1: Seizoenssimulatie — 10 Bespuitingen              ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

const results = [];
let parseOK = 0, saveOK = 0;

for (const reg of REGISTRATIONS) {
    console.log(`━━ [${reg.id}] ${reg.date} — "${reg.input}"`);

    // Parse
    process.stdout.write('  📝 Parsing... ');
    const ai = callAI(reg.input);
    if (ai.error) {
        console.log(`❌ ${ai.error}`);
        results.push({ ...reg, pOK: false, sOK: false, issues: [ai.error], prods: [], plots: 0 });
        continue;
    }

    const c = check(reg, ai.registration);
    if (c.ok) {
        parseOK++;
        console.log(`✅ ${c.prods.map(p => `${p.product} ${p.dosage} ${p.unit}`).join(' + ')} (${c.plots} perc.)`);
    } else {
        console.log(`⚠️  ${c.issues.join(' | ')}`);
        if (c.prods.length) console.log(`     Got: ${c.prods.map(p => `${p.product} ${p.dosage} ${p.unit}`).join(' + ')} (${c.plots} perc.)`);
    }

    // Save
    let sOK = false;
    if (ai.registration) {
        process.stdout.write('  💾 Opslaan... ');
        try {
            const sr = save(ai.registration, reg.input);
            saveOK++; sOK = true;
            console.log(`✅ ${sr.length} unit(s), ${sr.reduce((s, r) => s + r.plots, 0)} perc.`);
        } catch (e) { console.log(`❌ ${e.message.substring(0, 150)}`); }
    }

    results.push({ ...reg, pOK: c.ok, sOK, issues: c.issues, prods: c.prods, plots: c.plots });
}

// ── Summary ──
console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║                    RESULTATEN FASE 1                        ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');
console.log(`  AI Parsing:  ${parseOK}/${REGISTRATIONS.length}`);
console.log(`  Opgeslagen:  ${saveOK}/${REGISTRATIONS.length}\n`);

for (const r of results) {
    const p = r.prods?.map(p => `${p.product} ${p.dosage}${p.unit}`).join(', ') || '-';
    console.log(`  ${r.pOK ? '✅' : '❌'} ${r.sOK ? '💾' : '⛔'} [${r.id}] ${r.date} | ${p} | ${r.plots || 0} perc.`);
    if (r.issues?.length) console.log(`     Issues: ${r.issues.join(' | ')}`);
}

// ── DB verification ──
console.log('\n[VERIFICATIE] Database...');
try {
    const sp = sbQuery('spuitschrift', `?user_id=eq.${USER_ID}&date=gte.2026-03-01&date=lte.2026-04-15&order=date.asc&select=id,date,plots,products,status,original_raw_input`);
    console.log(`  📋 Spuitschrift: ${sp.length} entries`);
    for (const e of sp) {
        const d = new Date(e.date).toISOString().split('T')[0];
        const pr = e.products?.map(p => `${p.product} ${p.dosage}${p.unit}`).join(', ') || '-';
        console.log(`    ${d} | ${pr} | ${e.plots?.length} perc. | ${e.status}`);
    }
    const ph = sbQuery('parcel_history', `?user_id=eq.${USER_ID}&date=gte.2026-03-01&date=lte.2026-04-15&select=id`);
    console.log(`  📊 Parcel history: ${ph.length} entries`);
} catch (e) { console.log(`  ⚠️ ${e.message}`); }

console.log('\nFASE 1 VOLTOOID.');

// Save report
fs.writeFileSync('test-results/fase1-results.json', JSON.stringify({
    fase: 1, timestamp: new Date().toISOString(),
    parseScore: `${parseOK}/${REGISTRATIONS.length}`, saveScore: `${saveOK}/${REGISTRATIONS.length}`,
    results: results.map(r => ({ id: r.id, date: r.date, input: r.input, parseOK: r.pOK, saveOK: r.sOK,
        plots: r.plots, products: r.prods?.map(p => `${p.product} ${p.dosage} ${p.unit}`), issues: r.issues })),
}, null, 2));
