'use client'

import { motion } from 'framer-motion'
import { Play, Plus, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TaskType } from '@/lib/types'

interface QuickStartChipsProps {
    taskTypes: TaskType[]
    onStartTimer: (taskTypeId: string) => void
    onManageTypes: () => void
    disabled?: boolean
}

export function QuickStartChips({ taskTypes, onStartTimer, onManageTypes, disabled }: QuickStartChipsProps) {
    if (taskTypes.length === 0) return null

    return (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar px-1">
            {taskTypes.map((type, i) => (
                <motion.button
                    key={type.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.3 }}
                    onClick={() => onStartTimer(type.id)}
                    disabled={disabled}
                    className={cn(
                        "flex items-center gap-1.5 px-3 py-2 rounded-full",
                        "bg-orange-500/10 border border-orange-500/20",
                        "text-[12px] font-semibold text-orange-300 transition-all whitespace-nowrap",
                        "hover:bg-orange-500/20 hover:border-orange-500/30 hover:text-orange-200 hover:shadow-lg",
                        "active:scale-95",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                        "min-h-[44px]"
                    )}
                >
                    <Play className="h-3 w-3" />
                    {type.name}
                </motion.button>
            ))}
            <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: taskTypes.length * 0.04, duration: 0.3 }}
                onClick={onManageTypes}
                disabled={disabled}
                className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-full",
                    "bg-white/[0.03] border border-white/[0.06]",
                    "text-[12px] font-medium text-white/40 transition-all whitespace-nowrap",
                    "hover:bg-emerald-500/10 hover:border-emerald-500/20 hover:text-emerald-400",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    "min-h-[44px]"
                )}
            >
                <Settings className="h-3 w-3 opacity-60" />
                Beheer
            </motion.button>
        </div>
    )
}
