'use client'

import * as React from 'react'
import {
    BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend,
} from 'recharts'
import { BarChart3, PieChart as PieChartIcon, MapPin } from 'lucide-react'
import type { TaskLogEnriched } from '@/lib/types'
import { getTaskTypeColor } from './utils'

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
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
            <div className="flex items-center gap-2 mb-4">
                <Icon className="h-4 w-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
            </div>
            {isEmpty ? (
                <div className="flex flex-col items-center justify-center h-[200px] text-white/20">
                    <Icon className="h-10 w-10 mb-2 opacity-40" />
                    <p className="text-xs">Nog geen data beschikbaar</p>
                </div>
            ) : children}
        </div>
    )
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
    if (!active || !payload?.length) return null
    return (
        <div className="rounded-lg border border-white/10 bg-slate-900/95 px-3 py-2 shadow-xl backdrop-blur-xl">
            <p className="text-xs font-semibold text-slate-300 mb-1">{label}</p>
            {payload.map((entry, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span className="text-slate-400">{entry.name}:</span>
                    <span className="text-slate-200 font-medium">{entry.value.toFixed(1)}u</span>
                </div>
            ))}
        </div>
    )
}

function PieTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { cost: number; percentage: number } }> }) {
    if (!active || !payload?.length) return null
    const item = payload[0]
    return (
        <div className="rounded-lg border border-white/10 bg-slate-900/95 px-3 py-2 shadow-xl backdrop-blur-xl">
            <p className="text-xs font-semibold text-slate-200">{item.name}</p>
            <p className="text-xs text-slate-400">{item.value.toFixed(1)} uur ({item.payload.percentage.toFixed(0)}%)</p>
            <p className="text-xs text-emerald-400">&euro;{item.payload.cost.toFixed(0)}</p>
        </div>
    )
}

export function HoursAnalytics({ logs }: HoursAnalyticsProps) {
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
            {/* Summary */}
            <div className="flex items-center gap-6 px-1">
                <div>
                    <div className="text-2xl font-black text-white">{totalHours.toFixed(0)}</div>
                    <div className="text-[10px] text-white/30 uppercase font-bold tracking-wider">Totaal uren</div>
                </div>
                <div>
                    <div className="text-2xl font-black text-emerald-400">
                        {new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(totalCost)}
                    </div>
                    <div className="text-[10px] text-white/30 uppercase font-bold tracking-wider">Totaal kosten</div>
                </div>
                <div>
                    <div className="text-2xl font-black text-white">{logs.length}</div>
                    <div className="text-[10px] text-white/30 uppercase font-bold tracking-wider">Registraties</div>
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
                                tick={{ fill: '#64748b', fontSize: 11 }}
                                axisLine={{ stroke: 'rgba(255,255,255,0.05)' }}
                            />
                            <YAxis
                                tick={{ fill: '#64748b', fontSize: 11 }}
                                axisLine={{ stroke: 'rgba(255,255,255,0.05)' }}
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
                                <div key={entry.name} className="flex items-center gap-2 text-xs">
                                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                                    <span className="text-slate-300 truncate">{entry.name}</span>
                                    <span className="text-slate-500 ml-auto">{entry.percentage.toFixed(0)}%</span>
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
                                <span className="text-xs text-slate-400 w-[120px] truncate shrink-0" title={parcel.name}>
                                    {parcel.name}
                                </span>
                                <div className="flex-1 h-6 bg-white/[0.03] rounded-md overflow-hidden relative">
                                    <div
                                        className="h-full rounded-md transition-all duration-500"
                                        style={{
                                            width: `${pct}%`,
                                            backgroundColor: getTaskTypeColor(parcel.name, i),
                                            opacity: 0.6,
                                        }}
                                    />
                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-300 font-medium">
                                        {parcel.hours.toFixed(1)}u
                                    </span>
                                </div>
                                <span className="text-[11px] text-emerald-400/60 font-medium w-[60px] text-right">
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
