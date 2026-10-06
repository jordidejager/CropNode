'use client';

/**
 * Rijenkaart (beta) — dialogen voor acties op rijen: notitie, blok (nieuw/bewerken/toekennen/
 * verwijderen), bestuiver, rooien en verwijderen. Alle getallen gaan als echte numbers naar de
 * rijen-actions; fouten worden met rijenFoutmelding getoond (via ctx.meldFout).
 */

import { useEffect, useId, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Layers, MapPin, Plus } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { boomnummer } from '@/lib/rijen/generatie';
import { formatteerBereiken } from '@/lib/rijen/selectie';
import type { Rij } from '@/lib/rijen/types';
import {
  maakRijNotitieAction,
  rijenToepassenAction,
  slaBlokOpAction,
  verwijderBlokAction,
  zetRijAttributenAction,
} from '@/app/rijen-actions';
import { useRijenkaartCtx } from './rijenkaart-context';
import { fmt, fmtLengte, kantNaam, rasSuggesties, vandaagISO } from './rijen-hulp';
import { GetalVeld, Knop, Melding, Veld, tekstVeldStijl } from './ui';

const DIALOOG_STIJL = 'max-h-[90dvh] overflow-y-auto border-white/10 bg-slate-950/95 backdrop-blur-xl sm:max-w-md';
const ALERT_STIJL = 'max-w-md border-white/10 bg-slate-900';

function rijenOmschrijving(rijen: readonly Rij[]): string {
  if (rijen.length === 0) return 'geen rijen';
  if (rijen.length === 1) return `rij ${rijen[0].label?.trim() || rijen[0].nummer}`;
  return `rij ${formatteerBereiken(rijen.map(r => r.nummer))} (${rijen.length} rijen)`;
}

function useRijen(rijIds: readonly string[]): Rij[] {
  const { rijPerId } = useRijenkaartCtx();
  return useMemo(
    () => rijIds.map(id => rijPerId.get(id)).filter((r): r is Rij => !!r).sort((a, b) => a.nummer - b.nummer),
    [rijIds, rijPerId],
  );
}

// ---------------------------------------------------------------------------
// Notitie
// ---------------------------------------------------------------------------

export interface NotitieConcept {
  rijIds: string[];
  tekst: string;
  positieM: number | null;
}

export function NotitieDialoog({
  open,
  concept,
  onChange,
  onSluit,
  onKiesOpKaart,
}: {
  open: boolean;
  concept: NotitieConcept;
  onChange: (c: NotitieConcept) => void;
  onSluit: () => void;
  onKiesOpKaart: () => void;
}) {
  const ctx = useRijenkaartCtx();
  const queryClient = useQueryClient();
  const rijen = useRijen(concept.rijIds);
  const [bezig, setBezig] = useState(false);
  const tekstId = useId();
  const eenRij = rijen.length === 1 ? rijen[0] : null;
  const boomafstand = eenRij ? eenRij.boomafstandM ?? ctx.standaardBoomafstandM : null;
  const boom = eenRij ? boomnummer(concept.positieM, boomafstand) : null;
  const beginkant = ctx.kaart.instellingen?.beginkantGraden ?? null;

  const slaOp = async () => {
    const tekst = concept.tekst.trim();
    if (!tekst || rijen.length === 0) return;
    setBezig(true);
    try {
      await maakRijNotitieAction({
        perceelId: ctx.perceelId,
        tekst,
        rijen: rijen.map(r => ({ rijId: r.id, positieM: eenRij && concept.positieM !== null ? concept.positieM : null })),
      });
      ctx.meld('Notitie opgeslagen', rijenOmschrijving(rijen));
      void queryClient.invalidateQueries({ queryKey: ['field-notes'] });
      onSluit();
      await ctx.verversen();
    } catch (e) {
      ctx.meldFout(e, 'Notitie opslaan mislukt');
    } finally {
      setBezig(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onSluit()}>
      <DialogContent className={DIALOOG_STIJL}>
        <DialogHeader>
          <DialogTitle>Notitie</DialogTitle>
          <DialogDescription>Op {rijenOmschrijving(rijen)}. De notitie komt ook bij Veldnotities te staan.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Veld label="Tekst" htmlFor={tekstId}>
            <textarea
              id={tekstId}
              value={concept.tekst}
              onChange={e => onChange({ ...concept, tekst: e.target.value })}
              rows={4}
              placeholder="Bijv. bladluis in de top, boom 12 dood, paal kapot…"
              className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-base text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-emerald-400/50 md:text-sm"
            />
          </Veld>

          {eenRij && (
            <div className="space-y-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <p className="text-[13px] font-medium text-white/70">Plek in de rij (optioneel)</p>
              <Knop vol icoon={<MapPin className="h-4 w-4" />} onClick={onKiesOpKaart}>
                Tik op de kaart langs de rij
              </Knop>
              <div className="flex items-end gap-2">
                <Veld label="Meter vanaf begin" className="flex-1">
                  <GetalVeld
                    label="Meter vanaf het begin van de rij"
                    waarde={concept.positieM}
                    onChange={n => onChange({ ...concept, positieM: n })}
                    achtervoegsel="m"
                    decimalen={1}
                    min={0}
                    max={Math.max(1, Math.ceil(eenRij.lengteM))}
                  />
                </Veld>
                {concept.positieM !== null && (
                  <Knop soort="stil" onClick={() => onChange({ ...concept, positieM: null })}>
                    Wissen
                  </Knop>
                )}
              </div>
              <p className="text-[12px] text-white/45">
                Rij is {fmtLengte(eenRij.lengteM)}
                {beginkant !== null ? `; het begin ligt aan de ${kantNaam(beginkant)}` : ''}.
                {concept.positieM !== null &&
                  (boom !== null
                    ? ` ≈ boom ${boom} (boomafstand ${fmt(boomafstand, 2)} m).`
                    : ' Geen boomafstand bekend: stel die in onder Indeling voor boomnummers.')}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Knop onClick={onSluit}>Annuleren</Knop>
            <Knop soort="primair" bezig={bezig} disabled={!concept.tekst.trim() || rijen.length === 0} onClick={() => void slaOp()}>
              Opslaan
            </Knop>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Blok (nieuw / bewerken)
// ---------------------------------------------------------------------------

const TEELTSYSTEMEN = ['Spil', 'Slanke spil', 'V-systeem', 'Fruitwand', 'Meerassige boom', 'Haag'];

export function BlokDialoog({ blokId, rijIds, onSluit }: { blokId: string | null; rijIds: string[]; onSluit: () => void }) {
  const ctx = useRijenkaartCtx();
  const blok = blokId ? ctx.kaart.blokken.find(b => b.id === blokId) ?? null : null;
  const rijen = useRijen(rijIds);
  const subpercelen = ctx.kaart.perceel.subpercelen;
  const suggesties = useMemo(() => rasSuggesties(ctx.kaart), [ctx.kaart]);
  const lijstId = useId();
  const systeemLijstId = useId();

  // Ras voorstellen: het gemeenschappelijke ras van de selectie (ook van het subperceel)
  const rasInfo = ctx.rasInfo;
  const selectieRas = useMemo(() => {
    const rassen = new Set(rijen.map(r => rasInfo(r).ras).filter((r): r is string => !!r));
    return rassen.size === 1 ? [...rassen][0] : '';
  }, [rijen, rasInfo]);

  const [naam, setNaam] = useState(blok?.naam ?? '');
  const [ras, setRas] = useState(blok?.ras ?? selectieRas);
  const [plantjaar, setPlantjaar] = useState<number | null>(blok?.plantjaar ?? null);
  const [onderstam, setOnderstam] = useState(blok?.onderstam ?? '');
  const [rijafstand, setRijafstand] = useState<number | null>(blok?.rijafstandM ?? null);
  const [boomafstand, setBoomafstand] = useState<number | null>(blok?.boomafstandM ?? null);
  const [teeltsysteem, setTeeltsysteem] = useState(blok?.teeltsysteem ?? '');
  const [opmerking, setOpmerking] = useState(blok?.opmerking ?? '');
  const [subId, setSubId] = useState<string>(blok?.subParcelId ?? '');
  const [subHandmatig, setSubHandmatig] = useState(!!blok);
  const [bezig, setBezig] = useState(false);

  // Subperceel voorselecteren op ras (zolang de gebruiker niet zelf koos)
  useEffect(() => {
    if (subHandmatig) return;
    const r = ras.trim().toLowerCase();
    const match = r ? subpercelen.filter(s => (s.ras ?? '').trim().toLowerCase() === r) : [];
    if (match.length === 1) setSubId(match[0].id);
    else if (subpercelen.length === 1) setSubId(subpercelen[0].id);
    else setSubId('');
  }, [ras, subHandmatig, subpercelen]);

  const verhuizen = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rijen) {
      if (r.blokId && r.blokId !== blokId) m.set(r.blokNaam || 'naamloos blok', (m.get(r.blokNaam || 'naamloos blok') ?? 0) + 1);
    }
    return [...m.entries()];
  }, [rijen, blokId]);

  const standaardNaam = `${ras.trim()} ${plantjaar ?? ''}`.trim();
  const plantjaarFout =
    plantjaar !== null && (!Number.isInteger(plantjaar) || plantjaar < 1900 || plantjaar > 2100)
      ? 'Vul een jaartal in, bijv. 2015.'
      : null;

  const slaOp = async () => {
    if (plantjaarFout) return;
    setBezig(true);
    try {
      const opgeslagen = await slaBlokOpAction(
        ctx.perceelId,
        {
          ...(blokId ? { id: blokId } : {}),
          naam: naam.trim() || standaardNaam || null,
          ras: ras.trim() || null,
          plantjaar,
          onderstam: onderstam.trim() || null,
          rijafstandM: rijafstand,
          boomafstandM: boomafstand,
          teeltsysteem: teeltsysteem.trim() || null,
          subParcelId: subId || null,
          opmerking: opmerking.trim() || null,
        },
        rijIds.length > 0 ? rijIds : undefined,
      );
      ctx.meld(blokId ? 'Blok opgeslagen' : 'Blok aangemaakt', `${opgeslagen.naam ?? 'Blok'}${rijen.length > 0 ? ` · ${rijenOmschrijving(rijen)}` : ''}`);
      onSluit();
      await ctx.verversen();
    } catch (e) {
      ctx.meldFout(e, 'Blok opslaan mislukt');
    } finally {
      setBezig(false);
    }
  };

  return (
    <Dialog open onOpenChange={o => !o && onSluit()}>
      <DialogContent className={DIALOOG_STIJL}>
        <DialogHeader>
          <DialogTitle>{blok ? 'Blok bewerken' : 'Nieuw blok'}</DialogTitle>
          <DialogDescription>
            {rijen.length > 0 ? `Met ${rijenOmschrijving(rijen)}.` : blok ? 'Gegevens van dit blok.' : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {verhuizen.length > 0 && (
            <Melding soort="waarschuwing">
              {verhuizen.map(([n, a]) => `${a} ${a === 1 ? 'rij verhuist' : 'rijen verhuizen'} uit ${n}`).join('; ')}.
            </Melding>
          )}
          <Veld label="Naam">
            <input value={naam} onChange={e => setNaam(e.target.value)} placeholder={standaardNaam || 'bijv. Conference 2015'} className={tekstVeldStijl} />
          </Veld>
          <div className="grid grid-cols-2 gap-3">
            <Veld label="Ras">
              <input value={ras} onChange={e => setRas(e.target.value)} list={lijstId} placeholder="bijv. Conference" className={tekstVeldStijl} />
              <datalist id={lijstId}>
                {suggesties.map(s => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Veld>
            <Veld label="Plantjaar" fout={plantjaarFout ?? undefined}>
              <GetalVeld label="Plantjaar" waarde={plantjaar} onChange={setPlantjaar} decimalen={0} invoerModus="numeric" placeholder="2015" />
            </Veld>
          </div>
          <Veld label="Subperceel" hint="Bespuitingen op rijen van dit blok komen bij dit subperceel in het spuitschrift.">
            <select
              value={subId}
              onChange={e => {
                setSubHandmatig(true);
                setSubId(e.target.value);
              }}
              className={tekstVeldStijl}
            >
              <option value="">Automatisch (op ras)</option>
              {subpercelen.map(s => (
                <option key={s.id} value={s.id}>
                  {[s.naam, s.ras].filter(Boolean).join(' · ') || 'Subperceel'} · {fmt(s.oppervlakHa, 2)} ha
                </option>
              ))}
            </select>
          </Veld>
          <div className="grid grid-cols-2 gap-3">
            <Veld label="Rijafstand">
              <GetalVeld label="Rijafstand van het blok in meter" waarde={rijafstand} onChange={setRijafstand} achtervoegsel="m" min={0.5} max={20} placeholder={ctx.kaart.instellingen?.rijafstandM ? fmt(ctx.kaart.instellingen.rijafstandM, 2) : undefined} />
            </Veld>
            <Veld label="Boomafstand">
              <GetalVeld label="Boomafstand van het blok in meter" waarde={boomafstand} onChange={setBoomafstand} achtervoegsel="m" min={0.1} max={20} placeholder={ctx.standaardBoomafstandM ? fmt(ctx.standaardBoomafstandM, 2) : undefined} />
            </Veld>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Veld label="Onderstam">
              <input value={onderstam} onChange={e => setOnderstam(e.target.value)} placeholder="bijv. Kwee MC" className={tekstVeldStijl} />
            </Veld>
            <Veld label="Teeltsysteem">
              <input value={teeltsysteem} onChange={e => setTeeltsysteem(e.target.value)} list={systeemLijstId} placeholder="bijv. Spil" className={tekstVeldStijl} />
              <datalist id={systeemLijstId}>
                {TEELTSYSTEMEN.map(s => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Veld>
          </div>
          <Veld label="Opmerking">
            <input value={opmerking} onChange={e => setOpmerking(e.target.value)} className={tekstVeldStijl} />
          </Veld>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Knop onClick={onSluit}>Annuleren</Knop>
            <Knop soort="primair" bezig={bezig} disabled={!!plantjaarFout} onClick={() => void slaOp()}>
              Opslaan
            </Knop>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Blok toekennen
// ---------------------------------------------------------------------------

export function BlokToekennenDialoog({ rijIds, onSluit }: { rijIds: string[]; onSluit: () => void }) {
  const ctx = useRijenkaartCtx();
  const rijen = useRijen(rijIds);
  const [bezig, setBezig] = useState<string | null>(null);
  const inBlok = rijen.filter(r => r.blokId).length;

  const kenToe = async (blokId: string) => {
    setBezig(blokId);
    try {
      const b = await slaBlokOpAction(ctx.perceelId, { id: blokId }, rijen.map(r => r.id));
      ctx.meld(`Toegevoegd aan ${b.naam ?? 'blok'}`, rijenOmschrijving(rijen));
      onSluit();
      await ctx.verversen();
    } catch (e) {
      ctx.meldFout(e, 'Blok toekennen mislukt');
    } finally {
      setBezig(null);
    }
  };

  const haalUitBlok = async () => {
    setBezig('uit');
    try {
      const n = await zetRijAttributenAction(ctx.perceelId, rijen.map(r => r.id), { blokId: null });
      ctx.meld('Uit blok gehaald', `${n} rijen`);
      onSluit();
      await ctx.verversen();
    } catch (e) {
      ctx.meldFout(e, 'Uit blok halen mislukt');
    } finally {
      setBezig(null);
    }
  };

  return (
    <Dialog open onOpenChange={o => !o && onSluit()}>
      <DialogContent className={DIALOOG_STIJL}>
        <DialogHeader>
          <DialogTitle>Blok toekennen</DialogTitle>
          <DialogDescription>{rijenOmschrijving(rijen)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {ctx.kaart.blokken.map(b => (
            <Knop
              key={b.id}
              vol
              className="justify-start text-left"
              icoon={<span className="h-3 w-3 rounded-full" style={{ background: ctx.kleurVoorRas(b.ras) }} aria-hidden="true" />}
              bezig={bezig === b.id}
              disabled={bezig !== null}
              onClick={() => void kenToe(b.id)}
            >
              <span className="truncate">{b.naam || 'Naamloos blok'}</span>
              {b.ras && <span className="truncate font-normal text-white/50">· {b.ras}</span>}
            </Knop>
          ))}
          <Knop
            vol
            soort="accent"
            icoon={<Plus className="h-4 w-4" />}
            disabled={bezig !== null}
            onClick={() => {
              onSluit();
              ctx.openDialoog({ soort: 'blok', blokId: null, rijIds: rijen.map(r => r.id) });
            }}
          >
            Nieuw blok…
          </Knop>
          {inBlok > 0 && (
            <Knop vol soort="stil" icoon={<Layers className="h-4 w-4" />} bezig={bezig === 'uit'} disabled={bezig !== null} onClick={() => void haalUitBlok()}>
              Uit blok halen ({inBlok})
            </Knop>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Bestuiver
// ---------------------------------------------------------------------------

export function BestuiverDialoog({ rijIds, onSluit }: { rijIds: string[]; onSluit: () => void }) {
  const ctx = useRijenkaartCtx();
  const rijen = useRijen(rijIds);
  const suggesties = useMemo(() => rasSuggesties(ctx.kaart), [ctx.kaart]);
  const lijstId = useId();
  const bestuivers = rijen.filter(r => r.rol === 'bestuiver');
  const alleBestuiver = rijen.length > 0 && bestuivers.length === rijen.length;
  const [ras, setRas] = useState(() => {
    const rassen = new Set(bestuivers.map(r => r.ras).filter(Boolean));
    return rassen.size === 1 ? ([...rassen][0] as string) : '';
  });
  const [bezig, setBezig] = useState<'aan' | 'uit' | null>(null);

  const zet = async (aan: boolean) => {
    setBezig(aan ? 'aan' : 'uit');
    try {
      const n = await zetRijAttributenAction(
        ctx.perceelId,
        rijen.map(r => r.id),
        aan ? { rol: 'bestuiver', ras: ras.trim() || null } : { rol: 'hoofd', ras: null },
      );
      ctx.meld(aan ? 'Bestuiver ingesteld' : 'Terug naar hoofdrij', `${n} ${n === 1 ? 'rij' : 'rijen'}`);
      onSluit();
      await ctx.verversen();
    } catch (e) {
      ctx.meldFout(e, 'Opslaan mislukt');
    } finally {
      setBezig(null);
    }
  };

  return (
    <Dialog open onOpenChange={o => !o && onSluit()}>
      <DialogContent className={DIALOOG_STIJL}>
        <DialogHeader>
          <DialogTitle>Bestuiverrijen</DialogTitle>
          <DialogDescription>{rijenOmschrijving(rijen)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Veld label="Ras van de bestuiver" hint="Bijv. Doyenné du Comice of Gieser Wildeman. Leeg = ras van het blok.">
            <input value={ras} onChange={e => setRas(e.target.value)} list={lijstId} placeholder="Doyenné du Comice" className={tekstVeldStijl} />
            <datalist id={lijstId}>
              {suggesties.map(s => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Veld>
          <Knop vol soort="primair" bezig={bezig === 'aan'} disabled={bezig !== null || rijen.length === 0} onClick={() => void zet(true)}>
            {alleBestuiver ? 'Ras bijwerken' : 'Maak bestuiver'}
          </Knop>
          {bestuivers.length > 0 && (
            <Knop vol soort="secundair" bezig={bezig === 'uit'} disabled={bezig !== null} onClick={() => void zet(false)}>
              Terugzetten naar hoofdrij ({bestuivers.length})
            </Knop>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Rooien
// ---------------------------------------------------------------------------

export function RooienDialoog({ rijIds, onSluit }: { rijIds: string[]; onSluit: () => void }) {
  const ctx = useRijenkaartCtx();
  const rijen = useRijen(rijIds);
  const actief = rijen.filter(r => r.status === 'actief');
  const gerooid = rijen.filter(r => r.status === 'gerooid');
  // Nummers zijn uniek onder actieve rijen. Een gerooide rij waarvan het nummer intussen door een
  // actieve rij (of een andere herstelde rij) bezet is, komt terug met het eerstvolgende vrije nummer.
  const nieuweNummers = useMemo(() => {
    const bezet = new Set(ctx.actieveRijen.map(r => r.nummer));
    const conflict: Rij[] = [];
    for (const r of gerooid) {
      if (bezet.has(r.nummer)) conflict.push(r);
      else bezet.add(r.nummer);
    }
    let volgende = Math.max(0, ...bezet) + 1;
    const uit = new Map<string, { oud: number; nieuw: number }>();
    for (const r of conflict) {
      while (bezet.has(volgende)) volgende++;
      uit.set(r.id, { oud: r.nummer, nieuw: volgende });
      bezet.add(volgende);
    }
    return uit;
  }, [ctx.actieveRijen, gerooid]);
  const [datum, setDatum] = useState(vandaagISO());
  const [bezig, setBezig] = useState<'rooien' | 'herstel' | null>(null);
  const datumId = useId();

  const rooi = async () => {
    setBezig('rooien');
    try {
      // Leeg datumveld → de server zet vandaag (gerooidOp weglaten, niet null sturen)
      const n = await zetRijAttributenAction(
        ctx.perceelId,
        actief.map(r => r.id),
        datum ? { status: 'gerooid', gerooidOp: datum } : { status: 'gerooid' },
      );
      ctx.meld('Gerooid', `${n} ${n === 1 ? 'rij' : 'rijen'} — blijven bewaard met hun historie`);
      ctx.wisSelectie();
      ctx.zetDetailRijId(null);
      onSluit();
      await ctx.verversen();
    } catch (e) {
      ctx.meldFout(e, 'Rooien mislukt');
    } finally {
      setBezig(null);
    }
  };

  const herstel = async () => {
    setBezig('herstel');
    try {
      // Eerst de bezette nummers vrijmaken (gerooide rijen tellen niet mee voor de uniekheid)
      if (nieuweNummers.size > 0) {
        await rijenToepassenAction(ctx.perceelId, {
          rijen: [...nieuweNummers].map(([id, n]) => ({ id, nummer: n.nieuw })),
        });
      }
      const n = await zetRijAttributenAction(ctx.perceelId, gerooid.map(r => r.id), { status: 'actief' });
      ctx.meld(
        'Weer actief',
        `${n} ${n === 1 ? 'rij' : 'rijen'}${
          nieuweNummers.size > 0
            ? ` · nieuw nummer: ${[...nieuweNummers.values()].map(x => `${x.oud} → ${x.nieuw}`).join(', ')}`
            : ''
        }`,
      );
      onSluit();
      await ctx.verversen();
    } catch (e) {
      ctx.meldFout(e, 'Herstellen mislukt');
      void ctx.verversen();
    } finally {
      setBezig(null);
    }
  };

  return (
    <Dialog open onOpenChange={o => !o && onSluit()}>
      <DialogContent className={DIALOOG_STIJL}>
        <DialogHeader>
          <DialogTitle>Rooien</DialogTitle>
          <DialogDescription>
            Gerooide rijen blijven bewaard (met bespuitingen en notities), maar tellen niet meer mee voor nummers en oppervlak.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {actief.length > 0 && (
            <>
              <p className="text-[13px] text-white/70">{rijenOmschrijving(actief)}</p>
              <Veld label="Gerooid op" htmlFor={datumId}>
                <input id={datumId} type="date" value={datum} max={vandaagISO()} onChange={e => setDatum(e.target.value)} className={tekstVeldStijl} />
              </Veld>
              <Knop vol soort="gevaar" bezig={bezig === 'rooien'} disabled={bezig !== null} onClick={() => void rooi()}>
                {actief.length === 1 ? 'Rij rooien' : `${actief.length} rijen rooien`}
              </Knop>
            </>
          )}
          {gerooid.length > 0 && nieuweNummers.size > 0 && (
            <Melding soort="info">
              {[...nieuweNummers.values()].map(x => `Rij ${x.oud} krijgt nummer ${x.nieuw}`).join('; ')}: het oude nummer is
              intussen van een actieve rij.
            </Melding>
          )}
          {gerooid.length > 0 && (
            <Knop vol bezig={bezig === 'herstel'} disabled={bezig !== null} onClick={() => void herstel()}>
              {gerooid.length === 1 ? 'Gerooide rij weer actief maken' : `${gerooid.length} gerooide rijen weer actief maken`}
            </Knop>
          )}
          <Knop vol soort="stil" onClick={onSluit}>
            Annuleren
          </Knop>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Verwijderen
// ---------------------------------------------------------------------------

export function VerwijderDialoog({ rijIds, onSluit }: { rijIds: string[]; onSluit: () => void }) {
  const ctx = useRijenkaartCtx();
  const rijen = useRijen(rijIds);
  const [bezig, setBezig] = useState(false);
  const metKoppeling = rijen.filter(r => ctx.gekoppeld.has(r.id) && r.status === 'actief').length;

  const verwijder = async () => {
    setBezig(true);
    try {
      const r = await rijenToepassenAction(ctx.perceelId, { verwijderen: rijen.map(x => x.id) });
      const delen = [
        r.verwijderd > 0 ? `${r.verwijderd} verwijderd` : null,
        r.gerooid > 0 ? `${r.gerooid} met registraties bewaard als gerooid` : null,
      ].filter(Boolean);
      ctx.meld('Rijen verwijderd', delen.join(' · ') || 'Geen wijzigingen');
      ctx.wisSelectie();
      ctx.zetDetailRijId(null);
      ctx.zetBewerkRijId(null);
      onSluit();
      await ctx.verversen();
    } catch (e) {
      ctx.meldFout(e, 'Verwijderen mislukt');
    } finally {
      setBezig(false);
    }
  };

  return (
    <AlertDialog open onOpenChange={o => !o && !bezig && onSluit()}>
      <AlertDialogContent className={ALERT_STIJL}>
        <AlertDialogHeader>
          <AlertDialogTitle>{rijen.length === 1 ? 'Rij verwijderen?' : `${rijen.length} rijen verwijderen?`}</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span className="block">{rijenOmschrijving(rijen)}.</span>
            <span className="block">
              {metKoppeling > 0
                ? `${metKoppeling} ${metKoppeling === 1 ? 'rij heeft' : 'rijen hebben'} een bespuiting of notitie en ${metKoppeling === 1 ? 'blijft' : 'blijven'} als gerooid bewaard; de rest wordt definitief verwijderd.`
                : 'Deze rijen hebben geen registraties en worden definitief verwijderd.'}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-[44px]" disabled={bezig}>
            Annuleren
          </AlertDialogCancel>
          <AlertDialogAction
            className="min-h-[44px] bg-red-600 text-white hover:bg-red-500"
            disabled={bezig}
            onClick={e => {
              e.preventDefault();
              void verwijder();
            }}
          >
            {bezig ? 'Bezig…' : 'Verwijderen'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function BlokVerwijderDialoog({ blokId, onSluit }: { blokId: string; onSluit: () => void }) {
  const ctx = useRijenkaartCtx();
  const blok = ctx.kaart.blokken.find(b => b.id === blokId);
  const aantal = ctx.rijen.filter(r => r.blokId === blokId).length;
  const [bezig, setBezig] = useState(false);

  const verwijder = async () => {
    setBezig(true);
    try {
      await verwijderBlokAction(ctx.perceelId, blokId);
      ctx.meld('Blok verwijderd', aantal > 0 ? `${aantal} rijen blijven bestaan, zonder blok` : undefined);
      onSluit();
      await ctx.verversen();
    } catch (e) {
      ctx.meldFout(e, 'Blok verwijderen mislukt');
    } finally {
      setBezig(false);
    }
  };

  return (
    <AlertDialog open onOpenChange={o => !o && !bezig && onSluit()}>
      <AlertDialogContent className={ALERT_STIJL}>
        <AlertDialogHeader>
          <AlertDialogTitle>Blok {blok?.naam ? `"${blok.naam}" ` : ''}verwijderen?</AlertDialogTitle>
          <AlertDialogDescription>
            {aantal > 0
              ? `De ${aantal} rijen van dit blok blijven bestaan, maar verliezen het ras, plantjaar en de afstanden van het blok.`
              : 'Er zitten geen rijen in dit blok.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-[44px]" disabled={bezig}>
            Annuleren
          </AlertDialogCancel>
          <AlertDialogAction
            className="min-h-[44px] bg-red-600 text-white hover:bg-red-500"
            disabled={bezig}
            onClick={e => {
              e.preventDefault();
              void verwijder();
            }}
          >
            {bezig ? 'Bezig…' : 'Verwijderen'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
