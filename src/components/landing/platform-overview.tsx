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
  ChevronRight,
  Sparkles,
  BarChart3,
  Timer,
} from 'lucide-react';

const modules = [
  {
    id: 'command-center',
    icon: MessageSquareText,
    title: 'Command Center',
    subtitle: 'Slimme Invoer v2',
    description:
      'Natuurlijke taalinvoer met AI-parsing. Typ een registratie zoals je het zegt — CropNode herkent alles en valideert automatisch. Met correctie-feedback loop en undo/redo.',
    highlights: ['AI parsing', 'CTGB validatie', 'Multi-turn correcties'],
    color: 'emerald',
  },
  {
    id: 'weather',
    icon: Cloud,
    title: 'Weather Hub',
    subtitle: '5-model ensemble',
    description:
      '48-uurs prognose, 7-daagse voorspelling en spuitvenster-advies. Met Delta-T berekening, bladnat-uren, GDD tracking en multi-model vergelijking inclusief ensemble-pluim.',
    highlights: ['Spuitvenster', 'Delta-T', 'Ensemble pluim'],
    color: 'sky',
  },
  {
    id: 'parcels',
    icon: MapPin,
    title: 'Perceelbeheer',
    subtitle: 'Kaart & blokindeling',
    description:
      'Twee-laags hiërarchie met hoofdpercelen en blokken. Inclusief ras, onderstam, plantjaar, plantafstand en gewogen samenstellingen. Direct importeren vanuit RVO.',
    highlights: ['RVO import', 'Blokindeling', 'Bodemmonsters'],
    color: 'amber',
  },
  {
    id: 'crop-care',
    icon: Shield,
    title: 'Gewasbescherming',
    subtitle: 'Logboek & Spuitschrift',
    description:
      'Van concept-registratie tot definitief spuitschrift. 6-staps validatie checkt dosering, toelating, interval, seizoensmaximum, stofcumulatie en veiligheidstermijn.',
    highlights: ['6-staps validatie', 'Spuitschrift', 'Audit trail'],
    color: 'red',
  },
  {
    id: 'harvest',
    icon: Apple,
    title: 'Harvest Hub',
    subtitle: 'Oogst & koelcel',
    description:
      'Plukregistratie met kwaliteitsklassen en 3D koelcel-visualisatie. Track kistposities per cel met herkomst, ras en opslagdatum. Capaciteitsplanning in real-time.',
    highlights: ['3D koelcel', 'Kistpositie', 'Kwaliteitsklassen'],
    color: 'orange',
  },
  {
    id: 'research',
    icon: BookOpen,
    title: 'Research Hub',
    subtitle: 'Kennisbank',
    description:
      '20+ ziekten & plagen encyclopedie met lifecycle-timeline, symptomen, bestrijdingsmethoden en CTGB-aanbevelingen. Plus veldsignalen delen met je team.',
    highlights: ['Encyclopedie', 'Veldsignalen', 'Papers'],
    color: 'purple',
  },
  {
    id: 'team',
    icon: Users,
    title: 'Team & Uren',
    subtitle: 'Live timer',
    description:
      'Registreer uren per taak, per perceel, per persoon. Met live timer, automatische pauze-aftrek en slimme werkdag-weging. Direct kostenberekening op basis van uurtarieven.',
    highlights: ['Live timer', 'Kostenberekening', 'Werkdag-weging'],
    color: 'blue',
  },
  {
    id: 'inventory',
    icon: Package,
    title: 'Voorraadbeheer',
    subtitle: 'Automatisch',
    description:
      'Automatische voorraadverwerking bij bevestigde spuitregistraties. Met leveringsregistratie, transactiehistorie en negatieve-voorraad alerting.',
    highlights: ['Auto-verwerking', 'Leveringen', 'Alerts'],
    color: 'teal',
  },
];

const colorMap: Record<string, string> = {
  emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/15',
  sky: 'text-sky-400 bg-sky-500/10 border-sky-500/15',
  amber: 'text-amber-400 bg-amber-500/10 border-amber-500/15',
  red: 'text-red-400 bg-red-500/10 border-red-500/15',
  orange: 'text-orange-400 bg-orange-500/10 border-orange-500/15',
  purple: 'text-purple-400 bg-purple-500/10 border-purple-500/15',
  blue: 'text-blue-400 bg-blue-500/10 border-blue-500/15',
  teal: 'text-teal-400 bg-teal-500/10 border-teal-500/15',
};

const iconColorMap: Record<string, string> = {
  emerald: 'text-emerald-400',
  sky: 'text-sky-400',
  amber: 'text-amber-400',
  red: 'text-red-400',
  orange: 'text-orange-400',
  purple: 'text-purple-400',
  blue: 'text-blue-400',
  teal: 'text-teal-400',
};

const highlightColorMap: Record<string, string> = {
  emerald: 'bg-emerald-500/10 text-emerald-400',
  sky: 'bg-sky-500/10 text-sky-400',
  amber: 'bg-amber-500/10 text-amber-400',
  red: 'bg-red-500/10 text-red-400',
  orange: 'bg-orange-500/10 text-orange-400',
  purple: 'bg-purple-500/10 text-purple-400',
  blue: 'bg-blue-500/10 text-blue-400',
  teal: 'bg-teal-500/10 text-teal-400',
};

export function PlatformOverview() {
  const [activeModule, setActiveModule] = useState(modules[0].id);
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  const active = modules.find((m) => m.id === activeModule)!;

  return (
    <section
      id="platform-overview"
      className="relative py-24 sm:py-32 px-4 overflow-hidden"
    >
      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
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

        {/* Module Showcase */}
        <div className="grid lg:grid-cols-[340px_1fr] gap-6 lg:gap-10">
          {/* Module List */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="space-y-1.5 lg:max-h-[600px] overflow-y-auto custom-scrollbar"
          >
            {modules.map((mod) => {
              const Icon = mod.icon;
              const isActive = activeModule === mod.id;

              return (
                <button
                  key={mod.id}
                  onClick={() => setActiveModule(mod.id)}
                  className={`w-full text-left p-3.5 rounded-xl transition-all duration-300 group ${
                    isActive
                      ? 'bg-slate-900/70 border border-emerald-500/20'
                      : 'bg-transparent border border-transparent hover:bg-slate-900/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-all border ${
                        isActive
                          ? colorMap[mod.color]
                          : 'bg-slate-800/50 border-white/[0.06] text-slate-500'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3
                          className={`text-sm font-medium transition-colors ${
                            isActive
                              ? iconColorMap[mod.color]
                              : 'text-slate-300 group-hover:text-white'
                          }`}
                        >
                          {mod.title}
                        </h3>
                        <ChevronRight
                          className={`w-4 h-4 transition-all ${
                            isActive
                              ? `${iconColorMap[mod.color]} rotate-90`
                              : 'text-slate-700'
                          }`}
                        />
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{mod.subtitle}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </motion.div>

          {/* Module Detail */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: 20 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="lg:sticky lg:top-24"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={activeModule}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
                className="rounded-2xl bg-slate-900/50 border border-white/[0.06] p-6 sm:p-8"
              >
                <div className="flex items-center gap-4 mb-6">
                  <div
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center border ${colorMap[active.color]}`}
                  >
                    <active.icon className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-white">{active.title}</h3>
                    <p className="text-sm text-slate-500">{active.subtitle}</p>
                  </div>
                </div>

                <p className="text-slate-300 leading-relaxed mb-6">
                  {active.description}
                </p>

                {/* Highlights */}
                <div className="flex flex-wrap gap-2">
                  {active.highlights.map((h) => (
                    <span
                      key={h}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium ${highlightColorMap[active.color]}`}
                    >
                      {h}
                    </span>
                  ))}
                </div>

                {/* Decorative visual */}
                <div className="mt-8 relative h-40 rounded-xl bg-slate-800/30 border border-white/[0.04] overflow-hidden">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className={`w-20 h-20 rounded-2xl ${colorMap[active.color]} flex items-center justify-center opacity-20`}>
                      <active.icon className="w-10 h-10" />
                    </div>
                  </div>
                  {/* Animated dots */}
                  <div className="absolute inset-0">
                    {[...Array(12)].map((_, i) => (
                      <motion.div
                        key={i}
                        className={`absolute w-1 h-1 rounded-full ${iconColorMap[active.color]} opacity-20`}
                        style={{
                          left: `${10 + (i % 4) * 25}%`,
                          top: `${15 + Math.floor(i / 4) * 30}%`,
                        }}
                        animate={{
                          opacity: [0.1, 0.4, 0.1],
                          scale: [0.8, 1.2, 0.8],
                        }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          delay: i * 0.2,
                        }}
                      />
                    ))}
                  </div>
                  {/* Connection lines */}
                  <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 160">
                    <motion.path
                      d="M 50,80 Q 150,30 200,80 Q 250,130 350,80"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1"
                      className={`${iconColorMap[active.color]} opacity-10`}
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 1.5 }}
                    />
                  </svg>
                </div>
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
