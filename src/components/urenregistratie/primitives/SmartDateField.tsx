'use client'

import * as React from 'react'
import { Calendar, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SmartDateFieldProps {
  /** ISO date string `YYYY-MM-DD` */
  value: string
  onChange: (value: string) => void
  label?: string
  /** Toon ook "Morgen" / "Overmorgen" pills (voor taken met deadlines) */
  allowFuture?: boolean
  /** Toon pill "Eergisteren" — default true */
  showDayBeforeYesterday?: boolean
  disabled?: boolean
  className?: string
}

function toIso(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatLong(isoDate: string): string {
  if (!isoDate) return ''
  const d = new Date(isoDate + 'T00:00:00')
  return d.toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

/**
 * Date picker geschikt voor urenregistratie:
 * - Grote pill-knoppen voor meest-gebruikte keuzes (Vandaag, Gisteren, Eergisteren).
 * - "Kies datum…" opent native date picker als fallback voor andere datums.
 * - Groot leesbaar label onder de pills zodat de gebruiker zeker weet welke
 *   datum is geselecteerd (bijv. "Maandag 7 april").
 */
export function SmartDateField({
  value,
  onChange,
  label,
  allowFuture = false,
  showDayBeforeYesterday = true,
  disabled = false,
  className,
}: SmartDateFieldProps) {
  const today = React.useMemo(() => toIso(new Date()), [])
  const yesterday = React.useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return toIso(d)
  }, [])
  const dayBeforeYesterday = React.useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 2)
    return toIso(d)
  }, [])
  const tomorrow = React.useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return toIso(d)
  }, [])
  const dayAfterTomorrow = React.useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + 2)
    return toIso(d)
  }, [])

  const nativeInputRef = React.useRef<HTMLInputElement>(null)

  const pills: Array<{ iso: string; label: string }> = []
  if (allowFuture) {
    pills.push({ iso: dayAfterTomorrow, label: 'Overmorgen' })
    pills.push({ iso: tomorrow, label: 'Morgen' })
  }
  pills.push({ iso: today, label: 'Vandaag' })
  pills.push({ iso: yesterday, label: 'Gisteren' })
  if (showDayBeforeYesterday) pills.push({ iso: dayBeforeYesterday, label: 'Eergisteren' })

  const isCustomDate = !pills.some(p => p.iso === value)

  const openNativePicker = () => {
    const el = nativeInputRef.current
    if (!el) return
    if ('showPicker' in el && typeof el.showPicker === 'function') {
      try {
        el.showPicker()
        return
      } catch {
        // fall through to .click()
      }
    }
    el.click()
    el.focus()
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {label && <label className="text-sm font-semibold text-white/80">{label}</label>}

      <div className="flex flex-wrap gap-2">
        {pills.map(p => {
          const active = value === p.iso
          return (
            <button
              key={p.iso}
              type="button"
              onClick={() => onChange(p.iso)}
              disabled={disabled}
              className={cn(
                'inline-flex items-center gap-2 px-4 min-h-[48px] rounded-full border transition-all font-semibold text-sm',
                active
                  ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                  : 'bg-white/[0.03] border-white/[0.08] text-white/60 hover:bg-white/[0.06] hover:text-white/80',
                disabled && 'opacity-50 cursor-not-allowed',
              )}
              aria-pressed={active}
            >
              {active && <Check className="h-4 w-4" strokeWidth={3} />}
              {p.label}
            </button>
          )
        })}

        <button
          type="button"
          onClick={openNativePicker}
          disabled={disabled}
          className={cn(
            'inline-flex items-center gap-2 px-4 min-h-[48px] rounded-full border transition-all font-semibold text-sm',
            isCustomDate
              ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
              : 'bg-white/[0.03] border-white/[0.08] text-white/60 hover:bg-white/[0.06] hover:text-white/80',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
          aria-label="Kies een andere datum"
        >
          <Calendar className="h-4 w-4" />
          {isCustomDate ? formatLong(value) : 'Andere datum…'}
        </button>

        {/* Hidden native input — gebruikt showPicker() waar beschikbaar */}
        <input
          ref={nativeInputRef}
          type="date"
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          className="sr-only"
          aria-hidden
          tabIndex={-1}
        />
      </div>

      {/* Vriendelijke grote datum-weergave */}
      {value && (
        <p className="text-base text-white/70 font-medium">
          {formatLong(value)}
        </p>
      )}
    </div>
  )
}
