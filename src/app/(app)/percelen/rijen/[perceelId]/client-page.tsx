'use client';

/**
 * Rijenkaart (beta) — detailpagina van één perceel: kaart met rijen + paneel
 * (Rijen · Genereren · Indeling · Export). Mobiel: kaart boven, paneel eronder; desktop: naast elkaar.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowLeft, MapPinOff, Rows3 } from 'lucide-react';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/data-states';
import { NewSprayDialog } from '@/components/spuitschrift/new-spray-dialog';
import { useInvalidateQueries, useParcels } from '@/hooks/use-data';
import { rijenFoutmelding, useInvalidateRijen, useRijenkaart } from '@/hooks/use-rijen';
import { useToast } from '@/hooks/use-toast';
import { rijenToepassenAction } from '@/app/rijen-actions';
import { afstand, naarRD, perceelNaarRD } from '@/lib/rijen/geo';
import { positieOpRij, puntOpRij, rijOppervlakHa } from '@/lib/rijen/generatie';
import { formatteerBereiken, parseRijSelectie } from '@/lib/rijen/selectie';
import type { LngLat, Rij, Rijenkaart } from '@/lib/rijen/types';
import { cn } from '@/lib/utils';
import type { Basislaag, KaartModus, NotitieMarker } from '@/components/rijenkaart/rijenkaart-map';
import { maakKleurVoorRas } from '@/components/rijenkaart/kleuren';
import { RijenkaartLegenda } from '@/components/rijenkaart/legenda';
import {
  RijenkaartCtx,
  type DialoogVerzoek,
  type KaartDoel,
  type PaneelTab,
  type RasInfo,
  type RijenkaartCtxWaarde,
} from '@/components/rijenkaart/rijenkaart-context';
import { useRijenConcept } from '@/components/rijenkaart/use-rijen-concept';
import {
  afgeleideRichting,
  fmt,
  fmtDatum,
  fmtHa,
  fmtLengte,
  gekoppeldeRijen,
  gewogenAfstand,
  rassenVanSubpercelen,
  rijenMetSubperceelRas,
  rond,
  volgendNummer,
} from '@/components/rijenkaart/rijen-hulp';
import { Chip, Segment } from '@/components/rijenkaart/ui';
import { RijenPaneel } from '@/components/rijenkaart/rijen-paneel';
import { GenererenPaneel } from '@/components/rijenkaart/genereren-paneel';
import { IndelingPaneel } from '@/components/rijenkaart/indeling-paneel';
import { ExportPaneel } from '@/components/rijenkaart/export-paneel';
import { BewerkBalk, ConceptBalk, ModusBalk, NotitieDetailKaart, NummeringBalk, RijDetailKaart } from '@/components/rijenkaart/kaart-overlays';
import { SelectieBalkMobiel, SelectieBalkPaneel } from '@/components/rijenkaart/selectie-balk';
import { useVersBijOpenen } from '@/components/rijenkaart/use-vers-bij-openen';
import {
  BestuiverDialoog,
  BlokDialoog,
  BlokToekennenDialoog,
  BlokVerwijderDialoog,
  NotitieDialoog,
  RooienDialoog,
  VerwijderDialoog,
  type NotitieConcept,
} from '@/components/rijenkaart/rij-dialogen';

const RijenkaartMap = dynamic(() => import('@/components/rijenkaart/rijenkaart-map').then(m => m.RijenkaartMap), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-white/[0.04]" />,
});

/** Een rij-tekening moet minstens zo lang zijn */
const MIN_RIJ_M = 5;
/** Tik voor een notitiepositie mag hooguit zo ver naast de rij liggen */
const MAX_POSITIE_AFSTAND_M = 5;
/** Kaarthints als de referentielijn-modus voor 'Rij tekenen' gebruikt wordt */
const RIJ_TEKENEN_HINTS = {
  eerste: 'Nieuwe rij: tik het begin van de rij',
  tweede: 'Tik het eind van de rij (minimaal 5 m verder)',
};

const TABS: { waarde: PaneelTab; label: string }[] = [
  { waarde: 'rijen', label: 'Rijen' },
  { waarde: 'genereren', label: 'Genereren' },
  { waarde: 'indeling', label: 'Indeling' },
  { waarde: 'export', label: 'Export' },
];

/** bevestig: vraag vóór het weggaan om bevestiging (bv. een niet-opgeslagen voorstel) */
function TerugLink({ bevestig }: { bevestig?: string | null }) {
  return (
    <Link
      href="/percelen/rijen"
      onClick={e => {
        if (bevestig && !window.confirm(bevestig)) e.preventDefault();
      }}
      className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-white/55 transition-colors hover:text-white"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Alle percelen
    </Link>
  );
}

export function RijenkaartDetailClient({ perceelId }: { perceelId: string }) {
  const query = useRijenkaart(perceelId);
  const { data: kaart, isError, error, refetch } = query;
  // refetchOnMount staat app-breed uit: verouderde (ongeldig gemaakte) data bij openen verversen
  useVersBijOpenen(query);

  // Eerst de data: mislukt een verversing (zwak 4G in het veld), dan blijft de pagina staan met de
  // laatst geladen rijen, en gaan concept, selectie en open dialogen niet verloren.
  // key: bij een ander perceel alle paginastaat (concept, selectie, tik-modus) opnieuw beginnen
  if (kaart) return <RijenkaartDetail key={perceelId} perceelId={perceelId} kaart={kaart} />;
  if (kaart === undefined && isError) {
    return (
      <div className="space-y-3">
        <TerugLink />
        <ErrorState title="Rijenkaart laden mislukt" message={rijenFoutmelding(error)} onRetry={() => void refetch()} />
      </div>
    );
  }
  if (kaart === null) {
    return (
      <div className="space-y-3">
        <TerugLink />
        <EmptyState icon={Rows3} title="Perceel niet gevonden" description="Dit perceel bestaat niet (meer) of is niet van jou." />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <TerugLink />
      <Skeleton className="h-8 w-56 bg-white/[0.05]" />
      <div className="flex flex-col gap-3 lg:grid lg:h-[calc(100dvh-14rem)] lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-4">
        <Skeleton className="h-[58svh] rounded-2xl bg-white/[0.04] lg:h-full" />
        <Skeleton className="h-64 rounded-2xl bg-white/[0.04] lg:h-full" />
      </div>
    </div>
  );
}

function RijenkaartDetail({ perceelId, kaart }: { perceelId: string; kaart: Rijenkaart }) {
  const { toast } = useToast();
  const { invalideerKaart, invalideerAlles } = useInvalidateRijen();
  const { invalidateSpuitschrift } = useInvalidateQueries();

  // ---- Afgeleide gegevens ---------------------------------------------------
  const geometrie = kaart.perceel.geometry;
  const perceelRD = useMemo(() => {
    if (!geometrie) return null;
    try {
      const p = perceelNaarRD(geometrie);
      return p.polygonen.length > 0 && p.oppervlakM2 > 0 ? p : null;
    } catch {
      return null;
    }
  }, [geometrie]);

  const rijen = useMemo(
    () =>
      [...kaart.rijen].sort(
        (a, b) => a.nummer - b.nummer || (a.status === 'gerooid' ? 1 : 0) - (b.status === 'gerooid' ? 1 : 0),
      ),
    [kaart.rijen],
  );
  const actieveRijen = useMemo(() => rijen.filter(r => r.status === 'actief'), [rijen]);
  const rijPerId = useMemo(() => new Map(rijen.map(r => [r.id, r] as const)), [rijen]);
  const subRas = useMemo(() => rassenVanSubpercelen(kaart.perceel.subpercelen), [kaart.perceel.subpercelen]);
  // Teller om de kaart opnieuw te laten tekenen als een gesleept eindpunt niet opgeslagen kon worden
  const [herstelTeller, setHerstelTeller] = useState(0);
  // Kleur en legenda: zolang een rij geen (blok-)ras heeft, het ras van zijn subperceel
  const kaartRijen = useMemo(
    () => rijenMetSubperceelRas(rijen, subRas),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rijen, subRas, herstelTeller],
  );
  const kleurVoorRas = useMemo(() => maakKleurVoorRas(kaartRijen.map(r => r.rasEffectief)), [kaartRijen]);
  const rasInfo = useCallback(
    (rij: Rij): RasInfo => {
      if (rij.rasEffectief) return { ras: rij.rasEffectief, vanSubperceel: false };
      const ras = rij.subParcelId ? subRas.get(rij.subParcelId) ?? null : null;
      return { ras, vanSubperceel: ras !== null };
    },
    [subRas],
  );
  const richting = useMemo(
    () => kaart.instellingen?.rijrichtingGraden ?? afgeleideRichting(rijen),
    [kaart.instellingen?.rijrichtingGraden, rijen],
  );
  const gekoppeld = useMemo(() => gekoppeldeRijen(kaart), [kaart]);
  const standaardBoomafstandM = useMemo(
    () => kaart.instellingen?.boomafstandM ?? gewogenAfstand(kaart.perceel.subpercelen, 'boom'),
    [kaart.instellingen?.boomafstandM, kaart.perceel.subpercelen],
  );

  // ---- Staat ------------------------------------------------------------------
  const [tab, setTab] = useState<PaneelTab>(() => (kaart.rijen.some(r => r.status === 'actief') ? 'rijen' : 'genereren'));
  const [basislaag, setBasislaag] = useState<Basislaag>('orthoHR');
  const [toonGerooid, setToonGerooid] = useState(false);
  const [geselecteerd, setGeselecteerd] = useState<ReadonlySet<string>>(() => new Set());
  const [selectieTekst, setSelectieTekst] = useState('');
  const [selectieFouten, setSelectieFouten] = useState<string[]>([]);
  const [kaartDoel, setKaartDoel] = useState<KaartDoel | null>(null);
  const [detailRijId, setDetailRijId] = useState<string | null>(null);
  const [notitieMarker, setNotitieMarker] = useState<string | null>(null);
  const [bewerkRijId, setBewerkRijId] = useState<string | null>(null);
  const [bewerkBezig, setBewerkBezig] = useState(false);
  const [gemarkeerdeBespuitingId, setGemarkeerdeBespuitingId] = useState<string | null>(null);
  const [rij1Kandidaat, setRij1Kandidaat] = useState<string | null>(null);
  const [startnummerInvoer, setStartnummerInvoer] = useState<number>(kaart.instellingen?.startnummer ?? 1);
  const [dialoog, setDialoog] = useState<DialoogVerzoek | null>(null);
  const [notitieConcept, setNotitieConcept] = useState<NotitieConcept | null>(null);
  const kaartRef = useRef<HTMLDivElement>(null);
  const tekenBezig = useRef(false);

  const concept = useRijenConcept({ perceelId, kaart, perceelRD, basislaag, gekoppeld });
  const heeftConcept = !!concept.basis;

  // Concept opslaan vanaf de kaart: het Genereren-paneel (met de bevestigingsdialoog) registreert zich hier
  const conceptOpslaanRef = useRef<(() => void) | null>(null);
  const registreerConceptOpslaan = useCallback((fn: (() => void) | null) => {
    conceptOpslaanRef.current = fn;
  }, []);
  const vraagConceptOpslaan = useCallback(() => conceptOpslaanRef.current?.(), []);

  // Niet-opgeslagen voorstel: waarschuwen bij herladen of de tab sluiten (Safari op iOS negeert dit soms)
  useEffect(() => {
    if (!heeftConcept) return;
    const waarschuw = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', waarschuw);
    return () => window.removeEventListener('beforeunload', waarschuw);
  }, [heeftConcept]);

  // ---- Meldingen en verversen -------------------------------------------------
  const meld = useCallback((titel: string, beschrijving?: string) => toast({ title: titel, description: beschrijving }), [toast]);
  const meldFout = useCallback(
    (fout: unknown, titel?: string) =>
      toast({ variant: 'destructive', title: titel ?? 'Er ging iets mis', description: rijenFoutmelding(fout) }),
    [toast],
  );
  // Alle rijen-queries: kaart (actief → direct opnieuw), overzicht en de rij-info bij bespuitingen
  // en notities elders in de app (nummers kunnen veranderd zijn).
  const verversen = useCallback(async () => {
    await invalideerAlles();
  }, [invalideerAlles]);

  // ---- Selectie -----------------------------------------------------------------
  const selectieNaarTekst = useCallback(
    (ids: ReadonlySet<string>) => formatteerBereiken(rijen.filter(r => ids.has(r.id)).map(r => r.nummer)),
    [rijen],
  );
  const zetSelectie = useCallback(
    (ids: Iterable<string>) => {
      const set = new Set(ids);
      setGeselecteerd(set);
      setSelectieTekst(selectieNaarTekst(set));
      setSelectieFouten([]);
    },
    [selectieNaarTekst],
  );
  const zetSelectieTekst = useCallback(
    (tekst: string) => {
      setSelectieTekst(tekst);
      if (!tekst.trim()) {
        setGeselecteerd(new Set());
        setSelectieFouten([]);
        return;
      }
      const res = parseRijSelectie(
        tekst,
        kaartRijen,
        kaart.blokken.map(b => ({ id: b.id, naam: b.naam })),
      );
      setGeselecteerd(new Set(res.rijIds));
      setSelectieFouten(res.fouten);
    },
    [kaartRijen, kaart.blokken],
  );
  const wisselSelectie = useCallback(
    (id: string) => {
      const n = new Set(geselecteerd);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      zetSelectie(n);
    },
    [geselecteerd, zetSelectie],
  );
  const wisSelectie = useCallback(() => {
    setGeselecteerd(new Set());
    setSelectieTekst('');
    setSelectieFouten([]);
  }, []);

  // Na nieuwe data: verdwenen rijen uit selectie en overlays halen. Het selectieveld alleen
  // herschrijven als er geselecteerde rijen verdwenen of een ander nummer kregen; anders blijft een
  // getypte selectie ('blok A') staan, ook als er tijdens het typen ververst wordt.
  const vorigeRijPerId = useRef(rijPerId);
  useEffect(() => {
    const vorige = vorigeRijPerId.current;
    vorigeRijPerId.current = rijPerId;
    if (vorige === rijPerId) return;
    if (selectieTekst.trim() && selectieFouten.length > 0) {
      // Getypte selectie met fouten (bv. 'rij 96' vlak voordat die rij er was): opnieuw beoordelen
      zetSelectieTekst(selectieTekst);
    } else if (geselecteerd.size > 0) {
      const over = [...geselecteerd].filter(id => rijPerId.has(id));
      const gewijzigd =
        over.length !== geselecteerd.size ||
        over.some(id => vorige.get(id)?.nummer !== rijPerId.get(id)?.nummer || vorige.get(id)?.status !== rijPerId.get(id)?.status);
      if (gewijzigd) zetSelectie(over);
    }
    if (detailRijId && !rijPerId.has(detailRijId)) setDetailRijId(null);
    if (bewerkRijId && !rijPerId.has(bewerkRijId)) setBewerkRijId(null);
    if (rij1Kandidaat && !rijPerId.has(rij1Kandidaat)) setRij1Kandidaat(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rijPerId]);

  // ---- Kaartdoel en tabs ------------------------------------------------------
  const scrollNaarKaart = useCallback(() => {
    const el = kaartRef.current;
    if (!el || typeof window === 'undefined' || window.innerWidth >= 1024) return;
    const r = el.getBoundingClientRect();
    if (r.top < 64 || r.bottom > window.innerHeight) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const zetKaartDoel = useCallback(
    (d: KaartDoel | null) => {
      setKaartDoel(d);
      if (d) {
        setDetailRijId(null);
        setNotitieMarker(null);
        setBewerkRijId(null);
        scrollNaarKaart();
      }
    },
    [scrollNaarKaart],
  );

  const zetTab = useCallback((t: PaneelTab) => {
    setTab(t);
    setKaartDoel(d => (d?.soort === 'notitie-positie' ? d : null));
    if (t !== 'indeling') setRij1Kandidaat(null);
  }, []);

  const zetBewerkRijId = useCallback(
    (id: string | null) => {
      setBewerkRijId(id);
      if (id) {
        setKaartDoel(null);
        scrollNaarKaart();
      }
    },
    [scrollNaarKaart],
  );

  const openDialoog = useCallback((d: DialoogVerzoek) => {
    if (d.soort === 'notitie') {
      setNotitieConcept({ rijIds: d.rijIds, tekst: '', positieM: null });
      return;
    }
    setDialoog(d);
  }, []);
  const sluitDialoog = useCallback(() => setDialoog(null), []);

  // ---- Gemarkeerde bespuiting ---------------------------------------------------
  const gemarkeerdeBespuiting = useMemo(
    () => kaart.bespuitingen.find(b => b.id === gemarkeerdeBespuitingId) ?? null,
    [kaart.bespuitingen, gemarkeerdeBespuitingId],
  );
  const gemarkeerd = useMemo(() => {
    const b = gemarkeerdeBespuiting;
    if (!b) return null;
    const ids = b.rijIds
      ? b.rijIds.filter(id => rijPerId.has(id))
      : actieveRijen.filter(r => r.subParcelId && b.subParcelIds.includes(r.subParcelId)).map(r => r.id);
    return new Set(ids);
  }, [gemarkeerdeBespuiting, rijPerId, actieveRijen]);
  const gemarkeerdLabel = gemarkeerdeBespuiting
    ? `Behandeld ${fmtDatum(gemarkeerdeBespuiting.datum)}${gemarkeerdeBespuiting.middelen ? ` · ${gemarkeerdeBespuiting.middelen}` : ''}`
    : null;

  // ---- Notities op de kaart -----------------------------------------------------
  const notitieMarkers: NotitieMarker[] = useMemo(
    () =>
      kaart.notities.flatMap(n => {
        const rij = rijPerId.get(n.rijId);
        if (!rij || rij.coordinates.length < 2) return [];
        if (rij.status === 'gerooid' && !toonGerooid) return [];
        try {
          return [
            {
              id: `${n.veldnotitieId}|${n.rijId}`,
              rijId: n.rijId,
              punt: puntOpRij(rij.coordinates, n.positieM ?? rij.lengteM / 2),
              tekst: n.tekst,
            },
          ];
        } catch {
          return [];
        }
      }),
    [kaart.notities, rijPerId, toonGerooid],
  );

  // ---- Kaart-callbacks -----------------------------------------------------------
  const kiesNotitiePositie = useCallback(
    (punt: LngLat) => {
      if (kaartDoel?.soort !== 'notitie-positie') return;
      const rij = rijPerId.get(kaartDoel.rijId);
      if (!rij || rij.coordinates.length < 2) {
        setKaartDoel(null);
        return;
      }
      const { positieM, afstandTotRijM } = positieOpRij(rij.coordinates, punt);
      if (afstandTotRijM > MAX_POSITIE_AFSTAND_M) {
        meld('Te ver van de rij', `Je tikte ${fmt(afstandTotRijM, 0)} m naast rij ${rij.nummer}. Tik op of vlak naast de rij.`);
        return;
      }
      setNotitieConcept(c => (c ? { ...c, positieM: rond(positieM, 1) } : c));
      setKaartDoel(null);
    },
    [kaartDoel, rijPerId, meld],
  );

  const onRijKlik = useCallback(
    (rijId: string, punt: LngLat) => {
      if (bewerkRijId) return;
      const d = kaartDoel;
      const rij = rijPerId.get(rijId);
      if (d?.soort === 'tik-selectie') {
        if (!rij) return;
        if (rij.status !== 'actief') {
          // bereik loopt over actieve nummers; een gerooide rij (zichtbaar met 'Gerooid tonen') is geen anker
          meld('Kies een actieve rij', `Rij ${rij.nummer} is gerooid.`);
          return;
        }
        const anker = d.anker ? rijPerId.get(d.anker) : undefined;
        if (!anker) {
          zetSelectie([rijId]);
          setKaartDoel({ soort: 'tik-selectie', anker: rijId });
          return;
        }
        const lo = Math.min(anker.nummer, rij.nummer);
        const hi = Math.max(anker.nummer, rij.nummer);
        const ids = actieveRijen.filter(r => r.nummer >= lo && r.nummer <= hi).map(r => r.id);
        zetSelectie(ids.length > 0 ? ids : [rijId]);
        setKaartDoel({ soort: 'tik-selectie', anker: null });
        return;
      }
      if (d?.soort === 'rij1') {
        if (!rij || rij.status !== 'actief') {
          meld('Kies een actieve rij');
          return;
        }
        setRij1Kandidaat(rijId);
        zetSelectie([rijId]);
        setKaartDoel(null);
        setTab('indeling');
        return;
      }
      if (d?.soort === 'notitie-positie') {
        kiesNotitiePositie(punt);
        return;
      }
      setNotitieMarker(null);
      setDetailRijId(rijId);
    },
    [bewerkRijId, kaartDoel, rijPerId, actieveRijen, zetSelectie, meld, kiesNotitiePositie],
  );

  const onKaartKlik = useCallback(
    (punt: LngLat) => {
      if (bewerkRijId) return;
      if (kaartDoel?.soort === 'notitie-positie') {
        kiesNotitiePositie(punt);
        return;
      }
      if (!kaartDoel) {
        setDetailRijId(null);
        setNotitieMarker(null);
      }
    },
    [bewerkRijId, kaartDoel, kiesNotitiePositie],
  );

  const tekenRij = useCallback(
    async (a: LngLat, b: LngLat, gewenst: number | null) => {
      if (tekenBezig.current) return;
      const lengte = afstand(naarRD(a), naarRD(b));
      if (lengte < MIN_RIJ_M) {
        meld('Rij te kort', `Een rij moet minimaal ${MIN_RIJ_M} m lang zijn. Tik begin en eind verder uit elkaar.`);
        return;
      }
      const nummer = gewenst ?? volgendNummer(rijen);
      if (actieveRijen.some(r => r.nummer === nummer)) {
        meld('Nummer bezet', `Rij ${nummer} bestaat al. Kies een ander nummer.`);
        setKaartDoel(null);
        return;
      }
      tekenBezig.current = true;
      try {
        const r = await rijenToepassenAction(perceelId, {
          rijen: [{ sleutel: 'getekend', nummer, coordinates: [a, b], geomBron: 'getekend' }],
        });
        meld(`Rij ${nummer} getekend`, fmtLengte(lengte));
        setKaartDoel(null);
        await verversen();
        const nieuw = r.ingevoegd[0]?.id;
        if (nieuw) zetSelectie([nieuw]);
      } catch (e) {
        meldFout(e, 'Rij tekenen mislukt');
      } finally {
        tekenBezig.current = false;
      }
    },
    [rijen, actieveRijen, perceelId, meld, meldFout, verversen, zetSelectie],
  );

  const onReferentielijn = useCallback(
    (a: LngLat, b: LngLat) => {
      if (kaartDoel?.soort === 'referentierij') {
        const fout = concept.verwerkReferentielijn(a, b);
        if (fout) {
          meld('Referentierij', fout);
          return;
        }
        setKaartDoel(null);
        setTab('genereren');
        return;
      }
      if (kaartDoel?.soort === 'rij-tekenen') void tekenRij(a, b, kaartDoel.nummer);
    },
    [kaartDoel, concept, meld, tekenRij],
  );

  const onEindpuntVerplaatst = useCallback(
    async (rijId: string, coordinates: LngLat[]) => {
      setBewerkBezig(true);
      try {
        await rijenToepassenAction(perceelId, { rijen: [{ id: rijId, coordinates, geomBron: 'getekend' }] });
        await invalideerKaart(perceelId);
      } catch (e) {
        meldFout(e, 'Eindpunt opslaan mislukt');
        // Kaart terugzetten naar de opgeslagen ligging
        setHerstelTeller(n => n + 1);
        await invalideerKaart(perceelId);
      } finally {
        setBewerkBezig(false);
      }
    },
    [perceelId, invalideerKaart, meldFout],
  );

  const onNotitieKlik = useCallback((id: string) => {
    setDetailRijId(null);
    setNotitieMarker(id);
  }, []);

  const modus: KaartModus =
    kaartDoel?.soort === 'tik-selectie' || kaartDoel?.soort === 'rij1'
      ? 'selecteren'
      : kaartDoel?.soort === 'referentierij' || kaartDoel?.soort === 'rij-tekenen'
        ? 'referentielijn'
        : kaartDoel?.soort === 'notitie-positie'
          ? 'positie'
          : 'bekijken';

  // ---- Context -------------------------------------------------------------------
  const ctx: RijenkaartCtxWaarde = {
    perceelId,
    kaart,
    perceelRD,
    rijen,
    actieveRijen,
    rijPerId,
    rasInfo,
    kleurVoorRas,
    richting,
    gekoppeld,
    standaardBoomafstandM,
    tab,
    zetTab,
    geselecteerd,
    selectieTekst,
    selectieFouten,
    zetSelectie,
    zetSelectieTekst,
    wisselSelectie,
    wisSelectie,
    kaartDoel,
    zetKaartDoel,
    detailRijId,
    zetDetailRijId: setDetailRijId,
    bewerkRijId,
    zetBewerkRijId,
    toonGerooid,
    zetToonGerooid: setToonGerooid,
    gemarkeerdeBespuitingId,
    zetGemarkeerdeBespuiting: setGemarkeerdeBespuitingId,
    gemarkeerdAantal: gemarkeerd?.size ?? 0,
    rij1Kandidaat,
    zetRij1Kandidaat: setRij1Kandidaat,
    startnummerInvoer,
    zetStartnummerInvoer: setStartnummerInvoer,
    concept,
    vraagConceptOpslaan,
    registreerConceptOpslaan,
    openDialoog,
    verversen,
    meldFout,
    meld,
  };

  const rijOpp = rijOppervlakHa(actieveRijen, kaart.instellingen?.rijafstandM ?? null);
  const aantalControleren = actieveRijen.filter(r => r.controleren).length;
  const selectieBalkZichtbaar = geselecteerd.size > 0 && tab !== 'genereren' && !kaartDoel && !bewerkRijId && !rij1Kandidaat;
  // Mobiel (vast onderaan het scherm) niet tegelijk met de rij- of notitiekaart onderaan de kaart: op
  // een kleine iPhone valt de balk anders over de knoppen van die kaart (die heeft zelf 'Selecteer').
  const detailKaartOpen = !!notitieMarker || (!!detailRijId && rijPerId.has(detailRijId));
  const selectieBalkMobielZichtbaar = selectieBalkZichtbaar && !detailKaartOpen;
  const kaartConcept = tab === 'genereren' ? concept.kaartConcept : null;

  const onderOverlay = kaartDoel ? (
    <ModusBalk />
  ) : bewerkRijId ? (
    <BewerkBalk bezig={bewerkBezig} />
  ) : rij1Kandidaat ? (
    <NummeringBalk />
  ) : notitieMarker ? (
    <NotitieDetailKaart markerId={notitieMarker} onSluit={() => setNotitieMarker(null)} />
  ) : detailRijId && rijPerId.has(detailRijId) ? (
    <RijDetailKaart rijId={detailRijId} />
  ) : tab === 'genereren' && concept.basis ? (
    <ConceptBalk />
  ) : (
    <RijenkaartLegenda
      rijen={kaartRijen}
      kleurVoorRas={kleurVoorRas}
      toonGerooid={toonGerooid}
      gemarkeerdLabel={gemarkeerdLabel}
      aantalGeselecteerd={geselecteerd.size}
      aantalNotities={notitieMarkers.length}
      heeftConcept={!!kaartConcept && kaartConcept.length > 0}
      opKaart
      className="absolute bottom-6 left-2 z-[1000] w-[min(260px,calc(100%-1rem))]"
    />
  );

  return (
    <RijenkaartCtx.Provider value={ctx}>
      <div
        className={cn(
          'flex flex-col gap-3 lg:gap-4',
          // ruimte voor de vaste selectiebalk onderaan (± 108 px + safe-area van de iPhone)
          selectieBalkMobielZichtbaar && 'pb-[calc(8.5rem+env(safe-area-inset-bottom))] lg:pb-0',
        )}
      >
        <div className="flex flex-col gap-1">
          <TerugLink bevestig={heeftConcept ? 'Het voorstel is nog niet opgeslagen. Weggaan en het voorstel weggooien?' : null} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{kaart.perceel.naam || 'Perceel'}</h1>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-300">
              Beta
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Chip>RVO {fmtHa(kaart.perceel.oppervlakHa)}</Chip>
            <Chip toon={actieveRijen.length > 0 ? 'emerald' : 'neutraal'}>
              {actieveRijen.length} {actieveRijen.length === 1 ? 'rij' : 'rijen'}
            </Chip>
            {actieveRijen.length > 0 && <Chip>rij-opp {fmtHa(rijOpp)}</Chip>}
            {aantalControleren > 0 && <Chip toon="amber">{aantalControleren} controleren</Chip>}
          </div>
        </div>

        {!geometrie ? (
          <EmptyState
            icon={MapPinOff}
            title="Geen perceelgrens"
            description="Dit perceel heeft nog geen perceelgrens. Teken of importeer de grens eerst (Percelen → Kaartweergave); daarna kun je hier de rijen genereren."
            action={
              <Link
                href="/percelen/kaart"
                className="inline-flex min-h-[44px] items-center rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-black hover:bg-emerald-400"
              >
                Naar de kaartweergave
              </Link>
            }
          />
        ) : (
          <div className="flex flex-col gap-3 lg:grid lg:h-[calc(100dvh-14rem)] lg:min-h-[520px] lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-4">
            <div
              ref={kaartRef}
              // isolate: de overlays (z-[1000]) blijven binnen de kaart, onder header, menu, dialogen en toasts.
              // svh: vaste hoogte, verspringt niet als de Safari-adresbalk in- of uitklapt.
              className="relative isolate h-[58svh] min-h-[320px] scroll-mt-20 overflow-hidden rounded-2xl border border-white/10 bg-black lg:h-full"
            >
              <RijenkaartMap
                perceelGeometrie={geometrie}
                rijen={kaartRijen}
                toonGerooid={toonGerooid}
                kleurVoorRas={kleurVoorRas}
                geselecteerd={geselecteerd}
                gemarkeerd={gemarkeerd}
                concept={kaartConcept}
                notities={notitieMarkers}
                modus={modus}
                bewerkRijId={bewerkRijId}
                basislaag={basislaag}
                fitSleutel={perceelId}
                onRijKlik={onRijKlik}
                onKaartKlik={onKaartKlik}
                onReferentielijn={onReferentielijn}
                lijnHints={kaartDoel?.soort === 'rij-tekenen' ? RIJ_TEKENEN_HINTS : null}
                onEindpuntVerplaatst={(id, coords) => void onEindpuntVerplaatst(id, coords)}
                herstelSleutel={herstelTeller}
                onNotitieKlik={onNotitieKlik}
                onBasislaagChange={setBasislaag}
              />
              {onderOverlay}
            </div>

            <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-slate-950/60 lg:h-full">
              <div className="shrink-0 p-3 pb-2">
                <Segment label="Paneel" waarde={tab} onChange={zetTab} opties={TABS} />
              </div>
              <div className="min-h-0 flex-1 px-3 pb-4 pt-2 lg:overflow-y-auto">
                {tab === 'rijen' && <RijenPaneel />}
                {tab === 'genereren' && <GenererenPaneel />}
                {tab === 'indeling' && <IndelingPaneel />}
                {tab === 'export' && <ExportPaneel />}
              </div>
              {selectieBalkZichtbaar && <SelectieBalkPaneel className="shrink-0" />}
            </aside>
          </div>
        )}
      </div>

      {selectieBalkMobielZichtbaar && <SelectieBalkMobiel />}

      {notitieConcept && (
        <NotitieDialoog
          open={kaartDoel?.soort !== 'notitie-positie'}
          concept={notitieConcept}
          onChange={setNotitieConcept}
          onSluit={() => setNotitieConcept(null)}
          onKiesOpKaart={() => {
            const rijId = notitieConcept.rijIds[0];
            if (rijId) zetKaartDoel({ soort: 'notitie-positie', rijId });
          }}
        />
      )}
      {dialoog?.soort === 'blok' && <BlokDialoog blokId={dialoog.blokId} rijIds={dialoog.rijIds} onSluit={sluitDialoog} />}
      {dialoog?.soort === 'blok-toekennen' && <BlokToekennenDialoog rijIds={dialoog.rijIds} onSluit={sluitDialoog} />}
      {dialoog?.soort === 'bestuiver' && <BestuiverDialoog rijIds={dialoog.rijIds} onSluit={sluitDialoog} />}
      {dialoog?.soort === 'rooien' && <RooienDialoog rijIds={dialoog.rijIds} onSluit={sluitDialoog} />}
      {dialoog?.soort === 'verwijderen' && <VerwijderDialoog rijIds={dialoog.rijIds} onSluit={sluitDialoog} />}
      {dialoog?.soort === 'blok-verwijderen' && <BlokVerwijderDialoog blokId={dialoog.blokId} onSluit={sluitDialoog} />}
      {dialoog?.soort === 'bespuiting' && (
        <BespuitingDialoog
          perceelId={perceelId}
          rijIds={dialoog.rijIds}
          onSluit={sluitDialoog}
          onSucces={() => {
            void invalideerAlles();
            void invalidateSpuitschrift();
          }}
        />
      )}
    </RijenkaartCtx.Provider>
  );
}

/** Bestaande bespuitingsdialoog, met de rijselectie vooringevuld. */
function BespuitingDialoog({
  perceelId,
  rijIds,
  onSluit,
  onSucces,
}: {
  perceelId: string;
  rijIds: string[];
  onSluit: () => void;
  onSucces: () => void;
}) {
  const { data: parcels } = useParcels();
  const initieleRijSelectie = useMemo(() => ({ perceelId, rijIds }), [perceelId, rijIds]);
  return (
    <NewSprayDialog
      open
      onOpenChange={o => {
        if (!o) onSluit();
      }}
      parcels={parcels ?? []}
      onSuccess={onSucces}
      initieleRijSelectie={initieleRijSelectie}
    />
  );
}
