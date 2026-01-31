'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tractor, FlaskConical, Timer, Microscope } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================
// Types
// ============================================

export type InputMode = 'registration' | 'product_info' | 'workforce' | 'research';

export interface ModeConfig {
    key: InputMode;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    placeholder: string;
    color: string;
    activeClass: string;
    hoverClass: string;
}

export const MODE_CONFIGS: ModeConfig[] = [
    {
        key: 'registration',
        icon: Tractor,
        label: 'Registratie',
        placeholder: 'Wat heb je gespoten? (bijv. 1.5kg Captan op Elstar)',
        color: 'emerald',
        activeClass: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400',
        hoverClass: 'hover:bg-emerald-500/10 hover:border-emerald-500/30',
    },
    {
        key: 'product_info',
        icon: FlaskConical,
        label: 'Product Check',
        placeholder: 'Zoek middel of check toelating (bijv. Mag Batavier op peer?)',
        color: 'blue',
        activeClass: 'bg-blue-500/20 border-blue-500/50 text-blue-400',
        hoverClass: 'hover:bg-blue-500/10 hover:border-blue-500/30',
    },
    {
        key: 'workforce',
        icon: Timer,
        label: 'Urenregistratie',
        placeholder: "'Start snoeien' of 'Gisteren 8u geplukt met 4 man'",
        color: 'amber',
        activeClass: 'bg-amber-500/20 border-amber-500/50 text-amber-400',
        hoverClass: 'hover:bg-amber-500/10 hover:border-amber-500/30',
    },
    {
        key: 'research',
        icon: Microscope,
        label: 'Research Hub',
        placeholder: 'Vraag over ziekten, plagen of onderzoek...',
        color: 'purple',
        activeClass: 'bg-purple-500/20 border-purple-500/50 text-purple-400',
        hoverClass: 'hover:bg-purple-500/10 hover:border-purple-500/30',
    },
];

// ============================================
// Helper
// ============================================

export function getModeConfig(mode: InputMode): ModeConfig {
    return MODE_CONFIGS.find(m => m.key === mode) || MODE_CONFIGS[0];
}

// ============================================
// ModeSelector Component
// ============================================

interface ModeSelectorProps {
    activeMode: InputMode;
    onModeChange: (mode: InputMode) => void;
    disabled?: boolean;
}

export function ModeSelector({ activeMode, onModeChange, disabled = false }: ModeSelectorProps) {
    return (
        <div className="flex items-center justify-center gap-1 p-1 rounded-2xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-sm">
            {MODE_CONFIGS.map((config) => {
                const isActive = activeMode === config.key;
                const Icon = config.icon;

                return (
                    <motion.button
                        key={config.key}
                        onClick={() => !disabled && onModeChange(config.key)}
                        disabled={disabled}
                        className={cn(
                            "relative flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors duration-200",
                            "disabled:opacity-50 disabled:cursor-not-allowed",
                            isActive
                                ? config.activeClass
                                : `bg-transparent border-transparent text-white/40 ${config.hoverClass}`
                        )}
                        layout
                        transition={{
                            layout: { type: 'spring', stiffness: 500, damping: 30 },
                        }}
                    >
                        <Icon className="h-4 w-4 flex-shrink-0" />

                        <AnimatePresence mode="wait">
                            {isActive && (
                                <motion.span
                                    key={`label-${config.key}`}
                                    initial={{ opacity: 0, width: 0 }}
                                    animate={{ opacity: 1, width: 'auto' }}
                                    exit={{ opacity: 0, width: 0 }}
                                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                                    className="text-sm font-medium whitespace-nowrap overflow-hidden"
                                >
                                    {config.label}
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </motion.button>
                );
            })}
        </div>
    );
}

// ============================================
// Compact Mode Indicator (for use in header/elsewhere)
// ============================================

interface ModeIndicatorProps {
    mode: InputMode;
    className?: string;
}

export function ModeIndicator({ mode, className }: ModeIndicatorProps) {
    const config = getModeConfig(mode);
    const Icon = config.icon;

    return (
        <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium",
            config.activeClass,
            className
        )}>
            <Icon className="h-3.5 w-3.5" />
            <span>{config.label}</span>
        </div>
    );
}
