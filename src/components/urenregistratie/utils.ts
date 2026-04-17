import { format } from "date-fns"
import { nl } from "date-fns/locale"
import { DEFAULT_WORK_SCHEDULE, calcNettoHoursWithBreaks, type ActiveTaskSession, type WorkScheduleDay } from "@/lib/types"

/**
 * Haal dag-gewicht uit werkschema: netto-uren gedeeld door de langste werkdag
 * in het schema. Zo is een halve werkdag 0,5 en een rustdag 0.
 *
 * Als er geen schema is meegegeven, valt het terug op DEFAULT_WORK_SCHEDULE
 * (ma-vr = 1, za = 0,5, zo = 0 — de oude vaste regel).
 */
export function getDayWeight(
    dayOfWeek: number,
    schedule?: WorkScheduleDay[],
): number {
    const sched = (schedule && schedule.length > 0) ? schedule : DEFAULT_WORK_SCHEDULE
    const day = sched.find(s => s.dayOfWeek === dayOfWeek)
        ?? DEFAULT_WORK_SCHEDULE.find(s => s.dayOfWeek === dayOfWeek)

    if (!day || !day.isWorkday) return 0

    const maxNetto = Math.max(
        ...sched
            .filter(s => s.isWorkday)
            .map(s => s.nettoHours || 0),
        0,
    )

    if (maxNetto <= 0) return day.isWorkday ? 1 : 0

    // Rond naar 0.25 voor nette gewichten (0, 0.25, 0.5, 0.75, 1)
    const weight = (day.nettoHours || 0) / maxNetto
    return Math.round(weight * 4) / 4
}

/**
 * Bereken werkdagen tussen twee datums, op basis van werkschema.
 * Zonder schema: default-regel (ma-vr=1, za=0,5, zo=0).
 */
export function calculateWorkDays(
    startDate: Date,
    endDate: Date,
    schedule?: WorkScheduleDay[],
): number {
    if (startDate > endDate) return 0

    let days = 0
    const current = new Date(startDate)

    while (current <= endDate) {
        days += getDayWeight(current.getDay(), schedule)
        current.setDate(current.getDate() + 1)
    }

    return days
}

const DAY_NAMES = ['Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag']
const DAY_SHORT = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za']

/**
 * Genereer een leesbare regel die laat zien hoe dagen gewogen worden
 * volgens het schema. Voorbeeld: "ma-vr: 1 · za: 0,5 · zo: —"
 */
export function describeSchedule(schedule?: WorkScheduleDay[]): string {
    const weights: number[] = []
    for (let i = 0; i < 7; i++) {
        weights.push(getDayWeight(i, schedule))
    }
    // dayOfWeek 0 = zondag; we tonen ma-zo voor leesbaarheid.
    const order = [1, 2, 3, 4, 5, 6, 0]
    const labels = order.map(i => weights[i])

    // Detecteer "ma-vr gelijk" → samenvatten
    const weekdays = labels.slice(0, 5)
    const allSame = weekdays.every(w => w === weekdays[0])

    const parts: string[] = []
    const fmt = (w: number) => w === 0 ? '—' : w.toString().replace('.', ',')

    if (allSame) {
        parts.push(`ma-vr: ${fmt(weekdays[0])}`)
    } else {
        for (let i = 0; i < 5; i++) {
            parts.push(`${DAY_SHORT[order[i]]}: ${fmt(labels[i])}`)
        }
    }
    parts.push(`za: ${fmt(labels[5])}`)
    parts.push(`zo: ${fmt(labels[6])}`)
    return parts.join(' · ')
}

// Houd DAY_NAMES export mogelijk voor hergebruik
export { DAY_NAMES }

/**
 * Bereken verstreken netto werkuren per bucket voor één actieve sessie.
 *
 * Nodig omdat `getTaskStats()` in de DB alleen afgeronde `task_logs` telt —
 * een lopende timer van 40+ uur blijft dan onzichtbaar in de KPI's. Met deze
 * helper tellen we de live-verstreken werkuren (per persoon × aantal personen)
 * mee op het dashboard.
 *
 * - `todayHours`: uren gemaakt vandaag (incl. netto per schema, tot nu)
 * - `weekHours`:  uren over de afgelopen 7 dagen (rollend, inclusief vandaag)
 * - `monthCost`:  geschatte kosten over de afgelopen 30 dagen (rollend)
 *
 * Werkt per kalenderdag, met dezelfde logica als de live-meter in
 * ActiveSessions (startdag vanaf start_time, huidige dag afgekapt op nu).
 */
export interface ActiveSessionContribution {
    todayHours: number
    weekHours: number
    monthCost: number
}

function pad2(n: number): string {
    return n.toString().padStart(2, '0')
}

export function calcActiveSessionContribution(
    session: ActiveTaskSession,
    schedule: WorkScheduleDay[],
): ActiveSessionContribution {
    const now = new Date()
    const today = new Date(now)
    today.setHours(0, 0, 0, 0)

    const weekAgo = new Date(today)
    weekAgo.setDate(weekAgo.getDate() - 6) // 7 dagen inclusief vandaag

    const monthAgo = new Date(today)
    monthAgo.setDate(monthAgo.getDate() - 29) // 30 dagen inclusief vandaag

    const startTime = new Date(session.startTime)
    const startDay = new Date(startTime)
    startDay.setHours(0, 0, 0, 0)

    let todayHours = 0
    let weekHours = 0
    let monthCost = 0

    const cur = new Date(startDay)
    while (cur <= today) {
        const dow = cur.getDay()
        const sched = schedule.find(s => s.dayOfWeek === dow)
            ?? DEFAULT_WORK_SCHEDULE.find(s => s.dayOfWeek === dow)

        if (sched?.isWorkday && sched.startTime && sched.endTime) {
            const isStartDay = cur.getTime() === startDay.getTime()
            const isToday = cur.getTime() === today.getTime()

            const effectiveStart = isStartDay
                ? `${pad2(startTime.getHours())}:${pad2(startTime.getMinutes())}`
                : sched.startTime

            let hours = 0
            if (isToday) {
                const nowStr = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`
                const endCap = nowStr < sched.endTime ? nowStr : sched.endTime
                if (endCap > effectiveStart) {
                    hours = calcNettoHoursWithBreaks(
                        effectiveStart,
                        sched.endTime,
                        sched.breaks || [],
                        true,
                        endCap,
                    )
                }
            } else {
                hours = calcNettoHoursWithBreaks(
                    effectiveStart,
                    sched.endTime,
                    sched.breaks || [],
                    true,
                )
            }
            hours = Math.max(0, Math.round(hours * 2) / 2)
            const dayTotalHours = session.peopleCount * hours
            const dayCost = dayTotalHours * (session.defaultHourlyRate || 0)

            if (isToday) todayHours += dayTotalHours
            if (cur.getTime() >= weekAgo.getTime()) weekHours += dayTotalHours
            if (cur.getTime() >= monthAgo.getTime()) monthCost += dayCost
        }
        cur.setDate(cur.getDate() + 1)
    }

    return { todayHours, weekHours, monthCost }
}

/**
 * Bereken verstreken tijd als leesbare string
 */
export function formatElapsedTime(startTime: Date): string {
    const now = new Date()
    const diffMs = now.getTime() - startTime.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const hours = Math.floor(diffMins / 60)
    const mins = diffMins % 60

    if (hours === 0) {
        return `${mins}m`
    }
    return `${hours}u ${mins}m`
}

/**
 * Format Date naar datetime-local string
 */
export function dateToDateTimeLocal(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * Format datetime-local string naar Date
 */
export function dateTimeLocalToDate(dateTimeLocal: string): Date {
    return new Date(dateTimeLocal)
}

export const WORK_START_HOUR = 8
export const WORK_END_HOUR = 18
export const LUNCH_BREAK_HOURS = 1

/**
 * Geef een datum terug met standaard starttijd (08:00)
 */
export function getDefaultStartDateTime(): string {
    const now = new Date()
    if (now.getHours() < WORK_START_HOUR) {
        now.setHours(WORK_START_HOUR, 0, 0, 0)
    }
    return dateToDateTimeLocal(now)
}

/**
 * Geef een datum terug met standaard eindtijd (18:00)
 */
export function getDefaultEndDateTime(startTime: Date): string {
    const endTime = new Date(startTime)
    const now = new Date()

    if (startTime.toDateString() === now.toDateString() && now.getHours() < WORK_END_HOUR) {
        return dateToDateTimeLocal(now)
    }

    endTime.setHours(WORK_END_HOUR, 0, 0, 0)
    return dateToDateTimeLocal(endTime)
}

/**
 * Bereken standaard werkuren voor een dag
 */
export function getStandardHoursForDay(date: Date): number {
    const dayOfWeek = date.getDay()
    if (dayOfWeek === 0) return 0
    if (dayOfWeek === 6) return 4.5
    return 9
}

/**
 * Bereken werkuren op basis van start en eindtijd (minus pauze)
 */
export function calculateWorkedHours(start: Date, end: Date): number {
    const diffMs = end.getTime() - start.getTime()
    let hours = diffMs / (1000 * 60 * 60)

    if (hours > 5) {
        hours -= LUNCH_BREAK_HOURS
    }

    return Math.max(0, hours)
}

/**
 * Format datum als "d MMM" in NL
 */
export function formatDateShort(date: Date): string {
    return format(date, "d MMM", { locale: nl })
}

/**
 * Format datum als "d MMM HH:mm" in NL
 */
export function formatDateTime(date: Date): string {
    return format(date, "d MMM HH:mm", { locale: nl })
}

// Task type kleuren voor charts
export const TASK_TYPE_COLORS: Record<string, string> = {
    'Snoeien': '#10b981',
    'Dunnen': '#3b82f6',
    'Plukken': '#f59e0b',
    'Sorteren': '#8b5cf6',
    'Onderhoud': '#ef4444',
    'Maaien': '#06b6d4',
    'Boomverzorging': '#ec4899',
    'Spuiten': '#14b8a6',
}

export function getTaskTypeColor(name: string, index: number): string {
    return TASK_TYPE_COLORS[name] || [
        '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6',
        '#ef4444', '#06b6d4', '#ec4899', '#14b8a6',
    ][index % 8]
}
