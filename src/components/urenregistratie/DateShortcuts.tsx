'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Snelkeuze-chips voor datum invoer.
 * Voor oudere gebruikers: vaak denken ze in relatieve termen
 * ("gisteren") i.p.v. een exacte datum.
 *
 * Toont de chip pas als "actief" wanneer de huidige datum
 * overeenkomt met de chip-waarde.
 */

type ShortcutMode = 'single' | 'range'

interface DateShortcutsProps {
    /** YYYY-MM-DD van huidige startdatum */
    currentStart: string
    /** YYYY-MM-DD van huidige einddatum (alleen bij mode='range') */
    currentEnd?: string
    /** true: zowel start als eind zetten, false: alleen start */
    mode?: ShortcutMode
    /** Callback: zet begin en (optioneel) einddatum */
    onSelect: (start: string, end: string) => void
    className?: string
}

function toISODate(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function daysAgo(n: number): string {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - n)
    return toISODate(d)
}

function thisWeekRange(): { start: string; end: string } {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    // Maandag als eerste weekdag (NL conventie): 0=zo, 1=ma...
    const dow = today.getDay()
    const offset = dow === 0 ? 6 : dow - 1
    const start = new Date(today)
    start.setDate(start.getDate() - offset)
    return { start: toISODate(start), end: toISODate(today) }
}

interface Shortcut {
    label: string
    getRange: () => { start: string; end: string }
}

const SHORTCUTS: Shortcut[] = [
    {
        label: 'Vandaag',
        getRange: () => ({ start: daysAgo(0), end: daysAgo(0) }),
    },
    {
        label: 'Gisteren',
        getRange: () => ({ start: daysAgo(1), end: daysAgo(1) }),
    },
    {
        label: 'Eergisteren',
        getRange: () => ({ start: daysAgo(2), end: daysAgo(2) }),
    },
    {
        label: 'Deze week',
        getRange: thisWeekRange,
    },
]

export function DateShortcuts({
    currentStart,
    currentEnd,
    mode = 'range',
    onSelect,
    className,
}: DateShortcutsProps) {
    return (
        <div className={cn('flex flex-wrap items-center gap-2', className)}>
            {SHORTCUTS.map(sc => {
                const range = sc.getRange()
                const isActive =
                    currentStart === range.start &&
                    (mode === 'single' || !currentEnd || currentEnd === range.end)
                return (
                    <button
                        key={sc.label}
                        type="button"
                        onClick={() => onSelect(range.start, range.end)}
                        className={cn(
                            'px-3.5 py-2 rounded-full text-sm font-semibold transition-colors min-h-[40px]',
                            'border',
                            isActive
                                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200'
                                : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white',
                        )}
                    >
                        {sc.label}
                    </button>
                )
            })}
        </div>
    )
}
