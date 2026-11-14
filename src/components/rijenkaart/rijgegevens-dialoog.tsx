'use client';

/**
 * Rijenkaart (beta) — rijgegevens van één rij, een reeks ("rij 1 t/m 18") of een blok in één keer: gewas, ras,
 * bestuiver, plantjaar, onderstam en blok. Alleen velden die je aanraakt worden opgeslagen; bij een selectie met
 * verschillende waarden blijft een veld dat je niet aanraakt per rij zoals het was. Een leeg veld betekent
 * "overnemen van het blok of het perceel" (de eigen waarde op de rij wordt gewist).
 *
 * Jager Fleet leest het resultaat uit v_rijen (gewas_effectief, ras_effectief, plantjaar_effectief,
 * onderstam_effectief, is_bestuiver, blok_id). Deze gegevens veranderen gewijzigd_op niet: dat volgt alleen
 * de lijn, het nummer en de status.
 */

import { useId, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatteerBereiken } from '@/lib/rijen/selectie';
import type { RijAttributen, Rij } from '@/lib/rijen/types';
import { slaBlokOpAction, zetRijAttributenAction } from '@/app/rijen-actions';
import { useRijenkaartCtx } from './rijenkaart-context';
import { gemeenschappelijk, gewasSuggesties, rasSuggesties, tekstOfNull, type Gemeenschappelijk } from './rijen-hulp';
import { GetalVeld, Knop, Melding, Segment, Veld, tekstVeldStijl } from './ui';

const DIALOOG_STIJL = 'max-h-[90dvh] overflow-y-auto border-white/10 bg-slate-950/95 backdrop-blur-xl sm:max-w-md';
const VERSCHILLEND = '__verschillend__';
const GEEN_BLOK = '__geen__';

function omschrijving(rijen: readonly Rij[]): string {
  if (rijen.length === 1) return `Rij ${rijen[0].nummer}`;
  return `Rij ${formatteerBereiken(rijen.map(r => r.nummer))} (${rijen.length} rijen)`;
}

/** "Nu: Conference" / "Nu: verschillend per rij" / "Nu: onbekend" */
function nuTekst(g: Gemeenschappelijk<string | number | null>): string {
  if (g.soort === 'verschillend') return 'Nu: verschillend per rij';
  return g.waarde === null || g.waarde === '' ? 'Nu: onbekend' : `Nu: ${g.waarde}`;
}

/** Beginwaarde van een invoerveld: de gedeelde eigen waarde, of leeg. */
function begin(g: Gemeenschappelijk<string | null>): string {
  return g.soort === 'gelijk' ? g.waarde ?? '' : '';
}

export function RijgegevensDialoog({ rijIds, onSluit }: { rijIds: string[]; onSluit: () => void }) {
  const ctx = useRijenkaartCtx();
  const rijen = useMemo(
    () =>
      rijIds
        .map(id => ctx.rijPerId.get(id))
        .filter((r): r is Rij => !!r && r.status === 'actief')
        .sort((a, b) => a.nummer - b.nummer),
    [rijIds, ctx.rijPerId],
  );
  const gewasLijst = useMemo(() => gewasSuggesties(ctx.kaart), [ctx.kaart]);
  const rasLijst = useMemo(() => rasSuggesties(ctx.kaart), [ctx.kaart]);
  const gewasLijstId = useId();
  const rasLijstId = useId();

  // Eigen waarden op de rij (wat je hier bewerkt) en wat er nu effectief geldt (incl. blok/perceel)
  const eigen = useMemo(
    () => ({
      gewas: gemeenschappelijk(rijen.map(r => r.gewas)),
      ras: gemeenschappelijk(rijen.map(r => r.ras)),
      plantjaar: gemeenschappelijk(rijen.map(r => r.plantjaar)),
      onderstam: gemeenschappelijk(rijen.map(r => r.onderstamEigen)),
      rol: gemeenschappelijk(rijen.map(r => r.rol)),
      blok: gemeenschappelijk(rijen.map(r => r.blokId)),
    }),
    [rijen],
  );
  const rasInfo = ctx.rasInfo;
  const nu = useMemo(
    () => ({
      gewas: gemeenschappelijk(rijen.map(r => r.gewasEffectief)),
      ras: gemeenschappelijk(rijen.map(r => rasInfo(r).ras)),
      plantjaar: gemeenschappelijk(rijen.map(r => r.plantjaarEffectief)),
      onderstam: gemeenschappelijk(rijen.map(r => r.onderstamEffectief)),
    }),
    [rijen, rasInfo],
  );

  const [gewas, setGewas] = useState(() => begin(eigen.gewas));
  const [ras, setRas] = useState(() => begin(eigen.ras));
  const [plantjaar, setPlantjaar] = useState<number | null>(() => (eigen.plantjaar.soort === 'gelijk' ? eigen.plantjaar.waarde : null));
  const [onderstam, setOnderstam] = useState(() => begin(eigen.onderstam));
  const [rol, setRol] = useState<string>(() => (eigen.rol.soort === 'gelijk' ? eigen.rol.waarde ?? 'hoofd' : VERSCHILLEND));
  const [blok, setBlok] = useState<string>(() => (eigen.blok.soort === 'gelijk' ? eigen.blok.waarde ?? GEEN_BLOK : VERSCHILLEND));
  const [aangeraakt, setAangeraakt] = useState<Set<string>>(new Set());
  const [bezig, setBezig] = useState(false);
  const raak = (veld: string) => setAangeraakt(s => (s.has(veld) ? s : new Set(s).add(veld)));

  const plantjaarFout =
    plantjaar !== null && (!Number.isInteger(plantjaar) || plantjaar < 1900 || plantjaar > 2100) ? 'Vul een jaartal in, bijv. 2015.' : null;
  const veelRijen = rijen.length > 1;
  const leegHint = veelRijen ? 'Leeg = van het blok of perceel. Niet aanraken = elke rij houdt zijn eigen waarde.' : 'Leeg = van het blok of perceel.';

  const slaOp = async () => {
    if (plantjaarFout || rijen.length === 0) return;
    const attrs: RijAttributen = {};
    if (aangeraakt.has('gewas')) attrs.gewas = tekstOfNull(gewas);
    if (aangeraakt.has('ras')) attrs.ras = tekstOfNull(ras);
    if (aangeraakt.has('plantjaar')) attrs.plantjaar = plantjaar;
    if (aangeraakt.has('onderstam')) attrs.onderstam = tekstOfNull(onderstam);
    if (aangeraakt.has('rol') && (rol === 'hoofd' || rol === 'bestuiver')) attrs.rol = rol;
    const blokGewijzigd = aangeraakt.has('blok') && blok !== VERSCHILLEND;
    if (Object.keys(attrs).length === 0 && !blokGewijzigd) {
      onSluit();
      return;
    }
    setBezig(true);
    try {
      const ids = rijen.map(r => r.id);
      // Eerst het blok (slaBlokOp verhuist de rijen), daarna de eigen waarden op de rijen
      if (blokGewijzigd && blok !== GEEN_BLOK) await slaBlokOpAction(ctx.perceelId, { id: blok }, ids);
      if (blokGewijzigd && blok === GEEN_BLOK) attrs.blokId = null;
      const n = Object.keys(attrs).length > 0 ? await zetRijAttributenAction(ctx.perceelId, ids, attrs) : ids.length;
      ctx.meld('Rijgegevens opgeslagen', `${omschrijving(rijen)}${n !== ids.length ? ` · ${n} bijgewerkt` : ''}`);
      onSluit();
      await ctx.verversen();
    } catch (e) {
      ctx.meldFout(e, 'Rijgegevens opslaan mislukt');
    } finally {
      setBezig(false);
    }
  };

  return (
    <Dialog open onOpenChange={o => !o && onSluit()}>
      <DialogContent className={DIALOOG_STIJL}>
        <DialogHeader>
          <DialogTitle>Rijgegevens</DialogTitle>
          <DialogDescription>{rijen.length > 0 ? omschrijving(rijen) : 'Geen actieve rijen gekozen.'}</DialogDescription>
        </DialogHeader>
        {rijen.length > 0 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Veld label="Gewas" hint={nuTekst(nu.gewas)}>
                <input
                  value={gewas}
                  onChange={e => {
                    setGewas(e.target.value);
                    raak('gewas');
                  }}
                  list={gewasLijstId}
                  placeholder={eigen.gewas.soort === 'verschillend' ? 'verschillend' : 'van blok/perceel'}
                  className={tekstVeldStijl}
                  aria-label="Gewas"
                />
                <datalist id={gewasLijstId}>
                  {gewasLijst.map(s => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </Veld>
              <Veld label="Ras" hint={nuTekst(nu.ras)}>
                <input
                  value={ras}
                  onChange={e => {
                    setRas(e.target.value);
                    raak('ras');
                  }}
                  list={rasLijstId}
                  placeholder={eigen.ras.soort === 'verschillend' ? 'verschillend' : 'van blok/perceel'}
                  className={tekstVeldStijl}
                  aria-label="Ras"
                />
                <datalist id={rasLijstId}>
                  {rasLijst.map(s => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </Veld>
            </div>

            <Veld label="Soort rij">
              <Segment
                label="Soort rij"
                waarde={rol}
                onChange={w => {
                  setRol(w);
                  raak('rol');
                }}
                opties={[
                  { waarde: 'hoofd', label: 'Hoofdrij' },
                  { waarde: 'bestuiver', label: 'Bestuiver' },
                ]}
              />
            </Veld>
            {rol === VERSCHILLEND && <p className="-mt-1 text-[12px] text-white/45">Nu: hoofdrijen en bestuivers door elkaar.</p>}

            <div className="grid grid-cols-2 gap-3">
              <Veld label="Plantjaar" hint={nuTekst(nu.plantjaar)} fout={plantjaarFout ?? undefined}>
                <GetalVeld
                  label="Plantjaar"
                  waarde={plantjaar}
                  onChange={v => {
                    setPlantjaar(v);
                    raak('plantjaar');
                  }}
                  decimalen={0}
                  invoerModus="numeric"
                  placeholder={eigen.plantjaar.soort === 'verschillend' ? 'verschillend' : 'van blok'}
                />
              </Veld>
              <Veld label="Onderstam" hint={nuTekst(nu.onderstam)}>
                <input
                  value={onderstam}
                  onChange={e => {
                    setOnderstam(e.target.value);
                    raak('onderstam');
                  }}
                  placeholder={eigen.onderstam.soort === 'verschillend' ? 'verschillend' : 'van blok'}
                  className={tekstVeldStijl}
                  aria-label="Onderstam"
                />
              </Veld>
            </div>
            <p className="text-[12px] leading-snug text-white/45">{leegHint}</p>

            <Veld label="Blok">
              <select
                value={blok}
                onChange={e => {
                  setBlok(e.target.value);
                  raak('blok');
                }}
                className={tekstVeldStijl}
                aria-label="Blok"
              >
                {blok === VERSCHILLEND && <option value={VERSCHILLEND}>Verschillend (niet wijzigen)</option>}
                <option value={GEEN_BLOK}>Geen blok</option>
                {ctx.kaart.blokken.map(b => (
                  <option key={b.id} value={b.id}>
                    {[b.naam || 'Naamloos blok', b.ras].filter(Boolean).join(' · ')}
                  </option>
                ))}
              </select>
            </Veld>
            <Knop
              vol
              soort="stil"
              icoon={<Plus className="h-4 w-4" />}
              onClick={() => {
                onSluit();
                ctx.openDialoog({ soort: 'blok', blokId: null, rijIds: rijen.map(r => r.id) });
              }}
            >
              Nieuw blok van deze rijen…
            </Knop>

            {aangeraakt.has('blok') && blok !== VERSCHILLEND && blok !== GEEN_BLOK && (aangeraakt.has('ras') || aangeraakt.has('plantjaar')) && (
              <Melding soort="info">Wat je hier invult geldt alleen voor deze rijen en gaat vóór de waarde van het blok.</Melding>
            )}

            <div className="grid grid-cols-2 gap-2 pt-1">
              <Knop onClick={onSluit}>Annuleren</Knop>
              <Knop soort="primair" bezig={bezig} disabled={!!plantjaarFout} onClick={() => void slaOp()}>
                Opslaan
              </Knop>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
