/**
 * 11-kleurenpalet voor taaktypes (urenregistratie).
 * Gebaseerd op de landingspagina feature-bento kleuren.
 *
 * Mapping is deterministic: zelfde taskTypeId → altijd zelfde kleur,
 * zolang er geen override in `task_types.color` staat.
 */

export const TASK_COLORS = [
  'sky',
  'amber',
  'emerald',
  'purple',
  'orange',
  'blue',
  'teal',
  'cyan',
  'green',
  'lime',
  'indigo',
] as const

export type TaskColor = (typeof TASK_COLORS)[number]

interface TaskColorTokens {
  /** Tailwind text class for icon + label accents */
  text: string
  /** Tailwind bg class voor subtle fill */
  bgSubtle: string
  /** Tailwind bg class voor solid fill (active chip / stop button) */
  bgSolid: string
  /** Tailwind border class */
  border: string
  /** Hover border class */
  borderHover: string
  /** Glow RGBA value for radial spotlight */
  glow: string
  /** Solid tailwind color class for glow orb (background-based) */
  orb: string
  /** Hex value for charts/SVG */
  hex: string
}

/**
 * Full token map per color. Wordt gebruikt door SpotlightCard, chips, timer cards, etc.
 */
export const TASK_COLOR_TOKENS: Record<TaskColor, TaskColorTokens> = {
  sky: {
    text: 'text-sky-300',
    bgSubtle: 'bg-sky-500/[0.08]',
    bgSolid: 'bg-sky-500',
    border: 'border-sky-500/25',
    borderHover: 'hover:border-sky-400/60',
    glow: 'rgba(56,189,248,0.14)',
    orb: 'bg-sky-500',
    hex: '#38bdf8',
  },
  amber: {
    text: 'text-amber-300',
    bgSubtle: 'bg-amber-500/[0.08]',
    bgSolid: 'bg-amber-500',
    border: 'border-amber-500/25',
    borderHover: 'hover:border-amber-400/60',
    glow: 'rgba(245,158,11,0.14)',
    orb: 'bg-amber-500',
    hex: '#f59e0b',
  },
  emerald: {
    text: 'text-emerald-300',
    bgSubtle: 'bg-emerald-500/[0.08]',
    bgSolid: 'bg-emerald-500',
    border: 'border-emerald-500/25',
    borderHover: 'hover:border-emerald-400/60',
    glow: 'rgba(16,185,129,0.14)',
    orb: 'bg-emerald-500',
    hex: '#10b981',
  },
  purple: {
    text: 'text-purple-300',
    bgSubtle: 'bg-purple-500/[0.08]',
    bgSolid: 'bg-purple-500',
    border: 'border-purple-500/25',
    borderHover: 'hover:border-purple-400/60',
    glow: 'rgba(168,85,247,0.14)',
    orb: 'bg-purple-500',
    hex: '#a855f7',
  },
  orange: {
    text: 'text-orange-300',
    bgSubtle: 'bg-orange-500/[0.08]',
    bgSolid: 'bg-orange-500',
    border: 'border-orange-500/25',
    borderHover: 'hover:border-orange-400/60',
    glow: 'rgba(249,115,22,0.14)',
    orb: 'bg-orange-500',
    hex: '#f97316',
  },
  blue: {
    text: 'text-blue-300',
    bgSubtle: 'bg-blue-500/[0.08]',
    bgSolid: 'bg-blue-500',
    border: 'border-blue-500/25',
    borderHover: 'hover:border-blue-400/60',
    glow: 'rgba(96,165,250,0.14)',
    orb: 'bg-blue-500',
    hex: '#60a5fa',
  },
  teal: {
    text: 'text-teal-300',
    bgSubtle: 'bg-teal-500/[0.08]',
    bgSolid: 'bg-teal-500',
    border: 'border-teal-500/25',
    borderHover: 'hover:border-teal-400/60',
    glow: 'rgba(45,212,191,0.14)',
    orb: 'bg-teal-500',
    hex: '#2dd4bf',
  },
  cyan: {
    text: 'text-cyan-300',
    bgSubtle: 'bg-cyan-500/[0.08]',
    bgSolid: 'bg-cyan-500',
    border: 'border-cyan-500/25',
    borderHover: 'hover:border-cyan-400/60',
    glow: 'rgba(34,211,238,0.14)',
    orb: 'bg-cyan-500',
    hex: '#22d3ee',
  },
  green: {
    text: 'text-green-300',
    bgSubtle: 'bg-green-500/[0.08]',
    bgSolid: 'bg-green-500',
    border: 'border-green-500/25',
    borderHover: 'hover:border-green-400/60',
    glow: 'rgba(74,222,128,0.14)',
    orb: 'bg-green-500',
    hex: '#4ade80',
  },
  lime: {
    text: 'text-lime-300',
    bgSubtle: 'bg-lime-500/[0.08]',
    bgSolid: 'bg-lime-500',
    border: 'border-lime-500/25',
    borderHover: 'hover:border-lime-400/60',
    glow: 'rgba(163,230,53,0.14)',
    orb: 'bg-lime-500',
    hex: '#a3e635',
  },
  indigo: {
    text: 'text-indigo-300',
    bgSubtle: 'bg-indigo-500/[0.08]',
    bgSolid: 'bg-indigo-500',
    border: 'border-indigo-500/25',
    borderHover: 'hover:border-indigo-400/60',
    glow: 'rgba(129,140,248,0.14)',
    orb: 'bg-indigo-500',
    hex: '#818cf8',
  },
}

/**
 * Simple 32-bit hash van een string. Stabiele deterministische kleurtoewijzing
 * voor een taskTypeId (UUID). Verdere reeks-toekenning via modulo.
 */
function hashString(input: string): number {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

/**
 * Bepaalt een kleur voor een taaktype.
 *
 * - Als `override` (DB `task_types.color`) is gezet: gebruik die.
 * - Anders: deterministic hash van de `taskTypeId` cyclisch over het palet.
 *
 * Hierdoor blijft dezelfde taak altijd dezelfde kleur — ook over sessies heen.
 */
export function colorForTaskType(taskTypeId: string, override?: string | null): TaskColor {
  if (override && (TASK_COLORS as readonly string[]).includes(override)) {
    return override as TaskColor
  }
  const idx = hashString(taskTypeId) % TASK_COLORS.length
  return TASK_COLORS[idx]
}

/** Shortcut getter voor tokens */
export function tokensFor(color: TaskColor): TaskColorTokens {
  return TASK_COLOR_TOKENS[color]
}
