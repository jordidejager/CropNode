import Link from 'next/link';
import { Logo } from '@/components/ui/logo';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="relative py-12 px-4 border-t border-white/5">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          {/* Logo & Tagline */}
          <div className="flex items-center gap-3">
            <Logo variant="horizontal" theme="dark" width={120} height={28} />
            <span className="hidden sm:inline text-slate-500 text-sm">
              — Het platform voor moderne fruitteelt
            </span>
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
