'use client';

import Link from 'next/link';
import {
    MessageSquare,
    ClipboardList,
    Map,
    Timer,
    CloudSun,
    Package,
    ArrowRight,
} from 'lucide-react';
import { useDashboardStats } from '@/hooks/use-data';

interface ShortcutItem {
    label: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    getSubtext: (stats: ReturnType<typeof useDashboardStats>['data']) => string;
    gradient: string;
    iconColor: string;
    glowColor: string;
}

const shortcuts: ShortcutItem[] = [
    {
        label: 'Slimme Invoer',
        href: '/command-center/smart-input-v2',
        icon: MessageSquare,
        getSubtext: () => 'Start een nieuwe registratie',
        gradient: 'from-emerald-500/20 to-emerald-600/5',
        iconColor: 'text-emerald-400',
        glowColor: 'rgba(16, 185, 129, 0.15)',
    },
    {
        label: 'Spuitschrift',
        href: '/crop-care/logs',
        icon: ClipboardList,
        getSubtext: (data) => {
            const count = data?.stats?.recentSprayings;
            if (count != null && count > 0) return `${count} deze week`;
            return 'Bekijk registraties';
        },
        gradient: 'from-emerald-500/15 to-teal-600/5',
        iconColor: 'text-emerald-400',
        glowColor: 'rgba(16, 185, 129, 0.15)',
    },
    {
        label: 'Percelen',
        href: '/parcels/list',
        icon: Map,
        getSubtext: (data) => {
            const count = data?.stats?.totalParcels;
            const area = data?.stats?.totalArea;
            if (count != null && count > 0) {
                return `${count} percelen${area ? `, ${Math.round(area)} ha` : ''}`;
            }
            return 'Beheer percelen';
        },
        gradient: 'from-green-500/15 to-emerald-600/5',
        iconColor: 'text-green-400',
        glowColor: 'rgba(34, 197, 94, 0.15)',
    },
    {
        label: 'Urenregistratie',
        href: '/team-tasks',
        icon: Timer,
        getSubtext: () => 'Uren bijhouden',
        gradient: 'from-purple-500/15 to-violet-600/5',
        iconColor: 'text-purple-400',
        glowColor: 'rgba(168, 85, 247, 0.15)',
    },
    {
        label: 'Weerdashboard',
        href: '/weather/dashboard',
        icon: CloudSun,
        getSubtext: () => 'Bekijk het weer',
        gradient: 'from-blue-500/15 to-cyan-600/5',
        iconColor: 'text-blue-400',
        glowColor: 'rgba(59, 130, 246, 0.15)',
    },
    {
        label: 'Voorraad',
        href: '/crop-care/inventory',
        icon: Package,
        getSubtext: () => 'Voorraad beheren',
        gradient: 'from-amber-500/15 to-orange-600/5',
        iconColor: 'text-amber-400',
        glowColor: 'rgba(245, 158, 11, 0.15)',
    },
];

export function DashboardShortcuts() {
    const { data } = useDashboardStats();

    return (
        <div>
            <h2 className="text-[11px] font-semibold text-white/30 uppercase tracking-widest mb-3">
                Snelkoppelingen
            </h2>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                {shortcuts.map((shortcut) => {
                    const Icon = shortcut.icon;
                    const subtext = shortcut.getSubtext(data);

                    return (
                        <Link
                            key={shortcut.href}
                            href={shortcut.href}
                            className="group shortcut-card rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 hover:border-white/[0.12] relative overflow-hidden"
                        >
                            {/* Hover gradient overlay */}
                            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                            <div className="relative">
                                <div
                                    className={`shortcut-icon-glow h-10 w-10 rounded-xl bg-gradient-to-br ${shortcut.gradient} flex items-center justify-center mb-3 ${shortcut.iconColor}`}
                                >
                                    <Icon className="h-[18px] w-[18px]" />
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="min-w-0">
                                        <p className="text-[13px] font-semibold text-white/75 group-hover:text-white transition-colors duration-300">
                                            {shortcut.label}
                                        </p>
                                        <p className="text-[11px] text-white/20 mt-0.5 truncate group-hover:text-white/35 transition-colors duration-300">
                                            {subtext}
                                        </p>
                                    </div>
                                    <ArrowRight className="h-3.5 w-3.5 text-white/0 group-hover:text-white/30 transition-all duration-300 group-hover:translate-x-0.5 flex-shrink-0 ml-2" />
                                </div>
                            </div>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
