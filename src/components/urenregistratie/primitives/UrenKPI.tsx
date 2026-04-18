'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { SpotlightCard } from './SpotlightCard'
import type { TaskColor } from '@/lib/urenregistratie/task-colors'
import { CountUpNumber } from '@/components/analytics/shared/CountUpNumber'

interface UrenKPIProps {
  label: string
  value: number
  prefix?: string
  suffix?: string
  decimals?: number
  color?: TaskColor
  /** Extra regel onder de grote waarde — bijv. "3 personen over 2 taken" */
  detail?: React.ReactNode
  /** Optioneel icoon in de header (links naast label) */
  icon?: React.ComponentType<{ className?: string }>
  /** Toon pulserend bolletje voor live KPI's */
  live?: boolean
  className?: string
}

/**
 * KPI-card voor urenregistratie, met landing-page design upgrades:
 * spotlight, glow orb, noise texture, gradient border op hover.
 *
 * Gebruikt SpotlightCard variant='kpi'.
 */
export function UrenKPI({
  label,
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  color = 'emerald',
  detail,
  icon: Icon,
  live = false,
  className,
}: UrenKPIProps) {
  return (
    <SpotlightCard variant="kpi" color={color} className={cn('min-w-[160px]', className)}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-3.5 w-3.5 text-white/40" />}
          <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">
            {label}
          </span>
        </div>
        {live && (
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
            <span className="text-[10px] font-semibold text-red-300 uppercase tracking-wider">Live</span>
          </span>
        )}
      </div>
      <CountUpNumber
        value={value}
        prefix={prefix}
        suffix={suffix}
        decimals={decimals}
        className="text-3xl font-bold text-white tabular-nums"
      />
      {detail && <div className="mt-1 text-xs text-white/55">{detail}</div>}
    </SpotlightCard>
  )
}
