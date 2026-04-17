'use client'

import * as React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Timer, Users, MapPin, Calendar, Edit2, Square, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ActiveTaskSession, WorkScheduleDay } from '@/lib/types'
import { DEFAULT_WORK_SCHEDULE, calcNettoHoursWithBreaks } from '@/lib/types'
import { formatDateTime, dateToDateTimeLocal, dateTimeLocalToDate } from './utils'
import { ConfirmDialog } from './ConfirmDialog'

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
                // Alleen tellen als we binnen werktijd zijn
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
    onStop: (session: ActiveTaskSession) => void
    onDelete: (id: string) => void
    onUpdate: (id: string, updates: { startTime?: Date; peopleCount?: number; notes?: string | null }) => void
}

const LABEL_CLASS = 'text-white/70 text-xs font-semibold'

export function ActiveSessions({ sessions, workSchedule, onStop, onDelete, onUpdate }: ActiveSessionsProps) {
    const [editingSession, setEditingSession] = React.useState<string | null>(null)
    const [editStartDateTime, setEditStartDateTime] = React.useState<string>("")
    const [editPeopleCount, setEditPeopleCount] = React.useState<number>(1)
    const [editNotes, setEditNotes] = React.useState<string>("")
    const [deletingSession, setDeletingSession] = React.useState<ActiveTaskSession | null>(null)

    // Timer tick
    const [, setTick] = React.useState(0)
    React.useEffect(() => {
        if (sessions.length === 0) return
        const interval = setInterval(() => setTick(t => t + 1), 60000)
        return () => clearInterval(interval)
    }, [sessions.length])

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
            <div className="flex items-center gap-2 px-1">
                <Timer className="h-5 w-5 text-orange-400 animate-pulse" />
                <h2 className="text-base font-bold text-orange-300">
                    Actieve taken ({sessions.length})
                </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sessions.map((session) => (
                    <Card key={session.id} className="bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/20 shadow-xl">
                        <CardContent className="p-4 space-y-3">
                            {/* Row 1: Taak + meter + stop/trash */}
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-bold text-white text-base">{session.taskTypeName}</span>
                                        {session.subParcelName && (
                                            <Badge
                                                variant="outline"
                                                className={cn(
                                                    'text-xs bg-white/5 border-white/15 text-white/80',
                                                    session.isWholeParcel && 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10',
                                                )}
                                            >
                                                <MapPin className="h-3 w-3 mr-1" />
                                                {session.subParcelName}
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3 text-sm text-white/70 mt-1.5">
                                        <span className="flex items-center gap-1">
                                            <Users className="h-3.5 w-3.5" />
                                            {session.peopleCount} {session.peopleCount === 1 ? 'persoon' : 'personen'}
                                        </span>
                                        {session.notes && (
                                            <span className="text-white/60 truncate max-w-[180px]" title={session.notes}>
                                                &ldquo;{session.notes}&rdquo;
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-2 shrink-0">
                                    <div className="text-right">
                                        <div className="text-2xl font-black text-orange-400 leading-none">
                                            {formatWorkedHours(calcNettoWorkedHours(session.startTime, workSchedule))}
                                        </div>
                                        <div className="text-xs text-white/60 font-medium mt-0.5">
                                            netto werktijd
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {editingSession === session.id ? (
                                <div className="space-y-2 bg-white/[0.03] rounded-lg p-3 border border-white/10">
                                    <div className="space-y-1">
                                        <Label className={LABEL_CLASS} htmlFor={`start-${session.id}`}>Starttijd</Label>
                                        <div className="flex items-center gap-2">
                                            <Calendar className="h-4 w-4 text-white/50 shrink-0" />
                                            <Input
                                                id={`start-${session.id}`}
                                                type="datetime-local"
                                                value={editStartDateTime}
                                                onChange={(e) => setEditStartDateTime(e.target.value)}
                                                className="bg-white/10 border-white/20 text-white h-10 text-sm flex-1"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className={LABEL_CLASS} htmlFor={`people-${session.id}`}>Personen</Label>
                                        <div className="flex items-center gap-2">
                                            <Users className="h-4 w-4 text-white/50 shrink-0" />
                                            <Input
                                                id={`people-${session.id}`}
                                                type="number"
                                                min={1}
                                                value={editPeopleCount}
                                                onChange={(e) => setEditPeopleCount(Math.max(1, parseInt(e.target.value) || 1))}
                                                className="bg-white/10 border-white/20 text-white h-10 text-sm w-20"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className={LABEL_CLASS} htmlFor={`note-${session.id}`}>Notitie</Label>
                                        <div className="flex items-center gap-2">
                                            <Edit2 className="h-4 w-4 text-white/50 shrink-0" />
                                            <Input
                                                id={`note-${session.id}`}
                                                value={editNotes}
                                                onChange={(e) => setEditNotes(e.target.value)}
                                                placeholder="Notitie..."
                                                className="bg-white/10 border-white/20 text-white h-10 text-sm flex-1"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 pt-1">
                                        <Button
                                            size="sm"
                                            onClick={() => handleSave(session.id)}
                                            className="h-10 px-4 text-sm bg-emerald-500 hover:bg-emerald-600 text-white font-semibold"
                                        >
                                            Opslaan
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => setEditingSession(null)}
                                            className="h-10 px-3 text-white/70 hover:text-white text-sm"
                                        >
                                            Annuleren
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => startEditing(session)}
                                    className="flex items-center gap-2 text-sm text-white/80 hover:text-white bg-white/5 hover:bg-white/10 transition-colors rounded-lg px-3 py-2 w-full border border-white/10"
                                    aria-label="Starttijd, personen of notitie aanpassen"
                                >
                                    <Calendar className="h-4 w-4 text-white/60" />
                                    <span className="flex-1 text-left">
                                        Gestart: <span className="font-semibold">{formatDateTime(session.startTime)}</span>
                                    </span>
                                    <Edit2 className="h-3.5 w-3.5 text-white/60" />
                                    <span className="text-xs text-white/50">Aanpassen</span>
                                </button>
                            )}

                            {/* Row 3: acties — Stop is PRIMAIR groot, prullenbak duidelijk maar minder prominent */}
                            {editingSession !== session.id && (
                                <div className="flex items-center gap-2">
                                    <Button
                                        onClick={() => onStop(session)}
                                        className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold h-12 text-base"
                                    >
                                        <Square className="h-4 w-4 mr-2" />
                                        Afronden
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        onClick={() => setDeletingSession(session)}
                                        className="h-12 px-4 text-red-300 hover:text-red-200 hover:bg-red-500/15 border border-red-500/20 font-semibold text-sm"
                                        aria-label="Timer annuleren (verwijdert de actieve taak zonder uren op te slaan)"
                                    >
                                        <Trash2 className="h-4 w-4 mr-1.5" />
                                        Annuleren
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))}
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
        </div>
    )
}

/**
 * Inline label helper om duplicatie binnen bewerk-modus te voorkomen.
 * (Geen import van @/components/ui/label omdat we hier maar één stijl nodig hebben.)
 */
function Label({
    className,
    children,
    htmlFor,
}: {
    className?: string
    children: React.ReactNode
    htmlFor?: string
}) {
    return (
        <label htmlFor={htmlFor} className={cn('block', className)}>
            {children}
        </label>
    )
}
