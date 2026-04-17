import {
    Truck,
    Boxes,
    Factory,
    ShoppingCart,
    ArrowDownToLine,
    ArrowUpFromLine,
    ArrowLeftRight,
    FlaskConical,
    PencilRuler,
    type LucideIcon,
} from 'lucide-react';
import type { BatchEventType, BatchStatus, BatchDocumentType } from '@/lib/types';

export const EVENT_TYPE_LABELS: Record<BatchEventType, string> = {
    inslag: 'Inslag koelcel',
    uitslag: 'Uitslag koelcel',
    verplaatsing: 'Cel-verplaatsing',
    transport: 'Transport',
    sortering_extern: 'Externe sortering',
    sortering_eigen: 'Eigen sortering',
    afzet: 'Afzet',
    correctie: 'Correctie',
    kwaliteitsmeting: 'Kwaliteitsmeting',
};

export const EVENT_TYPE_ICONS: Record<BatchEventType, LucideIcon> = {
    inslag: ArrowDownToLine,
    uitslag: ArrowUpFromLine,
    verplaatsing: ArrowLeftRight,
    transport: Truck,
    sortering_extern: Factory,
    sortering_eigen: Boxes,
    afzet: ShoppingCart,
    correctie: PencilRuler,
    kwaliteitsmeting: FlaskConical,
};

export const EVENT_TYPE_COLORS: Record<BatchEventType, string> = {
    inslag: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
    uitslag: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
    verplaatsing: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
    transport: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    sortering_extern: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
    sortering_eigen: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
    afzet: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    correctie: 'text-slate-400 bg-slate-500/10 border-slate-500/30',
    kwaliteitsmeting: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
};

export const STATUS_LABELS: Record<BatchStatus, string> = {
    active: 'Actief',
    gereserveerd_voor_afnemer: 'Gereserveerd',
    closed: 'Afgesloten',
    archived: 'Gearchiveerd',
};

export const STATUS_COLORS: Record<BatchStatus, string> = {
    active: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    gereserveerd_voor_afnemer: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    closed: 'text-slate-400 bg-slate-500/10 border-slate-500/30',
    archived: 'text-slate-500 bg-slate-500/5 border-slate-500/20',
};

export const DOCUMENT_TYPE_LABELS: Record<BatchDocumentType, string> = {
    sorteer_overzicht: 'Sorteeroverzicht',
    factuur: 'Factuur',
    klant_order: 'Klantorder',
    overig: 'Overig',
};

// ----------------------------------------------------------------------------
// Variety aliases — rassen met een handelsnaam/merknaam worden als één variant
// behandeld zodat ze niet dubbel in dropdowns verschijnen.
//
// Key = losse naam zoals die in oude data/rapporten kan staan.
// Value = canonical weergave ("rasnaam/merknaam" of "merknaam/rasnaam").
//
// Uitbreidbaar — voeg hier simpel nieuwe aliases toe wanneer nodig.
// ----------------------------------------------------------------------------
export const VARIETY_ALIASES: Record<string, string> = {
    // Fengapi is het ras, Tessa is de merknaam
    fengapi: 'Tessa/Fengapi',
    tessa: 'Tessa/Fengapi',
    'tessa/fengapi': 'Tessa/Fengapi',
    'fengapi/tessa': 'Tessa/Fengapi',
};

/**
 * Normaliseer een ras-naam naar zijn canonieke vorm (bv. "Fengapi" → "Tessa/Fengapi").
 * Behoudt de originele casing voor onbekende rassen.
 */
export function normalizeVariety(variety: string | null | undefined): string | null {
    if (!variety) return null;
    const trimmed = variety.trim();
    if (!trimmed) return null;
    const key = trimmed.toLowerCase();
    return VARIETY_ALIASES[key] ?? trimmed;
}

export const MVP_EVENT_TYPES: BatchEventType[] = [
    'transport',
    'sortering_eigen',
    'sortering_extern',
    'afzet',
    'inslag',
    'uitslag',
    'verplaatsing',
    'correctie',
];

// Event-types die pas in fase 2 beschikbaar zijn. Nog tonen als "binnenkort" knop.
export const FUTURE_EVENT_TYPES: BatchEventType[] = ['kwaliteitsmeting'];

export function formatEuro(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    return new Intl.NumberFormat('nl-NL', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 2,
    }).format(value);
}

export function formatKg(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    return `${new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 }).format(value)} kg`;
}

export function formatDateNL(date: Date | null | undefined): string {
    if (!date) return '—';
    return new Intl.DateTimeFormat('nl-NL', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    }).format(date);
}

export function autoLabelFromHarvest(args: {
    variety?: string | null;
    pickNumber?: number | null;
    subParcelName?: string | null;
    parcelName?: string | null;
    year?: number | null;
}): string {
    const parts: string[] = [];
    if (args.variety) parts.push(args.variety);
    if (args.pickNumber && args.pickNumber > 1) parts.push(`P${args.pickNumber}`);
    if (args.subParcelName) parts.push(args.subParcelName);
    else if (args.parcelName) parts.push(args.parcelName);
    if (args.year) parts.push(String(args.year));
    return parts.join(' — ') || 'Partij zonder label';
}
