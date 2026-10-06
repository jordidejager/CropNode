'use client';

/**
 * Rijenkaart (beta) — gedeelde staat van de detailpagina voor de panelen, de selectiebalk, de
 * rij-detailkaart en de dialogen. De pagina (src/app/(app)/percelen/rijen/[perceelId]) maakt de
 * waarde; de onderdelen lezen hem met useRijenkaartCtx().
 */

import { createContext, useContext } from 'react';
import type { PerceelRD, Rij, Rijenkaart } from '@/lib/rijen/types';
import type { RijenConcept } from './use-rijen-concept';

export type PaneelTab = 'rijen' | 'genereren' | 'indeling' | 'export';

/** Waar een tik op de kaart voor dient (null = bekijken: tik op een rij opent de rij-detailkaart). */
export type KaartDoel =
  | { soort: 'tik-selectie'; anker: string | null }
  | { soort: 'referentierij' }
  | { soort: 'rij-tekenen'; nummer: number | null }
  | { soort: 'rij1' }
  | { soort: 'notitie-positie'; rijId: string };

export type DialoogVerzoek =
  | { soort: 'notitie'; rijIds: string[] }
  | { soort: 'blok'; blokId: string | null; rijIds: string[] }
  | { soort: 'blok-toekennen'; rijIds: string[] }
  | { soort: 'bestuiver'; rijIds: string[] }
  | { soort: 'rooien'; rijIds: string[] }
  | { soort: 'verwijderen'; rijIds: string[] }
  | { soort: 'bespuiting'; rijIds: string[] }
  | { soort: 'blok-verwijderen'; blokId: string };

export interface RasInfo {
  ras: string | null;
  /** Ras komt van het subperceel (rij en blok hebben (nog) geen ras) */
  vanSubperceel: boolean;
}

export interface RijenkaartCtxWaarde {
  perceelId: string;
  kaart: Rijenkaart;
  perceelRD: PerceelRD | null;
  /** Alle rijen (incl. gerooid), gesorteerd op nummer */
  rijen: Rij[];
  actieveRijen: Rij[];
  rijPerId: ReadonlyMap<string, Rij>;
  rasInfo: (rij: Rij) => RasInfo;
  kleurVoorRas: (ras: string | null) => string;
  /** Rijrichting θ (instellingen, anders afgeleid uit de rijen) */
  richting: number | null;
  /** Rijen met een expliciet gekoppelde bespuiting of notitie */
  gekoppeld: ReadonlySet<string>;
  /** Boomafstand voor boomnummers (instellingen, anders perceelprofiel) */
  standaardBoomafstandM: number | null;

  tab: PaneelTab;
  zetTab: (t: PaneelTab) => void;

  geselecteerd: ReadonlySet<string>;
  selectieTekst: string;
  selectieFouten: string[];
  zetSelectie: (ids: Iterable<string>) => void;
  zetSelectieTekst: (tekst: string) => void;
  wisselSelectie: (id: string) => void;
  wisSelectie: () => void;

  kaartDoel: KaartDoel | null;
  zetKaartDoel: (d: KaartDoel | null) => void;
  detailRijId: string | null;
  zetDetailRijId: (id: string | null) => void;
  bewerkRijId: string | null;
  zetBewerkRijId: (id: string | null) => void;

  toonGerooid: boolean;
  zetToonGerooid: (b: boolean) => void;
  gemarkeerdeBespuitingId: string | null;
  zetGemarkeerdeBespuiting: (id: string | null) => void;
  gemarkeerdAantal: number;

  rij1Kandidaat: string | null;
  zetRij1Kandidaat: (id: string | null) => void;
  startnummerInvoer: number;
  zetStartnummerInvoer: (n: number) => void;

  concept: RijenConcept;
  /** Concept opslaan vanaf de kaart (ConceptBalk): zelfde pad als de knop in het Genereren-paneel, incl. bevestiging */
  vraagConceptOpslaan: () => void;
  /** Het Genereren-paneel registreert hier zijn opslaan-functie (null bij unmount) */
  registreerConceptOpslaan: (fn: (() => void) | null) => void;
  openDialoog: (d: DialoogVerzoek) => void;
  /** Kaart + overzicht opnieuw laden na een wijziging */
  verversen: () => Promise<void>;
  /** Toast met de Nederlandse melding uit een rijen-action (rijenFoutmelding) */
  meldFout: (fout: unknown, titel?: string) => void;
  meld: (titel: string, beschrijving?: string) => void;
}

export const RijenkaartCtx = createContext<RijenkaartCtxWaarde | null>(null);

export function useRijenkaartCtx(): RijenkaartCtxWaarde {
  const w = useContext(RijenkaartCtx);
  if (!w) throw new Error('useRijenkaartCtx buiten RijenkaartCtx.Provider');
  return w;
}
