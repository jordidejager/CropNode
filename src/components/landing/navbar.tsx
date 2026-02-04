'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Sprout, Menu, X } from 'lucide-react';

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

  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-[#020617]/95 backdrop-blur-md border-b border-white/5'
          : 'bg-transparent'
      }`}
    >
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-9 h-9 rounded-lg bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center group-hover:bg-emerald-600/30 transition-colors">
              <Sprout className="w-5 h-5 text-emerald-400" />
            </div>
            <span className="font-display text-xl text-slate-100">CropOS</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden sm:flex items-center gap-4">
            <Link
              href="/login"
              className="text-slate-300 hover:text-emerald-400 transition-colors text-sm font-medium"
            >
              Inloggen
            </Link>
            <Button
              asChild
              className="bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/20"
            >
              <Link href="/login">Gratis starten</Link>
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="sm:hidden p-2 text-slate-300 hover:text-white"
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
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="sm:hidden pb-4 border-t border-white/5 mt-2 pt-4"
          >
            <div className="flex flex-col gap-3">
              <Link
                href="/login"
                className="text-slate-300 hover:text-emerald-400 transition-colors text-sm font-medium py-2"
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
          </motion.div>
        )}
      </nav>
    </motion.header>
  );
}
