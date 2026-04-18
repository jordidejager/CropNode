'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Timer, Users, MapPin, Calendar, Edit2, Square, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ActiveTaskSession, WorkScheduleDay, TaskType } from '@/lib/types'
import { DEFAULT_WORK_SCHEDULE, calcNettoHoursWithBreaks } from '@/lib/types'
import { formatDateTime, dateToDateTimeLocal, dateTimeLocalToDate } from './utils'
import { ConfirmDialog } from './ConfirmDialog'
import { SpotlightCard } from './primitives/SpotlightCard'
import { SectionHeader } from './primitives/SectionHeader'
import { colorForTaskType, tokensFor, type TaskColor } from '@/lib/urenregistratie/task-colors'

/**
 * Bereken netto werkuren sinds starttijd op basis van werkschema.
 * Telt per dag de werkuren op, rekening houdend met pauzes.
 */
function calcNettoWorkedHours(startTime: Date, schedule: WorkScheduleDay[]): number {
    const now = new Date()
    const current = new Date(startTime)
    current.setHours(0, 0, 0, 0)
    const today = new Date(now)
    today.setHours(0, 0, 0, 0)

    let total = 0
    while (current <= today) {
        const dow = current.getDay()
        const sched = schedule.find(s => s.dayOfWeek === dow)
            || DEFAULT_WORK_SCHEDULE.find(s => s.dayOfWeek === dow)!
        const isToday = current.toDateString() === today.toDateString()
        const isStartDay = current.toDateString() === startTime.toDateString()

        if (sched.isWorkday && sched.startTime && sched.endTime) {
            const effectiveStart = isStartDay
                ? `${String(startTime.getHours()).padStart(2, '0')}:${String(startTime.getMinutes()).padStart(2, '0')}`
                : sched.startTime

            if (isToday) {
                const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
                const endCap = nowTime < sched.endTime ? nowTime : sched.endTime
                if (endCap > effectiveStart) {
                    total += calcNettoHoursWithBreaks(effectiveStart, sched.endTime, sched.breaks || [], true, endCap)
                }
            } else {
                total += calcNettoHoursWithBreaks(effectiveStart, sched.endTime, sched.breaks || [], true)
            }
        }
        current.setDate(current.getDate() + 1)
    }

    return Math.round(total * 2) / 2 // round to 0.5
}

function formatWorkedHours(hours: number): string {
    const h = Math.floor(hours)
    const m = Math.round((hours - h) * 60)
    if (h === 0) return `${m}m`
    if (m === 0) return `${h}u`
    return `${h}u ${m}m`
}

interface ActiveSessionsProps {
    sessions: ActiveTaskSession[]
    workSchedule: WorkScheduleDay[]
    /** Taaktypes voor kleur-lookup (optioneel — als undefined wordt hash gebruikt) */
    taskTypes?: TaskType[]
    onStop: (session: ActiveTaskSession) => void
    onDelete: (id: string) => void
    onUpdate: (id: string, updates: { startTime?: Date; peopleCount?: number; notes?: string | null }) => void
}

const LABEL_CLASS = 'text-white/70 text-xs font-semibold'

export function ActiveSessions({ sessions, workSchedule, taskTypes, onStop, onDelete, onUpdate }: ActiveSessionsProps) {
    const [editingSession, setEditingSession] = React.useState<string | null>(null)
    const [editStartDateTime, setEditStartDateTime] = React.useState<string>('')
    const [editPeopleCount, setEditPeopleCount] = React.useState<number>(1)
    const [editNotes, setEditNotes] = React.useState<string>('')
    const [deletingSession, setDeletingSession] = React.useState<ActiveTaskSession | null>(null)

    // Timer tick
    const [, setTick] = React.useState(0)
    React.useEffect(() => {
        if (sessions.length === 0) return
        const interval = setInterval(() => setTick(t => t + 1), 60000)
        return () => clearInterval(interval)
    }, [sessions.length])

    // Helper: kleur voor sessie via taskTypeId (inclusief optionele override uit taskTypes)
    const getSessionColor = React.useCallback(
        (taskTypeId: string): TaskColor => {
            const tt = taskTypes?.find(t => t.id === taskTypeId)
            return colorForTaskType(taskTypeId, tt?.color ?? null)
        },
        [taskTypes],
    )

    if (sessions.length === 0) return null

    const handleSave = (sessionId: string) => {
        onUpdate(sessionId, {
            startTime: dateTimeLocalToDate(editStartDateTime),
            peopleCount: editPeopleCount,
            notes: editNotes || null,
        })
        setEditingSession(null)
    }

    const startEditing = (session: ActiveTaskSession) => {
        setEditingSession(session.id)
        setEditStartDateTime(dateToDateTimeLocal(session.startTime))
        setEditPeopleCount(session.peopleCount)
        setEditNotes(session.notes || '')
    }

    const handleConfirmDelete = () => {
        if (deletingSession) {
            onDelete(deletingSession.id)
            setDeletingSession(null)
        }
    }

    return (
        <div className="space-y-3">
            <SectionHeader
                pill="Live"
                pillPulse
                color="orange"
                title={`Actieve taken (${sessions.length})`}
                description="Timers die nu lopen. Rond af zodra je klaar bent met deze taak."
                compact
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sessions.map((session) => {
                    const color = getSessionColor(session.taskTypeId)
                    const tokens = tokensFor(color)
                    const isEditing = editingSession === session.id

                    return (
                        <SpotlightCard
                            key={session.id}
                            variant="timer"
                            color={color}
                            className="space-y-4"
                        >
                            {/* Row 1: Taaknaam + perceel */}
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <span className={cn('h-2.5 w-2.5 rounded-full animate-pulse', tokens.orb)} />
                                        <span className={cn('text-xs font-semibold uppercase tracking-widest', tokens.text)}>
                                            {session.taskTypeName}
                                        </span>
                                    </div>
                                    {session.subParcelName && (
                                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs text-white/70">
                                            <MapPin className="h-3 w-3" />
                                            {session.subParcelName}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Row 2: Grote timer */}
                            <div className="flex items-end justify-between gap-3">
                                <div>
                                    <div className={cn('text-5xl md:text-6xl font-black leading-none tabular-nums', tokens.text)}>
                                        {formatWorkedHours(calcNettoWorkedHours(session.startTime, workSchedule))}
                                    </div>
                                    <div className="text-xs text-white/55 font-medium mt-2">
                                        netto werktijd
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="flex items-center gap-1.5 text-sm text-white/80 font-semibold">
                                        <Users className="h-4 w-4 text-white/50" />
                                        {session.peopleCount} {session.peopleCount === 1 ? 'persoon' : 'personen'}
                                    </div>
                                </div>
                            </div>

                            {session.notes && (
                                <div className="text-sm text-white/70 italic bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2">
                                    &ldquo;{session.notes}&rdquo;
                                </div>
                            )}

                            {/* Starttijd / bewerken */}
                            {isEditing ? (
                                <div className="space-y-2 bg-white/[0.03] rounded-xl p-3 border border-white/10">
                                    <div className="space-y-1">
                                        <label className={cn(LABEL_CLASS, 'block')} htmlFor={`start-${session.id}`}>Starttijd</label>
                                        <div className="flex items-center gap-2">
                                            <Calendar className="h-4 w-4 text-white/50 shrink-0" />
                                            <Input
                                                id={`start-${session.id}`}
                                                type="datetime-local"
                                                value={editStartDateTime}
                                                onChange={(e) => setEditStartDateTime(e.target.value)}
                                                className="bg-white/10 border-white/20 text-white h-11 text-sm flex-1"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className={cn(LABEL_CLASS, 'block')} htmlFor={`people-${session.id}`}>Personen</label>
                                        <div className="flex items-center gap-2">
                                            <Users className="h-4 w-4 text-white/50 shrink-0" />
                                            <Input
                                                id={`people-${session.id}`}
                                                type="number"
                                                min={1}
                                                value={editPeopleCount}
                                                onChange={(e) => setEditPeopleCount(Math.max(1, parseInt(e.target.value) || 1))}
                                                className="bg-white/10 border-white/20 text-white h-11 text-sm w-24"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className={cn(LABEL_CLASS, 'block')} htmlFor={`note-${session.id}`}>Notitie</label>
                                        <div className="flex items-center gap-2">
                                            <Edit2 className="h-4 w-4 text-white/50 shrink-0" />
                                            <Input
                                                id={`note-${session.id}`}
                                                value={editNotes}
                                                onChange={(e) => setEditNotes(e.target.value)}
                                                placeholder="Notitie..."
                                                className="bg-white/10 border-white/20 text-white h-11 text-sm flex-1"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 pt-1">
                                        <Button
                                            size="sm"
                                            onClick={() => handleSave(session.id)}
                                            className="h-11 px-4 text-sm bg-emerald-500 hover:bg-emerald-600 text-white font-semibold min-h-[44px]"
                                        >
                                            Opslaan
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => setEditingSession(null)}
                                            className="h-11 px-3 text-white/70 hover:text-white text-sm min-h-[44px]"
                                        >
                                            Annuleren
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => startEditing(session)}
                                    className="flex items-center gap-2 text-sm text-white/75 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] transition-colors rounded-xl px-3 py-2.5 w-full border border-white/[0.06] min-h-[48px]"
                                    aria-label="Starttijd, personen of notitie aanpassen"
                                >
                                    <Calendar className="h-4 w-4 text-white/50" />
                                    <span className="flex-1 text-left">
                                        Gestart: <span className="font-semibold">{formatDateTime(session.startTime)}</span>
                                    </span>
                                    <Edit2 className="h-3.5 w-3.5 text-white/50" />
                                    <span className="text-xs text-white/50">Aanpassen</span>
                                </button>
                            )}

                            {/* Acties — Stop = primair groot, Annuleren = duidelijk maar secundair */}
                            {!isEditing && (
                                <div className="flex items-center gap-2">
                                    <Button
                                        onClick={() => onStop(session)}
                                        className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold h-14 text-base min-h-[56px]"
                                    >
                                        <Square className="h-5 w-5 mr-2 fill-white" />
                                        Afronden
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        onClick={() => setDeletingSession(session)}
                                        className="h-14 px-4 text-red-300 hover:text-red-200 hover:bg-red-500/15 border border-red-500/20 font-semibold text-sm min-h-[56px]"
                                        aria-label="Timer annuleren (verwijdert de actieve taak zonder uren op te slaan)"
                                    >
                                        <Trash2 className="h-4 w-4 mr-1.5" />
                                        <span className="hidden sm:inline">Annuleren</span>
                                    </Button>
                                </div>
                            )}
                        </SpotlightCard>
                    )
                })}
            </div>

            {/* Vervangt native window.confirm — grote knoppen, duidelijke taal */}
            <ConfirmDialog
                open={!!deletingSession}
                onOpenChange={(open) => !open && setDeletingSession(null)}
                destructive
                title="Timer annuleren?"
                description={
                    deletingSession
                        ? `De actieve timer voor "${deletingSession.taskTypeName}" wordt verwijderd. Er worden geen uren opgeslagen. Dit kan niet ongedaan gemaakt worden.`
                        : ''
                }
                confirmLabel="Ja, annuleren"
                cancelLabel="Nee, laten staan"
                onConfirm={handleConfirmDelete}
            />
            {/* Unused helper kept for forward-compat: Timer import */}
            {false && <Timer className="hidden" />}
        </div>
    )
}
