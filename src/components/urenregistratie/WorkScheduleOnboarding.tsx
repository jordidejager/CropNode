'use client'

import * as React from 'react'
import Link from 'next/link'
import { CalendarClock, ArrowRight } from 'lucide-react'
import type { WorkScheduleDay } from '@/lib/types'

/**
 * Toont een zachte nudge als de gebruiker (nog) geen werkschema heeft ingesteld.
 * Zonder schema vallen alle uren-berekeningen terug op defaults — wat de
 * gebruiker soms verbaast. Deze banner legt uit waarom het loont om het in
 * te stellen.
 */

interface WorkScheduleOnboardingProps {
    workSchedule: WorkScheduleDay[]
}

export function WorkScheduleOnboarding({ workSchedule }: WorkScheduleOnboardingProps) {
    // Als er schema-rows in de DB staan → gebruiker heeft het ingesteld.
    // Als het een lege array is → terugvallen op DEFAULT; nudge tonen.
    if (workSchedule.length > 0) return null

    return (
        <div className="rounded-xl border border-sky-500/25 bg-sky-500/[0.07] p-4 flex items-start gap-3">
            <CalendarClock className="h-5 w-5 text-sky-300 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
                <div className="text-sky-100 font-semibold text-base">
                    Werkrooster nog niet ingesteld
                </div>
                <div className="text-sky-100/80 text-sm mt-1 leading-relaxed">
                    Er wordt nu een standaard rooster gebruikt (ma-vr 07:30-17:00 met een pauze,
                    zaterdag 07:30-12:00). Stel je eigen rooster in voor automatische pauze- en
                    dagberekeningen.
                </div>
                <Link
                    href="/urenregistratie/beheer"
                    className="inline-flex items-center gap-1.5 mt-2.5 text-sm font-semibold text-sky-200 hover:text-sky-100 underline underline-offset-4"
                >
                    Werkrooster instellen
                    <ArrowRight className="h-3.5 w-3.5" />
                </Link>
            </div>
        </div>
    )
}
