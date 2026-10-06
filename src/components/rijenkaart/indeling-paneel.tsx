'use client';

/**
 * Rijenkaart (beta) — paneel "Indeling": nummering (rij 1 aanwijzen), beginkant, blokken,
 * bestuiverrijen en de standaard rij-/boomafstand van het perceel.
 */

import { useEffect, useMemo, useState } from 'react';
import { Flower2, ListOrdered, Pencil, Plus, Trash2 } from 'lucide-react';
import { formatteerBereiken } from '@/lib/rijen/selectie';
import { windstreek } from '@/lib/rijen/geo';
import type { Blok } from '@/lib/rijen/types';
import { rijenToepassenAction, zetBeginkantAction, zetNummeringStartAction } from '@/app/rijen-actions';
import { useRijenkaartCtx } from './rijenkaart-context';
import { fmt, gewogenAfstand, kantNaam, nummeringVoorstel, rond } from './rijen-hulp';
import { GetalVeld, Knop, Melding, Sectie, Veld } from './ui';

export function IndelingPaneel() {
  return (
    <div className="space-y-7">
      <NummeringSectie />
      <BeginkantSectie />
      <BlokkenSectie />
      <BestuiverSectie />
      <AfstandenSectie />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nummering
// ---------------------------------------------------------------------------

/**
 * Nummering vanaf de aangewezen rij (ctx.rij1Kandidaat): voorstel + bevestigen. Gedeeld door het
 * Indeling-paneel en de balk onderaan de kaart (duimbereik direct na het aanwijzen).
 */
export function useNummering() {
  const ctx = useRijenkaartCtx();
  const { actieveRijen, perceelRD, richting, rij1Kandidaat, startnummerInvoer } = ctx;
  const [bezig, setBezig] = useState(false);

  const voorstel = useMemo(() => {
    if (!rij1Kandidaat || !perceelRD || richting === null) return null;
    try {
      return nummeringVoorstel(actieveRijen, perceelRD, richting, rij1Kandidaat, startnummerInvoer);
    } catch {
      return null;
    }
  }, [rij1Kandidaat, startnummerInvoer, actieveRijen, perceelRD, richting]);

  const bevestig = async () => {
    if (!voorstel) return;
    setBezig(true);
    try {
      const gewijzigd = actieveRijen
        .filter(r => voorstel.nummers.has(r.id) && voorstel.nummers.get(r.id) !== r.nummer)
        .map(r => ({ id: r.id, nummer: voorstel.nummers.get(r.id) as number }));
      await rijenToepassenAction(ctx.perceelId, {
        rijen: gewijzigd,
        instellingen: {
          nummeringStartzijdeGraden: rond(voorstel.startzijdeGraden, 4),
          startnummer: voorstel.startnummer,
        },
      });
      await zetNummeringStartAction(ctx.perceelId, voorstel.startRijId);
      ctx.meld('Nummering opgeslagen', `${gewijzigd.length} rijen hernummerd`);
      ctx.zetRij1Kandidaat(null);
      ctx.wisSelectie();
      await ctx.verversen();
    } catch (e) {
      ctx.meldFout(e, 'Hernummeren mislukt');
    } finally {
      setBezig(false);
    }
  };

  const annuleer = () => {
    ctx.zetRij1Kandidaat(null);
    if (ctx.kaartDoel?.soort === 'rij1') ctx.zetKaartDoel(null);
    ctx.wisSelectie();
  };

  return { voorstel, bezig, bevestig, annuleer };
}

/** Korte omschrijving van het nummeringsvoorstel. */
export function nummeringTekst(v: NonNullable<ReturnType<typeof useNummering>['voorstel']>): string {
  return `Rij ${v.oudNummer} wordt ${v.startnummer}; nummers lopen op richting ${windstreek(v.oplopendRichtingGraden)}.`;
}

function NummeringSectie() {
  const ctx = useRijenkaartCtx();
  const { actieveRijen, richting, kaart } = ctx;
  const instellingen = kaart.instellingen;
  const aanwijzen = ctx.kaartDoel?.soort === 'rij1';
  const { voorstel, bezig, bevestig, annuleer } = useNummering();

  const min = actieveRijen.reduce((m, r) => Math.min(m, r.nummer), Infinity);
  const max = actieveRijen.reduce((m, r) => Math.max(m, r.nummer), -Infinity);

  return (
    <Sectie
      titel="Nummering"
      uitleg={
        actieveRijen.length > 0
          ? `Nu rij ${min}–${max}${
              instellingen?.nummeringStartzijdeGraden != null
                ? `; rij ${instellingen.startnummer} ligt aan de ${kantNaam(instellingen.nummeringStartzijdeGraden)}`
                : ''
            }.`
          : 'Nog geen rijen om te nummeren.'
      }
    >
      <div className="flex items-end gap-2">
        <Veld label="Startnummer" className="w-28 shrink-0">
          <GetalVeld
            label="Startnummer"
            waarde={ctx.startnummerInvoer}
            onChange={n => {
              if (n !== null && Number.isInteger(n)) ctx.zetStartnummerInvoer(n);
            }}
            decimalen={0}
            invoerModus="numeric"
          />
        </Veld>
        <Knop
          className="flex-1"
          soort={aanwijzen ? 'accent' : 'secundair'}
          icoon={<ListOrdered className="h-4 w-4" />}
          disabled={actieveRijen.length === 0 || richting === null}
          onClick={() => {
            ctx.zetRij1Kandidaat(null);
            ctx.zetKaartDoel(aanwijzen ? null : { soort: 'rij1' });
          }}
        >
          {aanwijzen ? 'Tik op de kaart…' : `Rij ${ctx.startnummerInvoer} aanwijzen`}
        </Knop>
      </div>

      {voorstel && (
        <div className="space-y-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.05] p-3">
          <p className="text-sm text-white/90">{nummeringTekst(voorstel)}</p>
          <p className="text-[12px] text-white/50">
            {voorstel.aantalGewijzigd} {voorstel.aantalGewijzigd === 1 ? 'rij krijgt' : 'rijen krijgen'} een ander nummer.
            Registraties en notities blijven aan dezelfde rij gekoppeld.
          </p>
          {voorstel.aantalOnderEen > 0 && (
            <Melding soort="waarschuwing">
              {voorstel.aantalOnderEen} {voorstel.aantalOnderEen === 1 ? 'rij krijgt' : 'rijen krijgen'} een nummer onder 1. Wijs
              liever een buitenste rij aan.
            </Melding>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Knop onClick={annuleer}>Annuleren</Knop>
            <Knop soort="primair" bezig={bezig} onClick={() => void bevestig()}>
              Bevestigen
            </Knop>
          </div>
        </div>
      )}
    </Sectie>
  );
}

// ---------------------------------------------------------------------------
// Beginkant
// ---------------------------------------------------------------------------

function BeginkantSectie() {
  const ctx = useRijenkaartCtx();
  const [bezig, setBezig] = useState<number | null>(null);
  const theta = ctx.richting;
  const huidig = ctx.kaart.instellingen?.beginkantGraden ?? null;
  if (theta === null || ctx.actieveRijen.length === 0) return null;

  const opties = [theta, theta + 180].map(g => ((g % 360) + 360) % 360);

  const zet = async (g: number) => {
    setBezig(g);
    try {
      const n = await zetBeginkantAction(ctx.perceelId, rond(g, 4));
      ctx.meld(`Begin aan de ${kantNaam(g)}`, n > 0 ? `${n} rijen omgedraaid` : 'Alle rijen begonnen al aan deze kant');
      await ctx.verversen();
    } catch (e) {
      ctx.meldFout(e, 'Beginkant opslaan mislukt');
    } finally {
      setBezig(null);
    }
  };

  return (
    <Sectie
      titel="Beginkant"
      uitleg="Het begin van elke rij (meter 0) ligt aan deze kant. Dit bepaalt de looprichting van de rijen en de meters en boomnummers van notities; bestaande notities blijven dezelfde boom aanwijzen."
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
        {opties.map(g => {
          const actief = huidig !== null && Math.cos(((huidig - g) * Math.PI) / 180) > 0;
          return (
            <Knop
              key={g}
              soort={actief ? 'accent' : 'secundair'}
              aria-pressed={actief}
              bezig={bezig === g}
              disabled={bezig !== null}
              onClick={() => void zet(g)}
            >
              Begin aan de {kantNaam(g)}
            </Knop>
          );
        })}
      </div>
    </Sectie>
  );
}

// ---------------------------------------------------------------------------
// Blokken
// ---------------------------------------------------------------------------

function BlokkenSectie() {
  const ctx = useRijenkaartCtx();
  const { kaart, actieveRijen, geselecteerd } = ctx;

  const perBlok = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const r of actieveRijen) {
      if (!r.blokId) continue;
      const l = m.get(r.blokId) ?? [];
      l.push(r.nummer);
      m.set(r.blokId, l);
    }
    return m;
  }, [actieveRijen]);

  const selectieAantal = actieveRijen.filter(r => geselecteerd.has(r.id)).length;

  return (
    <Sectie
      titel="Blokken"
      uitleg="Een blok is een groep rijen met hetzelfde ras en plantjaar. Koppel het aan een subperceel, dan komen bespuitingen op rijen goed in het spuitschrift."
    >
      {kaart.blokken.length === 0 ? (
        <p className="text-[13px] text-white/45">Nog geen blokken.</p>
      ) : (
        <ul className="space-y-2">
          {kaart.blokken.map(b => (
            <BlokRegel key={b.id} blok={b} nummers={perBlok.get(b.id) ?? []} />
          ))}
        </ul>
      )}
      <Knop
        vol
        soort={selectieAantal > 0 ? 'accent' : 'secundair'}
        icoon={<Plus className="h-4 w-4" />}
        disabled={selectieAantal === 0}
        onClick={() =>
          ctx.openDialoog({ soort: 'blok', blokId: null, rijIds: actieveRijen.filter(r => geselecteerd.has(r.id)).map(r => r.id) })
        }
      >
        {selectieAantal > 0 ? `Nieuw blok van selectie (${selectieAantal} rijen)` : 'Nieuw blok van selectie'}
      </Knop>
      {selectieAantal === 0 && (
        <p className="text-[12px] text-white/40">Selecteer eerst rijen (tab Rijen of tik-selectie).</p>
      )}
    </Sectie>
  );
}

function BlokRegel({ blok, nummers }: { blok: Blok; nummers: number[] }) {
  const ctx = useRijenkaartCtx();
  const kleur = ctx.kleurVoorRas(blok.ras);
  const sub = blok.subParcelId ? ctx.kaart.perceel.subpercelen.find(s => s.id === blok.subParcelId) : null;
  return (
    <li className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="flex items-start gap-3">
        <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full" style={{ background: kleur }} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{blok.naam || 'Naamloos blok'}</p>
          <p className="text-[12px] text-white/50">
            {[blok.ras, blok.plantjaar, blok.onderstam].filter(Boolean).join(' · ') || 'Geen ras'}
          </p>
          <p className="text-[12px] text-white/50">
            {nummers.length > 0 ? `Rij ${formatteerBereiken(nummers)} · ${nummers.length} rijen` : 'Geen rijen'}
            {sub ? ` · subperceel ${sub.naam || sub.ras || ''}`.trimEnd() : ''}
          </p>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Knop
          klein
          disabled={nummers.length === 0}
          onClick={() => ctx.zetSelectie(ctx.actieveRijen.filter(r => r.blokId === blok.id).map(r => r.id))}
        >
          Selecteer
        </Knop>
        <Knop
          klein
          icoon={<Pencil className="h-3.5 w-3.5" />}
          onClick={() => ctx.openDialoog({ soort: 'blok', blokId: blok.id, rijIds: [] })}
        >
          Bewerken
        </Knop>
        <Knop
          klein
          soort="gevaar"
          icoon={<Trash2 className="h-3.5 w-3.5" />}
          onClick={() => ctx.openDialoog({ soort: 'blok-verwijderen', blokId: blok.id })}
        >
          Verwijder
        </Knop>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Bestuivers
// ---------------------------------------------------------------------------

function BestuiverSectie() {
  const ctx = useRijenkaartCtx();
  const { actieveRijen, geselecteerd } = ctx;
  const groepen = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const r of actieveRijen) {
      if (r.rol !== 'bestuiver') continue;
      const k = r.rasEffectief ?? 'Ras onbekend';
      const l = m.get(k) ?? [];
      l.push(r.nummer);
      m.set(k, l);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [actieveRijen]);
  const selectie = actieveRijen.filter(r => geselecteerd.has(r.id)).map(r => r.id);

  return (
    <Sectie titel="Bestuiverrijen" uitleg="Bestuivers staan gestippeld op de kaart en tellen apart in de legenda.">
      {groepen.length > 0 ? (
        <ul className="space-y-1 text-[13px] text-white/75">
          {groepen.map(([ras, nummers]) => (
            <li key={ras}>
              <span className="font-medium text-white">{ras}</span>: rij {formatteerBereiken(nummers)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-white/45">Nog geen bestuiverrijen.</p>
      )}
      <Knop
        vol
        icoon={<Flower2 className="h-4 w-4" />}
        disabled={selectie.length === 0}
        onClick={() => ctx.openDialoog({ soort: 'bestuiver', rijIds: selectie })}
      >
        {selectie.length > 0 ? `Bestuiver instellen (${selectie.length} rijen)` : 'Bestuiver instellen voor selectie'}
      </Knop>
    </Sectie>
  );
}

// ---------------------------------------------------------------------------
// Standaardafstanden
// ---------------------------------------------------------------------------

function AfstandenSectie() {
  const ctx = useRijenkaartCtx();
  const instellingen = ctx.kaart.instellingen;
  const profielRij = useMemo(() => gewogenAfstand(ctx.kaart.perceel.subpercelen, 'rij'), [ctx.kaart.perceel.subpercelen]);
  const profielBoom = useMemo(() => gewogenAfstand(ctx.kaart.perceel.subpercelen, 'boom'), [ctx.kaart.perceel.subpercelen]);
  const [rij, setRij] = useState<number | null>(instellingen?.rijafstandM ?? null);
  const [boom, setBoom] = useState<number | null>(instellingen?.boomafstandM ?? null);
  const [bezig, setBezig] = useState(false);

  // Na opslaan/genereren elders de nieuwe waarden overnemen
  useEffect(() => setRij(instellingen?.rijafstandM ?? null), [instellingen?.rijafstandM]);
  useEffect(() => setBoom(instellingen?.boomafstandM ?? null), [instellingen?.boomafstandM]);

  const gewijzigd = rij !== (instellingen?.rijafstandM ?? null) || boom !== (instellingen?.boomafstandM ?? null);

  const slaOp = async () => {
    setBezig(true);
    try {
      await rijenToepassenAction(ctx.perceelId, { instellingen: { rijafstandM: rij, boomafstandM: boom } });
      ctx.meld('Afstanden opgeslagen');
      await ctx.verversen();
    } catch (e) {
      ctx.meldFout(e, 'Opslaan mislukt');
    } finally {
      setBezig(false);
    }
  };

  return (
    <Sectie
      titel="Standaardafstanden"
      uitleg="Gelden voor rijen zonder blok (of een blok zonder eigen afstanden): rij-oppervlak, aantal bomen en boomnummers."
    >
      <div className="grid grid-cols-2 gap-3">
        <Veld
          label="Rijafstand"
          hint={
            profielRij !== null && rij === null ? (
              <button type="button" className="inline-flex min-h-[44px] items-center text-left text-emerald-300 hover:underline" onClick={() => setRij(profielRij)}>
                {fmt(profielRij, 2)} m uit profiel
              </button>
            ) : undefined
          }
        >
          <GetalVeld label="Standaard rijafstand in meter" waarde={rij} onChange={setRij} achtervoegsel="m" min={0.5} max={20} />
        </Veld>
        <Veld
          label="Boomafstand"
          hint={
            profielBoom !== null && boom === null ? (
              <button type="button" className="inline-flex min-h-[44px] items-center text-left text-emerald-300 hover:underline" onClick={() => setBoom(profielBoom)}>
                {fmt(profielBoom, 2)} m uit profiel
              </button>
            ) : undefined
          }
        >
          <GetalVeld label="Standaard boomafstand in meter" waarde={boom} onChange={setBoom} achtervoegsel="m" min={0.1} max={20} />
        </Veld>
      </div>
      <Knop vol soort={gewijzigd ? 'primair' : 'secundair'} disabled={!gewijzigd} bezig={bezig} onClick={() => void slaOp()}>
        Afstanden opslaan
      </Knop>
    </Sectie>
  );
}
