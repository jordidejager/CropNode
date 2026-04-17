'use client'

import * as React from 'react'
import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { Play, Settings, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TaskType } from '@/lib/types'

interface QuickStartChipsProps {
    taskTypes: TaskType[]
    onStartTimer: (taskTypeId: string) => void
    disabled?: boolean
}

/**
 * Snel-start chips voor het direct starten van een timer.
 * Respecteert `prefers-reduced-motion`. Elke chip is min. 44px hoog.
 *
 * Tik op een chip opent een bevestigingssheet waarin je aantal personen,
 * perceel en starttijd kunt aanpassen voor de timer echt start.
 *
 * De "Beheer"-knop leidt naar /urenregistratie/beheer (taaktypes, tarieven,
 * werkschema, spuituren). Prominenter dan voorheen met duidelijke emerald-stijl.
 */
export function QuickStartChips({ taskTypes, onStartTimer, disabled }: QuickStartChipsProps) {
    const reduceMotion = useReducedMotion()

    if (taskTypes.length === 0) return null

    const getMotionProps = (i: number) =>
        reduceMotion
            ? { initial: false, animate: { opacity: 1, y: 0 } }
            : {
                  initial: { opacity: 0, y: 8 },
                  animate: { opacity: 1, y: 0 },
                  transition: { delay: i * 0.04, duration: 0.3 },
              }

    return (
        <div>
            <div className="flex items-center justify-between gap-3 mb-3 px-1">
                <div>
                    <h2 className="text-base font-semibold text-white">
                        Snel een timer starten
                    </h2>
                    <p className="text-sm text-white/60 mt-0.5">
                        Je kunt de instellingen nog aanpassen voor het starten.
                    </p>
                </div>
                <Link
                    href="/urenregistratie/beheer"
                    aria-label="Taaktypes, tarieven en werkschema beheren"
                    className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 min-h-[40px]',
                        'text-sm font-semibold text-emerald-200',
                        'bg-emerald-500/10 border border-emerald-500/30',
                        'hover:bg-emerald-500/20 hover:border-emerald-500/50 hover:text-emerald-100',
                        'transition-colors whitespace-nowrap',
                    )}
                >
                    <Settings className="h-4 w-4" />
                    Beheer
                </Link>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar px-1">
                {taskTypes.map((type, i) => (
                    <motion.button
                        key={type.id}
                        {...getMotionProps(i)}
                        onClick={() => onStartTimer(type.id)}
                        disabled={disabled}
                        aria-label={`Timer starten voor ${type.name}`}
                        className={cn(
                            'flex items-center gap-2 px-4 py-2.5 rounded-full',
                            'bg-orange-500/15 border border-orange-500/30',
                            'text-sm font-semibold text-orange-200 transition-all whitespace-nowrap',
                            'hover:bg-orange-500/25 hover:border-orange-500/50 hover:text-orange-100 hover:shadow-lg',
                            'active:scale-95',
                            'disabled:opacity-50 disabled:cursor-not-allowed',
                            'min-h-[44px]'
                        )}
                    >
                        <Play className="h-3.5 w-3.5" />
                        {type.name}
                    </motion.button>
                ))}
                <Link
                    href="/urenregistratie/beheer"
                    aria-label="Nieuw taaktype toevoegen"
                    className={cn(
                        'flex items-center gap-2 px-4 py-2.5 rounded-full',
                        'bg-white/5 border border-dashed border-white/20',
                        'text-sm font-medium text-white/70 transition-all whitespace-nowrap',
                        'hover:bg-emerald-500/10 hover:border-emerald-500/30 hover:text-emerald-300',
                        'min-h-[44px]'
                    )}
                >
                    <Plus className="h-4 w-4" />
                    Nieuw taaktype
                </Link>
            </div>
        </div>
    )
}
