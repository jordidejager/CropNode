'use client';

import * as React from 'react';
import { useState } from 'react';
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
    // Use a string for the input value so the user can type "0," or "0." freely
    const [displayValue, setDisplayValue] = useState(dosage ? String(dosage) : '');

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let raw = e.target.value;

        // Allow only digits, dots, and commas
        raw = raw.replace(/[^0-9.,]/g, '');

        setDisplayValue(raw);

        // Convert comma to dot for parsing
        const normalized = raw.replace(',', '.');
        const parsed = parseFloat(normalized);
        onDosageChange(isNaN(parsed) ? 0 : parsed);
    };

    // Sync display value when dosage changes externally (e.g., reset form)
    React.useEffect(() => {
        const currentParsed = parseFloat(displayValue.replace(',', '.'));
        if (dosage === 0 && displayValue !== '' && currentParsed !== 0) {
            setDisplayValue('');
        } else if (dosage > 0 && isNaN(currentParsed)) {
            setDisplayValue(String(dosage));
        }
    }, [dosage, displayValue]);

    return (
        <div className={cn('flex gap-2', className)}>
            <div className="flex-1">
                <Input
                    type="text"
                    inputMode="decimal"
                    value={displayValue}
                    onChange={handleChange}
                    disabled={disabled}
                    placeholder="0,00"
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
