'use client';

import { useState, useEffect, useRef } from 'react';
import { Settings, Lock, MessageCircle, Droplets, Check } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { WorkScheduleSettings } from '@/components/urenregistratie/WorkScheduleSettings';
import { useUserSetting, useSetUserSetting } from '@/hooks/use-data';

export default function InstellingenPage() {
  const [showLocked, setShowLocked] = useState(false);

  // Spray minutes per hectare setting
  const { data: sprayMinSetting } = useUserSetting('spray_minutes_per_ha');
  const setSettingMutation = useSetUserSetting();
  const [sprayMin, setSprayMin] = useState<number>(30);
  const [spraySaved, setSpraySaved] = useState(false);
  const sprayTimeout = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (sprayMinSetting) setSprayMin(parseInt(sprayMinSetting) || 30);
  }, [sprayMinSetting]);

  const handleSprayMinChange = (val: number) => {
    setSprayMin(val);
    if (sprayTimeout.current) clearTimeout(sprayTimeout.current);
    sprayTimeout.current = setTimeout(() => {
      setSettingMutation.mutate({ key: 'spray_minutes_per_ha', value: String(val) });
      setSpraySaved(true);
      setTimeout(() => setSpraySaved(false), 2000);
    }, 1000);
  };

  useEffect(() => {
    setShowLocked(localStorage.getItem('cropnode:showLockedNotes') === 'true');
  }, []);

  const handleToggleLocked = (checked: boolean) => {
    setShowLocked(checked);
    localStorage.setItem('cropnode:showLockedNotes', String(checked));
  };

  return (
    <div className="max-w-2xl mx-auto pb-12">
      <div className="flex items-center gap-3 mb-8">
        <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
          <Settings className="h-5 w-5 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-white/90">Instellingen</h1>
          <p className="text-xs text-white/30">Beheer je account en voorkeuren</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Veldnotities privacy */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
          <div className="flex items-center gap-3 mb-4">
            <Lock className="h-4 w-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-white/80">Veldnotities Privacy</h2>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-white/60">Vergrendelde notities tonen</p>
              <p className="text-xs text-white/25 mt-0.5">
                Als dit uitstaat zijn vergrendelde notities nergens zichtbaar — niet in de lijst, kaart, archief of dashboard.
              </p>
            </div>
            <Switch
              checked={showLocked}
              onCheckedChange={handleToggleLocked}
            />
          </div>
        </div>

        {/* Werkschema */}
        <WorkScheduleSettings />

        {/* Spuituren instelling */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <Droplets className="h-4 w-4 text-blue-400" />
              <h2 className="text-sm font-semibold text-white/80">Spuituren berekening</h2>
            </div>
            {spraySaved && (
              <span className="flex items-center gap-1 text-xs text-emerald-400">
                <Check className="h-3 w-3" /> Opgeslagen
              </span>
            )}
          </div>
          <p className="text-xs text-white/30 mb-4">
            Bij elke bespuiting worden automatisch spuituren berekend per perceel op basis van het aantal hectares.
          </p>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min={5}
              max={120}
              step={5}
              value={sprayMin}
              onChange={(e) => handleSprayMinChange(Math.max(5, parseInt(e.target.value) || 30))}
              className="bg-white/5 border-white/10 text-white h-10 w-24 text-center"
            />
            <span className="text-sm text-white/50">minuten per hectare</span>
            <span className="text-xs text-white/25 ml-auto">
              bijv. 2 ha = {((sprayMin * 2) / 60).toFixed(1)} uur spuiten
            </span>
          </div>
        </div>

        {/* WhatsApp link */}
        <Link
          href="/instellingen/whatsapp"
          className="block rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 hover:bg-white/[0.04] transition-colors"
        >
          <div className="flex items-center gap-3">
            <MessageCircle className="h-4 w-4 text-emerald-400" />
            <div>
              <h2 className="text-sm font-semibold text-white/80">WhatsApp Koppeling</h2>
              <p className="text-xs text-white/25 mt-0.5">Beheer gekoppelde telefoonnummers</p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
