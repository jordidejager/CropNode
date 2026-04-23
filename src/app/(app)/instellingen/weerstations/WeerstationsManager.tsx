'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Radio, Plus, ArrowLeft, Loader2, ChevronRight, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  usePhysicalStations,
  useRegisterStation,
  useDeleteStation,
  useUpdateStation,
  type PhysicalStation,
} from '@/hooks/use-physical-stations';
import { useParcels } from '@/hooks/use-data';
import { StationHistoryChart } from '@/components/weather/StationHistoryChart';

export function WeerstationsManager() {
  const [showForm, setShowForm] = useState(false);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const { data: stations, isLoading } = usePhysicalStations();

  const selectedStation = stations?.find(s => s.id === selectedStationId) ?? null;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/instellingen"
          className="h-9 w-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:text-white/90 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="h-10 w-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
          <Radio className="h-5 w-5 text-emerald-400" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-white/90">Eigen weerstations</h1>
          <p className="text-xs text-white/40">
            LoRaWAN-sensoren gekoppeld via The Things Network
          </p>
        </div>
        {!showForm && !selectedStation && (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 transition-colors px-3 py-2 text-sm font-semibold"
          >
            <Plus className="h-4 w-4" />
            Station toevoegen
          </button>
        )}
      </div>

      {showForm ? (
        <RegisterForm onClose={() => setShowForm(false)} />
      ) : selectedStation ? (
        <StationDetail
          station={selectedStation}
          onClose={() => setSelectedStationId(null)}
        />
      ) : isLoading ? (
        <div className="text-sm text-white/40">Laden…</div>
      ) : !stations || stations.length === 0 ? (
        <EmptyState onAdd={() => setShowForm(true)} />
      ) : (
        <div className="space-y-3">
          {stations.map(station => (
            <StationRow
              key={station.id}
              station={station}
              onClick={() => setSelectedStationId(station.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Empty state ----

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
      <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
        <Radio className="h-6 w-6 text-emerald-400" />
      </div>
      <h2 className="text-base font-bold text-white mb-1.5">Nog geen weerstations</h2>
      <p className="text-sm text-white/50 max-w-md mx-auto mb-5">
        Registreer je Dragino WSC2 (of ander LoRaWAN-station) dat via The Things
        Network data verstuurt. Na registratie configureer je in TTN een webhook
        naar CropNode en verschijnen metingen automatisch.
      </p>
      <button
        onClick={onAdd}
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30 transition-colors px-4 py-2 text-sm font-semibold"
      >
        <Plus className="h-4 w-4" />
        Eerste station toevoegen
      </button>

      <details className="mt-6 text-left text-xs text-white/50 max-w-md mx-auto group">
        <summary className="cursor-pointer hover:text-white/70 font-semibold">
          Hoe configureer ik de TTN webhook?
        </summary>
        <div className="mt-3 space-y-2 rounded-lg bg-black/30 border border-white/10 p-4 font-mono text-[11px] leading-relaxed text-white/70">
          <div>
            1. Voeg hier eerst je station toe (Device ID + DevEUI).
          </div>
          <div>
            2. Ga in TTN Console naar je applicatie → Integrations → Webhooks → Add webhook → Custom.
          </div>
          <div>3. Base URL: <span className="text-emerald-400">https://cropnode.vercel.app</span></div>
          <div>4. Uplink message path: <span className="text-emerald-400">/api/ttn/uplink</span></div>
          <div>
            5. Headers → Authorization: <span className="text-emerald-400">Bearer &lt;TTN_WEBHOOK_SECRET&gt;</span>
          </div>
          <div className="text-amber-300/90">
            Vraag jordi voor de geldige TTN_WEBHOOK_SECRET waarde.
          </div>
        </div>
      </details>
    </div>
  );
}

// ---- Station list row ----

function StationRow({
  station,
  onClick,
}: {
  station: PhysicalStation;
  onClick: () => void;
}) {
  const age = station.last_seen_at
    ? formatAgeShort(Date.now() - new Date(station.last_seen_at).getTime())
    : null;
  const isStale =
    !station.last_seen_at ||
    Date.now() - new Date(station.last_seen_at).getTime() > 60 * 60 * 1000;

  return (
    <button
      onClick={onClick}
      className="w-full rounded-2xl border border-white/10 bg-white/5 hover:bg-white/[0.08] transition-colors p-4 text-left flex items-center gap-3"
    >
      <div
        className={cn(
          'h-10 w-10 rounded-xl flex items-center justify-center shrink-0',
          isStale ? 'bg-amber-500/15' : 'bg-emerald-500/15'
        )}
      >
        <Radio
          className={cn('h-5 w-5', isStale ? 'text-amber-400' : 'text-emerald-400')}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-white truncate">
          {station.label || station.device_id}
        </div>
        <div className="text-[11px] text-white/40 truncate mt-0.5 font-mono">
          {station.device_id}
          {station.parcels?.name && ` · ${station.parcels.name}`}
        </div>
      </div>
      <div className="text-right text-[11px] text-white/50">
        {age ? (
          <span
            className={cn(
              'inline-flex items-center gap-1',
              isStale ? 'text-amber-400' : 'text-emerald-400'
            )}
          >
            {isStale ? (
              <AlertCircle className="h-3 w-3" />
            ) : (
              <CheckCircle2 className="h-3 w-3" />
            )}
            {age}
          </span>
        ) : (
          <span className="text-white/30">geen data</span>
        )}
      </div>
      <ChevronRight className="h-4 w-4 text-white/30" />
    </button>
  );
}

// ---- Register form ----

function RegisterForm({ onClose }: { onClose: () => void }) {
  const [deviceId, setDeviceId] = useState('');
  const [devEui, setDevEui] = useState('');
  const [applicationId, setApplicationId] = useState('cropnode-weerstation');
  const [label, setLabel] = useState('');
  const [parcelId, setParcelId] = useState('');

  const register = useRegisterStation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await register.mutateAsync({
        deviceId: deviceId.trim(),
        devEui: devEui.trim().toUpperCase(),
        applicationId: applicationId.trim(),
        label: label.trim() || undefined,
        parcelId: parcelId || undefined,
      });
      onClose();
    } catch {
      /* error state is displayed below */
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4"
    >
      <h2 className="text-base font-bold text-white">Nieuw weerstation</h2>

      <FormField label="Device ID" hint="TTN device identifier, bijvoorbeeld wsc2-kapelle1">
        <input
          type="text"
          required
          value={deviceId}
          onChange={e => setDeviceId(e.target.value)}
          placeholder="wsc2-kapelle1"
          className="w-full rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-sm text-white placeholder:text-white/25 focus:border-emerald-500/50 focus:outline-none font-mono"
        />
      </FormField>

      <FormField label="DevEUI" hint="16 hex-tekens, exact zoals in TTN">
        <input
          type="text"
          required
          value={devEui}
          onChange={e => setDevEui(e.target.value.toUpperCase())}
          placeholder="A840416C95611BAD"
          maxLength={16}
          pattern="[A-Fa-f0-9]{16}"
          className="w-full rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-sm text-white placeholder:text-white/25 focus:border-emerald-500/50 focus:outline-none font-mono"
        />
      </FormField>

      <FormField label="Application ID" hint="De TTN application waar het device in zit">
        <input
          type="text"
          required
          value={applicationId}
          onChange={e => setApplicationId(e.target.value)}
          className="w-full rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-sm text-white placeholder:text-white/25 focus:border-emerald-500/50 focus:outline-none font-mono"
        />
      </FormField>

      <FormField label="Label (optioneel)" hint="Wordt overal in de app getoond">
        <input
          type="text"
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="Kapelle perceel 1"
          className="w-full rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-sm text-white placeholder:text-white/25 focus:border-emerald-500/50 focus:outline-none"
        />
      </FormField>

      <FormField label="Perceel (optioneel)" hint="Koppel direct aan een perceel om coördinaten te vullen">
        <ParcelSelect value={parcelId} onChange={setParcelId} />
      </FormField>

      {register.error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-300">
          {(register.error as Error).message}
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-lg bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 transition-colors px-4 py-2 text-sm font-semibold"
        >
          Annuleren
        </button>
        <button
          type="submit"
          disabled={register.isPending}
          className="flex-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50 transition-colors px-4 py-2 text-sm font-semibold flex items-center justify-center gap-2"
        >
          {register.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Toevoegen
        </button>
      </div>
    </form>
  );
}

// ---- Station detail view ----

function StationDetail({
  station,
  onClose,
}: {
  station: PhysicalStation;
  onClose: () => void;
}) {
  const update = useUpdateStation();
  const del = useDeleteStation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [label, setLabel] = useState(station.label ?? '');
  const [parcelId, setParcelId] = useState(station.parcel_id ?? '');
  const [active, setActive] = useState(station.active);

  const saveChanges = async () => {
    await update.mutateAsync({
      id: station.id,
      patch: {
        label: label.trim() || null,
        parcelId: parcelId || null,
        active,
      },
    });
  };

  return (
    <div className="space-y-4">
      <button
        onClick={onClose}
        className="inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors"
      >
        <ArrowLeft className="h-3 w-3" />
        Terug naar overzicht
      </button>

      {/* Info card */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-white/40 mb-1">
            Device ID
          </div>
          <div className="text-sm font-mono text-white">{station.device_id}</div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-white/40 mb-1">
            DevEUI
          </div>
          <div className="text-sm font-mono text-white">{station.dev_eui}</div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-white/40 mb-1">
            Laatste uplink
          </div>
          <div className="text-sm text-white">
            {station.last_seen_at
              ? new Date(station.last_seen_at).toLocaleString('nl-NL')
              : 'Nog geen data ontvangen'}
          </div>
        </div>

        <FormField label="Label">
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            className="w-full rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
          />
        </FormField>

        <FormField label="Gekoppeld perceel">
          <ParcelSelect value={parcelId} onChange={setParcelId} />
        </FormField>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={active}
            onChange={e => setActive(e.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-sm text-white/70">Actief</span>
        </label>

        <div className="flex gap-2 pt-2">
          <button
            onClick={saveChanges}
            disabled={update.isPending}
            className="flex-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50 transition-colors px-4 py-2 text-sm font-semibold flex items-center justify-center gap-2"
          >
            {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Opslaan
          </button>
          <button
            onClick={() => setConfirmDelete(v => !v)}
            className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 hover:bg-red-500/20 transition-colors px-3 py-2 text-sm font-semibold inline-flex items-center gap-1.5"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        {confirmDelete && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 space-y-2">
            <p className="text-xs text-red-200">
              Weet je zeker dat je dit station wilt verwijderen? Alle metingen
              worden ook verwijderd.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 rounded bg-white/10 text-white/70 px-3 py-1.5 text-xs font-semibold"
              >
                Annuleren
              </button>
              <button
                onClick={async () => {
                  await del.mutateAsync(station.id);
                  onClose();
                }}
                disabled={del.isPending}
                className="flex-1 rounded bg-red-500/40 text-red-100 hover:bg-red-500/60 disabled:opacity-50 transition-colors px-3 py-1.5 text-xs font-semibold"
              >
                {del.isPending ? 'Verwijderen…' : 'Verwijder definitief'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* History */}
      <StationHistoryChart stationId={station.id} />
    </div>
  );
}

// ---- Parcel select ----

/**
 * Dropdown that lists every sub-parcel the user has, grouped by parent parcel,
 * with the full identifying label "Parent — Block (Crop Variety)". The selected
 * value is the PARENT parcel id — that's what physical_weather_stations.parcel_id
 * references, and a weather station covers the whole parent plot, not a single
 * sub-parcel block.
 */
function ParcelSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data: subParcels, isLoading } = useParcels();

  if (isLoading) {
    return (
      <select disabled className="w-full rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-sm text-white/40">
        <option>Laden…</option>
      </select>
    );
  }

  // Group sub-parcels by parent parcel_id so the <optgroup> renders neatly.
  type SubParcel = NonNullable<typeof subParcels>[number];
  const groups = new Map<string, { parentName: string; subs: SubParcel[] }>();
  for (const sp of subParcels ?? []) {
    const parentId = sp.parcel_id ?? sp.id;
    const parentName = sp.parcel_name ?? sp.name ?? 'Onbekend perceel';
    if (!groups.has(parentId)) {
      groups.set(parentId, { parentName, subs: [] });
    }
    groups.get(parentId)!.subs.push(sp);
  }

  const sortedGroups = Array.from(groups.entries()).sort((a, b) =>
    a[1].parentName.localeCompare(b[1].parentName, 'nl')
  );

  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
    >
      <option value="">— Geen koppeling —</option>
      {sortedGroups.map(([parentId, group]) => (
        <optgroup key={parentId} label={group.parentName}>
          {group.subs.map(sub => {
            const parts: string[] = [];
            if (sub.name && sub.name !== group.parentName) parts.push(sub.name);
            const cropVariety = [sub.crop, sub.variety].filter(Boolean).join(' ');
            if (cropVariety) parts.push(cropVariety);
            if (sub.area) parts.push(`${sub.area.toFixed(2)} ha`);
            const label = parts.length > 0
              ? `${group.parentName} — ${parts.join(' · ')}`
              : group.parentName;
            return (
              <option key={sub.id} value={parentId}>
                {label}
              </option>
            );
          })}
        </optgroup>
      ))}
    </select>
  );
}

// ---- shared bits ----

function FormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs font-semibold text-white/70 mb-1">{label}</div>
      {children}
      {hint && <div className="text-[10px] text-white/40 mt-1">{hint}</div>}
    </div>
  );
}

function formatAgeShort(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'zojuist';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}u`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
