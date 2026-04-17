'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { tokensFor, type TaskColor } from '@/lib/urenregistratie/task-colors'

interface SectionHeaderProps {
  /** Kleine pill-label boven de titel, e.g. "Live" / "Vandaag" / "Overzicht" */
  pill?: string
  /** Als `pill` is gezet: of het een pulserend bolletje moet tonen (default true) */
  pillPulse?: boolean
  /** Kleur van de pill (default emerald) */
  color?: TaskColor
  /** Hoofd-titel — krijgt gradient tekst */
  title: string
  /** Optionele gradient tekst suffix (bijv. "Niets dat je niet nodig hebt") */
  subtitleGradient?: string
  /** Korte beschrijving onder de titel */
  description?: string
  /** Compact variant (kleinere typo) voor within-card sections */
  compact?: boolean
  /** Toon de aurora blur-achtergrond (default true) */
  showAurora?: boolean
  /** Rechts uitgelijnd slot voor actie-knoppen */
  action?: React.ReactNode
  className?: string
}

/**
 * Sectie-header met pill-badge, gradient tekst en aurora-achtergrond.
 * Volgt patroon uit `feature-bento.tsx:1510-1536`.
 *
 * Gebruik boven hoofd-secties ("Actieve taken", "Invoer achteraf", "Werkschema").
 */
export function SectionHeader({
  pill,
  pillPulse = true,
  color = 'emerald',
  title,
  subtitleGradient,
  description,
  compact = false,
  showAurora = true,
  action,
  className,
}: SectionHeaderProps) {
  const tokens = tokensFor(color)

  return (
    <div className={cn('relative', className)}>
      {/* Aurora achtergrond — zeer subtiel blurred gloed */}
      {showAurora && (
        <>
          <div
            className={cn(
              'pointer-events-none absolute inset-x-0 -top-4 h-24 opacity-[0.04]',
              'bg-gradient-to-b from-transparent to-transparent',
            )}
            style={{
              background: `linear-gradient(to bottom, ${tokens.glow}, transparent)`,
            }}
            aria-hidden
          />
          <div
            className={cn(
              'pointer-events-none absolute left-1/2 -top-6 -translate-x-1/2',
              'w-[600px] h-40 rounded-full blur-[100px] opacity-[0.05]',
              tokens.orb,
            )}
            aria-hidden
          />
        </>
      )}

      <div className="relative flex items-start justify-between gap-4">
        <div>
          {/* Pill badge */}
          {pill && (
            <div
              className={cn(
                'inline-flex items-center gap-2 px-3 py-1 rounded-full border mb-3',
                tokens.bgSubtle,
                tokens.border,
              )}
            >
              {pillPulse && (
                <div className={cn('w-1.5 h-1.5 rounded-full', tokens.orb, 'animate-pulse')} />
              )}
              <span className={cn('text-[11px] font-semibold tracking-widest uppercase', tokens.text)}>
                {pill}
              </span>
            </div>
          )}

          {/* Titel + optionele gradient subtitle */}
          <h2
            className={cn(
              'font-semibold text-white tracking-tight',
              compact ? 'text-lg md:text-xl' : 'text-2xl md:text-3xl',
            )}
          >
            {title}
            {subtitleGradient && (
              <>
                {' '}
                <span className="bg-gradient-to-r from-slate-300 to-slate-500 bg-clip-text text-transparent">
                  {subtitleGradient}
                </span>
              </>
            )}
          </h2>

          {description && (
            <p className={cn('mt-1 text-white/50', compact ? 'text-xs' : 'text-sm')}>{description}</p>
          )}
        </div>

        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
    </div>
  )
}
