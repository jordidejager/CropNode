'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckCircle2, Clock, CalendarDays, ArrowRight, ArrowLeft, X } from 'lucide-react'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import type { ActiveTaskSession, WorkScheduleDay, StopDayEntry } from '@/lib/types'
import { DEFAULT_WORK_SCHEDULE, calcNettoHoursWithBreaks } from '@/lib/types'
import {
    dateTimeLocalToDate,
    getDefaultEndDateTime,
} from './utils'
import { SpotlightCard } from './primitives/SpotlightCard'
import { BigStepper } from './primitives/BigStepper'
import { colorForTaskType, tokensFor, type TaskColor } from '@/lib/urenregistratie/task-colors'

/**
 * StopSessionWizard — vervangt StopSessionDialog met een stap-voor-stap flow.
 *
 * Single-day pad (80% case):
 *   1) "Ben je nu klaar?"  → [Ja, stop nu] / [Op ander tijdstip]
 *   2) "Hoeveel uur heeft iedereen gewerkt?"  (auto-berekend, BigStepper)
 *   3) Bevestigen
 *
 * Multi-day pad (timer > 24u):
 *   1) "Je timer loopt X dagen. Was iedereen elke dag bezig?"
 *        → [Ja, verdeel gelijk] / [Nee, per dag invullen]
 *   2a) Gelijk: auto-verdeling op basis van werkschema → Bevestigen
 *   2b) Per dag: wizard door dagen heen (1 dag per scherm) → Bevestigen
 */

interface StopSessionWizardProps {
    session: ActiveTaskSession
    workSchedule: WorkScheduleDay[]
    /** Optionele taak-kleur override via task_types */
    taskColor?: TaskColor
    onStopSimple: (sessionId: string, endTime: Date, hoursPerPerson: number) => void
    onStopMultiDay: (sessionId: string, entries: Array<{ date: string; hoursPerPerson: number; peopleCount: number }>) => void
    onCancel: () => void
    isPending: boolean
}

function getScheduleForDay(dayOfWeek: number, schedule: WorkScheduleDay[]): WorkScheduleDay {
    const found = schedule.find(s => s.dayOfWeek === dayOfWeek)
    if (found) return found
    const def = DEFAULT_WORK_SCHEDULE.find(s => s.dayOfWeek === dayOfWeek)!
    return { ...def, id: `default-${dayOfWeek}`, userId: '' }
}

function timeStr(date: Date): string {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function isMultiDay(startTime: Date): boolean {
    const now = new Date()
    return startTime.toDateString() !== now.toDateString()
}

function autoCalcEndHours(startTime: Date, schedule: WorkScheduleDay[]): number {
    const now = new Date()
    const dow = now.getDay()
    const sched = getScheduleForDay(dow, schedule)
    if (!sched.isWorkday || !sched.startTime || !sched.endTime) {
        // Geen werkdag in schema — pure verschil in tijd
        return Math.round(((now.getTime() - startTime.getTime()) / 3600000) * 2) / 2
    }
    const sameDay = startTime.toDateString() === now.toDateString()
    const effectiveStart = sameDay ? timeStr(startTime) : sched.startTime
    const effectiveEnd = timeStr(now)
    const hours = calcNettoHoursWithBreaks(effectiveStart, sched.endTime, sched.breaks || [], true, effectiveEnd)
    return Math.max(0, Math.round(hours * 2) / 2)
}

function buildMultiDayEntries(
    startTime: Date,
    schedule: WorkScheduleDay[],
    peopleCount: number,
): StopDayEntry[] {
    const entries: StopDayEntry[] = []
    const now = new Date()
    const current = new Date(startTime)
    current.setHours(0, 0, 0, 0)
    const today = new Date(now)
    today.setHours(0, 0, 0, 0)

    while (current <= today) {
        const dow = current.getDay()
        const sched = getScheduleForDay(dow, schedule)
        const dateStr = current.toISOString().split('T')[0]
        const dayLabel = format(current, 'EEE d MMM', { locale: nl })
        const isToday = current.toDateString() === today.toDateString()
        const isStartDay = current.toDateString() === startTime.toDateString()

        let hours = 0
        if (sched.isWorkday && sched.startTime && sched.endTime) {
            if (isToday) {
                const effectiveEnd = timeStr(now) < sched.endTime ? timeStr(now) : sched.endTime
                const effectiveStart = isStartDay ? timeStr(startTime) : sched.startTime
                if (effectiveEnd > effectiveStart) {
                    hours = calcNettoHoursWithBreaks(effectiveStart, sched.endTime, sched.breaks, true, effectiveEnd)
                }
            } else if (isStartDay) {
                hours = calcNettoHoursWithBreaks(timeStr(startTime), sched.endTime, sched.breaks, true)
            } else {
                hours = sched.nettoHours
            }
            hours = Math.round(hours * 2) / 2
            hours = Math.max(0, hours)
        }

        entries.push({
            date: dateStr,
            dayLabel,
            hoursPerPerson: hours,
            peopleCount,
            isWorkday: sched.isWorkday,
        })

        current.setDate(current.getDate() + 1)
    }

    return entries
}

// Animatie: slide left-right tussen stappen
const stepVariants = {
    enter: (direction: 1 | -1) => ({ opacity: 0, x: direction * 40 }),
    center: { opacity: 1, x: 0 },
    exit: (direction: 1 | -1) => ({ opacity: 0, x: -direction * 40 }),
}

export function StopSessionWizard({
    session,
    workSchedule,
    taskColor,
    onStopSimple,
    onStopMultiDay,
    onCancel,
    isPending,
}: StopSessionWizardProps) {
    const color: TaskColor = taskColor ?? colorForTaskType(session.taskTypeId)
    const tokens = tokensFor(color)
    const multiDay = isMultiDay(session.startTime)

    // Single-day state
    const [singleStep, setSingleStep] = React.useState<'when' | 'hours' | 'confirm'>('when')
    const [endMode, setEndMode] = React.useState<'now' | 'custom'>('now')
    const [customEndDateTime, setCustomEndDateTime] = React.useState(() => getDefaultEndDateTime(session.startTime))
    const [hoursPerPerson, setHoursPerPerson] = React.useState(() => autoCalcEndHours(session.startTime, workSchedule))

    // Multi-day state
    const [multiStep, setMultiStep] = React.useState<'mode' | 'equal' | 'perDay' | 'confirm'>('mode')
    const [dayEntries, setDayEntries] = React.useState<StopDayEntry[]>(() =>
        buildMultiDayEntries(session.startTime, workSchedule, session.peopleCount),
    )
    const [currentDayIdx, setCurrentDayIdx] = React.useState(0)

    const [direction, setDirection] = React.useState<1 | -1>(1)

    // Helpers
    const go = (fn: () => void, dir: 1 | -1 = 1) => {
        setDirection(dir)
        fn()
    }

    const handleStopNow = () => {
        onStopSimple(session.id, new Date(), hoursPerPerson)
    }
    const handleStopCustom = () => {
        onStopSimple(session.id, dateTimeLocalToDate(customEndDateTime), hoursPerPerson)
    }
    const handleSubmitMulti = () => {
        const validEntries = dayEntries
            .filter(e => e.hoursPerPerson > 0 && e.peopleCount > 0)
            .map(e => ({ date: e.date, hoursPerPerson: e.hoursPerPerson, peopleCount: e.peopleCount }))
        onStopMultiDay(session.id, validEntries)
    }

    const totalMultiHours = dayEntries.reduce((sum, e) => sum + e.hoursPerPerson * e.peopleCount, 0)
    const totalSingleHours = hoursPerPerson * session.peopleCount

    const StepShell: React.FC<{ children: React.ReactNode; stepKey: string }> = ({ children, stepKey }) => (
        <motion.div
            key={stepKey}
            custom={direction}
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="space-y-5"
        >
            {children}
        </motion.div>
    )

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in-0"
            onClick={onCancel}
        >
            <div
                className="w-full max-w-lg"
                onClick={(e) => e.stopPropagation()}
            >
                <SpotlightCard variant="section" color={color} className="space-y-5">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <div className="flex items-center gap-2 mb-1.5">
                                <span className={cn('h-2.5 w-2.5 rounded-full animate-pulse', tokens.orb)} />
                                <span className={cn('text-xs font-semibold uppercase tracking-widest', tokens.text)}>
                                    Taak afronden
                                </span>
                            </div>
                            <h2 className="text-xl font-bold text-white">
                                {session.taskTypeName}
                            </h2>
                            {session.subParcelName && (
                                <p className="text-sm text-white/60 mt-0.5">{session.subParcelName}</p>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={onCancel}
                            disabled={isPending}
                            aria-label="Sluiten"
                            className="h-10 w-10 flex items-center justify-center rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    {/* Content — stap per stap */}
                    <AnimatePresence mode="wait" custom={direction}>
                        {!multiDay && singleStep === 'when' && (
                            <StepShell stepKey="single-when">
                                <div>
                                    <h3 className="text-lg font-semibold text-white mb-1">
                                        Ben je nu klaar?
                                    </h3>
                                    <p className="text-sm text-white/60">
                                        Kies of je nu stopt, of de taak op een ander tijdstip is afgerond.
                                    </p>
                                </div>
                                <div className="grid gap-3">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setEndMode('now')
                                            setHoursPerPerson(autoCalcEndHours(session.startTime, workSchedule))
                                            go(() => setSingleStep('hours'))
                                        }}
                                        className={cn(
                                            'flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all min-h-[64px]',
                                            'bg-emerald-500/15 border-emerald-500/40 text-emerald-100 hover:bg-emerald-500/25 hover:border-emerald-400/60',
                                        )}
                                    >
                                        <CheckCircle2 className="h-6 w-6 text-emerald-300 flex-shrink-0" />
                                        <div className="flex-1">
                                            <div className="font-semibold">Ja, stop nu</div>
                                            <div className="text-xs text-emerald-200/70">Eindtijd is dit moment</div>
                                        </div>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setEndMode('custom')
                                            go(() => setSingleStep('hours'))
                                        }}
                                        className={cn(
                                            'flex items-center gap-3 p-4 rounded-2xl border text-left transition-all min-h-[64px]',
                                            'bg-white/[0.03] border-white/[0.10] text-white hover:bg-white/[0.06] hover:border-white/[0.18]',
                                        )}
                                    >
                                        <Clock className="h-6 w-6 text-white/60 flex-shrink-0" />
                                        <div className="flex-1">
                                            <div className="font-semibold">Op een ander tijdstip</div>
                                            <div className="text-xs text-white/50">Kies zelf wanneer het klaar was</div>
                                        </div>
                                    </button>
                                </div>
                            </StepShell>
                        )}

                        {!multiDay && singleStep === 'hours' && (
                            <StepShell stepKey="single-hours">
                                <div>
                                    <h3 className="text-lg font-semibold text-white mb-1">
                                        Hoeveel uur heeft iedereen gewerkt?
                                    </h3>
                                    <p className="text-sm text-white/60">
                                        We hebben een voorstel berekend op basis van je werkschema — pas gerust aan.
                                    </p>
                                </div>

                                {endMode === 'custom' && (
                                    <div className="space-y-2">
                                        <Label className="text-sm font-semibold text-white/80">Eindtijd</Label>
                                        <Input
                                            type="datetime-local"
                                            value={customEndDateTime}
                                            onChange={(e) => setCustomEndDateTime(e.target.value)}
                                            className="bg-white/5 border-white/10 text-white h-14 text-base"
                                        />
                                    </div>
                                )}

                                <BigStepper
                                    label="Uren per persoon"
                                    value={hoursPerPerson}
                                    onChange={setHoursPerPerson}
                                    min={0}
                                    max={24}
                                    step={0.5}
                                    suffix="uur"
                                />

                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="ghost"
                                        onClick={() => go(() => setSingleStep('when'), -1)}
                                        className="min-h-[52px] px-4 text-white/70 hover:text-white hover:bg-white/10"
                                    >
                                        <ArrowLeft className="h-4 w-4 mr-1.5" />
                                        Terug
                                    </Button>
                                    <Button
                                        onClick={() => go(() => setSingleStep('confirm'))}
                                        disabled={hoursPerPerson <= 0}
                                        className="flex-1 min-h-[56px] bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-base"
                                    >
                                        Volgende
                                        <ArrowRight className="h-5 w-5 ml-2" />
                                    </Button>
                                </div>
                            </StepShell>
                        )}

                        {!multiDay && singleStep === 'confirm' && (
                            <StepShell stepKey="single-confirm">
                                <div>
                                    <h3 className="text-lg font-semibold text-white mb-1">
                                        Klopt dit?
                                    </h3>
                                    <p className="text-sm text-white/60">
                                        Controleer de samenvatting en bevestig.
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 space-y-3">
                                    <div className="flex items-baseline justify-between">
                                        <span className="text-sm text-white/60">Uren per persoon</span>
                                        <span className="text-2xl font-bold text-white tabular-nums">
                                            {hoursPerPerson.toFixed(1).replace('.', ',')}
                                        </span>
                                    </div>
                                    <div className="flex items-baseline justify-between">
                                        <span className="text-sm text-white/60">Aantal personen</span>
                                        <span className="text-2xl font-bold text-white tabular-nums">
                                            {session.peopleCount}
                                        </span>
                                    </div>
                                    <div className="flex items-baseline justify-between border-t border-white/[0.08] pt-3">
                                        <span className="text-sm font-semibold text-emerald-300">Totaal</span>
                                        <span className="text-3xl font-black text-emerald-300 tabular-nums">
                                            {totalSingleHours.toFixed(1).replace('.', ',')} uur
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="ghost"
                                        onClick={() => go(() => setSingleStep('hours'), -1)}
                                        disabled={isPending}
                                        className="min-h-[56px] px-4 text-white/70 hover:text-white hover:bg-white/10"
                                    >
                                        <ArrowLeft className="h-4 w-4 mr-1.5" />
                                        Aanpassen
                                    </Button>
                                    <Button
                                        onClick={endMode === 'now' ? handleStopNow : handleStopCustom}
                                        disabled={isPending}
                                        className="flex-1 min-h-[64px] bg-emerald-500 hover:bg-emerald-600 text-white font-black text-lg shadow-lg shadow-emerald-500/20"
                                    >
                                        {isPending ? (
                                            <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                        ) : (
                                            <>
                                                <CheckCircle2 className="h-5 w-5 mr-2" />
                                                Bevestig en sla op
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </StepShell>
                        )}

                        {/* MULTI-DAY PAD */}

                        {multiDay && multiStep === 'mode' && (
                            <StepShell stepKey="multi-mode">
                                <div>
                                    <h3 className="text-lg font-semibold text-white mb-1">
                                        Je timer loopt {dayEntries.length} dagen
                                    </h3>
                                    <p className="text-sm text-white/60">
                                        Was iedereen elke dag bezig, of wisselde het per dag?
                                    </p>
                                </div>
                                <div className="grid gap-3">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            go(() => setMultiStep('equal'))
                                        }}
                                        className={cn(
                                            'flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all min-h-[64px]',
                                            'bg-emerald-500/15 border-emerald-500/40 text-emerald-100 hover:bg-emerald-500/25 hover:border-emerald-400/60',
                                        )}
                                    >
                                        <CalendarDays className="h-6 w-6 text-emerald-300 flex-shrink-0" />
                                        <div className="flex-1">
                                            <div className="font-semibold">Elke dag gelijk (standaard)</div>
                                            <div className="text-xs text-emerald-200/70">Gebaseerd op je werkschema</div>
                                        </div>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setCurrentDayIdx(0)
                                            go(() => setMultiStep('perDay'))
                                        }}
                                        className={cn(
                                            'flex items-center gap-3 p-4 rounded-2xl border text-left transition-all min-h-[64px]',
                                            'bg-white/[0.03] border-white/[0.10] text-white hover:bg-white/[0.06] hover:border-white/[0.18]',
                                        )}
                                    >
                                        <Clock className="h-6 w-6 text-white/60 flex-shrink-0" />
                                        <div className="flex-1">
                                            <div className="font-semibold">Per dag invullen</div>
                                            <div className="text-xs text-white/50">Wijzig uren/personen per dag</div>
                                        </div>
                                    </button>
                                </div>
                            </StepShell>
                        )}

                        {multiDay && multiStep === 'equal' && (
                            <StepShell stepKey="multi-equal">
                                <div>
                                    <h3 className="text-lg font-semibold text-white mb-1">
                                        Gelijk verdeeld
                                    </h3>
                                    <p className="text-sm text-white/60">
                                        Per dag zoals in je werkschema, {session.peopleCount} personen per dag.
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 max-h-60 overflow-y-auto space-y-1.5">
                                    {dayEntries.map(e => (
                                        <div
                                            key={e.date}
                                            className={cn(
                                                'flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl',
                                                e.isWorkday ? 'bg-white/[0.03]' : 'bg-white/[0.01] opacity-60',
                                            )}
                                        >
                                            <span className="text-sm font-medium text-white/80 capitalize">{e.dayLabel}</span>
                                            <div className="flex items-center gap-3 text-sm">
                                                <span className="text-white/60 tabular-nums">
                                                    {e.hoursPerPerson.toFixed(1).replace('.', ',')}u × {e.peopleCount}
                                                </span>
                                                <span className={cn('font-bold tabular-nums', e.isWorkday ? 'text-emerald-300' : 'text-white/30')}>
                                                    {(e.hoursPerPerson * e.peopleCount).toFixed(1).replace('.', ',')}u
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.07] p-4 flex items-center justify-between">
                                    <span className="text-sm font-semibold text-emerald-200">Totaal</span>
                                    <span className="text-3xl font-black text-emerald-300 tabular-nums">
                                        {totalMultiHours.toFixed(1).replace('.', ',')} uur
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="ghost"
                                        onClick={() => go(() => setMultiStep('mode'), -1)}
                                        disabled={isPending}
                                        className="min-h-[56px] px-4 text-white/70 hover:text-white hover:bg-white/10"
                                    >
                                        <ArrowLeft className="h-4 w-4 mr-1.5" />
                                        Terug
                                    </Button>
                                    <Button
                                        onClick={handleSubmitMulti}
                                        disabled={isPending || totalMultiHours <= 0}
                                        className="flex-1 min-h-[64px] bg-emerald-500 hover:bg-emerald-600 text-white font-black text-lg shadow-lg shadow-emerald-500/20"
                                    >
                                        {isPending ? (
                                            <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                        ) : (
                                            <>
                                                <CheckCircle2 className="h-5 w-5 mr-2" />
                                                Bevestig en sla op
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </StepShell>
                        )}

                        {multiDay && multiStep === 'perDay' && (
                            <StepShell stepKey={`multi-perday-${currentDayIdx}`}>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-lg font-semibold text-white mb-1 capitalize">
                                            {dayEntries[currentDayIdx]?.dayLabel}
                                        </h3>
                                        <p className="text-sm text-white/60">
                                            Dag {currentDayIdx + 1} van {dayEntries.length}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {dayEntries.map((_, idx) => (
                                            <span
                                                key={idx}
                                                className={cn(
                                                    'h-1.5 w-5 rounded-full transition-colors',
                                                    idx === currentDayIdx
                                                        ? 'bg-emerald-400'
                                                        : idx < currentDayIdx
                                                          ? 'bg-emerald-400/50'
                                                          : 'bg-white/15',
                                                )}
                                            />
                                        ))}
                                    </div>
                                </div>
                                <div className="grid gap-4">
                                    <BigStepper
                                        label="Aantal personen"
                                        value={dayEntries[currentDayIdx]?.peopleCount ?? 0}
                                        onChange={(v) => {
                                            setDayEntries(prev =>
                                                prev.map((e, i) => (i === currentDayIdx ? { ...e, peopleCount: v } : e)),
                                            )
                                        }}
                                        min={0}
                                        max={50}
                                        step={1}
                                        suffix={dayEntries[currentDayIdx]?.peopleCount === 1 ? 'persoon' : 'personen'}
                                    />
                                    <BigStepper
                                        label="Uren per persoon"
                                        value={dayEntries[currentDayIdx]?.hoursPerPerson ?? 0}
                                        onChange={(v) => {
                                            setDayEntries(prev =>
                                                prev.map((e, i) => (i === currentDayIdx ? { ...e, hoursPerPerson: v } : e)),
                                            )
                                        }}
                                        min={0}
                                        max={24}
                                        step={0.5}
                                        suffix="uur"
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="ghost"
                                        onClick={() => {
                                            if (currentDayIdx === 0) {
                                                go(() => setMultiStep('mode'), -1)
                                            } else {
                                                go(() => setCurrentDayIdx(i => i - 1), -1)
                                            }
                                        }}
                                        disabled={isPending}
                                        className="min-h-[56px] px-4 text-white/70 hover:text-white hover:bg-white/10"
                                    >
                                        <ArrowLeft className="h-4 w-4 mr-1.5" />
                                        Terug
                                    </Button>
                                    {currentDayIdx < dayEntries.length - 1 ? (
                                        <Button
                                            onClick={() => go(() => setCurrentDayIdx(i => i + 1))}
                                            className="flex-1 min-h-[56px] bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-base"
                                        >
                                            Volgende dag
                                            <ArrowRight className="h-5 w-5 ml-2" />
                                        </Button>
                                    ) : (
                                        <Button
                                            onClick={() => go(() => setMultiStep('confirm'))}
                                            className="flex-1 min-h-[56px] bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-base"
                                        >
                                            Samenvatting
                                            <ArrowRight className="h-5 w-5 ml-2" />
                                        </Button>
                                    )}
                                </div>
                            </StepShell>
                        )}

                        {multiDay && multiStep === 'confirm' && (
                            <StepShell stepKey="multi-confirm">
                                <div>
                                    <h3 className="text-lg font-semibold text-white mb-1">Klopt dit?</h3>
                                    <p className="text-sm text-white/60">Samenvatting van alle dagen.</p>
                                </div>
                                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 max-h-60 overflow-y-auto space-y-1.5">
                                    {dayEntries.map(e => (
                                        <div
                                            key={e.date}
                                            className={cn(
                                                'flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl',
                                                e.hoursPerPerson > 0 ? 'bg-white/[0.03]' : 'bg-white/[0.01] opacity-60',
                                            )}
                                        >
                                            <span className="text-sm font-medium text-white/80 capitalize">{e.dayLabel}</span>
                                            <div className="flex items-center gap-3 text-sm">
                                                <span className="text-white/60 tabular-nums">
                                                    {e.hoursPerPerson.toFixed(1).replace('.', ',')}u × {e.peopleCount}
                                                </span>
                                                <span className={cn('font-bold tabular-nums', e.hoursPerPerson > 0 ? 'text-emerald-300' : 'text-white/30')}>
                                                    {(e.hoursPerPerson * e.peopleCount).toFixed(1).replace('.', ',')}u
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.07] p-4 flex items-center justify-between">
                                    <span className="text-sm font-semibold text-emerald-200">Totaal</span>
                                    <span className="text-3xl font-black text-emerald-300 tabular-nums">
                                        {totalMultiHours.toFixed(1).replace('.', ',')} uur
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="ghost"
                                        onClick={() => go(() => setMultiStep('perDay'), -1)}
                                        disabled={isPending}
                                        className="min-h-[56px] px-4 text-white/70 hover:text-white hover:bg-white/10"
                                    >
                                        <ArrowLeft className="h-4 w-4 mr-1.5" />
                                        Aanpassen
                                    </Button>
                                    <Button
                                        onClick={handleSubmitMulti}
                                        disabled={isPending || totalMultiHours <= 0}
                                        className="flex-1 min-h-[64px] bg-emerald-500 hover:bg-emerald-600 text-white font-black text-lg shadow-lg shadow-emerald-500/20"
                                    >
                                        {isPending ? (
                                            <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                        ) : (
                                            <>
                                                <CheckCircle2 className="h-5 w-5 mr-2" />
                                                Bevestig en sla op
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </StepShell>
                        )}
                    </AnimatePresence>
                </SpotlightCard>
            </div>
        </div>
    )
}
