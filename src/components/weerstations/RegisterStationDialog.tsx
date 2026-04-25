'use client';

import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { useRegisterStation } from '@/hooks/use-physical-stations';
import { useParcels } from '@/hooks/use-data';

/**
 * Register-a-new-station modal. Mirrors the form on the settings page but
 * rendered as a dialog — triggered from the Weerstations page header action.
 */
export function RegisterStationDialog({ onClose }: { onClose: () => void }) {
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
      /* error is shown inline */
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-slate-950 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 h-7 w-7 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/5 flex items-center justify-center transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <h2 className="text-lg font-bold text-white">Nieuw weerstation</h2>
            <p className="text-xs text-white/50 mt-0.5">
              Registreer je TTN-device zodat CropNode de uplinks kan verwerken.
            </p>
          </div>

          <Field label="Device ID" hint="TTN device identifier, bv. wsc2-kapelle1">
            <input
              type="text"
              required
              value={deviceId}
              onChange={e => setDeviceId(e.target.value)}
              placeholder="wsc2-kapelle1"
              className="w-full rounded-lg bg-black/40 border border-white/15 px-3 py-2 text-sm text-white placeholder:text-white/25 focus:border-emerald-500/50 focus:outline-none font-mono"
            />
          </Field>

          <Field label="DevEUI" hint="16 hex-tekens, exact zoals in TTN">
            <input
              type="text"
              required
              value={devEui}
              onChange={e => setDevEui(e.target.value.toUpperCase())}
              placeholder="A840416C95611BAD"
              maxLength={16}
              pattern="[A-Fa-f0-9]{16}"
              className="w-full rounded-lg bg-black/40 border border-white/15 px-3 py-2 text-sm text-white placeholder:text-white/25 focus:border-emerald-500/50 focus:outline-none font-mono"
            />
          </Field>

          <Field label="Application ID">
            <input
              type="text"
              required
              value={applicationId}
              onChange={e => setApplicationId(e.target.value)}
              className="w-full rounded-lg bg-black/40 border border-white/15 px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none font-mono"
            />
          </Field>

          <Field label="Label (optioneel)">
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="Kapelle perceel 1"
              className="w-full rounded-lg bg-black/40 border border-white/15 px-3 py-2 text-sm text-white placeholder:text-white/25 focus:border-emerald-500/50 focus:outline-none"
            />
          </Field>

          <Field label="Perceel (optioneel)" hint="Koppel voor automatische locatie + forecast">
            <ParcelSelect value={parcelId} onChange={setParcelId} />
          </Field>

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
      </div>
    </div>
  );
}

function Field({
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

function ParcelSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { data: subParcels, isLoading } = useParcels();

  if (isLoading) {
    return (
      <select
        disabled
        className="w-full rounded-lg bg-black/40 border border-white/15 px-3 py-2 text-sm text-white/40"
      >
        <option>Laden…</option>
      </select>
    );
  }

  type SubParcel = NonNullable<typeof subParcels>[number];
  const groups = new Map<string, { parentName: string; subs: SubParcel[] }>();
  for (const sp of subParcels ?? []) {
    const parentId = sp.parcelId ?? sp.id;
    const parentName = sp.parcelName ?? sp.name ?? 'Onbekend perceel';
    if (!groups.has(parentId)) groups.set(parentId, { parentName, subs: [] });
    groups.get(parentId)!.subs.push(sp);
  }
  const sortedGroups = Array.from(groups.entries()).sort((a, b) =>
    a[1].parentName.localeCompare(b[1].parentName, 'nl')
  );

  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full rounded-lg bg-black/40 border border-white/15 px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
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
            const text =
              parts.length > 0 ? `${group.parentName} — ${parts.join(' · ')}` : group.parentName;
            return (
              <option key={sub.id} value={parentId}>
                {text}
              </option>
            );
          })}
        </optgroup>
      ))}
    </select>
  );
}
