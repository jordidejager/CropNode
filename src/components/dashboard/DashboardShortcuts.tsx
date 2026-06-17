'use client';

import Link from 'next/link';
import {
    MessageSquare,
    ClipboardList,
    Map,
    Timer,
    CloudSun,
    Package,
    BarChart3,
    CalendarDays,
    ShieldAlert,
    ArrowRight,
    LayoutGrid,
} from 'lucide-react';
import { useDashboardStats } from '@/hooks/use-data';

type ColorKey =
    | 'emerald'
    | 'teal'
    | 'indigo'
    | 'green'
    | 'sky'
    | 'lime'
    | 'purple'
    | 'cyan'
    | 'amber'
    | 'orange';

const COLOR_PALETTE: Record<ColorKey, {
    gradient: string;
    iconColor: string;
    iconBg: string;
    iconBorder: string;
    spotColor: string;
    gbColor: string;
    orbBg: string;
    hoverText: string;
}> = {
    emerald: {
        gradient: 'from-emerald-500/20 to-emerald-600/5',
        iconColor: 'text-emerald-300',
        iconBg: 'bg-emerald-500/15',
        iconBorder: 'border-emerald-400/30',
        spotColor: 'rgba(16, 185, 129, 0.16)',
        gbColor: 'rgba(16, 185, 129, 0.55)',
        orbBg: 'bg-emerald-500',
        hoverText: 'group-hover:text-emerald-300',
    },
    teal: {
        gradient: 'from-teal-500/20 to-teal-600/5',
        iconColor: 'text-teal-300',
        iconBg: 'bg-teal-500/15',
        iconBorder: 'border-teal-400/30',
        spotColor: 'rgba(45, 212, 191, 0.16)',
        gbColor: 'rgba(45, 212, 191, 0.55)',
        orbBg: 'bg-teal-500',
        hoverText: 'group-hover:text-teal-300',
    },
    indigo: {
        gradient: 'from-indigo-500/20 to-indigo-600/5',
        iconColor: 'text-indigo-300',
        iconBg: 'bg-indigo-500/15',
        iconBorder: 'border-indigo-400/30',
        spotColor: 'rgba(129, 140, 248, 0.16)',
        gbColor: 'rgba(129, 140, 248, 0.55)',
        orbBg: 'bg-indigo-500',
        hoverText: 'group-hover:text-indigo-300',
    },
    green: {
        gradient: 'from-green-500/20 to-green-600/5',
        iconColor: 'text-green-300',
        iconBg: 'bg-green-500/15',
        iconBorder: 'border-green-400/30',
        spotColor: 'rgba(74, 222, 128, 0.16)',
        gbColor: 'rgba(74, 222, 128, 0.55)',
        orbBg: 'bg-green-500',
        hoverText: 'group-hover:text-green-300',
    },
    sky: {
        gradient: 'from-sky-500/20 to-sky-600/5',
        iconColor: 'text-sky-300',
        iconBg: 'bg-sky-500/15',
        iconBorder: 'border-sky-400/30',
        spotColor: 'rgba(56, 189, 248, 0.16)',
        gbColor: 'rgba(56, 189, 248, 0.55)',
        orbBg: 'bg-sky-500',
        hoverText: 'group-hover:text-sky-300',
    },
    lime: {
        gradient: 'from-lime-500/20 to-lime-600/5',
        iconColor: 'text-lime-300',
        iconBg: 'bg-lime-500/15',
        iconBorder: 'border-lime-400/30',
        spotColor: 'rgba(163, 230, 53, 0.16)',
        gbColor: 'rgba(163, 230, 53, 0.55)',
        orbBg: 'bg-lime-500',
        hoverText: 'group-hover:text-lime-300',
    },
    purple: {
        gradient: 'from-purple-500/20 to-purple-600/5',
        iconColor: 'text-purple-300',
        iconBg: 'bg-purple-500/15',
        iconBorder: 'border-purple-400/30',
        spotColor: 'rgba(168, 85, 247, 0.16)',
        gbColor: 'rgba(168, 85, 247, 0.55)',
        orbBg: 'bg-purple-500',
        hoverText: 'group-hover:text-purple-300',
    },
    cyan: {
        gradient: 'from-cyan-500/20 to-cyan-600/5',
        iconColor: 'text-cyan-300',
        iconBg: 'bg-cyan-500/15',
        iconBorder: 'border-cyan-400/30',
        spotColor: 'rgba(34, 211, 238, 0.16)',
        gbColor: 'rgba(34, 211, 238, 0.55)',
        orbBg: 'bg-cyan-500',
        hoverText: 'group-hover:text-cyan-300',
    },
    amber: {
        gradient: 'from-amber-500/20 to-amber-600/5',
        iconColor: 'text-amber-300',
        iconBg: 'bg-amber-500/15',
        iconBorder: 'border-amber-400/30',
        spotColor: 'rgba(245, 158, 11, 0.16)',
        gbColor: 'rgba(245, 158, 11, 0.55)',
        orbBg: 'bg-amber-500',
        hoverText: 'group-hover:text-amber-300',
    },
    orange: {
        gradient: 'from-orange-500/20 to-orange-600/5',
        iconColor: 'text-orange-300',
        iconBg: 'bg-orange-500/15',
        iconBorder: 'border-orange-400/30',
        spotColor: 'rgba(249, 115, 22, 0.16)',
        gbColor: 'rgba(249, 115, 22, 0.55)',
        orbBg: 'bg-orange-500',
        hoverText: 'group-hover:text-orange-300',
    },
};

interface ShortcutItem {
    label: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    getSubtext: (stats: ReturnType<typeof useDashboardStats>['data']) => string;
    color: ColorKey;
    description: string;
}

const shortcuts: ShortcutItem[] = [
    {
        label: 'Slimme Invoer',
        href: '/slimme-invoer',
        icon: MessageSquare,
        getSubtext: () => 'Nieuwe registratie',
        color: 'emerald',
        description: 'Open Slimme Invoer om een nieuwe registratie te starten',
    },
    {
        label: 'Spuitschrift',
        href: '/gewasbescherming',
        icon: ClipboardList,
        getSubtext: (data) => {
            const count = data?.stats?.recentSprayings;
            if (count != null && count > 0) return `${count} deze week`;
            return 'Bekijk registraties';
        },
        color: 'teal',
        description: 'Open het spuitschrift',
    },
    {
        label: 'Urenregistratie',
        href: '/urenregistratie',
        icon: Timer,
        getSubtext: () => 'Uren bijhouden',
        color: 'indigo',
        description: 'Open urenregistratie',
    },
    {
        label: 'Percelen',
        href: '/percelen',
        icon: Map,
        getSubtext: (data) => {
            const count = data?.stats?.totalParcels;
            const area = data?.stats?.totalArea;
            if (count != null && count > 0) {
                return `${count} percelen${area ? ` · ${Math.round(area)} ha` : ''}`;
            }
            return 'Beheer percelen';
        },
        color: 'green',
        description: 'Beheer je percelen',
    },
    {
        label: 'Weer',
        href: '/weer',
        icon: CloudSun,
        getSubtext: () => 'Spuitvenster bekijken',
        color: 'sky',
        description: 'Open het weerdashboard',
    },
    {
        label: 'Ziektedruk',
        href: '/ziektedruk',
        icon: ShieldAlert,
        getSubtext: () => 'Schurft & infectie',
        color: 'orange',
        description: 'Bekijk ziektedruk en infectieperiodes',
    },
    {
        label: 'Analyses',
        href: '/analytics',
        icon: BarChart3,
        getSubtext: () => 'Seizoenscijfers',
        color: 'lime',
        description: 'Bekijk analyses en cijfers',
    },
    {
        label: 'Kalender',
        href: '/kalender',
        icon: CalendarDays,
        getSubtext: () => 'Planning en taken',
        color: 'purple',
        description: 'Open de kalender',
    },
    {
        label: 'Voorraad',
        href: '/gewasbescherming/voorraad',
        icon: Package,
        getSubtext: () => 'Middelen beheren',
        color: 'amber',
        description: 'Beheer je voorraad middelen',
    },
];

export function DashboardShortcuts() {
    const { data } = useDashboardStats();

    return (
        <section aria-labelledby="dashboard-shortcuts-heading">
            <div className="relative mb-5">
                <div className="section-aurora" aria-hidden />
                <div className="relative flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="section-pill">
                            <span className="section-pill-dot" aria-hidden />
                            <span>Snelkoppelingen</span>
                        </div>
                        <h2
                            id="dashboard-shortcuts-heading"
                            className="hidden sm:flex items-center gap-2 text-[15px] font-semibold text-white/85"
                        >
                            <LayoutGrid className="h-4 w-4 text-white/50" aria-hidden />
                            Alles op één plek
                        </h2>
                    </div>
                    <span className="text-[12px] text-white/40 hidden md:inline">
                        Klik op een tegel om direct te openen
                    </span>
                </div>
            </div>

            <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {shortcuts.map((shortcut) => {
                    const Icon = shortcut.icon;
                    const subtext = shortcut.getSubtext(data);
                    const palette = COLOR_PALETTE[shortcut.color];

                    return (
                        <li key={shortcut.href}>
                            <Link
                                href={shortcut.href}
                                aria-label={shortcut.description}
                                className="group shortcut-card card-spotlight-host dashboard-focusable rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 sm:p-5 hover:border-white/[0.18] relative overflow-hidden block min-h-[112px]"
                                style={{
                                    '--spot-color': palette.spotColor,
                                    '--gb-color': palette.gbColor,
                                } as React.CSSProperties}
                                onMouseMove={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    e.currentTarget.style.setProperty('--mx', `${e.clientX - rect.left}px`);
                                    e.currentTarget.style.setProperty('--my', `${e.clientY - rect.top}px`);
                                }}
                            >
                                <div className={`card-glow-orb ${palette.orbBg}`} aria-hidden />
                                <div className="card-noise" aria-hidden />
                                <div className="card-gradient-border" aria-hidden />
                                <div className="card-spotlight" aria-hidden />

                                <div className="relative flex flex-col h-full">
                                    <div
                                        className={`shortcut-icon-glow h-11 w-11 rounded-xl border ${palette.iconBg} ${palette.iconBorder} bg-gradient-to-br ${palette.gradient} flex items-center justify-center mb-3 ${palette.iconColor}`}
                                    >
                                        <Icon className="h-5 w-5" aria-hidden />
                                    </div>
                                    <div className="flex items-end justify-between gap-2 mt-auto">
                                        <div className="min-w-0 flex-1">
                                            <p className={`text-[15px] font-semibold text-white/90 ${palette.hoverText} transition-colors duration-300`}>
                                                {shortcut.label}
                                            </p>
                                            <p className="text-[12px] text-white/45 mt-0.5 truncate group-hover:text-white/65 transition-colors duration-300">
                                                {subtext}
                                            </p>
                                        </div>
                                        <ArrowRight
                                            className="h-4 w-4 text-white/0 group-hover:text-white/50 transition-all duration-300 group-hover:translate-x-0.5 flex-shrink-0"
                                            aria-hidden
                                        />
                                    </div>
                                </div>
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
