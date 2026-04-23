'use client';

import { Radio, Plus, Zap, Cloud, Shield, ChevronDown } from 'lucide-react';
import { useState } from 'react';

/**
 * Full-width empty state for the Weerstations page. Functions as a marketing
 * pitch for why a grower would install a CropNode station plus a clear
 * primary action.
 */
export function EmptyHero({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent p-8 md:p-10">
        {/* Ambient glow */}
        <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-emerald-500/15 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 h-40 w-40 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

        <div className="relative max-w-2xl">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 px-3 py-1 text-[11px] font-bold uppercase tracking-wider mb-4">
            <Zap className="h-3 w-3" />
            Nieuw in CropNode
          </div>
          <h2 className="text-3xl md:text-4xl font-black text-white mb-3 leading-tight">
            Meet het weer op je eigen perceel
          </h2>
          <p className="text-base text-white/70 leading-relaxed mb-6">
            Koppel een Dragino WSC2 of ander LoRaWAN-station via The Things
            Network. CropNode ontvangt live metingen, bouwt historie op en
            gebruikt deze data voor spuitvensters, infectiemodellen en
            forecast-verificatie.
          </p>

          <button
            onClick={onAdd}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white transition-colors px-5 py-3 text-sm font-bold shadow-[0_8px_24px_-8px_rgba(16,185,129,0.6)]"
          >
            <Plus className="h-4 w-4" />
            Eerste station toevoegen
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <FeatureCard
          icon={Radio}
          title="Live data"
          body="Elke 20 minuten een volledige meting: temp, RV, luchtdruk, neerslag, licht, accu en signaalsterkte."
        />
        <FeatureCard
          icon={Cloud}
          title="Slim vergeleken"
          body="Automatische kruisverwijzing met Open-Meteo en KNMI — zie hoe goed de forecast klopt met jouw eigen meting."
        />
        <FeatureCard
          icon={Shield}
          title="Spuitvenster + infectie"
          body="Echte temp en bladnat-index voeden Delta-T, Mills/RIMpro-berekeningen en nachtvorst-alerts."
        />
      </div>

      <SetupGuide />
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="h-9 w-9 rounded-xl bg-emerald-500/15 flex items-center justify-center mb-3">
        <Icon className="h-4 w-4 text-emerald-400" />
      </div>
      <div className="text-sm font-bold text-white mb-1.5">{title}</div>
      <p className="text-xs text-white/50 leading-relaxed">{body}</p>
    </div>
  );
}

function SetupGuide() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-white/[0.05] transition-colors"
      >
        <div>
          <div className="text-sm font-bold text-white">Setup: TTN webhook configureren</div>
          <p className="text-xs text-white/50 mt-0.5">
            Stappen om je station te koppelen aan CropNode
          </p>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-white/50 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-3 text-xs text-white/70">
          <ol className="list-decimal list-inside space-y-2 pl-2">
            <li>
              Registreer hier je station (Device ID + DevEUI uit The Things
              Network console).
            </li>
            <li>Ga in TTN naar je applicatie → <span className="text-white/90">Webhooks → + Add webhook → Custom</span>.</li>
            <li>
              Base URL: <code className="text-emerald-400 bg-black/30 px-1.5 py-0.5 rounded">https://cropnode.vercel.app</code>
            </li>
            <li>
              Uplink message path: <code className="text-emerald-400 bg-black/30 px-1.5 py-0.5 rounded">/api/ttn/uplink</code>
            </li>
            <li>
              Additional header → <code className="text-emerald-400 bg-black/30 px-1.5 py-0.5 rounded">Authorization</code> met waarde{' '}
              <code className="text-emerald-400 bg-black/30 px-1.5 py-0.5 rounded">Bearer &lt;jouw TTN_WEBHOOK_SECRET&gt;</code>
            </li>
            <li>
              Activeer alleen <span className="text-white/90">Uplink message</span> onder Enabled event types.
            </li>
          </ol>
          <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3 text-amber-300 text-[11px]">
            Bij de eerstvolgende 20-minuten uplink verschijnt de data
            automatisch. Duurt het langer? Check je TTN webhook-log voor errors.
          </div>
        </div>
      )}
    </div>
  );
}
