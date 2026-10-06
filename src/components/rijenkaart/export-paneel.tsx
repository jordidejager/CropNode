'use client';

/**
 * Rijenkaart (beta) — paneel "Export": GeoJSON van de rijen downloaden (Jager Core, GIS).
 */

import { useState } from 'react';
import { Download } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useRijenkaartCtx } from './rijenkaart-context';
import { Chip, Sectie } from './ui';

export function ExportPaneel() {
  const ctx = useRijenkaartCtx();
  const [metGerooid, setMetGerooid] = useState(false);
  const aantalActief = ctx.actieveRijen.length;
  const aantalGerooid = ctx.rijen.length - aantalActief;
  const aantalBestuivers = ctx.actieveRijen.filter(r => r.rol === 'bestuiver').length;
  const aantal = aantalActief + (metGerooid ? aantalGerooid : 0);
  const href = `/api/parcels/${encodeURIComponent(ctx.perceelId)}/rijen-geojson?download=1${metGerooid ? '' : '&gerooid=0'}`;

  return (
    <div className="space-y-6">
      <Sectie
        titel="GeoJSON"
        uitleg="Alle rijen als lijnen (WGS84) met nummer, ras, blok, rol, lengte, rij- en boomafstand en aantal bomen. Te gebruiken in Jager Core (taakkaarten, rijgeleiding) en in GIS-programma's als QGIS."
      >
        <div className="flex flex-wrap gap-1.5">
          <Chip toon="emerald">{aantalActief} actieve rijen</Chip>
          {aantalBestuivers > 0 && <Chip>{aantalBestuivers} bestuivers</Chip>}
          <Chip>{ctx.kaart.blokken.length} blokken</Chip>
          {aantalGerooid > 0 && <Chip>{aantalGerooid} gerooid</Chip>}
        </div>

        {aantalGerooid > 0 && (
          <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3">
            <span className="text-[13px] text-white/75">Gerooide rijen meenemen (historie)</span>
            <Switch checked={metGerooid} onCheckedChange={setMetGerooid} aria-label="Gerooide rijen meenemen" />
          </label>
        )}

        {aantal > 0 ? (
          <a
            href={href}
            download
            className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500 px-4 text-sm font-semibold text-black shadow-lg shadow-emerald-500/10 transition-colors hover:bg-emerald-400"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Download GeoJSON ({aantal} {aantal === 1 ? 'rij' : 'rijen'})
          </a>
        ) : (
          <p className="text-[13px] text-white/45">Nog geen rijen om te exporteren.</p>
        )}
        <p className="text-[12px] text-white/40">
          Coördinaten in WGS84 (EPSG:4326); lengtes zijn in RD New (EPSG:28992) gemeten. Elke rij loopt van begin naar eind
          (beginkant).
        </p>
      </Sectie>
    </div>
  );
}
