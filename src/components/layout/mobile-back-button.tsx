'use client';

import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';

/**
 * Mobile-only back button — subtiel, premium, in stijl van CropNode.
 *
 * - Verborgen op het Dashboard (de logische "home") zodat je nooit van de
 *   hoofdpagina terug probeert te gaan.
 * - Gebruikt router.back() als er echt browser-history is (popstate-capable),
 *   anders push naar /dashboard.
 * - Dark glass + subtle emerald accent, matcht de rest van de mobile header.
 * - 44×40 tap target (mobile accessibility minimum ~44px).
 */
export function MobileBackButton() {
    const pathname = usePathname();
    const router = useRouter();

    // Hide on the main home page
    if (pathname === '/dashboard' || pathname === '/') return null;

    const handleClick = () => {
        // If there's browser history to go back to, use that; otherwise home
        if (typeof window !== 'undefined' && window.history.length > 1) {
            router.back();
        } else {
            router.push('/dashboard');
        }
    };

    return (
        <motion.button
            onClick={handleClick}
            aria-label="Terug naar vorige pagina"
            className="md:hidden relative size-10 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-emerald-500/[0.08] hover:border-emerald-500/25 active:scale-95 transition-all duration-200 flex items-center justify-center group overflow-hidden"
            whileTap={{ scale: 0.92 }}
        >
            {/* Subtle emerald glow on tap/hover */}
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/0 via-emerald-500/0 to-emerald-500/0 group-hover:from-emerald-500/[0.06] group-hover:to-transparent group-active:from-emerald-500/[0.12] transition-all duration-300 pointer-events-none" />

            <ArrowLeft className="relative size-[18px] text-slate-400 group-hover:text-emerald-400 group-active:text-emerald-300 transition-colors duration-200" strokeWidth={2.25} />
        </motion.button>
    );
}
