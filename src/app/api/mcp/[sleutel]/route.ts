/**
 * POST /api/mcp/<sleutel>  — CropNode MCP-server voor Claude (custom connector).
 * De sleutel komt uit Instellingen › Claude-koppeling; alternatief: Authorization: Bearer <sleutel>.
 * Geen cookie-sessie: de sleutel bepaalt de gebruiker, alle data-toegang is expliciet op user_id gescoopt.
 */

import { resolveUserIdForKey } from '@/lib/mcp/auth';
import { handleRpc, rpcFout, type RpcVerzoek } from '@/lib/mcp/server';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, mcp-session-id, mcp-protocol-version',
  'access-control-allow-methods': 'POST, GET, OPTIONS',
};

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS, ...extra },
  });
}

function sleutelUit(request: Request, pathSleutel: string): string | null {
  const auth = request.headers.get('authorization');
  if (auth?.toLowerCase().startsWith('bearer ')) {
    const s = auth.slice(7).trim();
    // Supabase's eigen anon/service JWT's zijn geen koppelsleutel.
    if (s && !s.startsWith('eyJ')) return s;
  }
  return /^[a-f0-9]{32,64}$/i.test(pathSleutel) ? pathSleutel : null;
}

type Ctx = { params: Promise<{ sleutel: string }> };

export async function OPTIONS() {
  return json(204, null);
}

export async function GET() {
  return json(405, { fout: 'Gebruik POST (JSON-RPC). Zie CropNode → Instellingen → Claude-koppeling.' }, { allow: 'POST' });
}

export async function POST(request: Request, ctx: Ctx) {
  const { sleutel: pathSleutel } = await ctx.params;
  const sleutel = sleutelUit(request, pathSleutel);
  if (!sleutel) return json(401, { fout: 'Koppelsleutel ontbreekt (in de URL of als Bearer-token).' }, { 'www-authenticate': 'Bearer' });

  const userId = await resolveUserIdForKey(sleutel);
  if (!userId) return json(401, { fout: 'Koppelsleutel onbekend of ingetrokken.' }, { 'www-authenticate': 'Bearer' });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, rpcFout(null, -32700, 'Geen geldige JSON.'));
  }

  if (Array.isArray(body)) {
    const antwoorden = (await Promise.all(body.map(v => handleRpc(userId, v as RpcVerzoek)))).filter(a => a !== null);
    return antwoorden.length ? json(200, antwoorden) : json(202, null);
  }
  const verzoek = body as RpcVerzoek;
  if (!verzoek || verzoek.jsonrpc !== '2.0' || typeof verzoek.method !== 'string') {
    return json(400, rpcFout(null, -32600, 'Geen geldig JSON-RPC-verzoek.'));
  }
  const antwoord = await handleRpc(userId, verzoek);
  return antwoord === null ? json(202, null) : json(200, antwoord);
}
