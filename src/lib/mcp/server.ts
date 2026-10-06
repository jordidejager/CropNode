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
  'SCHRIJVEN (registreer_bespuiting, bespuiting_aanpassen, keur_concept_goed, uren_registreren, uren_aanpassen, klus_starten, klus_wijzigen, klus_stoppen, werkschema_wijzigen, voorraad_bijwerken, verwijderen): roep EERST aan zonder bevestig, leg het VOORSTEL aan de gebruiker voor en roep pas na een expliciet "ja" opnieuw aan met bevestig=true en exact dezelfde argumenten. ' +
  'NIEUW vs CORRECTIE: een nieuwe bespuiting → registreer_bespuiting. Iets toevoegen aan, wijzigen in of weghalen uit een bestaande bespuiting (middel erbij, andere dosering, ander perceel/deel, andere tijd, of verwijderen) → bespuiting_aanpassen, NOOIT een tweede registratie. Zonder zoekterm pakt bespuiting_aanpassen de laatst ingevoerde registratie. ' +
  'registreer_bespuiting: geef bij voorkeur percelen en middelen gestructureerd mee. Deels gespoten perceel → percelen[{naam, deel:"helft"|"kwart"|"een derde"} of {naam, ha:3.33}]. Middel: dosering (per ha) óf totaal (totale hoeveelheid; CropNode verdeelt die over het GESPOTEN oppervlak). Zet in middelen.naam alleen de naam, zonder dosering. Tijd: datum + tijd (bijv. datum "gisteren", tijd "20:00"). ' +
  'Perceel- en middelnamen mogen slordig zijn; de tools zoeken fuzzy (ook op oude namen/synoniemen) en melden twijfel — vraag dan door in plaats van te gokken. Gebruik de tool percelen om namen te herkennen. Een middel dat niet in de database staat mag gewoon: het wordt opgeslagen onder de naam die de gebruiker noemt. ' +
  'Lezen: percelen_status ("welke percelen heb ik (niet) gedaan"), bespuitingen (met codes voor aanpassen), uren, voorraad, veldnotities (met codes), spuit_inbox (WhatsApp-concepten), weer, nu, middel_info, middelen_tegen. ' +
  'UREN: een ploeg die ergens bezig is = een KLUS. "Vanaf vandaag met 6 man plukken op Spoor" → klus_starten; uren tellen dan automatisch per werkdag volgens het werkschema. Afwijkingen (iemand ziek, later begonnen, eerder gestopt, niet gewerkt) → klus_wijzigen met datum; ploeg blijvend kleiner/groter → klus_wijzigen met personen_vanaf; deel van de ploeg ergens anders → personen_vanaf op de ene klus + klus_starten voor de andere; perceel klaar → klus_stoppen (legt de uren per dag vast). "Wat loopt er?" → klussen. Losse of achteraf gewerkte uren → uren_registreren (uren weglaten = werkschema). Werktijden structureel anders → werkschema_wijzigen. Gebruik oogst_voortgang (StoreNode-pluk per perceel: eerste/laatste plukdag, kisten, kg, kg per manuur) om bij plukken/sorteren te vragen of een perceel klaar is en om uren achteraf voor te stellen. Waarschuw bij klussen die al weken lopen. ' +
  'RIJEN (beta): percelen kunnen rijen hebben; de tool rijen toont per perceel de blokken, rijnummers, bestuiverrijen en het rij-oppervlak (percelen toont een korte regel). ' +
  'Alleen een deel van de rijen gespoten → registreer_bespuiting met percelen[{naam, rijen:"1-20, 24"}] (of rijen op topniveau als het om één perceel gaat), niet samen met deel/ha; rijen mag ook een bloknaam zijn ("blok Conference 2018"), "bestuivers" of "alle behalve 5". ' +
  'Notitie bij een rij → veldnotitie met percelen [precies één perceel], rijen "12" en optioneel positie_m (meters vanaf het begin van de rij). Geen rijen bekend → gewoon zonder rijen werken. ' +
  'Spuituren worden automatisch uit het spuitschrift berekend; registreer die niet apart. Verbruik door bespuitingen wordt automatisch van de voorraad afgeboekt; voorraad_bijwerken is voor leveringen en tellingen. ' +
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
          serverInfo: { name: 'CropNode', version: '1.3.0' },
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
