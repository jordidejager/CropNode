import Link from 'next/link';
import { Sprout } from 'lucide-react';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="relative py-12 px-4 border-t border-white/5">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          {/* Logo & Tagline */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center">
              <Sprout className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <span className="font-display text-slate-100">CropNode</span>
              <span className="hidden sm:inline text-slate-500 ml-2 text-sm">
                — Het platform voor moderne fruitteelt
              </span>
            </div>
          </div>

          {/* Links */}
          <nav className="flex items-center gap-6 text-sm">
            <Link
              href="/login"
              className="text-slate-400 hover:text-emerald-400 transition-colors"
            >
              Inloggen
            </Link>
            <Link
              href="/login"
              className="text-slate-400 hover:text-emerald-400 transition-colors"
            >
              Registreren
            </Link>
          </nav>

          {/* Copyright */}
          <p className="text-slate-600 text-sm">
            © {currentYear} CropNode
          </p>
        </div>
      </div>
    </footer>
  );
}
