'use client'

import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Droplets, Check } from 'lucide-react'
import { useUserSetting, useSetUserSetting } from '@/hooks/use-data'

/**
 * Spuituren-berekening: minuten per hectare die automatisch worden toegepast
 * bij bespuitingen om spuittijd per perceel in te schatten.
 *
 * Voorheen stond dit in /instellingen — nu samengebracht met werkschema en
 * taaktypes op /urenregistratie/beheer.
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
        setSprayMin(val)
        if (saveTimeout.current) clearTimeout(saveTimeout.current)
        saveTimeout.current = setTimeout(() => {
            setSettingMutation.mutate({ key: 'spray_minutes_per_ha', value: String(val) })
            setSaved(true)
            setTimeout(() => setSaved(false), 2000)
        }, 1000)
    }

    return (
        <Card className="bg-white/[0.03] border-white/10">
            <CardHeader>
                <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-white text-lg flex items-center gap-2">
                        <Droplets className="h-5 w-5 text-blue-400" />
                        Spuituren per hectare
                    </CardTitle>
                    {saved && (
                        <span className="flex items-center gap-1 text-sm text-emerald-300 font-medium">
                            <Check className="h-4 w-4" /> Opgeslagen
                        </span>
                    )}
                </div>
                <p className="text-sm text-white/60 mt-1">
                    Bij elke bespuiting worden automatisch spuituren berekend per perceel op
                    basis van het aantal hectares en deze waarde.
                </p>
            </CardHeader>
            <CardContent>
                <div className="space-y-2">
                    <Label className="text-white/80 text-sm font-semibold" htmlFor="spray-min">
                        Minuten per hectare
                    </Label>
                    <div className="flex flex-wrap items-center gap-3">
                        <Input
                            id="spray-min"
                            type="number"
                            min={5}
                            max={120}
                            step={5}
                            value={sprayMin}
                            onChange={(e) => handleChange(Math.max(5, parseInt(e.target.value) || 30))}
                            className="bg-white/5 border-white/10 text-white h-12 w-28 text-center text-lg font-semibold"
                        />
                        <span className="text-base text-white/75">minuten per hectare</span>
                    </div>
                    <p className="text-sm text-white/55 pt-1">
                        Voorbeeld: 2 ha × {sprayMin} min = <span className="text-white/80 font-medium">{((sprayMin * 2) / 60).toFixed(1)} uur spuiten</span>.
                    </p>
                </div>
            </CardContent>
        </Card>
    )
}
