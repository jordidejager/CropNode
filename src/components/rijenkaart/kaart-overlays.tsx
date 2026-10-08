'use client';

/**
 * Rijenkaart (beta) — overlays onderaan de kaart: rij-detailkaart, notitie, modusbalk (tik-modi)
 * en de balk tijdens het slepen van eindpunten. Alle overlays hebben `data-rk-overlay`, zodat de
 * kaart er geen rijnummers onder plaatst.
 */

import { useState, type ReactNode } from 'react';
import { CheckSquare, Crosshair, Flower2, Loader2, Move, RotateCcw, RotateCw, StickyNote, Trash2, TreePine, X } from 'lucide-react';
import { naarRD, windstreek } from '@/lib/rijen/geo';
import { rijenToepassenAction } from '@/app/rijen-actions';
import { boomnummer, rijOffset, verschuifRij } from '@/lib/rijen/generatie';
import { cn } from '@/lib/utils';
import { useRijenkaartCtx } from './rijenkaart-context';
import { fmt, fmtDatum, fmtLengte, pijl, verschuifKnoppen } from './rijen-hulp';
import { Knop, Segment } from './ui';
import { nummeringTekst, useNummering } from './indeling-paneel';

const KAART_STIJL =
  'absolute inset-x-2 bottom-2 z-[1000] rounded-2xl border border-white/10 bg-black/85 text-white shadow-2xl backdrop-blur-md';

function SluitKnop({ onClick, label = 'Sluiten' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
    >
      <X className="h-5 w-5" />
    </button>
  );
}

function ActieKnop({
  icoon,
  label,
  onClick,
  gevaar,
  actief,
}: {
  icoon: ReactNode;
  label: string;
  onClick: () => void;
  gevaar?: boolean;
  actief?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actief}
      className={cn(
        'flex min-h-[48px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border px-0 text-[10px] font-semibold leading-tight tracking-tight transition-colors',
        gevaar
          ? 'border-red-500/25 bg-red-500/10 text-red-200 active:bg-red-500/20'
          : actief
            ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-200'
            : 'border-white/10 bg-white/[0.06] text-white/85 active:bg-white/[0.12]',
      )}
    >
      {icoon}
      <span className="w-full truncate text-center">{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Rij-detailkaart (compact: de getikte rij moet erboven zichtbaar blijven)
// ---------------------------------------------------------------------------

export function RijDetailKaart({ rijId }: { rijId: string }) {
  const ctx = useRijenkaartCtx();
  const rij = ctx.rijPerId.get(rijId);
  if (!rij) return null;
  const st = ctx.kaart.status[rijId];
  const ras = ctx.rasInfo(rij);
  const gerooid = rij.status === 'gerooid';
  const geselecteerd = ctx.geselecteerd.has(rijId);
  const aantalNotities = st?.aantalNotities ?? ctx.kaart.notities.filter(n => n.rijId === rijId).length;
  const sluit = () => ctx.zetDetailRijId(null);
  const feiten = [
    fmtLengte(rij.lengteM),
    rij.aantalBomenEffectief !== null ? `${rij.aantalBomen === null ? '≈ ' : ''}${fmt(rij.aantalBomenEffectief, 0)} bomen` : null,
    `${aantalNotities} ${aantalNotities === 1 ? 'notitie' : 'notities'}`,
    rij.geomBron !== 'gegenereerd' ? rij.geomBron : null,
  ].filter(Boolean);
  // Afwijking t.o.v. het (fijnafgestelde) raster uit de instellingen
  const inst = ctx.kaart.instellingen;
  let afwijkingCm: number | null = null;
  if (ctx.perceelRD && inst?.rijrichtingGraden != null && inst.rijafstandM && inst.faseM != null && rij.coordinates.length >= 2) {
    const o = rijOffset(ctx.perceelRD, inst.rijrichtingGraden, rij.coordinates.map(c => naarRD(c)));
    const k = Math.round((o - inst.faseM) / inst.rijafstandM);
    afwijkingCm = Math.round((o - (inst.faseM + k * inst.rijafstandM)) * 100);
  }
  const ligging = [
    afwijkingCm !== null ? `${afwijkingCm > 0 ? '+' : ''}${afwijkingCm} cm t.o.v. raster` : null,
    rij.nauwkeurigheidM !== null ? `±${Math.round(rij.nauwkeurigheidM * 100)} cm` : null,
    rij.coordinates.length > 2 ? `gebogen (${rij.coordinates.length} punten)` : null,
  ].filter(Boolean);
  const bespuiting = st?.laatsteBespuitingDatum
    ? `${fmtDatum(st.laatsteBespuitingDatum)}${st.laatsteBespuitingMiddelen ? ` · ${st.laatsteBespuitingMiddelen}` : ''}${
        st.laatsteBespuitingViaRijen === true ? ' (op rijen)' : st.laatsteBespuitingViaRijen === false ? ' (hele perceel)' : ''
      }`
    : 'nog niet gespoten';

  const acties: ReactNode[] = [
    <ActieKnop
      key="sel"
      icoon={<CheckSquare className="h-4 w-4" />}
      label={geselecteerd ? 'Gekozen' : 'Selecteer'}
      actief={geselecteerd}
      onClick={() => ctx.wisselSelectie(rijId)}
    />,
  ];
  if (!gerooid) {
    acties.push(<ActieKnop key="sleep" icoon={<Move className="h-4 w-4" />} label="Slepen" onClick={() => ctx.zetBewerkRijId(rijId)} />);
  }
  acties.push(
    <ActieKnop key="not" icoon={<StickyNote className="h-4 w-4" />} label="Notitie" onClick={() => ctx.openDialoog({ soort: 'notitie', rijIds: [rijId] })} />,
  );
  if (!gerooid) {
    acties.push(
      <ActieKnop
        key="best"
        icoon={<Flower2 className="h-4 w-4" />}
        label="Bestuiver"
        actief={rij.rol === 'bestuiver'}
        onClick={() => ctx.openDialoog({ soort: 'bestuiver', rijIds: [rijId] })}
      />,
    );
  }
  acties.push(
    <ActieKnop
      key="rooi"
      icoon={<TreePine className="h-4 w-4" />}
      label={gerooid ? 'Herstellen' : 'Rooien'}
      onClick={() => ctx.openDialoog({ soort: 'rooien', rijIds: [rijId] })}
    />,
  );
  if (!gerooid) {
    acties.push(
      <ActieKnop
        key="wis"
        gevaar
        icoon={<Trash2 className="h-4 w-4" />}
        label="Verwijder"
        onClick={() => ctx.openDialoog({ soort: 'verwijderen', rijIds: [rijId] })}
      />,
    );
  }

  return (
    <div data-rk-overlay="" className={cn(KAART_STIJL, 'max-h-[80%] overflow-y-auto p-2.5')} role="dialog" aria-label={`Rij ${rij.nummer}`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 pl-0.5">
          <p className="truncate text-base font-bold leading-tight">
            Rij {rij.nummer}
            {rij.label?.trim() ? <span className="font-medium text-white/60"> · {rij.label}</span> : null}
            {gerooid && (
              <span className="ml-2 rounded-full bg-stone-500/30 px-2 py-0.5 text-[11px] font-semibold text-stone-200">
                gerooid{rij.gerooidOp ? ` ${fmtDatum(rij.gerooidOp)}` : ''}
              </span>
            )}
            {!gerooid && rij.controleren && (
              <span className="ml-2 rounded-full bg-orange-500/20 px-2 py-0.5 text-[11px] font-semibold text-orange-200">controleren</span>
            )}
          </p>
          <p className="mt-0.5 truncate text-[12px] text-white/70">
            <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: ctx.kleurVoorRas(ras.ras) }} />
            {ras.ras ?? 'Ras onbekend'}
            {ras.vanSubperceel && <span className="text-white/45"> (ras van subperceel)</span>}
            {' · '}
            {rij.blokNaam ?? 'geen blok'}
            {rij.rol === 'bestuiver' ? ' · bestuiver' : ''}
          </p>
          <p className="truncate text-[12px] text-white/55">{feiten.join(' · ')}</p>
          <p className="truncate text-[12px] text-white/55">Laatste bespuiting: {bespuiting}</p>
          {ligging.length > 0 && <p className="truncate text-[12px] text-white/45">Ligging: {ligging.join(' · ')}</p>}
        </div>
        <SluitKnop onClick={sluit} />
      </div>
      <div className="mt-2 grid auto-cols-fr grid-flow-col gap-[3px]">{acties}</div>
      {!gerooid && <RijLiggingKnoppen rijId={rijId} />}
    </div>
  );
}

/** Eén rij 10 cm evenwijdig verschuiven of opnieuw precies op de foto leggen */
function RijLiggingKnoppen({ rijId }: { rijId: string }) {
  const ctx = useRijenkaartCtx();
  const [bezig, setBezig] = useState(false);
  const rij = ctx.rijPerId.get(rijId);
  if (!rij || ctx.richting === null) return null;
  const knoppen = verschuifKnoppen(ctx.richting);
  const verschuif = async (delta: number) => {
    if (bezig) return;
    setBezig(true);
    try {
      await rijenToepassenAction(ctx.perceelId, {
        rijen: [{ id: rijId, coordinates: verschuifRij(rij.coordinates, delta, ctx.richting), geomBron: 'getekend' }],
      });
      await ctx.verversen();
    } catch (e) {
      ctx.meldFout(e, 'Verschuiven mislukt');
    } finally {
      setBezig(false);
    }
  };
  const knop =
    'flex min-h-[44px] items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/[0.06] text-[12px] font-semibold tabular-nums text-white/85 active:bg-white/[0.12] disabled:opacity-45';
  return (
    <div className="mt-[3px] grid grid-cols-3 gap-[3px]">
      <button type="button" className={knop} disabled={bezig} onClick={() => void verschuif(0.1 * knoppen[0].teken)} aria-label={`Rij ${rij.nummer} 10 cm naar het ${windstreek(knoppen[0].graden)}`}>
        {pijl(knoppen[0].graden)} 10 cm
      </button>
      <button
        type="button"
        className={knop}
        disabled={bezig || ctx.verfijning.status === 'bezig'}
        onClick={() => {
          ctx.zetDetailRijId(null);
          void ctx.verfijning.start({ rijIds: [rijId] });
        }}
        aria-label={`Rij ${rij.nummer} opnieuw op de luchtfoto leggen`}
      >
        {bezig ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crosshair className="h-3.5 w-3.5" />} Op foto
      </button>
      <button type="button" className={knop} disabled={bezig} onClick={() => void verschuif(0.1 * knoppen[1].teken)} aria-label={`Rij ${rij.nummer} 10 cm naar het ${windstreek(knoppen[1].graden)}`}>
        10 cm {pijl(knoppen[1].graden)}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rijen precies op de luchtfoto leggen: voortgang en voorstel
// ---------------------------------------------------------------------------

export function VerfijningBalk() {
  const ctx = useRijenkaartCtx();
  const v = ctx.verfijning;
  if (v.status === 'bezig') {
    return (
      <div data-rk-overlay="" className={cn(KAART_STIJL, 'flex items-center gap-3 border-cyan-300/30 p-2 pl-3')} role="status">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-cyan-200" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-cyan-50">{v.voortgang ?? 'Bezig…'}</p>
        <Knop klein onClick={v.annuleren}>
          Stop
        </Knop>
      </div>
    );
  }
  const vs = v.voorstel;
  if (!vs) return null;
  const r = vs.resultaat;
  const st = vs.modus === 'raster' ? r.rasterStat : r.perRij;
  const aantal = vs.rijen.length;
  const krom = vs.modus === 'per-rij' ? vs.rijen.filter(x => x.punten > 2).length : 0;
  const controleren = vs.rijen.filter(x => x.controleren).length;
  const titel = vs.rijIds
    ? `Rij ${vs.rijen.map(x => x.nummer).join(', ')} opnieuw op de foto`
    : vs.modus === 'raster'
      ? 'Raster fijnafgesteld op de foto'
      : 'Rijen per rij op de foto gelegd';
  const uitleg = vs.rijIds
    ? null
    : r.aanbevolen === 'raster'
      ? `De rijen liggen regelmatig (±${Math.round(r.raster.restStdM * 100)} cm): een fijnafgesteld raster (rijafstand ${fmt(r.raster.rijafstandM, 3)} m) is genoeg.`
      : `De rijen wijken per rij af (±${Math.round(r.raster.restStdM * 100)} cm rond een regelmatig raster): per rij aanbevolen.`;
  return (
    <div data-rk-overlay="" className={cn(KAART_STIJL, 'max-h-[80%] space-y-1.5 overflow-y-auto border-cyan-300/30 p-2.5')} role="group" aria-label="Rijen op de foto leggen">
      <div>
        <p className="text-[13px] font-semibold leading-snug text-cyan-50">{titel}</p>
        <p className="text-[12px] leading-snug text-white/70">
          {aantal} {aantal === 1 ? 'rij' : 'rijen'} · gem. {fmt(st.gemiddeldCm, 0)} cm verschoven, max {fmt(st.maxCm, 0)} cm
          {krom > 0 ? ` · ${krom} gebogen` : ''}
          {controleren > 0 ? <span className="text-orange-200"> · {controleren} controleren</span> : null}
        </p>
        {uitleg && <p className="text-[12px] leading-snug text-white/50">{uitleg}</p>}
        {r.einden.bepaald && (r.einden.verlengd > 0 || r.einden.ingekort > 0) && (
          <p className="text-[12px] leading-snug text-white/50">
            Uiteinden uit de foto{r.einden.metZomerfoto ? ' (zomerfoto: waar staan bomen)' : ''}:{' '}
            {[
              r.einden.verlengd > 0 ? `${r.einden.verlengd} ${r.einden.verlengd === 1 ? 'rij' : 'rijen'} langer` : null,
              r.einden.ingekort > 0 ? `${r.einden.ingekort} korter` : null,
            ]
              .filter(Boolean)
              .join(', ')}
            .
          </p>
        )}
        {vs.overgeslagen > 0 && (
          <p className="text-[12px] leading-snug text-white/45">
            {vs.overgeslagen} handmatig getekende of versleepte {vs.overgeslagen === 1 ? 'rij blijft' : 'rijen blijven'} liggen.
          </p>
        )}
      </div>
      {!vs.rijIds && (
        <Segment
          label="Variant"
          waarde={vs.modus}
          onChange={v.zetModus}
          opties={[
            { waarde: 'per-rij', label: r.aanbevolen === 'per-rij' ? 'Per rij ★' : 'Per rij' },
            { waarde: 'raster', label: r.aanbevolen === 'raster' ? 'Raster ★' : 'Raster' },
          ]}
        />
      )}
      <div className="grid grid-cols-2 gap-2">
        <Knop klein onClick={v.annuleren} disabled={v.bezigOpslaan}>
          Niet toepassen
        </Knop>
        <Knop klein soort="primair" bezig={v.bezigOpslaan} disabled={aantal === 0} onClick={() => void v.opslaan()}>
          Opslaan ({aantal})
        </Knop>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Concept-correcties op de kaart (duimbereik terwijl je naar het voorstel kijkt)
// ---------------------------------------------------------------------------

export function ConceptBalk() {
  const { concept, vraagConceptOpslaan } = useRijenkaartCtx();
  const basis = concept.basis;
  if (!basis) return null;
  const aantal = concept.statistiek.aantal;
  const knoppen = verschuifKnoppen(basis.richtingGraden);
  const knop = 'flex min-h-[44px] items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/[0.08] text-[12px] font-semibold tabular-nums text-white active:bg-white/[0.16]';
  return (
    <div data-rk-overlay="" className={cn(KAART_STIJL, 'border-yellow-300/25 p-2')} role="group" aria-label="Voorstel corrigeren">
      <p className="truncate px-1 pb-1.5 text-[12px] text-white/80">
        <span className="font-semibold text-yellow-100">Voorstel: {concept.statistiek.aantal} rijen</span>
        {concept.statistiek.aantalControleren > 0 && (
          <span className="text-orange-200"> · {concept.statistiek.aantalControleren} controleren</span>
        )}
        <span className="text-white/50"> · {fmt(basis.rijafstandM, 2)} m · {fmt(basis.richtingGraden, 1)}°</span>
        {concept.eindenUitFoto && concept.einden.status === 'bezig' && <span className="text-emerald-200/80"> · uiteinden bepalen…</span>}
        {concept.eindenUitFoto && concept.einden.status === 'klaar' && concept.einden.ingekort > 0 && (
          <span className="text-white/50"> · {concept.einden.ingekort} ingekort</span>
        )}
      </p>
      <div className="grid grid-cols-5 gap-1">
        <button type="button" className={knop} onClick={() => concept.verschuif(0.1 * knoppen[0].teken)} aria-label={`Voorstel 10 cm naar het ${windstreek(knoppen[0].graden)}`}>
          {pijl(knoppen[0].graden)} 10
        </button>
        <button type="button" className={knop} onClick={concept.halveRij} aria-label="Voorstel halve rij verschuiven">
          ½ rij
        </button>
        <button type="button" className={knop} onClick={() => concept.verschuif(0.1 * knoppen[1].teken)} aria-label={`Voorstel 10 cm naar het ${windstreek(knoppen[1].graden)}`}>
          {pijl(knoppen[1].graden)} 10
        </button>
        <button type="button" className={knop} onClick={() => concept.draai(-0.5)} aria-label="Voorstel 0,5° linksom draaien">
          <RotateCcw className="h-3.5 w-3.5" /> ½°
        </button>
        <button type="button" className={knop} onClick={() => concept.draai(0.5)} aria-label="Voorstel 0,5° rechtsom draaien">
          <RotateCw className="h-3.5 w-3.5" /> ½°
        </button>
      </div>
      {/* Opslaan binnen duimbereik: dezelfde route als de knop onderaan het paneel (incl. bevestiging) */}
      <div className="mt-1.5 flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate px-1 text-[12px] font-medium text-yellow-100/80">Nog niet opgeslagen</span>
        <Knop
          soort="primair"
          klein
          bezig={concept.bezigMetOpslaan}
          disabled={!concept.plan || aantal === 0}
          onClick={vraagConceptOpslaan}
          className="shrink-0"
        >
          {aantal === 0 ? 'Geen rijen' : `Opslaan (${aantal})`}
        </Knop>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notitie op de kaart
// ---------------------------------------------------------------------------

export function NotitieDetailKaart({ markerId, onSluit }: { markerId: string; onSluit: () => void }) {
  const ctx = useRijenkaartCtx();
  const [veldnotitieId, rijId] = markerId.split('|');
  const notitie = ctx.kaart.notities.find(n => n.veldnotitieId === veldnotitieId && n.rijId === rijId);
  const rij = rijId ? ctx.rijPerId.get(rijId) : undefined;
  if (!notitie) return null;
  const boom = rij ? boomnummer(notitie.positieM, rij.boomafstandM ?? ctx.standaardBoomafstandM) : null;

  return (
    <div data-rk-overlay="" className={cn(KAART_STIJL, 'max-h-[70%] overflow-y-auto p-3')} role="dialog" aria-label="Notitie">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-amber-300">
            Notitie{rij ? ` · rij ${rij.nummer}` : ''}
            {notitie.positieM !== null ? ` · ${fmt(notitie.positieM, 1)} m` : ''}
            {boom !== null ? ` (boom ${boom})` : ''}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-white/90">{notitie.tekst}</p>
          <p className="mt-1 text-[11px] text-white/45">
            {fmtDatum(notitie.createdAt)}
            {notitie.status && notitie.status !== 'open' ? ` · ${notitie.status}` : ''}
          </p>
        </div>
        <SluitKnop onClick={onSluit} />
      </div>
      {rij && (
        <Knop
          klein
          vol
          className="mt-2"
          onClick={() => {
            onSluit();
            ctx.zetDetailRijId(rij.id);
          }}
        >
          Naar rij {rij.nummer}
        </Knop>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modusbalk (tik-modi) en bewerkbalk
// ---------------------------------------------------------------------------

export function ModusBalk() {
  const ctx = useRijenkaartCtx();
  const doel = ctx.kaartDoel;
  if (!doel) return null;

  let tekst: string;
  let knop = 'Annuleren';
  switch (doel.soort) {
    case 'tik-selectie': {
      const anker = doel.anker ? ctx.rijPerId.get(doel.anker) : undefined;
      tekst = anker
        ? `Rij ${anker.nummer} gekozen — tik de laatste rij van het bereik`
        : 'Tik-selectie: tik de eerste rij van het bereik';
      knop = 'Klaar';
      break;
    }
    case 'referentierij':
      tekst = 'Tik twee punten op één boomrij, zo ver mogelijk uit elkaar (minimaal 20 m)';
      break;
    case 'rij-tekenen':
      tekst = `Tik begin en eind van de nieuwe rij${doel.nummer !== null ? ` (nummer ${doel.nummer})` : ''}`;
      break;
    case 'rij1':
      tekst = `Tik op de rij die nummer ${ctx.startnummerInvoer} moet worden`;
      break;
    case 'notitie-positie': {
      const rij = ctx.rijPerId.get(doel.rijId);
      tekst = `Tik op de plek langs rij ${rij?.nummer ?? ''}`;
      break;
    }
  }

  return (
    <div data-rk-overlay="" className={cn(KAART_STIJL, 'flex items-center gap-3 border-yellow-300/30 p-2 pl-3')} role="status">
      <p className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-yellow-50">{tekst}</p>
      <Knop klein soort={doel.soort === 'tik-selectie' ? 'primair' : 'secundair'} onClick={() => ctx.zetKaartDoel(null)}>
        {knop}
      </Knop>
    </div>
  );
}

export function BewerkBalk({ bezig }: { bezig: boolean }) {
  const ctx = useRijenkaartCtx();
  const rij = ctx.bewerkRijId ? ctx.rijPerId.get(ctx.bewerkRijId) : undefined;
  if (!rij) return null;
  return (
    <div data-rk-overlay="" className={cn(KAART_STIJL, 'flex items-center gap-3 p-2 pl-3')} role="status">
      <p className="min-w-0 flex-1 text-[13px] leading-snug text-white/85">
        Rij {rij.nummer}: sleep <b>B</b> (begin) of <b>E</b> (eind) naar de juiste plek.
        {bezig ? ' Opslaan…' : ''}
      </p>
      <Knop klein soort="primair" bezig={bezig} onClick={() => ctx.zetBewerkRijId(null)}>
        Klaar
      </Knop>
    </div>
  );
}

/** Na "Rij 1 aanwijzen": voorstel + bevestigen direct op de kaart. */
export function NummeringBalk() {
  const { voorstel, bezig, bevestig, annuleer } = useNummering();
  if (!voorstel) return null;
  return (
    <div data-rk-overlay="" className={cn(KAART_STIJL, 'space-y-2 border-emerald-400/30 p-2.5')} role="group" aria-label="Nieuwe nummering">
      <p className="px-0.5 text-[13px] font-medium leading-snug text-white">{nummeringTekst(voorstel)}</p>
      <p className="px-0.5 text-[12px] text-white/55">
        {voorstel.aantalGewijzigd} {voorstel.aantalGewijzigd === 1 ? 'rij krijgt' : 'rijen krijgen'} een ander nummer
        {voorstel.aantalOnderEen > 0 ? ` · let op: ${voorstel.aantalOnderEen} onder 1` : ''}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Knop klein onClick={annuleer} disabled={bezig}>
          Annuleren
        </Knop>
        <Knop klein soort="primair" bezig={bezig} onClick={() => void bevestig()}>
          Bevestigen
        </Knop>
      </div>
    </div>
  );
}
