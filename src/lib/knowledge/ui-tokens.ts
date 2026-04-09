/**
 * Design tokens & configuration for the Knowledge Atlas UI.
 *
 * Centralized config for categories, colors, icons, and phase definitions
 * so the whole UI stays consistent and is easy to re-theme later.
 */

import type { KnowledgeCategory, SeasonPhase } from './types';

// ============================================
// Category configuration
// ============================================

export interface CategoryConfig {
  key: KnowledgeCategory;
  label: string;
  icon: string;               // Lucide icon name (imported in component)
  color: string;              // Tailwind emerald/amber/etc
  hex: string;                // Raw hex for gradients / SVG
  gradientFrom: string;       // CSS gradient start
  gradientTo: string;         // CSS gradient end
  description: string;
}

export const CATEGORY_CONFIG: Record<KnowledgeCategory, CategoryConfig> = {
  ziekte: {
    key: 'ziekte',
    label: 'Ziektes',
    icon: 'Biohazard',
    color: 'rose',
    hex: '#f43f5e',
    gradientFrom: 'from-rose-500/30',
    gradientTo: 'to-rose-900/10',
    description: 'Schimmelziektes en bacteriële aandoeningen',
  },
  plaag: {
    key: 'plaag',
    label: 'Plagen',
    icon: 'Bug',
    color: 'orange',
    hex: '#f97316',
    gradientFrom: 'from-orange-500/30',
    gradientTo: 'to-orange-900/10',
    description: 'Insecten, mijten, knaagdieren en vogels',
  },
  abiotisch: {
    key: 'abiotisch',
    label: 'Abiotisch',
    icon: 'Snowflake',
    color: 'sky',
    hex: '#0ea5e9',
    gradientFrom: 'from-sky-500/30',
    gradientTo: 'to-sky-900/10',
    description: 'Vorst, hagel, droogte en zonnebrand',
  },
  bemesting: {
    key: 'bemesting',
    label: 'Bemesting',
    icon: 'TestTubeDiagonal',
    color: 'yellow',
    hex: '#eab308',
    gradientFrom: 'from-yellow-500/30',
    gradientTo: 'to-yellow-900/10',
    description: 'Voeding, stikstof, bladbemesting',
  },
  snoei: {
    key: 'snoei',
    label: 'Snoei',
    icon: 'Scissors',
    color: 'emerald',
    hex: '#10b981',
    gradientFrom: 'from-emerald-500/30',
    gradientTo: 'to-emerald-900/10',
    description: 'Snoeitechnieken per ras en fase',
  },
  dunning: {
    key: 'dunning',
    label: 'Dunning',
    icon: 'GitFork',
    color: 'lime',
    hex: '#84cc16',
    gradientFrom: 'from-lime-500/30',
    gradientTo: 'to-lime-900/10',
    description: 'Hand- en chemisch dunnen',
  },
  bewaring: {
    key: 'bewaring',
    label: 'Bewaring',
    icon: 'Warehouse',
    color: 'cyan',
    hex: '#06b6d4',
    gradientFrom: 'from-cyan-500/30',
    gradientTo: 'to-cyan-900/10',
    description: 'Koelcel, ULO, bewaarziektes',
  },
  certificering: {
    key: 'certificering',
    label: 'Certificering',
    icon: 'ShieldCheck',
    color: 'indigo',
    hex: '#6366f1',
    gradientFrom: 'from-indigo-500/30',
    gradientTo: 'to-indigo-900/10',
    description: 'Wet- en regelgeving, GlobalGAP',
  },
  algemeen: {
    key: 'algemeen',
    label: 'Algemeen',
    icon: 'BookOpen',
    color: 'slate',
    hex: '#64748b',
    gradientFrom: 'from-slate-500/30',
    gradientTo: 'to-slate-900/10',
    description: 'Klimaat, weer en overig teeltnieuws',
  },
  rassenkeuze: {
    key: 'rassenkeuze',
    label: 'Rassenkeuze',
    icon: 'Sparkles',
    color: 'pink',
    hex: '#ec4899',
    gradientFrom: 'from-pink-500/30',
    gradientTo: 'to-pink-900/10',
    description: 'Nieuwe rassen en eigenschappen',
  },
  bodem: {
    key: 'bodem',
    label: 'Bodem',
    icon: 'Layers',
    color: 'amber',
    hex: '#d97706',
    gradientFrom: 'from-amber-600/30',
    gradientTo: 'to-amber-950/10',
    description: 'Bodemanalyse, structuur en leven',
  },
  watermanagement: {
    key: 'watermanagement',
    label: 'Water',
    icon: 'Droplets',
    color: 'blue',
    hex: '#3b82f6',
    gradientFrom: 'from-blue-500/30',
    gradientTo: 'to-blue-900/10',
    description: 'Beregening, drainage, capillair',
  },
};

export const CATEGORY_ORDER: KnowledgeCategory[] = [
  'ziekte', 'plaag', 'abiotisch', 'bemesting',
  'snoei', 'dunning', 'bewaring', 'rassenkeuze',
  'bodem', 'watermanagement', 'certificering', 'algemeen',
];

// ============================================
// Phenological phase configuration
// ============================================

export interface PhaseConfig {
  key: string;                    // phase label as stored in DB / phenology.ts
  label: string;                  // Human-readable
  dbPhase: SeasonPhase;           // Simplified DB enum
  monthStart: number;             // Approximate start month (1-12)
  monthEnd: number;
  color: string;                  // hex
  emoji: string;
  description: string;
}

export const PHENOLOGICAL_PHASES: PhaseConfig[] = [
  { key: 'winterrust',     label: 'Winterrust',     dbPhase: 'rust',          monthStart: 12, monthEnd: 2,  color: '#64748b', emoji: '❄️', description: 'Bomen in rust, snoeitijd' },
  { key: 'knopzwelling',   label: 'Knopzwelling',   dbPhase: 'knopstadium',   monthStart: 2,  monthEnd: 3,  color: '#8b5cf6', emoji: '🌿', description: 'Knoppen beginnen te zwellen' },
  { key: 'groen-puntje',   label: 'Groen-puntje',   dbPhase: 'knopstadium',   monthStart: 3,  monthEnd: 3,  color: '#22c55e', emoji: '🌱', description: 'Eerste groene delen zichtbaar' },
  { key: 'muizenoor',      label: 'Muizenoor',      dbPhase: 'knopstadium',   monthStart: 3,  monthEnd: 4,  color: '#4ade80', emoji: '👂', description: 'Bladeren ontvouwen' },
  { key: 'volle-bloei',    label: 'Volle bloei',    dbPhase: 'bloei',         monthStart: 4,  monthEnd: 4,  color: '#f472b6', emoji: '🌸', description: 'Bestuivingsperiode' },
  { key: 'bloembladval',   label: 'Bloembladval',   dbPhase: 'bloei',         monthStart: 4,  monthEnd: 5,  color: '#fb7185', emoji: '🌺', description: 'Eind van de bloei' },
  { key: 'vruchtzetting',  label: 'Vruchtzetting',  dbPhase: 'vruchtzetting', monthStart: 5,  monthEnd: 5,  color: '#10b981', emoji: '🫐', description: 'Vruchten vormen zich' },
  { key: 'junirui',        label: 'Junirui',        dbPhase: 'groei',         monthStart: 5,  monthEnd: 6,  color: '#059669', emoji: '🍏', description: 'Natuurlijke dunning' },
  { key: 'celstrekking',   label: 'Celstrekking',   dbPhase: 'groei',         monthStart: 6,  monthEnd: 8,  color: '#047857', emoji: '🍐', description: 'Vruchten groeien in volume' },
  { key: 'oogst',          label: 'Oogst',          dbPhase: 'oogst',         monthStart: 8,  monthEnd: 10, color: '#f59e0b', emoji: '🍎', description: 'Plukperiode' },
  { key: 'bladval',        label: 'Bladval',        dbPhase: 'nabloei',       monthStart: 10, monthEnd: 11, color: '#d97706', emoji: '🍂', description: 'Einde groeiseizoen' },
];

export function getPhaseForMonth(month: number): PhaseConfig {
  // Handle wrap-around (winterrust spans dec-jan-feb)
  for (const phase of PHENOLOGICAL_PHASES) {
    if (phase.monthStart <= phase.monthEnd) {
      if (month >= phase.monthStart && month <= phase.monthEnd) return phase;
    } else {
      if (month >= phase.monthStart || month <= phase.monthEnd) return phase;
    }
  }
  return PHENOLOGICAL_PHASES[0];
}

// ============================================
// Urgency configuration
// ============================================

export type UrgencyLevel = 'time_critical' | 'seasonal' | 'background';

export const URGENCY_CONFIG: Record<UrgencyLevel, {
  label: string;
  color: string;
  hex: string;
  emoji: string;
  description: string;
}> = {
  time_critical: {
    label: 'Tijdkritisch',
    color: 'amber',
    hex: '#f59e0b',
    emoji: '🔥',
    description: 'Direct actie vereist',
  },
  seasonal: {
    label: 'Seizoensgebonden',
    color: 'emerald',
    hex: '#10b981',
    emoji: '🌱',
    description: 'Voor deze teeltfase',
  },
  background: {
    label: 'Achtergrondkennis',
    color: 'violet',
    hex: '#a855f7',
    emoji: '📚',
    description: 'Algemene kennis',
  },
};

// ============================================
// Crop configuration
// ============================================

export interface CropConfig {
  key: string;
  label: string;
  emoji: string;
  color: string;
}

export const CROP_CONFIG: Record<string, CropConfig> = {
  appel: { key: 'appel', label: 'Appel', emoji: '🍎', color: '#ef4444' },
  peer: { key: 'peer', label: 'Peer', emoji: '🍐', color: '#84cc16' },
  kers: { key: 'kers', label: 'Kers', emoji: '🍒', color: '#dc2626' },
  pruim: { key: 'pruim', label: 'Pruim', emoji: '🫐', color: '#7c3aed' },
  blauwe_bes: { key: 'blauwe_bes', label: 'Blauwe bes', emoji: '🫐', color: '#3b82f6' },
};

// ============================================
// Month labels
// ============================================

export const MONTH_LABELS = [
  'Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec',
];

export const MONTH_LABELS_LONG = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
];

// ============================================
// Utility: estimate urgency from article metadata
// ============================================

/**
 * Compute a display-time urgency level from article metadata.
 * This is a visual heuristic, not the 'urgency' field from the Python pipeline
 * (which we didn't propagate into knowledge_articles yet).
 *
 * - time_critical: relevant right now (current month overlaps) + NOT evergreen
 * - seasonal: relevant this season (current phase overlaps)
 * - background: evergreen or outside current window
 */
export function estimateUrgency(article: {
  relevant_months?: number[] | null;
  season_phases?: string[] | null;
  is_evergreen?: boolean;
}): UrgencyLevel {
  if (article.is_evergreen) return 'background';
  const now = new Date();
  const month = now.getUTCMonth() + 1;
  if (article.relevant_months?.includes(month)) return 'time_critical';
  const currentPhase = getPhaseForMonth(month);
  if (article.season_phases?.includes(currentPhase.dbPhase)) return 'seasonal';
  if (article.season_phases?.includes(currentPhase.key)) return 'seasonal';
  return 'background';
}
