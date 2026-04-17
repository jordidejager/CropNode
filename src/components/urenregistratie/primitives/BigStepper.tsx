'use client'

import * as React from 'react'
import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BigStepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  /** Stap-grootte (default 1). Gebruik 0.5 voor half-uur etc. */
  step?: number
  /** Label boven de stepper */
  label?: string
  /** Unit-suffix bij de waarde, e.g. "uur" of "pers." */
  suffix?: string
  /** Aantal decimalen in weergave (default 0 voor integers, 1 voor step=0.5) */
  decimals?: number
  /** Compact modus — 48×48 knoppen i.p.v. 64×64 */
  compact?: boolean
  disabled?: boolean
  className?: string
  /** Aria-label indien er geen `label` prop is */
  'aria-label'?: string
}

/**
 * Grote +/− stepper voor number-input zonder native spinner.
 *
 * - Hoofdknoppen standaard 64×64px (voor duim-bereikbaarheid op mobiel en
 *   oudere gebruikers).
 * - Waarde is zelf een clickable input die in-line getypt kan worden.
 * - Long-press op + of − versnelt (na 400ms → 100ms interval).
 *
 * Vervangt `<input type="number">` voor peopleCount, hoursPerPerson, etc.
 */
export function BigStepper({
  value,
  onChange,
  min = 0,
  max = Infinity,
  step = 1,
  label,
  suffix,
  decimals,
  compact = false,
  disabled = false,
  className,
  'aria-label': ariaLabel,
}: BigStepperProps) {
  const effectiveDecimals = decimals ?? (step < 1 ? 1 : 0)
  const longPressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const intervalTimer = React.useRef<ReturnType<typeof setInterval> | null>(null)

  const clamp = React.useCallback(
    (v: number) => {
      // Avoid floating-point drift (e.g. 0.5 + 0.1 = 0.6 but after many steps gets ugly)
      const rounded = Math.round(v / step) * step
      return Math.min(max, Math.max(min, Number(rounded.toFixed(effectiveDecimals + 2))))
    },
    [min, max, step, effectiveDecimals],
  )

  const increment = React.useCallback(() => {
    onChange(clamp(value + step))
  }, [clamp, value, step, onChange])

  const decrement = React.useCallback(() => {
    onChange(clamp(value - step))
  }, [clamp, value, step, onChange])

  /** Long-press: houdt de knop ingedrukt voor auto-repeat. */
  const startHold = (fn: () => void) => {
    fn() // Direct 1 stap bij klik
    longPressTimer.current = setTimeout(() => {
      intervalTimer.current = setInterval(fn, 100)
    }, 400)
  }
  const stopHold = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    if (intervalTimer.current) clearInterval(intervalTimer.current)
    longPressTimer.current = null
    intervalTimer.current = null
  }

  React.useEffect(() => stopHold, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = parseFloat(e.target.value.replace(',', '.'))
    if (Number.isFinite(parsed)) {
      onChange(clamp(parsed))
    } else if (e.target.value === '') {
      onChange(clamp(min))
    }
  }

  const btnSize = compact ? 'h-12 w-12' : 'h-16 w-16'
  const textSize = compact ? 'text-2xl' : 'text-4xl'
  const canDecrement = !disabled && value > min
  const canIncrement = !disabled && value < max

  const displayValue = value.toFixed(effectiveDecimals).replace('.', ',')

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {label && (
        <label className="text-sm font-semibold text-white/80">
          {label}
        </label>
      )}
      <div
        className={cn(
          'flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-2',
          disabled && 'opacity-50',
        )}
        aria-label={ariaLabel || label}
      >
        <button
          type="button"
          onPointerDown={() => canDecrement && startHold(decrement)}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
          disabled={!canDecrement}
          className={cn(
            'flex items-center justify-center rounded-xl transition-all',
            'bg-white/[0.04] text-white/70 border border-white/[0.06]',
            'hover:bg-white/[0.08] hover:text-white hover:border-white/[0.12]',
            'active:scale-95',
            'disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white/[0.04] disabled:active:scale-100',
            btnSize,
          )}
          aria-label="Verlaag"
        >
          <Minus className={compact ? 'h-5 w-5' : 'h-7 w-7'} strokeWidth={2.5} />
        </button>

        <div className="flex-1 flex flex-col items-center justify-center min-w-[5rem]">
          <input
            type="text"
            inputMode="decimal"
            value={displayValue}
            onChange={handleInputChange}
            disabled={disabled}
            className={cn(
              'w-full bg-transparent text-center font-bold text-white tabular-nums outline-none',
              'focus:outline-none',
              textSize,
            )}
            aria-label={label || ariaLabel}
          />
          {suffix && (
            <span className={cn('text-white/40 font-medium -mt-1', compact ? 'text-xs' : 'text-sm')}>
              {suffix}
            </span>
          )}
        </div>

        <button
          type="button"
          onPointerDown={() => canIncrement && startHold(increment)}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
          disabled={!canIncrement}
          className={cn(
            'flex items-center justify-center rounded-xl transition-all',
            'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25',
            'hover:bg-emerald-500/25 hover:text-emerald-200 hover:border-emerald-400/40',
            'active:scale-95',
            'disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-emerald-500/15 disabled:active:scale-100',
            btnSize,
          )}
          aria-label="Verhoog"
        >
          <Plus className={compact ? 'h-5 w-5' : 'h-7 w-7'} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  )
}
