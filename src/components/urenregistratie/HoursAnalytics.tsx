'use client'

import * as React from 'react'
import {
    BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend,
} from 'recharts'
import { BarChart3, PieChart as PieChartIcon, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TaskLogEnriched } from '@/lib/types'
import { getTaskTypeColor } from './utils'

type PeriodKey = 'week' | 'month' | 'quarter' | 'year' | 'all'

const PERIOD_OPTIONS: { key: PeriodKey; label: string; days: number | null }[] = [
    { key: 'week',    label: 'Deze week',  days: 7 },
    { key: 'month',   label: 'Maand',      days: 30 },
    { key: 'quarter', label: 'Kwartaal',   days: 90 },
    { key: 'year',    label: 'Jaar',       days: 365 },
    { key: 'all',     label: 'Alles',      days: null },
]

interface HoursAnalyticsProps {
    logs: TaskLogEnriched[]
}

function ChartCard({ title, icon: Icon, isEmpty, children }: {
    title: string
    icon: React.ComponentType<{ className?: string }>
    isEmpty: boolean
    children: React.ReactNode
}) {
    return (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center gap-2 mb-4">
                <Icon className="h-5 w-5 text-emerald-400" />
                <h3 className="text-base font-semibold text-white">{title}</h3>
            </div>
            {isEmpty ? (
                <div className="flex flex-col items-center justify-center h-[200px] text-white/40">
                    <Icon className="h-10 w-10 mb-2 opacity-50" />
                    <p className="text-sm">Nog geen data beschikbaar</p>
                </div>
            ) : children}
        </div>
    )
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
    if (!active || !payload?.length) return null
    return (
        <div className="rounded-lg border border-white/15 bg-slate-900/95 px-3 py-2 shadow-xl backdrop-blur-xl">
            <p className="text-sm font-semibold text-white mb-1">{label}</p>
            {payload.map((entry, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span className="text-white/75">{entry.name}:</span>
                    <span className="text-white font-semibold">{entry.value.toFixed(1)}u</span>
                </div>
            ))}
        </div>
    )
}

function PieTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { cost: number; percentage: number } }> }) {
    if (!active || !payload?.length) return null
    const item = payload[0]
    return (
        <div className="rounded-lg border border-white/15 bg-slate-900/95 px-3 py-2 shadow-xl backdrop-blur-xl">
            <p className="text-sm font-semibold text-white">{item.name}</p>
            <p className="text-sm text-white/75">{item.value.toFixed(1)} uur ({item.payload.percentage.toFixed(0)}%)</p>
            <p className="text-sm text-emerald-300 font-medium">&euro;{item.payload.cost.toFixed(0)}</p>
        </div>
    )
}

export function HoursAnalytics({ logs: rawLogs }: HoursAnalyticsProps) {
    const [period, setPeriod] = React.useState<PeriodKey>('all')

    // Filter logs op gekozen periode — "Alles" toont alle registraties.
    const logs = React.useMemo(() => {
        const option = PERIOD_OPTIONS.find(o => o.key === period)
        if (!option || option.days === null) return rawLogs
        const cutoff = new Date()
        cutoff.setHours(0, 0, 0, 0)
        cutoff.setDate(cutoff.getDate() - option.days + 1)
        return rawLogs.filter(l => l.startDate >= cutoff)
    }, [rawLogs, period])

    // Weekly trend data (last 12 weeks)
    const weeklyData = React.useMemo(() => {
        const now = new Date()
        const weeks: { label: string; start: Date; end: Date }[] = []

        for (let i = 11; i >= 0; i--) {
            const weekStart = new Date(now)
            weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1 - i * 7)
            weekStart.setHours(0, 0, 0, 0)
            const weekEnd = new Date(weekStart)
            weekEnd.setDate(weekEnd.getDate() + 6)
            weekEnd.setHours(23, 59, 59, 999)

            const weekNum = Math.ceil((weekStart.getDate() - weekStart.getDay() + 1 + 6) / 7)
            weeks.push({
                label: `W${weekNum}`,
                start: weekStart,
                end: weekEnd,
            })
        }

        // Get unique task type names
        const taskTypeNames = [...new Set(logs.map(l => l.taskTypeName))]

        return weeks.map(week => {
            const weekLogs = logs.filter(log => {
                const logDate = new Date(log.startDate)
                return logDate >= week.start && logDate <= week.end
            })

            const entry: Record<string, string | number> = { name: week.label }
            for (const typeName of taskTypeNames) {
                entry[typeName] = weekLogs
                    .filter(l => l.taskTypeName === typeName)
                    .reduce((sum, l) => sum + l.totalHours, 0)
            }
            return entry
        })
    }, [logs])

    // Cost breakdown by task type (donut)
    const costBreakdown = React.useMemo(() => {
        const byType: Record<string, { hours: number; cost: number }> = {}

        for (const log of logs) {
            if (!byType[log.taskTypeName]) {
                byType[log.taskTypeName] = { hours: 0, cost: 0 }
            }
            byType[log.taskTypeName].hours += log.totalHours
            byType[log.taskTypeName].cost += log.estimatedCost
        }

        const totalHours = Object.values(byType).reduce((sum, v) => sum + v.hours, 0)

        return Object.entries(byType)
            .map(([name, data], i) => ({
                name,
                value: data.hours,
                cost: data.cost,
                percentage: totalHours > 0 ? (data.hours / totalHours) * 100 : 0,
                color: getTaskTypeColor(name, i),
            }))
            .sort((a, b) => b.value - a.value)
    }, [logs])

    // Per-parcel breakdown
    const parcelBreakdown = React.useMemo(() => {
        const byParcel: Record<string, { hours: number; cost: number }> = {}

        for (const log of logs) {
            const name = log.subParcelName || 'Geen perceel'
            if (!byParcel[name]) {
                byParcel[name] = { hours: 0, cost: 0 }
            }
            byParcel[name].hours += log.totalHours
            byParcel[name].cost += log.estimatedCost
        }

        return Object.entries(byParcel)
            .map(([name, data]) => ({ name, ...data }))
            .sort((a, b) => b.hours - a.hours)
            .slice(0, 8)
    }, [logs])

    const taskTypeNames = [...new Set(logs.map(l => l.taskTypeName))]
    const totalHours = logs.reduce((sum, l) => sum + l.totalHours, 0)
    const totalCost = logs.reduce((sum, l) => sum + l.estimatedCost, 0)

    return (
        <div className="space-y-6">
            {/* Periode-keuze */}
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-white/80 mr-1">Periode:</span>
                {PERIOD_OPTIONS.map(opt => {
                    const active = opt.key === period
                    return (
                        <button
                            key={opt.key}
                            type="button"
                            onClick={() => setPeriod(opt.key)}
                            aria-pressed={active}
                            className={cn(
                                'px-3.5 py-2 rounded-full text-sm font-semibold transition-colors min-h-[40px] border',
                                active
                                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200'
                                    : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white',
                            )}
                        >
                            {opt.label}
                        </button>
                    )
                })}
            </div>

            {/* Summary */}
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3 px-1">
                <div>
                    <div className="text-3xl font-black text-white">{totalHours.toFixed(0)}</div>
                    <div className="text-sm text-white/65 font-medium">Totaal uren</div>
                </div>
                <div>
                    <div className="text-3xl font-black text-emerald-400">
                        {new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(totalCost)}
                    </div>
                    <div className="text-sm text-white/65 font-medium">Totaal kosten</div>
                </div>
                <div>
                    <div className="text-3xl font-black text-white">{logs.length}</div>
                    <div className="text-sm text-white/65 font-medium">Registraties</div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Weekly trend */}
                <ChartCard title="Uren per week" icon={BarChart3} isEmpty={logs.length === 0}>
                    <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={weeklyData} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                            <XAxis
                                dataKey="name"
                                tick={{ fill: '#94a3b8', fontSize: 13 }}
                                axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                            />
                            <YAxis
                                tick={{ fill: '#94a3b8', fontSize: 13 }}
                                axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            {taskTypeNames.map((name, i) => (
                                <Bar
                                    key={name}
                                    dataKey={name}
                                    stackId="hours"
                                    fill={getTaskTypeColor(name, i)}
                                    radius={i === taskTypeNames.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                                />
                            ))}
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>

                {/* Cost breakdown donut */}
                <ChartCard title="Verdeling per taaktype" icon={PieChartIcon} isEmpty={costBreakdown.length === 0}>
                    <div className="flex items-center">
                        <ResponsiveContainer width="60%" height={280}>
                            <PieChart>
                                <Pie
                                    data={costBreakdown}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={65}
                                    outerRadius={100}
                                    paddingAngle={2}
                                    dataKey="value"
                                    nameKey="name"
                                >
                                    {costBreakdown.map((entry) => (
                                        <Cell key={entry.name} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip content={<PieTooltip />} />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="flex-1 space-y-2">
                            {costBreakdown.map((entry) => (
                                <div key={entry.name} className="flex items-center gap-2 text-sm">
                                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                                    <span className="text-white/85 truncate">{entry.name}</span>
                                    <span className="text-white/65 ml-auto font-medium">{entry.percentage.toFixed(0)}%</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </ChartCard>
            </div>

            {/* Per-parcel breakdown */}
            <ChartCard title="Uren per perceel" icon={MapPin} isEmpty={parcelBreakdown.length === 0}>
                <div className="space-y-2">
                    {parcelBreakdown.map((parcel, i) => {
                        const maxHours = parcelBreakdown[0]?.hours || 1
                        const pct = (parcel.hours / maxHours) * 100
                        return (
                            <div key={parcel.name} className="flex items-center gap-3">
                                <span className="text-sm text-white/80 w-[140px] truncate shrink-0" title={parcel.name}>
                                    {parcel.name}
                                </span>
                                <div className="flex-1 h-7 bg-white/[0.04] rounded-md overflow-hidden relative">
                                    <div
                                        className="h-full rounded-md transition-all duration-500"
                                        style={{
                                            width: `${pct}%`,
                                            backgroundColor: getTaskTypeColor(parcel.name, i),
                                            opacity: 0.7,
                                        }}
                                    />
                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-white font-semibold">
                                        {parcel.hours.toFixed(1)}u
                                    </span>
                                </div>
                                <span className="text-sm text-emerald-300/90 font-medium w-[70px] text-right">
                                    &euro;{parcel.cost.toFixed(0)}
                                </span>
                            </div>
                        )
                    })}
                </div>
            </ChartCard>
        </div>
    )
}
