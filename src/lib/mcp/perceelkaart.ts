/**
 * Perceelkaart in de CropNode MCP: zelfde GeoJSON als de knop "Perceelkaart downloaden" (perceelgrens, rijen,
 * machinematen, controles). Alleen lezen, dus geen bevestig-stap. Past het niet in één antwoord, dan komt de
 * grens met metadata.vervolg: de aanroepen voor de rijen in stukken.
 */

import { laadPerceelkaart } from '@/lib/rijen/perceelkaart-store';
import {
  PERCEELKAART_DELEN,
  nummersUitTekst,
  perceelkaartDeel,
  rijStukken,
  type Perceelkaart,
  type PerceelkaartDeel,
} from '@/lib/rijen/perceelkaart';
import type { McpContext } from './context';
import { vindHoofdperceel } from './rijen';
import { str, type Args, type ToolDefinitie, type ToolResultaat } from './util';

/** Tekens per antwoord: ruim onder de gebruikelijke limiet voor een MCP-antwoord (~25.000 tokens) */
export const MAX_PERCEELKAART_TEKENS = 50_000;

export const PERCEELKAART_TOOLS: ToolDefinitie[] = [
  {
    name: 'perceelkaart',
    description:
      'Perceelkaart als GeoJSON (alleen lezen, geen bevestiging nodig): perceelgrens, alle actieve rijen en de maten voor een zelfrijdende machine (Jager Core) — buurrijen links/rechts, afstand hart op hart langs de rij (min/mediaan/max en per 10 m), ruimte tot de perceelgrens aan beide uiteinden — plus controles. Geometrie in WGS84, properties.rd in RD New (EPSG:28992). Zelfde inhoud als de knop "Perceelkaart downloaden". Wat CropNode niet weet is null. Te groot voor één antwoord: je krijgt de grens met metadata.vervolg = de aanroepen voor de rest (deel "rijen" met rijen "1-40" enz.).',
    inputSchema: {
      type: 'object',
      properties: {
        perceel: { type: 'string', description: 'Naam van het perceel (slordig mag), bijv. "murre".' },
        deel: { type: 'string', enum: [...PERCEELKAART_DELEN], description: 'Alleen dit deel: grens, rijen of obstakels (metadata blijft volledig).' },
        rijen: { type: 'string', description: 'Alleen bij deel "rijen": deze rijnummers, bijv. "1-40".' },
      },
      required: ['perceel'],
      additionalProperties: false,
    },
  },
];

function metVervolg(kaart: Perceelkaart, basis: Perceelkaart, reden: string): string {
  const aanroepen: { deel: PerceelkaartDeel; rijen?: string }[] = [
    ...rijStukken(kaart, MAX_PERCEELKAART_TEKENS).map(rijen => ({ deel: 'rijen' as const, rijen })),
    { deel: 'obstakels' },
  ];
  return JSON.stringify({ ...basis, metadata: { ...basis.metadata, vervolg: { reden, aanroepen } } });
}

export async function perceelkaartTool(ctx: McpContext, args: Args): Promise<ToolResultaat> {
  const naam = str(args.perceel);
  if (!naam) return { tekst: 'Geef het perceel op (bijv. perceel "Murre").', fout: true };
  const hoofd = vindHoofdperceel(ctx, naam);
  if ('fout' in hoofd) return { tekst: hoofd.fout, fout: true };

  const deelTekst = str(args.deel).toLowerCase();
  if (deelTekst && !(PERCEELKAART_DELEN as readonly string[]).includes(deelTekst)) {
    return { tekst: `Onbekend deel "${deelTekst}": kies grens, rijen of obstakels.`, fout: true };
  }
  const deel = (deelTekst || null) as PerceelkaartDeel | null;
  const rijenTekst = str(args.rijen);
  if (rijenTekst && deel !== 'rijen') return { tekst: 'rijen kan alleen samen met deel "rijen".', fout: true };
  const nummers = rijenTekst ? nummersUitTekst(rijenTekst) : null;
  if (rijenTekst && !nummers) return { tekst: `Rijnummers niet herkend: "${rijenTekst}" (bijv. "1-40" of "1-10, 15").`, fout: true };

  const kaart = await laadPerceelkaart(ctx.userId, hoofd.id);
  if (!kaart) return { tekst: `Perceel ${hoofd.naam} niet gevonden.`, fout: true };

  const uit = deel ? perceelkaartDeel(kaart, deel, nummers ? { nummers, tekst: rijenTekst } : undefined) : kaart;
  const tekst = JSON.stringify(uit);
  if (tekst.length <= MAX_PERCEELKAART_TEKENS) return { tekst };

  const kb = Math.round(tekst.length / 1000);
  if (!deel) {
    return { tekst: metVervolg(kaart, perceelkaartDeel(kaart, 'grens'), `De hele kaart is te groot voor één antwoord (${kb} kB). Hier de grens en de metadata; haal de rijen op met de aanroepen hieronder.`) };
  }
  if (deel === 'rijen') {
    const leeg = { ...perceelkaartDeel(kaart, 'rijen'), features: [] };
    return {
      tekst: metVervolg(kaart, leeg, `${nummers ? 'Deze rijen zijn' : 'Alle rijen samen zijn'} te groot voor één antwoord (${kb} kB); haal ze op in deze stukken.`),
    };
  }
  return { tekst }; // grens of obstakels: altijd heel teruggeven
}
