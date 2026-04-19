'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { tagTokens, tagColor, type FieldNoteTag } from '@/lib/veldnotities/tag-colors'
import { SpotlightCard } from '@/components/urenregistratie/primitives/SpotlightCard'
import type { TaskColor } from '@/lib/urenregistratie/task-colors'

interface NoteCardShellProps {
  tag: FieldNoteTag | null
  dimmed?: boolean
  forceColor?: TaskColor
  compact?: boolean
  showOrb?: boolean
  className?: string
  children: React.ReactNode
}

export function NoteCardShell({
  tag,
  dimmed = false,
  forceColor,
  compact = false,
  showOrb = false,
  className,
  children,
}: NoteCardShellProps) {
  const tokens = tagTokens(tag)
  const color: TaskColor = forceColor ?? tagColor(tag)

  return (
    <div className={cn('relative', dimmed && 'opacity-60', className)}>
      <SpotlightCard
        variant={compact ? 'task' : 'section'}
        color={color}
        showOrb={showOrb}
        showGradientBorder={false}
        noPadding
        className={cn('border-white/[0.04]', 'bg-white/[0.015]')}
      >
        <div className="flex">
          <div
            className={cn('w-[4px] flex-shrink-0 self-stretch', tokens.bgSolid, 'opacity-60')}
            aria-hidden
          />
          <div className="flex-1 min-w-0">{children}</div>
        </div>
      </SpotlightCard>
    </div>
  )
}
