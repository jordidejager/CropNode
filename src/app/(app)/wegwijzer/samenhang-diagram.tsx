'use client';

import {
  Home,
  Map,
  ClipboardList,
  Database,
  Sprout,
  Apple,
  Thermometer,
  BarChart3,
  Truck,
  Users,
  BookOpen,
  Library,
  CloudSun,
} from 'lucide-react';

interface DiagramNode {
  id: string;
  label: string;
  icon: any;
  color: string;
  group: string;
}

const nodes: DiagramNode[] = [
  { id: 'percelen', label: 'Percelen', icon: Map, color: 'emerald', group: 'basis' },
  { id: 'slimme-invoer', label: 'Slimme Invoer', icon: Home, color: 'emerald', group: 'invoer' },
  { id: 'db-gwb', label: 'Database GWB', icon: Database, color: 'sky', group: 'data' },
  { id: 'db-mest', label: 'Database Meststoffen', icon: Sprout, color: 'sky', group: 'data' },
  { id: 'spuitschrift', label: 'Spuitschrift', icon: ClipboardList, color: 'violet', group: 'output' },
  { id: 'tijdlijn', label: 'Tijdlijn', icon: ClipboardList, color: 'violet', group: 'output' },
  { id: 'seizoenswijzer', label: 'Seizoenswijzer', icon: BookOpen, color: 'amber', group: 'advies' },
  { id: 'kennisbank', label: 'Kennisbank', icon: Library, color: 'amber', group: 'advies' },
  { id: 'veldklimaat', label: 'Veldklimaat', icon: CloudSun, color: 'amber', group: 'advies' },
  { id: 'oogst', label: 'Oogstregistratie', icon: Apple, color: 'orange', group: 'oogst' },
  { id: 'koelcel', label: 'Koelcelbeheer', icon: Thermometer, color: 'orange', group: 'oogst' },
  { id: 'analyse', label: 'Perceelanalyse', icon: BarChart3, color: 'orange', group: 'oogst' },
  { id: 'aflevering', label: 'Afleveroverzicht', icon: Truck, color: 'orange', group: 'oogst' },
  { id: 'team', label: 'Team & Tasks', icon: Users, color: 'pink', group: 'team' },
];

interface FlowConnection {
  from: string;
  to: string;
  label?: string;
}

const connections: FlowConnection[] = [
  { from: 'percelen', to: 'slimme-invoer', label: 'perceelmatching' },
  { from: 'db-gwb', to: 'slimme-invoer', label: 'validatie' },
  { from: 'db-mest', to: 'slimme-invoer', label: 'validatie' },
  { from: 'slimme-invoer', to: 'spuitschrift', label: 'registratie' },
  { from: 'slimme-invoer', to: 'tijdlijn', label: 'registratie' },
  { from: 'seizoenswijzer', to: 'slimme-invoer', label: 'advies' },
  { from: 'kennisbank', to: 'seizoenswijzer' },
  { from: 'veldklimaat', to: 'seizoenswijzer' },
  { from: 'oogst', to: 'koelcel', label: 'inslag' },
  { from: 'koelcel', to: 'aflevering', label: 'uitslag' },
  { from: 'oogst', to: 'analyse' },
  { from: 'spuitschrift', to: 'analyse', label: 'input x output' },
  { from: 'percelen', to: 'team' },
];

const colorMap: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', glow: 'shadow-emerald-500/10' },
  sky: { bg: 'bg-sky-500/10', border: 'border-sky-500/30', text: 'text-sky-400', glow: 'shadow-sky-500/10' },
  violet: { bg: 'bg-violet-500/10', border: 'border-violet-500/30', text: 'text-violet-400', glow: 'shadow-violet-500/10' },
  amber: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', glow: 'shadow-amber-500/10' },
  orange: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400', glow: 'shadow-orange-500/10' },
  pink: { bg: 'bg-pink-500/10', border: 'border-pink-500/30', text: 'text-pink-400', glow: 'shadow-pink-500/10' },
};

function DiagramNodeCard({ node }: { node: DiagramNode }) {
  const colors = colorMap[node.color];
  const Icon = node.icon;

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${colors.bg} border ${colors.border} shadow-lg ${colors.glow}`}>
      <Icon className={`size-4 shrink-0 ${colors.text}`} />
      <span className={`text-xs font-bold ${colors.text} whitespace-nowrap`}>{node.label}</span>
    </div>
  );
}

export function SamenhangDiagram() {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 md:p-8 overflow-x-auto">
      {/* Responsive flow diagram using CSS grid */}
      <div className="min-w-[600px]">
        {/* Row 1: Data sources */}
        <div className="flex items-center justify-center gap-3 mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 w-20 text-right shrink-0">Data</span>
          <div className="flex items-center gap-3 flex-wrap justify-center">
            <DiagramNodeCard node={nodes.find(n => n.id === 'percelen')!} />
            <DiagramNodeCard node={nodes.find(n => n.id === 'db-gwb')!} />
            <DiagramNodeCard node={nodes.find(n => n.id === 'db-mest')!} />
          </div>
        </div>

        {/* Arrow down */}
        <div className="flex justify-center my-1">
          <div className="flex flex-col items-center">
            <div className="w-px h-6 bg-gradient-to-b from-emerald-500/40 to-emerald-500/20" />
            <svg width="12" height="8" viewBox="0 0 12 8" className="text-emerald-500/40">
              <path d="M6 8L0 0h12z" fill="currentColor" />
            </svg>
            <span className="text-[9px] text-slate-600 font-medium mt-0.5">perceelmatching & validatie</span>
          </div>
        </div>

        {/* Row 2: Central hub */}
        <div className="flex items-center justify-center gap-3 my-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 w-20 text-right shrink-0">Invoer</span>
          <div className="relative">
            <div className="absolute inset-0 bg-emerald-500/5 rounded-2xl blur-xl" />
            <div className="relative flex items-center gap-2 px-5 py-3 rounded-2xl bg-emerald-500/15 border-2 border-emerald-500/40 shadow-lg shadow-emerald-500/10">
              <Home className="size-5 text-emerald-400" />
              <span className="text-sm font-black text-emerald-400">Slimme Invoer</span>
            </div>
          </div>
        </div>

        {/* Arrow down (splits) */}
        <div className="flex justify-center my-1">
          <div className="flex flex-col items-center">
            <div className="w-px h-6 bg-gradient-to-b from-emerald-500/30 to-violet-500/30" />
            <svg width="12" height="8" viewBox="0 0 12 8" className="text-violet-500/40">
              <path d="M6 8L0 0h12z" fill="currentColor" />
            </svg>
            <span className="text-[9px] text-slate-600 font-medium mt-0.5">registratie</span>
          </div>
        </div>

        {/* Row 3: Output */}
        <div className="flex items-center justify-center gap-3 my-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 w-20 text-right shrink-0">Output</span>
          <div className="flex items-center gap-3">
            <DiagramNodeCard node={nodes.find(n => n.id === 'spuitschrift')!} />
            <DiagramNodeCard node={nodes.find(n => n.id === 'tijdlijn')!} />
          </div>
        </div>

        {/* Advies row */}
        <div className="my-6 flex items-center justify-center gap-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 w-20 text-right shrink-0">Advies</span>
          <div className="flex items-center gap-2">
            <DiagramNodeCard node={nodes.find(n => n.id === 'veldklimaat')!} />
            <svg width="20" height="12" viewBox="0 0 20 12" className="text-amber-500/40 shrink-0">
              <path d="M0 6h14M14 6l-4-4M14 6l-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </svg>
            <DiagramNodeCard node={nodes.find(n => n.id === 'seizoenswijzer')!} />
            <svg width="20" height="12" viewBox="0 0 20 12" className="text-amber-500/40 shrink-0">
              <path d="M0 6h14M14 6l-4-4M14 6l-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </svg>
            <span className="text-[9px] text-slate-600 font-medium">advies naar Slimme Invoer</span>
          </div>
        </div>

        {/* Divider */}
        <div className="my-6 border-t border-white/5 border-dashed" />

        {/* Oogst flow */}
        <div className="space-y-1">
          <div className="flex items-center justify-center gap-3 my-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 w-20 text-right shrink-0">Oogst</span>
            <div className="flex items-center gap-2 flex-wrap justify-center">
              <DiagramNodeCard node={nodes.find(n => n.id === 'oogst')!} />
              <svg width="20" height="12" viewBox="0 0 20 12" className="text-orange-500/40 shrink-0">
                <path d="M0 6h14M14 6l-4-4M14 6l-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" />
              </svg>
              <DiagramNodeCard node={nodes.find(n => n.id === 'koelcel')!} />
              <svg width="20" height="12" viewBox="0 0 20 12" className="text-orange-500/40 shrink-0">
                <path d="M0 6h14M14 6l-4-4M14 6l-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" />
              </svg>
              <DiagramNodeCard node={nodes.find(n => n.id === 'aflevering')!} />
            </div>
          </div>

          {/* Arrow down from oogst */}
          <div className="flex justify-center my-1">
            <div className="flex flex-col items-center">
              <div className="w-px h-6 bg-gradient-to-b from-orange-500/30 to-orange-500/10" />
              <svg width="12" height="8" viewBox="0 0 12 8" className="text-orange-500/30">
                <path d="M6 8L0 0h12z" fill="currentColor" />
              </svg>
            </div>
          </div>

          {/* Analyse */}
          <div className="flex items-center justify-center gap-3 my-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 w-20 text-right shrink-0">Analyse</span>
            <div className="relative">
              <div className="absolute inset-0 bg-orange-500/5 rounded-2xl blur-xl" />
              <div className="relative flex items-center gap-2 px-5 py-3 rounded-2xl bg-orange-500/15 border-2 border-orange-500/30">
                <BarChart3 className="size-5 text-orange-400" />
                <div>
                  <span className="text-sm font-black text-orange-400">Perceelanalyse</span>
                  <span className="text-[9px] text-orange-400/60 block">input x output</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="my-6 border-t border-white/5 border-dashed" />

        {/* Team */}
        <div className="flex items-center justify-center gap-3 my-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 w-20 text-right shrink-0">Team</span>
          <div className="flex items-center gap-2">
            <DiagramNodeCard node={nodes.find(n => n.id === 'team')!} />
            <span className="text-[9px] text-slate-600 font-medium">gekoppeld aan Percelen, Crop Care & Harvest Hub</span>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-8 pt-4 border-t border-white/5 flex flex-wrap gap-4 justify-center">
        {[
          { color: 'emerald', label: 'Invoer & Basis' },
          { color: 'sky', label: 'Databases' },
          { color: 'violet', label: 'Registraties' },
          { color: 'amber', label: 'Advies & Kennis' },
          { color: 'orange', label: 'Oogst & Analyse' },
          { color: 'pink', label: 'Team' },
        ].map(({ color, label }) => {
          const colors = colorMap[color];
          return (
            <div key={color} className="flex items-center gap-1.5">
              <div className={`size-2.5 rounded-full ${colors.bg} border ${colors.border}`} />
              <span className="text-[10px] text-slate-500 font-medium">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
