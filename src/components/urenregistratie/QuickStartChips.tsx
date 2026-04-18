'use client'

import * as React from 'react'
import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { Play, Settings, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TaskType } from '@/lib/types'
import { colorForTaskType, tokensFor } from '@/lib/urenregistratie/task-colors'

interface QuickStartChipsProps {
    taskTypes: TaskType[]
    onStartTimer: (taskTypeId: string) => void
    disabled?: boolean
}

/**
 * Snel-start chips voor het direct starten van een timer.
 *
 * Elke chip krijgt de kleur van het taaktype (uit `color` kolom of
 * deterministische hash). Min 64px hoog — makkelijk tikbaar voor oudere
 * gebruikers. Glow-orb + gradient border op hover (landing-page design taal).
 *
 * Tik op een chip opent een bevestigingssheet (QuickStartSheet) waarin
 * aantal personen, perceel en starttijd aangepast kunnen worden.
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
                        'inline-flex items-center gap-1.5 rounded-full px-4 py-2 min-h-[48px]',
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
            <div className="flex items-center gap-2.5 overflow-x-auto pb-1 no-scrollbar px-1">
                {taskTypes.map((type, i) => {
                    const color = colorForTaskType(type.id, type.color)
                    const tokens = tokensFor(color)
                    return (
                        <motion.button
                            key={type.id}
                            {...getMotionProps(i)}
                            onClick={() => onStartTimer(type.id)}
                            disabled={disabled}
                            aria-label={`Timer starten voor ${type.name}`}
                            className={cn(
                                // shrink-0 voorkomt dat flex-items in de horizontale
                                // scroll-strook samengeknepen worden — zonder dit werd
                                // "Boomverzorging" afgekapt tot "Boomv"
                                'group relative overflow-hidden flex shrink-0 items-center gap-2.5 px-5 py-3 rounded-2xl',
                                tokens.bgSubtle,
                                'border', tokens.border,
                                'text-base font-semibold transition-all whitespace-nowrap',
                                tokens.text,
                                tokens.borderHover,
                                'hover:shadow-lg',
                                'active:scale-[0.97]',
                                'disabled:opacity-50 disabled:cursor-not-allowed',
                                'min-h-[64px]',
                            )}
                            style={
                                !disabled
                                    ? { boxShadow: `inset 0 0 0 1px transparent` }
                                    : undefined
                            }
                        >
                            {/* Glow orb rechts — subtiel zichtbaar, op hover sterker */}
                            <span
                                className={cn(
                                    'pointer-events-none absolute -top-6 -right-6 w-16 h-16 rounded-full blur-[30px]',
                                    'opacity-[0.15] group-hover:opacity-[0.35] transition-opacity',
                                    tokens.orb,
                                )}
                                aria-hidden
                            />
                            <span
                                className={cn(
                                    'relative flex h-8 w-8 items-center justify-center rounded-xl',
                                    tokens.bgSolid, 'text-white shadow-inner',
                                )}
                            >
                                <Play className="h-3.5 w-3.5 fill-white" />
                            </span>
                            <span className="relative">{type.name}</span>
                        </motion.button>
                    )
                })}
                <Link
                    href="/urenregistratie/beheer"
                    aria-label="Nieuw taaktype toevoegen"
                    className={cn(
                        'flex shrink-0 items-center gap-2 px-5 py-3 rounded-2xl',
                        'bg-white/5 border border-dashed border-white/20',
                        'text-base font-medium text-white/70 transition-all whitespace-nowrap',
                        'hover:bg-emerald-500/10 hover:border-emerald-500/30 hover:text-emerald-300',
                        'min-h-[64px]',
                    )}
                >
                    <Plus className="h-4 w-4" />
                    Nieuw taaktype
                </Link>
            </div>
        </div>
    )
}
