'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const DOSAGE_UNITS = [
    { value: 'L/ha', label: 'L/ha' },
    { value: 'kg/ha', label: 'kg/ha' },
    { value: 'ml/ha', label: 'ml/ha' },
    { value: 'g/ha', label: 'g/ha' },
];

interface DosageInputProps {
    dosage: number;
    unit: string;
    onDosageChange: (dosage: number) => void;
    onUnitChange: (unit: string) => void;
    disabled?: boolean;
    error?: string;
    className?: string;
}

export function DosageInput({
    dosage,
    unit,
    onDosageChange,
    onUnitChange,
    disabled = false,
    error,
    className,
}: DosageInputProps) {
    const handleDosageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseFloat(e.target.value);
        onDosageChange(isNaN(value) ? 0 : value);
    };

    return (
        <div className={cn('flex gap-2', className)}>
            <div className="flex-1">
                <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={dosage || ''}
                    onChange={handleDosageChange}
                    disabled={disabled}
                    placeholder="0.00"
                    className={cn(
                        'text-right',
                        error && 'border-destructive focus-visible:ring-destructive'
                    )}
                />
            </div>
            <Select
                value={unit}
                onValueChange={onUnitChange}
                disabled={disabled}
            >
                <SelectTrigger className="w-[100px]">
                    <SelectValue placeholder="Eenheid" />
                </SelectTrigger>
                <SelectContent>
                    {DOSAGE_UNITS.map((u) => (
                        <SelectItem key={u.value} value={u.value}>
                            {u.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}
