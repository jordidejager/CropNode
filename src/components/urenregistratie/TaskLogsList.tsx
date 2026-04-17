'use client'

import * as React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Clock, Users, MapPin, CalendarDays, Trash2, Search, Download, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TaskLogEnriched, TaskType } from '@/lib/types'
import { formatDateShort } from './utils'
import { ConfirmDialog } from './ConfirmDialog'

interface TaskLogsListProps {
    logs: TaskLogEnriched[]
    taskTypes: TaskType[]
    onDelete: (id: string) => void
}

type GroupKey = 'vandaag' | 'deze-week' | 'deze-maand' | 'ouder'

const GROUP_LABELS: Record<GroupKey, string> = {
    'vandaag': 'Vandaag',
    'deze-week': 'Afgelopen week',
    'deze-maand': 'Deze maand',
    'ouder': 'Ouder',
}

const GROUP_ORDER: GroupKey[] = ['vandaag', 'deze-week', 'deze-maand', 'ouder']

function getGroupKey(date: Date): GroupKey {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    const daysDiff = Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000))
    if (daysDiff <= 0) return 'vandaag'
    if (daysDiff <= 7) return 'deze-week'
    if (daysDiff <= 30) return 'deze-maand'
    return 'ouder'
}

export function TaskLogsList({ logs, taskTypes, onDelete }: TaskLogsListProps) {
    const [search, setSearch] = React.useState('')
    const [filterTaskType, setFilterTaskType] = React.useState<string>('__all__')
    const [filterDateFrom, setFilterDateFrom] = React.useState<string>('')
    const [filterDateTo, setFilterDateTo] = React.useState<string>('')
    const [deletingLog, setDeletingLog] = React.useState<TaskLogEnriched | null>(null)

    const filteredLogs = React.useMemo(() => {
        let result = logs

        if (search) {
            const q = search.toLowerCase()
            result = result.filter(log =>
                log.notes?.toLowerCase().includes(q) ||
                log.taskTypeName.toLowerCase().includes(q) ||
                log.subParcelName?.toLowerCase().includes(q)
            )
        }

        if (filterTaskType !== '__all__') {
            result = result.filter(log => log.taskTypeId === filterTaskType)
        }

        if (filterDateFrom) {
            const from = new Date(filterDateFrom)
            result = result.filter(log => log.startDate >= from)
        }

        if (filterDateTo) {
            const to = new Date(filterDateTo)
            result = result.filter(log => log.endDate <= to)
        }

        return result
    }, [logs, search, filterTaskType, filterDateFrom, filterDateTo])

    const totals = React.useMemo(() => {
        const totalHours = filteredLogs.reduce((sum, log) => sum + log.totalHours, 0)
        const totalCost = filteredLogs.reduce((sum, log) => sum + log.estimatedCost, 0)
        return { totalHours, totalCost }
    }, [filteredLogs])

    // Groepeer chronologisch: Vandaag / Afgelopen week / Deze maand / Ouder.
    // Alleen niet-lege groepen tonen.
    const groupedLogs = React.useMemo(() => {
        const groups: Record<GroupKey, TaskLogEnriched[]> = {
            'vandaag': [],
            'deze-week': [],
            'deze-maand': [],
            'ouder': [],
        }
        for (const log of filteredLogs) {
            groups[getGroupKey(log.startDate)].push(log)
        }
        return groups
    }, [filteredLogs])

    const hasActiveFilters = search || filterTaskType !== '__all__' || filterDateFrom || filterDateTo

    const handleClearFilters = () => {
        setSearch('')
        setFilterTaskType('__all__')
        setFilterDateFrom('')
        setFilterDateTo('')
    }

    const handleConfirmDelete = () => {
        if (deletingLog) {
            onDelete(deletingLog.id)
            setDeletingLog(null)
        }
    }

    const handleCSVExport = () => {
        const headers = ['Datum', 'Einddatum', 'Taaktype', 'Perceel', 'Personen', 'Uren/pp', 'Dagen', 'Totaal uren', 'Uurtarief', 'Kosten']
        const rows = filteredLogs.map(log => [
            log.startDate.toISOString().split('T')[0],
            log.endDate.toISOString().split('T')[0],
            log.taskTypeName,
            log.subParcelName || '',
            log.peopleCount,
            log.hoursPerPerson,
            log.days,
            log.totalHours,
            log.defaultHourlyRate,
            log.estimatedCost.toFixed(2),
        ])

        const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n')
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `urenregistratie-${new Date().toISOString().split('T')[0]}.csv`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
    }

    return (
        <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Zoek op notitie, taak of perceel..."
                            className="bg-white/5 border-white/10 text-white placeholder:text-white/45 text-base pl-10 h-11"
                        />
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCSVExport}
                        disabled={filteredLogs.length === 0}
                        className="text-emerald-300 hover:text-emerald-200 hover:bg-emerald-500/15 border border-emerald-500/20 h-11 px-4 text-sm font-semibold whitespace-nowrap"
                        aria-label="Exporteer zichtbare registraties als Excel/CSV bestand"
                    >
                        <Download className="h-4 w-4 mr-1.5" />
                        Excel/CSV
                    </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Select value={filterTaskType} onValueChange={setFilterTaskType}>
                        <SelectTrigger className="bg-white/5 border-white/10 text-white h-10 w-[180px] text-sm">
                            <SelectValue placeholder="Alle taaktypes" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-white/10">
                            <SelectItem value="__all__" className="text-white hover:bg-white/10 text-sm min-h-[44px]">
                                Alle taaktypes
                            </SelectItem>
                            {taskTypes.map(type => (
                                <SelectItem key={type.id} value={type.id} className="text-white hover:bg-white/10 text-sm min-h-[44px]">
                                    {type.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Input
                        type="date"
                        value={filterDateFrom}
                        onChange={(e) => setFilterDateFrom(e.target.value)}
                        placeholder="Van"
                        aria-label="Filter vanaf datum"
                        className="bg-white/5 border-white/10 text-white h-10 w-[150px] text-sm"
                    />
                    <span className="text-white/50 text-sm">t/m</span>
                    <Input
                        type="date"
                        value={filterDateTo}
                        onChange={(e) => setFilterDateTo(e.target.value)}
                        placeholder="Tot"
                        aria-label="Filter tot en met datum"
                        className="bg-white/5 border-white/10 text-white h-10 w-[150px] text-sm"
                    />

                    {hasActiveFilters && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleClearFilters}
                            className="text-white/70 hover:text-white h-10 px-3 text-sm"
                        >
                            <X className="h-4 w-4 mr-1" />
                            Wis filters
                        </Button>
                    )}
                </div>
            </div>

            {/* Summary bar */}
            {filteredLogs.length > 0 && (
                <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-white/[0.04] border border-white/10 text-sm">
                    <span className="text-white/70 font-medium">
                        {filteredLogs.length} registratie{filteredLogs.length !== 1 ? 's' : ''}
                        {hasActiveFilters ? ' (gefilterd)' : ''}
                    </span>
                    <div className="flex items-center gap-4">
                        <span className="text-white font-bold">{totals.totalHours.toFixed(1)} uur</span>
                        <span className="text-emerald-400 font-bold">
                            {new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(totals.totalCost)}
                        </span>
                    </div>
                </div>
            )}

            {/* Logs */}
            {filteredLogs.length === 0 ? (
                <Card className="bg-white/5 border-white/10">
                    <CardContent className="p-8 text-center">
                        <Clock className="h-12 w-12 text-white/20 mx-auto mb-4" />
                        <p className="text-white/70 font-medium text-base">
                            {hasActiveFilters ? 'Geen registraties gevonden' : 'Nog geen registraties'}
                        </p>
                        <p className="text-white/50 text-sm mt-1">
                            {hasActiveFilters ? 'Probeer andere filters' : 'Voeg je eerste urenregistratie toe via het Invoer tabblad'}
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-6">
                    {GROUP_ORDER.filter(key => groupedLogs[key].length > 0).map(groupKey => {
                        const groupLogs = groupedLogs[groupKey]
                        const groupHours = groupLogs.reduce((s, l) => s + l.totalHours, 0)
                        return (
                            <div key={groupKey} className="space-y-2">
                                <div className="flex items-center gap-2 px-1">
                                    <h3 className="text-base font-semibold text-white/85">
                                        {GROUP_LABELS[groupKey]}
                                    </h3>
                                    <span className="text-sm text-white/50">
                                        {groupLogs.length} · {groupHours.toFixed(1)} uur
                                    </span>
                                </div>
                                <div className="space-y-2">
                                    {groupLogs.map((log: TaskLogEnriched) => (
                        <Card
                            key={log.id}
                            className="bg-white/5 border-white/10 hover:bg-white/[0.08] transition-all"
                        >
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-4 min-w-0 flex-1">
                                        <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center shrink-0">
                                            <Clock className="h-5 w-5 text-white/40" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-bold text-white text-base">{log.taskTypeName}</span>
                                                {log.subParcelName && (
                                                    <Badge
                                                        variant="outline"
                                                        className={cn(
                                                            'text-xs bg-white/5 border-white/15 text-white/80',
                                                            log.isWholeParcel && 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10',
                                                        )}
                                                    >
                                                        <MapPin className="h-3 w-3 mr-1" />
                                                        {log.subParcelName}
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3 text-sm text-white/70 mt-1 flex-wrap">
                                                <span className="flex items-center gap-1">
                                                    <CalendarDays className="h-3.5 w-3.5" />
                                                    {formatDateShort(log.startDate)}
                                                    {log.startDate.getTime() !== log.endDate.getTime() && (
                                                        <> - {formatDateShort(log.endDate)}</>
                                                    )}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Users className="h-3.5 w-3.5" />
                                                    {log.peopleCount}p &times; {log.hoursPerPerson}u &times; {log.days}d
                                                </span>
                                                {log.notes && (
                                                    <span className="text-white/60 truncate max-w-[200px]" title={log.notes}>
                                                        &ldquo;{log.notes}&rdquo;
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        <div className="text-right">
                                            <div className="text-xl font-black text-white">{log.totalHours}u</div>
                                            <div className="text-xs text-emerald-300/80 font-semibold">
                                                {new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(log.estimatedCost)}
                                            </div>
                                        </div>
                                        {/* Prullenbak ALTIJD zichtbaar — voorheen alleen op hover (onbruikbaar op touch) */}
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => setDeletingLog(log)}
                                            aria-label={`Registratie "${log.taskTypeName}" van ${formatDateShort(log.startDate)} verwijderen`}
                                            className="h-11 w-11 text-red-300 hover:text-red-200 hover:bg-red-500/15 border border-transparent hover:border-red-500/30"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                                    ))}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Vervangt native window.confirm */}
            <ConfirmDialog
                open={!!deletingLog}
                onOpenChange={(open) => !open && setDeletingLog(null)}
                destructive
                title="Registratie verwijderen?"
                description={
                    deletingLog
                        ? `De registratie "${deletingLog.taskTypeName}" (${deletingLog.totalHours} uur) van ${formatDateShort(deletingLog.startDate)} wordt verwijderd. Dit kan niet ongedaan gemaakt worden.`
                        : ''
                }
                confirmLabel="Ja, verwijderen"
                cancelLabel="Annuleren"
                onConfirm={handleConfirmDelete}
            />
        </div>
    )
}
