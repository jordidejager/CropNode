'use client'

import * as React from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, ClipboardList } from 'lucide-react'

/**
 * Grote, uitnodigende empty-state voor een frisse account zonder taaktypes.
 * Leidt door naar /urenregistratie/beheer waar taaktypes + tarieven beheerd
 * worden.
 */

export function EmptyTaskTypesCard() {
    return (
        <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/[0.02] border-emerald-500/25">
            <CardContent className="p-6 md:p-8 flex flex-col items-center text-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 flex items-center justify-center">
                    <ClipboardList className="h-7 w-7 text-emerald-300" />
                </div>
                <div>
                    <h3 className="text-xl font-bold text-white">
                        Maak je eerste taaktype aan
                    </h3>
                    <p className="text-base text-white/70 mt-2 max-w-md">
                        Denk aan <span className="font-medium text-white/85">Snoeien</span>,{' '}
                        <span className="font-medium text-white/85">Dunnen</span>,{' '}
                        <span className="font-medium text-white/85">Plukken</span> of{' '}
                        <span className="font-medium text-white/85">Maaien</span>. Per type stel je
                        een uurtarief in — dat wordt automatisch gebruikt voor kostenberekening.
                    </p>
                </div>
                <Link
                    href="/urenregistratie/beheer"
                    className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold h-12 px-6 text-base rounded-md transition-colors"
                >
                    <Plus className="h-5 w-5" />
                    Taaktype toevoegen
                </Link>
            </CardContent>
        </Card>
    )
}
