/**
 * FASE M: Meststoffen in Slimme Invoer V2 — Grondige Test
 * Fixed: Uses shell scripts for curl to avoid command line length issues
 */

const fs = require('fs');
const { execSync } = require('child_process');

const APP_URL = 'http://localhost:3003';
const COOKIE = fs.readFileSync('/tmp/sb_cookie.txt', 'utf8').trim();
const USER_CONTEXT = JSON.parse(fs.readFileSync('/tmp/user_context_slim.json', 'utf8'));

const TESTS = [
    { id: 'M01', name: 'Pure bladmeststof',
      input: 'vandaag alle peren met chelal omnical 3L',
      expect: { products: [{ name: 'Chelal Omnical', source: 'fertilizer' }], regType: 'spraying' } },
    { id: 'M02', name: 'Pure strooien (KAS gestrooid)',
      input: 'gisteren kalkammonsalpeter gestrooid op alle appels 300kg/ha',
      expect: { products: [{ name: 'Kalkammonsalpeter', source: 'fertilizer' }], regType: 'spreading' } },
    { id: 'M03', name: 'Gemengd GWB + meststof',
      input: 'vandaag alle peren met merpan 2kg en chelal omnical 3L',
      expect: { products: [{ name: 'Merpan', source: 'ctgb' }, { name: 'Chelal', source: 'fertilizer' }], regType: 'spraying' } },
    { id: 'M04', name: 'Alias resolutie (bitterzout)',
      input: 'alle peren met bitterzout 5kg',
      expect: { products: [{ name: 'Bittersalz', source: 'fertilizer' }], regType: 'spraying' } },
    { id: 'M05', name: 'Alleen CTGB, geen interferentie',
      input: 'vandaag alle appels met delan 0.5kg en score 0.2L',
      expect: { products: [{ name: 'Delan', source: 'ctgb' }, { name: 'Score', source: 'ctgb' }], noFert: true } },
    { id: 'M06', name: 'Bemesting keyword',
      input: 'patentkali bemesting alle appels 250kg/ha',
      expect: { products: [{ name: 'Patentkali', source: 'fertilizer' }], regType: 'spreading' } },
    { id: 'M07', name: 'Cross-database preventie',
      input: 'vandaag alle peren met merpan 2kg en ureum 3L',
      expect: { products: [{ name: 'Merpan', source: 'ctgb' }, { name: 'Ureum', source: 'fertilizer' }] } },
    { id: 'M08', name: 'Gemengd + CTGB validatie skip',
      input: 'alle peren met merpan 0.7kg en chelal az 2L en chelal b 1L',
      expect: { products: [{ name: 'Merpan', source: 'ctgb' }, { name: 'Chelal', source: 'fertilizer' }, { name: 'Chelal', source: 'fertilizer' }] } },
    { id: 'M09', name: 'Strooimeststof in spuitmengsel',
      input: 'vandaag alle appels met kas 100kg en delan 0.5kg',
      expect: { products: [{ name: 'Kalkammonsalpeter', source: 'fertilizer' }, { name: 'Delan', source: 'ctgb' }] } },
    { id: 'M10', name: 'Meerdere meststoffen',
      input: 'vandaag alle peren met chelal omnical 3L en bittersalz 5kg en chelal b 1L',
      expect: { minProducts: 3, allFert: true } },
    { id: 'M11', name: 'KAS alias strooien',
      input: 'kas gestrooid op alle conference 300kg/ha',
      expect: { products: [{ name: 'Kalkammonsalpeter', source: 'fertilizer' }], regType: 'spreading' } },
    { id: 'M12', name: 'Hoge dosering meststof (geen CTGB err)',
      input: 'vandaag alle appels met kalkammonsalpeter 500kg/ha gestrooid',
      expect: { products: [{ name: 'Kalkammonsalpeter', source: 'fertilizer' }], regType: 'spreading', noDosErr: true } },
    { id: 'M13', name: 'Chelal-reeks herkenning',
      input: 'alle peren met chelal fe 2L en chelal mn 2L en chelal mg 3L',
      expect: { minProducts: 3, allFert: true } },
    { id: 'M14', name: 'uitgereden keyword',
      input: 'gisteren mengmest uitgereden op alle peren 20000L/ha',
      expect: { regType: 'spreading' } },
    { id: 'M15', name: 'mkp alias (Monokalifosfaat)',
      input: 'vandaag alle peren met mkp 3kg',
      expect: { products: [{ name: 'Monokalifosfaat', source: 'fertilizer' }] } },
];

function callAI(message) {
    const body = { message, conversationHistory: [], currentDraft: null, userContext: USER_CONTEXT };
    const bodyFile = `/tmp/ai_m_${Date.now()}.json`;
    const outFile = `/tmp/ai_m_out_${Date.now()}.txt`;
    fs.writeFileSync(bodyFile, JSON.stringify(body));

    // Write a per-call shell script to avoid cookie escaping issues
    const script = `/tmp/curl_call_${Date.now()}.sh`;
    fs.writeFileSync(script, [
        '#!/bin/bash',
        'COOKIE=$(cat /tmp/sb_cookie.txt)',
        `curl -s -X POST 'http://localhost:3003/api/smart-input-v2' \\`,
        `  -H 'Content-Type: application/json' \\`,
        `  -H "Cookie: $COOKIE" \\`,
        `  -d @"${bodyFile}" \\`,
        `  -o "${outFile}" \\`,
        `  --max-time 90 --connect-timeout 15`,
    ].join('\n'));

    try {
        execSync(`bash "${script}"`, { timeout: 95000, maxBuffer: 50*1024*1024 });
        const result = fs.readFileSync(outFile, 'utf8');
        const lines = result.split('\n').filter(l => l.trim());
        for (const line of lines) {
            try {
                const d = JSON.parse(line);
                if (d.type === 'complete' && d.response) {
                    return { ok: true, response: d.response, registration: d.response.registration };
                }
                if (d.type === 'error') {
                    return { ok: false, error: d.error || d.message || 'error type' };
                }
            } catch {}
        }
        // Check if result is raw JSON (not NDJSON)
        try {
            const d = JSON.parse(result);
            if (d.error) return { ok: false, error: d.error };
        } catch {}
        return { ok: false, error: 'No complete response', raw: result.substring(0, 500) };
    } catch (e) {
        // Check if output file exists with data (curl might have succeeded but execSync failed)
        try {
            if (fs.existsSync(outFile)) {
                const result = fs.readFileSync(outFile, 'utf8');
                if (result.trim()) {
                    const lines = result.split('\n').filter(l => l.trim());
                    for (const line of lines) {
                        try {
                            const d = JSON.parse(line);
                            if (d.type === 'complete' && d.response) {
                                return { ok: true, response: d.response, registration: d.response.registration };
                            }
                        } catch {}
                    }
                }
            }
        } catch {}
        return { ok: false, error: e.message.substring(0, 300) };
    }
}

function checkTest(test, result) {
    const issues = [];
    if (!result.ok) return { pass: false, issues: [result.error] };

    const reg = result.registration;
    const resp = result.response;
    if (!reg) return { pass: false, issues: ['Geen registration'] };

    const units = reg.units || [];
    let allProds = [];
    for (const u of units) allProds.push(...(u.products || []));

    const regType = reg.registrationType || resp?.registrationType;

    // Check regType
    if (test.expect.regType && regType !== test.expect.regType) {
        issues.push(`regType: "${test.expect.regType}" verwacht, "${regType}" gekregen`);
    }

    // Check products
    if (test.expect.products) {
        for (const exp of test.expect.products) {
            const found = allProds.find(p => p.product?.toLowerCase().includes(exp.name.toLowerCase()));
            if (!found) {
                issues.push(`"${exp.name}" niet gevonden in [${allProds.map(p=>p.product).join(', ')}]`);
                continue;
            }
            if (exp.source && found.source !== exp.source) {
                issues.push(`${found.product}: source="${found.source||'undefined'}", verwacht "${exp.source}"`);
            }
        }
    }

    if (test.expect.minProducts && allProds.length < test.expect.minProducts) {
        issues.push(`Min ${test.expect.minProducts} producten verwacht, ${allProds.length} gekregen`);
    }

    if (test.expect.noFert) {
        const ferts = allProds.filter(p => p.source === 'fertilizer');
        if (ferts.length > 0) issues.push(`Onverwachte meststoffen: ${ferts.map(p=>p.product).join(', ')}`);
    }

    if (test.expect.allFert) {
        const nonFerts = allProds.filter(p => p.source && p.source !== 'fertilizer');
        if (nonFerts.length > 0) issues.push(`Niet-meststoffen: ${nonFerts.map(p=>p.product+'='+p.source).join(', ')}`);
    }

    return { pass: issues.length === 0, issues, prods: allProds, regType };
}

// ══════════════════════════════════════
// MAIN
// ══════════════════════════════════════
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   FASE M: Meststoffen Test — 15 Scenario\'s                 ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

const results = [];
let pass = 0;

for (const test of TESTS) {
    console.log(`━━ [${test.id}] ${test.name}`);
    console.log(`   "${test.input}"`);
    process.stdout.write('   → ');

    const result = callAI(test.input);
    const c = checkTest(test, result);

    if (c.pass) {
        pass++;
        const prods = c.prods?.map(p => `${p.source==='fertilizer'?'🌱':'🧪'}${p.product} ${p.dosage}${p.unit}`).join(' + ') || '-';
        console.log(`✅ [${c.regType||'?'}] ${prods}`);
    } else {
        console.log('❌');
        for (const i of c.issues) console.log(`     ⚠️ ${i}`);
        if (c.prods?.length) console.log(`     Got: ${c.prods.map(p=>`${p.product}(${p.source||'?'})`).join(', ')}`);
    }
    console.log();
    results.push({ id: test.id, name: test.name, pass: c.pass, issues: c.issues, prods: c.prods, regType: c.regType });
}

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log(`║  RESULTAAT: ${pass}/${TESTS.length} PASS                                        ║`);
console.log('╚══════════════════════════════════════════════════════════════╝\n');

for (const r of results) {
    console.log(`  ${r.pass?'✅':'❌'} [${r.id}] ${r.name}${r.issues?.length?' — '+r.issues[0]:''}`);
}

fs.writeFileSync('test-results/fase-m-results.json', JSON.stringify({ fase: 'M', score: `${pass}/${TESTS.length}`, results }, null, 2));
console.log('\nResultaten → test-results/fase-m-results.json');
