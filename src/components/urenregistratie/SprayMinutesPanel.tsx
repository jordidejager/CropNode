'use client'

import * as React from 'react'
import { Droplets, Check } from 'lucide-react'
import { useUserSetting, useSetUserSetting } from '@/hooks/use-data'
import { SpotlightCard } from './primitives/SpotlightCard'
import { SectionHeader } from './primitives/SectionHeader'
import { BigStepper } from './primitives/BigStepper'

/**
 * Spuituren-berekening: minuten per hectare die automatisch worden toegepast
 * bij bespuitingen om spuittijd per perceel in te schatten.
 *
 * BigStepper (+5 / −5 min) is veel vriendelijker voor oudere gebruikers dan
 * een native number input met mini-pijltjes. Live-preview onderaan toont
 * direct wat de waarde betekent voor een 2 ha voorbeeld.
 */
export function SprayMinutesPanel() {
    const { data: sprayMinSetting } = useUserSetting('spray_minutes_per_ha')
    const setSettingMutation = useSetUserSetting()
    const [sprayMin, setSprayMin] = React.useState<number>(30)
    const [saved, setSaved] = React.useState(false)
    const saveTimeout = React.useRef<NodeJS.Timeout>()

    React.useEffect(() => {
        if (sprayMinSetting) setSprayMin(parseInt(sprayMinSetting) || 30)
    }, [sprayMinSetting])

    const handleChange = (val: number) => {
        const clamped = Math.max(5, Math.min(120, val))
        setSprayMin(clamped)
        if (saveTimeout.current) clearTimeout(saveTimeout.current)
        saveTimeout.current = setTimeout(() => {
            setSettingMutation.mutate({ key: 'spray_minutes_per_ha', value: String(clamped) })
            setSaved(true)
            setTimeout(() => setSaved(false), 2000)
        }, 1000)
    }

    return (
        <SpotlightCard variant="section" color="blue" className="space-y-5">
            <SectionHeader
                pill="Spuituren"
                color="blue"
                title="Spuituren per hectare"
                description="Bij elke bespuiting worden automatisch spuituren berekend per perceel op basis van het aantal hectares en deze waarde."
                action={
                    saved ? (
                        <span className="flex items-center gap-1.5 text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 rounded-full px-3 py-1 font-semibold">
                            <Check className="h-3.5 w-3.5" /> Opgeslagen
                        </span>
                    ) : null
                }
            />

            <div className="grid gap-5 md:grid-cols-2 items-start">
                <BigStepper
                    label="Minuten per hectare"
                    value={sprayMin}
                    onChange={handleChange}
                    min={5}
                    max={120}
                    step={5}
                    suffix="min/ha"
                />

                <div className="relative overflow-hidden rounded-2xl border border-blue-500/15 bg-gradient-to-br from-blue-500/[0.06] to-blue-500/[0.01] p-5">
                    <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full blur-[60px] bg-blue-500 opacity-[0.08]" aria-hidden />
                    <div className="relative flex items-center gap-3 mb-2">
                        <Droplets className="h-5 w-5 text-blue-300" />
                        <span className="text-sm font-semibold text-blue-200 uppercase tracking-wider">Voorbeeld</span>
                    </div>
                    <div className="relative">
                        <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-2xl font-black text-white tabular-nums">2 ha</span>
                            <span className="text-xl text-white/30 font-black">×</span>
                            <span className="text-2xl font-black text-white tabular-nums">{sprayMin} min</span>
                            <span className="text-xl text-white/30 font-black">=</span>
                            <span className="text-3xl font-black text-blue-300 tabular-nums">
                                {((sprayMin * 2) / 60).toFixed(1).replace('.', ',')} uur
                            </span>
                        </div>
                        <p className="text-sm text-white/55 mt-2">Geschatte spuittijd op 2 hectare.</p>
                    </div>
                </div>
            </div>
        </SpotlightCard>
    )
}
