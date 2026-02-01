'use client';

import * as React from 'react';
import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence, useDragControls, PanInfo } from 'framer-motion';
import { ClipboardList, ChevronUp, MapPin, Package, Calendar, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface RegistrationBottomSheetProps {
    isVisible: boolean;
    children: React.ReactNode;
    summary?: {
        registrationCount: number;
        totalHa: number;
        productCount: number;
        date?: string;
        status?: 'Akkoord' | 'Waarschuwing' | 'Fout';
    };
    onConfirm?: () => void;
    onCancel?: () => void;
}

const MINIMIZED_HEIGHT = 80;
const EXPANDED_HEIGHT_PERCENT = 0.75; // 75% of viewport

export function RegistrationBottomSheet({
    isVisible,
    children,
    summary,
    onConfirm,
    onCancel,
}: RegistrationBottomSheetProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [viewportHeight, setViewportHeight] = useState(0);
    const dragControls = useDragControls();

    // Get viewport height on mount and resize
    useEffect(() => {
        const updateHeight = () => setViewportHeight(window.innerHeight);
        updateHeight();
        window.addEventListener('resize', updateHeight);
        return () => window.removeEventListener('resize', updateHeight);
    }, []);

    const expandedHeight = viewportHeight * EXPANDED_HEIGHT_PERCENT;

    // Handle drag end to determine if should expand or collapse
    const handleDragEnd = useCallback((event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
        const threshold = 50; // px threshold for switching states
        const velocity = info.velocity.y;
        const offset = info.offset.y;

        if (isExpanded) {
            // If expanded and dragged down significantly or with velocity
            if (offset > threshold || velocity > 500) {
                setIsExpanded(false);
            }
        } else {
            // If minimized and dragged up significantly or with velocity
            if (offset < -threshold || velocity < -500) {
                setIsExpanded(true);
            }
        }
    }, [isExpanded]);

    // Toggle on header tap
    const handleToggle = useCallback(() => {
        setIsExpanded(prev => !prev);
    }, []);

    // Don't render if not visible
    if (!isVisible) return null;

    return (
        <>
            {/* Overlay when expanded */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="md:hidden fixed inset-0 bg-black/50 z-40"
                        onClick={() => setIsExpanded(false)}
                    />
                )}
            </AnimatePresence>

            {/* Bottom Sheet */}
            <motion.div
                className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0A0A0A] border-t border-white/10 rounded-t-2xl shadow-2xl"
                initial={{ y: '100%' }}
                animate={{
                    y: 0,
                    height: isExpanded ? expandedHeight : MINIMIZED_HEIGHT,
                }}
                exit={{ y: '100%' }}
                transition={{
                    type: 'spring',
                    damping: 30,
                    stiffness: 300,
                }}
                drag="y"
                dragControls={dragControls}
                dragConstraints={{
                    top: 0,
                    bottom: 0,
                }}
                dragElastic={0.2}
                onDragEnd={handleDragEnd}
            >
                {/* Drag Handle */}
                <div
                    className="flex justify-center py-3 cursor-grab active:cursor-grabbing"
                    onClick={handleToggle}
                    onPointerDown={(e) => dragControls.start(e)}
                >
                    <div className="w-10 h-1 rounded-full bg-white/20" />
                </div>

                {/* Minimized Header */}
                <div
                    className={cn(
                        "px-4 pb-3 flex items-center justify-between",
                        isExpanded && "border-b border-white/10"
                    )}
                    onClick={handleToggle}
                >
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                            <ClipboardList className="h-4 w-4 text-emerald-400" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-white">Actieve Registratie</span>
                                {summary?.status && (
                                    <Badge
                                        className={cn(
                                            "text-[9px] px-1.5 py-0",
                                            summary.status === 'Akkoord'
                                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                                : summary.status === 'Waarschuwing'
                                                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                                                    : 'bg-red-500/20 text-red-400 border-red-500/30'
                                        )}
                                    >
                                        {summary.status}
                                    </Badge>
                                )}
                            </div>
                            {summary && (
                                <div className="flex items-center gap-3 text-xs text-white/50 mt-0.5">
                                    {summary.registrationCount > 0 && (
                                        <span className="flex items-center gap-1">
                                            <MapPin className="h-3 w-3" />
                                            {summary.registrationCount} {summary.registrationCount === 1 ? 'perceel' : 'percelen'}
                                        </span>
                                    )}
                                    {summary.totalHa > 0 && (
                                        <span>{summary.totalHa.toFixed(2)} ha</span>
                                    )}
                                    {summary.productCount > 0 && (
                                        <span className="flex items-center gap-1">
                                            <Package className="h-3 w-3" />
                                            {summary.productCount} {summary.productCount === 1 ? 'middel' : 'middelen'}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Quick Actions when minimized */}
                    {!isExpanded && (
                        <div className="flex items-center gap-2">
                            {onCancel && (
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 rounded-lg bg-white/5 hover:bg-red-500/10 text-white/60 hover:text-red-400"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onCancel();
                                    }}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            )}
                            {onConfirm && (
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onConfirm();
                                    }}
                                >
                                    <Check className="h-4 w-4" />
                                </Button>
                            )}
                            <ChevronUp className={cn(
                                "h-5 w-5 text-white/40 transition-transform",
                                isExpanded && "rotate-180"
                            )} />
                        </div>
                    )}

                    {isExpanded && (
                        <ChevronUp className="h-5 w-5 text-white/40 rotate-180" />
                    )}
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.1 }}
                        className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar"
                        style={{ height: expandedHeight - 80 }}
                    >
                        <div className="max-w-full overflow-hidden">
                            {children}
                        </div>
                    </motion.div>
                )}
            </motion.div>

            {/* Spacer to prevent content from being hidden behind minimized sheet */}
            <div className="md:hidden" style={{ height: MINIMIZED_HEIGHT + 16 }} />
        </>
    );
}
