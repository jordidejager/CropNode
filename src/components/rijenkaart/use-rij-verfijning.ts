'use client';

/**
 * Rijenkaart (beta) — rijen precies op de luchtfoto leggen (verfijning) vanuit de detailpagina.
 *
 * Werkt op de opgeslagen actieve rijen: haalt een scherp beeld (±10 cm/px) op, legt elke rij op de
 * boomstrook (src/lib/rijen/verfijning.ts) en toont het voorstel op de kaart. Twee varianten:
 *  - 'per-rij': elke rij een eigen ligging (en een gladde boog als de rij aantoonbaar buigt);
 *  - 'raster' : een fijnafgesteld regelmatig raster (GPS-aanplant: per rij schuiven zou alleen ruis toevoegen).
 * Opslaan wijzigt alleen de geometrie (ID's, nummers en koppelingen blijven; notitieposities schuiven mee
 * via de trigger uit migratie 095) en zet het fijnafgestelde raster in de instellingen.
 * Handmatig getekende/versleepte of gemeten rijen blijven liggen, behalve als je één rij expliciet opnieuw legt.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { rijenToepassenAction } from '@/app/rijen-actions';
import { naarWGS } from '@/lib/rijen/geo';
import { verfijnVoorPerceel, type FijnBeeld } from '@/lib/rijen/pdok';
import type { VerfijndeRij, VerfijnModus, VerfijnResultaat } from '@/lib/rijen/verfijning';
import type { LngLat, PerceelRD, Rij, Rijenkaart, RijWijziging } from '@/lib/rijen/types';

export interface VerfijningVoorstel {
  resultaat: VerfijnResultaat;
  modus: VerfijnModus;
  /** null = hele perceel; anders alleen deze rij(en) opnieuw gelegd */
  rijIds: string[] | null;
  /** Rijen in het voorstel (gefilterd op rijIds en zonder handmatig gelegde rijen) */
  rijen: VerfijndeRij[];
  /** Handmatig gelegde rijen die blijven liggen */
  overgeslagen: number;
}

export interface RijVerfijning {
  status: 'leeg' | 'bezig' | 'voorstel';
  voortgang: string | null;
  voorstel: VerfijningVoorstel | null;
  bezigOpslaan: boolean;
  /** Voorbeeldlijnen voor de kaart (concept-laag) */
  kaartLijnen: { coordinates: LngLat[]; controleren: boolean }[] | null;
  start: (opties?: { rijIds?: string[] }) => Promise<void>;
  /** Start zodra de verse rijen geladen zijn (na het opslaan van een gegenereerde set) */
  planStart: () => void;
  zetModus: (m: VerfijnModus) => void;
  opslaan: () => Promise<void>;
  annuleren: () => void;
}

const HANDMATIG = new Set(['getekend', 'gemeten']);

export function useRijVerfijning(args: {
  perceelId: string;
  kaart: Rijenkaart;
  perceelRD: PerceelRD | null;
  actieveRijen: Rij[];
  richting: number | null;
  meld: (titel: string, beschrijving?: string) => void;
  meldFout: (fout: unknown, titel?: string) => void;
  verversen: () => Promise<void>;
}): RijVerfijning {
  const { perceelId, kaart, perceelRD, actieveRijen, richting, meld, meldFout, verversen } = args;
  const [status, setStatus] = useState<RijVerfijning['status']>('leeg');
  const [voortgang, setVoortgang] = useState<string | null>(null);
  const [voorstel, setVoorstel] = useState<VerfijningVoorstel | null>(null);
  const [bezigOpslaan, setBezigOpslaan] = useState(false);
  const [gepland, setGepland] = useState(0);
  const beeldRef = useRef<FijnBeeld | null>(null);
  const afbreker = useRef<AbortController | null>(null);

  // Laatste stand voor callbacks die na een await lopen
  const actueel = useRef({ perceelRD, actieveRijen, richting, kaart });
  actueel.current = { perceelRD, actieveRijen, richting, kaart };

  useEffect(() => () => afbreker.current?.abort(), []);
  // Ander perceel of nieuwe geometrie: beeld niet hergebruiken
  useEffect(() => {
    beeldRef.current = null;
  }, [perceelId, perceelRD]);

  const start = useCallback(
    async (opties?: { rijIds?: string[] }) => {
      const { perceelRD: rd, actieveRijen: rijen, richting: theta, kaart: k } = actueel.current;
      const rijafstand = k.instellingen?.rijafstandM ?? null;
      if (!rd) {
        meld('Geen perceelgrens', 'Zonder perceelgrens kunnen de rijen niet op de foto gelegd worden.');
        return;
      }
      if (theta === null || !(rijafstand && rijafstand > 0)) {
        meld('Rijafstand nodig', 'Genereer de rijen eerst (of vul onder Indeling de rijafstand in).');
        return;
      }
      const bruikbaar = rijen.filter(r => r.coordinates.length >= 2);
      if (bruikbaar.length < 2) {
        meld('Te weinig rijen', 'Er zijn minstens twee rijen nodig om ze op de foto te leggen.');
        return;
      }
      afbreker.current?.abort();
      const ac = new AbortController();
      afbreker.current = ac;
      setStatus('bezig');
      setVoorstel(null);
      setVoortgang('Scherpe luchtfoto ophalen…');
      try {
        const { resultaat, beeld } = await verfijnVoorPerceel(
          rd,
          bruikbaar.map(r => ({ id: r.id, nummer: r.nummer, coordinates: r.coordinates })),
          {
            richtingGraden: theta,
            rijafstandM: rijafstand,
            beeld: beeldRef.current,
            signal: ac.signal,
            onVoortgang: stap => setVoortgang(stap),
          },
        );
        if (ac.signal.aborted) return;
        beeldRef.current = beeld;
        if (!resultaat.betrouwbaar) {
          setStatus('leeg');
          setVoortgang(null);
          meld('Niet precies te leggen', `${resultaat.reden ?? 'Het beeld is te onduidelijk.'} De rijen blijven zoals ze zijn.`);
          return;
        }
        const enkel = opties?.rijIds && opties.rijIds.length > 0 ? new Set(opties.rijIds) : null;
        const bron = new Map(bruikbaar.map(r => [r.id, r] as const));
        const gekozen = resultaat.rijen.filter(v => {
          if (enkel) return enkel.has(v.id);
          return !HANDMATIG.has(bron.get(v.id)?.geomBron ?? 'gegenereerd');
        });
        const overgeslagen = enkel ? 0 : resultaat.rijen.length - gekozen.length;
        setVoorstel({
          resultaat,
          modus: enkel ? 'per-rij' : resultaat.aanbevolen,
          rijIds: enkel ? [...enkel] : null,
          rijen: gekozen,
          overgeslagen,
        });
        setStatus('voorstel');
        setVoortgang(null);
      } catch (e) {
        if (ac.signal.aborted) return;
        setStatus('leeg');
        setVoortgang(null);
        meldFout(e, 'Rijen op de foto leggen mislukt');
      }
    },
    [meld, meldFout],
  );

  // planStart: na een render met de verse rijen starten (de ref heeft dan de nieuwe rijen)
  const planStart = useCallback(() => setGepland(n => n + 1), []);
  const afgehandeld = useRef(0);
  useEffect(() => {
    if (gepland > afgehandeld.current) {
      afgehandeld.current = gepland;
      void start();
    }
  }, [gepland, start]);

  const zetModus = useCallback((m: VerfijnModus) => {
    setVoorstel(v => (v && !v.rijIds ? { ...v, modus: m } : v));
  }, []);

  const annuleren = useCallback(() => {
    afbreker.current?.abort();
    setStatus('leeg');
    setVoortgang(null);
    setVoorstel(null);
  }, []);

  const opslaan = useCallback(async () => {
    const v = voorstel;
    if (!v || bezigOpslaan) return;
    const bron = new Map(actueel.current.actieveRijen.map(r => [r.id, r] as const));
    const rijen: RijWijziging[] = v.rijen
      .filter(r => bron.has(r.id))
      .map(r => {
        const coords = (v.modus === 'raster' ? r.rasterCoordsRD : r.coordsRD).map(p => naarWGS(p));
        const oud = bron.get(r.id)!;
        const w: RijWijziging = {
          id: r.id,
          coordinates: coords,
          nauwkeurigheidM: v.modus === 'raster' ? Math.max(0.02, v.resultaat.raster.restStdM) : r.nauwkeurigheidM,
          controleren: oud.controleren || r.controleren,
        };
        // Een expliciet opnieuw gelegde handgetekende rij komt weer uit de foto
        if (v.rijIds && HANDMATIG.has(oud.geomBron)) w.geomBron = 'gegenereerd';
        return w;
      });
    if (rijen.length === 0) {
      annuleren();
      return;
    }
    setBezigOpslaan(true);
    try {
      const raster = v.resultaat.raster;
      await rijenToepassenAction(perceelId, {
        rijen,
        // Het fijnafgestelde raster wordt de referentie (afwijking per rij, opnieuw genereren)
        instellingen: v.rijIds
          ? undefined
          : {
              rijrichtingGraden: raster.richtingGraden,
              rijafstandM: raster.rijafstandM,
              faseM: raster.faseM,
              bronBeeld: `PDOK Actueel_orthoHR (${v.modus === 'raster' ? 'raster fijnafgesteld' : 'per rij verfijnd'})`,
            },
      });
      const st = v.modus === 'raster' ? v.resultaat.rasterStat : v.resultaat.perRij;
      meld(
        v.rijIds ? `Rij ${v.rijen.map(r => r.nummer).join(', ')} op de foto gelegd` : `${rijen.length} rijen op de foto gelegd`,
        v.rijIds ? undefined : `${v.modus === 'raster' ? 'Raster fijnafgesteld' : 'Per rij'} · gem. ${fmtCm(st.gemiddeldCm)} verschoven, max ${fmtCm(st.maxCm)}`,
      );
      setStatus('leeg');
      setVoorstel(null);
      await verversen();
    } catch (e) {
      meldFout(e, 'Opslaan mislukt');
    } finally {
      setBezigOpslaan(false);
    }
  }, [voorstel, bezigOpslaan, perceelId, meld, meldFout, verversen, annuleren]);

  const kaartLijnen = useMemo(() => {
    if (!voorstel) return null;
    return voorstel.rijen.map(r => ({
      coordinates: (voorstel.modus === 'raster' ? r.rasterCoordsRD : r.coordsRD).map(p => naarWGS(p)),
      controleren: r.controleren,
    }));
  }, [voorstel]);

  return { status, voortgang, voorstel, bezigOpslaan, kaartLijnen, start, planStart, zetModus, opslaan, annuleren };
}

function fmtCm(cm: number): string {
  return `${Math.round(cm).toLocaleString('nl-NL')} cm`;
}
