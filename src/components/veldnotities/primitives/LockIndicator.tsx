'use client'

import * as React from 'react'
import { Lock, Unlock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LockIndicatorProps {
  isLocked: boolean
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  className?: string
  onClick?: () => void
  title?: string
}

export function LockIndicator({
  isLocked,
  size = 'sm',
  showLabel = false,
  className,
  onClick,
  title,
}: LockIndicatorProps) {
  const Icon = isLocked ? Lock : Unlock
  const sizeClass = { sm: 'h-3 w-3', md: 'h-4 w-4', lg: 'h-5 w-5' }[size]
  const colorClass = isLocked ? 'text-amber-300' : 'text-white/30'
  const labelSize = { sm: 'text-[10px]', md: 'text-xs', lg: 'text-sm' }[size]

  const content = (
    <>
      <Icon className={cn(sizeClass, colorClass, 'flex-shrink-0')} />
      {showLabel && (
        <span className={cn('font-medium', colorClass, labelSize)}>
          {isLocked ? 'Privé' : 'Zichtbaar'}
        </span>
      )}
    </>
  )

  const classes = cn(
    'inline-flex items-center gap-1.5',
    onClick && 'cursor-pointer hover:opacity-80 transition-opacity',
    className,
  )

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes} title={title ?? (isLocked ? 'Maak notitie zichtbaar' : 'Maak notitie privé')}>
        {content}
      </button>
    )
  }

  return <span className={classes} title={title}>{content}</span>
}
