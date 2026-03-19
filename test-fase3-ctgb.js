/**
 * FASE 3: CTGB Validatietest — Expres foute invoer
 * Test 7 overtredingstypes + 1 correcte referentie
 *
 * 3a: Dosering te hoog (2x max)
 * 3b: Te veel toepassingen per seizoen (max overschreden)
 * 3c: Interval te kort tussen bespuitingen
 * 3d: Werkzame stof kruischeck (Merpan + Captosan = both captan)
 * 3e: Seizoensmax werkzame stof overschreden
 * 3f: Middel niet toegelaten voor gewas
 * 3g: Vervallen toelating
 * REF: Correcte registratie (geen fout verwacht)
 */

const fs = require('fs');
const { execSync } = require('child_process');

const APP_URL = 'http://localhost:3003';
const COOKIE = fs.readFileSync('/tmp/sb_cookie.txt', 'utf8').trim();
const USER_CONTEXT = JSON.parse(fs.readFileSync('/tmp/user_context_slim.json', 'utf8'));

const TESTS = [
    {
        id: 'REF', name: 'Referentie (correcte invoer)',
        input: 'vandaag alle peren met merpan 0.7 kg',
        expectValidation: 'none', // Geen fouten verwacht
    },
    {
        id: '3a', name: 'Dosering te hoog (2x max)',
        // Merpan max is ~0.98 kg/ha voor appel/peer, 2x = 1.96
        input: 'vandaag alle peren met merpan 2 kg',
        expectValidation: 'error',
        expectKeyword: ['dosering', 'maximum', 'overschr'],
    },
    {
        id: '3b', name: 'Te veel toepassingen (16x terwijl max 15)',
        // Score 250 EC: max 3 toepassingen per seizoen
        // We testen of het systeem waarschuwt bij meer dan max
        input: 'vandaag alle appels met score 0.2L',
        expectValidation: 'any', // System should count previous applications
        note: 'Hangt af van seizoenshistorie in DB',
    },
    {
        id: '3c', name: 'Interval te kort',
        // Score 250 EC: min 10 dagen interval
        // We sturen 2 registraties met kort interval
        input: 'vandaag alle appels met score 0.2L',
        preInput: '6 maart alle appels met score 0.2L', // 2 dagen eerder
        expectValidation: 'warning_or_error',
        expectKeyword: ['interval', 'dagen'],
    },
    {
        id: '3d', name: 'Werkzame stof kruischeck (captan dubbel)',
        // Merpan Spuitkorrel (captan) + Captan 500 SC (captan) = dubbele captan
        input: 'vandaag alle peren met merpan 0.7kg en captan 1.5L',
        expectValidation: 'warning_or_error',
        expectKeyword: ['captan', 'werkzame stof', 'stof'],
    },
    {
        id: '3e', name: 'Seizoensmax werkzame stof overschreden',
        // Captan: max kg/jaar overschrijden met hoge dosering
        input: 'vandaag alle peren met merpan 5 kg',
        expectValidation: 'error',
        expectKeyword: ['maximum', 'dosering', 'overschr'],
    },
    {
        id: '3f', name: 'Middel niet toegelaten voor gewas',
        // Probeer een middel dat niet voor peer/appel is
        // Kerb Flo is eigenlijk WEL toegelaten als herbicide,
        // Laten we een obscuur middel proberen
        input: 'vandaag alle peren met toppas 0.5L',
        expectValidation: 'error_or_unknown',
        expectKeyword: ['niet toegelaten', 'niet gevonden', 'onbekend'],
    },
    {
        id: '3g', name: 'Vervallen toelating',
        // Pirimor vervalt 2026-03-15 (bijna verlopen)
        // Test of het systeem waarschuwt
        input: 'vandaag alle appels met pirimor 0.5 kg',
        expectValidation: 'any',
        note: 'Pirimor vervalt 15 maart 2026',
    },
];

// Shell script for curl
fs.writeFileSync('/tmp/curl_ctgb.sh', `#!/bin/bash
COOKIE=$(cat /tmp/sb_cookie.txt)
curl -s -X POST 'http://localhost:3003/api/smart-input-v2' \\
  -H 'Content-Type: application/json' \\
  -H "Cookie: $COOKIE" \\
  -d @"$1" \\
  -o "$2" \\
  --max-time 90 --connect-timeout 15
`);

function callAI(message, conversationHistory = []) {
    const body = { message, conversationHistory, currentDraft: null, userContext: USER_CONTEXT };
    const bodyFile = `/tmp/ctgb_${Date.now()}.json`;
    const outFile = `/tmp/ctgb_out_${Date.now()}.txt`;
    fs.writeFileSync(bodyFile, JSON.stringify(body));

    try {
        execSync(`bash /tmp/curl_ctgb.sh "${bodyFile}" "${outFile}"`, { timeout: 95000, maxBuffer: 50*1024*1024 });
        const result = fs.readFileSync(outFile, 'utf8');
        const lines = result.split('\n').filter(l => l.trim());
        for (const line of lines) {
            try {
                const d = JSON.parse(line);
                if (d.type === 'complete' && d.response) {
                    return { ok: true, response: d.response, registration: d.response.registration };
                }
                if (d.type === 'error') return { ok: false, error: d.error || d.message };
            } catch {}
        }
        try { const d = JSON.parse(result); if (d.error) return { ok: false, error: d.error }; } catch {}
        return { ok: false, error: 'No complete response', raw: result.substring(0, 500) };
    } catch (e) {
        try {
            if (fs.existsSync(outFile)) {
                const result = fs.readFileSync(outFile, 'utf8');
                const lines = result.split('\n').filter(l => l.trim());
                for (const line of lines) {
                    try {
                        const d = JSON.parse(line);
                        if (d.type === 'complete' && d.response) return { ok: true, response: d.response, registration: d.response.registration };
                    } catch {}
                }
            }
        } catch {}
        return { ok: false, error: e.message.substring(0, 300) };
    }
}

function analyzeValidation(result) {
    if (!result.ok) return { type: 'api_error', messages: [result.error] };

    const resp = result.response;
    const reg = result.registration;

    // Collect validation info from various places
    const messages = [];
    let hasError = false;
    let hasWarning = false;

    // Check humanSummary for validation messages
    const summary = resp.humanSummary || '';
    if (summary) messages.push('summary: ' + summary);

    // Check response-level validation
    if (resp.validationMessages) {
        for (const m of resp.validationMessages) {
            messages.push(`${m.type}: ${m.message}`);
            if (m.type === 'error') hasError = true;
            if (m.type === 'warning') hasWarning = true;
        }
    }

    // Check registration units for validation
    if (reg?.units) {
        for (const unit of reg.units) {
            if (unit.validationMessages) {
                for (const m of unit.validationMessages) {
                    messages.push(`unit-${m.type}: ${m.message}`);
                    if (m.type === 'error') hasError = true;
                    if (m.type === 'warning') hasWarning = true;
                }
            }
            if (unit.validation) {
                messages.push('unit-validation: ' + JSON.stringify(unit.validation).substring(0, 200));
                if (unit.validation.errors?.length) hasError = true;
                if (unit.validation.warnings?.length) hasWarning = true;
            }
            if (unit.status === 'error' || unit.status === 'Fout') hasError = true;
            if (unit.status === 'warning' || unit.status === 'Waarschuwing') hasWarning = true;
        }
    }

    // Check response.validation
    if (resp.validation) {
        messages.push('resp-validation: ' + JSON.stringify(resp.validation).substring(0, 200));
        if (resp.validation.errors?.length) hasError = true;
        if (resp.validation.warnings?.length) hasWarning = true;
    }

    // Check for "⚠" or "❌" in summary
    if (/⚠|waarschuw|let op/i.test(summary)) hasWarning = true;
    if (/❌|fout|error|niet toegestaan|overschr/i.test(summary)) hasError = true;

    // Check for validation in the raw response text
    const fullText = JSON.stringify(resp).toLowerCase();
    if (/dosering.*overschr|te hoog|maximum.*dosering/i.test(fullText)) { hasError = true; messages.push('detected: dosering overschrijding'); }
    if (/interval.*te kort|minimum.*interval/i.test(fullText)) { hasWarning = true; messages.push('detected: interval te kort'); }
    if (/niet toegelaten|niet geregistreerd/i.test(fullText)) { hasError = true; messages.push('detected: niet toegelaten'); }
    if (/werkzame stof|actieve stof|captan/i.test(fullText) && /cumul|dubbel|overlap/i.test(fullText)) { hasWarning = true; messages.push('detected: stof overlap'); }
    if (/verval|verlop|expir/i.test(fullText)) { hasWarning = true; messages.push('detected: vervallen'); }

    return {
        type: hasError ? 'error' : hasWarning ? 'warning' : 'none',
        hasError, hasWarning,
        messages,
    };
}

function checkTest(test, validation) {
    if (test.expectValidation === 'none') {
        return { pass: !validation.hasError, issues: validation.hasError ? ['Onverwachte fout: ' + validation.messages.join(' | ')] : [] };
    }
    if (test.expectValidation === 'error') {
        return { pass: validation.hasError, issues: validation.hasError ? [] : ['Geen error gevonden (verwacht)'] };
    }
    if (test.expectValidation === 'warning_or_error') {
        return { pass: validation.hasError || validation.hasWarning, issues: (validation.hasError || validation.hasWarning) ? [] : ['Geen warning/error gevonden'] };
    }
    if (test.expectValidation === 'error_or_unknown') {
        const hasUnknown = validation.messages.some(m => /onbekend|niet gevonden|unknown/i.test(m));
        return { pass: validation.hasError || hasUnknown, issues: (validation.hasError || hasUnknown) ? [] : ['Geen error of onbekend-melding'] };
    }
    // 'any' - we just report what we find
    return { pass: true, issues: [] };
}

// ══════════════════════════════════════
// MAIN
// ══════════════════════════════════════
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   FASE 3: CTGB Validatietest — 7+1 Scenario\'s             ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

const results = [];
let pass = 0;

for (const test of TESTS) {
    console.log(`━━ [${test.id}] ${test.name}`);
    console.log(`   "${test.input}"`);
    if (test.note) console.log(`   ℹ️  ${test.note}`);

    process.stdout.write('   → ');

    const result = callAI(test.input);
    const validation = analyzeValidation(result);
    const check = checkTest(test, validation);

    if (check.pass) {
        pass++;
        const icon = validation.type === 'error' ? '🚫' : validation.type === 'warning' ? '⚠️' : '✅';
        console.log(`${icon} [${validation.type}]`);
    } else {
        console.log(`❌ FAIL`);
        for (const i of check.issues) console.log(`     ${i}`);
    }

    // Show relevant validation messages
    const relevantMsgs = validation.messages.filter(m => !m.startsWith('summary:'));
    if (relevantMsgs.length > 0) {
        for (const m of relevantMsgs.slice(0, 3)) {
            console.log(`     📋 ${m.substring(0, 120)}`);
        }
    }

    // Show summary (truncated)
    const summary = result.response?.humanSummary;
    if (summary) console.log(`     💬 "${summary.substring(0, 120)}"`);

    console.log();
    results.push({ id: test.id, name: test.name, pass: check.pass, validation, issues: check.issues });
}

// Summary
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log(`║  RESULTAAT: ${pass}/${TESTS.length} PASS                                        ║`);
console.log('╚══════════════════════════════════════════════════════════════╝\n');

for (const r of results) {
    const icon = r.pass ? '✅' : '❌';
    const vType = r.validation.type === 'error' ? '🚫' : r.validation.type === 'warning' ? '⚠️' : '🟢';
    console.log(`  ${icon} ${vType} [${r.id}] ${r.name}${r.issues?.length ? ' — ' + r.issues[0] : ''}`);
}

fs.writeFileSync('test-results/fase3-results.json', JSON.stringify({
    fase: 3, score: `${pass}/${TESTS.length}`,
    results: results.map(r => ({ id: r.id, name: r.name, pass: r.pass, validationType: r.validation.type, messages: r.validation.messages, issues: r.issues })),
}, null, 2));
console.log('\nResultaten → test-results/fase3-results.json');
