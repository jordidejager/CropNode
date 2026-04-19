'use client'

import * as React from 'react'
import { MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SubParcelInfo } from '@/hooks/use-field-notes'

interface ParcelBadgeProps {
  parcel: Pick<SubParcelInfo, 'id' | 'name' | 'parcel_name'>
  size?: 'sm' | 'md'
  onClick?: () => void
  className?: string
}

export function ParcelBadge({ parcel, size = 'sm', onClick, className }: ParcelBadgeProps) {
  const sizeClasses = {
    sm: 'h-[22px] px-1.5 gap-1 text-[10px] max-w-[100px]',
    md: 'h-7 px-2.5 gap-1.5 text-[11px] max-w-[140px]',
  }[size]

  const iconSize = size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'
  const label = parcel.parcel_name || parcel.name

  const classes = cn(
    'inline-flex items-center rounded-full bg-white/[0.04] border border-white/[0.08] text-white/55 font-medium',
    sizeClasses,
    onClick && 'cursor-pointer hover:bg-white/[0.08] hover:text-white/80 transition-colors',
    className,
  )

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes} title={`Filter op ${label}`}>
        <MapPin className={cn(iconSize, 'flex-shrink-0')} />
        <span className="truncate">{label}</span>
      </button>
    )
  }

  return (
    <span className={classes}>
      <MapPin className={cn(iconSize, 'flex-shrink-0')} />
      <span className="truncate">{label}</span>
    </span>
  )
}
