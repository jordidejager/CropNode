'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface PhotoThumbProps {
  url: string
  size?: 'sm' | 'md' | 'lg'
  onClick?: () => void
  className?: string
  alt?: string
}

export function PhotoThumb({ url, size = 'md', onClick, className, alt = 'Foto' }: PhotoThumbProps) {
  const sizeClass = {
    sm: 'h-10 w-10',
    md: 'h-20 w-20',
    lg: 'h-28 w-28',
  }[size]

  const classes = cn(
    'rounded-xl overflow-hidden border border-white/[0.08] bg-black/40 flex-shrink-0',
    sizeClass,
    onClick && 'cursor-pointer hover:border-emerald-500/40 transition-colors',
    className,
  )

  const img = (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      className="h-full w-full object-cover"
      onError={(e) => {
        ;(e.currentTarget as HTMLImageElement).style.display = 'none'
      }}
    />
  )

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes} aria-label="Foto vergroten">
        {img}
      </button>
    )
  }

  return <div className={classes}>{img}</div>
}
