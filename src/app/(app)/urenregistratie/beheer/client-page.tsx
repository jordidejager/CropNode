'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import {
    useTaskTypes,
    useAddTaskType,
    useUpdateTaskType,
} from '@/hooks/use-data'
import { useToast } from '@/hooks/use-toast'
import { TaskTypesPanel } from '@/components/urenregistratie/TaskTypesPanel'
import { WorkScheduleSettings } from '@/components/urenregistratie/WorkScheduleSettings'
import { SprayMinutesPanel } from '@/components/urenregistratie/SprayMinutesPanel'
import { SectionHeader } from '@/components/urenregistratie/primitives/SectionHeader'

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
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-white/70 hover:text-white transition-colors min-h-[44px]"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Terug naar urenregistratie
                </Link>
                <SectionHeader
                    pill="Beheer"
                    color="emerald"
                    title="Instellingen"
                    description="Taaktypes & tarieven, werkschema en spuituren"
                />
            </div>

            {/* Taaktypes & tarieven */}
            {typesLoading ? (
                <div className="h-40 rounded-xl border border-white/10 bg-white/[0.02] flex items-center justify-center text-white/50 text-sm">
                    Laden...
                </div>
            ) : (
                <TaskTypesPanel
                    taskTypes={taskTypes}
                    onAdd={async (name, hourlyRate, color) => {
                        await addTaskTypeMutation.mutateAsync({ name, defaultHourlyRate: hourlyRate, color } as Parameters<typeof addTaskTypeMutation.mutateAsync>[0])
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
