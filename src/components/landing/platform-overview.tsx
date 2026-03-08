'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import {
  MessageSquareText,
  MapPin,
  Shield,
  Cloud,
  Apple,
  BookOpen,
  Users,
  Package,
  ArrowRight,
  Sparkles,
  Database,
  Zap,
} from 'lucide-react';

const modules = [
  {
    id: 'flow',
    icon: Sparkles,
    title: 'Slimme Invoer',
    color: 'emerald',
    description: 'Typ in natuurlijke taal — AI herkent alles',
    detail: 'Van spraak naar gevalideerde registratie in seconden. Multi-perceel, multi-product, met correctie-feedback.',
    metrics: [
      { label: 'Gemiddelde verwerkingstijd', value: '< 3s' },
      { label: 'Herkenningsnauwkeurigheid', value: '99.2%' },
      { label: 'Ondersteunde talen', value: 'NL / EN' },
    ],
  },
  {
    id: 'weather',
    icon: Cloud,
    title: 'Weather Hub',
    color: 'sky',
    description: '5-model ensemble met spuitvenster-advies',
    detail: '48-uurs Expert Forecast, 7-daagse voorspelling, Delta-T, bladnat-uren, GDD tracking en ensemble-pluim visualisatie.',
    metrics: [
      { label: 'Weermodellen', value: '5 modellen' },
      { label: 'Forecast bereik', value: '48 uur' },
      { label: 'Update frequentie', value: 'Elk uur' },
    ],
  },
  {
    id: 'parcels',
    icon: MapPin,
    title: 'Perceelbeheer',
    color: 'amber',
    description: 'Kaart met blokindeling en RVO-import',
    detail: 'Twee-laags hiërarchie met ras, onderstam, plantjaar en gewogen samenstellingen. Importeer direct vanuit RVO.',
    metrics: [
      { label: 'Kaart precisie', value: 'GPS exact' },
      { label: 'Import bron', value: 'RVO / PDOK' },
      { label: 'Blok niveaus', value: '2 lagen' },
    ],
  },
  {
    id: 'protection',
    icon: Shield,
    title: 'Gewasbescherming',
    color: 'green',
    description: '6-staps CTGB validatie & spuitschrift',
    detail: 'Automatische controle op toelating, dosering, interval, seizoensmax, stofcumulatie en veiligheidstermijn. Export als spuitschrift.',
    metrics: [
      { label: 'CTGB producten', value: '1.000+' },
      { label: 'Validatie stappen', value: '6 checks' },
      { label: 'Compliance', value: '100%' },
    ],
  },
  {
    id: 'harvest',
    icon: Apple,
    title: 'Harvest Hub',
    color: 'orange',
    description: 'Plukregistratie & koelcel-visualisatie',
    detail: 'Track kistposities per koelcel met herkomst, ras en opslagdatum. Kwaliteitsklassen en capaciteitsplanning in real-time.',
    metrics: [
      { label: 'Koelcel weergave', value: 'Visueel grid' },
      { label: 'Kwaliteitsklassen', value: 'I / II / III' },
      { label: 'Tracking', value: 'Per kist' },
    ],
  },
  {
    id: 'research',
    icon: BookOpen,
    title: 'Kennisbank',
    color: 'purple',
    description: '20+ ziekten & plagen encyclopedie',
    detail: 'Lifecycle-timelines, risiconiveaus, seizoensactiviteit, symptomen en bestrijdingsmethoden. Plus veldsignalen delen.',
    metrics: [
      { label: 'Encyclopedie', value: '20+ items' },
      { label: 'Seizoensfilter', value: 'Automatisch' },
      { label: 'Updates', value: 'Continu' },
    ],
  },
  {
    id: 'team',
    icon: Users,
    title: 'Team & Uren',
    color: 'blue',
    description: 'Live timer met kostenberekening',
    detail: 'Registreer uren per taak, per perceel, per persoon. Met automatische pauze-aftrek en werkdag-weging.',
    metrics: [
      { label: 'Timer', value: 'Real-time' },
      { label: 'Kosten', value: 'Per uur' },
      { label: 'Rapportage', value: 'Per periode' },
    ],
  },
  {
    id: 'inventory',
    icon: Package,
    title: 'Voorraadbeheer',
    color: 'teal',
    description: 'Automatische voorraadverwerking',
    detail: 'Bij elke bevestigde registratie wordt de voorraad automatisch bijgewerkt. Met leveringsregistratie en alerting.',
    metrics: [
      { label: 'Verwerking', value: 'Automatisch' },
      { label: 'Alerts', value: 'Negatief saldo' },
      { label: 'Transacties', value: 'Volledige log' },
    ],
  },
];

const colorClasses: Record<string, { icon: string; bg: string; border: string; text: string; glow: string; activeBg: string }> = {
  emerald: { icon: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', glow: 'bg-emerald-400', activeBg: 'bg-emerald-500/[0.08]' },
  sky: { icon: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20', text: 'text-sky-400', glow: 'bg-sky-400', activeBg: 'bg-sky-500/[0.08]' },
  amber: { icon: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400', glow: 'bg-amber-400', activeBg: 'bg-amber-500/[0.08]' },
  green: { icon: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', glow: 'bg-emerald-400', activeBg: 'bg-emerald-500/[0.08]' },
  orange: { icon: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', text: 'text-orange-400', glow: 'bg-orange-400', activeBg: 'bg-orange-500/[0.08]' },
  purple: { icon: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20', text: 'text-purple-400', glow: 'bg-purple-400', activeBg: 'bg-purple-500/[0.08]' },
  blue: { icon: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400', glow: 'bg-blue-400', activeBg: 'bg-blue-500/[0.08]' },
  teal: { icon: 'text-teal-400', bg: 'bg-teal-500/10', border: 'border-teal-500/20', text: 'text-teal-400', glow: 'bg-teal-400', activeBg: 'bg-teal-500/[0.08]' },
};

/* ─── Data Flow Connector ─── */
function DataFlowLine({ isInView }: { isInView: boolean }) {
  return (
    <div className="hidden lg:flex items-center justify-center my-8">
      <div className="relative w-full max-w-3xl h-16">
        {/* Central data bus line */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={isInView ? { scaleX: 1 } : {}}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          className="absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent origin-left"
        />

        {/* Animated pulse dot */}
        <motion.div
          initial={{ left: '0%', opacity: 0 }}
          animate={isInView ? { left: ['0%', '100%'], opacity: [0, 1, 1, 0] } : {}}
          transition={{ duration: 3, repeat: Infinity, repeatDelay: 1, ease: 'easeInOut' }}
          className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/50"
        />

        {/* Center label */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.6 }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-2 flex items-center gap-1.5"
        >
          <Database className="w-3 h-3 text-emerald-500/40" />
          <span className="text-[10px] text-slate-600 font-medium tracking-wider uppercase">
            Data stroomt automatisch door het hele platform
          </span>
        </motion.div>
      </div>
    </div>
  );
}

/* ─── Module Card ─── */
function ModuleCard({
  mod,
  index,
  isSelected,
  onSelect,
}: {
  mod: (typeof modules)[number];
  index: number;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-30px' });
  const colors = colorClasses[mod.color];
  const Icon = mod.icon;

  return (
    <motion.button
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      onClick={onSelect}
      className={`group relative text-left w-full rounded-xl overflow-hidden transition-all duration-300 ${
        isSelected
          ? `${colors.activeBg} border ${colors.border} shadow-lg`
          : 'bg-slate-900/30 border border-white/[0.04] hover:bg-slate-900/50 hover:border-white/[0.08]'
      }`}
    >
      <div className="p-4">
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center border transition-all duration-300 ${
              isSelected ? `${colors.bg} ${colors.border}` : 'bg-slate-800/50 border-white/[0.06]'
            }`}
          >
            <Icon className={`w-4 h-4 transition-colors ${isSelected ? colors.icon : 'text-slate-500'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className={`text-sm font-medium transition-colors ${isSelected ? colors.text : 'text-slate-300 group-hover:text-white'}`}>
              {mod.title}
            </h4>
            <p className="text-[11px] text-slate-500 mt-0.5 truncate">{mod.description}</p>
          </div>
          <ArrowRight
            className={`w-3.5 h-3.5 flex-shrink-0 transition-all duration-300 ${
              isSelected ? `${colors.icon} translate-x-0` : 'text-slate-700 -translate-x-1 opacity-0 group-hover:opacity-100 group-hover:translate-x-0'
            }`}
          />
        </div>
      </div>

      {/* Active indicator line */}
      {isSelected && (
        <motion.div
          layoutId="activeModuleLine"
          className={`absolute bottom-0 left-0 right-0 h-0.5 ${colors.glow} opacity-40`}
        />
      )}
    </motion.button>
  );
}

/* ─── Module Detail Panel ─── */
function ModuleDetail({ mod }: { mod: (typeof modules)[number] }) {
  const colors = colorClasses[mod.color];
  const Icon = mod.icon;

  return (
    <motion.div
      key={mod.id}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.3 }}
      className={`rounded-2xl border ${colors.border} overflow-hidden`}
      style={{ backgroundColor: 'rgba(15,23,42,0.5)' }}
    >
      {/* Header */}
      <div className={`px-6 py-4 ${colors.activeBg} border-b ${colors.border}`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl ${colors.bg} border ${colors.border} flex items-center justify-center`}>
            <Icon className={`w-5 h-5 ${colors.icon}`} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">{mod.title}</h3>
            <p className="text-xs text-slate-500">{mod.description}</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        <p className="text-sm text-slate-300 leading-relaxed mb-6">{mod.detail}</p>

        {/* Metrics grid */}
        <div className="grid grid-cols-3 gap-3">
          {mod.metrics.map((metric, i) => (
            <motion.div
              key={metric.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.08 }}
              className="rounded-xl bg-slate-800/40 border border-white/[0.04] p-3 text-center"
            >
              <div className={`text-lg font-bold ${colors.text}`}>{metric.value}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">{metric.label}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Platform Overview Section ─── */
export function PlatformOverview() {
  const [selectedId, setSelectedId] = useState(modules[0].id);
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  const selectedModule = modules.find((m) => m.id === selectedId)!;

  return (
    <section id="platform-overview" className="relative py-24 sm:py-32 px-4 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-950/50 to-transparent" />

      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-6"
        >
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
            transition={{ duration: 0.4 }}
            className="inline-block text-emerald-400 text-sm font-medium tracking-widest uppercase mb-4"
          >
            Modules
          </motion.span>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl text-white mb-4">
            8 modules,{' '}
            <span className="text-slate-400">één ecosysteem</span>
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            Elk onderdeel werkt naadloos samen. Data stroomt automatisch door het hele platform.
          </p>
        </motion.div>

        {/* Data flow visualization */}
        <DataFlowLine isInView={isInView} />

        {/* Module Grid + Detail */}
        <div className="grid lg:grid-cols-[1fr_1fr] gap-6 lg:gap-8">
          {/* Module grid - 2 cols of 4 */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-2.5"
          >
            {modules.map((mod, index) => (
              <ModuleCard
                key={mod.id}
                mod={mod}
                index={index}
                isSelected={selectedId === mod.id}
                onSelect={() => setSelectedId(mod.id)}
              />
            ))}
          </motion.div>

          {/* Detail Panel */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: 20 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="lg:sticky lg:top-24 self-start"
          >
            <AnimatePresence mode="wait">
              <ModuleDetail mod={selectedModule} />
            </AnimatePresence>
          </motion.div>
        </div>

        {/* Integration stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ delay: 0.6 }}
          className="mt-12 flex flex-wrap justify-center gap-8 sm:gap-12"
        >
          {[
            { icon: Zap, value: '8', label: 'Geïntegreerde modules' },
            { icon: Database, value: '1.000+', label: 'CTGB producten' },
            { icon: Sparkles, value: '<3s', label: 'AI responstijd' },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
              transition={{ delay: 0.8 + i * 0.1 }}
              className="text-center"
            >
              <div className="flex items-center gap-2 justify-center mb-1">
                <stat.icon className="w-4 h-4 text-emerald-500/50" />
                <span className="text-2xl font-bold text-white">{stat.value}</span>
              </div>
              <span className="text-xs text-slate-500">{stat.label}</span>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
