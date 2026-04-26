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
    useDeleteTaskLog,
    useActiveTaskSessions,
    useStartTaskSession,
    useStopTaskSession,
    useStopTaskSessionMultiDay,
    useUpdateActiveTaskSession,
    useDeleteActiveTaskSession,
    useWorkSchedule,
} from '@/hooks/use-data'
import { useParcelGroupOptions } from '@/hooks/use-parcel-group-options'
import type { ActiveTaskSession } from '@/lib/types'
import { UrenKPI } from '@/components/urenregistratie/primitives/UrenKPI'
import { SectionHeader } from '@/components/urenregistratie/primitives/SectionHeader'
import { QuickStartChips } from '@/components/urenregistratie/QuickStartChips'
import { ActiveSessions } from '@/components/urenregistratie/ActiveSessions'
import { StopSessionWizard } from '@/components/urenregistratie/StopSessionWizard'
import { colorForTaskType } from '@/lib/urenregistratie/task-colors'
import { RegistrationForm } from '@/components/urenregistratie/RegistrationForm'
import { TaskLogsList } from '@/components/urenregistratie/TaskLogsList'
import { HoursAnalytics } from '@/components/urenregistratie/HoursAnalytics'
import { LongRunningBanner } from '@/components/urenregistratie/LongRunningBanner'
import { QuickStartSheet } from '@/components/urenregistratie/QuickStartSheet'
import { WorkScheduleOnboarding } from '@/components/urenregistratie/WorkScheduleOnboarding'
import { EmptyTaskTypesCard } from '@/components/urenregistratie/EmptyTaskTypesCard'
import { calcActiveSessionContribution } from '@/components/urenregistratie/utils'
import { useToast } from '@/hooks/use-toast'

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
    // useParcels() vervangen door useParcelGroupOptions() (zie hieronder)
    const { data: activeSessions = [], isLoading: activeLoading } = useActiveTaskSessions()

    const addTaskLogMutation = useAddTaskLog()
    const deleteTaskLogMutation = useDeleteTaskLog()
    const startTaskSessionMutation = useStartTaskSession()
    const stopTaskSessionMutation = useStopTaskSession()
    const stopMultiDayMutation = useStopTaskSessionMultiDay()
    const updateActiveTaskSessionMutation = useUpdateActiveTaskSession()
    const deleteActiveTaskSessionMutation = useDeleteActiveTaskSession()
    const { data: workSchedule = [] } = useWorkSchedule()

    const [activeTab, setActiveTab] = React.useState<TabKey>('invoer')
    const [stoppingSession, setStoppingSession] = React.useState<ActiveTaskSession | null>(null)
    const [quickStartTaskTypeId, setQuickStartTaskTypeId] = React.useState<string | null>(null)
    const { toast } = useToast()

    // Tick elke minuut om augmentedStats (live KPI's) te laten bijwerken
    // zolang er actieve sessies zijn. Zonder tick "bevriezen" Vandaag/Week op
    // de initiële render-tijd.
    const [, setTick] = React.useState(0)
    React.useEffect(() => {
        if (activeSessions.length === 0) return
        const interval = setInterval(() => setTick(t => t + 1), 60_000)
        return () => clearInterval(interval)
    }, [activeSessions.length])

    /**
     * Helper voor korte succes-toasts. Oudere gebruikers twijfelen vaak of
     * hun actie is doorgekomen — korte bevestiging voorkomt dubbele klikken.
     */
    const notify = React.useCallback(
        (title: string, description?: string) => {
            toast({ title, description, duration: 3000 })
        },
        [toast],
    )

    const isLoading = typesLoading || logsLoading || statsLoading || activeLoading

    /**
     * `stats` uit useTaskStats() telt alleen afgeronde task_logs. Een lopende
     * timer (die uren kan verzamelen) komt daar nooit in terug — met als gevolg
     * dat "Vandaag 0u" en "Deze week 2u" staan terwijl er een timer al 40u loopt.
     *
     * We augmenteren de stats hier met de live-verstreken werkuren per actieve
     * sessie, net zoals de meter op de Actieve-taken kaart zelf doet.
     */
    const augmentedStats = React.useMemo(() => {
        const base = stats ?? { todayHours: 0, weekHours: 0, weekCost: 0, monthCost: 0, topActivity: null }
        let todayHours = base.todayHours
        let weekHours = base.weekHours
        let monthCost = base.monthCost

        for (const session of activeSessions) {
            const contrib = calcActiveSessionContribution(session, workSchedule)
            todayHours += contrib.todayHours
            weekHours += contrib.weekHours
            monthCost += contrib.monthCost
        }

        return { ...base, todayHours, weekHours, monthCost }
    }, [stats, activeSessions, workSchedule])

    // Tik op een QuickStart-chip opent eerst de bevestiging-sheet zodat
    // de gebruiker personen/perceel/starttijd kan aanpassen — voorkomt
    // accidentele timers en missende context.
    const handleQuickStart = (taskTypeId: string) => {
        setQuickStartTaskTypeId(taskTypeId)
    }

    const quickStartTaskType = React.useMemo(
        () => taskTypes.find(t => t.id === quickStartTaskTypeId) ?? null,
        [taskTypes, quickStartTaskTypeId],
    )

    const handleStopSimple = async (sessionId: string, endTime: Date, hoursPerPerson: number) => {
        await stopTaskSessionMutation.mutateAsync({ sessionId, endTime, hoursPerPerson })
        setStoppingSession(null)
        notify('Taak afgerond', `${hoursPerPerson.toFixed(1)} uur per persoon opgeslagen`)
    }

    const handleStopMultiDay = async (sessionId: string, entries: Array<{ date: string; hoursPerPerson: number; peopleCount: number }>) => {
        await stopMultiDayMutation.mutateAsync({ sessionId, entries })
        setStoppingSession(null)
        const totalHours = entries.reduce((sum, e) => sum + e.hoursPerPerson * e.peopleCount, 0)
        notify('Taak afgerond', `${entries.length} dagen · ${totalHours.toFixed(1)} uur totaal opgeslagen`)
    }

    /**
     * Group sprayable parcels into hoofdperceel → subpercelen trees voor de
     * hiërarchische selector. Gebruikt de gedeelde hook (groepering op
     * `parcelName`) zodat de hiërarchie identiek is aan /percelen, spuitschrift,
     * veldnotities en oogst.
     *
     * Belangrijke fix: vroeger groepeerde we op `sp.parcelId || sp.id` —
     * waardoor "Jan van W ×3 losse parcels" als 3 hoofdpercelen verscheen.
     * Nu groeperen op naam, dus "Jan van W" is altijd 1 groep.
     */
    const { data: parcelGroups = [] } = useParcelGroupOptions()

    if (isLoading) {
        return (
            <div className="p-8 flex items-center justify-center min-h-[400px]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                    <p className="text-white/70 font-medium text-base">Gegevens laden...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
            {/* Header */}
            <SectionHeader
                pill="Team & Tasks"
                color="emerald"
                title="Urenregistratie"
                description="Registreer, bekijk en analyseer gewerkte uren"
                action={
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 px-3 py-1.5 font-bold flex items-center gap-1.5">
                        <Tractor className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Team & Tasks</span>
                    </Badge>
                }
            />

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <UrenKPI
                    label="Vandaag"
                    value={augmentedStats.todayHours}
                    suffix=" uur"
                    decimals={1}
                    color="emerald"
                    icon={Clock}
                    live={activeSessions.length > 0}
                />
                <UrenKPI
                    label="Deze week"
                    value={augmentedStats.weekHours}
                    suffix=" uur"
                    decimals={0}
                    color="cyan"
                    icon={Timer}
                />
                <UrenKPI
                    label="Maandkosten"
                    value={augmentedStats.monthCost}
                    prefix="€"
                    decimals={0}
                    color="amber"
                    icon={Euro}
                />
                <UrenKPI
                    label={activeSessions.length > 0 ? 'Nu aan het werk' : 'Actieve timers'}
                    value={activeSessions.reduce((sum, s) => sum + s.peopleCount, 0)}
                    decimals={0}
                    color="lime"
                    icon={Users}
                    live={activeSessions.length > 0}
                    detail={
                        activeSessions.length > 0
                            ? `${activeSessions.reduce((sum, s) => sum + s.peopleCount, 0) === 1 ? 'persoon' : 'personen'} over ${activeSessions.length} ${activeSessions.length === 1 ? 'taak' : 'taken'}`
                            : 'Geen timers actief'
                    }
                />
            </div>

            {/* Tab Navigation — pill-style met grotere tap targets */}
            <div className="overflow-x-auto scrollbar-hide -mx-4 md:-mx-0 px-4 md:px-0">
                <nav className="flex gap-2 min-w-max rounded-2xl border border-white/[0.06] bg-white/[0.02] p-1.5" aria-label="Tabs">
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
                                aria-current={active ? 'page' : undefined}
                                className={cn(
                                    'flex items-center gap-2.5 px-5 py-3 text-base font-semibold whitespace-nowrap rounded-xl transition-all duration-200 min-h-[56px] flex-1',
                                    active
                                        ? 'text-emerald-200 bg-emerald-500/15 border border-emerald-500/30 shadow-[0_0_24px_rgba(16,185,129,0.08)]'
                                        : 'text-white/55 border border-transparent hover:text-white hover:bg-white/[0.04]'
                                )}
                            >
                                <Icon className={cn('h-5 w-5 flex-shrink-0', active ? 'text-emerald-300' : 'text-white/50')} />
                                <span>{tab.label}</span>
                                {badge !== null && (
                                    <span
                                        aria-label={`${badge} actieve ${badge === 1 ? 'timer' : 'timers'}`}
                                        className="flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/40 text-xs font-bold animate-pulse"
                                    >
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
                    {/* Onboarding-nudge als schema nog leeg is */}
                    <WorkScheduleOnboarding workSchedule={workSchedule} />

                    {/* Waarschuwing: vergeten timers */}
                    <LongRunningBanner sessions={activeSessions} />

                    {/* Empty-state: nog geen taaktypes aangemaakt */}
                    {taskTypes.length === 0 && <EmptyTaskTypesCard />}

                    {/* Quick Start Chips */}
                    <QuickStartChips
                        taskTypes={taskTypes}
                        onStartTimer={handleQuickStart}
                        disabled={startTaskSessionMutation.isPending}
                    />

                    {/* Active Sessions */}
                    <ActiveSessions
                        sessions={activeSessions}
                        workSchedule={workSchedule}
                        taskTypes={taskTypes}
                        onStop={(session) => setStoppingSession(session)}
                        onDelete={(id) => {
                            deleteActiveTaskSessionMutation.mutate(id)
                            notify('Timer geannuleerd', 'De actieve taak is verwijderd zonder uren op te slaan')
                        }}
                        onUpdate={(id, updates) => {
                            updateActiveTaskSessionMutation.mutate({ id, updates })
                            notify('Aangepast', 'Wijzigingen zijn opgeslagen')
                        }}
                    />

                    {/* Scheider tussen snelle timer-flow en uitgebreide invoer */}
                    {taskTypes.length > 0 && (
                        <div className="flex items-center gap-3 pt-2">
                            <div className="h-px flex-1 bg-white/10" />
                            <span className="text-sm text-white/55 font-medium">
                                of voer uren achteraf in
                            </span>
                            <div className="h-px flex-1 bg-white/10" />
                        </div>
                    )}

                    {/* Registration Form — alleen als er taaktypes zijn;
                        anders volstaat de EmptyTaskTypesCard hierboven. */}
                    {taskTypes.length > 0 && (
                        <RegistrationForm
                            taskTypes={taskTypes}
                            parcelGroups={parcelGroups}
                            workSchedule={workSchedule}
                            lastLog={taskLogs[0] ?? null}
                            onRegister={async (data) => {
                                await addTaskLogMutation.mutateAsync(data)
                                const taskName = taskTypes.find(t => t.id === data.taskTypeId)?.name ?? 'Registratie'
                                const total = data.peopleCount * data.hoursPerPerson * data.days
                                notify(`${taskName} opgeslagen`, `${total.toFixed(1)} uur totaal`)
                            }}
                            onStartSession={async (data) => {
                                await startTaskSessionMutation.mutateAsync(data)
                                const taskName = taskTypes.find(t => t.id === data.taskTypeId)?.name ?? 'Timer'
                                notify(`Timer gestart: ${taskName}`, 'Zichtbaar onder "Actieve taken"')
                            }}
                            isSubmitting={addTaskLogMutation.isPending || startTaskSessionMutation.isPending}
                        />
                    )}
                </div>
            )}

            {activeTab === 'overzicht' && (
                <TaskLogsList
                    logs={taskLogs}
                    taskTypes={taskTypes}
                    onDelete={(id) => {
                        deleteTaskLogMutation.mutate(id)
                        notify('Registratie verwijderd')
                    }}
                />
            )}

            {activeTab === 'analyse' && (
                <HoursAnalytics logs={taskLogs} />
            )}

            {/* Stop Session Wizard — stap-voor-stap ipv editable table */}
            {stoppingSession && (() => {
                const tt = taskTypes.find(t => t.id === stoppingSession.taskTypeId)
                return (
                    <StopSessionWizard
                        session={stoppingSession}
                        workSchedule={workSchedule}
                        taskColor={colorForTaskType(stoppingSession.taskTypeId, tt?.color ?? null)}
                        onStopSimple={handleStopSimple}
                        onStopMultiDay={handleStopMultiDay}
                        onCancel={() => setStoppingSession(null)}
                        isPending={stopTaskSessionMutation.isPending || stopMultiDayMutation.isPending}
                    />
                )
            })()}

            {/* QuickStart confirmation sheet — zichtbaar ná chip-tik */}
            {quickStartTaskType && (
                <QuickStartSheet
                    taskType={quickStartTaskType}
                    parcelGroups={parcelGroups}
                    onCancel={() => setQuickStartTaskTypeId(null)}
                    onStart={async (data) => {
                        await startTaskSessionMutation.mutateAsync(data)
                        setQuickStartTaskTypeId(null)
                        notify(`Timer gestart: ${quickStartTaskType.name}`, 'Zichtbaar onder "Actieve taken"')
                    }}
                    isPending={startTaskSessionMutation.isPending}
                />
            )}
        </div>
    )
}
