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
  'CropNode is de gewasbeschermings-, bemestings-, uren-, voorraad-, weer- en notitie-administratie van deze fruitteler (appel/peer, Jager Tech). ' +
  'Antwoord in het Nederlands, nuchter en kort. ' +
  'SCHRIJVEN (registreer_bespuiting, bespuiting_aanpassen, keur_concept_goed, uren_registreren, uren_aanpassen, voorraad_bijwerken, verwijderen): roep EERST aan zonder bevestig, leg het VOORSTEL aan de gebruiker voor en roep pas na een expliciet "ja" opnieuw aan met bevestig=true en exact dezelfde argumenten. ' +
  'NIEUW vs CORRECTIE: een nieuwe bespuiting → registreer_bespuiting. Iets toevoegen aan, wijzigen in of weghalen uit een bestaande bespuiting (middel erbij, andere dosering, ander perceel/deel, andere tijd, of verwijderen) → bespuiting_aanpassen, NOOIT een tweede registratie. Zonder zoekterm pakt bespuiting_aanpassen de laatst ingevoerde registratie. ' +
  'registreer_bespuiting: geef bij voorkeur percelen en middelen gestructureerd mee. Deels gespoten perceel → percelen[{naam, deel:"helft"|"kwart"|"een derde"} of {naam, ha:3.33}]. Middel: dosering (per ha) óf totaal (totale hoeveelheid; CropNode verdeelt die over het GESPOTEN oppervlak). Zet in middelen.naam alleen de naam, zonder dosering. Tijd: datum + tijd (bijv. datum "gisteren", tijd "20:00"). ' +
  'Perceel- en middelnamen mogen slordig zijn; de tools zoeken fuzzy (ook op oude namen/synoniemen) en melden twijfel — vraag dan door in plaats van te gokken. Gebruik de tool percelen om namen te herkennen. Een middel dat niet in de database staat mag gewoon: het wordt opgeslagen onder de naam die de gebruiker noemt. ' +
  'Lezen: percelen_status ("welke percelen heb ik (niet) gedaan"), bespuitingen (met codes voor aanpassen), uren, voorraad, veldnotities (met codes), spuit_inbox (WhatsApp-concepten), weer, nu, middel_info, middelen_tegen. ' +
  'Spuituren worden automatisch uit het spuitschrift berekend; registreer die niet apart met uren_registreren. Verbruik door bespuitingen wordt automatisch van de voorraad afgeboekt; voorraad_bijwerken is voor leveringen en tellingen. ' +
  'Oogst, kisten, koelcellen, verladingen en sortering horen bij StoreNode (aparte connector), niet bij CropNode.';

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
          serverInfo: { name: 'CropNode', version: '1.1.0' },
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
