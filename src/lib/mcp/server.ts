/**
 * CropNode MCP-server (Model Context Protocol, Streamable HTTP, stateless).
 * JSON-RPC 2.0 over POST; ondersteund: initialize, ping, tools/list, tools/call
 * en notificaties. Zelfde opzet als de StoreNode-MCP zodat beide in één chat werken.
 */

import { TOOLS, voerToolUit } from './tools';

export const MCP_PROTOCOL = '2025-06-18';

export interface RpcVerzoek {
  jsonrpc: '2.0';
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

export function rpcFout(id: RpcVerzoek['id'], code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

const INSTRUCTIONS =
  'CropNode is de gewasbeschermings-, bemestings-, weer- en notitie-administratie van deze fruitteler (appel/peer, Jager Tech). ' +
  'Antwoord in het Nederlands, nuchter en kort. ' +
  'Registreren (registreer_bespuiting, keur_concept_goed): roep EERST aan zonder bevestig, leg het VOORSTEL letterlijk aan de gebruiker voor en roep pas na een expliciet "ja" opnieuw aan met bevestig=true en dezelfde gegevens. ' +
  'Perceel- en middelnamen mogen slordig zijn; de tools zoeken fuzzy en melden twijfel — vraag dan door in plaats van te gokken. Gebruik de tool percelen om namen te herkennen. ' +
  'Doseringen zijn per hectare, tenzij de gebruiker "totaal" zegt (dan rekent CropNode het om naar per ha). ' +
  'Voor "wat/welke percelen heb ik (niet) gedaan" gebruik je percelen_status; voor "wat heb ik gespoten" bespuitingen. ' +
  'Oogst, kisten, koelcellen en sortering horen bij StoreNode (aparte connector), niet bij CropNode.';

export async function handleRpc(userId: string, verzoek: RpcVerzoek): Promise<unknown | null> {
  const { id, method, params } = verzoek;
  if (method.startsWith('notifications/')) return null;

  switch (method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: typeof params?.protocolVersion === 'string' ? params.protocolVersion : MCP_PROTOCOL,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'CropNode', version: '1.0.0' },
          instructions: INSTRUCTIONS,
        },
      };
    case 'ping':
      return { jsonrpc: '2.0', id, result: {} };
    case 'tools/list':
      return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
    case 'tools/call': {
      const naam = typeof params?.name === 'string' ? params.name : '';
      const args = (params?.arguments as Record<string, unknown> | undefined) ?? {};
      try {
        const r = await voerToolUit(userId, naam, args);
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: r.tekst }], isError: !!r.fout } };
      } catch (e) {
        const melding = e instanceof Error ? e.message : String(e);
        console.error(`[mcp] tool ${naam} mislukt:`, melding);
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `Mislukt: ${melding}` }], isError: true } };
      }
    }
    default:
      return rpcFout(id, -32601, `Onbekende methode: ${method}`);
  }
}
