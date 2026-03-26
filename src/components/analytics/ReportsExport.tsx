'use client';

import { FileText, FileSpreadsheet, Download, Award } from 'lucide-react';
import { type AnalyticsData } from '@/lib/analytics/types';
import { generateCSV } from '@/lib/analytics/calculations';

interface ReportsExportProps { data: AnalyticsData; harvestYear: number; }

export function ReportsExport({ data, harvestYear }: ReportsExportProps) {
  const handleCSVExport = () => {
    const csv = generateCSV(data.registrations, data.harvests, harvestYear);
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cropnode-analytics-oogst-${harvestYear}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const cards = [
    { icon: FileText, title: 'Oogstjaarrapport PDF', desc: 'Compleet overzicht van alle KPI\'s, grafieken en perceelsanalyses.', action: null, label: 'Binnenkort beschikbaar', disabled: true },
    { icon: Award, title: 'Certificeringsrapport', desc: 'Data-overzicht voor VVAK, GlobalGAP of PlanetProof.', action: null, label: 'Binnenkort beschikbaar', disabled: true },
    { icon: FileSpreadsheet, title: 'Coöperatie-export', desc: 'Geformateerd Excel-bestand voor aanlevering aan je coöperatie.', action: null, label: 'Binnenkort beschikbaar', disabled: true },
    { icon: Download, title: 'Ruwe data CSV', desc: 'Alle registraties en oogstdata als CSV.', action: handleCSVExport, label: 'Download CSV', disabled: data.registrations.length === 0 && data.harvests.length === 0 },
  ];

  return (
    <section className="space-y-6">
      <h2 className="text-lg font-semibold text-slate-100">Rapportages & Export</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.title} className="flex flex-col rounded-xl border border-white/5 bg-white/[0.02] p-5 transition-colors hover:border-white/10">
            <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-500/10 mb-3">
              <c.icon className="size-5 text-emerald-400" />
            </div>
            <h3 className="text-sm font-medium text-slate-200 mb-1">{c.title}</h3>
            <p className="text-xs text-slate-500 mb-4 flex-1">{c.desc}</p>
            <button onClick={c.action || undefined} disabled={c.disabled}
              className={`w-full rounded-lg px-3 py-2 text-xs font-medium transition-colors ${c.disabled ? 'bg-white/5 text-slate-600 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-500'}`}>
              {c.label}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
