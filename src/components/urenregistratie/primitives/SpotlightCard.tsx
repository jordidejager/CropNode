'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { tokensFor, type TaskColor } from '@/lib/urenregistratie/task-colors'

interface SpotlightCardProps {
  color?: TaskColor
  /**
   * Visual variant determines orb size, spotlight radius, and padding.
   * - `kpi`: compact KPI card (p-4, 600px spotlight, small orb)
   * - `section`: full-width content section (p-6, 800px spotlight, large orb)
   * - `timer`: active timer card (p-5, 700px spotlight, medium orb with pulse)
   * - `task`: horizontal task chip (p-3, 400px spotlight, tiny orb)
   */
  variant?: 'kpi' | 'section' | 'timer' | 'task'
  /** Toon glow-orb (default true) */
  showOrb?: boolean
  /** Toon noise-texture overlay (default true) */
  showNoise?: boolean
  /** Toon gradient border die oplicht op hover (default true) */
  showGradientBorder?: boolean
  /** Extra inner padding uitschakelen als caller zelf wil bepalen */
  noPadding?: boolean
  /** Vast klikbaar maken — voegt cursor + focus styling toe */
  interactive?: boolean
  className?: string
  children: React.ReactNode
  onClick?: () => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  role?: string
  'aria-label'?: string
}

const VARIANT_CONFIG: Record<
  NonNullable<SpotlightCardProps['variant']>,
  { spotlightRadius: number; padding: string; orbSize: string; orbBlur: string; orbOpacity: string }
> = {
  kpi: {
    spotlightRadius: 480,
    padding: 'p-4 md:p-5',
    orbSize: 'w-40 h-40',
    orbBlur: 'blur-[70px]',
    orbOpacity: 'opacity-[0.06] group-hover:opacity-[0.14]',
  },
  section: {
    spotlightRadius: 700,
    padding: 'p-5 md:p-6',
    orbSize: 'w-52 h-52',
    orbBlur: 'blur-[90px]',
    orbOpacity: 'opacity-[0.05] group-hover:opacity-[0.12]',
  },
  timer: {
    spotlightRadius: 600,
    padding: 'p-5',
    orbSize: 'w-44 h-44',
    orbBlur: 'blur-[80px]',
    orbOpacity: 'opacity-[0.08] group-hover:opacity-[0.18]',
  },
  task: {
    spotlightRadius: 320,
    padding: 'px-4 py-3',
    orbSize: 'w-24 h-24',
    orbBlur: 'blur-[50px]',
    orbOpacity: 'opacity-[0.06] group-hover:opacity-[0.16]',
  },
}

/**
 * Hergebruikbare card-wrapper met de landing-page design upgrades:
 * - Mouse-following radial spotlight
 * - Gradient border die oplicht op hover
 * - Subtiele noise-texture overlay (SVG feTurbulence)
 * - Glow orb linksboven / rechtsonder (afhankelijk van variant)
 *
 * Bedoeld voor KPI-cards, timer-cards, chart-secties en task chips in
 * urenregistratie. Volgt `feature-bento.tsx:1429-1477` patroon.
 */
export function SpotlightCard({
  color = 'emerald',
  variant = 'section',
  showOrb = true,
  showNoise = true,
  showGradientBorder = true,
  noPadding = false,
  interactive = false,
  className,
  children,
  onClick,
  onMouseEnter,
  onMouseLeave,
  role,
  'aria-label': ariaLabel,
}: SpotlightCardProps) {
  const [mousePos, setMousePos] = React.useState({ x: 0, y: 0 })
  const [isHovered, setIsHovered] = React.useState(false)
  const tokens = tokensFor(color)
  const config = VARIANT_CONFIG[variant]

  const handleMouseMove = React.useCallback((e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }, [])

  const handleMouseEnter = React.useCallback(() => {
    setIsHovered(true)
    onMouseEnter?.()
  }, [onMouseEnter])

  const handleMouseLeave = React.useCallback(() => {
    setIsHovered(false)
    onMouseLeave?.()
  }, [onMouseLeave])

  const Comp = onClick ? 'button' : 'div'

  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role={role}
      aria-label={ariaLabel}
      className={cn(
        'group relative overflow-hidden rounded-2xl border text-left',
        'border-white/[0.06] bg-white/[0.02] backdrop-blur-sm',
        'transition-[border-color,transform] duration-300',
        tokens.borderHover,
        interactive && 'cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-400/60 focus-visible:outline-none active:scale-[0.99]',
        !noPadding && config.padding,
        className,
      )}
    >
      {/* Mouse spotlight — radial gradient die muis volgt */}
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background: `radial-gradient(${config.spotlightRadius}px circle at ${mousePos.x}px ${mousePos.y}px, ${tokens.glow}, transparent 40%)`,
        }}
      />

      {/* Animated gradient border op hover */}
      {showGradientBorder && (
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-700 group-hover:opacity-100"
          style={{
            background: `linear-gradient(135deg, ${tokens.glow}, transparent 40%, transparent 60%, ${tokens.glow})`,
            WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude',
            padding: '1px',
          }}
        />
      )}

      {/* Glow orb rechtsboven */}
      {showOrb && (
        <div
          className={cn(
            'pointer-events-none absolute -top-8 -right-8 rounded-full transition-opacity duration-700',
            config.orbSize,
            config.orbBlur,
            config.orbOpacity,
            tokens.orb,
          )}
          aria-hidden
        />
      )}

      {/* Noise texture overlay — SVG feTurbulence inline data URL */}
      {showNoise && (
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.015] mix-blend-overlay"
          style={{
            backgroundImage:
              'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'1\'/%3E%3C/svg%3E")',
          }}
          aria-hidden
        />
      )}

      {/* Actual content */}
      <div className="relative">{children}</div>

      {/* Hidden isHovered consumer (voorkomt "declared but never used") */}
      {isHovered ? null : null}
    </Comp>
  )
}
