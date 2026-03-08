'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/logo';
import { Menu, X } from 'lucide-react';

const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'Modules', href: '#platform-overview' },
  { label: 'Pricing', href: '#pricing' },
];

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleNavClick = (href: string) => {
    setIsMobileMenuOpen(false);
    if (href.startsWith('#')) {
      const el = document.getElementById(href.slice(1));
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-[#020617]/90 backdrop-blur-xl border-b border-white/[0.04]'
          : 'bg-transparent'
      }`}
    >
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center">
            <Logo variant="horizontal" theme="dark" width={140} height={32} />
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            {/* Section Links */}
            <div className="flex items-center gap-6">
              {navLinks.map((link) => (
                <button
                  key={link.href}
                  onClick={() => handleNavClick(link.href)}
                  className="text-slate-400 hover:text-white transition-colors text-sm font-medium"
                >
                  {link.label}
                </button>
              ))}
            </div>

            {/* Auth */}
            <div className="flex items-center gap-3 pl-6 border-l border-white/[0.06]">
              <Link
                href="/login"
                className="text-slate-300 hover:text-emerald-400 transition-colors text-sm font-medium"
              >
                Inloggen
              </Link>
              <Button
                asChild
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/20 h-9"
              >
                <Link href="/login">Gratis starten</Link>
              </Button>
            </div>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 text-slate-300 hover:text-white"
            aria-label="Menu"
          >
            {isMobileMenuOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden overflow-hidden"
            >
              <div className="pb-5 pt-3 border-t border-white/[0.06] space-y-1">
                {navLinks.map((link) => (
                  <button
                    key={link.href}
                    onClick={() => handleNavClick(link.href)}
                    className="block w-full text-left text-slate-300 hover:text-emerald-400 transition-colors text-sm font-medium py-2.5 px-2 rounded-lg hover:bg-white/[0.02]"
                  >
                    {link.label}
                  </button>
                ))}
                <div className="pt-3 mt-2 border-t border-white/[0.06] space-y-2">
                  <Link
                    href="/login"
                    className="block text-slate-300 hover:text-emerald-400 transition-colors text-sm font-medium py-2.5 px-2"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Inloggen
                  </Link>
                  <Button
                    asChild
                    className="bg-emerald-600 hover:bg-emerald-500 text-white w-full"
                  >
                    <Link href="/login" onClick={() => setIsMobileMenuOpen(false)}>
                      Gratis starten
                    </Link>
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>
    </motion.header>
  );
}
