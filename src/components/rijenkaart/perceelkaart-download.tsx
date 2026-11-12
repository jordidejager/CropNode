'use client';

/**
 * "Perceelkaart downloaden": perceelgrens + rijen + machinematen als één GeoJSON (voor de Jager Core-simulatie,
 * zie docs/rijenkaart/PERCEELKAART.md). Na het downloaden staan de controles van de export erbij.
 *  - weergave 'knop'  : knop op de perceelpagina; controles in een venster
 *  - weergave 'paneel': sectie in het tabblad Export van de rijenkaart; controles eronder
 */

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Map as MapIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { perceelkaartBestandsnaam, type Perceelkaart, type PerceelkaartControles } from '@/lib/rijen/perceelkaart';
import { Knop, Melding, Sectie } from './ui';

interface Uitkomst {
  bestand: string;
  controles: PerceelkaartControles;
  rijen: number;
}

async function haalOp(perceelId: string): Promise<Uitkomst> {
  const res = await fetch(`/api/parcels/${encodeURIComponent(perceelId)}/perceelkaart`, { cache: 'no-store' });
  const body = (await res.json().catch(() => null)) as (Perceelkaart & { error?: string; message?: string }) | null;
  if (!res.ok || !body || body.type !== 'FeatureCollection') {
    throw new Error(body?.error || body?.message || `Perceelkaart ophalen mislukt (${res.status}).`);
  }
  const bestand = perceelkaartBestandsnaam(body.metadata.perceel_naam);
  const url = URL.createObjectURL(new Blob([JSON.stringify(body, null, 1)], { type: 'application/geo+json' }));
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = bestand;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
  return { bestand, controles: body.metadata.controles, rijen: body.metadata.aantal_rijen_actief };
}

function Controles({ u }: { u: Uitkomst }) {
  const c = u.controles;
  return (
    <div className="space-y-2">
      <Melding soort={c.ok ? 'succes' : 'waarschuwing'} titel={c.ok ? 'Controles in orde' : 'Controles: let op'}>
        {u.bestand} gedownload ({u.rijen} {u.rijen === 1 ? 'rij' : 'rijen'}).
      </Melding>
      <ul className="space-y-1.5 text-[13px] text-white/75">
        {c.meldingen.map(m => (
          <li key={m.tekst} className="flex gap-2">
            {m.soort === 'ok' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
            ) : (
              <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${m.soort === 'info' ? 'text-white/40' : 'text-amber-300'}`} aria-hidden="true" />
            )}
            <span>{m.tekst}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PerceelkaartDownload({ perceelId, weergave }: { perceelId: string; weergave: 'knop' | 'paneel' }) {
  const [bezig, setBezig] = useState(false);
  const [uitkomst, setUitkomst] = useState<Uitkomst | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const download = async () => {
    setBezig(true);
    setFout(null);
    try {
      const u = await haalOp(perceelId);
      setUitkomst(u);
    } catch (e) {
      setUitkomst(null);
      setFout(e instanceof Error ? e.message : 'Perceelkaart ophalen mislukt.');
    } finally {
      setBezig(false);
      setOpen(true);
    }
  };

  if (weergave === 'paneel') {
    return (
      <Sectie
        titel="Perceelkaart (Jager Core)"
        uitleg="Eén bestand met de perceelgrens, alle rijen en de maten voor een zelfrijdende machine: buurrijen, afstand tot de buren langs de rij, ruimte tot de grens aan beide uiteinden. Coördinaten in WGS84 én RD New. Wat CropNode niet weet staat er als leeg (null) in."
      >
        <Knop vol soort="primair" bezig={bezig} icoon={<MapIcon className="h-4 w-4" />} onClick={() => void download()}>
          Perceelkaart downloaden
        </Knop>
        {fout && <Melding soort="fout" titel="Downloaden mislukt">{fout}</Melding>}
        {uitkomst && <Controles u={uitkomst} />}
      </Sectie>
    );
  }

  return (
    <>
      <Button
        variant="outline"
        className="min-h-[44px] bg-white/5 border-white/10 text-white font-bold rounded-full gap-2"
        disabled={bezig}
        onClick={() => void download()}
      >
        <Download className="h-4 w-4" /> {bezig ? 'Perceelkaart maken…' : 'Perceelkaart downloaden'}
      </Button>
      <Dialog open={open && (!!uitkomst || !!fout)} onOpenChange={setOpen}>
        <DialogContent className="max-w-md border-white/10 bg-slate-900">
          <DialogHeader>
            <DialogTitle>Perceelkaart</DialogTitle>
            <DialogDescription>Controles van de export (perceelgrens, rijen en machinematen).</DialogDescription>
          </DialogHeader>
          {fout && <Melding soort="fout" titel="Downloaden mislukt">{fout}</Melding>}
          {uitkomst && <Controles u={uitkomst} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
