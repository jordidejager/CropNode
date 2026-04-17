'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { dateToDateTimeLocal } from './utils'

/**
 * Snelkeuze-chips voor startTijd van een timer.
 *
 * Use-case: "ik ben vergeten de timer aan te zetten, ik werk al een uur"
 * Oudere gebruikers typen geen datetime-local velden — chips zijn sneller.
 */

interface TimeShortcutsProps {
    currentValue: string  // datetime-local string
    onSelect: (value: string) => void
    className?: string
}

interface Shortcut {
    label: string
    minutesAgo: number
}

const SHORTCUTS: Shortcut[] = [
    { label: 'Nu', minutesAgo: 0 },
    { label: '30 min geleden', minutesAgo: 30 },
    { label: '1 uur geleden', minutesAgo: 60 },
    { label: '2 uur geleden', minutesAgo: 120 },
    { label: '3 uur geleden', minutesAgo: 180 },
]

function computeValue(minutesAgo: number): string {
    const d = new Date()
    d.setMinutes(d.getMinutes() - minutesAgo)
    // Rond af op 5 minuten voor net oogende tijden
    const rounded = Math.round(d.getMinutes() / 5) * 5
    d.setMinutes(rounded, 0, 0)
    return dateToDateTimeLocal(d)
}

export function TimeShortcuts({ currentValue, onSelect, className }: TimeShortcutsProps) {
    return (
        <div className={cn('flex flex-wrap items-center gap-2', className)}>
            {SHORTCUTS.map(sc => {
                const value = computeValue(sc.minutesAgo)
                // "Actief" als waarde dicht bij de huidige keuze ligt (binnen 3 min)
                const isActive = (() => {
                    if (!currentValue) return false
                    const current = new Date(currentValue).getTime()
                    const target = new Date(value).getTime()
                    return Math.abs(current - target) < 3 * 60 * 1000
                })()

                return (
                    <button
                        key={sc.label}
                        type="button"
                        onClick={() => onSelect(value)}
                        className={cn(
                            'px-3.5 py-2 rounded-full text-sm font-semibold transition-colors min-h-[40px] border',
                            isActive
                                ? 'bg-orange-500/20 border-orange-500/40 text-orange-200'
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
