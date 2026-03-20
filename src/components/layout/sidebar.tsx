'use client';

import * as React from 'react';
import { Suspense, createContext, useContext, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
    Home,
    Map,
    List,
    MapPin,
    ClipboardList,
    Package,
    FlaskConical,
    Database,
    Sprout,
    BookOpen,
    Library,
    ChevronDown,
    ChevronRight,
    PanelLeftClose,
    PanelLeftOpen,
    MessageSquare,
    Clock,
    Users,
    Timer,
    Bug,
    LogOut,
    Menu,
    X,
    User,
    Apple,
    Thermometer,
    BarChart3,
    SlidersHorizontal,
    Truck,
    CloudSun,
    Compass,
    History,
    LayoutDashboard,
    Leaf,
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

interface NavItem {
    label: string;
    href?: string;
    icon: any;
    items?: NavItem[];
}

const menuStructure: NavItem[] = [
    {
        label: 'Command Center',
        icon: Home,
        items: [
            { label: 'Dashboard', href: '/command-center', icon: LayoutDashboard },
            { label: 'Slimme Invoer', href: '/command-center/smart-input-v3', icon: MessageSquare },
            { label: 'Tijdlijn', href: '/command-center/timeline', icon: Clock },
        ]
    },
    {
        label: 'Percelen',
        icon: Map,
        items: [
            { label: 'Lijstweergave', href: '/parcels/list', icon: List },
            { label: 'Kaartweergave', href: '/parcels/map', icon: MapPin },
        ]
    },
    {
        label: 'Crop Care',
        icon: Sprout,
        items: [
            { label: 'Spuitschrift', href: '/crop-care/logs', icon: ClipboardList },
            { label: 'Bemestingsregister', href: '/crop-care/fertilization', icon: Leaf },
            { label: 'Voorraad', href: '/crop-care/inventory', icon: Package },
            { label: 'Mijn Producten', href: '/crop-care/my-products', icon: FlaskConical },
            { label: 'Database Gewasbescherming', href: '/crop-care/db-protection', icon: Database },
            { label: 'Database Meststoffen', href: '/crop-care/db-fertilizer', icon: Sprout },
        ]
    },
    {
        label: 'Harvest Hub',
        icon: Apple,
        items: [
            { label: 'Oogstregistratie', href: '/harvest-hub/registration', icon: ClipboardList },
            { label: 'Koelcelbeheer', href: '/harvest-hub/cold-storage', icon: Thermometer },
            { label: 'Perceelanalyse', href: '/harvest-hub/field-analysis', icon: BarChart3 },
            { label: 'Sortering & Kwaliteit', href: '/harvest-hub/quality', icon: SlidersHorizontal },
            { label: 'Afleveroverzicht', href: '/harvest-hub/deliveries', icon: Truck },
        ]
    },
    {
        label: 'Team & Tasks',
        icon: Users,
        items: [
            { label: 'Urenregistratie', href: '/team-tasks', icon: Timer },
        ]
    },
    {
        label: 'Research Hub',
        icon: BookOpen,
        items: [
            { label: 'Field Signals', href: '/research?tab=signals', icon: BookOpen },
            { label: 'Papers & Onderzoek', href: '/research?tab=papers', icon: FlaskConical },
            { label: 'Kennisbank', href: '/research/kennisbank', icon: Library },
            { label: 'Ziekten & Plagen', href: '/research/pests', icon: Bug },
        ]
    },
    {
        label: 'Weather Hub',
        icon: CloudSun,
        items: [
            { label: 'Dashboard', href: '/weather/dashboard', icon: CloudSun },
            { label: 'Historie (KNMI)', href: '/weather/historie', icon: History },
            { label: 'Ziektedruk', href: '/weather/disease-pressure', icon: Bug },
            { label: 'Expert Forecast', href: '/weather/expert', icon: SlidersHorizontal },
        ]
    },
];

// Flyout menu component for collapsed state with sub-items
interface FlyoutMenuProps {
    item: NavItem;
    isLinkActive: (href: string) => boolean;
}

function FlyoutMenu({ item, isLinkActive }: FlyoutMenuProps) {
    const [isHovered, setIsHovered] = React.useState(false);
    const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);

    const isGroupActive = item.items?.some(sub => isLinkActive(sub.href!));

    const handleMouseEnter = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setIsHovered(true);
    };

    const handleMouseLeave = () => {
        timeoutRef.current = setTimeout(() => setIsHovered(false), 150);
    };

    return (
        <div
            className="relative"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {/* Icon Button */}
            <div
                className={cn(
                    "flex items-center justify-center w-full px-3 py-3 rounded-xl transition-all duration-200 cursor-pointer",
                    isGroupActive
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "hover:bg-white/5 text-slate-400 hover:text-slate-200"
                )}
            >
                <item.icon className={cn(
                    "size-5 shrink-0",
                    isGroupActive ? "text-emerald-500" : ""
                )} />
            </div>

            {/* Flyout Panel */}
            <AnimatePresence>
                {isHovered && (
                    <motion.div
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -8 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-full top-0 ml-2 z-[100]"
                        onMouseEnter={handleMouseEnter}
                        onMouseLeave={handleMouseLeave}
                    >
                        <div className="bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl py-2 min-w-[200px]">
                            {/* Header */}
                            <div className="px-4 py-2 border-b border-white/5">
                                <span className="text-xs font-bold text-white uppercase tracking-wider">
                                    {item.label}
                                </span>
                            </div>

                            {/* Sub Items */}
                            <div className="py-1">
                                {item.items?.map((sub) => (
                                    <Link
                                        key={sub.label}
                                        href={sub.href!}
                                        className={cn(
                                            "flex items-center gap-3 px-4 py-2.5 transition-all duration-200",
                                            isLinkActive(sub.href!)
                                                ? "bg-emerald-500/10 text-emerald-400"
                                                : "text-slate-400 hover:text-white hover:bg-white/5"
                                        )}
                                    >
                                        <sub.icon className="size-4 shrink-0" />
                                        <span className="text-sm font-medium">{sub.label}</span>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function SidebarContent() {
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // Mobile sidebar state - use try/catch for when context is not available
    let mobileContext: MobileSidebarContextType | null = null;
    try {
        mobileContext = useMobileSidebar();
    } catch {
        // Context not available, sidebar is being used outside provider
    }
    const isMobileOpen = mobileContext?.isOpen ?? false;
    const closeMobile = mobileContext?.close ?? (() => {});

    // Collapse State (desktop only)
    const [isCollapsed, setIsCollapsed] = React.useState(false);
    // Group State (open accordions)
    const [openGroups, setOpenGroups] = React.useState<string[]>([]);
    // User State
    const [userEmail, setUserEmail] = React.useState<string | null>(null);
    const [userInitials, setUserInitials] = React.useState<string>('');

    // Load user on mount
    React.useEffect(() => {
        const supabase = createClient();
        supabase.auth.getUser().then(({ data: { user } }) => {
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

    // Initialize from LocalStorage
    React.useEffect(() => {
        const savedCollapse = localStorage.getItem('sidebar_collapsed');
        if (savedCollapse !== null) setIsCollapsed(JSON.parse(savedCollapse));

        const savedGroups = localStorage.getItem('sidebar_groups');
        if (savedGroups !== null) setOpenGroups(JSON.parse(savedGroups));
        else {
            // Auto-open group if active sub-item
            const activeGroup = menuStructure.find(group =>
                group.items?.some(sub => sub.href === pathname)
            );
            if (activeGroup) setOpenGroups([activeGroup.label]);
        }
    }, [pathname]);

    // Close mobile sidebar on navigation
    React.useEffect(() => {
        closeMobile();
    }, [pathname, closeMobile]);

    // Save to LocalStorage
    const toggleCollapse = React.useCallback(() => {
        setIsCollapsed(prev => {
            const newState = !prev;
            localStorage.setItem('sidebar_collapsed', JSON.stringify(newState));
            return newState;
        });
    }, []);

    const toggleGroup = (label: string) => {
        setOpenGroups(prev => {
            const next = prev.includes(label)
                ? prev.filter(g => g !== label)
                : [...prev, label];
            localStorage.setItem('sidebar_groups', JSON.stringify(next));
            return next;
        });
    };

    const isLinkActive = React.useCallback((href: string) => {
        if (href === pathname) return true;

        // Check for query params match
        if (href && href.includes('?')) {
            const [path, query] = href.split('?');
            if (path !== pathname) return false;

            const params = new URLSearchParams(query);
            for (const [key, value] of params.entries()) {
                if (searchParams.get(key) !== value) return false;
            }
            return true;
        }

        return false;
    }, [pathname, searchParams]);

    // Sidebar content JSX
    const sidebarContent = (
        <TooltipProvider delayDuration={0}>
            <aside
                className={cn(
                    "h-screen bg-[#020617] border-r border-white/5 transition-all duration-300 ease-in-out flex flex-col z-50 shrink-0",
                    // Desktop: sticky, width based on collapse state
                    "md:sticky md:top-0",
                    isCollapsed ? "md:w-[72px]" : "md:w-72",
                    // Mobile: full width when open
                    "w-72"
                )}
            >
                {/* Header with integrated toggle for collapsed state */}
                <div className={cn(
                    "h-16 flex items-center gap-3 mb-4 shrink-0 relative",
                    isCollapsed ? "px-4 justify-center" : "px-6"
                )}>
                    {isCollapsed ? (
                        <LogoIcon theme="dark" size={32} />
                    ) : (
                        <motion.div
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex items-center overflow-hidden"
                        >
                            <Logo variant="horizontal" theme="dark" width={140} height={32} />
                        </motion.div>
                    )}

                    {/* Toggle button in header when collapsed */}
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

                {/* Navigation */}
                <nav className={cn(
                    "flex-1 space-y-1 overflow-y-auto custom-scrollbar",
                    isCollapsed ? "px-2" : "px-3"
                )}>
                    {menuStructure.map((item) => {
                        const hasSubItems = item.items && item.items.length > 0;
                        const isOpen = openGroups.includes(item.label);
                        const isGroupActive = item.items?.some(sub => isLinkActive(sub.href!)) || (item.href && isLinkActive(item.href));

                        // COLLAPSED STATE
                        if (isCollapsed) {
                            // Item with sub-items: show flyout on hover
                            if (hasSubItems) {
                                return (
                                    <FlyoutMenu
                                        key={item.label}
                                        item={item}
                                        isLinkActive={isLinkActive}
                                    />
                                );
                            }

                            // Single item: direct link with tooltip
                            return (
                                <Tooltip key={item.label}>
                                    <TooltipTrigger asChild>
                                        <Link
                                            href={item.href!}
                                            className={cn(
                                                "flex items-center justify-center w-full px-3 py-3 rounded-xl transition-all duration-200",
                                                isLinkActive(item.href!)
                                                    ? "bg-emerald-500/10 text-emerald-400"
                                                    : "hover:bg-white/5 text-slate-400 hover:text-slate-200"
                                            )}
                                        >
                                            <item.icon className={cn(
                                                "size-5 shrink-0",
                                                isLinkActive(item.href!) ? "text-emerald-500" : ""
                                            )} />
                                        </Link>
                                    </TooltipTrigger>
                                    <TooltipContent side="right" className="bg-slate-800 text-white font-medium border-white/10">
                                        {item.label}
                                    </TooltipContent>
                                </Tooltip>
                            );
                        }

                        // EXPANDED STATE
                        const itemContent = (
                            <div
                                onClick={() => hasSubItems && toggleGroup(item.label)}
                                className={cn(
                                    "flex items-center w-full gap-3 px-3 py-3 rounded-xl transition-all duration-200 cursor-pointer relative group",
                                    item.href && isLinkActive(item.href)
                                        ? "bg-emerald-500/10 backdrop-blur-md border-l-4 border-emerald-500 text-emerald-400"
                                        : "hover:bg-white/5 text-slate-400 hover:text-slate-200",
                                    !item.href && isGroupActive && !isOpen ? "bg-emerald-500/5 text-emerald-500/80" : ""
                                )}
                            >
                                <item.icon className={cn(
                                    "size-5 shrink-0 transition-colors",
                                    isGroupActive || (item.href && isLinkActive(item.href)) ? "text-emerald-500" : "text-slate-400 group-hover:text-slate-200"
                                )} />
                                <span className={cn(
                                    "text-sm font-bold tracking-wide truncate",
                                    isGroupActive || (item.href && isLinkActive(item.href)) ? "text-emerald-500" : ""
                                )}>
                                    {item.label}
                                </span>
                                {hasSubItems && (
                                    <div className="ml-auto">
                                        {isOpen ? <ChevronDown className="size-4 opacity-50" /> : <ChevronRight className="size-4 opacity-50" />}
                                    </div>
                                )}
                            </div>
                        );

                        return (
                            <div key={item.label} className="space-y-1">
                                {item.href ? (
                                    <Link href={item.href}>{itemContent}</Link>
                                ) : (
                                    itemContent
                                )}

                                {/* Accordion Sub-items */}
                                <AnimatePresence initial={false}>
                                    {hasSubItems && isOpen && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: "auto", opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            className="overflow-hidden pl-4 ml-4 border-l border-white/5 space-y-1"
                                        >
                                            {item.items?.map((sub) => (
                                                <Link
                                                    key={sub.label}
                                                    href={sub.href!}
                                                    className={cn(
                                                        "flex items-center gap-3 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-200",
                                                        isLinkActive(sub.href!)
                                                            ? "bg-emerald-500/10 text-emerald-400"
                                                            : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
                                                    )}
                                                >
                                                    <sub.icon className="size-4 shrink-0" />
                                                    <span>{sub.label}</span>
                                                </Link>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        );
                    })}

                    {/* Separator + Wegwijzer link */}
                    <div className={cn("pt-3 mt-3 border-t border-white/5", isCollapsed ? "mx-1" : "mx-1")}>
                        {isCollapsed ? (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Link
                                        href="/wegwijzer"
                                        className={cn(
                                            "flex items-center justify-center w-full px-3 py-3 rounded-xl transition-all duration-200",
                                            isLinkActive('/wegwijzer')
                                                ? "bg-emerald-500/10 text-emerald-400"
                                                : "hover:bg-white/5 text-slate-400 hover:text-slate-200"
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
                                    "flex items-center w-full gap-3 px-3 py-3 rounded-xl transition-all duration-200 group",
                                    isLinkActive('/wegwijzer')
                                        ? "bg-emerald-500/10 backdrop-blur-md border-l-4 border-emerald-500 text-emerald-400"
                                        : "hover:bg-white/5 text-slate-400 hover:text-slate-200"
                                )}
                            >
                                <Compass className={cn(
                                    "size-5 shrink-0 transition-colors",
                                    isLinkActive('/wegwijzer') ? "text-emerald-500" : "text-slate-400 group-hover:text-slate-200"
                                )} />
                                <span className={cn(
                                    "text-sm font-bold tracking-wide truncate",
                                    isLinkActive('/wegwijzer') ? "text-emerald-500" : ""
                                )}>
                                    Wegwijzer
                                </span>
                            </Link>
                        )}
                    </div>
                </nav>

                {/* Footer / Toggle */}
                <div className={cn(
                    "border-t border-white/5 shrink-0",
                    isCollapsed ? "p-2" : "p-4"
                )}>
                    {/* User Card */}
                    <div className={cn(
                        "flex items-center gap-3 rounded-2xl bg-white/5 border border-white/10 mb-3 transition-all duration-300",
                        isCollapsed ? "justify-center p-2" : "p-3"
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
                                    <div className="size-9 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center shrink-0 shadow-inner group-hover:bg-red-500/30 group-hover:border-red-500/50 transition-all">
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
                                            className="size-8 rounded-lg flex items-center justify-center hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-all"
                                        >
                                            <LogOut className="size-4" />
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
                        <form action={logout} className="mb-3">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        type="submit"
                                        className="w-full h-9 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 hover:bg-red-500/10 hover:border-red-500/30 transition-all text-slate-400 hover:text-red-400"
                                    >
                                        <LogOut className="size-4" />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="bg-slate-800 text-white font-bold border-white/10">
                                    Uitloggen
                                </TooltipContent>
                            </Tooltip>
                        </form>
                    )}

                    {/* Toggle Button - Always visible and clickable */}
                    {!isCollapsed && (
                        <Button
                            variant="ghost"
                            onClick={toggleCollapse}
                            className="w-full h-11 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all text-slate-400 hover:text-emerald-400 shadow-sm"
                        >
                            <PanelLeftClose className="size-5 mr-2" />
                            <span className="text-xs font-bold">Inklappen</span>
                        </Button>
                    )}

                    {isCollapsed && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={toggleCollapse}
                                    className="w-full h-11 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all text-slate-400 hover:text-emerald-400 shadow-sm"
                                >
                                    <PanelLeftOpen className="size-5" />
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

    // Desktop: render sidebar directly
    // Mobile: render with overlay and slide animation
    return (
        <>
            {/* Desktop sidebar - always visible */}
            <div className="hidden md:block">
                {sidebarContent}
            </div>

            {/* Mobile sidebar with overlay */}
            <AnimatePresence>
                {isMobileOpen && (
                    <>
                        {/* Overlay */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
                            onClick={closeMobile}
                        />

                        {/* Sliding sidebar */}
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
        <aside className="h-screen sticky top-0 bg-[#020617] border-r border-white/5 w-72 flex flex-col z-50 shrink-0">
            <div className="h-16 flex items-center gap-3 mb-4 px-6">
                <div className="h-8 w-32 bg-white/5 rounded animate-pulse" />
            </div>
            <nav className="flex-1 px-3 space-y-2">
                {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="h-10 bg-white/5 rounded-xl animate-pulse" />
                ))}
            </nav>
        </aside>
    );
}

// Wrap in Suspense for useSearchParams() - required by Next.js 13+
export function Sidebar() {
    return (
        <Suspense fallback={<SidebarSkeleton />}>
            <SidebarContent />
        </Suspense>
    );
}
