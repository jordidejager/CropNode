'use client';

/**
 * Rijenkaart (beta) — uiteinden uit de luchtfoto al in het voorstel, vóór opslaan.
 *
 * Het voorstel is een regelmatig raster tot de perceelgrens (min de kopakkers), dus een laadplek, inham of
 * kopakker binnen de grens staat er nog als rij in. Deze hook legt de voorgestelde rijen op het scherpe beeld
 * (verfijnRijen: dezelfde uiteindebepaling als na opslaan) en kort elke rij in tot waar de bomen staan. De ligging
 * dwars op de rij blijft die van het raster; het per rij op de foto leggen volgt na opslaan.
 *
 * Opnieuw na elke correctie (na een korte pauze); tot dan blijven de vorige uiteinden gelden (per rijlijn), zodat
 * de lijnen niet heen en weer springen.
 */

import { useEffect, useMemo, useState } from 'react';
import { bereikUitVerfijning, kortRijenIn, type RijBereik } from '@/lib/rijen/generatie';
import { verfijnVoorPerceel } from '@/lib/rijen/pdok';
import type { GegenereerdeRij, PerceelRD, RijParameters } from '@/lib/rijen/types';
import { bewaarFijnBeeld, leesFijnBeeld } from './fijn-beeld-cache';

export type ConceptEindenStatus = 'uit' | 'bezig' | 'klaar' | 'onbetrouwbaar' | 'mislukt';

export interface ConceptEinden {
  status: ConceptEindenStatus;
  voortgang: string | null;
  /** Waarom de uiteinden niet uit de foto komen (onbetrouwbaar / mislukt) */
  reden: string | null;
  /** De rijen met de uiteinden uit de foto (zonder resultaat: de invoer) */
  rijen: GegenereerdeRij[];
  /** Rijen die meer dan 1 m korter zijn dan in het raster */
  ingekort: number;
}

/** Wachten na een correctie voordat er opnieuw gerekend wordt (snel achter elkaar klikken) */
const PAUZE_MS = 450;

export function useConceptEinden({
  perceelId,
  perceelRD,
  params,
  rijen,
  aan,
}: {
  perceelId: string;
  perceelRD: PerceelRD | null;
  params: RijParameters | null;
  rijen: GegenereerdeRij[];
  aan: boolean;
}): ConceptEinden {
  const [bereik, setBereik] = useState<RijBereik[]>([]);
  const [status, setStatus] = useState<ConceptEindenStatus>('uit');
  const [voortgang, setVoortgang] = useState<string | null>(null);
  const [reden, setReden] = useState<string | null>(null);

  const richting = params?.richtingGraden ?? null;
  const rijafstand = params?.rijafstandM ?? null;

  useEffect(() => {
    if (!perceelRD || richting === null || !(rijafstand !== null && rijafstand > 0) || rijen.length < 2) {
      // Geen voorstel (meer): een volgend voorstel begint zonder oude uiteinden
      setBereik([]);
      setStatus('uit');
      setVoortgang(null);
      setReden(null);
      return;
    }
    if (!aan) {
      setStatus('uit');
      setVoortgang(null);
      return;
    }
    const ac = new AbortController();
    setStatus('bezig');
    setVoortgang('Uiteinden uit de foto bepalen…');
    const timer = window.setTimeout(async () => {
      try {
        const cache = leesFijnBeeld(perceelId);
        const { resultaat, beeld, zomer } = await verfijnVoorPerceel(
          perceelRD,
          rijen.map((r, i) => ({ id: String(i), nummer: i + 1, coordinates: r.coordinates })),
          {
            richtingGraden: richting,
            rijafstandM: rijafstand,
            beeld: cache.beeld,
            zomer: cache.zomer,
            signal: ac.signal,
            onVoortgang: stap => {
              if (!ac.signal.aborted) setVoortgang(stap.startsWith('Scherpe') ? stap : 'Uiteinden uit de foto bepalen…');
            },
          },
        );
        if (ac.signal.aborted) return;
        bewaarFijnBeeld(perceelId, beeld, zomer);
        if (resultaat.betrouwbaar && resultaat.einden.bepaald) {
          setBereik(bereikUitVerfijning(perceelRD, richting, rijen, resultaat.rijen));
          setStatus('klaar');
          setReden(null);
        } else {
          setBereik([]);
          setStatus('onbetrouwbaar');
          setReden(resultaat.reden ?? 'De bomen zijn op de luchtfoto niet duidelijk genoeg te zien.');
        }
        setVoortgang(null);
      } catch (e) {
        if (ac.signal.aborted) return;
        setBereik([]);
        setStatus('mislukt');
        setVoortgang(null);
        setReden(e instanceof Error && e.message ? e.message : 'De luchtfoto kon niet worden opgehaald.');
      }
    }, PAUZE_MS);
    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [aan, perceelId, perceelRD, richting, rijafstand, rijen]);

  const toegepast = useMemo(
    () => (aan && perceelRD && params && bereik.length > 0 ? kortRijenIn(perceelRD, params, rijen, bereik) : rijen),
    [aan, perceelRD, params, rijen, bereik],
  );
  const ingekort = useMemo(
    () => toegepast.filter((r, i) => rijen[i] && rijen[i].lengteM - r.lengteM > 1).length,
    [toegepast, rijen],
  );

  return { status, voortgang, reden, rijen: toegepast, ingekort };
}
