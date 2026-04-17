'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft, Settings } from 'lucide-react'
import {
    useTaskTypes,
    useAddTaskType,
    useUpdateTaskType,
} from '@/hooks/use-data'
import { useToast } from '@/hooks/use-toast'
import { TaskTypesPanel } from '@/components/urenregistratie/TaskTypesPanel'
import { WorkScheduleSettings } from '@/components/urenregistratie/WorkScheduleSettings'
import { SprayMinutesPanel } from '@/components/urenregistratie/SprayMinutesPanel'

/**
 * Beheer-pagina voor alle uren-gerelateerde instellingen:
 *  - Taaktypes & tarieven
 *  - Werkschema (ma-zo tijden, pauzes, werkdag-vlaggen)
 *  - Spuituren-berekening (minuten per hectare)
 *
 * Voorheen zaten werkschema en spuituren onder /instellingen — nu samen op
 * één logische plek binnen de urenregistratie-module.
 */
export default function BeheerClientPage() {
    const { data: taskTypes = [], isLoading: typesLoading } = useTaskTypes()
    const addTaskTypeMutation = useAddTaskType()
    const updateTaskTypeMutation = useUpdateTaskType()
    const { toast } = useToast()

    const notify = React.useCallback(
        (title: string, description?: string) => {
            toast({ title, description, duration: 3000 })
        },
        [toast],
    )

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
            {/* Header met terugknop */}
            <div className="space-y-3">
                <Link
                    href="/urenregistratie"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-white/70 hover:text-white transition-colors"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Terug naar urenregistratie
                </Link>
                <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                        <Settings className="h-5 w-5 text-emerald-300" />
                    </div>
                    <div>
                        <h1 className="text-2xl md:text-3xl font-black text-white">Beheer</h1>
                        <p className="text-base text-white/70 mt-0.5">
                            Taaktypes, werkschema en spuituren instellen
                        </p>
                    </div>
                </div>
            </div>

            {/* Taaktypes & tarieven */}
            {typesLoading ? (
                <div className="h-40 rounded-xl border border-white/10 bg-white/[0.02] flex items-center justify-center text-white/50 text-sm">
                    Laden...
                </div>
            ) : (
                <TaskTypesPanel
                    taskTypes={taskTypes}
                    onAdd={async (name, hourlyRate) => {
                        await addTaskTypeMutation.mutateAsync({ name, defaultHourlyRate: hourlyRate })
                        notify(`Taaktype "${name}" toegevoegd`)
                    }}
                    onUpdate={async (id, updates) => {
                        await updateTaskTypeMutation.mutateAsync({ id, updates })
                        notify('Taaktype aangepast')
                    }}
                    isAdding={addTaskTypeMutation.isPending}
                    isUpdating={updateTaskTypeMutation.isPending}
                />
            )}

            {/* Werkschema */}
            <WorkScheduleSettings />

            {/* Spuituren */}
            <SprayMinutesPanel />
        </div>
    )
}
