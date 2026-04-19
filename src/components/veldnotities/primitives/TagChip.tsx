'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { Droplets, Leaf, ListTodo, Eye, Tag as TagIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { tagTokens, tagLabel, TAG_LUCIDE_ICON, type FieldNoteTag } from '@/lib/veldnotities/tag-colors'

const ICON_MAP = {
  Droplets,
  Leaf,
  ListTodo,
  Eye,
  Tag: TagIcon,
}

interface TagChipProps {
  tag: FieldNoteTag
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  interactive?: boolean
  active?: boolean
  count?: number
  onClick?: () => void
  className?: string
}

export function TagChip({
  tag,
  size = 'sm',
  showLabel = true,
  interactive = false,
  active = false,
  count,
  onClick,
  className,
}: TagChipProps) {
  const tokens = tagTokens(tag)
  const Icon = ICON_MAP[TAG_LUCIDE_ICON[tag]]

  const sizeClasses = {
    sm: 'h-[22px] px-1.5 gap-1 text-[10px]',
    md: 'h-7 px-2.5 gap-1.5 text-[11px]',
    lg: 'h-10 px-3.5 gap-2 text-sm',
  }[size]

  const iconSize = {
    sm: 'h-2.5 w-2.5',
    md: 'h-3 w-3',
    lg: 'h-4 w-4',
  }[size]

  const baseClasses = cn(
    'inline-flex items-center rounded-full border font-medium transition-colors whitespace-nowrap',
    sizeClasses,
    active ? cn(tokens.bgSolid, 'border-transparent text-white') : cn(tokens.bgSubtle, tokens.border, tokens.text),
    interactive && !active && cn('cursor-pointer', tokens.borderHover),
    interactive && active && 'cursor-pointer',
    className,
  )

  const content = (
    <>
      <Icon className={iconSize} />
      {showLabel && <span>{tagLabel(tag)}</span>}
      {typeof count === 'number' && (
        <span
          className={cn(
            'ml-0.5 rounded-full px-1.5 font-bold',
            active ? 'bg-white/20 text-white' : cn(tokens.bgSolid, 'text-white'),
            size === 'sm' ? 'text-[9px]' : size === 'md' ? 'text-[10px]' : 'text-xs',
          )}
        >
          {count}
        </span>
      )}
    </>
  )

  if (interactive) {
    return (
      <button type="button" onClick={onClick} className={baseClasses}>
        {content}
      </button>
    )
  }

  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={baseClasses}
    >
      {content}
    </motion.span>
  )
}
