'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';

function getISOWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Goedemorgen';
    if (hour < 18) return 'Goedemiddag';
    return 'Goedenavond';
}

function getFormattedDate(): string {
    const now = new Date();
    const dayName = now.toLocaleDateString('nl-NL', { weekday: 'long' });
    const day = now.getDate();
    const month = now.toLocaleDateString('nl-NL', { month: 'long' });
    const capitalized = dayName.charAt(0).toUpperCase() + dayName.slice(1);
    return `${capitalized} ${day} ${month}`;
}

export function DashboardGreeting() {
    const [name, setName] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadProfile() {
            try {
                const supabase = createClient();
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;

                const { data: profile } = await supabase
                    .from('profiles')
                    .select('name')
                    .eq('user_id', user.id)
                    .maybeSingle();

                if (profile?.name) {
                    const firstName = profile.name.split(' ')[0];
                    setName(firstName);
                }
            } catch (error) {
                console.error('Failed to load profile:', error);
            } finally {
                setLoading(false);
            }
        }
        loadProfile();
    }, []);

    const greeting = getGreeting();
    const formattedDate = getFormattedDate();
    const weekNumber = getISOWeekNumber(new Date());

    if (loading) {
        return (
            <div className="space-y-3 pt-2">
                <Skeleton className="h-12 w-80" />
                <Skeleton className="h-5 w-56" />
            </div>
        );
    }

    return (
        <div className="relative pt-2">
            {/* Decorative glow behind greeting */}
            <div className="absolute -top-8 -left-8 w-64 h-64 bg-emerald-500/[0.04] rounded-full blur-3xl pointer-events-none" />

            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight relative">
                <span className="dashboard-gradient-text">
                    {greeting}
                </span>
                {name && (
                    <span className="text-white/90">, {name}</span>
                )}
            </h1>

            <div className="flex items-center gap-3 mt-2.5">
                <p className="text-sm text-white/35">
                    {formattedDate}
                </p>
                <span className="text-white/10">|</span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400/70 border border-emerald-500/15">
                    Week {weekNumber}
                </span>
            </div>
        </div>
    );
}
