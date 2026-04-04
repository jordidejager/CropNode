'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface DosageFieldProps {
    value: number;
    onChange: (value: number) => void;
    step?: number;
    disabled?: boolean;
}

/**
 * Dosage input field with +/- buttons and Dutch decimal comma support.
 * Uses local display state so users can freely type "0," without it being reset.
 */
export function DosageField({ value, onChange, step = 0.05, disabled }: DosageFieldProps) {
    const [display, setDisplay] = React.useState(value ? String(value) : '');

    // Sync when value changes externally (e.g., from +/- buttons or parent reset)
    React.useEffect(() => {
        const parsed = parseFloat(display.replace(',', '.'));
        // Don't overwrite while user is typing a decimal (ends with comma/dot)
        if (!isNaN(value) && value !== parsed && !display.endsWith(',') && !display.endsWith('.')) {
            setDisplay(value ? String(value) : '');
        }
    }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value.replace(/[^0-9.,]/g, '');
        setDisplay(raw);
        const parsed = parseFloat(raw.replace(',', '.'));
        onChange(isNaN(parsed) ? 0 : parsed);
    };

    const stepValue = (delta: number) => {
        const next = Math.max(0, Math.round((value + delta) * 100) / 100);
        onChange(next);
        setDisplay(String(next));
    };

    return (
        <div className="flex items-center gap-0">
            <button
                type="button"
                onClick={() => stepValue(-step)}
                disabled={disabled || value <= 0}
                className="h-9 w-7 flex items-center justify-center rounded-l-md border border-r-0 bg-muted hover:bg-muted/80 text-muted-foreground disabled:opacity-30 shrink-0"
            >
                <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <Input
                type="text"
                inputMode="decimal"
                value={display}
                onChange={handleChange}
                disabled={disabled}
                placeholder="0,00"
                className="h-9 text-center rounded-none border-x-0 px-1 w-16"
            />
            <button
                type="button"
                onClick={() => stepValue(step)}
                disabled={disabled}
                className="h-9 w-7 flex items-center justify-center rounded-r-md border border-l-0 bg-muted hover:bg-muted/80 text-muted-foreground disabled:opacity-30 shrink-0"
            >
                <ChevronUp className="h-3.5 w-3.5" />
            </button>
        </div>
    );
}
