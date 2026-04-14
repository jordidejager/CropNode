'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Leaf, Timer, Zap } from 'lucide-react';
import { CommandBar } from '@/components/command-bar';
import { DashboardGreeting } from '@/components/dashboard/DashboardGreeting';
import { WeatherSprayStrip } from '@/components/dashboard/WeatherSprayStrip';
import { FieldNotesCard, TasksCard } from '@/components/dashboard/FieldNotesCard';
import { RecentActivity } from '@/components/dashboard/RecentActivity';
import { DashboardShortcuts } from '@/components/dashboard/DashboardShortcuts';
import { DashboardCalendar } from '@/components/dashboard/DashboardCalendar';
import type { InputMode } from '@/components/mode-selector';

const HINT_CHIPS = [
    {
        label: 'Spuitregistratie',
        example: 'Luna Sensation 0.8L/ha Conference alle percelen',
        icon: Sparkles,
        gradient: 'from-emerald-500/20 to-teal-500/5',
        borderColor: 'border-emerald-500/15 hover:border-emerald-500/30',
        textColor: 'text-emerald-400/60 hover:text-emerald-400',
    },
    {
        label: 'Bemesting',
        example: 'Kalksalpeter 25kg/ha Greenstar blok 1-4 strooien',
        icon: Leaf,
        gradient: 'from-green-500/15 to-emerald-500/5',
        borderColor: 'border-green-500/15 hover:border-green-500/30',
        textColor: 'text-green-400/60 hover:text-green-400',
    },
    {
        label: 'Werkregistratie',
        example: 'Snoeiwerk team A perceel Kanzi west 4 uur',
        icon: Timer,
        gradient: 'from-amber-500/15 to-orange-500/5',
        borderColor: 'border-amber-500/15 hover:border-amber-500/30',
        textColor: 'text-amber-400/60 hover:text-amber-400',
    },
];

export function DashboardClient() {
    const router = useRouter();
    const [input, setInput] = useState('');
    const [activeMode, setActiveMode] = useState<InputMode>('registration');

    const handleSend = useCallback((text: string, mode: InputMode) => {
        if (!text.trim()) return;
        const params = new URLSearchParams({ input: text, mode });
        router.push(`/slimme-invoer?${params.toString()}`);
    }, [router]);

    const handleHintClick = (example: string) => {
        setInput(example);
    };

    return (
        <div className="max-w-4xl mx-auto pb-12 relative">
            {/* Ambient floating background orbs */}
            <div className="absolute top-[-80px] left-[-40px] w-[500px] h-[500px] bg-emerald-500/[0.03] rounded-full blur-[120px] pointer-events-none dashboard-orb-1" />
            <div className="absolute top-[200px] right-[-80px] w-[400px] h-[400px] bg-teal-500/[0.025] rounded-full blur-[100px] pointer-events-none dashboard-orb-2" />
            <div className="absolute bottom-[100px] left-[20%] w-[350px] h-[350px] bg-cyan-500/[0.02] rounded-full blur-[100px] pointer-events-none dashboard-orb-2" />

            <div className="relative space-y-8 md:space-y-10">
                {/* Greeting */}
                <div className="dashboard-fade-in dashboard-fade-in-1">
                    <DashboardGreeting />
                </div>

                {/* ═══ Premium Smart Input Section ═══ */}
                <div className="dashboard-fade-in dashboard-fade-in-2">
                    <section className="relative">
                        {/* Rotating gradient border wrapper */}
                        <div className="premium-input-wrapper">
                            {/* Dark glass inner */}
                            <div className="premium-input-inner">
                                {/* Corner decorative dots */}
                                <div className="premium-corner-dot top-3 left-3" />
                                <div className="premium-corner-dot top-3 right-3" />
                                <div className="premium-corner-dot bottom-3 left-3 opacity-50" />
                                <div className="premium-corner-dot bottom-3 right-3 opacity-50" />

                                {/* Header strip */}
                                <div className="relative flex items-center justify-between px-5 md:px-8 pt-5 pb-0">
                                    <div className="flex items-center gap-2.5">
                                        <div className="premium-ai-badge">
                                            <Sparkles className="h-3.5 w-3.5" />
                                        </div>
                                        <div>
                                            <h2 className="text-[13px] font-semibold text-white/75 tracking-tight">
                                                Slimme Invoer
                                            </h2>
                                            <p className="text-[10px] text-white/25 -mt-0.5">
                                                AI-gestuurde registratie
                                            </p>
                                        </div>
                                    </div>
                                    <div className="premium-ai-tag">
                                        <Zap className="h-2.5 w-2.5" />
                                        AI Powered
                                    </div>
                                </div>

                                {/* CommandBar */}
                                <div className="relative">
                                    <CommandBar
                                        onSend={handleSend}
                                        isProcessing={false}
                                        value={input}
                                        onValueChange={setInput}
                                        placeholder="Typ een registratie... bijv. 'Captan 2L/ha op Jonagold blok 3'"
                                        activeMode={activeMode}
                                        onModeChange={setActiveMode}
                                    />
                                </div>

                                {/* Premium hint chips */}
                                <div className="relative flex flex-wrap items-center gap-2 px-5 md:px-8 pb-5 -mt-3 md:-mt-5">
                                    <span className="text-[10px] text-white/15 font-medium mr-1">Probeer:</span>
                                    {HINT_CHIPS.map((chip) => (
                                        <button
                                            key={chip.label}
                                            onClick={() => handleHintClick(chip.example)}
                                            className={`group/chip flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r ${chip.gradient} border ${chip.borderColor} text-[11px] font-medium ${chip.textColor} transition-all duration-300 hover:shadow-lg`}
                                        >
                                            <chip.icon className="h-3 w-3 opacity-60 group-hover/chip:opacity-100 transition-opacity" />
                                            {chip.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                {/* Weather & Spray Window */}
                <div className="dashboard-fade-in dashboard-fade-in-3">
                    <WeatherSprayStrip />
                </div>

                {/* Calendar: Komende 7 dagen */}
                <div className="dashboard-fade-in dashboard-fade-in-4">
                    <DashboardCalendar />
                </div>

                {/* Field Notes + Tasks */}
                <div className="dashboard-fade-in dashboard-fade-in-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <FieldNotesCard />
                    <TasksCard />
                </div>

                {/* Recent Activity + Shortcuts */}
                <div className="dashboard-fade-in dashboard-fade-in-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <RecentActivity />
                    <DashboardShortcuts />
                </div>
            </div>
        </div>
    );
}
