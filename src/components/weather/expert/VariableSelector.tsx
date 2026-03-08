'use client';

import { cn } from '@/lib/utils';

export type WeatherVariable = 'temperature_c' | 'precipitation_mm' | 'wind_speed_ms' | 'humidity_pct';

const VARIABLES: { key: WeatherVariable; label: string; unit: string }[] = [
  { key: 'temperature_c', label: 'Temperatuur', unit: '°C' },
  { key: 'precipitation_mm', label: 'Neerslag', unit: 'mm' },
  { key: 'wind_speed_ms', label: 'Wind', unit: 'm/s' },
  { key: 'humidity_pct', label: 'Luchtvochtigheid', unit: '%' },
];

interface VariableSelectorProps {
  selected: WeatherVariable;
  onChange: (variable: WeatherVariable) => void;
}

export function VariableSelector({ selected, onChange }: VariableSelectorProps) {
  return (
    <div className="flex gap-1 flex-wrap">
      {VARIABLES.map((v) => (
        <button
          key={v.key}
          onClick={() => onChange(v.key)}
          className={cn(
            'px-3 py-1.5 rounded-full text-xs font-bold transition-all',
            selected === v.key
              ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30'
              : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60'
          )}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

export function getVariableLabel(variable: WeatherVariable): string {
  return VARIABLES.find((v) => v.key === variable)?.label ?? variable;
}

export function getVariableUnit(variable: WeatherVariable): string {
  return VARIABLES.find((v) => v.key === variable)?.unit ?? '';
}
