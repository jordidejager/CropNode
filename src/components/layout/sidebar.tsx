'use client';

import * as React from 'react';
import { Suspense, createContext, useContext, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    Sparkles,
    StickyNote,
    Shield,
    Map,
    Apple,
    Truck,
    CloudSun,
    Radio,
    BarChart3,
    Bug,
    CalendarDays,
    BookOpen,
    Clock,
    Settings,
    Compass,
    LogOut,
    Menu,
    X,
    Search,
    ChevronRight,
} from 'lucide-react';
import { Logo, LogoIcon } from '@/components/ui/logo';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { logout } from '@/lib/auth-actions';
import { createClient } from '@/lib/supabase/client';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

// Mobile sidebar context
interface MobileSidebarContextType {
    isOpen: boolean;
    open: () => void;
    close: () => void;
    toggle: () => void;
}

const MobileSidebarContext = createContext<MobileSidebarContextType | null>(null);

export function useMobileSidebar() {
    const context = useContext(MobileSidebarContext);
    if (!context) {
        throw new Error('useMobileSidebar must be used within MobileSidebarProvider');
    }
    return context;
}

export function MobileSidebarProvider({ children }: { children: React.ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);

    const open = useCallback(() => setIsOpen(true), []);
    const close = useCallback(() => setIsOpen(false), []);
    const toggle = useCallback(() => setIsOpen(prev => !prev), []);

    return (
        <MobileSidebarContext.Provider value={{ isOpen, open, close, toggle }}>
            {children}
        </MobileSidebarContext.Provider>
    );
}

// Hamburger button component for header
export function MobileMenuButton() {
    const { toggle, isOpen } = useMobileSidebar();

    return (
        <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            className="md:hidden rounded-xl bg-white/5 border border-white/10 hover:bg-white/10"
            aria-label={isOpen ? "Menu sluiten" : "Menu openen"}
        >
            {isOpen ? (
                <X className="h-5 w-5 text-slate-400" />
            ) : (
                <Menu className="h-5 w-5 text-slate-400" />
            )}
        </Button>
    );
}

// ============================================================================
// FLAT NAVIGATION STRUCTURE
// ============================================================================

interface NavItem {
    label: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string;
}

interface NavGroup {
    label: string;
    items: NavItem[];
}

// Dashboard — the home/hub of CropNode, shown prominently above groups
const dashboardItem: NavItem = { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard };

const navGroups: NavGroup[] = [
    {
        label: 'Registratie',
        items: [
            { label: 'Slimme Invoer', href: '/slimme-invoer', icon: Sparkles, badge: 'Nieuw' },
            { label: 'Veldnotities', href: '/veldnotities', icon: StickyNote },
            { label: 'Urenregistratie', href: '/urenregistratie', icon: Clock },
        ],
    },
    {
        label: 'Beheer',
        items: [
            { label: 'Gewasbescherming', href: '/gewasbescherming', icon: Shield },
            { label: 'Percelen', href: '/percelen', icon: Map },
            { label: 'Oogst & Opslag', href: '/oogst', icon: Apple },
            { label: 'Afzetstromen', href: '/afzetstromen', icon: Truck },
        ],
    },
    {
        label: 'Inzicht',
        items: [
            { label: 'Weer', href: '/weer', icon: CloudSun },
            { label: 'Weerstations', href: '/weerstations', icon: Radio },
            { label: 'Analytics', href: '/analytics', icon: BarChart3 },
            { label: 'Ziektedruk', href: '/ziektedruk', icon: Bug },
            { label: 'Kalender', href: '/kalender', icon: CalendarDays },
            { label: 'Kennisbank', href: '/kennisbank', icon: BookOpen },
        ],
    },
    {
        label: 'Systeem',
        items: [
            { label: 'Instellingen', href: '/instellingen', icon: Settings },
        ],
    },
];

// ============================================================================
// SIDEBAR CONTENT
// ============================================================================

function SidebarContent() {
    const pathname = usePathname();

    // Mobile sidebar state
    let mobileContext: MobileSidebarContextType | null = null;
    try {
        mobileContext = useMobileSidebar();
    } catch {
        // Context not available
    }
    const isMobileOpen = mobileContext?.isOpen ?? false;
    const closeMobile = mobileContext?.close ?? (() => {});

    // User State
    const [userEmail, setUserEmail] = React.useState<string | null>(null);
    const [userInitials, setUserInitials] = React.useState<string>('');

    // Load user on mount
    React.useEffect(() => {
        const supabase = createClient();
        supabase.auth.getUser().then(({ data: { user } }: { data: { user: { email?: string | null } | null } }) => {
            if (user?.email) {
                setUserEmail(user.email);
                const initials = user.email
                    .split('@')[0]
                    .slice(0, 2)
                    .toUpperCase();
                setUserInitials(initials);
            }
        });
    }, []);

    // Close mobile sidebar on navigation
    React.useEffect(() => {
        closeMobile();
    }, [pathname, closeMobile]);

    // Active state: prefix matching
    const isLinkActive = React.useCallback((href: string) => {
        if (pathname === href) return true;
        // Prefix match for sub-routes (e.g., /gewasbescherming/bemesting)
        if (href !== '/' && pathname.startsWith(href + '/')) return true;
        return false;
    }, [pathname]);

    // Sidebar content JSX
    const sidebarContent = (
        <TooltipProvider delayDuration={0}>
            <aside
                className={cn(
                    "h-screen bg-[#020617] flex flex-col z-50 shrink-0 relative",
                    "md:sticky md:top-0 md:w-[240px]",
                    "w-72"
                )}
            >
                {/* Premium atmospheric effects — subtle emerald glow at top */}
                <div className="absolute top-0 left-0 right-0 h-[300px] pointer-events-none overflow-hidden">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/3 w-[280px] h-[200px] rounded-full bg-emerald-500/[0.06] blur-[80px]" />
                </div>

                {/* Right-edge gradient line (replaces solid border) */}
                <div className="absolute top-0 right-0 w-px h-full pointer-events-none">
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/[0.08] to-transparent" />
                </div>

                {/* Noise texture overlay */}
                <div className="absolute inset-0 opacity-[0.015] mix-blend-overlay pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'1\'/%3E%3C/svg%3E")' }} />

                {/* Header — Logo */}
                <div className="h-16 flex items-center shrink-0 relative z-10 px-5">
                    <motion.div
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center overflow-hidden"
                    >
                        <Logo variant="horizontal" theme="dark" width={130} height={30} style="animated" />
                    </motion.div>
                </div>

                {/* Search / Command palette button */}
                <div className="px-3 mb-4 relative z-10">
                    <button
                        onClick={() => {
                            const evt = new CustomEvent('open-command-palette');
                            window.dispatchEvent(evt);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] hover:border-white/[0.10] transition-all group"
                    >
                        <Search className="size-3.5 text-slate-500 group-hover:text-slate-300 transition-colors" />
                        <span className="text-[12px] text-slate-500 group-hover:text-slate-300 flex-1 text-left transition-colors">Zoeken</span>
                        <kbd className="text-[9px] font-mono text-slate-500 px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] font-semibold">⌘K</kbd>
                    </button>
                </div>

                {/* Prominent Dashboard button — the "home" of CropNode */}
                <div className="px-3 mb-4 relative z-10">
                    <Link
                        href={dashboardItem.href}
                        className={cn(
                            "relative flex items-center gap-3 w-full px-3 py-2.5 rounded-xl overflow-hidden transition-all duration-300 group",
                            isLinkActive(dashboardItem.href)
                                ? "bg-gradient-to-br from-emerald-500/[0.18] via-emerald-500/[0.08] to-emerald-500/[0.04] border border-emerald-500/30 shadow-[0_0_30px_-8px_rgba(16,185,129,0.4)]"
                                : "bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] hover:border-white/[0.10]"
                        )}
                    >
                        {/* Glow effect when active */}
                        {isLinkActive(dashboardItem.href) && (
                            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/[0.08] to-transparent pointer-events-none" />
                        )}
                        <div className={cn(
                            "relative size-7 rounded-lg flex items-center justify-center transition-all",
                            isLinkActive(dashboardItem.href)
                                ? "bg-emerald-500/20 border border-emerald-500/40 shadow-[0_0_12px_-2px_rgba(52,211,153,0.6)]"
                                : "bg-white/[0.04] border border-white/[0.08] group-hover:bg-emerald-500/10 group-hover:border-emerald-500/20"
                        )}>
                            <LayoutDashboard className={cn(
                                "size-[15px] transition-colors",
                                isLinkActive(dashboardItem.href) ? "text-emerald-300" : "text-slate-400 group-hover:text-emerald-400"
                            )} />
                        </div>
                        <div className="relative flex flex-col flex-1 min-w-0">
                            <span className={cn(
                                "text-[13px] font-semibold truncate transition-colors",
                                isLinkActive(dashboardItem.href) ? "text-white" : "text-slate-200 group-hover:text-white"
                            )}>
                                Dashboard
                            </span>
                            <span className="text-[9px] text-slate-500 font-medium truncate">
                                Overzicht & snelstart
                            </span>
                        </div>
                        <ChevronRight className={cn(
                            "relative size-3.5 transition-all",
                            isLinkActive(dashboardItem.href) ? "text-emerald-400" : "text-slate-600 group-hover:text-slate-400 group-hover:translate-x-0.5"
                        )} />
                    </Link>
                </div>

                {/* Navigation — grouped sections */}
                <nav className="flex-1 flex flex-col overflow-y-auto custom-scrollbar relative z-10 px-3">
                    <div className="space-y-5">
                        {navGroups.map((group) => (
                            <div key={group.label}>
                                <div className="px-2.5 mb-1.5">
                                    <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-600">
                                        {group.label}
                                    </span>
                                </div>
                                <div className="space-y-0.5">
                                    {group.items.map((item) => {
                                        const active = isLinkActive(item.href);
                                        return (
                                            <Link
                                                key={item.label}
                                                href={item.href}
                                                className={cn(
                                                    "relative flex items-center w-full gap-3 px-2.5 py-2 rounded-lg transition-all duration-200 group",
                                                    active
                                                        ? "bg-white/[0.06] text-white"
                                                        : "hover:bg-white/[0.03] text-slate-400 hover:text-slate-100"
                                                )}
                                            >
                                                {/* Active indicator — emerald bar with glow */}
                                                {active && (
                                                    <motion.div
                                                        layoutId="activeIndicator"
                                                        className="absolute -left-1 top-1.5 bottom-1.5 w-[2px] rounded-full bg-emerald-400"
                                                        style={{ boxShadow: '0 0 10px rgba(52,211,153,0.6), 0 0 20px rgba(52,211,153,0.3)' }}
                                                        transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                                                    />
                                                )}

                                                <item.icon className={cn(
                                                    "size-[17px] shrink-0 transition-colors",
                                                    active
                                                        ? "text-emerald-400"
                                                        : "text-slate-500 group-hover:text-slate-300"
                                                )} />
                                                <span className={cn(
                                                    "text-[13px] font-medium truncate flex-1",
                                                    active ? "text-white" : ""
                                                )}>
                                                    {item.label}
                                                </span>
                                                {item.badge && (
                                                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                                                        {item.badge}
                                                    </span>
                                                )}
                                                {!item.badge && !active && (
                                                    <ChevronRight className="size-3 text-slate-700 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                                                )}
                                            </Link>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Wegwijzer - pushed to bottom */}
                    <div className="mt-auto pt-4">
                        <div className="h-px bg-white/[0.06] mb-3 mx-1" />
                        <Link
                            href="/wegwijzer"
                            className={cn(
                                "flex items-center w-full gap-3 px-2.5 py-2 rounded-lg transition-all duration-200 group",
                                isLinkActive('/wegwijzer')
                                    ? "bg-white/[0.06] text-white"
                                    : "hover:bg-white/[0.03] text-slate-500 hover:text-slate-300"
                            )}
                        >
                            <Compass className={cn(
                                "size-[17px] shrink-0 transition-colors",
                                isLinkActive('/wegwijzer') ? "text-emerald-400" : "text-slate-600 group-hover:text-slate-400"
                            )} />
                            <span className="text-[13px] font-medium truncate">
                                Wegwijzer
                            </span>
                        </Link>
                    </div>
                </nav>

                {/* Footer — User card */}
                <div className="shrink-0 relative z-10 p-3">
                    {/* Subtle divider above user card */}
                    <div className="h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent mb-3" />

                    <div className="relative rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden hover:border-white/[0.10] transition-colors group">
                        {/* Subtle glow on hover */}
                        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/0 via-transparent to-emerald-500/0 group-hover:from-emerald-500/[0.03] group-hover:to-emerald-500/[0.02] transition-all duration-500 pointer-events-none" />

                        <div className="relative flex items-center gap-2.5 p-2.5">
                            <Link
                                href="/profile"
                                className="flex items-center gap-2.5 flex-1 min-w-0"
                            >
                                <div className="relative shrink-0">
                                    <div className="size-8 rounded-full bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/30 flex items-center justify-center shadow-inner">
                                        <span className="text-[10px] font-black text-emerald-300">{userInitials || '?'}</span>
                                    </div>
                                    {/* Online indicator dot */}
                                    <div className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-emerald-400 border-[1.5px] border-[#020617] shadow-[0_0_6px_rgba(52,211,153,0.6)]" />
                                </div>
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="flex flex-col overflow-hidden flex-1 min-w-0"
                                >
                                    <span className="text-[12px] font-semibold text-white truncate">{userEmail?.split('@')[0] || 'Gebruiker'}</span>
                                    <span className="text-[9px] text-slate-500 font-medium truncate">Pro account</span>
                                </motion.div>
                            </Link>
                            <form action={logout}>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            type="submit"
                                            className="size-7 rounded-lg flex items-center justify-center hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-all"
                                        >
                                            <LogOut className="size-3.5" />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="bg-slate-800 text-white font-medium border-white/10">
                                        Uitloggen
                                    </TooltipContent>
                                </Tooltip>
                            </form>
                        </div>
                    </div>
                </div>
            </aside>
        </TooltipProvider>
    );

    return (
        <>
            {/* Desktop sidebar */}
            <div className="hidden md:block">
                {sidebarContent}
            </div>

            {/* Mobile sidebar with overlay */}
            <AnimatePresence>
                {isMobileOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
                            onClick={closeMobile}
                        />
                        <motion.div
                            initial={{ x: '-100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '-100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            className="md:hidden fixed inset-y-0 left-0 z-50"
                        >
                            {sidebarContent}
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    );
}

// Sidebar skeleton for Suspense fallback
function SidebarSkeleton() {
    return (
        <aside className="h-screen sticky top-0 bg-[#020617] w-[240px] flex flex-col z-50 shrink-0 relative">
            <div className="absolute top-0 right-0 w-px h-full bg-gradient-to-b from-transparent via-white/[0.08] to-transparent" />
            <div className="h-16 flex items-center gap-3 px-5">
                <div className="h-8 w-28 bg-white/5 rounded animate-pulse" />
            </div>
            <div className="px-3 mb-4">
                <div className="h-9 bg-white/[0.03] rounded-xl animate-pulse" />
            </div>
            <nav className="flex-1 px-3 space-y-1">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => (
                    <div key={i} className="h-8 bg-white/[0.03] rounded-lg animate-pulse" />
                ))}
            </nav>
        </aside>
    );
}

export function Sidebar() {
    return (
        <Suspense fallback={<SidebarSkeleton />}>
            <SidebarContent />
        </Suspense>
    );
}
