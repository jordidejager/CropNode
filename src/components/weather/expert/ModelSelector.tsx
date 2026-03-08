'use client';

import { cn } from '@/lib/utils';

export type EnsembleModel = 'ecmwf_ifs' | 'gfs';

const MODELS: { key: EnsembleModel; label: string; members: number }[] = [
  { key: 'ecmwf_ifs', label: 'ECMWF', members: 51 },
  { key: 'gfs', label: 'GFS', members: 31 },
];

interface ModelSelectorProps {
  selected: EnsembleModel;
  onChange: (model: EnsembleModel) => void;
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
          <span className="ml-1 opacity-50">({m.members})</span>
        </button>
      ))}
    </div>
  );
}
