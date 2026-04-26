'use client'

/**
 * ParcelSelector — thin adapter rond UnifiedParcelMultiSelect (single-mode).
 *
 * Behoudt de bestaande API: `value: ParcelSelection` discriminated union
 * (`{kind:'none'|'sub'|'whole', ...}`) zodat RegistrationForm en
 * QuickStartSheet niet hoeven te wijzigen. De adapter:
 * - Converteert `value` → `string[]` voor de UnifiedParcelMultiSelect
 * - Converteert `string[]` terug:
 *     • [] → kind:'none'
 *     • [subId] → kind:'sub'
 *     • alle subs van een groep → kind:'whole'
 *     • gemengd over groepen → eerste-wint, valt terug op kind:'sub'
 *
 * task_logs.parcel_id XOR sub_parcel_id (CHECK constraint) blijft intact.
 */

import * as React from 'react'
import type { ParcelGroupOption, ParcelSelection } from '@/lib/types'
import { UnifiedParcelMultiSelect } from '@/components/domain/unified-parcel-multi-select'

interface ParcelSelectorProps {
    parcelGroups: ParcelGroupOption[]
    value: ParcelSelection
    onChange: (selection: ParcelSelection) => void
    placeholder?: string
    disabled?: boolean
    className?: string
}

export function ParcelSelector({
    parcelGroups,
    value,
    onChange,
    placeholder = 'Selecteer perceel...',
    disabled = false,
    className,
}: ParcelSelectorProps) {
    // Convert ParcelSelection → string[] voor de UnifiedParcelMultiSelect
    const selectedSubParcelIds = React.useMemo(() => {
        if (value.kind === 'sub') return [value.subParcelId]
        if (value.kind === 'whole') {
            const g = parcelGroups.find(g => g.parcelId === value.parcelId)
            return g ? g.subParcels.map(s => s.id) : []
        }
        return []
    }, [value, parcelGroups])

    const handleChange = React.useCallback((ids: string[]) => {
        if (ids.length === 0) {
            onChange({ kind: 'none' })
            return
        }
        // Vind de groep die de geselecteerde ids bevat
        const idSet = new Set(ids)
        let owningGroup: ParcelGroupOption | null = null
        for (const g of parcelGroups) {
            if (g.subParcels.some(s => idSet.has(s.id))) {
                owningGroup = g
                break
            }
        }
        if (!owningGroup) {
            onChange({ kind: 'none' })
            return
        }

        const allInGroup = owningGroup.subParcels.every(s => idSet.has(s.id))
        if (allInGroup && owningGroup.subParcels.length > 1) {
            // "heel perceel" — alle subs geselecteerd
            onChange({
                kind: 'whole',
                parcelId: owningGroup.parcelId,
                label: owningGroup.parcelName,
            })
        } else {
            // Single sub
            const sub = owningGroup.subParcels.find(s => idSet.has(s.id))
            if (!sub) return onChange({ kind: 'none' })
            onChange({
                kind: 'sub',
                subParcelId: sub.id,
                parcelId: owningGroup.parcelId,
                label: sub.shortLabel || sub.name,
            })
        }
    }, [parcelGroups, onChange])

    return (
        <UnifiedParcelMultiSelect
            groups={parcelGroups}
            selectedSubParcelIds={selectedSubParcelIds}
            onChange={handleChange}
            mode="single"
            placeholder={placeholder}
            disabled={disabled}
            className={className}
        />
    )
}
