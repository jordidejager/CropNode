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
    BarChart3,
    CalendarDays,
    BookOpen,
    Clock,
    Settings,
    Compass,
    PanelLeftClose,
    PanelLeftOpen,
    LogOut,
    Menu,
    X,
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

interface FlatNavItem {
    label: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    dividerAfter?: boolean;
    badge?: string;
}

const menuItems: FlatNavItem[] = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Slimme Invoer', href: '/slimme-invoer', icon: Sparkles, badge: 'Nieuw' },
    { label: 'Veldnotities', href: '/veldnotities', icon: StickyNote, dividerAfter: true },
    { label: 'Gewasbescherming', href: '/gewasbescherming', icon: Shield },
    { label: 'Percelen', href: '/percelen', icon: Map },
    { label: 'Oogst & Opslag', href: '/oogst', icon: Apple },
    { label: 'Afzetstromen', href: '/afzetstromen', icon: Truck },
    { label: 'Weer', href: '/weer', icon: CloudSun },
    { label: 'Analytics', href: '/analytics', icon: BarChart3 },
    { label: 'Kalender', href: '/kalender', icon: CalendarDays, dividerAfter: true },
    { label: 'Kennisbank', href: '/kennisbank', icon: BookOpen },
    { label: 'Urenregistratie', href: '/urenregistratie', icon: Clock },
    { label: 'Instellingen', href: '/instellingen', icon: Settings },
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

    // Collapse State (desktop only)
    const [isCollapsed, setIsCollapsed] = React.useState(false);
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

    // Initialize collapse from LocalStorage
    React.useEffect(() => {
        const savedCollapse = localStorage.getItem('sidebar_collapsed');
        if (savedCollapse !== null) setIsCollapsed(JSON.parse(savedCollapse));
    }, []);

    // Close mobile sidebar on navigation
    React.useEffect(() => {
        closeMobile();
    }, [pathname, closeMobile]);

    // Save collapse to LocalStorage
    const toggleCollapse = React.useCallback(() => {
        setIsCollapsed(prev => {
            const newState = !prev;
            localStorage.setItem('sidebar_collapsed', JSON.stringify(newState));
            return newState;
        });
    }, []);

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
                    "h-screen bg-[#020617] border-r border-white/5 transition-all duration-300 ease-in-out flex flex-col z-50 shrink-0",
                    "md:sticky md:top-0",
                    isCollapsed ? "md:w-[72px]" : "md:w-[220px]",
                    "w-72"
                )}
            >
                {/* Header */}
                <div className={cn(
                    "h-16 flex items-center gap-3 mb-2 shrink-0 relative",
                    isCollapsed ? "px-4 justify-center" : "px-5"
                )}>
                    {isCollapsed ? (
                        <LogoIcon theme="dark" size={32} />
                    ) : (
                        <motion.div
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex items-center overflow-hidden"
                        >
                            <Logo variant="horizontal" theme="dark" width={130} height={30} />
                        </motion.div>
                    )}

                    {isCollapsed && (
                        <button
                            onClick={toggleCollapse}
                            className="absolute -right-3 top-1/2 -translate-y-1/2 z-[60] size-6 flex items-center justify-center rounded-full bg-slate-800 border border-white/10 hover:bg-emerald-500/20 hover:border-emerald-500/30 transition-all text-slate-400 hover:text-emerald-400 shadow-lg"
                            aria-label="Sidebar uitklappen"
                        >
                            <PanelLeftOpen className="size-3.5" />
                        </button>
                    )}
                </div>

                {/* Navigation - flat list */}
                <nav className={cn(
                    "flex-1 flex flex-col overflow-y-auto custom-scrollbar",
                    isCollapsed ? "px-2" : "px-3"
                )}>
                    <div className="space-y-0.5">
                        {menuItems.map((item) => (
                            <React.Fragment key={item.label}>
                                {isCollapsed ? (
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Link
                                                href={item.href}
                                                className={cn(
                                                    "flex items-center justify-center w-full px-3 py-2.5 rounded-xl transition-all duration-200",
                                                    isLinkActive(item.href)
                                                        ? "bg-emerald-500/10 text-emerald-400"
                                                        : "hover:bg-white/5 text-slate-400 hover:text-slate-200"
                                                )}
                                            >
                                                <item.icon className={cn(
                                                    "size-5 shrink-0",
                                                    isLinkActive(item.href) ? "text-emerald-500" : ""
                                                )} />
                                            </Link>
                                        </TooltipTrigger>
                                        <TooltipContent side="right" className="bg-slate-800 text-white font-medium border-white/10">
                                            {item.label}
                                        </TooltipContent>
                                    </Tooltip>
                                ) : (
                                    <Link
                                        href={item.href}
                                        className={cn(
                                            "flex items-center w-full gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group",
                                            isLinkActive(item.href)
                                                ? "bg-emerald-500/10 text-emerald-400"
                                                : "hover:bg-white/5 text-slate-400 hover:text-slate-200"
                                        )}
                                    >
                                        <item.icon className={cn(
                                            "size-[18px] shrink-0 transition-colors",
                                            isLinkActive(item.href) ? "text-emerald-500" : "text-slate-400 group-hover:text-slate-200"
                                        )} />
                                        <span className={cn(
                                            "text-[13px] font-semibold truncate",
                                            isLinkActive(item.href) ? "text-emerald-400" : ""
                                        )}>
                                            {item.label}
                                        </span>
                                        {item.badge && (
                                            <span className="ml-auto text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                                                {item.badge}
                                            </span>
                                        )}
                                    </Link>
                                )}

                                {/* Divider */}
                                {item.dividerAfter && (
                                    <div className={cn("py-1.5", isCollapsed ? "mx-1" : "mx-2")}>
                                        <div className="h-px bg-white/[0.06]" />
                                    </div>
                                )}
                            </React.Fragment>
                        ))}
                    </div>

                    {/* Wegwijzer - pushed to bottom */}
                    <div className={cn("mt-auto pt-2 border-t border-white/[0.06]", isCollapsed ? "mx-1" : "mx-1")}>
                        {isCollapsed ? (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Link
                                        href="/wegwijzer"
                                        className={cn(
                                            "flex items-center justify-center w-full px-3 py-2.5 rounded-xl transition-all duration-200",
                                            isLinkActive('/wegwijzer')
                                                ? "bg-emerald-500/10 text-emerald-400"
                                                : "hover:bg-white/5 text-slate-500 hover:text-slate-300"
                                        )}
                                    >
                                        <Compass className={cn(
                                            "size-5 shrink-0",
                                            isLinkActive('/wegwijzer') ? "text-emerald-500" : ""
                                        )} />
                                    </Link>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="bg-slate-800 text-white font-medium border-white/10">
                                    Wegwijzer
                                </TooltipContent>
                            </Tooltip>
                        ) : (
                            <Link
                                href="/wegwijzer"
                                className={cn(
                                    "flex items-center w-full gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group",
                                    isLinkActive('/wegwijzer')
                                        ? "bg-emerald-500/10 text-emerald-400"
                                        : "hover:bg-white/5 text-slate-500 hover:text-slate-300"
                                )}
                            >
                                <Compass className={cn(
                                    "size-[18px] shrink-0 transition-colors",
                                    isLinkActive('/wegwijzer') ? "text-emerald-500" : "text-slate-500 group-hover:text-slate-300"
                                )} />
                                <span className={cn(
                                    "text-[13px] font-medium truncate",
                                    isLinkActive('/wegwijzer') ? "text-emerald-400" : ""
                                )}>
                                    Wegwijzer
                                </span>
                            </Link>
                        )}
                    </div>
                </nav>

                {/* Footer / User + Toggle */}
                <div className={cn(
                    "border-t border-white/5 shrink-0",
                    isCollapsed ? "p-2" : "p-3"
                )}>
                    {/* User Card */}
                    <div className={cn(
                        "flex items-center gap-3 rounded-2xl bg-white/5 border border-white/10 mb-2 transition-all duration-300",
                        isCollapsed ? "justify-center p-2" : "p-2.5"
                    )}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Link
                                    href="/profile"
                                    className={cn(
                                        "flex items-center gap-3 flex-1 min-w-0 group",
                                        isCollapsed ? "justify-center" : ""
                                    )}
                                >
                                    <div className="size-8 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center shrink-0 shadow-inner group-hover:bg-red-500/30 group-hover:border-red-500/50 transition-all">
                                        <span className="text-[10px] font-black text-red-400">{userInitials || '?'}</span>
                                    </div>
                                    {!isCollapsed && (
                                        <motion.div
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className="flex flex-col overflow-hidden flex-1"
                                        >
                                            <span className="text-xs font-bold text-white truncate group-hover:text-emerald-400 transition-colors">{userEmail?.split('@')[0] || 'Gebruiker'}</span>
                                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider truncate">Profiel bekijken</span>
                                        </motion.div>
                                    )}
                                </Link>
                            </TooltipTrigger>
                            {isCollapsed && (
                                <TooltipContent side="right" className="bg-slate-800 text-white font-bold border-white/10">
                                    Mijn Profiel
                                </TooltipContent>
                            )}
                        </Tooltip>
                        {!isCollapsed && (
                            <form action={logout}>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            type="submit"
                                            className="size-7 rounded-lg flex items-center justify-center hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-all"
                                        >
                                            <LogOut className="size-3.5" />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="bg-slate-800 text-white font-bold border-white/10">
                                        Uitloggen
                                    </TooltipContent>
                                </Tooltip>
                            </form>
                        )}
                    </div>

                    {/* Logout button when collapsed */}
                    {isCollapsed && (
                        <form action={logout} className="mb-2">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        type="submit"
                                        className="w-full h-8 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 hover:bg-red-500/10 hover:border-red-500/30 transition-all text-slate-400 hover:text-red-400"
                                    >
                                        <LogOut className="size-3.5" />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="bg-slate-800 text-white font-bold border-white/10">
                                    Uitloggen
                                </TooltipContent>
                            </Tooltip>
                        </form>
                    )}

                    {/* Toggle Button */}
                    {!isCollapsed ? (
                        <Button
                            variant="ghost"
                            onClick={toggleCollapse}
                            className="w-full h-9 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all text-slate-400 hover:text-emerald-400 shadow-sm"
                        >
                            <PanelLeftClose className="size-4 mr-2" />
                            <span className="text-xs font-bold">Inklappen</span>
                        </Button>
                    ) : (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={toggleCollapse}
                                    className="w-full h-9 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all text-slate-400 hover:text-emerald-400 shadow-sm"
                                >
                                    <PanelLeftOpen className="size-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="bg-slate-800 text-white font-bold border-white/10">
                                Menu uitklappen
                            </TooltipContent>
                        </Tooltip>
                    )}
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
        <aside className="h-screen sticky top-0 bg-[#020617] border-r border-white/5 w-[220px] flex flex-col z-50 shrink-0">
            <div className="h-16 flex items-center gap-3 mb-2 px-5">
                <div className="h-8 w-28 bg-white/5 rounded animate-pulse" />
            </div>
            <nav className="flex-1 px-3 space-y-1">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => (
                    <div key={i} className="h-10 bg-white/5 rounded-xl animate-pulse" />
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
