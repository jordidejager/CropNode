'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Check, Plus, X, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useWorkSchedule, useUpdateWorkSchedule } from '@/hooks/use-data'
import type { WorkScheduleDay } from '@/lib/types'
import { calcNettoHoursWithBreaks, DEFAULT_WORK_SCHEDULE } from '@/lib/types'
import { SpotlightCard } from './primitives/SpotlightCard'
import { SectionHeader } from './primitives/SectionHeader'

const DAY_LABELS_LONG = ['Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag']
const DAY_LABELS_SHORT = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za']

/**
 * Detecteert of het huidige schema nog "default/leeg" is — ma-vr 07:30-17:00
 * met 12:00-12:30 pauze, za 07:30-12:00. Als alles exact overeenkomt met de
 * defaults, tonen we de pre-fill wizard bovenaan.
 */
function isDefaultSchedule(schedule: WorkScheduleDay[]): boolean {
    if (schedule.length === 0) return true
    for (const day of schedule) {
        const def = DEFAULT_WORK_SCHEDULE.find(d => d.dayOfWeek === day.dayOfWeek)
        if (!def) continue
        if (day.isWorkday !== def.isWorkday) return false
        if (day.isWorkday && (day.startTime !== def.startTime || day.endTime !== def.endTime)) return false
    }
    return true
}

/**
 * Grote toggle (56×32px) — Radix-achtige switch, gelabeld "Werkdag" / "Vrij".
 */
function BigDayToggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            onClick={() => onChange(!on)}
            disabled={disabled}
            className={cn(
                'relative w-14 h-8 rounded-full transition-colors shrink-0',
                'focus-visible:ring-2 focus-visible:ring-emerald-400/60 focus-visible:outline-none',
                on ? 'bg-emerald-500' : 'bg-white/[0.12]',
                disabled && 'opacity-50',
            )}
        >
            <span
                className={cn(
                    'absolute top-1 h-6 w-6 rounded-full bg-white shadow-md transition-transform',
                    on ? 'translate-x-7' : 'translate-x-1',
                )}
            />
        </button>
    )
}

export function WorkScheduleSettings() {
    const { data: schedule = [], isLoading } = useWorkSchedule()
    const updateMutation = useUpdateWorkSchedule()
    const [localSchedule, setLocalSchedule] = React.useState<WorkScheduleDay[]>([])
    const [saved, setSaved] = React.useState(false)
    const [dismissedWizard, setDismissedWizard] = React.useState(false)
    const saveTimeout = React.useRef<NodeJS.Timeout>()

    React.useEffect(() => {
        if (schedule.length > 0 && localSchedule.length === 0) {
            setLocalSchedule(schedule)
        }
    }, [schedule, localSchedule.length])

    const triggerSave = (updated: WorkScheduleDay[]) => {
        if (saveTimeout.current) clearTimeout(saveTimeout.current)
        saveTimeout.current = setTimeout(() => {
            updateMutation.mutate(updated.map(d => ({
                dayOfWeek: d.dayOfWeek,
                isWorkday: d.isWorkday,
                startTime: d.startTime,
                endTime: d.endTime,
                breaks: d.breaks,
            })))
            setSaved(true)
            setTimeout(() => setSaved(false), 2000)
        }, 1200)
    }

    const handleChange = (dayOfWeek: number, field: string, value: unknown) => {
        setLocalSchedule(prev => {
            const updated = prev.map(d => {
                if (d.dayOfWeek !== dayOfWeek) return d
                const newDay = { ...d, [field]: value }
                newDay.nettoHours = calcNettoHoursWithBreaks(newDay.startTime, newDay.endTime, newDay.breaks, newDay.isWorkday)
                return newDay
            })
            triggerSave(updated)
            return updated
        })
    }

    const handleAddBreak = (dayOfWeek: number) => {
        setLocalSchedule(prev => {
            const updated = prev.map(d => {
                if (d.dayOfWeek !== dayOfWeek) return d
                const newBreaks = [...d.breaks, { start: '12:00', end: '12:30' }]
                const newDay = { ...d, breaks: newBreaks }
                newDay.nettoHours = calcNettoHoursWithBreaks(newDay.startTime, newDay.endTime, newBreaks, newDay.isWorkday)
                return newDay
            })
            triggerSave(updated)
            return updated
        })
    }

    const handleUpdateBreak = (dayOfWeek: number, breakIndex: number, field: 'start' | 'end', value: string) => {
        setLocalSchedule(prev => {
            const updated = prev.map(d => {
                if (d.dayOfWeek !== dayOfWeek) return d
                const newBreaks = d.breaks.map((b, i) => i === breakIndex ? { ...b, [field]: value } : b)
                const newDay = { ...d, breaks: newBreaks }
                newDay.nettoHours = calcNettoHoursWithBreaks(newDay.startTime, newDay.endTime, newBreaks, newDay.isWorkday)
                return newDay
            })
            triggerSave(updated)
            return updated
        })
    }

    const handleRemoveBreak = (dayOfWeek: number, breakIndex: number) => {
        setLocalSchedule(prev => {
            const updated = prev.map(d => {
                if (d.dayOfWeek !== dayOfWeek) return d
                const newBreaks = d.breaks.filter((_, i) => i !== breakIndex)
                const newDay = { ...d, breaks: newBreaks }
                newDay.nettoHours = calcNettoHoursWithBreaks(newDay.startTime, newDay.endTime, newBreaks, newDay.isWorkday)
                return newDay
            })
            triggerSave(updated)
            return updated
        })
    }

    /** Pre-fill wizard: pas alle dagen in één klik aan op het klassieke Nederlandse patroon */
    const applyStandardSchedule = () => {
        setLocalSchedule(prev => {
            const updated = prev.map(d => {
                const def = DEFAULT_WORK_SCHEDULE.find(x => x.dayOfWeek === d.dayOfWeek)
                if (!def) return d
                const newDay: WorkScheduleDay = {
                    ...d,
                    isWorkday: def.isWorkday,
                    startTime: def.startTime,
                    endTime: def.endTime,
                    breaks: [...def.breaks],
                }
                newDay.nettoHours = calcNettoHoursWithBreaks(newDay.startTime, newDay.endTime, newDay.breaks, newDay.isWorkday)
                return newDay
            })
            triggerSave(updated)
            return updated
        })
        setDismissedWizard(true)
    }

    // Reorder: Ma-Zo
    const orderedDays = React.useMemo(() => {
        if (localSchedule.length === 0) return []
        return [1, 2, 3, 4, 5, 6, 0].map(dow => localSchedule.find(d => d.dayOfWeek === dow)!).filter(Boolean)
    }, [localSchedule])

    const showWizard = !dismissedWizard && isDefaultSchedule(localSchedule)

    if (isLoading || orderedDays.length === 0) {
        return (
            <SpotlightCard variant="section" color="emerald">
                <div className="h-[200px] animate-pulse bg-white/[0.03] rounded-xl" />
            </SpotlightCard>
        )
    }

    return (
        <SpotlightCard variant="section" color="emerald" className="space-y-5">
            <SectionHeader
                pill="Werkschema"
                color="emerald"
                title="Werkschema"
                description="Gebruikt om uren te berekenen bij het afronden van timers en bij multi-day registraties."
                action={
                    saved ? (
                        <span className="flex items-center gap-1.5 text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 rounded-full px-3 py-1 font-semibold">
                            <Check className="h-3.5 w-3.5" /> Opgeslagen
                        </span>
                    ) : null
                }
            />

            {/* Pre-fill wizard — verschijnt alleen bij default/leeg schema */}
            {showWizard && (
                <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <div className="h-12 w-12 rounded-xl bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                        <Sparkles className="h-5 w-5 text-emerald-300" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-base font-semibold text-white">Werk je het standaardrooster?</h3>
                        <p className="text-sm text-white/60 mt-0.5">
                            Ma-vr 07:30–17:00 met 30 min pauze, zaterdag 07:30–12:00. Past dat ongeveer?
                        </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                            onClick={applyStandardSchedule}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold min-h-[48px] px-4"
                        >
                            <Check className="h-4 w-4 mr-1.5" />
                            Ja, pas toe
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={() => setDismissedWizard(true)}
                            className="text-white/60 hover:text-white hover:bg-white/10 min-h-[48px] px-4"
                        >
                            Nee, zelf instellen
                        </Button>
                    </div>
                </div>
            )}

            <div className="space-y-2.5">
                {orderedDays.map(day => (
                    <div
                        key={day.dayOfWeek}
                        className={cn(
                            'rounded-2xl border transition-colors p-4',
                            day.isWorkday
                                ? 'bg-white/[0.03] border-white/[0.08]'
                                : 'bg-white/[0.01] border-white/[0.04] opacity-70',
                        )}
                    >
                        <div className="flex items-center gap-3 sm:gap-4">
                            <div className="flex items-center gap-3 flex-shrink-0">
                                <span className="text-base font-semibold text-white/90 min-w-[72px] sm:min-w-[90px]">
                                    <span className="hidden sm:inline">{DAY_LABELS_LONG[day.dayOfWeek]}</span>
                                    <span className="sm:hidden">{DAY_LABELS_SHORT[day.dayOfWeek]}</span>
                                </span>
                                <BigDayToggle
                                    on={day.isWorkday}
                                    onChange={(v) => handleChange(day.dayOfWeek, 'isWorkday', v)}
                                />
                                <span className={cn('text-xs font-semibold uppercase tracking-wider w-12', day.isWorkday ? 'text-emerald-300' : 'text-white/30')}>
                                    {day.isWorkday ? 'Werkt' : 'Vrij'}
                                </span>
                            </div>

                            {day.isWorkday ? (
                                <div className="flex-1 flex items-center gap-2 flex-wrap">
                                    <Input
                                        type="time"
                                        value={day.startTime || '07:30'}
                                        onChange={(e) => handleChange(day.dayOfWeek, 'startTime', e.target.value)}
                                        className="bg-white/5 border-white/10 text-white h-12 text-base w-[120px] min-h-[48px]"
                                        aria-label={`Starttijd ${DAY_LABELS_LONG[day.dayOfWeek]}`}
                                    />
                                    <span className="text-white/30 text-sm">tot</span>
                                    <Input
                                        type="time"
                                        value={day.endTime || '17:00'}
                                        onChange={(e) => handleChange(day.dayOfWeek, 'endTime', e.target.value)}
                                        className="bg-white/5 border-white/10 text-white h-12 text-base w-[120px] min-h-[48px]"
                                        aria-label={`Eindtijd ${DAY_LABELS_LONG[day.dayOfWeek]}`}
                                    />
                                    <span
                                        className="ml-auto text-base font-bold text-emerald-300 tabular-nums"
                                        title="Netto werkuren — werktijd min pauzes"
                                    >
                                        {day.nettoHours.toFixed(1).replace('.', ',')}u netto
                                    </span>
                                </div>
                            ) : (
                                <span className="text-sm text-white/30 italic">Geen werkdag</span>
                            )}
                        </div>

                        {/* Breaks */}
                        {day.isWorkday && (
                            <div className="mt-3 pl-2 sm:pl-[120px] space-y-2">
                                {day.breaks.map((brk, bi) => (
                                    <div key={bi} className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm text-white/50 min-w-[56px]">Pauze</span>
                                        <Input
                                            type="time"
                                            value={brk.start}
                                            onChange={(e) => handleUpdateBreak(day.dayOfWeek, bi, 'start', e.target.value)}
                                            className="bg-white/5 border-white/10 text-white h-11 text-sm w-[110px] min-h-[44px]"
                                            aria-label={`Begin pauze ${bi + 1}`}
                                        />
                                        <span className="text-white/30 text-sm">tot</span>
                                        <Input
                                            type="time"
                                            value={brk.end}
                                            onChange={(e) => handleUpdateBreak(day.dayOfWeek, bi, 'end', e.target.value)}
                                            className="bg-white/5 border-white/10 text-white h-11 text-sm w-[110px] min-h-[44px]"
                                            aria-label={`Einde pauze ${bi + 1}`}
                                        />
                                        <span className="text-xs text-white/35 tabular-nums">
                                            {(() => {
                                                const [bs, bsm] = brk.start.split(':').map(Number)
                                                const [be, bem] = brk.end.split(':').map(Number)
                                                return `${(be * 60 + bem) - (bs * 60 + bsm)} min`
                                            })()}
                                        </span>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleRemoveBreak(day.dayOfWeek, bi)}
                                            aria-label={`Pauze ${bi + 1} verwijderen`}
                                            className="h-11 w-11 text-red-300 hover:text-red-200 hover:bg-red-500/15 min-h-[44px]"
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => handleAddBreak(day.dayOfWeek)}
                                    className="flex items-center gap-1.5 text-sm font-semibold text-emerald-300 hover:text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/25 rounded-full px-3 py-2 min-h-[40px] transition-colors"
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                    Pauze toevoegen
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </SpotlightCard>
    )
}
