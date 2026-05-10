'use client';

import { useState, useMemo } from 'react';
import { CloudRain, Calculator, Loader2, ChevronDown, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useStationMeasurements,
  useUpdateStation,
  type PhysicalStation,
} from '@/hooks/use-physical-stations';

interface Props {
  station: PhysicalStation;
}

const DEFAULT_MM_PER_TIP = 0.2;
// Dragino WSC2-Compact-LS rain cup: 110 mm Ø → π × 5.5² = ~95 cm²
const DEFAULT_APERTURE_CM2 = 95;

/**
 * Rain bucket calibration panel. Lets the user pour a known volume of water
 * into the funnel, count the resulting tips, and convert that into a per-tip
 * rainfall constant. The constant is stored on physical_weather_stations.mm_per_tip
 * and applied to all future uplinks. Past rainfall_mm values are not retroactively
 * recomputed.
 */
export function RainCalibrationPanel({ station }: Props) {
  const [open, setOpen] = useState(false);
  const update = useUpdateStation();

  const currentFactor = station.mm_per_tip ?? DEFAULT_MM_PER_TIP;

  // Pull the most recent measurements so we can show the live rain counter
  // and let the user spot the tip-jump from their pour.
  const { data: measurements } = useStationMeasurements(station.id, '24h');
  const recent = useMemo(() => (measurements ?? []).slice(0, 6), [measurements]);
  const currentCounter = recent[0]?.rain_counter ?? null;

  // Form state
  const [volumeMl, setVolumeMl] = useState<string>('200');
  const [apertureCm2, setApertureCm2] = useState<string>(String(DEFAULT_APERTURE_CM2));
  const [tipsObserved, setTipsObserved] = useState<string>('');

  // Computed reference mm + new factor
  const calc = useMemo(() => {
    const v = parseFloat(volumeMl);
    const a = parseFloat(apertureCm2);
    const t = parseFloat(tipsObserved);
    if (!Number.isFinite(v) || v <= 0) return null;
    if (!Number.isFinite(a) || a <= 0) return null;
    // mm = (volume_cm³ / area_cm²) × 10
    const referenceMm = (v / a) * 10;
    if (!Number.isFinite(t) || t <= 0) {
      return { referenceMm, mmPerTip: null as number | null };
    }
    return { referenceMm, mmPerTip: referenceMm / t };
  }, [volumeMl, apertureCm2, tipsObserved]);

  const canSave =
    calc !== null &&
    calc.mmPerTip !== null &&
    Number.isFinite(calc.mmPerTip) &&
    calc.mmPerTip > 0 &&
    calc.mmPerTip < 10;

  const handleSave = async () => {
    if (!canSave || !calc?.mmPerTip) return;
    await update.mutateAsync({
      id: station.id,
      patch: { mmPerTip: Number(calc.mmPerTip.toFixed(3)) },
    });
    setTipsObserved('');
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-white/[0.04] transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-emerald-500/15 flex items-center justify-center">
            <CloudRain className="h-4.5 w-4.5 text-emerald-400" />
          </div>
          <div>
            <div className="text-sm font-bold text-white">Regen-kalibratie</div>
            <div className="text-[11px] text-white/50">
              Huidige factor: <span className="font-mono text-emerald-300">{currentFactor.toFixed(3)} mm/tik</span>
              {currentFactor !== DEFAULT_MM_PER_TIP && (
                <span className="ml-1 text-white/30">
                  (standaard {DEFAULT_MM_PER_TIP})
                </span>
              )}
            </div>
          </div>
        </div>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-white/40 transition-transform',
            open && 'rotate-180'
          )}
        />
      </button>

      {open && (
        <div className="border-t border-white/10 p-4 space-y-4">
          {/* Recent counter view */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/40 mb-2">
              Recente metingen
            </div>
            {recent.length > 0 ? (
              <div className="space-y-1">
                {recent.map((m, idx) => {
                  const prev = recent[idx + 1];
                  const delta =
                    prev && prev.rain_counter !== null && m.rain_counter !== null
                      ? m.rain_counter - prev.rain_counter
                      : null;
                  return (
                    <div
                      key={m.id}
                      className="grid grid-cols-3 gap-2 text-[11px] py-1 border-b border-white/[0.04] last:border-0"
                    >
                      <span className="text-white/50">
                        {new Date(m.measured_at).toLocaleString('nl-NL', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <span className="text-white/80 font-mono text-right tabular-nums">
                        teller {m.rain_counter ?? '—'}
                      </span>
                      <span
                        className={cn(
                          'text-right font-mono tabular-nums',
                          delta && delta > 0
                            ? 'text-emerald-400 font-bold'
                            : 'text-white/30'
                        )}
                      >
                        {delta !== null ? (delta > 0 ? `+${delta} tikken` : '—') : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-[11px] text-white/40">Nog geen metingen.</div>
            )}
            {currentCounter !== null && (
              <div className="text-[11px] text-white/40 mt-2">
                Huidige tellerstand:{' '}
                <span className="font-mono text-white/80">{currentCounter}</span>
              </div>
            )}
          </div>

          {/* How-to */}
          <div className="rounded-lg bg-amber-500/[0.06] border border-amber-500/20 p-3 text-[11px] text-amber-100/80 leading-relaxed">
            <div className="flex items-start gap-1.5">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-400" />
              <div>
                Giet een bekend volume (bv. 200 ml) heel langzaam in de
                trechter. Wacht tot een uplink geweest is en check hierboven hoeveel
                tikken erbij zijn gekomen. Vul dan onderstaand formulier in.
              </div>
            </div>
          </div>

          {/* Calculator */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <CalcField
              label="Volume gegoten"
              suffix="ml"
              value={volumeMl}
              onChange={setVolumeMl}
              hint="Bekend gegoten volume"
            />
            <CalcField
              label="Trechter oppervlak"
              suffix="cm²"
              value={apertureCm2}
              onChange={setApertureCm2}
              hint={`Default ${DEFAULT_APERTURE_CM2} (Ø 110 mm)`}
            />
            <CalcField
              label="Tikken"
              suffix=""
              value={tipsObserved}
              onChange={setTipsObserved}
              hint="Aantal sinds gieten"
            />
          </div>

          {calc && (
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                <Calculator className="h-3 w-3" />
                Berekening
              </div>
              <div className="text-[12px] text-white/80 font-mono leading-relaxed">
                {calc.referenceMm.toFixed(2)} mm referentie
                {calc.mmPerTip !== null && (
                  <>
                    {' / '}
                    <span className="text-white/50">
                      {tipsObserved} tikken
                    </span>
                    {' = '}
                    <span className="text-emerald-300 font-bold">
                      {calc.mmPerTip.toFixed(3)} mm/tik
                    </span>
                  </>
                )}
              </div>
              {calc.mmPerTip !== null && Math.abs(calc.mmPerTip - currentFactor) > 0.01 && (
                <div className="text-[10px] text-white/50">
                  Verschuift van {currentFactor.toFixed(3)} →{' '}
                  <span className="text-emerald-300">
                    {calc.mmPerTip.toFixed(3)}
                  </span>
                </div>
              )}
            </div>
          )}

          {update.error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-300">
              {(update.error as Error).message}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={!canSave || update.isPending}
              className="flex-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50 transition-colors px-4 py-2 text-sm font-semibold flex items-center justify-center gap-2"
            >
              {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Kalibratie opslaan
            </button>
            {currentFactor !== DEFAULT_MM_PER_TIP && (
              <button
                onClick={() =>
                  update.mutateAsync({
                    id: station.id,
                    patch: { mmPerTip: DEFAULT_MM_PER_TIP },
                  })
                }
                disabled={update.isPending}
                className="rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white/90 hover:bg-white/10 transition-colors px-3 py-2 text-xs font-semibold"
                title="Reset naar fabrieksinstelling"
              >
                Reset
              </button>
            )}
          </div>

          <div className="text-[10px] text-white/30 leading-relaxed">
            Alleen toekomstige metingen gebruiken de nieuwe factor — historische
            mm-waardes blijven zoals ze waren.
          </div>
        </div>
      )}
    </div>
  );
}

function CalcField({
  label,
  suffix,
  value,
  onChange,
  hint,
}: {
  label: string;
  suffix: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-white/40 mb-1">
        {label}
      </div>
      <div className="relative">
        <input
          type="number"
          inputMode="decimal"
          step="any"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full rounded-lg bg-black/40 border border-white/15 px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none font-mono pr-12"
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-white/40 pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
      {hint && <div className="text-[10px] text-white/30 mt-1">{hint}</div>}
    </div>
  );
}
