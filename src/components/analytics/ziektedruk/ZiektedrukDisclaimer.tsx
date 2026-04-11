'use client';

import { useState, useEffect } from 'react';
import { Info, X } from 'lucide-react';

const STORAGE_KEY = 'ziektedruk_disclaimer_dismissed';

export function ZiektedrukDisclaimer() {
  const [dismissed, setDismissed] = useState(true); // default hidden to avoid flash

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    setDismissed(stored === 'true');
  }, []);

  if (dismissed) return null;

  return (
    <div className="relative flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
      <Info className="mt-0.5 size-4 shrink-0 text-amber-400" />
      <div className="flex-1">
        <p className="text-sm text-amber-200/90">
          Ziektedruk is een experimentele indicator gebaseerd op gepubliceerde
          wetenschappelijke modellen en weerdata. De restdekkingsberekening is
          een schatting op basis van gemiddelde producteigenschappen, temperatuur
          en neerslag. Gebruik het als aanvulling op, niet als vervanging van,
          het advies van je gewasbeschermingsadviseur.
        </p>
      </div>
      <button
        onClick={() => {
          setDismissed(true);
          localStorage.setItem(STORAGE_KEY, 'true');
        }}
        className="mt-0.5 shrink-0 rounded-lg p-1 text-amber-400/60 hover:bg-amber-500/10 hover:text-amber-400 transition-colors"
        aria-label="Sluiten"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
