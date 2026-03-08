'use client';

import * as React from 'react';
import { Send, Sparkles, Zap, Clock, RotateCcw, Timer, FlaskConical, Microscope, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ModeSelector, getModeConfig, type InputMode } from '@/components/mode-selector';

interface CommandBarProps {
    onSend: (text: string, mode: InputMode) => void;
    isProcessing: boolean;
    value?: string;
    onValueChange?: (value: string) => void;
    placeholder?: string;
    activeMode?: InputMode;
    onModeChange?: (mode: InputMode) => void;
}

// Quick actions per mode
const QUICK_ACTIONS_BY_MODE: Record<InputMode, Array<{ label: string; icon: React.ComponentType<{ className?: string }> }>> = {
    registration: [
        { label: "Vandaag gespoten", icon: Clock },
        { label: "Gisteren alles afgespoten", icon: RotateCcw },
        { label: "Zelfde als vorige keer", icon: Zap },
        { label: "1,5 kg captan op alle percelen", icon: Sparkles },
    ],
    product_info: [
        { label: "Mag Batavier op peer?", icon: FlaskConical },
        { label: "Wat is de wachttijd van Captan?", icon: Clock },
        { label: "Toon alternatieven voor Decis", icon: Sparkles },
    ],
    workforce: [
        { label: "Start snoeien", icon: Timer },
        { label: "Stop timer", icon: Clock },
        { label: "Gisteren 8u geplukt met 4 man", icon: RotateCcw },
    ],
    research: [
        { label: "Wat is fruitmot?", icon: Microscope },
        { label: "Hoe herken ik schurft?", icon: Sparkles },
        { label: "Biologische bestrijding perenbladvlo", icon: Zap },
    ],
};

export function CommandBar({
    onSend,
    isProcessing,
    value,
    onValueChange,
    placeholder,
    activeMode = 'registration',
    onModeChange,
}: CommandBarProps) {
    const [localInput, setLocalInput] = React.useState('');
    const [localMode, setLocalMode] = React.useState<InputMode>('registration');

    const input = value !== undefined ? value : localInput;
    const setInput = onValueChange || setLocalInput;

    const currentMode = onModeChange ? activeMode : localMode;
    const setMode = onModeChange || setLocalMode;

    const [isFocused, setIsFocused] = React.useState(false);
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);

    const modeConfig = getModeConfig(currentMode);
    const quickActions = QUICK_ACTIONS_BY_MODE[currentMode];
    const currentPlaceholder = placeholder || modeConfig.placeholder;

    // Auto-adjust height when input changes externally
    React.useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [value]);

    const handleSend = () => {
        if (input.trim() && !isProcessing) {
            onSend(input, currentMode);
            setInput('');
            if (textareaRef.current) {
                textareaRef.current.style.height = 'auto';
            }
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleQuickAction = (label: string) => {
        setInput(label);
        textareaRef.current?.focus();
    };

    // Get border color based on mode
    const getBorderStyle = () => {
        if (!isFocused) return 'border-white/10';
        switch (currentMode) {
            case 'registration': return 'border-emerald-500/50';
            case 'product_info': return 'border-blue-500/50';
            case 'workforce': return 'border-amber-500/50';
            case 'research': return 'border-purple-500/50';
            default: return 'border-primary/50';
        }
    };

    const getGlowStyle = () => {
        if (!isFocused) return '';
        switch (currentMode) {
            case 'registration': return 'shadow-[0_0_20px_-5px_rgba(16,185,129,0.3)] ring-1 ring-emerald-500/20';
            case 'product_info': return 'shadow-[0_0_20px_-5px_rgba(59,130,246,0.3)] ring-1 ring-blue-500/20';
            case 'workforce': return 'shadow-[0_0_20px_-5px_rgba(245,158,11,0.3)] ring-1 ring-amber-500/20';
            case 'research': return 'shadow-[0_0_20px_-5px_rgba(168,85,247,0.3)] ring-1 ring-purple-500/20';
            default: return 'shadow-[0_0_20px_-5px_rgba(var(--primary),0.3)] ring-1 ring-primary/20';
        }
    };

    const getButtonStyle = () => {
        if (!input.trim()) return 'bg-white/5 text-muted-foreground';
        switch (currentMode) {
            case 'registration': return 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-[0_0_15px_-3px_rgba(16,185,129,0.5)]';
            case 'product_info': return 'bg-blue-500 hover:bg-blue-600 text-white shadow-[0_0_15px_-3px_rgba(59,130,246,0.5)]';
            case 'workforce': return 'bg-amber-500 hover:bg-amber-600 text-white shadow-[0_0_15px_-3px_rgba(245,158,11,0.5)]';
            case 'research': return 'bg-purple-500 hover:bg-purple-600 text-white shadow-[0_0_15px_-3px_rgba(168,85,247,0.5)]';
            default: return 'bg-primary hover:bg-primary/80 text-white shadow-[0_0_15px_-3px_rgba(var(--primary),0.5)]';
        }
    };

    // Get mode accent color for gradient border
    const getModeAccentRgb = () => {
        switch (currentMode) {
            case 'registration': return '16,185,129';
            case 'product_info': return '59,130,246';
            case 'workforce': return '245,158,11';
            case 'research': return '168,85,247';
            default: return '16,185,129';
        }
    };

    return (
        <div className="w-full max-w-4xl mx-auto px-2 md:px-4 pb-4 md:pb-8 pt-2 md:pt-4 space-y-2 md:space-y-3">
            {/* Mode Selector */}
            <div className="flex justify-center">
                <ModeSelector
                    activeMode={currentMode}
                    onModeChange={setMode}
                    disabled={isProcessing}
                />
            </div>

            {/* Quick Action Chips - hidden on mobile */}
            <div className="hidden md:flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar px-1">
                {quickActions.map((action, i) => (
                    <motion.button
                        key={i}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05, duration: 0.3 }}
                        onClick={() => handleQuickAction(action.label)}
                        disabled={isProcessing}
                        className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.06] text-[11px] font-medium text-white/40 transition-all whitespace-nowrap",
                            "hover:bg-white/[0.08] hover:border-white/[0.15] hover:text-white/80 hover:shadow-lg",
                            "disabled:opacity-50 disabled:cursor-not-allowed"
                        )}
                    >
                        <action.icon className="h-3 w-3 opacity-60" />
                        {action.label}
                    </motion.button>
                ))}
            </div>

            {/* Input Bar - Premium glass */}
            <div className="relative">
                {/* Animated glow behind input when focused */}
                <AnimatePresence>
                    {isFocused && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.3 }}
                            className="absolute -inset-[1px] rounded-xl md:rounded-2xl"
                            style={{
                                background: `linear-gradient(135deg, rgba(${getModeAccentRgb()},0.3), rgba(${getModeAccentRgb()},0.05), rgba(${getModeAccentRgb()},0.2))`,
                                filter: 'blur(1px)',
                            }}
                        />
                    )}
                </AnimatePresence>

                <div className={cn(
                    "relative group flex items-end gap-2 bg-black/50 backdrop-blur-xl border transition-all duration-300 p-1.5 md:p-2.5 rounded-xl md:rounded-2xl",
                    isFocused ? 'border-white/[0.15] bg-black/60' : 'border-white/[0.08] shadow-xl hover:border-white/[0.12]'
                )}>
                    <div className="flex-grow pl-2 md:pl-3 py-1 md:py-1.5">
                        <textarea
                            ref={textareaRef}
                            rows={1}
                            value={input}
                            onChange={(e) => {
                                setInput(e.target.value);
                                e.target.style.height = 'auto';
                                e.target.style.height = `${e.target.scrollHeight}px`;
                            }}
                            onFocus={() => setIsFocused(true)}
                            onBlur={() => setIsFocused(false)}
                            onKeyDown={handleKeyDown}
                            placeholder={currentPlaceholder}
                            data-testid="chat-input"
                            className="w-full bg-transparent border-none text-white focus:ring-0 resize-none text-sm font-medium py-1 placeholder:text-white/25 max-h-48 scrollbar-thin outline-none"
                        />
                    </div>

                    <div className="pb-0.5 md:pb-1 pr-0.5 md:pr-1">
                        <Button
                            onClick={handleSend}
                            disabled={!input.trim() || isProcessing}
                            size="icon"
                            data-testid="send-button"
                            className={cn(
                                "h-9 w-9 md:h-10 md:w-10 rounded-lg md:rounded-xl transition-all duration-300",
                                getButtonStyle()
                            )}
                        >
                            {isProcessing ? (
                                <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <ArrowRight className="h-4 w-4" />
                            )}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Footer - hidden on mobile */}
            <p className="hidden md:block text-[10px] text-center text-white/15 font-medium tracking-[0.15em]">
                Enter om te versturen · Shift+Enter voor nieuwe regel
            </p>
        </div>
    );
}
