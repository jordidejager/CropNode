'use client';

import { Apple, Plus, ToggleLeft, ToggleRight } from 'lucide-react';

interface ProductieHeaderProps {
  onAddHistorical: () => void;
  perHectare: boolean;
  onTogglePerHectare: () => void;
}

export function ProductieHeader({ onAddHistorical, perHectare, onTogglePerHectare }: ProductieHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/10">
          <Apple className="size-5 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Productie-overzicht</h1>
          <p className="text-xs text-slate-500">Oogstopbrengst door de jaren heen</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {/* Toggle: Totaal / Per hectare */}
        <button
          onClick={onTogglePerHectare}
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10 transition-colors"
        >
          {perHectare ? <ToggleRight className="size-4 text-emerald-400" /> : <ToggleLeft className="size-4 text-slate-500" />}
          {perHectare ? 'Per hectare' : 'Totaal'}
        </button>
        {/* Add historical data button */}
        <button
          onClick={onAddHistorical}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition-colors"
        >
          <Plus className="size-4" />
          Historische data
        </button>
      </div>
    </div>
  );
}
