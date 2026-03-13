'use client';

import { cn } from '@/lib/utils';

export type EnsembleModel = 'ecmwf_ifs' | 'gfs';
export type EnsembleViewMode = 'combined' | 'ecmwf_ifs' | 'gfs';

const MODELS: { key: EnsembleViewMode; label: string; sub?: string }[] = [
  { key: 'combined', label: 'Gecombineerd', sub: '82' },
  { key: 'ecmwf_ifs', label: 'ECMWF', sub: '51' },
  { key: 'gfs', label: 'GFS', sub: '31' },
];

interface ModelSelectorProps {
  selected: EnsembleViewMode;
  onChange: (model: EnsembleViewMode) => void;
}

export function ModelSelector({ selected, onChange }: ModelSelectorProps) {
  return (
    <div className="flex gap-1">
      {MODELS.map((m) => (
        <button
          key={m.key}
          onClick={() => onChange(m.key)}
          className={cn(
            'px-3 py-1.5 rounded-full text-xs font-bold transition-all',
            selected === m.key
              ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30'
              : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60'
          )}
        >
          {m.label}
          {m.sub && <span className="ml-1 opacity-50">({m.sub})</span>}
        </button>
      ))}
    </div>
  );
}
