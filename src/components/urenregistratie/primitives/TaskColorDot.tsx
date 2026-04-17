'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { tokensFor, type TaskColor } from '@/lib/urenregistratie/task-colors'

interface TaskColorDotProps {
  color: TaskColor
  /** Optioneel icoon in het midden van de dot */
  icon?: React.ComponentType<{ className?: string }>
  /** Dot-grootte */
  size?: 'xs' | 'sm' | 'md' | 'lg'
  /** Gloed eromheen voor live/active indicatoren */
  glow?: boolean
  /** Pulserend — voor live timers */
  pulse?: boolean
  className?: string
}

const SIZES = {
  xs: 'h-2 w-2',
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
}

const ICON_SIZES = {
  xs: 'h-1.5 w-1.5',
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
  lg: 'h-3 w-3',
}

/**
 * Kleine kleur-dot voor taaktype indicatoren in lijsten, legendes,
 * en tab-badges. Optioneel met iconbinnen voor extra duidelijkheid.
 */
export function TaskColorDot({
  color,
  icon: Icon,
  size = 'sm',
  glow = false,
  pulse = false,
  className,
}: TaskColorDotProps) {
  const tokens = tokensFor(color)

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full flex-shrink-0',
        tokens.orb,
        SIZES[size],
        glow && `shadow-[0_0_12px_${tokens.hex}]`,
        pulse && 'animate-pulse',
        className,
      )}
      style={glow ? { boxShadow: `0 0 14px ${tokens.hex}` } : undefined}
      aria-hidden
    >
      {Icon && <Icon className={cn('text-white', ICON_SIZES[size])} />}
    </span>
  )
}
