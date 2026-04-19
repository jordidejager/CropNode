/**
 * 11-color premium palette — matches landing page feature-bento.
 * Used across gewasbescherming module to give each subpage its own sfeer.
 */

export type PaletteColor =
    | 'sky'
    | 'amber'
    | 'emerald'
    | 'purple'
    | 'orange'
    | 'blue'
    | 'teal'
    | 'cyan'
    | 'green'
    | 'lime'
    | 'indigo';

/** RGBA glow (0.12 opacity) — used for radial spotlights & gradient borders */
export const glowColors: Record<PaletteColor, string> = {
    sky: 'rgba(56,189,248,0.12)',
    amber: 'rgba(245,158,11,0.12)',
    emerald: 'rgba(16,185,129,0.12)',
    purple: 'rgba(168,85,247,0.12)',
    orange: 'rgba(249,115,22,0.12)',
    blue: 'rgba(96,165,250,0.12)',
    teal: 'rgba(45,212,191,0.12)',
    cyan: 'rgba(34,211,238,0.12)',
    green: 'rgba(74,222,128,0.12)',
    lime: 'rgba(163,230,53,0.12)',
    indigo: 'rgba(129,140,248,0.12)',
};

/** Solid bg-*-400 Tailwind classes for glow orbs */
export const glowColorsSolid: Record<PaletteColor, string> = {
    sky: 'bg-sky-400',
    amber: 'bg-amber-400',
    emerald: 'bg-emerald-400',
    purple: 'bg-purple-400',
    orange: 'bg-orange-400',
    blue: 'bg-blue-400',
    teal: 'bg-teal-400',
    cyan: 'bg-cyan-400',
    green: 'bg-green-400',
    lime: 'bg-lime-400',
    indigo: 'bg-indigo-400',
};

/** 500-shade bg with 10% alpha — for pill badges & icon tiles */
export const bgColors: Record<PaletteColor, string> = {
    sky: 'bg-sky-500/10 border-sky-500/20',
    amber: 'bg-amber-500/10 border-amber-500/20',
    emerald: 'bg-emerald-500/10 border-emerald-500/20',
    purple: 'bg-purple-500/10 border-purple-500/20',
    orange: 'bg-orange-500/10 border-orange-500/20',
    blue: 'bg-blue-500/10 border-blue-500/20',
    teal: 'bg-teal-500/10 border-teal-500/20',
    cyan: 'bg-cyan-500/10 border-cyan-500/20',
    green: 'bg-green-500/10 border-green-500/20',
    lime: 'bg-lime-500/10 border-lime-500/20',
    indigo: 'bg-indigo-500/10 border-indigo-500/20',
};

/** 400-shade text — for icons and pill badge labels */
export const iconColors: Record<PaletteColor, string> = {
    sky: 'text-sky-400',
    amber: 'text-amber-400',
    emerald: 'text-emerald-400',
    purple: 'text-purple-400',
    orange: 'text-orange-400',
    blue: 'text-blue-400',
    teal: 'text-teal-400',
    cyan: 'text-cyan-400',
    green: 'text-green-400',
    lime: 'text-lime-400',
    indigo: 'text-indigo-400',
};

/** Module → color mapping for gewasbescherming subpages */
export const modulePalette = {
    spuitschrift: 'emerald',
    bemesting: 'lime',
    database: 'sky',
    'database-meststoffen': 'teal',
    voorraad: 'amber',
    compliance: 'indigo',
    favorieten: 'cyan',
    geschiedenis: 'blue',
    bio: 'green',
    warning: 'orange',
    error: 'purple',
} as const satisfies Record<string, PaletteColor>;
