'use server';

/**
 * Rijenkaart (beta) — server actions. Dunne wrappers rond src/lib/rijen/store.ts en
 * src/lib/rijen/koppelingen.ts met de ingelogde gebruiker (cookie-sessie).
 *
 * Fouten worden gegooid als Error met een Nederlandse melding. Let op: in een
 * productie-build vervangt React de message van een fout uit een server action door
 * een algemene tekst. De melding staat daarom ook in `digest`; gebruik
 * `rijenFoutmelding(err)` uit '@/hooks/use-rijen' om hem in de UI te tonen.
 */

import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import {
  laadRijenkaart,
  laadRijenOverzicht,
  rijenGeoJSON,
  rijenToepassen,
  slaBlokOp,
  verwijderBlok,
  zetBeginkant,
  zetNummeringStart,
  zetRijAttributen,
} from '@/lib/rijen/store';
import {
  koppelNotitieAanRijen,
  maakRijNotitie,
  rijenVoorBespuitingen,
  rijenVoorNotities,
  rijSelectieNaarPlots,
  type BespuitingRijenInfo,
  type NotitieRijInfo,
  type RijKoppeling,
  type RijSelectieOppervlak,
} from '@/lib/rijen/koppelingen';
import type {
  Blok,
  BlokInvoer,
  RijAttributen,
  Rijenkaart,
  RijenSamenvatting,
  RijenToepassenResultaat,
  RijInstellingenUpdate,
  RijWijziging,
} from '@/lib/rijen/types';

export type {
  BespuitingRijenInfo,
  NotitieRijInfo,
  RijKoppeling,
  RijSelectieOppervlak,
} from '@/lib/rijen/koppelingen';

/** Moet gelijk blijven aan RIJEN_FOUT_PREFIX in src/hooks/use-rijen.ts */
const FOUT_PREFIX = 'rijenkaart:';

async function requireUserId(): Promise<string> {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (user?.id) return user.id;
  // Alleen als de auth-server onbereikbaar is terugvallen op de cookie-sessie. Bij een ongeldige of
  // vervalste token (AuthApiError, bv. bad_jwt) nooit: getSession() controleert de handtekening niet,
  // en alle rijen-functies draaien met de admin-client voor dit user_id.
  if (error && isAuthRetryableFetchError(error)) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id) return session.user.id;
  }
  throw new Error('Niet ingelogd.');
}

function nlFout(e: unknown): Error {
  const message = e instanceof Error && e.message ? e.message : 'Er ging iets mis. Probeer het opnieuw.';
  const fout = new Error(message) as Error & { digest?: string };
  fout.digest = `${FOUT_PREFIX}${message}`;
  return fout;
}

async function alsGebruiker<T>(werk: (userId: string) => Promise<T>): Promise<T> {
  try {
    return await werk(await requireUserId());
  } catch (e) {
    console.error('[rijen-actions]', e);
    throw nlFout(e);
  }
}

// ---------------------------------------------------------------------------
// Lezen
// ---------------------------------------------------------------------------

/** Alles voor de perceelpagina "Rijen". null = perceel niet gevonden. */
export async function getRijenkaartAction(perceelId: string): Promise<Rijenkaart | null> {
  return alsGebruiker(userId => laadRijenkaart(userId, perceelId));
}

/** Alle hoofdpercelen met rijtellingen (overzichtspagina). */
export async function getRijenOverzichtAction(): Promise<RijenSamenvatting[]> {
  return alsGebruiker(userId => laadRijenOverzicht(userId));
}

/** GeoJSON FeatureCollection van de rijen. null = perceel niet gevonden. */
export async function rijenGeoJSONAction(perceelId: string, inclGerooid = true): Promise<GeoJSON.FeatureCollection | null> {
  return alsGebruiker(userId => rijenGeoJSON(userId, perceelId, inclGerooid !== false));
}

/** Rijselectie → spuitschrift-plots + gespoten oppervlak (gooit bij rijen zonder subperceel/rijafstand). */
export async function rijSelectieOppervlakAction(rijIds: string[]): Promise<RijSelectieOppervlak> {
  return alsGebruiker(userId => rijSelectieNaarPlots(userId, rijIds));
}

export async function rijenVoorBespuitingenAction(spuitschriftIds: string[]): Promise<Record<string, BespuitingRijenInfo[]>> {
  return alsGebruiker(userId => rijenVoorBespuitingen(userId, spuitschriftIds));
}

export async function rijenVoorNotitiesAction(veldnotitieIds: string[]): Promise<Record<string, NotitieRijInfo[]>> {
  return alsGebruiker(userId => rijenVoorNotities(userId, veldnotitieIds));
}

// ---------------------------------------------------------------------------
// Schrijven
// ---------------------------------------------------------------------------

/** Rijen invoegen/bijwerken/hernummeren/verwijderen + instellingen, in één transactie. */
export async function rijenToepassenAction(
  perceelId: string,
  wijzigingen: { rijen?: RijWijziging[]; verwijderen?: string[]; instellingen?: RijInstellingenUpdate },
): Promise<RijenToepassenResultaat> {
  return alsGebruiker(userId => rijenToepassen(userId, perceelId, wijzigingen ?? {}));
}

/** Beginkant (kompasgraden); geeft het aantal omgedraaide rijen. */
export async function zetBeginkantAction(perceelId: string, graden: number): Promise<number> {
  return alsGebruiker(userId => zetBeginkant(userId, perceelId, graden));
}

/** Rij waar de nummering begint (null = standaard). */
export async function zetNummeringStartAction(perceelId: string, startRijId: string | null): Promise<void> {
  return alsGebruiker(userId => zetNummeringStart(userId, perceelId, startRijId ?? null));
}

/** Attributen op een selectie rijen; geeft het aantal bijgewerkte rijen. */
export async function zetRijAttributenAction(perceelId: string, rijIds: string[], attrs: RijAttributen): Promise<number> {
  return alsGebruiker(userId => zetRijAttributen(userId, perceelId, rijIds, attrs ?? {}));
}

/** Blok aanmaken/bijwerken; optioneel rijen aan het blok toewijzen. */
export async function slaBlokOpAction(perceelId: string, blok: BlokInvoer, rijIds?: string[]): Promise<Blok> {
  return alsGebruiker(userId => slaBlokOp(userId, perceelId, blok ?? {}, rijIds));
}

/** Blok verwijderen (rijen blijven, zonder blok). */
export async function verwijderBlokAction(perceelId: string, blokId: string): Promise<void> {
  return alsGebruiker(userId => verwijderBlok(userId, perceelId, blokId));
}

/** Nieuwe veldnotitie op één of meer rijen (bron 'web'). */
export async function maakRijNotitieAction(invoer: {
  perceelId: string;
  tekst: string;
  rijen: RijKoppeling[];
}): Promise<{ id: string }> {
  return alsGebruiker(userId =>
    maakRijNotitie(userId, { perceelId: invoer?.perceelId, tekst: invoer?.tekst, rijen: invoer?.rijen, bron: 'web' }),
  );
}

/** Bestaande veldnotitie aan rijen koppelen (met optionele positie in meters). */
export async function koppelNotitieAanRijenAction(veldnotitieId: string, rijen: RijKoppeling[]): Promise<void> {
  return alsGebruiker(userId => koppelNotitieAanRijen(userId, veldnotitieId, rijen));
}
