'use client';

/**
 * Rijenkaart (beta) — paneel "Genereren": rijen detecteren uit de PDOK-luchtfoto of een
 * referentierij tekenen, het voorstel live corrigeren en opslaan met ID-mapping.
 */

import { useEffect, useRef, useState } from 'react';
import { PenLine, RotateCcw, RotateCw, ScanSearch, Undo2, Wand2 } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import { windstreek } from '@/lib/rijen/geo';
import { cn } from '@/lib/utils';
import { useRijenkaartCtx } from './rijenkaart-context';
import { fmt, fmtHa, fmtLengte, kantNaam, pijl, richtingTekst, verschuifKnoppen } from './rijen-hulp';
import { Chip, GetalVeld, Knop, Melding, Sectie, Segment, Stapper, Veld } from './ui';

export function GenererenPaneel() {
  const ctx = useRijenkaartCtx();
  const { concept, actieveRijen, kaart } = ctx;
  const [bevestigOpen, setBevestigOpen] = useState(false);
  const gemount = useRef(true);
  useEffect(() => {
    gemount.current = true;
    return () => {
      gemount.current = false;
    };
  }, []);

  const basis = concept.basis;
  const plan = concept.plan;
  const res = concept.detectie.resultaat;
  const diag = res?.diagnostiek ?? {};
  const reden = typeof diag.reden === 'string' ? diag.reden : null;
  const meerdereRichtingen = diag.meerdereRichtingen === true;
  const tweedeRichting = typeof diag.tweedeRichtingGraden === 'number' ? diag.tweedeRichtingGraden : null;
  const aantalGetekend = actieveRijen.filter(r => r.geomBron !== 'gegenereerd').length;
  const heeftRijen = actieveRijen.length > 0;

  const startReferentie = () => {
    if (concept.rijafstandVoorReferentie === null) {
      ctx.meld('Rijafstand nodig', 'Vul eerst de verwachte rijafstand in; die is nodig om de rijen naast de referentierij te leggen.');
      return;
    }
    ctx.zetKaartDoel({ soort: 'referentierij' });
  };

  const detecteer = async () => {
    ctx.zetKaartDoel(null);
    const uitkomst = await concept.detecteer();
    // Niet de tik-modus van een ander tabblad overnemen als de gebruiker intussen verder ging
    if (uitkomst === 'onzeker' && gemount.current) ctx.zetKaartDoel({ soort: 'referentierij' });
  };

  const opnieuw = () => {
    if (!concept.laadUitInstellingen()) {
      ctx.meld('Niet af te leiden', 'De rijrichting of rijafstand is niet bekend. Detecteer de rijen of teken een referentierij.');
    }
  };

  // Na opslaan tot de verse rijen er zijn: knop bezig houden (geen tweede opslag op verouderde rijen)
  const [bezigNaOpslaan, setBezigNaOpslaan] = useState(false);

  const slaOp = async () => {
    if (!plan) return;
    setBevestigOpen(false);
    try {
      const r = await concept.slaOp(plan);
      const delen = [
        r.bijgewerkt > 0 ? `${r.bijgewerkt} bijgewerkt` : null,
        r.ingevoegd.length > 0 ? `${r.ingevoegd.length} nieuw` : null,
        r.verwijderd > 0 ? `${r.verwijderd} verwijderd` : null,
        r.gerooid > 0 ? `${r.gerooid} als gerooid bewaard` : null,
      ].filter(Boolean);
      ctx.meld('Rijen opgeslagen', delen.join(' · ') || undefined);
      ctx.zetKaartDoel(null);
      // Eerst de opgeslagen rijen laden, dan pas het voorstel wissen: anders lijkt het (bij trage 4G)
      // even alsof alle rijen weg zijn
      setBezigNaOpslaan(true);
      try {
        await ctx.verversen();
      } finally {
        setBezigNaOpslaan(false);
      }
      concept.wis();
      // Alleen naar Rijen als de gebruiker intussen niet zelf een ander tabblad koos
      if (gemount.current) ctx.zetTab('rijen');
    } catch (e) {
      ctx.meldFout(e, 'Opslaan mislukt');
      // De beginkant kan al gewisseld zijn (eerste stap) terwijl het opslaan van de rijen mislukte
      void ctx.verversen();
    }
  };

  // Bevestigen als er rijen vervallen, bestaande rijen een ander nummer krijgen of rijen onder het startnummer komen
  const vraagOpslaan = () => {
    if (!plan || concept.bezigMetOpslaan || bezigNaOpslaan) return;
    if (plan.aantalVervallen > 0 || plan.aantalHernummerd > 0 || plan.aantalOnderStart > 0) setBevestigOpen(true);
    else void slaOp();
  };

  // Opslaan vanaf de kaart (ConceptBalk) loopt via deze functie, met dezelfde bevestiging
  const vraagOpslaanRef = useRef(vraagOpslaan);
  useEffect(() => {
    vraagOpslaanRef.current = vraagOpslaan;
  });
  const { registreerConceptOpslaan } = ctx;
  useEffect(() => {
    registreerConceptOpslaan(() => vraagOpslaanRef.current());
    return () => registreerConceptOpslaan(null);
  }, [registreerConceptOpslaan]);
  const startnummer = kaart.instellingen?.startnummer ?? 1;

  // Verschuifknoppen: richting van de normaal op het scherm
  const [eerst, tweede] = verschuifKnoppen(basis?.richtingGraden ?? 0);

  return (
    <div className="space-y-6">
      <Sectie titel="Uitgangspunten">
        <div className="grid grid-cols-1 gap-3">
          <Veld
            label="Verwachte rijafstand (optioneel)"
            hint={
              concept.gewogenRijafstand !== null && concept.verwachteRijafstand !== concept.gewogenRijafstand ? (
                <button
                  type="button"
                  className="inline-flex min-h-[44px] items-center text-left text-emerald-300 underline-offset-2 hover:underline"
                  onClick={() => concept.setVerwachteRijafstand(concept.gewogenRijafstand)}
                >
                  Gebruik {fmt(concept.gewogenRijafstand, 2)} m uit perceelprofiel
                </button>
              ) : (
                'Helpt de detectie; nodig voor een referentierij.'
              )
            }
          >
            <GetalVeld
              label="Verwachte rijafstand in meter"
              waarde={concept.verwachteRijafstand}
              onChange={concept.setVerwachteRijafstand}
              achtervoegsel="m"
              placeholder={concept.gewogenRijafstand !== null ? fmt(concept.gewogenRijafstand, 2) : 'bv. 3,00'}
              min={0.5}
              max={20}
            />
          </Veld>
          <div className="grid grid-cols-2 gap-3">
            <Veld label="Kopakker begin">
              <GetalVeld
                label="Kopakker begin in meter"
                waarde={concept.kopakkerBegin}
                onChange={n => {
                  if (n !== null) concept.setKopakkerBegin(n);
                }}
                achtervoegsel="m"
                decimalen={1}
                min={0}
                max={100}
              />
            </Veld>
            <Veld label="Kopakker eind">
              <GetalVeld
                label="Kopakker eind in meter"
                waarde={concept.kopakkerEind}
                onChange={n => {
                  if (n !== null) concept.setKopakkerEind(n);
                }}
                achtervoegsel="m"
                decimalen={1}
                min={0}
                max={100}
              />
            </Veld>
          </div>
        </div>
      </Sectie>

      <Sectie
        titel="Rijen vinden"
        uitleg="De detectie zoekt het rijpatroon op de PDOK-luchtfoto (8 cm, voorjaar). Lukt dat niet, teken dan één rij na op de kaart."
      >
        {concept.detectie.status === 'bezig' ? (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3">
            <ScanSearch className="h-5 w-5 shrink-0 animate-pulse text-emerald-300" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-sm text-emerald-100/90" role="status">
              {concept.detectie.voortgang ?? 'Bezig…'}
            </p>
            <Knop klein soort="stil" onClick={concept.breekDetectieAf}>
              Afbreken
            </Knop>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
            <Knop soort="primair" icoon={<Wand2 className="h-4 w-4" />} onClick={() => void detecteer()} disabled={!ctx.perceelRD}>
              Rijen detecteren uit luchtfoto
            </Knop>
            <Knop
              soort={ctx.kaartDoel?.soort === 'referentierij' ? 'accent' : 'secundair'}
              icoon={<PenLine className="h-4 w-4" />}
              onClick={startReferentie}
              disabled={!ctx.perceelRD}
            >
              Teken referentierij
            </Knop>
          </div>
        )}

        {concept.detectie.status === 'fout' && (
          <Melding soort="fout" titel="Detectie mislukt">
            {concept.detectie.fout} Teken een referentierij om de rijen handmatig te leggen.
          </Melding>
        )}

        {res && concept.detectie.status === 'klaar' && (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2 text-center">
              <Kengetal label="Richting" waarde={res.rijafstandM > 0 ? `${fmt(res.richtingGraden, 1)}°` : '–'} sub={res.rijafstandM > 0 ? `${windstreek(res.richtingGraden)}–${windstreek(res.richtingGraden + 180)}` : undefined} />
              <Kengetal label="Rijafstand" waarde={res.rijafstandM > 0 ? `${fmt(res.rijafstandM, 2)} m` : '–'} />
              <Kengetal
                label="Zekerheid"
                waarde={`${Math.round(res.confidence * 100)}%`}
                sub={`drempel ${Math.round(res.drempel * 100)}%`}
                toon={res.voldoende ? 'emerald' : 'amber'}
              />
            </div>
            {!res.voldoende && (
              <Melding soort="waarschuwing" titel="Detectie onzeker — controleer de rijen of teken een referentierij">
                {reden && <p>{reden}</p>}
              </Melding>
            )}
            {meerdereRichtingen && (
              <Melding soort="waarschuwing" titel="Meerdere rijrichtingen">
                <p>
                  Dit perceel heeft rijen in meer dan één richting
                  {tweedeRichting !== null ? ` (ook ±${fmt(tweedeRichting, 0)}°)` : ''}. Detectie per blok bestaat nog niet, en
                  genereren geldt altijd voor het hele perceel: opslaan vervangt alle rijen.
                </p>
                <p className="mt-1">
                  Teken een referentierij in het grootste deel en sla dat op. Haal daarna de rijen in het andere deel weg
                  (selecteren → Verwijder) en teken die rijen met &lsquo;Rij tekenen&rsquo; (tab Rijen). Genereer daarna niet
                  opnieuw, want dan vervallen de getekende rijen.
                </p>
              </Melding>
            )}
          </div>
        )}

        {heeftRijen && !basis && (
          <div className="space-y-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <p className="text-[13px] text-white/60">
              Er staan al {actieveRijen.length} rijen op dit perceel. Laad de opgeslagen instellingen om de hele set te
              verschuiven of te draaien.
            </p>
            <Knop vol icoon={<Undo2 className="h-4 w-4" />} onClick={opnieuw}>
              Opnieuw genereren / corrigeren
            </Knop>
            {aantalGetekend > 0 && (
              <p className="text-[12px] text-amber-200/80">
                Let op: {aantalGetekend} {aantalGetekend === 1 ? 'rij is' : 'rijen zijn'} handmatig getekend of versleept;
                bij opslaan wordt die ligging overschreven.
              </p>
            )}
          </div>
        )}
      </Sectie>

      {basis && (
        <Sectie
          titel="Voorstel"
          uitleg="Gele stippellijnen op de kaart; oranje = rij door een inham of pad (controleren)."
          actie={
            <Knop klein soort="stil" onClick={concept.wis}>
              Wissen
            </Knop>
          }
        >
          <div className="flex flex-wrap gap-1.5">
            <Chip toon="emerald">{concept.statistiek.aantal} rijen</Chip>
            <Chip>{fmtLengte(concept.statistiek.totaleLengteM)}</Chip>
            <Chip>rij-opp {fmtHa(concept.statistiek.oppervlakHa)}</Chip>
            {concept.statistiek.aantalControleren > 0 && (
              <Chip toon="amber">{concept.statistiek.aantalControleren} controleren</Chip>
            )}
          </div>
          <p className="text-[13px] text-white/55">
            Richting {richtingTekst(basis.richtingGraden)} · rijafstand {fmt(basis.rijafstandM, 2)} m
            {concept.bron?.methode === 'auto' && concept.bron.confidence !== null
              ? ` · ${Math.round(concept.bron.confidence * 100)}% zeker`
              : concept.bron?.methode === 'handmatig'
                ? ' · handmatig'
                : ''}
          </p>

          <div className="space-y-1.5">
              <p className="text-[13px] font-medium text-white/70">Onderbroken rijen</p>
              <Segment
                label="Onderbroken rijen"
                waarde={concept.stukken}
                onChange={concept.setStukken}
                opties={[
                  { waarde: 'langste', label: 'Alleen langste stuk' },
                  { waarde: 'alle', label: 'Alle stukken' },
                ]}
              />
              <p className="text-[12px] text-white/40">
                {concept.stukken === 'langste'
                  ? 'Standaard: per rijlijn alleen het langste stuk; aan de andere kant van een gat of pad komen dan geen rijen.'
                  : 'Elk stuk wordt een aparte rij (met kopakkers aan beide kanten van het gat of pad).'}
              </p>
            </div>

          <div className="space-y-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="space-y-1.5">
              <p className="text-[13px] font-medium text-white/70">Verschuiven</p>
              <div className="grid grid-cols-3 gap-2">
                <Knop className="tabular-nums" onClick={() => concept.verschuif(0.1 * eerst.teken)} aria-label={`10 cm naar het ${windstreek(eerst.graden)}`}>
                  {pijl(eerst.graden)} 10 cm
                </Knop>
                <Knop onClick={concept.halveRij} aria-label="Halve rij verschuiven">
                  ½ rij
                </Knop>
                <Knop className="tabular-nums" onClick={() => concept.verschuif(0.1 * tweede.teken)} aria-label={`10 cm naar het ${windstreek(tweede.graden)}`}>
                  {pijl(tweede.graden)} 10 cm
                </Knop>
              </div>
              <p className="text-[12px] text-white/40">
                {pijl(eerst.graden)} naar het {windstreek(eerst.graden)} · {pijl(tweede.graden)} naar het {windstreek(tweede.graden)}. Ligt het voorstel
                precies tussen de bomen, gebruik dan ½ rij.
              </p>
            </div>

            <div className="space-y-1.5">
              <p className="text-[13px] font-medium text-white/70">Draaien</p>
              <div className="grid grid-cols-2 gap-2">
                <Knop icoon={<RotateCcw className="h-4 w-4" />} onClick={() => concept.draai(-0.5)} className="tabular-nums">
                  0,5°
                </Knop>
                <Knop icoon={<RotateCw className="h-4 w-4" />} onClick={() => concept.draai(0.5)} className="tabular-nums">
                  0,5°
                </Knop>
              </div>
            </div>

            <Stapper
              label="Rijafstand"
              onMin={() => concept.zetRijafstand(Math.round((basis.rijafstandM - 0.01) * 1000) / 1000)}
              onPlus={() => concept.zetRijafstand(Math.round((basis.rijafstandM + 0.01) * 1000) / 1000)}
              minLabel="− 1 cm"
              plusLabel="+ 1 cm"
              midden={
                <GetalVeld
                  label="Rijafstand in meter"
                  waarde={basis.rijafstandM}
                  onChange={n => {
                    if (n !== null) concept.zetRijafstand(n);
                  }}
                  achtervoegsel="m"
                  decimalen={2}
                  min={0.5}
                  max={20}
                />
              }
            />

            <Stapper
              label="Kopakker begin"
              waarde={`${fmt(concept.kopakkerBegin, 1)} m`}
              onMin={() => concept.setKopakkerBegin(Math.max(0, concept.kopakkerBegin - 0.5))}
              onPlus={() => concept.setKopakkerBegin(concept.kopakkerBegin + 0.5)}
              minLabel="− 0,5 m"
              plusLabel="+ 0,5 m"
            />
            <Stapper
              label="Kopakker eind"
              waarde={`${fmt(concept.kopakkerEind, 1)} m`}
              onMin={() => concept.setKopakkerEind(Math.max(0, concept.kopakkerEind - 0.5))}
              onPlus={() => concept.setKopakkerEind(concept.kopakkerEind + 0.5)}
              minLabel="− 0,5 m"
              plusLabel="+ 0,5 m"
            />

            <div className="space-y-1.5">
              <p className="text-[13px] font-medium text-white/70">Beginkant van de rijen</p>
              <div className="grid grid-cols-2 gap-2">
                {[basis.richtingGraden, basis.richtingGraden + 180].map(g => {
                  const actief = Math.cos(((basis.beginkantGraden - g) * Math.PI) / 180) > 0;
                  return (
                    <Knop
                      key={g}
                      soort={actief ? 'accent' : 'secundair'}
                      aria-pressed={actief}
                      onClick={() => concept.zetBeginkant(((g % 360) + 360) % 360)}
                      className="capitalize"
                    >
                      {kantNaam(g)}
                    </Knop>
                  );
                })}
              </div>
              <p className="text-[12px] text-white/40">Bepaalt waar meter 0 van elke rij ligt (notities, boomnummers).</p>
            </div>
          </div>

          {plan && (
            <div className="space-y-1 text-[13px] text-white/60">
              {heeftRijen ? (
                <p>
                  Bij opslaan: <span className="text-white/85">{plan.aantalGekoppeld}</span> bestaande rijen houden hun gegevens,{' '}
                  <span className="text-white/85">{plan.aantalNieuw}</span> nieuw,{' '}
                  <span className={cn(plan.aantalVervallen > 0 && 'text-amber-200')}>{plan.aantalVervallen} vervallen</span>
                  {plan.aantalVervallenMetKoppeling > 0
                    ? ` (${plan.aantalVervallenMetKoppeling} met registraties blijven als gerooid bewaard)`
                    : ''}
                  .
                </p>
              ) : (
                <p>Bij opslaan worden {plan.aantalNieuw} rijen aangemaakt, genummerd vanaf {kaart.instellingen?.startnummer ?? 1}.</p>
              )}
              {plan.aantalGetekendOverschreven > 0 && (
                <p className="text-amber-200/80">
                  {plan.aantalGetekendOverschreven} handmatig aangepaste {plan.aantalGetekendOverschreven === 1 ? 'rij wordt' : 'rijen worden'} overschreven.
                </p>
              )}
              {plan.aantalGetekendBehouden > 0 && (
                <p>
                  {plan.aantalGetekendBehouden} handmatig aangepaste {plan.aantalGetekendBehouden === 1 ? 'rij houdt haar' : 'rijen houden hun'} ligging.
                </p>
              )}
              {plan.aantalNieuwOvergeslagen > 0 && (
                <p>
                  {plan.aantalNieuwOvergeslagen} {plan.aantalNieuwOvergeslagen === 1 ? 'nieuwe rij' : 'nieuwe rijen'} uit het voorstel{' '}
                  {plan.aantalNieuwOvergeslagen === 1 ? 'wordt' : 'worden'} niet toegevoegd.
                </p>
              )}
              {plan.aantalHernummerd > 0 && (
                <p className="text-amber-200">
                  {plan.aantalHernummerd} bestaande {plan.aantalHernummerd === 1 ? 'rij krijgt' : 'rijen krijgen'} een ander nummer
                  {plan.voorbeeldHernummerd ? ` (bv. rij ${plan.voorbeeldHernummerd.van} wordt ${plan.voorbeeldHernummerd.naar})` : ''}.
                </p>
              )}
              {plan.aantalOnderStart > 0 && (
                <p className="text-amber-200">
                  {plan.aantalOnderStart} {plan.aantalOnderStart === 1 ? 'rij krijgt' : 'rijen krijgen'} een nummer onder {startnummer}{' '}
                  (vóór de aangewezen rij {startnummer}).
                </p>
              )}
            </div>
          )}

          {heeftRijen && plan && (plan.aantalNieuw > 0 || concept.alleenBestaande) && (
            <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
              <span className="text-[13px] text-white/75">
                Alleen de ligging van bestaande rijen bijwerken
                <span className="block text-[12px] text-white/45">
                  Geen nieuwe rijen (bv. een rij die je eerder verwijderde) en de nummers blijven gelijk — handig om alleen de kopakker aan te passen.
                </span>
              </span>
              <Switch checked={concept.alleenBestaande} onCheckedChange={concept.setAlleenBestaande} aria-label="Alleen de ligging van bestaande rijen bijwerken" />
            </label>
          )}
          {heeftRijen && plan && (plan.aantalGetekendOverschreven > 0 || concept.behoudGetekend) && (
            <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
              <span className="text-[13px] text-white/75">
                Handmatig aangepaste rijen laten liggen
                <span className="block text-[12px] text-white/45">Versleepte of getekende rijen houden hun eindpunten.</span>
              </span>
              <Switch checked={concept.behoudGetekend} onCheckedChange={concept.setBehoudGetekend} aria-label="Handmatig aangepaste rijen laten liggen" />
            </label>
          )}

          <Knop
            soort="primair"
            vol
            bezig={concept.bezigMetOpslaan || bezigNaOpslaan}
            disabled={!plan || concept.statistiek.aantal === 0}
            onClick={vraagOpslaan}
          >
            {concept.statistiek.aantal === 0 ? 'Geen rijen in dit voorstel' : `Opslaan (${concept.statistiek.aantal} rijen)`}
          </Knop>
        </Sectie>
      )}

      <AlertDialog open={bevestigOpen} onOpenChange={setBevestigOpen}>
        <AlertDialogContent className="max-w-md border-white/10 bg-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle>{plan && plan.aantalVervallen > 0 ? 'Rijen vervallen' : 'Nummering verandert'}</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              {plan && plan.aantalVervallen > 0 && (
                <span className="block">
                  {plan.aantalVervallen} {plan.aantalVervallen === 1 ? 'rij vervalt' : 'rijen vervallen'}
                  {plan.aantalVervallenMetKoppeling > 0
                    ? `; ${plan.aantalVervallenMetKoppeling} daarvan ${plan.aantalVervallenMetKoppeling === 1 ? 'heeft' : 'hebben'} registraties en ${plan.aantalVervallenMetKoppeling === 1 ? 'blijft' : 'blijven'} als gerooid bewaard`
                    : ''}
                  .
                </span>
              )}
              {plan && plan.aantalHernummerd > 0 && (
                <span className="block">
                  {plan.aantalHernummerd} bestaande {plan.aantalHernummerd === 1 ? 'rij krijgt' : 'rijen krijgen'} een ander nummer
                  {plan.voorbeeldHernummerd ? ` (bv. rij ${plan.voorbeeldHernummerd.van} wordt ${plan.voorbeeldHernummerd.naar})` : ''}. Een
                  rijnummer op papier of in een eerdere afspraak wijst daarna een andere rij aan.
                </span>
              )}
              {plan && plan.aantalOnderStart > 0 && (
                <span className="block">
                  {plan.aantalOnderStart} {plan.aantalOnderStart === 1 ? 'rij komt' : 'rijen komen'} vóór de aangewezen rij {startnummer} en{' '}
                  {plan.aantalOnderStart === 1 ? 'krijgt' : 'krijgen'} een nummer onder {startnummer}. Wijs na het opslaan zo nodig rij 1 opnieuw aan
                  (tab Indeling).
                </span>
              )}
              <span className="block">
                {plan?.aantalGekoppeld ?? 0} rijen houden hun gegevens (blok, ras, historie) en krijgen de nieuwe ligging.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[44px]">Annuleren</AlertDialogCancel>
            <AlertDialogAction className="min-h-[44px] bg-emerald-500 text-black hover:bg-emerald-400" onClick={() => void slaOp()}>
              Opslaan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Kengetal({ label, waarde, sub, toon }: { label: string; waarde: string; sub?: string; toon?: 'emerald' | 'amber' }) {
  return (
    <div
      className={cn(
        'rounded-xl border px-2 py-2',
        toon === 'emerald' && 'border-emerald-500/25 bg-emerald-500/[0.06]',
        toon === 'amber' && 'border-amber-500/30 bg-amber-500/[0.08]',
        !toon && 'border-white/[0.06] bg-white/[0.02]',
      )}
    >
      <p className="text-[11px] uppercase tracking-wide text-white/40">{label}</p>
      <p className="text-base font-semibold tabular-nums text-white">{waarde}</p>
      {sub && <p className="truncate text-[11px] text-white/45">{sub}</p>}
    </div>
  );
}
