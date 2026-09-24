/**
 * test-mcp.ts — CropNode MCP-tools testen zonder Claude.
 *
 * Direct (geen HTTP/auth, roept voerToolUit aan):
 *   npx tsx scripts/test-mcp.ts --user <uuid> percelen
 *   npx tsx scripts/test-mcp.ts --user <uuid> percelen_status '{"middel":"captan","dagen":21}'
 *   npx tsx scripts/test-mcp.ts --user <uuid> registreer_bespuiting '{"tekst":"busje met merpan 1,5 kg"}'
 *
 * Via HTTP (JSON-RPC, met koppelsleutel in de URL):
 *   npx tsx scripts/test-mcp.ts --http https://<host>/api/mcp/<sleutel> tools/list
 *   npx tsx scripts/test-mcp.ts --http <url> tools/call '{"name":"percelen","arguments":{}}'
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env.local') });

async function main() {
  const args = process.argv.slice(2);
  const httpIdx = args.indexOf('--http');
  const userIdx = args.indexOf('--user');
  const rest = args.filter((a, i) => i !== httpIdx && i !== httpIdx + 1 && i !== userIdx && i !== userIdx + 1);
  const naam = rest[0];
  const params = rest[1] ? JSON.parse(rest[1]) : {};

  if (httpIdx >= 0) {
    const url = args[httpIdx + 1];
    const method = naam || 'tools/list';
    const body = method === 'initialize'
      ? { jsonrpc: '2.0', id: 1, method, params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } } }
      : { jsonrpc: '2.0', id: 1, method, params };
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    console.log(`HTTP ${res.status}`);
    const text = await res.text();
    try {
      const j = JSON.parse(text);
      const content = j?.result?.content?.[0]?.text;
      console.log(content ?? JSON.stringify(j, null, 2));
    } catch {
      console.log(text);
    }
    return;
  }

  const userId = userIdx >= 0 ? args[userIdx + 1] : process.env.TEST_USER_ID;
  if (!userId || !naam) {
    console.error('Gebruik: npx tsx scripts/test-mcp.ts --user <uuid> <tool> [json-args]  |  --http <url> <method> [json-params]');
    process.exit(1);
  }
  const { voerToolUit, TOOLS } = await import('../src/lib/mcp/tools');
  if (naam === 'list') {
    for (const t of TOOLS) console.log(`- ${t.name}: ${t.description.slice(0, 100)}…`);
    return;
  }
  const started = Date.now();
  const r = await voerToolUit(userId, naam, params);
  console.log(`\n[${naam}] ${r.fout ? 'FOUT' : 'OK'} in ${Date.now() - started}ms\n`);
  console.log(r.tekst);
}

main().catch(err => {
  console.error('❌', err);
  process.exit(1);
});
