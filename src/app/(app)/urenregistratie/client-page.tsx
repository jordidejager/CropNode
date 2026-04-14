'use client'

import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import {
    Users, Clock, Euro, Timer, Tractor,
    ClipboardList, BarChart3, PenLine,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    useTaskTypes,
    useTaskLogs,
    useTaskStats,
    useAddTaskLog,
    useAddTaskType,
    useUpdateTaskType,
    useDeleteTaskLog,
    useParcels,
    useActiveTaskSessions,
    useStartTaskSession,
    useStopTaskSession,
    useStopTaskSessionMultiDay,
    useUpdateActiveTaskSession,
    useDeleteActiveTaskSession,
    useWorkSchedule,
} from '@/hooks/use-data'
import type { ActiveTaskSession } from '@/lib/types'
import { KPICard } from '@/components/analytics/shared/KPICard'
import { QuickStartChips } from '@/components/urenregistratie/QuickStartChips'
import { ActiveSessions } from '@/components/urenregistratie/ActiveSessions'
import { StopSessionDialog } from '@/components/urenregistratie/StopSessionDialog'
import { RegistrationForm } from '@/components/urenregistratie/RegistrationForm'
import { TaskLogsList } from '@/components/urenregistratie/TaskLogsList'
import { HoursAnalytics } from '@/components/urenregistratie/HoursAnalytics'
import { TaskTypeManager } from '@/components/urenregistratie/TaskTypeManager'

type TabKey = 'invoer' | 'overzicht' | 'analyse'

const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: 'invoer', label: 'Invoer', icon: PenLine },
    { key: 'overzicht', label: 'Overzicht', icon: ClipboardList },
    { key: 'analyse', label: 'Analyse', icon: BarChart3 },
]

export default function UrenregistratieClientPage() {
    const { data: taskTypes = [], isLoading: typesLoading } = useTaskTypes()
    const { data: taskLogs = [], isLoading: logsLoading } = useTaskLogs()
    const { data: stats, isLoading: statsLoading } = useTaskStats()
    const { data: parcels = [] } = useParcels()
    const { data: activeSessions = [], isLoading: activeLoading } = useActiveTaskSessions()

    const addTaskLogMutation = useAddTaskLog()
    const deleteTaskLogMutation = useDeleteTaskLog()
    const startTaskSessionMutation = useStartTaskSession()
    const stopTaskSessionMutation = useStopTaskSession()
    const stopMultiDayMutation = useStopTaskSessionMultiDay()
    const updateActiveTaskSessionMutation = useUpdateActiveTaskSession()
    const deleteActiveTaskSessionMutation = useDeleteActiveTaskSession()
    const addTaskTypeMutation = useAddTaskType()
    const updateTaskTypeMutation = useUpdateTaskType()
    const { data: workSchedule = [] } = useWorkSchedule()

    const [activeTab, setActiveTab] = React.useState<TabKey>('invoer')
    const [stoppingSession, setStoppingSession] = React.useState<ActiveTaskSession | null>(null)
    const [showTaskTypeManager, setShowTaskTypeManager] = React.useState(false)

    const isLoading = typesLoading || logsLoading || statsLoading || activeLoading

    const handleQuickStart = async (taskTypeId: string) => {
        await startTaskSessionMutation.mutateAsync({
            taskTypeId,
            subParcelId: null,
            startTime: new Date(),
            peopleCount: 1,
            notes: null,
        })
    }

    const handleStopSimple = async (sessionId: string, endTime: Date, hoursPerPerson: number) => {
        await stopTaskSessionMutation.mutateAsync({ sessionId, endTime, hoursPerPerson })
        setStoppingSession(null)
    }

    const handleStopMultiDay = async (sessionId: string, entries: Array<{ date: string; hoursPerPerson: number; peopleCount: number }>) => {
        await stopMultiDayMutation.mutateAsync({ sessionId, entries })
        setStoppingSession(null)
    }

    const parcelOptions = React.useMemo(() =>
        parcels.map(p => ({ id: p.id, name: p.name })),
        [parcels]
    )

    if (isLoading) {
        return (
            <div className="p-8 flex items-center justify-center min-h-[400px]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                    <p className="text-white/40 font-bold uppercase tracking-widest text-[10px]">Gegevens laden...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-white flex items-center gap-3">
                        <Users className="h-8 w-8 text-primary" />
                        Urenregistratie
                    </h1>
                    <p className="text-white/40 font-medium mt-1">Registreer, bekijk en analyseer gewerkte uren</p>
                </div>
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 px-3 py-1 font-bold w-fit flex items-center gap-1.5">
                    <Tractor className="h-3.5 w-3.5" />
                    Team & Tasks
                </Badge>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KPICard
                    label="Vandaag"
                    value={stats?.todayHours || 0}
                    suffix=" uur"
                    decimals={1}
                />
                <KPICard
                    label="Deze week"
                    value={stats?.weekHours || 0}
                    suffix=" uur"
                    decimals={0}
                />
                <KPICard
                    label="Maandkosten"
                    value={stats?.monthCost || 0}
                    prefix="€"
                    decimals={0}
                />
                <div className="flex flex-col gap-1 rounded-xl border border-white/5 bg-white/[0.03] p-4 min-w-[160px] backdrop-blur-sm">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Actief nu</span>
                    <span className="text-2xl font-semibold text-slate-100">
                        {activeSessions.reduce((sum, s) => sum + s.peopleCount, 0)}
                    </span>
                    <span className="text-xs text-slate-600">
                        {activeSessions.length > 0
                            ? `${activeSessions.length} ${activeSessions.length === 1 ? 'taak' : 'taken'} actief`
                            : '\u2014'
                        }
                    </span>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="overflow-x-auto scrollbar-hide -mx-4 md:-mx-8 px-4 md:px-8 border-b border-white/[0.06]">
                <nav className="flex gap-1 min-w-max" aria-label="Tabs">
                    {TABS.map((tab) => {
                        const active = tab.key === activeTab
                        const Icon = tab.icon
                        const badge = tab.key === 'invoer' && activeSessions.length > 0
                            ? activeSessions.length
                            : null
                        return (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={cn(
                                    'flex items-center gap-2.5 px-5 py-3.5 text-[15px] font-semibold whitespace-nowrap rounded-t-xl border-b-[3px] transition-all duration-150',
                                    active
                                        ? 'text-emerald-400 border-emerald-400 bg-emerald-500/[0.07]'
                                        : 'text-white/40 border-transparent hover:text-white/70 hover:bg-white/[0.04]'
                                )}
                            >
                                <Icon className={cn('h-[18px] w-[18px]', active ? 'text-emerald-400' : 'text-white/30')} />
                                {tab.label}
                                {badge !== null && (
                                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] font-bold">
                                        {badge}
                                    </span>
                                )}
                            </button>
                        )
                    })}
                </nav>
            </div>

            {/* Tab Content */}
            {activeTab === 'invoer' && (
                <div className="space-y-6">
                    {/* Quick Start Chips */}
                    <QuickStartChips
                        taskTypes={taskTypes}
                        onStartTimer={handleQuickStart}
                        onManageTypes={() => setShowTaskTypeManager(true)}
                        disabled={startTaskSessionMutation.isPending}
                    />

                    {/* Active Sessions */}
                    <ActiveSessions
                        sessions={activeSessions}
                        workSchedule={workSchedule}
                        onStop={(session) => setStoppingSession(session)}
                        onDelete={(id) => deleteActiveTaskSessionMutation.mutate(id)}
                        onUpdate={(id, updates) =>
                            updateActiveTaskSessionMutation.mutate({ id, updates })
                        }
                    />

                    {/* Registration Form */}
                    <RegistrationForm
                        taskTypes={taskTypes}
                        parcels={parcelOptions}
                        onRegister={async (data) => {
                            await addTaskLogMutation.mutateAsync(data)
                        }}
                        onStartSession={async (data) => {
                            await startTaskSessionMutation.mutateAsync(data)
                        }}
                        isSubmitting={addTaskLogMutation.isPending || startTaskSessionMutation.isPending}
                    />
                </div>
            )}

            {activeTab === 'overzicht' && (
                <TaskLogsList
                    logs={taskLogs}
                    taskTypes={taskTypes}
                    onDelete={(id) => deleteTaskLogMutation.mutate(id)}
                />
            )}

            {activeTab === 'analyse' && (
                <HoursAnalytics logs={taskLogs} />
            )}

            {/* Stop Session Dialog */}
            {stoppingSession && (
                <StopSessionDialog
                    session={stoppingSession}
                    workSchedule={workSchedule}
                    onStopSimple={handleStopSimple}
                    onStopMultiDay={handleStopMultiDay}
                    onCancel={() => setStoppingSession(null)}
                    isPending={stopTaskSessionMutation.isPending || stopMultiDayMutation.isPending}
                />
            )}

            {/* Task Type Manager */}
            {showTaskTypeManager && (
                <TaskTypeManager
                    taskTypes={taskTypes}
                    onAdd={async (name, hourlyRate) => {
                        await addTaskTypeMutation.mutateAsync({ name, defaultHourlyRate: hourlyRate })
                    }}
                    onUpdate={async (id, updates) => {
                        await updateTaskTypeMutation.mutateAsync({ id, updates })
                    }}
                    onClose={() => setShowTaskTypeManager(false)}
                    isAdding={addTaskTypeMutation.isPending}
                    isUpdating={updateTaskTypeMutation.isPending}
                />
            )}
        </div>
    )
}
