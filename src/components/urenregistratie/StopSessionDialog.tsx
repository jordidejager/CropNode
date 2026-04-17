'use client'

import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Square, CalendarDays } from 'lucide-react'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import type { ActiveTaskSession, WorkScheduleDay, StopDayEntry } from '@/lib/types'
import { DEFAULT_WORK_SCHEDULE, calcNettoHoursWithBreaks } from '@/lib/types'
import { formatDateTime, dateTimeLocalToDate, getDefaultEndDateTime, getStandardHoursForDay } from './utils'

interface StopSessionDialogProps {
    session: ActiveTaskSession
    workSchedule: WorkScheduleDay[]
    onStopSimple: (sessionId: string, endTime: Date, hoursPerPerson: number) => void
    onStopMultiDay: (sessionId: string, entries: Array<{ date: string; hoursPerPerson: number; peopleCount: number }>) => void
    onCancel: () => void
    isPending: boolean
}

function isMultiDay(startTime: Date): boolean {
    const now = new Date()
    return startTime.toDateString() !== now.toDateString()
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

function buildDayEntries(startTime: Date, schedule: WorkScheduleDay[], defaultPeopleCount: number): StopDayEntry[] {
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
                // Vandaag: bereken tot huidige tijd, met alleen pauzes die daarvoor vallen
                const effectiveEndTime = now.getHours() * 60 + now.getMinutes() >=
                    parseInt(sched.endTime.split(':')[0]) * 60 + parseInt(sched.endTime.split(':')[1])
                    ? sched.endTime : timeStr(now)
                const effectiveStartTime = isStartDay ? timeStr(startTime) : sched.startTime
                hours = calcNettoHoursWithBreaks(effectiveStartTime, sched.endTime, sched.breaks, true, effectiveEndTime)
            } else if (isStartDay) {
                // Startdag (niet vandaag): van starttijd tot schema-eind, met pauzes
                hours = calcNettoHoursWithBreaks(timeStr(startTime), sched.endTime, sched.breaks, true)
            } else {
                // Volle werkdag: schema start tot eind met alle pauzes
                hours = sched.nettoHours
            }
            hours = Math.round(hours * 2) / 2
            hours = Math.max(0, hours)
        }

        entries.push({
            date: dateStr,
            dayLabel,
            hoursPerPerson: hours,
            peopleCount: defaultPeopleCount,
            isWorkday: sched.isWorkday,
        })

        current.setDate(current.getDate() + 1)
    }

    return entries
}

export function StopSessionDialog({ session, workSchedule, onStopSimple, onStopMultiDay, onCancel, isPending }: StopSessionDialogProps) {
    const multiDay = isMultiDay(session.startTime)

    // === Simple (same-day) state ===
    const [stopEndDateTime, setStopEndDateTime] = React.useState<string>(() => getDefaultEndDateTime(session.startTime))
    const [stopHoursPerPerson, setStopHoursPerPerson] = React.useState<number>(() => {
        // Gebruik werkschema voor berekening
        const now = new Date()
        const dow = now.getDay()
        const sched = getScheduleForDay(dow, workSchedule)

        if (sched.isWorkday && sched.startTime && sched.endTime) {
            const startTimeStr = timeStr(session.startTime)
            const nowTimeStr = timeStr(now)
            const endCap = nowTimeStr < sched.endTime ? nowTimeStr : sched.endTime
            if (endCap > startTimeStr) {
                let hours = calcNettoHoursWithBreaks(startTimeStr, sched.endTime, sched.breaks, true, endCap)
                hours = Math.round(hours * 2) / 2
                return Math.max(0.5, hours)
            }
        }

        // Fallback
        let hours = getStandardHoursForDay(now)
        hours = Math.round(hours * 2) / 2
        return Math.max(0.5, hours)
    })

    // === Multi-day state ===
    const [dayEntries, setDayEntries] = React.useState<StopDayEntry[]>(() =>
        multiDay ? buildDayEntries(session.startTime, workSchedule, session.peopleCount) : []
    )

    const handleDayChange = (index: number, field: 'hoursPerPerson' | 'peopleCount', value: number) => {
        setDayEntries(prev => prev.map((e, i) => i === index ? { ...e, [field]: value } : e))
    }

    const totalHoursMultiDay = dayEntries.reduce((sum, e) => sum + (e.hoursPerPerson * e.peopleCount), 0)
    const workDayCount = dayEntries.filter(e => e.hoursPerPerson > 0).length

    const handleSubmitSimple = () => {
        onStopSimple(session.id, dateTimeLocalToDate(stopEndDateTime), stopHoursPerPerson)
    }

    const handleSubmitMultiDay = () => {
        onStopMultiDay(session.id, dayEntries.map(e => ({
            date: e.date,
            hoursPerPerson: e.hoursPerPerson,
            peopleCount: e.peopleCount,
        })))
    }

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <Card className="bg-slate-900 border-white/10 w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
                <CardHeader className="shrink-0">
                    <CardTitle className="text-white text-xl flex items-center gap-2">
                        <Square className="h-5 w-5 text-emerald-400" />
                        Taak afronden
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 overflow-y-auto">
                    {/* Session info */}
                    <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                        <div className="font-bold text-white text-base">{session.taskTypeName}</div>
                        <div className="text-sm text-white/70 mt-1">
                            Gestart: {formatDateTime(session.startTime)}
                        </div>
                        <div className="text-sm text-white/70">
                            {session.peopleCount} {session.peopleCount === 1 ? 'persoon' : 'personen'}
                        </div>
                    </div>

                    {multiDay ? (
                        /* ===== MULTI-DAY BREAKDOWN ===== */
                        <>
                            <div className="flex items-center gap-2 px-1">
                                <CalendarDays className="h-4 w-4 text-emerald-400" />
                                <span className="text-sm font-semibold text-white/80">
                                    Per dag uitgesplitst ({workDayCount} {workDayCount === 1 ? 'werkdag' : 'werkdagen'})
                                </span>
                            </div>

                            <p className="text-sm text-white/70 bg-white/[0.03] rounded-lg px-3 py-2 border border-white/10">
                                Zet uren op 0 om een dag over te slaan. Pas personen aan als je die dag extra hulp had.
                            </p>

                            <div className="space-y-1">
                                {/* Header */}
                                <div className="grid grid-cols-[1fr_80px_70px_64px] gap-2 px-2 text-xs font-semibold text-white/70">
                                    <span>Datum</span>
                                    <span className="text-center">Uren/pp</span>
                                    <span className="text-center">Pers.</span>
                                    <span className="text-right">Totaal</span>
                                </div>

                                {dayEntries.map((entry, i) => (
                                    <div
                                        key={entry.date}
                                        className={cn(
                                            "grid grid-cols-[1fr_80px_70px_64px] gap-2 items-center px-2 py-1.5 rounded-lg",
                                            entry.isWorkday && entry.hoursPerPerson > 0
                                                ? "bg-white/[0.04]"
                                                : "bg-white/[0.02] opacity-60"
                                        )}
                                    >
                                        <span className="text-sm text-white font-medium">{entry.dayLabel}</span>
                                        {entry.isWorkday ? (
                                            <>
                                                <Input
                                                    type="number"
                                                    min={0}
                                                    step={0.5}
                                                    value={entry.hoursPerPerson}
                                                    onChange={(e) => handleDayChange(i, 'hoursPerPerson', Math.max(0, parseFloat(e.target.value) || 0))}
                                                    aria-label={`Uren per persoon op ${entry.dayLabel}`}
                                                    className="bg-white/10 border-white/20 text-white h-9 text-sm text-center"
                                                />
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    value={entry.peopleCount}
                                                    onChange={(e) => handleDayChange(i, 'peopleCount', Math.max(1, parseInt(e.target.value) || 1))}
                                                    aria-label={`Aantal personen op ${entry.dayLabel}`}
                                                    className="bg-white/10 border-white/20 text-white h-9 text-sm text-center"
                                                />
                                                <span className="text-sm font-semibold text-white text-right">
                                                    {(entry.hoursPerPerson * entry.peopleCount).toFixed(1)}u
                                                </span>
                                            </>
                                        ) : (
                                            <>
                                                <span className="text-sm text-white/40 text-center">—</span>
                                                <span className="text-sm text-white/40 text-center">—</span>
                                                <span className="text-sm text-white/40 text-right">vrij</span>
                                            </>
                                        )}
                                    </div>
                                ))}

                                {/* Totaal */}
                                <div className="grid grid-cols-[1fr_80px_70px_64px] gap-2 px-2 py-2 border-t-2 border-white/15 mt-2">
                                    <span className="text-sm font-bold text-white">Totaal</span>
                                    <span></span>
                                    <span></span>
                                    <span className="text-base font-black text-emerald-400 text-right">
                                        {totalHoursMultiDay.toFixed(1)}u
                                    </span>
                                </div>
                            </div>
                        </>
                    ) : (
                        /* ===== SIMPLE (SAME-DAY) ===== */
                        <>
                            <div className="space-y-2">
                                <Label className="text-white/80 text-sm font-semibold">Eindtijd</Label>
                                <Input
                                    type="datetime-local"
                                    value={stopEndDateTime}
                                    onChange={(e) => setStopEndDateTime(e.target.value)}
                                    className="bg-white/5 border-white/10 text-white h-12 text-base"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label className="text-white/80 text-sm font-semibold">Uren per persoon</Label>
                                <Input
                                    type="number"
                                    min={0.5}
                                    step={0.5}
                                    value={stopHoursPerPerson}
                                    onChange={(e) => setStopHoursPerPerson(Math.max(0.5, parseFloat(e.target.value) || 0.5))}
                                    className="bg-white/5 border-white/10 text-white h-12 text-base"
                                />
                                <div className="flex justify-between text-sm text-white/60">
                                    <span>Totaal: <span className="font-semibold text-white/80">{(session.peopleCount * stopHoursPerPerson).toFixed(1)} uur</span></span>
                                    <span>Voorstel uit werkschema</span>
                                </div>
                            </div>
                        </>
                    )}

                    {/* Buttons */}
                    <div className="flex gap-2 pt-2">
                        <Button
                            variant="ghost"
                            onClick={onCancel}
                            className="flex-1 text-white/80 hover:text-white hover:bg-white/10 h-12 text-base font-semibold"
                        >
                            Annuleren
                        </Button>
                        <Button
                            onClick={multiDay ? handleSubmitMultiDay : handleSubmitSimple}
                            disabled={isPending}
                            className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold h-12 text-base"
                        >
                            {isPending ? (
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                    Opslaan...
                                </div>
                            ) : multiDay ? (
                                `${workDayCount} ${workDayCount === 1 ? 'dag' : 'dagen'} opslaan`
                            ) : (
                                "Afronden & opslaan"
                            )}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
