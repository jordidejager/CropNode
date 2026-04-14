import { format } from "date-fns"
import { nl } from "date-fns/locale"

/**
 * Bereken werkdagen tussen twee datums
 * - Zondag = 0 dagen
 * - Zaterdag = 0.5 dag
 * - Ma-Vr = 1 dag
 */
export function calculateWorkDays(startDate: Date, endDate: Date): number {
    if (startDate > endDate) return 0

    let days = 0
    const current = new Date(startDate)

    while (current <= endDate) {
        const dayOfWeek = current.getDay()
        if (dayOfWeek === 0) {
            days += 0
        } else if (dayOfWeek === 6) {
            days += 0.5
        } else {
            days += 1
        }
        current.setDate(current.getDate() + 1)
    }

    return days
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
