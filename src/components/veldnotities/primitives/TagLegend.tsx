'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { TAG_TO_COLOR, TAG_LABEL, tagTokens, type FieldNoteTag } from '@/lib/veldnotities/tag-colors'

interface TagLegendProps {
  layout?: 'horizontal' | 'vertical'
  counts?: Partial<Record<FieldNoteTag, number>>
  activeTag?: FieldNoteTag | null
  onTagClick?: (tag: FieldNoteTag) => void
  className?: string
  compact?: boolean
}

const TAGS: FieldNoteTag[] = ['bespuiting', 'bemesting', 'taak', 'waarneming', 'overig']

export function TagLegend({
  layout = 'horizontal',
  counts,
  activeTag,
  onTagClick,
  className,
  compact = false,
}: TagLegendProps) {
  return (
    <div
      className={cn(
        'inline-flex rounded-xl border border-white/[0.08] bg-black/40 backdrop-blur-md',
        layout === 'horizontal' ? 'flex-row flex-wrap items-center gap-1' : 'flex-col gap-1',
        compact ? 'p-1.5' : 'p-2',
        className,
      )}
    >
      {TAGS.map((tag) => {
        const tokens = tagTokens(tag)
        const count = counts?.[tag]
        const isActive = activeTag === tag
        const dotSize = compact ? 'h-2 w-2' : 'h-2.5 w-2.5'
        const textSize = compact ? 'text-[10px]' : 'text-[11px]'

        const content = (
          <>
            <span className={cn('rounded-full flex-shrink-0', dotSize, tokens.bgSolid)} aria-hidden />
            <span className={cn('font-medium whitespace-nowrap', textSize, tokens.text)}>{TAG_LABEL[tag]}</span>
            {typeof count === 'number' && count > 0 && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 font-bold',
                  compact ? 'text-[9px]' : 'text-[10px]',
                  isActive ? 'bg-white/20 text-white' : cn(tokens.bgSubtle, tokens.text),
                )}
              >
                {count}
              </span>
            )}
          </>
        )

        const classes = cn(
          'inline-flex items-center gap-1.5 rounded-lg transition-colors',
          compact ? 'px-2 py-1' : 'px-2.5 py-1.5',
          isActive && cn(tokens.bgSubtle, 'border', tokens.border),
          !isActive && 'border border-transparent',
          onTagClick && 'cursor-pointer hover:bg-white/[0.04]',
        )

        if (onTagClick) {
          return (
            <button key={tag} type="button" onClick={() => onTagClick(tag)} className={classes}>
              {content}
            </button>
          )
        }

        return (
          <span key={tag} className={classes}>
            {content}
          </span>
        )
      })}
    </div>
  )
}

export function tagHexColor(tag: FieldNoteTag | null | undefined): string {
  return tagTokens(tag).hex
}

export { TAG_TO_COLOR, TAG_LABEL }
