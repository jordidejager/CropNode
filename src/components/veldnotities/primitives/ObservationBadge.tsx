'use client'

import * as React from 'react'
import { Bug, Shrub, Activity, Wind, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  observationTokens,
  OBSERVATION_CATEGORY_LABEL,
  type ObservationCategory,
} from '@/lib/veldnotities/tag-colors'

const CATEGORY_ICON: Record<ObservationCategory, React.ComponentType<{ className?: string }>> = {
  insect: Bug,
  schimmel: Shrub,
  ziekte: Activity,
  fysiologisch: Wind,
  overig: Info,
}

interface ObservationBadgeProps {
  subject: string | null
  category: ObservationCategory | null
  size?: 'sm' | 'md'
  onClick?: () => void
  className?: string
  compact?: boolean
}

export function ObservationBadge({
  subject,
  category,
  size = 'sm',
  onClick,
  className,
  compact = false,
}: ObservationBadgeProps) {
  if (!subject && !category) return null

  const tokens = observationTokens(category)
  const Icon = category ? CATEGORY_ICON[category] : Info

  const sizeClasses = {
    sm: 'h-[22px] px-1.5 gap-1 text-[10px]',
    md: 'h-7 px-2.5 gap-1.5 text-[11px]',
  }[size]

  const iconSize = size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'

  const label = compact
    ? (category ? OBSERVATION_CATEGORY_LABEL[category] : '')
    : (subject ?? (category ? OBSERVATION_CATEGORY_LABEL[category] : ''))

  const classes = cn(
    'inline-flex items-center rounded-full border font-medium whitespace-nowrap',
    sizeClasses,
    tokens.bgSubtle,
    tokens.border,
    tokens.text,
    onClick && cn('cursor-pointer transition-colors', tokens.borderHover),
    className,
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={classes}
        title={subject ? `Filter op ${subject}` : undefined}
      >
        <Icon className={cn(iconSize, 'flex-shrink-0')} />
        <span className="truncate max-w-[120px]">{label}</span>
      </button>
    )
  }

  return (
    <span className={classes}>
      <Icon className={cn(iconSize, 'flex-shrink-0')} />
      <span className="truncate max-w-[120px]">{label}</span>
    </span>
  )
}
