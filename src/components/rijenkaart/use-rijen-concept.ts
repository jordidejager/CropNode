'use client';

/**
 * Rijenkaart (beta) — staat van het rijen-concept (genereren): detectie op de PDOK-luchtfoto,
 * referentierij, live correcties en het opslaan met ID-mapping.
 *
 * Het concept is een set parameters {richting, rijafstand, fase, kopakkers, beginkant}; de rijen
 * zelf worden bij elke wijziging opnieuw berekend (genereerRijen, puur en snel).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { afstand, naarRD } from '@/lib/rijen/geo';
import { genereerRijen, referentielijnNaarParameters } from '@/lib/rijen/generatie';
import { detecteerVoorPerceel } from '@/lib/rijen/pdok';
import { PDOK_LAGEN } from '@/lib/rijen/pdok-lagen';
import type {
  DetectieResultaat,
  GegenereerdeRij,
  LngLat,
  PerceelRD,
  Rijenkaart,
  RijenToepassenResultaat,
  RijParameters,
  RijStukkenKeuze,
} from '@/lib/rijen/types';
import { rijenToepassenAction, zetBeginkantAction } from '@/app/rijen-actions';
import type { Basislaag, ConceptRij } from './rijenkaart-map';
import {
  basisUitInstellingen,
  beginkantBijRichting,
  draaiBasis,
  gewogenAfstand,
  heeftStukkenOpEenLijn,
  maakOpslaanPlan,
  verschuifBasis,
  type ConceptBasis,
  type ConceptBron,
  type OpslaanPlan,
} from './rijen-hulp';

/** Een referentierij moet minstens zo lang zijn (korte lijn → grote hoekfout aan het eind van de rij) */
export const MIN_REFERENTIE_M = 20;
/**
 * Standaard geen kopakker binnen de perceelgrens: bij de meeste (BRP-)percelen staan de bomen tot vlak bij de
 * grens. Na opslaan legt de verfijning per rij de uiteinden uit de foto (tot waar de bomen staan), dus een
 * kopakker binnen het perceel (of een laadplek) wordt daar alsnog weggehaald.
 */
const STANDAARD_KOPAKKER_M = 0;

export type DetectieStatus = 'idle' | 'bezig' | 'klaar' | 'fout';

export interface DetectieStaat {
  status: DetectieStatus;
  voortgang: string | null;
  resultaat: DetectieResultaat | null;
  fout: string | null;
}

export type DetectieUitkomst = 'voldoende' | 'onzeker' | 'mislukt' | 'afgebroken';

export interface ConceptStatistiek {
  aantal: number;
  totaleLengteM: number;
  oppervlakHa: number;
  aantalControleren: number;
  /** Rijlijnen die het perceel meer dan eens doorsnijden (inham, pad, gat) */
  aantalOnderbroken: number;
}

export function useRijenConcept({
  perceelId,
  kaart,
  perceelRD,
  basislaag,
  gekoppeld,
}: {
  perceelId: string;
  kaart: Rijenkaart;
  perceelRD: PerceelRD | null;
  basislaag: Basislaag;
  gekoppeld: ReadonlySet<string>;
}) {
  const instellingen = kaart.instellingen;
  const gewogenRijafstand = useMemo(() => gewogenAfstand(kaart.perceel.subpercelen, 'rij'), [kaart.perceel.subpercelen]);
  const gewogenBoomafstand = useMemo(() => gewogenAfstand(kaart.perceel.subpercelen, 'boom'), [kaart.perceel.subpercelen]);

  const [verwachteRijafstand, setVerwachteRijafstand] = useState<number | null>(null);
  const [kopakkerBegin, setKopakkerBegin] = useState<number>(instellingen?.kopakkerBeginM ?? STANDAARD_KOPAKKER_M);
  const [kopakkerEind, setKopakkerEind] = useState<number>(instellingen?.kopakkerEindM ?? STANDAARD_KOPAKKER_M);
  const [basis, setBasis] = useState<ConceptBasis | null>(null);
  const [bron, setBron] = useState<ConceptBron | null>(null);
  const [stukken, setStukken] = useState<RijStukkenKeuze>('langste');
  const [detectie, setDetectie] = useState<DetectieStaat>({ status: 'idle', voortgang: null, resultaat: null, fout: null });
  const [bezigMetOpslaan, setBezigMetOpslaan] = useState(false);
  // Bij corrigeren van een bestaande set: alleen ligging bijwerken / handmatig aangepaste rijen laten liggen
  const [alleenBestaande, setAlleenBestaande] = useState(false);
  const [behoudGetekend, setBehoudGetekend] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Lopende detectie afbreken bij verlaten van de pagina
  useEffect(() => () => abortRef.current?.abort(), []);

  const actieveRijen = useMemo(() => kaart.rijen.filter(r => r.status === 'actief'), [kaart.rijen]);

  const params: RijParameters | null = useMemo(
    () => (basis ? { ...basis, kopakkerBeginM: kopakkerBegin, kopakkerEindM: kopakkerEind } : null),
    [basis, kopakkerBegin, kopakkerEind],
  );

  const conceptRijen: GegenereerdeRij[] = useMemo(() => {
    if (!params || !perceelRD) return [];
    try {
      return genereerRijen(perceelRD, params, { stukken });
    } catch {
      return [];
    }
  }, [params, perceelRD, stukken]);

  const kaartConcept: ConceptRij[] | null = useMemo(
    () => (basis ? conceptRijen.map(r => ({ coordinates: r.coordinates, controleren: r.controleren })) : null),
    [basis, conceptRijen],
  );

  const statistiek: ConceptStatistiek = useMemo(() => {
    let lengte = 0;
    let controleren = 0;
    let onderbroken = 0;
    for (const r of conceptRijen) {
      lengte += r.lengteM;
      if (r.controleren) controleren++;
      if ((r.aantalStukken ?? 1) > 1 && (r.stukIndex ?? 0) === 0) onderbroken++;
    }
    const s = params?.rijafstandM ?? 0;
    return {
      aantal: conceptRijen.length,
      totaleLengteM: lengte,
      oppervlakHa: (lengte * s) / 10000,
      aantalControleren: controleren,
      aantalOnderbroken: onderbroken,
    };
  }, [conceptRijen, params]);

  /** Wat er bij opslaan gebeurt (live voorbeeld; dezelfde berekening als het echte opslaan). */
  const plan: OpslaanPlan | null = useMemo(() => {
    if (!params || !perceelRD || conceptRijen.length === 0) return null;
    try {
      return maakOpslaanPlan({
        perceel: perceelRD,
        params,
        conceptRijen,
        bestaand: actieveRijen,
        instellingen,
        gekoppeld,
        bron: bron ?? { methode: 'handmatig', confidence: null, bronBeeld: null },
        profielBoomafstandM: gewogenBoomafstand,
        alleenBestaande,
        behoudGetekend,
      });
    } catch {
      return null;
    }
  }, [params, perceelRD, conceptRijen, actieveRijen, instellingen, gekoppeld, bron, gewogenBoomafstand, alleenBestaande, behoudGetekend]);

  /**
   * Rijafstand voor een referentierij: concept → ingevuld → perceelprofiel → instellingen. Komt het
   * concept van een ONZEKERE detectie, dan is die rijafstand verdacht (bv. een veelvoud) en gaan de
   * ingevulde rijafstand en het perceelprofiel voor.
   */
  const conceptOnzeker =
    bron?.methode === 'auto' && detectie.resultaat !== null && detectie.resultaat.voldoende === false;
  const rijafstandVoorReferentie = conceptOnzeker
    ? verwachteRijafstand ?? gewogenRijafstand ?? basis?.rijafstandM ?? instellingen?.rijafstandM ?? null
    : basis?.rijafstandM ?? verwachteRijafstand ?? gewogenRijafstand ?? instellingen?.rijafstandM ?? null;

  // ---- Detectie -------------------------------------------------------------

  const detecteer = useCallback(async (): Promise<DetectieUitkomst> => {
    if (!perceelRD) return 'mislukt';
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setDetectie({ status: 'bezig', voortgang: 'Voorbereiden…', resultaat: null, fout: null });
    try {
      // Bewust zonder `laag`: orthoHR (voorjaar, bladloos) is het betrouwbaarst, ook als de kaart 25 cm toont
      const res = await detecteerVoorPerceel(perceelRD, {
        verwachteRijafstandM: verwachteRijafstand ?? gewogenRijafstand ?? null,
        onVoortgang: stap => {
          if (!ac.signal.aborted) setDetectie(d => ({ ...d, voortgang: stap }));
        },
        signal: ac.signal,
      });
      if (ac.signal.aborted) return 'afgebroken';
      setDetectie({ status: 'klaar', voortgang: null, resultaat: res, fout: null });
      if (res.rijafstandM > 0 && Number.isFinite(res.richtingGraden)) {
        const theta = res.richtingGraden;
        setBasis(oud => ({
          richtingGraden: theta,
          rijafstandM: res.rijafstandM,
          faseM: res.faseM,
          beginkantGraden: beginkantBijRichting(oud?.beginkantGraden ?? instellingen?.beginkantGraden ?? theta, theta),
        }));
        setBron({ methode: 'auto', confidence: res.confidence, bronBeeld: res.bronBeeld });
      }
      return res.voldoende ? 'voldoende' : 'onzeker';
    } catch (e) {
      if (ac.signal.aborted) return 'afgebroken';
      const melding = e instanceof Error && e.message ? e.message : 'Rijdetectie mislukt.';
      setDetectie({ status: 'fout', voortgang: null, resultaat: null, fout: melding });
      return 'mislukt';
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
    }
  }, [perceelRD, verwachteRijafstand, gewogenRijafstand, instellingen?.beginkantGraden]);

  const breekDetectieAf = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setDetectie({ status: 'idle', voortgang: null, resultaat: null, fout: null });
  }, []);

  // ---- Referentierij --------------------------------------------------------

  /** Twee tikken langs één boomrij → richting + fase. Geeft een foutmelding terug, of null. */
  const verwerkReferentielijn = useCallback(
    (a: LngLat, b: LngLat): string | null => {
      if (!perceelRD) return 'Dit perceel heeft geen perceelgrens.';
      const ra = naarRD(a);
      const rb = naarRD(b);
      if (afstand(ra, rb) < MIN_REFERENTIE_M) {
        return `Teken de referentierij langer — minimaal ${MIN_REFERENTIE_M} m, liefst over de hele rij.`;
      }
      const s = rijafstandVoorReferentie;
      if (s === null || !(s > 0)) return 'Vul eerst de rijafstand in (bij "Verwachte rijafstand").';
      const { richtingGraden, faseM } = referentielijnNaarParameters(perceelRD, ra, rb, s);
      setBasis(oud => ({
        richtingGraden,
        rijafstandM: s,
        faseM,
        beginkantGraden: beginkantBijRichting(
          oud?.beginkantGraden ?? instellingen?.beginkantGraden ?? richtingGraden,
          richtingGraden,
        ),
      }));
      setBron({ methode: 'handmatig', confidence: null, bronBeeld: `PDOK ${PDOK_LAGEN[basislaag]}` });
      return null;
    },
    [perceelRD, rijafstandVoorReferentie, instellingen?.beginkantGraden, basislaag],
  );

  // ---- Bestaande set corrigeren --------------------------------------------

  /** Laadt het concept uit de opgeslagen instellingen (aangevuld uit de rijen). false = niet af te leiden. */
  const laadUitInstellingen = useCallback((): boolean => {
    if (!perceelRD) return false;
    const b = basisUitInstellingen(perceelRD, kaart.rijen, instellingen, gewogenRijafstand);
    if (!b) return false;
    setBasis(b);
    // Set met losse stukken per rijlijn → ook zo corrigeren, anders vervallen die stukken bij opslaan
    setStukken(heeftStukkenOpEenLijn(perceelRD, b.richtingGraden, kaart.rijen) ? 'alle' : 'langste');
    setKopakkerBegin(instellingen?.kopakkerBeginM ?? STANDAARD_KOPAKKER_M);
    setKopakkerEind(instellingen?.kopakkerEindM ?? STANDAARD_KOPAKKER_M);
    setBron({
      methode: instellingen?.detectieMethode ?? 'handmatig',
      confidence: instellingen?.detectieConfidence ?? null,
      bronBeeld: instellingen?.bronBeeld ?? null,
    });
    return true;
  }, [perceelRD, kaart.rijen, instellingen, gewogenRijafstand]);

  // Beginkant intussen gewijzigd (tab Indeling): een geladen concept volgt die keuze, anders zou opslaan
  // hem stil terugdraaien (en de notitieposities opnieuw spiegelen)
  const opgeslagenBeginkant = instellingen?.beginkantGraden ?? null;
  useEffect(() => {
    if (opgeslagenBeginkant === null) return;
    setBasis(b => (b ? { ...b, beginkantGraden: beginkantBijRichting(opgeslagenBeginkant, b.richtingGraden) } : b));
  }, [opgeslagenBeginkant]);

  // ---- Correcties ----------------------------------------------------------

  const verschuif = useCallback((deltaM: number) => setBasis(b => (b ? verschuifBasis(b, deltaM) : b)), []);
  const halveRij = useCallback(() => setBasis(b => (b ? verschuifBasis(b, b.rijafstandM / 2) : b)), []);
  const draai = useCallback(
    (deltaGraden: number) =>
      setBasis(b => {
        if (!b) return b;
        const n = draaiBasis(b, deltaGraden);
        return { ...n, beginkantGraden: beginkantBijRichting(b.beginkantGraden, n.richtingGraden) };
      }),
    [],
  );
  const zetRijafstand = useCallback((s: number) => {
    if (!(s > 0) || !Number.isFinite(s)) return;
    setBasis(b => (b ? { ...b, rijafstandM: Math.max(0.5, s) } : b));
  }, []);
  const zetBeginkant = useCallback((g: number) => setBasis(b => (b ? { ...b, beginkantGraden: g } : b)), []);

  const wis = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBasis(null);
    setBron(null);
    setAlleenBestaande(false);
    setBehoudGetekend(false);
    setDetectie({ status: 'idle', voortgang: null, resultaat: null, fout: null });
  }, []);

  // ---- Opslaan --------------------------------------------------------------

  const slaOp = useCallback(
    async (p: OpslaanPlan): Promise<RijenToepassenResultaat> => {
      setBezigMetOpslaan(true);
      try {
        if (p.beginkantWijzigen) await zetBeginkantAction(perceelId, p.beginkantGraden);
        return await rijenToepassenAction(perceelId, {
          rijen: p.rijen,
          verwijderen: p.verwijderen,
          instellingen: p.instellingen,
        });
      } finally {
        setBezigMetOpslaan(false);
      }
    },
    [perceelId],
  );

  return {
    // invoer
    verwachteRijafstand,
    setVerwachteRijafstand,
    gewogenRijafstand,
    kopakkerBegin,
    setKopakkerBegin,
    kopakkerEind,
    setKopakkerEind,
    stukken,
    setStukken,
    alleenBestaande,
    setAlleenBestaande,
    behoudGetekend,
    setBehoudGetekend,
    rijafstandVoorReferentie,
    // concept
    basis,
    bron,
    params,
    conceptRijen,
    kaartConcept,
    statistiek,
    plan,
    // detectie
    detectie,
    detecteer,
    breekDetectieAf,
    verwerkReferentielijn,
    laadUitInstellingen,
    // correcties
    verschuif,
    halveRij,
    draai,
    zetRijafstand,
    zetBeginkant,
    wis,
    // opslaan
    slaOp,
    bezigMetOpslaan,
  };
}

export type RijenConcept = ReturnType<typeof useRijenConcept>;
