import Link from 'next/link';
import { Logo } from '@/components/ui/logo';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="relative py-14 px-4 border-t border-white/[0.04]">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-8">
          {/* Top row */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            {/* Logo & Tagline */}
            <div className="flex flex-col items-center sm:items-start gap-2">
              <Logo variant="horizontal" theme="dark" width={130} height={30} />
              <span className="text-slate-500 text-xs tracking-wider uppercase">
                Agriculture Intelligence Platform
              </span>
            </div>

            {/* Navigation */}
            <nav className="flex items-center gap-8 text-sm">
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
          </div>

          {/* Divider */}
          <div className="h-px bg-white/[0.04]" />

          {/* Bottom row */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-slate-600 text-xs">
              &copy; {currentYear} CropNode. Alle rechten voorbehouden.
            </p>
            <p className="text-slate-700 text-xs">
              Gebouwd voor de Nederlandse fruitteelt
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
