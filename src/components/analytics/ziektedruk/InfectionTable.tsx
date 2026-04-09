'use client';

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { ChartCard } from '../shared/ChartCard';
import { TableProperties, ArrowUpDown, Cloud } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { InfectionPeriod, MillsSeverity } from '@/lib/disease-models/types';

interface InfectionTableProps {
  infectionPeriods: InfectionPeriod[];
}

const SEVERITY_CONFIG: Record<
  MillsSeverity,
  { label: string; className: string }
> = {
  none: { label: 'Geen', className: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
  light: { label: 'Licht', className: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
  moderate: { label: 'Matig', className: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  severe: { label: 'Zwaar', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
};

type SortField = 'date' | 'duration' | 'severity' | 'rim';
type SortDir = 'asc' | 'desc';

function severityOrder(s: MillsSeverity): number {
  switch (s) {
    case 'severe': return 3;
    case 'moderate': return 2;
    case 'light': return 1;
    default: return 0;
  }
}

export function InfectionTable({ infectionPeriods }: InfectionTableProps) {
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Only show periods with actual infections
  const infections = useMemo(
    () => infectionPeriods.filter((ip) => ip.severity !== 'none'),
    [infectionPeriods]
  );

  const sorted = useMemo(() => {
    const copy = [...infections];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'date':
          cmp = a.wetPeriodStart.localeCompare(b.wetPeriodStart);
          break;
        case 'duration':
          cmp = a.durationHours - b.durationHours;
          break;
        case 'severity':
          cmp = severityOrder(a.severity) - severityOrder(b.severity);
          break;
        case 'rim':
          cmp = a.rimValue - b.rimValue;
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [infections, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const SortHeader = ({
    field,
    children,
    className = '',
  }: {
    field: SortField;
    children: React.ReactNode;
    className?: string;
  }) => (
    <th
      className={`px-3 py-2.5 text-left text-xs font-medium text-slate-400 cursor-pointer hover:text-slate-200 transition-colors select-none ${className}`}
      onClick={() => toggleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        <ArrowUpDown
          className={`size-3 ${sortField === field ? 'text-emerald-400' : 'text-slate-600'}`}
        />
      </div>
    </th>
  );

  return (
    <ChartCard
      title="Infectieperiodes"
      isEmpty={infections.length === 0}
      emptyIcon={TableProperties}
      emptyTitle="Geen infecties gedetecteerd"
      emptyDescription="Er zijn nog geen infectieperiodes gevonden dit seizoen."
    >
      <div className="overflow-x-auto -mx-5 px-5">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-white/5">
              <SortHeader field="date">Datum</SortHeader>
              <SortHeader field="duration">Duur (uur)</SortHeader>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-400">
                Gem. temp
              </th>
              <SortHeader field="severity">Ernst</SortHeader>
              <SortHeader field="rim">RIM</SortHeader>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-400">
                PAM
              </th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-400">
                Symptomen verwacht
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((ip, i) => {
              const config = SEVERITY_CONFIG[ip.severity];
              return (
                <tr
                  key={i}
                  className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-200">
                        {format(
                          new Date(ip.wetPeriodStart),
                          'd MMM yyyy HH:mm',
                          { locale: nl }
                        )}
                      </span>
                      {ip.isForecast && (
                        <Cloud className="size-3.5 text-blue-400" />
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-sm text-slate-300">
                    {ip.durationHours}
                  </td>
                  <td className="px-3 py-2.5 text-sm text-slate-300">
                    {ip.avgTemperature}°C
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge
                      variant="outline"
                      className={config.className}
                    >
                      {config.label}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 text-sm text-slate-300 tabular-nums">
                    {ip.rimValue}
                  </td>
                  <td className="px-3 py-2.5 text-sm text-slate-300">
                    {Math.round(ip.pamAtEvent * 100)}%
                  </td>
                  <td className="px-3 py-2.5 text-sm text-slate-400">
                    {ip.expectedSymptomDate
                      ? format(
                          new Date(ip.expectedSymptomDate + 'T12:00:00'),
                          'd MMMM yyyy',
                          { locale: nl }
                        )
                      : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}
