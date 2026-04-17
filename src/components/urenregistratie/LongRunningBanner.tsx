'use client'

import * as React from 'react'
import { AlertCircle } from 'lucide-react'
import type { ActiveTaskSession } from '@/lib/types'

/**
 * Waarschuwt wanneer een actieve sessie langer dan 24 uur loopt.
 * Klassieke fout: gebruiker is vergeten te stoppen aan het einde van de dag.
 */

const HOURS_THRESHOLD = 24

interface LongRunningBannerProps {
    sessions: ActiveTaskSession[]
}

export function LongRunningBanner({ sessions }: LongRunningBannerProps) {
    const now = Date.now()
    const longRunning = sessions.filter(s => {
        const elapsedMs = now - new Date(s.startTime).getTime()
        return elapsedMs > HOURS_THRESHOLD * 60 * 60 * 1000
    })

    if (longRunning.length === 0) return null

    const countLabel =
        longRunning.length === 1
            ? '1 timer loopt al langer dan 24 uur'
            : `${longRunning.length} timers lopen al langer dan 24 uur`

    return (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
                <div className="text-amber-200 font-semibold text-base">
                    Let op: {countLabel}
                </div>
                <div className="text-amber-200/70 text-sm mt-1">
                    Mogelijk ben je vergeten te stoppen. Controleer de actieve taken hieronder
                    en rond af zodra je klaar bent.
                </div>
            </div>
        </div>
    )
}
