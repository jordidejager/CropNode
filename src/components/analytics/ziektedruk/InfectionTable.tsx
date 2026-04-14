'use client';

import { Fragment, useMemo, useState } from 'react';
import { format, differenceInHours } from 'date-fns';
import { nl } from 'date-fns/locale';
import { ChartCard } from '../shared/ChartCard';
import { TableProperties, ArrowUpDown, Cloud, ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type {
  InfectionPeriod,
  MillsSeverity,
  InfectionCoverage,
  CoverageStatus,
} from '@/lib/disease-models/types';

interface InfectionTableProps {
  infectionPeriods: InfectionPeriod[];
  infectionCoverage?: Record<string, InfectionCoverage>;
}

const SEVERITY_CONFIG: Record<MillsSeverity, { label: string; className: string }> = {
  none: { label: 'Geen', className: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
  light: { label: 'Licht', className: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
  moderate: { label: 'Matig', className: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  severe: { label: 'Zwaar', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
};

const COVERAGE_BADGE: Record<CoverageStatus, string> = {
  good: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  moderate: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  low: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  none: 'bg-red-500/10 text-red-400 border-red-500/20',
};

type SortField = 'date' | 'severity' | 'coverage';
type SortDir = 'asc' | 'desc';

function severityOrder(s: MillsSeverity): number {
  switch (s) {
    case 'severe': return 3;
    case 'moderate': return 2;
    case 'light': return 1;
    default: return 0;
  }
}

export function InfectionTable({ infectionPeriods, infectionCoverage }: InfectionTableProps) {
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const infections = useMemo(
    () => infectionPeriods.filter((ip) => ip.severity !== 'none'),
    [infectionPeriods]
  );

  const hasCoverage = infectionCoverage && Object.keys(infectionCoverage).length > 0;

  const sorted = useMemo(() => {
    const copy = [...infections];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'date':
          cmp = a.wetPeriodStart.localeCompare(b.wetPeriodStart);
          break;
        case 'severity':
          cmp = severityOrder(a.severity) - severityOrder(b.severity);
          break;
        case 'coverage':
          cmp = (infectionCoverage?.[a.wetPeriodStart]?.coverageAtInfection ?? -1) -
                (infectionCoverage?.[b.wetPeriodStart]?.coverageAtInfection ?? -1);
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [infections, sortField, sortDir, infectionCoverage]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const SortHeader = ({ field, children, className = '' }: { field: SortField; children: React.ReactNode; className?: string }) => (
    <th
      className={`px-3 py-2.5 text-left text-xs font-medium text-slate-400 cursor-pointer hover:text-slate-200 transition-colors select-none ${className}`}
      onClick={() => toggleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        <ArrowUpDown className={`size-3 ${sortField === field ? 'text-emerald-400' : 'text-slate-600'}`} />
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
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              <SortHeader field="date">Datum</SortHeader>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-400">Conditie</th>
              <SortHeader field="severity">Ernst</SortHeader>
              {hasCoverage && <SortHeader field="coverage">Dekking</SortHeader>}
              <th className="px-3 py-2.5 text-right text-xs font-medium text-slate-400 w-8" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((ip, i) => {
              const sevConfig = SEVERITY_CONFIG[ip.severity];
              const cov = infectionCoverage?.[ip.wetPeriodStart];
              const isExpanded = expandedRow === i;

              // Calculate hours between last spray and infection
              let sprayLag: string | null = null;
              if (cov?.lastSprayDate) {
                const hours = differenceInHours(
                  new Date(ip.wetPeriodStart),
                  new Date(cov.lastSprayDate)
                );
                if (hours < 24) {
                  sprayLag = `${hours}u na bespuiting`;
                } else {
                  sprayLag = `${Math.round(hours / 24)}d na bespuiting`;
                }
              }

              return (
                <Fragment key={i}>
                  <tr
                    className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors cursor-pointer"
                    onClick={() => setExpandedRow(isExpanded ? null : i)}
                  >
                    {/* Date */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-200">
                          {format(new Date(ip.wetPeriodStart), 'd MMM HH:mm', { locale: nl })}
                        </span>
                        {ip.isForecast && <Cloud className="size-3.5 text-blue-400" />}
                      </div>
                    </td>

                    {/* Condition (compact: duration + temp) */}
                    <td className="px-3 py-2.5">
                      <span className="text-xs text-slate-400">
                        {ip.durationHours}u · {ip.avgTemperature}°C
                      </span>
                    </td>

                    {/* Severity */}
                    <td className="px-3 py-2.5">
                      <Badge variant="outline" className={sevConfig.className}>{sevConfig.label}</Badge>
                    </td>

                    {/* Coverage */}
                    {hasCoverage && (
                      <td className="px-3 py-2.5">
                        {cov ? (
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={COVERAGE_BADGE[cov.coverageStatus]}>
                              {Math.round(cov.coverageAtInfection)}%
                            </Badge>
                            {sprayLag && (
                              <span className="text-[10px] text-slate-500">{sprayLag}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-slate-500">—</span>
                        )}
                      </td>
                    )}

                    {/* Expand arrow */}
                    <td className="px-3 py-2.5 text-right">
                      {isExpanded
                        ? <ChevronUp className="size-3.5 text-slate-500 inline" />
                        : <ChevronDown className="size-3.5 text-slate-500 inline" />}
                    </td>
                  </tr>

                  {/* Expanded detail row */}
                  {isExpanded && (
                    <tr className="border-b border-white/[0.03]">
                      <td colSpan={hasCoverage ? 5 : 4} className="px-3 py-3 bg-white/[0.01]">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                          <div>
                            <span className="text-slate-500">Natperiode</span>
                            <p className="text-slate-300 mt-0.5">
                              {format(new Date(ip.wetPeriodStart), 'd MMM HH:mm', { locale: nl })}
                              {' → '}
                              {format(new Date(ip.wetPeriodEnd), 'HH:mm', { locale: nl })}
                            </p>
                          </div>
                          <div>
                            <span className="text-slate-500">RIM-waarde</span>
                            <p className="text-slate-300 mt-0.5 tabular-nums">{ip.rimValue}</p>
                          </div>
                          <div>
                            <span className="text-slate-500">PAM bij infectie</span>
                            <p className="text-slate-300 mt-0.5">{Math.round(ip.pamAtEvent * 100)}%</p>
                          </div>
                          <div>
                            <span className="text-slate-500">Symptomen verwacht</span>
                            <p className="text-slate-300 mt-0.5">
                              {ip.expectedSymptomDate
                                ? format(new Date(ip.expectedSymptomDate + 'T12:00:00'), 'd MMMM yyyy', { locale: nl })
                                : '—'}
                            </p>
                          </div>
                          {cov?.lastSprayProduct && (
                            <div className="col-span-2">
                              <span className="text-slate-500">Laatste bespuiting</span>
                              <p className="text-slate-300 mt-0.5">
                                {cov.lastSprayProduct}
                                {cov.lastSprayDate && (
                                  <span className="text-slate-500 ml-1">
                                    — {format(new Date(cov.lastSprayDate), 'd MMM yyyy', { locale: nl })}
                                  </span>
                                )}
                              </p>
                            </div>
                          )}
                          {cov?.curativeWindowOpen && (
                            <div className="col-span-2">
                              <span className="text-amber-400">Curatief venster open</span>
                              <p className="text-amber-300 mt-0.5">
                                {cov.curativeRemainingDH} graaduren resterend
                              </p>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}

