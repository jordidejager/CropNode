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
import type { TaskLogEnriched, TaskType } from '@/lib/types'
import { formatDateShort } from './utils'

interface TaskLogsListProps {
    logs: TaskLogEnriched[]
    taskTypes: TaskType[]
    onDelete: (id: string) => void
}

export function TaskLogsList({ logs, taskTypes, onDelete }: TaskLogsListProps) {
    const [search, setSearch] = React.useState('')
    const [filterTaskType, setFilterTaskType] = React.useState<string>('__all__')
    const [filterDateFrom, setFilterDateFrom] = React.useState<string>('')
    const [filterDateTo, setFilterDateTo] = React.useState<string>('')

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

    const hasActiveFilters = search || filterTaskType !== '__all__' || filterDateFrom || filterDateTo

    const handleClearFilters = () => {
        setSearch('')
        setFilterTaskType('__all__')
        setFilterDateFrom('')
        setFilterDateTo('')
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
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Zoek op notitie, taak of perceel..."
                            className="bg-white/5 border-white/10 text-white pl-10 h-10"
                        />
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCSVExport}
                        disabled={filteredLogs.length === 0}
                        className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 h-10 px-3 whitespace-nowrap"
                    >
                        <Download className="h-4 w-4 mr-1.5" />
                        CSV
                    </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Select value={filterTaskType} onValueChange={setFilterTaskType}>
                        <SelectTrigger className="bg-white/5 border-white/10 text-white h-9 w-[160px] text-xs">
                            <SelectValue placeholder="Alle taaktypes" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-white/10">
                            <SelectItem value="__all__" className="text-white/50 hover:bg-white/10 text-xs">
                                Alle taaktypes
                            </SelectItem>
                            {taskTypes.map(type => (
                                <SelectItem key={type.id} value={type.id} className="text-white hover:bg-white/10 text-xs">
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
                        className="bg-white/5 border-white/10 text-white h-9 w-[140px] text-xs"
                    />
                    <span className="text-white/20 text-xs">t/m</span>
                    <Input
                        type="date"
                        value={filterDateTo}
                        onChange={(e) => setFilterDateTo(e.target.value)}
                        placeholder="Tot"
                        className="bg-white/5 border-white/10 text-white h-9 w-[140px] text-xs"
                    />

                    {hasActiveFilters && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleClearFilters}
                            className="text-white/40 hover:text-white h-9 px-2 text-xs"
                        >
                            <X className="h-3 w-3 mr-1" />
                            Wis filters
                        </Button>
                    )}
                </div>
            </div>

            {/* Summary bar */}
            {filteredLogs.length > 0 && (
                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5 text-xs">
                    <span className="text-white/40">
                        {filteredLogs.length} registratie{filteredLogs.length !== 1 ? 's' : ''}
                        {hasActiveFilters ? ' (gefilterd)' : ''}
                    </span>
                    <div className="flex items-center gap-4">
                        <span className="text-white/60 font-semibold">{totals.totalHours.toFixed(1)} uur</span>
                        <span className="text-emerald-400 font-semibold">
                            {new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(totals.totalCost)}
                        </span>
                    </div>
                </div>
            )}

            {/* Logs */}
            {filteredLogs.length === 0 ? (
                <Card className="bg-white/5 border-white/10">
                    <CardContent className="p-8 text-center">
                        <Clock className="h-12 w-12 text-white/10 mx-auto mb-4" />
                        <p className="text-white/40 font-medium">
                            {hasActiveFilters ? 'Geen registraties gevonden' : 'Nog geen registraties'}
                        </p>
                        <p className="text-white/20 text-sm mt-1">
                            {hasActiveFilters ? 'Probeer andere filters' : 'Voeg je eerste urenregistratie toe via het Invoer tabblad'}
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-2">
                    {filteredLogs.map((log: TaskLogEnriched) => (
                        <Card key={log.id} className="bg-white/5 border-white/5 hover:bg-white/[0.08] transition-all group">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center shrink-0">
                                            <Clock className="h-5 w-5 text-white/20" />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-bold text-white">{log.taskTypeName}</span>
                                                {log.subParcelName && (
                                                    <Badge variant="outline" className="text-[10px] bg-white/5 border-white/10 text-white/60">
                                                        <MapPin className="h-2.5 w-2.5 mr-1" />
                                                        {log.subParcelName}
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3 text-[11px] text-white/40 mt-1 flex-wrap">
                                                <span className="flex items-center gap-1">
                                                    <CalendarDays className="h-3 w-3" />
                                                    {formatDateShort(log.startDate)}
                                                    {log.startDate.getTime() !== log.endDate.getTime() && (
                                                        <> - {formatDateShort(log.endDate)}</>
                                                    )}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Users className="h-3 w-3" />
                                                    {log.peopleCount}p &times; {log.hoursPerPerson}u &times; {log.days}d
                                                </span>
                                                {log.notes && (
                                                    <span className="text-white/30 truncate max-w-[200px]" title={log.notes}>
                                                        &ldquo;{log.notes}&rdquo;
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 shrink-0">
                                        <div className="text-right">
                                            <div className="text-xl font-black text-white">{log.totalHours}u</div>
                                            <div className="text-[10px] text-emerald-400/60 font-bold">
                                                {new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(log.estimatedCost)}
                                            </div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => {
                                                if (confirm("Weet je zeker dat je deze registratie wilt verwijderen?")) {
                                                    onDelete(log.id)
                                                }
                                            }}
                                            className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}
