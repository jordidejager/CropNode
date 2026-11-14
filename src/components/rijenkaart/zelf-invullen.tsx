'use client';

/**
 * Rijenkaart (beta) — rijen maken zonder luchtfoto: rijrichting (of langs een perceelrand), rijafstand, afstand
 * van de eerste rij tot de grens (aan een gekozen kant) en eventueel het aantal rijen. Levert een gewoon voorstel
 * op (gele lijnen) dat daarna te verschuiven, te draaien en op te slaan is. Rijen blijven binnen de perceelgrens;
 * waar een machine mag rijden of keren legt Jager Fleet zelf vast.
 */

import { useMemo, useState } from 'react';
import { Ruler } from 'lucide-react';
import { windstreek } from '@/lib/rijen/geo';
import { kantRichting, langsteRanden, type RijKant } from '@/lib/rijen/generatie';
import { cn } from '@/lib/utils';
import { useRijenkaartCtx } from './rijenkaart-context';
import { fmt } from './rijen-hulp';
import { GetalVeld, Knop, Segment, Veld } from './ui';

export function ZelfInvullen({ onKlaar }: { onKlaar: () => void }) {
  const ctx = useRijenkaartCtx();
  const { concept, perceelRD } = ctx;
  const randen = useMemo(() => (perceelRD ? langsteRanden(perceelRD, 4) : []), [perceelRD]);

  const [richting, setRichting] = useState<number | null>(() => ctx.richting ?? randen[0]?.richtingGraden ?? null);
  const [rijafstand, setRijafstand] = useState<number | null>(
    () => concept.verwachteRijafstand ?? concept.gewogenRijafstand ?? ctx.kaart.instellingen?.rijafstandM ?? null,
  );
  const [eerste, setEerste] = useState<number | null>(null);
  const [kant, setKant] = useState<RijKant>(-1);
  const [aantal, setAantal] = useState<number | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  const eersteAfstand = eerste ?? (rijafstand !== null ? Math.round((rijafstand / 2) * 100) / 100 : null);
  const kantNaam = (k: RijKant) => (richting === null ? (k === -1 ? 'Ene kant' : 'Andere kant') : `${windstreek(kantRichting(richting, k))}kant`);

  const maak = () => {
    if (richting === null || rijafstand === null || eersteAfstand === null) {
      setFout('Vul rijrichting, rijafstand en de afstand van de eerste rij in.');
      return;
    }
    const f = concept.maakZelfIngevuld({ richtingGraden: richting, rijafstandM: rijafstand, eersteAfstandM: eersteAfstand, kant, aantal });
    setFout(f);
    if (!f) {
      ctx.zetKaartDoel(null);
      onKlaar();
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
      <Veld label="Rijrichting" hint="Kompasgraden (0–180). Of neem de richting van een perceelrand.">
        <GetalVeld label="Rijrichting in graden" waarde={richting} onChange={setRichting} achtervoegsel="°" decimalen={1} min={0} max={360} placeholder="bv. 142" />
      </Veld>
      {randen.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {randen.map(r => {
            const actief = richting !== null && Math.abs(((richting % 180) + 180) % 180 - r.richtingGraden) < 0.05;
            return (
              <button
                key={`${r.richtingGraden}-${r.lengteM}`}
                type="button"
                aria-pressed={actief}
                onClick={() => setRichting(r.richtingGraden)}
                className={cn(
                  'inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3 text-[12px] font-medium',
                  actief ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100' : 'border-white/10 bg-white/[0.04] text-white/75',
                )}
              >
                <Ruler className="h-3.5 w-3.5" aria-hidden="true" />
                Langs rand {r.lengteM} m · {fmt(r.richtingGraden, 1)}°
              </button>
            );
          })}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Veld label="Rijafstand">
          <GetalVeld label="Rijafstand in meter" waarde={rijafstand} onChange={setRijafstand} achtervoegsel="m" decimalen={2} min={0.5} max={20} placeholder="bv. 3,40" />
        </Veld>
        <Veld label="Aantal rijen">
          <GetalVeld label="Aantal rijen" waarde={aantal} onChange={n => setAantal(n === null ? null : Math.round(n))} decimalen={0} min={1} max={2000} placeholder="tot de grens" />
        </Veld>
      </div>
      <Veld label="Eerste rij vanaf de grens" hint="Dwars op de rijen gemeten, vanaf het buitenste punt van de grens aan die kant.">
        <GetalVeld
          label="Afstand van de eerste rij tot de grens in meter"
          waarde={eersteAfstand}
          onChange={setEerste}
          achtervoegsel="m"
          decimalen={2}
          min={0}
          max={100}
        />
      </Veld>
      <p className="text-[13px] font-medium text-white/70">Eerste rij aan de</p>
      <Segment
        label="Eerste rij aan de"
        waarde={String(kant)}
        onChange={v => setKant(v === '1' ? 1 : -1)}
        opties={[
          { waarde: '-1', label: kantNaam(-1) },
          { waarde: '1', label: kantNaam(1) },
        ]}
      />
      {fout && <p className="text-[13px] text-red-300" role="alert">{fout}</p>}
      <Knop vol soort="primair" onClick={maak}>
        Voorstel maken
      </Knop>
      <p className="text-[12px] leading-snug text-white/45">
        De rijen blijven binnen de perceelgrens. Waar de machine mag rijden of keren legt Jager Fleet zelf vast; de
        kopakker hieronder is alleen een beginwaarde.
      </p>
    </div>
  );
}
