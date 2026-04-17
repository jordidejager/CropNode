'use client';

import { useState, useEffect } from 'react';
import { Settings, Lock, MessageCircle, Clock, ArrowRight } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import Link from 'next/link';

export default function InstellingenPage() {
  const [showLocked, setShowLocked] = useState(false);

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

        {/* Uren-gerelateerde instellingen verhuisd naar /urenregistratie/beheer */}
        <Link
          href="/urenregistratie/beheer"
          className="block rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 hover:bg-white/[0.04] transition-colors"
        >
          <div className="flex items-center gap-3">
            <Clock className="h-4 w-4 text-emerald-400" />
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-white/80">Werkschema, taaktypes & spuituren</h2>
              <p className="text-xs text-white/40 mt-0.5">
                Werkrooster, uurtarieven en minuten per hectare bij bespuiting
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-white/40" />
          </div>
        </Link>

        {/* WhatsApp link */}
        <Link
          href="/instellingen/whatsapp"
          className="block rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 hover:bg-white/[0.04] transition-colors"
        >
          <div className="flex items-center gap-3">
            <MessageCircle className="h-4 w-4 text-emerald-400" />
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-white/80">WhatsApp Koppeling</h2>
              <p className="text-xs text-white/25 mt-0.5">Beheer gekoppelde telefoonnummers</p>
            </div>
            <ArrowRight className="h-4 w-4 text-white/40" />
          </div>
        </Link>
      </div>
    </div>
  );
}
